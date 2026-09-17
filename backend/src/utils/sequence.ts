import { PrismaClient } from '@prisma/client';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Maps document type prefix to its table and number column for initialization */
const DOC_TYPE_META: Record<string, { table: string; column: string; prefix: string }> = {
  ENQ: { table: 'enquiries',   column: 'enquiry_number',  prefix: 'ENQ' },
  QTN: { table: 'quotations',  column: 'quotation_number', prefix: 'QTN' },
  SO:  { table: 'sales_orders', column: 'order_number',   prefix: 'SO'  },
  DSP: { table: 'dispatches',  column: 'dispatch_number', prefix: 'DSP' },
};

/**
 * Atomically allocates the next sequence number for a given document type and date.
 *
 * Uses PostgreSQL INSERT ... ON CONFLICT DO UPDATE to perform an atomic
 * counter increment. This is concurrency-safe across multiple Node.js processes,
 * containers, and application restarts because:
 *  - The UPSERT is an atomic PostgreSQL operation.
 *  - No application-level locking or in-memory state is required.
 *  - Gaps are acceptable (e.g. on transaction rollback), but duplicates are impossible.
 *
 * On first use for a given (docType, dateKey) pair, the counter is initialized
 * to the maximum already-existing sequence number in the target table, ensuring
 * no collision with pre-existing data regardless of how the table was populated.
 *
 * @param tx      - Prisma transaction client (MUST be called inside a transaction)
 * @param docType - Document type prefix (e.g. 'ENQ', 'QTN', 'SO', 'DSP')
 * @param dateKey - Date key in YYYYMMDD format
 * @returns The next sequence number as a 4-char zero-padded string, e.g. "0001"
 *
 * Example: nextSequence(tx, 'QTN', '20260917') → "0001"
 */
export async function nextSequence(
  tx: TransactionClient,
  docType: string,
  dateKey: string
): Promise<string> {
  const meta = DOC_TYPE_META[docType];
  if (!meta) {
    throw new Error(`Unknown document type: ${docType}`);
  }

  // Pattern to match existing numbers: e.g. 'ENQ-20260917-%'
  const likePattern = `${meta.prefix}-${dateKey}-%`;

  // Atomic UPSERT with initialization from existing data:
  // - On first insert: initializes last_seq to MAX(existing_seq_num_for_today) + 1
  //   This safely handles databases that were populated by the old count()-based system.
  // - On conflict (subsequent calls): increments last_seq + 1
  // - GREATEST() ensures we never regress to a lower value
  const result = await tx.$queryRawUnsafe<{ last_seq: number | bigint }[]>(
    `WITH existing_max AS (
       SELECT COALESCE(
         MAX(
           CAST(
             SUBSTRING(${meta.column} FROM LENGTH($3) + 2) AS INT
           )
         ),
         0
       ) AS max_seq
       FROM ${meta.table}
       WHERE ${meta.column} LIKE $4
     )
     INSERT INTO document_sequences (doc_type, date_key, last_seq)
     SELECT $1, $2, existing_max.max_seq + 1
     FROM existing_max
     ON CONFLICT (doc_type, date_key)
     DO UPDATE SET last_seq = GREATEST(
       document_sequences.last_seq + 1,
       (SELECT existing_max.max_seq + 1 FROM existing_max)
     )
     RETURNING last_seq`,
    docType,
    dateKey,
    `${meta.prefix}-${dateKey}`,  // $3: prefix without trailing dash (used for SUBSTRING offset)
    likePattern                    // $4: LIKE pattern
  );

  // Prisma returns BigInt for raw integer columns; convert safely
  const seq = Number(result[0].last_seq);
  return String(seq).padStart(4, '0');
}

/**
 * Returns today's date as YYYYMMDD string (UTC-based for consistency with ISO timestamps).
 */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
