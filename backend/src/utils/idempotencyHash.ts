import { createHash } from 'crypto';

/**
 * Recursively sorts an object's keys to produce canonical JSON.
 * - Object keys are sorted alphabetically (recursively).
 * - Arrays are preserved in their original order.
 * - Primitives (string, number, boolean, null) are returned as-is.
 * - The input object is never mutated.
 */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Produces a deterministic SHA-256 hex digest for a request payload.
 *
 * Rules:
 * - Object keys are recursively sorted (nested objects too).
 * - Arrays are preserved in their original order (array sorting is
 *   endpoint-specific and must be performed by the caller before hashing).
 * - No auth tokens, server-generated IDs, or timestamps are included.
 * - The input is never mutated.
 */
export function hashRequestPayload(payload: unknown): string {
  const canonical = canonicalize(payload);
  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}