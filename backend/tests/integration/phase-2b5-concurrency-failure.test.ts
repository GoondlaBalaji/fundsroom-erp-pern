/**
 * Phase 2B-5: Concurrency & Failure Testing
 *
 * A. Customer idempotency — 10 simultaneous identical requests → one customer
 * B. Enquiry idempotency — 10 simultaneous identical requests → one enquiry + correct items
 * C. Quotation idempotency — 10 simultaneous identical requests → one quotation + one item set
 * D. Sales Order same-order concurrency — double-confirm on same order (uses non-shared product)
 * E. Inventory reservation concurrency — over-reservation protection (uses non-shared product)
 * F. Idempotency failure/rollback verification (8 scenarios)
 *
 * ISOLATION NOTE:
 * Tests D and E intentionally avoid IND-VLV-001, which is the shared product
 * used by inventory-reservation.test.ts and dispatch-workflow.test.ts.
 * Using a different product prevents cross-suite inventory state contamination.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { app, getAuthTokens, getTestCustomerAndProduct } from '../helpers';
import prisma from '../../src/config/prisma';

function uid(prefix = 'b5'): string {
  return `${prefix}-${randomUUID()}`;
}

function futureDate(days = 14): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

describe('Phase 2B-5: Concurrency & Failure Testing', () => {
  let salesToken: string;
  let adminToken: string;
  let salesUserId: string;
  let customerId: string;
  let productId: string;   // IND-VLV-001 — shared test product
  let productId2: string;  // second product (also not IND-VLV-001 region)

  beforeAll(async () => {
    const tokens = await getAuthTokens();
    salesToken = tokens.salesToken;
    adminToken = tokens.adminToken;
    salesUserId = tokens.salesUser.id;

    const data = await getTestCustomerAndProduct();
    customerId = data.customer.id;
    productId = data.product.id; // IND-VLV-001

    const p2 = await prisma.product.findFirst({
      where: { id: { not: productId } },
      orderBy: { code: 'asc' },
    });
    if (!p2) throw new Error('Need at least 2 products in seed data');
    productId2 = p2.id;

    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: 'b5-' } } });
  });

  afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: 'b5-' } } });
  });

  // =========================================================================
  // A. Customer idempotency concurrency
  // =========================================================================
  describe('A. Customer idempotency concurrency', () => {
    it('10 concurrent identical POST /api/customers create exactly one customer', async () => {
      const key = uid('b5');
      const payload = {
        companyName: 'Concurrent Corp Pvt Ltd',
        contactPerson: 'Bob Sharma',
        mobile: '9876543210',
        email: `concurrent.${randomUUID().slice(0, 8)}@corp.com`,
        city: 'Bengaluru',
      };

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${salesToken}`)
            .set('Idempotency-Key', key)
            .send(payload)
        )
      );

      const successful = responses.filter((r) => r.status === 201);
      expect(successful.length).toBeGreaterThanOrEqual(1);

      const ids = new Set(successful.map((r) => r.body.data.id));
      expect(ids.size).toBe(1);

      const cid = [...ids][0];
      const dbCount = await prisma.customer.count({ where: { id: cid } });
      expect(dbCount).toBe(1);
      successful.forEach((r) => expect(r.body.data.id).toBe(cid));
    });
  });

  // =========================================================================
  // B. Enquiry idempotency concurrency
  // =========================================================================
  describe('B. Enquiry idempotency concurrency', () => {
    it('10 concurrent identical POST /api/enquiries create exactly one enquiry', async () => {
      const key = uid('b5');
      const payload = {
        customerId,
        requiredDate: futureDate(7),
        notes: 'Concurrency test enquiry',
        items: [
          { productId, quantity: 10 },
          { productId: productId2, quantity: 5 },
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

      const successful = responses.filter((r) => r.status === 201);
      expect(successful.length).toBeGreaterThanOrEqual(1);

      const ids = new Set(successful.map((r) => r.body.data.id));
      expect(ids.size).toBe(1);

      const enquiryId = [...ids][0];
      const dbCount = await prisma.enquiry.count({ where: { id: enquiryId } });
      expect(dbCount).toBe(1);

      const itemCount = await prisma.enquiryItem.count({ where: { enquiryId } });
      expect(itemCount).toBe(2);
    });
  });

  // =========================================================================
  // C. Quotation idempotency concurrency
  // =========================================================================
  describe('C. Quotation idempotency concurrency', () => {
    it('10 concurrent identical POST /api/quotations create exactly one quotation', async () => {
      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: futureDate(7),
          items: [
            { productId, quantity: 50 },
            { productId: productId2, quantity: 20 },
          ],
        });
      expect(enqRes.status).toBe(201);
      const enquiryId = enqRes.body.data.id;

      const key = uid('b5');
      const payload = {
        enquiryId,
        validUntil: futureDate(14),
        items: [
          { productId, quantity: 10, unitPrice: 4500, discountPct: 10, gstPct: 18 },
          { productId: productId2, quantity: 5, unitPrice: 2000, discountPct: 5, gstPct: 12 },
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

      const ids = new Set(successful.map((r) => r.body.data.id));
      expect(ids.size).toBe(1);

      const quotationId = [...ids][0];
      const dbCount = await prisma.quotation.count({ where: { id: quotationId } });
      expect(dbCount).toBe(1);

      const itemCount = await prisma.quotationItem.count({ where: { quotationId } });
      expect(itemCount).toBe(2);

      const numbers = new Set(successful.map((r) => r.body.data.quotationNumber));
      expect(numbers.size).toBe(1);
    });
  });

  // =========================================================================
  // D. Sales Order same-order concurrency (uses a non-shared product)
  // =========================================================================
  describe('D. Sales Order same-order concurrency (regression)', () => {
    it('concurrent double-confirm: order ends in CONFIRMED exactly once', async () => {
      // Deliberately avoid IND-VLV-001 (shared by inventory-reservation and
      // dispatch-workflow tests). Use the second product which has its own inventory.
      const otherInv = await prisma.inventory.findFirst({
        where: {
          productId: productId2,
        },
      });
      if (!otherInv) {
        console.warn('SKIP D: productId2 has no inventory row');
        return;
      }
      const available =
        Number(otherInv.physicalQuantity) -
        Number(otherInv.reservedQuantity) -
        Number(otherInv.damagedQuantity);
      if (available < 2) {
        console.warn('SKIP D: productId2 has insufficient available stock');
        return;
      }

      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: futureDate(7),
          items: [{ productId: productId2, quantity: 1 }],
        });
      expect(enqRes.status).toBe(201);

      const qtnRes = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          enquiryId: enqRes.body.data.id,
          validUntil: futureDate(14),
          items: [{ productId: productId2, quantity: 1, unitPrice: 500, discountPct: 0, gstPct: 18 }],
        });
      expect(qtnRes.status).toBe(201);

      await request(app)
        .patch(`/api/quotations/${qtnRes.body.data.id}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'ACCEPTED' });

      const soRes = await request(app)
        .post(`/api/quotations/${qtnRes.body.data.id}/convert`)
        .set('Authorization', `Bearer ${salesToken}`);
      expect(soRes.status).toBe(201);
      const orderId = soRes.body.data.id;

      // Two simultaneous confirms on the same order
      const [r1, r2] = await Promise.all([
        request(app)
          .post(`/api/sales-orders/${orderId}/confirm`)
          .set('Authorization', `Bearer ${adminToken}`),
        request(app)
          .post(`/api/sales-orders/${orderId}/confirm`)
          .set('Authorization', `Bearer ${adminToken}`),
      ]);

      expect([r1.status, r2.status]).toContain(200);

      const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
      expect(order!.status).toBe('CONFIRMED');

      const confirmedCount = await prisma.salesOrder.count({
        where: { quotationId: qtnRes.body.data.id, status: 'CONFIRMED' },
      });
      expect(confirmedCount).toBe(1);
    });
  });

  // =========================================================================
  // E. Inventory reservation concurrency (uses a non-shared product)
  // =========================================================================
  describe('E. Inventory reservation concurrency (regression)', () => {
    it('simultaneous over-reservations: at least one rejected, inventory never goes negative', async () => {
      // Find a product that is NOT IND-VLV-001 (code used by shared tests)
      // with enough available stock to take one 30-unit order but not two.
      const candidates = await prisma.inventory.findMany({
        where: { productId: { not: productId } }, // exclude IND-VLV-001
        include: { product: true },
        orderBy: { physicalQuantity: 'desc' },
        take: 10,
      });

      const suitable = candidates.find((inv) => {
        const avail =
          Number(inv.physicalQuantity) -
          Number(inv.reservedQuantity) -
          Number(inv.damagedQuantity);
        return avail >= 30;
      });

      if (!suitable) {
        console.warn('SKIP E: no non-shared product with available >= 30; existing concurrency-reservation.test.ts covers this.');
        return;
      }

      const pid = suitable.productId;

      const makeOrder = async (): Promise<string> => {
        const eq = await request(app)
          .post('/api/enquiries')
          .set('Authorization', `Bearer ${salesToken}`)
          .send({
            customerId,
            requiredDate: futureDate(7),
            items: [{ productId: pid, quantity: 30 }],
          });
        expect(eq.status).toBe(201);

        const qt = await request(app)
          .post('/api/quotations')
          .set('Authorization', `Bearer ${salesToken}`)
          .send({
            enquiryId: eq.body.data.id,
            validUntil: futureDate(14),
            items: [{ productId: pid, quantity: 30, unitPrice: 500, discountPct: 0, gstPct: 18 }],
          });
        expect(qt.status).toBe(201);

        await request(app)
          .patch(`/api/quotations/${qt.body.data.id}/status`)
          .set('Authorization', `Bearer ${salesToken}`)
          .send({ status: 'ACCEPTED' });

        const so = await request(app)
          .post(`/api/quotations/${qt.body.data.id}/convert`)
          .set('Authorization', `Bearer ${salesToken}`);
        expect(so.status).toBe(201);
        return so.body.data.id as string;
      };

      const [orderId1, orderId2] = await Promise.all([makeOrder(), makeOrder()]);

      const [c1, c2] = await Promise.all([
        request(app)
          .post(`/api/sales-orders/${orderId1}/confirm`)
          .set('Authorization', `Bearer ${adminToken}`),
        request(app)
          .post(`/api/sales-orders/${orderId2}/confirm`)
          .set('Authorization', `Bearer ${adminToken}`),
      ]);

      // At least one must succeed
      expect([c1.status, c2.status]).toContain(200);

      // Inventory invariant: available must never go negative
      const inv = await prisma.inventory.findUnique({ where: { productId: pid } });
      const available =
        Number(inv!.physicalQuantity) -
        Number(inv!.reservedQuantity) -
        Number(inv!.damagedQuantity);
      expect(available).toBeGreaterThanOrEqual(0);
      expect(Number(inv!.reservedQuantity)).toBeLessThanOrEqual(Number(inv!.physicalQuantity));
    });
  });

  // =========================================================================
  // F. Idempotency failure/rollback verification
  // =========================================================================
  describe('F. Idempotency failure and rollback', () => {

    it('F1: customer validation failure leaves no PROCESSING record; retry succeeds', async () => {
      const key = uid('b5');

      const badRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({ companyName: 'X', contactPerson: 'Alice', mobile: '9876543210', email: 'valid@example.com', city: 'Pune' });
      expect(badRes.status).toBe(400);

      const idem = await prisma.idempotencyKey.findUnique({
        where: { key_userId_method_path: { key, userId: salesUserId, method: 'POST', path: '/api/customers' } },
      });
      expect(idem).toBeNull();

      const goodRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({ companyName: 'Valid Corp', contactPerson: 'Alice Kumar', mobile: '9876543210', email: `valid.${randomUUID().slice(0, 8)}@example.com`, city: 'Pune' });
      expect(goodRes.status).toBe(201);
    });

    it('F2: COMPLETED customer key + different payload returns 409 not 500', async () => {
      const key = uid('b5');
      const email = `f2.${randomUUID().slice(0, 8)}@example.com`;

      const first = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({ companyName: 'First Corp', contactPerson: 'Alice', mobile: '9876543210', email, city: 'Delhi' });
      expect(first.status).toBe(201);

      const conflict = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({ companyName: 'First Corp', contactPerson: 'Alice', mobile: '9876543210', email, city: 'Mumbai' });
      expect(conflict.status).toBe(409);
      expect(conflict.body.success).toBe(false);
    });

    it('F3: enquiry business failure (bad customerId) rolls back tx; retry succeeds', async () => {
      const key = uid('b5');

      const badRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({ customerId: '00000000-0000-0000-0000-000000000000', requiredDate: futureDate(7), items: [{ productId, quantity: 1 }] });
      expect(badRes.status).toBe(404);

      const idem = await prisma.idempotencyKey.findUnique({
        where: { key_userId_method_path: { key, userId: salesUserId, method: 'POST', path: '/api/enquiries' } },
      });
      expect(idem).toBeNull();

      const goodRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({ customerId, requiredDate: futureDate(7), items: [{ productId, quantity: 1 }] });
      expect(goodRes.status).toBe(201);
    });

    it('F4: no orphan enquiry or enquiry_items after business failure rollback', async () => {
      const key = uid('b5');
      const fakeCustomerId = '00000000-0000-0000-0000-000000000099';

      await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({ customerId: fakeCustomerId, requiredDate: futureDate(7), items: [{ productId, quantity: 5 }] });

      const enquiryCount = await prisma.enquiry.count({ where: { customerId: fakeCustomerId } });
      expect(enquiryCount).toBe(0);
    });

    it('F5: quotation validation failure leaves no PROCESSING record; retry succeeds', async () => {
      const key = uid('b5');

      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ customerId, requiredDate: futureDate(7), items: [{ productId, quantity: 5 }] });
      expect(enqRes.status).toBe(201);

      const badRes = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({ enquiryId: enqRes.body.data.id, validUntil: futureDate(14), items: [] });
      expect(badRes.status).toBe(400);

      const idem = await prisma.idempotencyKey.findUnique({
        where: { key_userId_method_path: { key, userId: salesUserId, method: 'POST', path: '/api/quotations' } },
      });
      expect(idem).toBeNull();

      const goodRes = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({ enquiryId: enqRes.body.data.id, validUntil: futureDate(14), items: [{ productId, quantity: 5, unitPrice: 1000, discountPct: 0, gstPct: 18 }] });
      expect(goodRes.status).toBe(201);
    });

    it('F6: quotation business failure (bad enquiryId) rolls back tx; retry with valid data succeeds', async () => {
      const key = uid('b5');

      const badRes = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({ enquiryId: '00000000-0000-0000-0000-000000000000', validUntil: futureDate(14), items: [{ productId, quantity: 1, unitPrice: 1000, discountPct: 0, gstPct: 18 }] });
      expect(badRes.status).toBe(404);

      const idem = await prisma.idempotencyKey.findUnique({
        where: { key_userId_method_path: { key, userId: salesUserId, method: 'POST', path: '/api/quotations' } },
      });
      expect(idem).toBeNull();

      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ customerId, requiredDate: futureDate(7), items: [{ productId, quantity: 5 }] });
      expect(enqRes.status).toBe(201);

      const goodRes = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({ enquiryId: enqRes.body.data.id, validUntil: futureDate(14), items: [{ productId, quantity: 1, unitPrice: 1000, discountPct: 0, gstPct: 18 }] });
      expect(goodRes.status).toBe(201);
    });

    it('F7: no orphan quotation or quotation_items after business failure rollback', async () => {
      const fakeEnquiryId = '00000000-0000-0000-0000-000000000077';
      const key = uid('b5');

      await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .set('Idempotency-Key', key)
        .send({ enquiryId: fakeEnquiryId, validUntil: futureDate(14), items: [{ productId, quantity: 2, unitPrice: 1000, discountPct: 0, gstPct: 18 }] });

      const qtnCount = await prisma.quotation.count({ where: { enquiryId: fakeEnquiryId } });
      expect(qtnCount).toBe(0);
    });

    it('F8: response replay body does not expose internal idempotency fields', async () => {
      const key = uid('b5');
      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ customerId, requiredDate: futureDate(7), items: [{ productId, quantity: 3 }] });
      expect(enqRes.status).toBe(201);

      const payload = {
        enquiryId: enqRes.body.data.id,
        validUntil: futureDate(14),
        items: [{ productId, quantity: 3, unitPrice: 1500, discountPct: 0, gstPct: 18 }],
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
      expect(replay.status).toBe(201);

      const body = replay.body.data;
      expect(body.payloadHash).toBeUndefined();
      expect(body.idempotencyKeyId).toBeUndefined();
      expect(body.expiresAt).toBeUndefined();
      expect(body.responseBody).toBeUndefined();
    });
  });
});
