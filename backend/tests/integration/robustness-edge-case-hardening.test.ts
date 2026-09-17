import request from 'supertest';
import { app, getAuthTokens, getTestCustomerAndProduct } from '../helpers';
import prisma from '../../src/config/prisma';

describe('Phase 1C: Robustness Edge-Case Hardening (BUG-04 through BUG-08)', () => {
  let adminToken: string;
  let salesToken: string;
  let customerId: string;
  let productId: string;
  let product2Id: string;

  beforeAll(async () => {
    const tokens = await getAuthTokens();
    adminToken = tokens.adminToken;
    salesToken = tokens.salesToken;

    const data = await getTestCustomerAndProduct();
    customerId = data.customer.id;
    productId = data.product.id;

    // Create a second product for multi-product tests
    const p2 = await prisma.product.upsert({
      where: { code: 'BUG08-TEST-P2' },
      update: {},
      create: {
        code: 'BUG08-TEST-P2',
        name: 'Bug08 Test Product 2',
        category: 'Testing',
        unit: 'PCS',
        basePrice: 500,
      },
    });
    product2Id = p2.id;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BUG-04: Expired quotation conversion
  // ─────────────────────────────────────────────────────────────────────────
  describe('BUG-04: Block Conversion of Expired Quotations', () => {
    /**
     * Helper to create an enquiry → quotation pair with a given validUntil date.
     * Returns { enquiryId, quotationId }.
     */
    async function createAcceptedQuotation(validUntil: Date): Promise<{
      enquiryId: string;
      quotationId: string;
    }> {
      // Create enquiry
      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [{ productId, quantity: 1 }],
        });
      expect(enqRes.status).toBe(201);
      const enquiryId = enqRes.body.data.id;

      // Create quotation
      const qtnRes = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          enquiryId,
          validUntil: validUntil.toISOString(),
          items: [{ productId, quantity: 1, unitPrice: 5000, discountPct: 0, gstPct: 18 }],
        });
      expect(qtnRes.status).toBe(201);
      const quotationId = qtnRes.body.data.id;

      // Accept quotation
      const acceptRes = await request(app)
        .patch(`/api/quotations/${quotationId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'ACCEPTED' });
      expect(acceptRes.status).toBe(200);

      return { enquiryId, quotationId };
    }

    it('TEST 1: ACCEPTED quotation with future validUntil — conversion succeeds', async () => {
      const futureDate = new Date(Date.now() + 30 * 86400000); // 30 days ahead
      const { quotationId, enquiryId } = await createAcceptedQuotation(futureDate);

      const res = await request(app)
        .post(`/api/quotations/${quotationId}/convert`)
        .set('Authorization', `Bearer ${salesToken}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderNumber).toMatch(/^SO-\d{8}-\d{4}$/);

      // Enquiry should be WON
      const enq = await prisma.enquiry.findUnique({ where: { id: enquiryId } });
      expect(enq!.status).toBe('WON');
    });

    it('TEST 2: ACCEPTED quotation with past validUntil — conversion rejected, no SO created, enquiry not WON', async () => {
      // Create quotation directly in DB with a past validUntil so we can bypass the API date validation
      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [{ productId, quantity: 1 }],
        });
      expect(enqRes.status).toBe(201);
      const enquiryId = enqRes.body.data.id;

      const qtnRes = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          enquiryId,
          validUntil: new Date(Date.now() + 30 * 86400000).toISOString(), // future initially
          items: [{ productId, quantity: 1, unitPrice: 5000, discountPct: 0, gstPct: 18 }],
        });
      expect(qtnRes.status).toBe(201);
      const quotationId = qtnRes.body.data.id;

      // Accept quotation
      await request(app)
        .patch(`/api/quotations/${quotationId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'ACCEPTED' });

      // Backdate valid_until directly in DB to simulate expiry
      await prisma.quotation.update({
        where: { id: quotationId },
        data: { validUntil: new Date('2020-01-01T00:00:00Z') },
      });

      // Attempt conversion — must fail
      const res = await request(app)
        .post(`/api/quotations/${quotationId}/convert`)
        .set('Authorization', `Bearer ${salesToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('expired');

      // No Sales Order created
      const so = await prisma.salesOrder.findUnique({ where: { quotationId } });
      expect(so).toBeNull();

      // Enquiry must NOT be WON
      const enq = await prisma.enquiry.findUnique({ where: { id: enquiryId } });
      expect(enq!.status).not.toBe('WON');
    });

    it('TEST 3: Existing valid conversion workflow still passes (regression)', async () => {
      const futureDate = new Date(Date.now() + 14 * 86400000);
      const { quotationId } = await createAcceptedQuotation(futureDate);

      const res = await request(app)
        .post(`/api/quotations/${quotationId}/convert`)
        .set('Authorization', `Bearer ${salesToken}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BUG-05: Quotation numeric validation hardening
  // ─────────────────────────────────────────────────────────────────────────
  describe('BUG-05: Quotation Numeric Validation', () => {
    let enquiryId: string;

    beforeAll(async () => {
      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [{ productId, quantity: 1 }],
        });
      enquiryId = enqRes.body.data.id;
    });

    function makeQuotationPayload(overrides: Record<string, unknown> = {}) {
      return {
        enquiryId,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [
          {
            productId,
            quantity: 1,
            unitPrice: 1000,
            discountPct: 0,
            gstPct: 18,
            ...overrides,
          },
        ],
      };
    }

    it('rejects gstPct = -1 with 400', async () => {
      const res = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeQuotationPayload({ gstPct: -1 }));
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects gstPct = 1000 with 400 (controlled validation, not DB overflow)', async () => {
      const res = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeQuotationPayload({ gstPct: 1000 }));
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      // Must NOT be a 500
    });

    it('rejects gstPct = Infinity with 400', async () => {
      // JSON.stringify loses Infinity; send as large number instead to mimic bad client
      const payload = {
        enquiryId,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [{ productId, quantity: 1, unitPrice: 1000, discountPct: 0, gstPct: 1e308 }],
      };
      const res = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(payload);
      expect(res.status).toBe(400);
    });

    it('rejects excessively large unitPrice with 400', async () => {
      const res = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeQuotationPayload({ unitPrice: 100_000_000_000 })); // > DECIMAL(12,2) max
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('accepts gstPct = 0 (valid boundary)', async () => {
      const res = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeQuotationPayload({ gstPct: 0 }));
      expect(res.status).toBe(201);
    });

    it('accepts gstPct = 18 (common GST rate)', async () => {
      const res = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeQuotationPayload({ gstPct: 18 }));
      expect(res.status).toBe(201);
    });

    it('accepts gstPct = 100 (upper boundary)', async () => {
      const res = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeQuotationPayload({ gstPct: 100 }));
      expect(res.status).toBe(201);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BUG-06: Prevent quotation creation for LOST/WON enquiries
  // ─────────────────────────────────────────────────────────────────────────
  describe('BUG-06: Prevent Quotations for LOST/WON Enquiries', () => {
    function makeQuotation(enquiryId: string) {
      return {
        enquiryId,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [{ productId, quantity: 1, unitPrice: 3000, discountPct: 0, gstPct: 18 }],
      };
    }

    it('TEST 1: rejects quotation creation for a LOST enquiry', async () => {
      // Create and LOST an enquiry
      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [{ productId, quantity: 1 }],
        });
      const lostEnquiryId = enqRes.body.data.id;

      await request(app)
        .patch(`/api/enquiries/${lostEnquiryId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'LOST' });

      // Attempt to create quotation on LOST enquiry
      const res = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeQuotation(lostEnquiryId));

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("status 'LOST'");

      // Confirm no quotation was created
      const quotations = await prisma.quotation.findMany({
        where: { enquiryId: lostEnquiryId },
      });
      expect(quotations).toHaveLength(0);
    });

    it('TEST 2: allows quotation creation for a NEW enquiry', async () => {
      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [{ productId, quantity: 1 }],
        });
      const newEnquiryId = enqRes.body.data.id;

      const res = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeQuotation(newEnquiryId));

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('TEST 3: rejects quotation creation for a WON enquiry', async () => {
      // Create enquiry → quotation → accept → convert (making it WON)
      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [{ productId, quantity: 1 }],
        });
      const wonEnquiryId = enqRes.body.data.id;

      const qtnRes = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeQuotation(wonEnquiryId));

      await request(app)
        .patch(`/api/quotations/${qtnRes.body.data.id}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'ACCEPTED' });

      await request(app)
        .post(`/api/quotations/${qtnRes.body.data.id}/convert`)
        .set('Authorization', `Bearer ${salesToken}`);

      // Verify it's now WON
      const enq = await prisma.enquiry.findUnique({ where: { id: wonEnquiryId } });
      expect(enq!.status).toBe('WON');

      // Attempt to create another quotation — must be rejected
      const res = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeQuotation(wonEnquiryId));

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("status 'WON'");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BUG-07: Duplicate product IDs in enquiry items
  // ─────────────────────────────────────────────────────────────────────────
  describe('BUG-07: Duplicate Product IDs in Enquiry Items', () => {
    it('rejects [p1, p1] with 400 and clear duplicate-product error', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [
            { productId, quantity: 5 },
            { productId, quantity: 10 }, // duplicate
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      // Validation middleware wraps Zod issues in error.details[]; check there
      const allMessages = [
        res.body.error.message,
        ...(res.body.error.details || []).map((d: { message: string }) => d.message),
      ].join(' ');
      expect(allMessages).toContain('Duplicate products');
    });

    it('allows [p1, p2] — multiple unique products', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [
            { productId, quantity: 5 },
            { productId: product2Id, quantity: 10 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
    });

    it('allows [p1] — single product', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [{ productId, quantity: 3 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('duplicate check fires BEFORE DB work (non-existent product IDs still rejected for duplication)', async () => {
      const fakeId = 'non-existent-product-id';
      const res = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [
            { productId: fakeId, quantity: 1 },
            { productId: fakeId, quantity: 2 },
          ],
        });

      expect(res.status).toBe(400);
      // Should get duplicate error, not "product does not exist" (proving early Zod rejection)
      const allMessages = [
        res.body.error.message,
        ...(res.body.error.details || []).map((d: { message: string }) => d.message),
      ].join(' ');
      expect(allMessages).toContain('Duplicate products');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BUG-08: Concurrency-safe sequence generation
  // ─────────────────────────────────────────────────────────────────────────
  describe('BUG-08: Concurrent Sequence Generation', () => {
    it('10 concurrent quotation creations produce 10 unique QTN numbers with no failures', async () => {
      // Create 10 separate enquiries first (to avoid other concurrency issues)
      const enquiries: string[] = [];
      for (let i = 0; i < 10; i++) {
        const enqRes = await request(app)
          .post('/api/enquiries')
          .set('Authorization', `Bearer ${salesToken}`)
          .send({
            customerId,
            requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
            items: [{ productId, quantity: 1 }],
          });
        expect(enqRes.status).toBe(201);
        enquiries.push(enqRes.body.data.id);
      }

      // Fire 10 concurrent quotation creations
      const promises = enquiries.map((enquiryId) =>
        request(app)
          .post('/api/quotations')
          .set('Authorization', `Bearer ${salesToken}`)
          .send({
            enquiryId,
            validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
            items: [{ productId, quantity: 1, unitPrice: 1000, discountPct: 0, gstPct: 18 }],
          })
      );

      const results = await Promise.all(promises);

      // All 10 must succeed
      const failures = results.filter((r) => r.status !== 201);
      expect(failures).toHaveLength(0);

      // Extract quotation numbers
      const qtnNumbers = results.map((r) => r.body.data.quotationNumber as string);

      // All 10 must be unique
      const uniqueNumbers = new Set(qtnNumbers);
      expect(uniqueNumbers.size).toBe(10);

      // All must match the expected format
      const pattern = /^QTN-\d{8}-\d{4}$/;
      for (const num of qtnNumbers) {
        expect(num).toMatch(pattern);
      }
    }, 30000); // extended timeout for concurrency test

    it('10 concurrent enquiry creations produce 10 unique ENQ numbers with no failures', async () => {
      const promises = Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/enquiries')
          .set('Authorization', `Bearer ${salesToken}`)
          .send({
            customerId,
            requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
            items: [{ productId, quantity: 1 }],
          })
      );

      const results = await Promise.all(promises);

      const failures = results.filter((r) => r.status !== 201);
      expect(failures).toHaveLength(0);

      const enqNumbers = results.map((r) => r.body.data.enquiryNumber as string);
      const uniqueNumbers = new Set(enqNumbers);
      expect(uniqueNumbers.size).toBe(10);

      const pattern = /^ENQ-\d{8}-\d{4}$/;
      for (const num of enqNumbers) {
        expect(num).toMatch(pattern);
      }
    }, 30000);

    it('sequential creation yields sequentially increasing numbers', async () => {
      // Read current sequence counter for QTN to get relative positions
      const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      const enquiries: string[] = [];
      for (let i = 0; i < 3; i++) {
        const enqRes = await request(app)
          .post('/api/enquiries')
          .set('Authorization', `Bearer ${salesToken}`)
          .send({
            customerId,
            requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
            items: [{ productId, quantity: 1 }],
          });
        enquiries.push(enqRes.body.data.id);
      }

      const qtnResults: string[] = [];
      for (const enquiryId of enquiries) {
        const res = await request(app)
          .post('/api/quotations')
          .set('Authorization', `Bearer ${salesToken}`)
          .send({
            enquiryId,
            validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
            items: [{ productId, quantity: 1, unitPrice: 1000, discountPct: 0, gstPct: 18 }],
          });
        expect(res.status).toBe(201);
        qtnResults.push(res.body.data.quotationNumber);
      }

      // Extract sequence numbers and verify they are strictly increasing
      const seqNums = qtnResults.map((n) => parseInt(n.split('-')[2], 10));
      for (let i = 1; i < seqNums.length; i++) {
        expect(seqNums[i]).toBeGreaterThan(seqNums[i - 1]);
      }

      // All have today's date key
      for (const num of qtnResults) {
        expect(num).toContain(dateKey);
      }
    });
  });
});
