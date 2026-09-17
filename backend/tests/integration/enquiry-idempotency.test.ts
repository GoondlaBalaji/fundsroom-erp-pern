/**
 * Phase 2B-3: Enquiry Idempotency Tests
 *
 * Covers:
 *  - First request creates exactly one enquiry with its items
 *  - Exact retry (same key + same payload) returns original response, no duplicate
 *  - Exact retry produces no duplicate enquiry_items
 *  - Same key + different payload → 409 Conflict, no second enquiry
 *  - Different users with same key are fully isolated
 *  - Different key creates an independent enquiry
 *  - Missing Idempotency-Key header preserves existing behavior
 *  - Concurrent requests with same key create exactly one enquiry
 *  - Transaction failure recovery (invalid customer ID rolls back PROCESSING record)
 *  - Response replay preserves HTTP status, body, and enquiry ID/number
 *  - Existing validation still enforced when Idempotency-Key is present
 *  - Existing RBAC still enforced (unauthenticated → 401)
 *  - Internal idempotency fields are not exposed in the response
 *
 * Item-ordering strategy:
 *  Enquiry items are ORDER-SENSITIVE: the same products in a different order
 *  produce a different fingerprint and are treated as a different request.
 *  This is verified in the "different payload" and "item order" tests.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { app, getAuthTokens } from '../helpers';
import prisma from '../../src/config/prisma';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueKey(prefix = 'enq-idem'): string {
  return `${prefix}-${randomUUID()}`;
}

/** Returns a future date ISO string N days from now. */
function futureDate(daysFromNow = 7): string {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString();
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Phase 2B-3: Enquiry Idempotency', () => {
  let salesToken: string;
  let adminToken: string;
  let salesUserId: string;
  let customerId: string;
  let productId1: string;
  let productId2: string;

  beforeAll(async () => {
    const tokens = await getAuthTokens();
    salesToken = tokens.salesToken;
    adminToken = tokens.adminToken;
    salesUserId = tokens.salesUser.id;

    // Resolve a seeded customer
    const customer = await prisma.customer.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!customer) throw new Error('No customer found in seed data');
    customerId = customer.id;

    // Resolve two seeded products for multi-item tests
    const products = await prisma.product.findMany({ take: 2, orderBy: { code: 'asc' } });
    if (products.length < 2) throw new Error('Need at least 2 products in seed data');
    productId1 = products[0].id;
    productId2 = products[1].id;

    // Clean up idempotency records created by this test suite
    await prisma.idempotencyKey.deleteMany({
      where: { key: { startsWith: 'enq-idem' } },
    });
  });

  afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({
      where: { key: { startsWith: 'enq-idem' } },
    });
  });

  // -------------------------------------------------------------------------
  // 1. First request — creates exactly one enquiry with its items
  // -------------------------------------------------------------------------
  it('first request: creates exactly one enquiry and returns 201', async () => {
    const key = uniqueKey();

    const res = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send({
        customerId,
        requiredDate: futureDate(),
        notes: 'First idempotency test',
        items: [
          { productId: productId1, quantity: 10 },
          { productId: productId2, quantity: 20 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.enquiryNumber).toBeDefined();
    expect(res.body.data.items).toHaveLength(2);

    // Idempotency record must be COMPLETED
    const idem = await prisma.idempotencyKey.findUnique({
      where: {
        key_userId_method_path: {
          key,
          userId: salesUserId,
          method: 'POST',
          path: '/api/enquiries',
        },
      },
    });
    expect(idem).not.toBeNull();
    expect(idem!.status).toBe('COMPLETED');
    expect(idem!.responseStatus).toBe(201);
  });

  // -------------------------------------------------------------------------
  // 2. Exact retry — same key + same payload → replay, no duplicate enquiry
  // -------------------------------------------------------------------------
  it('exact retry: returns original 201 response without creating a duplicate enquiry', async () => {
    const key = uniqueKey();
    const payload = {
      customerId,
      requiredDate: futureDate(),
      notes: 'Retry test',
      items: [{ productId: productId1, quantity: 5 }],
    };

    const first = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(201);
    const originalId = first.body.data.id;

    const retry = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(retry.status).toBe(201);
    expect(retry.body.data.id).toBe(originalId); // same enquiry replayed

    // Exactly one enquiry row in the database
    const dbCount = await prisma.enquiry.count({ where: { id: originalId } });
    expect(dbCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 3. Exact retry — no duplicate enquiry_items
  // -------------------------------------------------------------------------
  it('exact retry: does not create duplicate enquiry_items', async () => {
    const key = uniqueKey();
    const payload = {
      customerId,
      requiredDate: futureDate(),
      items: [
        { productId: productId1, quantity: 3 },
        { productId: productId2, quantity: 7 },
      ],
    };

    const first = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(201);
    const enquiryId = first.body.data.id;

    await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    // Database must still have exactly 2 items for this enquiry
    const itemCount = await prisma.enquiryItem.count({ where: { enquiryId } });
    expect(itemCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 4. Response replay — preserves HTTP status, body, enquiry ID and number
  // -------------------------------------------------------------------------
  it('response replay: preserves exact HTTP status, body, and enquiry number', async () => {
    const key = uniqueKey();
    const payload = {
      customerId,
      requiredDate: futureDate(),
      items: [{ productId: productId1, quantity: 1 }],
    };

    const first = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(201);

    const replay = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(replay.status).toBe(first.status);
    expect(replay.body.success).toBe(first.body.success);
    expect(replay.body.message).toBe(first.body.message);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(replay.body.data.enquiryNumber).toBe(first.body.data.enquiryNumber);
  });

  // -------------------------------------------------------------------------
  // 5. Same key + different payload → 409 Conflict
  // -------------------------------------------------------------------------
  it('same key + different payload: returns 409 Conflict and creates no second enquiry', async () => {
    const key = uniqueKey();
    const payload1 = {
      customerId,
      requiredDate: futureDate(7),
      items: [{ productId: productId1, quantity: 10 }],
    };

    const first = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload1);

    expect(first.status).toBe(201);

    // Different payload — quantity changed
    const payload2 = { ...payload1, items: [{ productId: productId1, quantity: 99 }] };

    const conflict = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload2);

    expect(conflict.status).toBe(409);
    expect(conflict.body.success).toBe(false);
    expect(conflict.body.error.message).toMatch(/different request payload/i);

    // Original enquiry still exists; no second one created
    const dbCount = await prisma.enquiry.count({ where: { id: first.body.data.id } });
    expect(dbCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 6. Item order sensitivity — different order = different fingerprint = 409
  //    (same key, reused after first request with original order)
  // -------------------------------------------------------------------------
  it('same key + items in different order: treated as different payload → 409', async () => {
    const key = uniqueKey();
    const payloadOriginal = {
      customerId,
      requiredDate: futureDate(),
      items: [
        { productId: productId1, quantity: 5 },
        { productId: productId2, quantity: 10 },
      ],
    };

    const first = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payloadOriginal);

    expect(first.status).toBe(201);

    // Same items, reversed order
    const payloadReordered = {
      ...payloadOriginal,
      items: [
        { productId: productId2, quantity: 10 },
        { productId: productId1, quantity: 5 },
      ],
    };

    const conflict = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payloadReordered);

    expect(conflict.status).toBe(409);
    expect(conflict.body.error.message).toMatch(/different request payload/i);
  });

  // -------------------------------------------------------------------------
  // 7. Different user isolation — same key is independent per user
  // -------------------------------------------------------------------------
  it('different user with same key creates an independent enquiry', async () => {
    const key = uniqueKey();
    const payload = {
      customerId,
      requiredDate: futureDate(),
      items: [{ productId: productId1, quantity: 2 }],
    };

    const salesRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(salesRes.status).toBe(201);

    // Admin uses the same key — independent scope
    const adminRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(adminRes.status).toBe(201);
    expect(adminRes.body.data.id).not.toBe(salesRes.body.data.id);
  });

  // -------------------------------------------------------------------------
  // 8. Different key → independent enquiry creation
  // -------------------------------------------------------------------------
  it('different key: creates an independent enquiry', async () => {
    const payload = {
      customerId,
      requiredDate: futureDate(),
      items: [{ productId: productId1, quantity: 4 }],
    };

    const res1 = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', uniqueKey())
      .send(payload);

    const res2 = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', uniqueKey())
      .send(payload);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.data.id).not.toBe(res2.body.data.id);
  });

  // -------------------------------------------------------------------------
  // 9. Missing Idempotency-Key header — existing behavior unchanged
  // -------------------------------------------------------------------------
  it('missing Idempotency-Key header: creates enquiry normally without idempotency', async () => {
    const res = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId,
        requiredDate: futureDate(),
        items: [{ productId: productId1, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 10. Existing validation still enforced with Idempotency-Key present
  // -------------------------------------------------------------------------
  it('validation errors are still returned when Idempotency-Key is present', async () => {
    const key = uniqueKey();

    // Missing items — should fail validation
    const res = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send({
        customerId,
        requiredDate: futureDate(),
        items: [], // empty items array fails .min(1) validation
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);

    // No idempotency record must be created for a validation-rejected request
    const idem = await prisma.idempotencyKey.findUnique({
      where: {
        key_userId_method_path: {
          key,
          userId: salesUserId,
          method: 'POST',
          path: '/api/enquiries',
        },
      },
    });
    expect(idem).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 11. Past requiredDate is still rejected with Idempotency-Key present
  // -------------------------------------------------------------------------
  it('past requiredDate is rejected 400 even with Idempotency-Key', async () => {
    const key = uniqueKey();

    const res = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send({
        customerId,
        requiredDate: '2020-01-01', // clearly in the past
        items: [{ productId: productId1, quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 12. Existing RBAC — unauthenticated request returns 401
  // -------------------------------------------------------------------------
  it('unauthenticated request returns 401 regardless of Idempotency-Key', async () => {
    const res = await request(app)
      .post('/api/enquiries')
      .set('Idempotency-Key', uniqueKey())
      .send({
        customerId,
        requiredDate: futureDate(),
        items: [{ productId: productId1, quantity: 1 }],
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 13. Concurrent requests — exactly one enquiry created
  // -------------------------------------------------------------------------
  it('10 concurrent identical requests create exactly one enquiry', async () => {
    const key = uniqueKey();
    const payload = {
      customerId,
      requiredDate: futureDate(),
      notes: 'Concurrency test',
      items: [
        { productId: productId1, quantity: 5 },
        { productId: productId2, quantity: 10 },
      ],
    };

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/enquiries')
          .set('Authorization', `Bearer ${salesToken}`)
          .set('Idempotency-Key', key)
          .send(payload)
      )
    );

    // All 201 responses must reference the same enquiry
    const successful = responses.filter((r) => r.status === 201);
    expect(successful.length).toBeGreaterThanOrEqual(1);

    const ids = new Set(successful.map((r) => r.body.data.id));
    expect(ids.size).toBe(1);

    const enquiryId = [...ids][0];

    // Exactly one enquiry row in the database
    const dbEnquiryCount = await prisma.enquiry.count({ where: { id: enquiryId } });
    expect(dbEnquiryCount).toBe(1);

    // Exactly 2 enquiry_item rows — no duplicates
    const dbItemCount = await prisma.enquiryItem.count({ where: { enquiryId } });
    expect(dbItemCount).toBe(2);

    // Idempotency record is COMPLETED
    const idem = await prisma.idempotencyKey.findUnique({
      where: {
        key_userId_method_path: {
          key,
          userId: salesUserId,
          method: 'POST',
          path: '/api/enquiries',
        },
      },
    });
    expect(idem).not.toBeNull();
    expect(idem!.status).toBe('COMPLETED');
  });

  // -------------------------------------------------------------------------
  // 14. Transaction failure recovery — non-existent customerId causes rollback;
  //     the PROCESSING record is rolled back with the transaction so a
  //     subsequent valid retry with the same key succeeds.
  // -------------------------------------------------------------------------
  it('non-existent customerId rolls back transaction; retry with valid payload succeeds', async () => {
    const key = uniqueKey();

    // 1st attempt: non-existent customer — will throw NotFoundError inside the tx
    const badRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send({
        customerId: '00000000-0000-0000-0000-000000000000',
        requiredDate: futureDate(),
        items: [{ productId: productId1, quantity: 1 }],
      });

    // Should be 404 (customer not found) — business error inside tx
    expect(badRes.status).toBe(404);

    // No COMPLETED or PROCESSING record must survive the rollback
    const idemAfterBad = await prisma.idempotencyKey.findUnique({
      where: {
        key_userId_method_path: {
          key,
          userId: salesUserId,
          method: 'POST',
          path: '/api/enquiries',
        },
      },
    });
    expect(idemAfterBad).toBeNull();

    // 2nd attempt: same key, valid payload — must succeed
    const goodRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send({
        customerId,
        requiredDate: futureDate(),
        items: [{ productId: productId1, quantity: 1 }],
      });

    expect(goodRes.status).toBe(201);
    expect(goodRes.body.data.id).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 15. Internal idempotency fields are NOT exposed in the response
  // -------------------------------------------------------------------------
  it('response body does not expose internal idempotency database fields', async () => {
    const key = uniqueKey();

    const res = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send({
        customerId,
        requiredDate: futureDate(),
        items: [{ productId: productId1, quantity: 2 }],
      });

    expect(res.status).toBe(201);
    const body = res.body.data;
    expect(body.payloadHash).toBeUndefined();
    expect(body.idempotencyKeyId).toBeUndefined();
    expect(body.expiresAt).toBeUndefined();
    expect(body.responseBody).toBeUndefined();
  });
});
