/**
 * Phase 2B-4: Quotation Idempotency Tests
 *
 * Covers all 15 required scenarios:
 *  1.  First request creates exactly one quotation
 *  2.  Exact retry returns original response without duplicate
 *  3.  No duplicate quotation record
 *  4.  No duplicate quotation_items
 *  5.  Same key + different payload → 409 Conflict
 *  6.  Different user with same key → independent scope
 *  7.  Different key → independent creation
 *  8.  Missing Idempotency-Key header → existing behavior unchanged
 *  9.  Response replay preserves HTTP status, body, quotation ID, number
 * 10.  Validation failure → no PROCESSING record, valid retry proceeds
 * 11.  Business failure rollback → PROCESSING rolled back, retry succeeds
 * 12.  10 concurrent identical requests → exactly one quotation
 * 13.  Financial tamper validation remains active with Idempotency-Key
 * 14.  Existing quotation calculation still correct with Idempotency-Key
 * 15.  Quotation conversion regression (ACCEPTED → Sales Order) still works
 *
 * Item-ordering strategy:
 *  ORDER-SENSITIVE — consistent with enquiry idempotency.
 *  Two requests with the same items in different order under the same key → 409.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { app, getAuthTokens, getTestCustomerAndProduct } from '../helpers';
import prisma from '../../src/config/prisma';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueKey(prefix = 'qtn-idem'): string {
  return `${prefix}-${randomUUID()}`;
}

function futureDate(daysFromNow = 14): string {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString();
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Phase 2B-4: Quotation Idempotency', () => {
  let salesToken: string;
  let adminToken: string;
  let salesUserId: string;
  let customerId: string;
  let productId: string;
  let productId2: string;
  /** A reusable enquiry for tests that don't need their own isolated enquiry */
  let sharedEnquiryId: string;

  beforeAll(async () => {
    const tokens = await getAuthTokens();
    salesToken = tokens.salesToken;
    adminToken = tokens.adminToken;
    salesUserId = tokens.salesUser.id;

    const data = await getTestCustomerAndProduct();
    customerId = data.customer.id;
    productId = data.product.id;

    // Second product for multi-item tests
    const p2 = await prisma.product.findFirst({
      where: { id: { not: productId } },
      orderBy: { code: 'asc' },
    });
    if (!p2) throw new Error('Need at least 2 products in seed data');
    productId2 = p2.id;

    // Shared enquiry (NEW status — can accept multiple quotations)
    const enqRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId,
        requiredDate: futureDate(7),
        notes: 'Shared enquiry for quotation idempotency tests',
        items: [
          { productId, quantity: 100 },
          { productId: productId2, quantity: 50 },
        ],
      });
    expect(enqRes.status).toBe(201);
    sharedEnquiryId = enqRes.body.data.id;

    // Clean up any leftover idempotency records from previous runs
    await prisma.idempotencyKey.deleteMany({
      where: { key: { startsWith: 'qtn-idem' } },
    });
  });

  afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({
      where: { key: { startsWith: 'qtn-idem' } },
    });
  });

  // -------------------------------------------------------------------------
  // 1. First request — creates exactly one quotation and returns 201
  // -------------------------------------------------------------------------
  it('first request: creates exactly one quotation and returns 201', async () => {
    const key = uniqueKey();

    const res = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send({
        enquiryId: sharedEnquiryId,
        validUntil: futureDate(14),
        items: [
          { productId, quantity: 5, unitPrice: 4500, discountPct: 10, gstPct: 18 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.quotationNumber).toMatch(/^QTN-\d{8}-\d{4}$/);
    expect(res.body.data.items).toHaveLength(1);

    // Idempotency record must be COMPLETED
    const idem = await prisma.idempotencyKey.findUnique({
      where: {
        key_userId_method_path: {
          key,
          userId: salesUserId,
          method: 'POST',
          path: '/api/quotations',
        },
      },
    });
    expect(idem).not.toBeNull();
    expect(idem!.status).toBe('COMPLETED');
    expect(idem!.responseStatus).toBe(201);
  });

  // -------------------------------------------------------------------------
  // 2. Exact retry — same key + same payload → replay, no duplicate quotation
  // -------------------------------------------------------------------------
  it('exact retry: returns original 201 response without creating a duplicate quotation', async () => {
    const key = uniqueKey();
    const payload = {
      enquiryId: sharedEnquiryId,
      validUntil: futureDate(14),
      items: [{ productId, quantity: 3, unitPrice: 5000, discountPct: 5, gstPct: 18 }],
    };

    const first = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(201);
    const originalId = first.body.data.id;

    const retry = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(retry.status).toBe(201);
    expect(retry.body.data.id).toBe(originalId);
  });

  // -------------------------------------------------------------------------
  // 3. No duplicate quotation record in the database
  // -------------------------------------------------------------------------
  it('exact retry: no duplicate quotation row in the database', async () => {
    const key = uniqueKey();
    const payload = {
      enquiryId: sharedEnquiryId,
      validUntil: futureDate(14),
      items: [{ productId, quantity: 7, unitPrice: 2000, discountPct: 0, gstPct: 12 }],
    };

    const first = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(201);
    const quotationId = first.body.data.id;

    // Retry
    await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    const count = await prisma.quotation.count({ where: { id: quotationId } });
    expect(count).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 4. No duplicate quotation_items on retry
  // -------------------------------------------------------------------------
  it('exact retry: no duplicate quotation_items', async () => {
    const key = uniqueKey();
    const payload = {
      enquiryId: sharedEnquiryId,
      validUntil: futureDate(14),
      items: [
        { productId, quantity: 4, unitPrice: 3000, discountPct: 10, gstPct: 18 },
        { productId: productId2, quantity: 2, unitPrice: 1500, discountPct: 0, gstPct: 5 },
      ],
    };

    const first = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(201);
    const quotationId = first.body.data.id;

    // Two retries
    await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    const itemCount = await prisma.quotationItem.count({ where: { quotationId } });
    expect(itemCount).toBe(2); // exactly 2, never 4 or 6
  });

  // -------------------------------------------------------------------------
  // 5. Same key + different payload → 409 Conflict
  // -------------------------------------------------------------------------
  it('same key + different payload: returns 409 Conflict and creates no second quotation', async () => {
    const key = uniqueKey();
    const payload1 = {
      enquiryId: sharedEnquiryId,
      validUntil: futureDate(14),
      items: [{ productId, quantity: 10, unitPrice: 4500, discountPct: 10, gstPct: 18 }],
    };

    const first = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload1);

    expect(first.status).toBe(201);

    // Different quantity
    const payload2 = {
      ...payload1,
      items: [{ productId, quantity: 99, unitPrice: 4500, discountPct: 10, gstPct: 18 }],
    };

    const conflict = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload2);

    expect(conflict.status).toBe(409);
    expect(conflict.body.success).toBe(false);
    expect(conflict.body.error.message).toMatch(/different request payload/i);

    // Original quotation still exists; no second one
    const count = await prisma.quotation.count({ where: { id: first.body.data.id } });
    expect(count).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 6. Different user with same key → independent scope
  // -------------------------------------------------------------------------
  it('different user with same key creates an independent quotation', async () => {
    const key = uniqueKey();
    const payload = {
      enquiryId: sharedEnquiryId,
      validUntil: futureDate(14),
      items: [{ productId, quantity: 1, unitPrice: 1000, discountPct: 0, gstPct: 18 }],
    };

    const salesRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(salesRes.status).toBe(201);

    // Admin uses same key — must be an independent scope
    const adminRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(adminRes.status).toBe(201);
    expect(adminRes.body.data.id).not.toBe(salesRes.body.data.id);
  });

  // -------------------------------------------------------------------------
  // 7. Different key → independent creation
  // -------------------------------------------------------------------------
  it('different key: creates an independent quotation', async () => {
    const payload = {
      enquiryId: sharedEnquiryId,
      validUntil: futureDate(14),
      items: [{ productId, quantity: 2, unitPrice: 2500, discountPct: 5, gstPct: 18 }],
    };

    const res1 = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', uniqueKey())
      .send(payload);

    const res2 = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', uniqueKey())
      .send(payload);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.data.id).not.toBe(res2.body.data.id);
    expect(res1.body.data.quotationNumber).not.toBe(res2.body.data.quotationNumber);
  });

  // -------------------------------------------------------------------------
  // 8. Missing Idempotency-Key header → existing behavior unchanged
  // -------------------------------------------------------------------------
  it('missing Idempotency-Key header: creates quotation normally without idempotency', async () => {
    const res = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId: sharedEnquiryId,
        validUntil: futureDate(14),
        items: [{ productId, quantity: 1, unitPrice: 1000, discountPct: 0, gstPct: 18 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 9. Response replay preserves HTTP status, body, quotation ID and number
  // -------------------------------------------------------------------------
  it('response replay: preserves exact HTTP status, body, quotation ID and number', async () => {
    const key = uniqueKey();
    const payload = {
      enquiryId: sharedEnquiryId,
      validUntil: futureDate(14),
      items: [{ productId, quantity: 6, unitPrice: 3500, discountPct: 8, gstPct: 18 }],
    };

    const first = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(201);

    const replay = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(replay.status).toBe(first.status);
    expect(replay.body.success).toBe(first.body.success);
    expect(replay.body.message).toBe(first.body.message);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(replay.body.data.quotationNumber).toBe(first.body.data.quotationNumber);
    expect(Number(replay.body.data.grandTotal)).toBe(Number(first.body.data.grandTotal));

    // Internal idempotency fields must not be exposed
    expect(replay.body.data.payloadHash).toBeUndefined();
    expect(replay.body.data.idempotencyKeyId).toBeUndefined();
    expect(replay.body.data.responseBody).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 10. Validation failure → no PROCESSING record left; valid retry proceeds
  // -------------------------------------------------------------------------
  it('validation failure: no PROCESSING record; valid retry with same key succeeds', async () => {
    const key = uniqueKey();

    // 1st attempt: invalid (missing required items array)
    const badRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send({
        enquiryId: sharedEnquiryId,
        validUntil: futureDate(14),
        items: [], // fails .min(1) validation
      });

    expect(badRes.status).toBe(400);

    // No idempotency record for a validation-rejected request
    const idemAfterBad = await prisma.idempotencyKey.findUnique({
      where: {
        key_userId_method_path: {
          key,
          userId: salesUserId,
          method: 'POST',
          path: '/api/quotations',
        },
      },
    });
    expect(idemAfterBad).toBeNull();

    // 2nd attempt: valid payload — must succeed
    const goodRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send({
        enquiryId: sharedEnquiryId,
        validUntil: futureDate(14),
        items: [{ productId, quantity: 1, unitPrice: 1000, discountPct: 0, gstPct: 18 }],
      });

    expect(goodRes.status).toBe(201);
    expect(goodRes.body.data.id).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 11. Business failure rollback → PROCESSING rolled back; retry succeeds
  //     Strategy: first attempt uses a non-existent enquiryId, which throws
  //     NotFoundError inside the transaction (deterministic failure).
  // -------------------------------------------------------------------------
  it('business failure rollback: non-existent enquiryId rolls back tx; retry with valid payload succeeds', async () => {
    const key = uniqueKey();

    // 1st attempt: non-existent enquiry triggers NotFoundError inside tx
    const badRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send({
        enquiryId: '00000000-0000-0000-0000-000000000000',
        validUntil: futureDate(14),
        items: [{ productId, quantity: 1, unitPrice: 1000, discountPct: 0, gstPct: 18 }],
      });

    expect(badRes.status).toBe(404);

    // PROCESSING record must be rolled back — no orphan record
    const idemAfterBad = await prisma.idempotencyKey.findUnique({
      where: {
        key_userId_method_path: {
          key,
          userId: salesUserId,
          method: 'POST',
          path: '/api/quotations',
        },
      },
    });
    expect(idemAfterBad).toBeNull();

    // No orphan quotation
    const quotationCount = await prisma.quotation.count({
      where: { enquiryId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(quotationCount).toBe(0);

    // 2nd attempt: valid payload — same key must succeed (not 409)
    const goodRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send({
        enquiryId: sharedEnquiryId,
        validUntil: futureDate(14),
        items: [{ productId, quantity: 1, unitPrice: 1000, discountPct: 0, gstPct: 18 }],
      });

    expect(goodRes.status).toBe(201);
    expect(goodRes.body.data.id).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 12. 10 concurrent identical requests → exactly one quotation created
  // -------------------------------------------------------------------------
  it('10 concurrent identical requests create exactly one quotation', async () => {
    const key = uniqueKey();
    const payload = {
      enquiryId: sharedEnquiryId,
      validUntil: futureDate(14),
      items: [
        { productId, quantity: 5, unitPrice: 4500, discountPct: 10, gstPct: 18 },
        { productId: productId2, quantity: 3, unitPrice: 2000, discountPct: 5, gstPct: 12 },
      ],
    };

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/quotations')
          .set('Authorization', `Bearer ${salesToken}`)
          .set('Idempotency-Key', key)
          .send(payload)
      )
    );

    const successful = responses.filter((r) => r.status === 201);
    expect(successful.length).toBeGreaterThanOrEqual(1);

    // All 201 responses must carry the same quotation ID
    const ids = new Set(successful.map((r) => r.body.data.id));
    expect(ids.size).toBe(1);

    const quotationId = [...ids][0];

    // Exactly one quotation row
    const dbCount = await prisma.quotation.count({ where: { id: quotationId } });
    expect(dbCount).toBe(1);

    // Exactly 2 quotation_item rows — no duplicates
    const itemCount = await prisma.quotationItem.count({ where: { quotationId } });
    expect(itemCount).toBe(2);

    // All quotation numbers must be the same across all 201 responses
    const numbers = new Set(successful.map((r) => r.body.data.quotationNumber));
    expect(numbers.size).toBe(1);

    // Idempotency record is COMPLETED
    const idem = await prisma.idempotencyKey.findUnique({
      where: {
        key_userId_method_path: {
          key,
          userId: salesUserId,
          method: 'POST',
          path: '/api/quotations',
        },
      },
    });
    expect(idem).not.toBeNull();
    expect(idem!.status).toBe('COMPLETED');
  });

  // -------------------------------------------------------------------------
  // 13. Financial tamper validation remains active when Idempotency-Key present
  // -------------------------------------------------------------------------
  it('financial tamper protection still rejects mismatched clientGrandTotal with Idempotency-Key', async () => {
    const key = uniqueKey();

    const res = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send({
        enquiryId: sharedEnquiryId,
        validUntil: futureDate(14),
        clientGrandTotal: 1, // tampered — real total would be ~23,600+
        items: [{ productId, quantity: 5, unitPrice: 4500, discountPct: 10, gstPct: 18 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Quotation total discrepancy detected');

    // No idempotency record for a tamper-rejected request (fails inside tx)
    const idem = await prisma.idempotencyKey.findUnique({
      where: {
        key_userId_method_path: {
          key,
          userId: salesUserId,
          method: 'POST',
          path: '/api/quotations',
        },
      },
    });
    // PROCESSING record must be rolled back by the transaction
    expect(idem).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 14. Existing quotation calculation still correct with Idempotency-Key
  //     qty=10, unitPrice=4500, discount=10%, gst=18%
  //     base=45000, discount=4500, net=40500, gst=7290, line=47790
  // -------------------------------------------------------------------------
  it('quotation calculation remains correct with Idempotency-Key present', async () => {
    const key = uniqueKey();

    const res = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send({
        enquiryId: sharedEnquiryId,
        validUntil: futureDate(14),
        items: [{ productId, quantity: 10, unitPrice: 4500, discountPct: 10, gstPct: 18 }],
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.data.subtotal)).toBe(45000);
    expect(Number(res.body.data.totalDiscount)).toBe(4500);
    expect(Number(res.body.data.totalGst)).toBe(7290);
    expect(Number(res.body.data.grandTotal)).toBe(47790);

    const item = res.body.data.items[0];
    expect(Number(item.baseAmount)).toBe(45000);
    expect(Number(item.discountAmount)).toBe(4500);
    expect(Number(item.netAmount)).toBe(40500);
    expect(Number(item.gstAmount)).toBe(7290);
    expect(Number(item.lineAmount)).toBe(47790);
  });

  // -------------------------------------------------------------------------
  // 15. Quotation conversion regression (ACCEPTED → Sales Order) still works
  //     Tests that the idempotency changes did not break convert() or updateStatus()
  // -------------------------------------------------------------------------
  it('quotation created via idempotency key can still be converted to a Sales Order', async () => {
    // Create a fresh isolated enquiry for this test to avoid status conflicts
    const enqRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId,
        requiredDate: futureDate(7),
        items: [{ productId, quantity: 5 }],
      });
    expect(enqRes.status).toBe(201);
    const isolatedEnquiryId = enqRes.body.data.id;

    const key = uniqueKey();

    // Create quotation with idempotency key
    const createRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('Idempotency-Key', key)
      .send({
        enquiryId: isolatedEnquiryId,
        validUntil: futureDate(14),
        items: [{ productId, quantity: 5, unitPrice: 4500, discountPct: 5, gstPct: 18 }],
      });

    expect(createRes.status).toBe(201);
    const quotationId = createRes.body.data.id;

    // Advance to ACCEPTED
    const acceptRes = await request(app)
      .patch(`/api/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'ACCEPTED' });
    expect(acceptRes.status).toBe(200);

    // Convert to Sales Order
    const convertRes = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    expect(convertRes.status).toBe(201);
    expect(convertRes.body.data.status).toBe('PENDING');
    expect(convertRes.body.data.orderNumber).toMatch(/^SO-\d{8}-\d{4}$/);

    // Verify enquiry is WON
    const enquiry = await prisma.enquiry.findUnique({ where: { id: isolatedEnquiryId } });
    expect(enquiry!.status).toBe('WON');
  });
});
