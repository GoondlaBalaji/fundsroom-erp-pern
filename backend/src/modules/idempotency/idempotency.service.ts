import { Prisma, IdempotencyStatus } from '@prisma/client';
import { ConflictError } from '../../utils/errors';
import { config } from '../../config/env';

export interface IdempotencyClaimResult {
  isNew: boolean;
  responseStatus?: number;
  responseBody?: string;
}

/**
 * Transaction-compatible idempotency service.
 *
 * All methods accept either the global PrismaClient or a Prisma.TransactionClient
 * so that callers can coordinate idempotency claims with business operations
 * inside a single database transaction.
 *
 * LIFECYCLE:
 *   1. claimOrReplay() — called at the start of a request.
 *      - If a COMPLETED, non-expired record exists with the same payloadHash → replay.
 *      - If a COMPLETED record exists with a DIFFERENT payloadHash → 409 Conflict.
 *      - If a COMPLETED record is expired → treat as if absent (allow new claim).
 *      - If a PROCESSING record exists → 409 (concurrent request in flight).
 *      - Otherwise → INSERT a PROCESSING record and return { isNew: true }.
 *   2. The caller performs the business operation inside the SAME transaction.
 *   3. complete() — called after the business operation succeeds, still inside the transaction.
 *      - Updates the record to COMPLETED and stores the response.
 *   4. On business failure the transaction rolls back, which also rolls back the PROCESSING
 *      record, leaving the idempotency key available for a legitimate retry.
 *
 * TTL:
 *   Configurable via IDEMPOTENCY_TTL_HOURS environment variable (default 24h).
 *   Expired COMPLETED records do not replay — they are treated as absent so that
 *   clients can safely reuse keys after the TTL window.
 *   Expired PROCESSING records (e.g. from a crashed process) are treated as absent,
 *   allowing a safe retry. This is safe because the original transaction would have
 *   been rolled back by PostgreSQL when the connection closed.
 *
 * CLEANUP:
 *   The cleanup() static method deletes records past their expiresAt.
 *   It targets only expired records and is safe to run repeatedly (idempotent).
 *   It does NOT delete PROCESSING records that have not yet expired.
 *   Intended to be invoked via the admin cleanup endpoint, not a background worker.
 */
export class IdempotencyService {
  /** Resolve TTL in milliseconds from config. */
  private static getTtlMs(): number {
    const hours = config.IDEMPOTENCY_TTL_HOURS;
    return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 60 * 60 * 1000;
  }

  /**
   * Attempt to claim an idempotency key inside a Prisma transaction.
   * Must be called with a tx (TransactionClient) so the claim and business
   * creation commit atomically.
   */
  static async claimOrReplay(
    tx: Prisma.TransactionClient,
    opts: {
      key: string;
      userId: string;
      method: string;
      path: string;
      payloadHash: string;
      ttlMs?: number; // override for tests; defaults to config.IDEMPOTENCY_TTL_HOURS
    }
  ): Promise<IdempotencyClaimResult> {
    const existing = await tx.idempotencyKey.findUnique({
      where: {
        key_userId_method_path: {
          key: opts.key,
          userId: opts.userId,
          method: opts.method,
          path: opts.path,
        },
      },
    });

    if (existing) {
      const now = new Date();
      const isExpired = existing.expiresAt <= now;

      if (existing.status === IdempotencyStatus.COMPLETED) {
        if (isExpired) {
          // Expired COMPLETED record — delete it and allow a fresh claim below.
          // This lets clients safely reuse a key after the TTL window.
          await tx.idempotencyKey.delete({
            where: { id: existing.id },
          });
          // Fall through to create a new PROCESSING record.
        } else {
          // Valid, non-expired COMPLETED record.
          if (existing.payloadHash !== opts.payloadHash) {
            throw new ConflictError(
              'Idempotency key reused with a different request payload'
            );
          }
          // Exact retry — replay stored response
          return {
            isNew: false,
            responseStatus: existing.responseStatus ?? undefined,
            responseBody: existing.responseBody ?? undefined,
          };
        }
      } else {
        // PROCESSING record.
        if (isExpired) {
          // Stale PROCESSING record from a process that crashed before rollback.
          // The original DB transaction would have been rolled back when its
          // connection closed. Safe to delete and allow a fresh claim.
          await tx.idempotencyKey.delete({
            where: { id: existing.id },
          });
          // Fall through to create a new PROCESSING record.
        } else {
          // Active PROCESSING — a concurrent request is in flight.
          throw new ConflictError(
            'A request with this idempotency key is already being processed'
          );
        }
      }
    }

    // First request (or expired record was cleared above) — claim the key.
    const ttlMs = opts.ttlMs ?? IdempotencyService.getTtlMs();
    const expiresAt = new Date(Date.now() + ttlMs);
    await tx.idempotencyKey.create({
      data: {
        key: opts.key,
        userId: opts.userId,
        method: opts.method,
        path: opts.path,
        payloadHash: opts.payloadHash,
        status: IdempotencyStatus.PROCESSING,
        expiresAt,
      },
    });

    return { isNew: true };
  }

  /**
   * Mark a PROCESSING idempotency key as COMPLETED and store the response.
   * Must be called within the same transaction as claimOrReplay().
   */
  static async complete(
    tx: Prisma.TransactionClient,
    opts: {
      key: string;
      userId: string;
      method: string;
      path: string;
      responseStatus: number;
      responseBody: string;
    }
  ): Promise<void> {
    await tx.idempotencyKey.update({
      where: {
        key_userId_method_path: {
          key: opts.key,
          userId: opts.userId,
          method: opts.method,
          path: opts.path,
        },
      },
      data: {
        status: IdempotencyStatus.COMPLETED,
        responseStatus: opts.responseStatus,
        responseBody: opts.responseBody,
      },
    });
  }

  /**
   * Delete all idempotency records that have passed their expiresAt timestamp.
   *
   * Safe to run repeatedly (idempotent).
   * Does NOT delete records whose expiresAt is in the future.
   * Targets expired COMPLETED, expired PROCESSING (stale), and expired FAILED records.
   *
   * Returns the number of deleted records.
   */
  static async cleanup(
    client: Prisma.TransactionClient | { idempotencyKey: { deleteMany: Function } }
  ): Promise<number> {
    const result = await (client as any).idempotencyKey.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  }
}
