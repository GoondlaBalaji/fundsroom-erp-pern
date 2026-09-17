/**
 * Phase 2B-6: Cleanup & Operational Hardening Tests
 *
 * A. TTL / expiration behavior
 *    A1. Non-expired COMPLETED record replays correctly
 *    A2. Expired COMPLETED record is treated as absent (new claim proceeds)
 *    A3. Expired PROCESSING record (stale) is treated as absent (new claim proceeds)
 *    A4. Non-expired PROCESSING record returns 409 (concurrent in-flight)
 *
 * B. Cleanup endpoint
 *    B1. POST /api/idempotency/cleanup requires ADMIN role
 *    B2. Sales User cannot call cleanup (403)
 *    B3. Unauthenticated request returns 401
 *    B4. Cleanup deletes only expired records, leaves active ones intact
 *    B5. Cleanup returns correct deletedCount
 *    B6. Cleanup is idempotent (second call on already-clean table returns 0)
 *
 * C. Stats endpoint
 *    C1. GET /api/idempotency/stats requires ADMIN role
 *    C2. Stats returns correct shape and counts
 *
 * D. Index verification
 *    D1. expiresAt index exists (supports efficient cleanup queries)
 *    D2. Composite unique index exists
 *
 * E. Error handling
 *    E1. Same key + different payload returns 409 not 500
 *    E2. Response body never exposes internal db fields
 *    E3. IDEMPOTENCY_TTL_HOURS env config is read correctly
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { app, getAuthTokens, getTestCustomerAndProduct } from '../helpers';
import prisma from '../../src/config/prisma';
import { IdempotencyService } from '../../src/modules/idempotency/idempotency.service';
import { config } from '../../src/config/env';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid(prefix = 'b6'): string {
  return `${prefix}-${randomUUID()}`;
}

function futureDate(days = 14): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

// Insert a raw idempotency record with a custom expiresAt for testing expiry
async function seedIdempotencyRecord(opts: {
  key: string;
  userId: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  expiresAt: Date;
  payloadHash?: string;
  responseStatus?: number;
  responseBody?: string;
}) {
  return prisma.idempotencyKey.create({
    data: {
      key: opts.key,
      userId: opts.userId,
      method: 'POST',
      path: '/api/customers',
      payloadHash: opts.payloadHash ?? 'testhash',
      status: opts.status,
      expiresAt: opts.expiresAt,
      responseStatus: opts.responseStatus,
      responseBody: opts.responseBody,
    },
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Phase 2B-6: Operational Hardening', () => {
  let salesToken: string;
  let adminToken: string;
  let salesUserId: string;
  let adminUserId: string;
  let customerId: string;
  let productId: string;

  beforeAll(async () => {
    const tokens = await getAuthTokens();
    salesToken = tokens.salesToken;
    adminToken = tokens.adminToken;
    salesUserId = tokens.salesUser.id;
    adminUserId = tokens.adminUser.id;

    const data = await getTestCustomerAndProduct();
    customerId = data.customer.id;
    productId = data.product.id;

    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: 'b6-' } } });
  });

  afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: 'b6-' } } });
  });

  // =========================================================================
  // A. TTL / expiration behavior
  // =========================================================================
  describe('A. TTL and expiration behavior', () => {

    // A1. Non-expired COMPLETED record replays correctly
    it('A1: non-expired COMPLETED record replays without creating a duplicate', async () => {
      const key = uid('b6');
      const payload = {
        companyName: 'Replay Corp',
        contactPerson: 'Alice',
        mobile: '9876543210',
        email: `replay.${randomUUID().slice(0, 8)}@test.com`,
        city: 'Delhi',
      };

      const first = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send(payload);
      expect(first.status).toBe(201);

      const replay = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(replay.status).toBe(201);
      expect(replay.body.data.id).toBe(first.body.data.id);
    });

    // A2. Expired COMPLETED record → treated as absent → new claim proceeds (no replay)
    it('A2: expired COMPLETED record is treated as absent; a new creation proceeds', async () => {
      const key = uid('b6');
      const pastExpiry = new Date(Date.now() - 1000); // already expired

      // Seed a fake COMPLETED record with past expiry
      await seedIdempotencyRecord({
        key,
        userId: salesUserId,
        status: 'COMPLETED',
        expiresAt: pastExpiry,
        payloadHash: 'oldhash',
        responseStatus: 201,
        responseBody: JSON.stringify({ success: true, message: 'old', data: { id: 'old-id' } }),
      });

      // Make a fresh request with a different payload — should not get the old replay
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({
          companyName: 'New Corp after Expiry',
          contactPerson: 'Bob',
          mobile: '9876543210',
          email: `new.${randomUUID().slice(0, 8)}@test.com`,
          city: 'Mumbai',
        });

      expect(res.status).toBe(201);
      // Must NOT have replayed the old 'old-id' response
      expect(res.body.data.id).not.toBe('old-id');
    });

    // A3. Expired PROCESSING record (stale crash) → treated as absent → new claim proceeds
    it('A3: expired stale PROCESSING record is cleared; new request proceeds normally', async () => {
      const key = uid('b6');
      const pastExpiry = new Date(Date.now() - 5000); // 5 seconds in the past

      // Simulate a stale PROCESSING record (e.g. from a crashed process)
      await seedIdempotencyRecord({
        key,
        userId: salesUserId,
        status: 'PROCESSING',
        expiresAt: pastExpiry,
        payloadHash: 'stale-hash',
      });

      // Fresh request should not get a 409 — it should create the resource
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({
          companyName: 'Post-Stale Corp',
          contactPerson: 'Charlie',
          mobile: '9876543210',
          email: `stale.${randomUUID().slice(0, 8)}@test.com`,
          city: 'Hyderabad',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
    });

    // A4. Non-expired PROCESSING record → 409 (concurrent in-flight)
    it('A4: non-expired PROCESSING record returns 409 Conflict', async () => {
      const key = uid('b6');
      const futureExpiry = new Date(Date.now() + 60000); // 60 seconds from now

      await seedIdempotencyRecord({
        key,
        userId: salesUserId,
        status: 'PROCESSING',
        expiresAt: futureExpiry,
        payloadHash: 'active-hash',
      });

      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({
          companyName: 'Should Get 409',
          contactPerson: 'Dave',
          mobile: '9876543210',
          email: `inflight.${randomUUID().slice(0, 8)}@test.com`,
          city: 'Chennai',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // B. Cleanup endpoint
  // =========================================================================
  describe('B. Cleanup endpoint', () => {

    // B1. Admin can call cleanup
    it('B1: POST /api/idempotency/cleanup succeeds for ADMIN', async () => {
      const res = await request(app)
        .post('/api/idempotency/cleanup')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.deletedCount).toBe('number');
    });

    // B2. Sales User cannot call cleanup (403)
    it('B2: POST /api/idempotency/cleanup returns 403 for SALES_USER', async () => {
      const res = await request(app)
        .post('/api/idempotency/cleanup')
        .set('Authorization', `Bearer ${salesToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    // B3. Unauthenticated request returns 401
    it('B3: POST /api/idempotency/cleanup returns 401 without token', async () => {
      const res = await request(app).post('/api/idempotency/cleanup');
      expect(res.status).toBe(401);
    });

    // B4. Cleanup deletes only expired records, leaves active ones intact
    it('B4: cleanup deletes only expired records and leaves active records', async () => {
      // Seed one expired and one active record
      const expiredKey = uid('b6');
      const activeKey = uid('b6');

      await seedIdempotencyRecord({
        key: expiredKey,
        userId: adminUserId,
        status: 'COMPLETED',
        expiresAt: new Date(Date.now() - 1000), // expired
        payloadHash: 'exp',
        responseStatus: 201,
        responseBody: '{}',
      });

      await seedIdempotencyRecord({
        key: activeKey,
        userId: adminUserId,
        status: 'COMPLETED',
        expiresAt: new Date(Date.now() + 3600000), // 1h from now
        payloadHash: 'act',
        responseStatus: 201,
        responseBody: '{}',
      });

      await request(app)
        .post('/api/idempotency/cleanup')
        .set('Authorization', `Bearer ${adminToken}`);

      // Expired record must be gone
      const expired = await prisma.idempotencyKey.findFirst({
        where: { key: expiredKey, userId: adminUserId },
      });
      expect(expired).toBeNull();

      // Active record must survive
      const active = await prisma.idempotencyKey.findFirst({
        where: { key: activeKey, userId: adminUserId },
      });
      expect(active).not.toBeNull();
    });

    // B5. Cleanup returns correct deletedCount
    it('B5: cleanup returns the correct number of deleted records', async () => {
      // Seed 3 expired records
      for (let i = 0; i < 3; i++) {
        await seedIdempotencyRecord({
          key: uid('b6'),
          userId: adminUserId,
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() - 2000),
          payloadHash: `h${i}`,
          responseStatus: 201,
          responseBody: '{}',
        });
      }

      const res = await request(app)
        .post('/api/idempotency/cleanup')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deletedCount).toBeGreaterThanOrEqual(3);
    });

    // B6. Cleanup is idempotent — second call with nothing to delete returns 0
    it('B6: cleanup is idempotent — second call returns 0 when nothing remains to delete', async () => {
      // First call clears everything expired
      await request(app)
        .post('/api/idempotency/cleanup')
        .set('Authorization', `Bearer ${adminToken}`);

      // Second call should have nothing left
      const res = await request(app)
        .post('/api/idempotency/cleanup')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deletedCount).toBe(0);
    });
  });

  // =========================================================================
  // C. Stats endpoint
  // =========================================================================
  describe('C. Stats endpoint', () => {

    // C1. Admin can get stats
    it('C1: GET /api/idempotency/stats returns stats for ADMIN', async () => {
      const res = await request(app)
        .get('/api/idempotency/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.completed).toBe('number');
      expect(typeof res.body.data.processing).toBe('number');
      expect(typeof res.body.data.failed).toBe('number');
      expect(typeof res.body.data.expired).toBe('number');
      expect(typeof res.body.data.total).toBe('number');
    });

    // C2. Sales User cannot access stats (403)
    it('C2: GET /api/idempotency/stats returns 403 for SALES_USER', async () => {
      const res = await request(app)
        .get('/api/idempotency/stats')
        .set('Authorization', `Bearer ${salesToken}`);

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // D. Index verification
  // =========================================================================
  describe('D. Index verification', () => {

    it('D1: expiresAt index exists on idempotency_keys table', async () => {
      const rows = await prisma.$queryRaw<{ indexname: string }[]>(
        Prisma.sql`
          SELECT indexname FROM pg_indexes
          WHERE tablename = 'idempotency_keys'
            AND indexname = 'idempotency_keys_expiresAt_idx'
        `
      );
      expect(rows.length).toBe(1);
    });

    it('D2: composite unique index exists on idempotency_keys table', async () => {
      const rows = await prisma.$queryRaw<{ indexname: string }[]>(
        Prisma.sql`
          SELECT indexname FROM pg_indexes
          WHERE tablename = 'idempotency_keys'
            AND indexname = 'idempotency_keys_key_userId_method_path_key'
        `
      );
      expect(rows.length).toBe(1);
    });
  });

  // =========================================================================
  // E. Error handling and config
  // =========================================================================
  describe('E. Error handling and configuration', () => {

    // E1. 409 not 500 for payload mismatch
    it('E1: same key + different payload returns 409 Conflict, not 500', async () => {
      const key = uid('b6');
      const basePayload = {
        companyName: 'E1 Corp',
        contactPerson: 'Alice',
        mobile: '9876543210',
        email: `e1.${randomUUID().slice(0, 8)}@test.com`,
        city: 'Pune',
      };

      const first = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send(basePayload);
      expect(first.status).toBe(201);

      const conflict = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({ ...basePayload, city: 'Nagpur' }); // changed field

      expect(conflict.status).toBe(409);
      expect(conflict.body.success).toBe(false);
      // Must not expose internal error details
      expect(conflict.body.error?.stack).toBeUndefined();
      expect(conflict.body.error?.message).toMatch(/different request payload/i);
    });

    // E2. Response body never exposes internal fields
    it('E2: replayed response does not contain internal idempotency db fields', async () => {
      const key = uid('b6');
      const payload = {
        companyName: 'E2 Corp',
        contactPerson: 'Bob',
        mobile: '9876543210',
        email: `e2.${randomUUID().slice(0, 8)}@test.com`,
        city: 'Kolkata',
      };

      await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      const replay = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(replay.status).toBe(201);
      const data = replay.body.data;
      expect(data.payloadHash).toBeUndefined();
      expect(data.idempotencyKeyId).toBeUndefined();
      expect(data.expiresAt).toBeUndefined();
      expect(data.responseBody).toBeUndefined();
      expect(data.responseStatus).toBeUndefined();
    });

    // E3. IDEMPOTENCY_TTL_HOURS config is read (value is a positive number)
    it('E3: IDEMPOTENCY_TTL_HOURS config is a positive number', () => {
      expect(config.IDEMPOTENCY_TTL_HOURS).toBeGreaterThan(0);
      expect(Number.isFinite(config.IDEMPOTENCY_TTL_HOURS)).toBe(true);
    });

    // E4. Cleanup service method directly targets only expired records
    it('E4: IdempotencyService.cleanup() returns count of deleted records', async () => {
      // Seed one expired record
      const key = uid('b6');
      await seedIdempotencyRecord({
        key,
        userId: adminUserId,
        status: 'COMPLETED',
        expiresAt: new Date(Date.now() - 500),
        payloadHash: 'directclean',
        responseStatus: 201,
        responseBody: '{}',
      });

      const count = await IdempotencyService.cleanup(prisma);
      expect(count).toBeGreaterThanOrEqual(1);

      // Record should be gone
      const record = await prisma.idempotencyKey.findFirst({
        where: { key, userId: adminUserId },
      });
      expect(record).toBeNull();
    });
  });
});
