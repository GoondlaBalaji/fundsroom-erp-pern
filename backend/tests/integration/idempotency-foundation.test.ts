/**
 * Phase 2B-1: Idempotency Foundation Tests
 * Tests the hash utility and the raw database model.
 */
import { Prisma } from '@prisma/client';
import { hashRequestPayload } from '../../src/utils/idempotencyHash';
import prisma from '../../src/config/prisma';

describe('Phase 2B-1: Idempotency Foundation', () => {

  // -------------------------------------------------------------------------
  // Hash utility tests
  // -------------------------------------------------------------------------
  describe('hashRequestPayload – canonical SHA-256', () => {
    it('is deterministic for the same input', () => {
      const h1 = hashRequestPayload({ a: 1, b: 2 });
      const h2 = hashRequestPayload({ a: 1, b: 2 });
      expect(h1).toBe(h2);
    });

    it('flat object: key order does not affect hash', () => {
      const h1 = hashRequestPayload({ b: 2, a: 1 });
      const h2 = hashRequestPayload({ a: 1, b: 2 });
      expect(h1).toBe(h2);
    });

    it('nested object: key order does not affect hash', () => {
      const h1 = hashRequestPayload({ outer: { z: 9, a: 1 }, b: 2 });
      const h2 = hashRequestPayload({ b: 2, outer: { a: 1, z: 9 } });
      expect(h1).toBe(h2);
    });

    it('nested properties are preserved in the hash', () => {
      const h1 = hashRequestPayload({ outer: { a: 1 } });
      const h2 = hashRequestPayload({ outer: { a: 2 } });
      expect(h1).not.toBe(h2);
    });

    it('different nested value produces different hash', () => {
      const h1 = hashRequestPayload({ a: { b: 'x' } });
      const h2 = hashRequestPayload({ a: { b: 'y' } });
      expect(h1).not.toBe(h2);
    });

    it('array order is preserved (different order = different hash)', () => {
      const h1 = hashRequestPayload({ items: [1, 2, 3] });
      const h2 = hashRequestPayload({ items: [3, 2, 1] });
      expect(h1).not.toBe(h2);
    });

    it('array content change changes hash', () => {
      const h1 = hashRequestPayload({ items: [1, 2] });
      const h2 = hashRequestPayload({ items: [1, 3] });
      expect(h1).not.toBe(h2);
    });

    it('does not mutate the input object', () => {
      const input = { b: 2, a: 1 };
      const keys = Object.keys(input);
      hashRequestPayload(input);
      expect(Object.keys(input)).toEqual(keys);
    });
  });

  // -------------------------------------------------------------------------
  // Database model tests
  // -------------------------------------------------------------------------
  describe('IdempotencyKey model – database constraints', () => {
    let userId: string;

    beforeAll(async () => {
      const user = await prisma.user.findFirst({ where: { email: 'admin@fundsroom.com' } });
      if (!user) throw new Error('Admin user not found in seed data');
      userId = user.id;
      // Clean up any previous test records
      await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: '__test__' } } });
    });

    afterAll(async () => {
      await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: '__test__' } } });
    });

    it('can create an IdempotencyKey record', async () => {
      const record = await prisma.idempotencyKey.create({
        data: {
          key: '__test__create',
          userId,
          method: 'POST',
          path: '/api/customers',
          payloadHash: 'abc123',
          status: 'PROCESSING',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      expect(record.id).toBeDefined();
      expect(record.status).toBe('PROCESSING');
    });

    it('enforces composite uniqueness (same key+userId+method+path rejected)', async () => {
      await expect(
        prisma.idempotencyKey.create({
          data: {
            key: '__test__create',
            userId,
            method: 'POST',
            path: '/api/customers',
            payloadHash: 'differenthash',
            status: 'PROCESSING',
            expiresAt: new Date(Date.now() + 86400000),
          },
        })
      ).rejects.toThrow();
    });

    it('allows same key with a different userId', async () => {
      const otherUser = await prisma.user.findFirst({ where: { email: 'sales@fundsroom.com' } });
      expect(otherUser).not.toBeNull();
      const record = await prisma.idempotencyKey.create({
        data: {
          key: '__test__create',
          userId: otherUser!.id,
          method: 'POST',
          path: '/api/customers',
          payloadHash: 'abc123',
          status: 'PROCESSING',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      expect(record.id).toBeDefined();
    });

    it('allows same key+userId with different method', async () => {
      const record = await prisma.idempotencyKey.create({
        data: {
          key: '__test__create',
          userId,
          method: 'PUT',
          path: '/api/customers',
          payloadHash: 'abc123',
          status: 'PROCESSING',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      expect(record.id).toBeDefined();
    });

    it('allows same key+userId with different path', async () => {
      const record = await prisma.idempotencyKey.create({
        data: {
          key: '__test__create',
          userId,
          method: 'POST',
          path: '/api/enquiries',
          payloadHash: 'abc123',
          status: 'PROCESSING',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      expect(record.id).toBeDefined();
    });

    it('status enum supports PROCESSING, COMPLETED, FAILED', async () => {
      const record = await prisma.idempotencyKey.create({
        data: {
          key: '__test__enum_completed',
          userId,
          method: 'POST',
          path: '/api/customers',
          payloadHash: 'x',
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      expect(record.status).toBe('COMPLETED');
      const record2 = await prisma.idempotencyKey.create({
        data: {
          key: '__test__enum_failed',
          userId,
          method: 'POST',
          path: '/api/customers',
          payloadHash: 'x',
          status: 'FAILED',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      expect(record2.status).toBe('FAILED');
    });

    it('expiresAt index exists on idempotency_keys', async () => {
      const rows = await prisma.$queryRaw<{ indexname: string }[]>(
        Prisma.sql`
          SELECT indexname FROM pg_indexes
          WHERE tablename = 'idempotency_keys'
            AND indexname = 'idempotency_keys_expiresAt_idx'
        `
      );
      expect(rows.length).toBe(1);
    });
  });
});
