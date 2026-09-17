import { Prisma, IdempotencyStatus } from '@prisma/client';
import { ConflictError } from '../../utils/errors';

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
 *      - If a COMPLETED record exists with the same payloadHash ? return replay data.
 *      - If a COMPLETED record exists with a DIFFERENT payloadHash ? throw 409 Conflict.
 *      - If a PROCESSING record exists ? throw 409 (concurrent request; caller must return 409).
 *      - Otherwise ? INSERT a PROCESSING record and return { isNew: true }.
 *   2. The caller performs the business operation inside the SAME transaction.
 *   3. complete() — called after the business operation succeeds, still inside the transaction.
 *      - Updates the record to COMPLETED and stores the response.
 *   4. On business failure the transaction rolls back, which also rolls back the PROCESSING
 *      record, leaving the idempotency key available for a legitimate retry.
 */
export class IdempotencyService {
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
      ttlMs?: number; // default 24 hours
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
      if (existing.status === IdempotencyStatus.COMPLETED) {
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

      // PROCESSING means a concurrent request is in flight
      throw new ConflictError(
        'A request with this idempotency key is already being processed'
      );
    }

    // First request — claim the key
    const expiresAt = new Date(Date.now() + (opts.ttlMs ?? 24 * 60 * 60 * 1000));
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
}