import request from 'supertest';
import { app, getAuthTokens, getTestCustomerAndProduct } from '../helpers';
import prisma from '../../src/config/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a YYYY-MM-DD string offset by `days` from today in UTC. */
function utcDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('Phase 1D: Final Business-Input Edge-Case Hardening (BUG-09 through BUG-12)', () => {
  let salesToken: string;
  let adminToken: string;
  let customerId: string;
  let productId: string;

  beforeAll(async () => {
    const tokens = await getAuthTokens();
    adminToken = tokens.adminToken;
    salesToken = tokens.salesToken;

    const data = await getTestCustomerAndProduct();
    customerId = data.customer.id;
    productId = data.product.id;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-09: Whitespace-only customer strings
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-09: Whitespace-Only Customer Strings', () => {
    const validBase = {
      companyName: 'Valid Company Ltd.',
      contactPerson: 'Valid Person',
      mobile: '+91 9876543210',
      email: 'valid@example.com',
      city: 'Mumbai',
    };

    it('rejects whitespace-only companyName with 400', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBase, companyName: '   ' });
      expect(res.status).toBe(400);
    });

    it('rejects whitespace-only contactPerson with 400', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBase, contactPerson: '   ' });
      expect(res.status).toBe(400);
    });

    it('rejects whitespace-only city with 400', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBase, city: '   ' });
      expect(res.status).toBe(400);
    });

    it('rejects tab-only companyName with 400', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBase, companyName: '\t\t' });
      expect(res.status).toBe(400);
    });

    it('rejects single-char companyName (fails min-2 after trim) with 400', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBase, companyName: ' A ' });
      expect(res.status).toBe(400);
    });

    it('accepts valid surrounding-whitespace stripped to meaningful value', async () => {
      // Zod .trim() strips whitespace before the min() check, so "  AB  " becomes "AB" (2 chars, valid)
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBase, companyName: '  Trimmed Corp  ' });
      expect(res.status).toBe(201);
    });

    it('creates valid customer successfully (regression)', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          companyName: 'Regression Corp Ltd',
          contactPerson: 'Test Person',
          mobile: '+91 9900112233',
          email: 'regression@test.com',
          city: 'Delhi',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.companyName).toBe('Regression Corp Ltd');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-10: Mobile validation
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-10: Mobile Number Validation', () => {
    const validBase = {
      companyName: 'Mobile Test Corp',
      contactPerson: 'Test Person',
      email: 'mob@test.com',
      city: 'Chennai',
    };

    it('rejects alphabetic mobile with 400', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBase, mobile: 'abcdefghij' });
      expect(res.status).toBe(400);
    });

    it('rejects alphanumeric mobile with 400', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBase, mobile: '12345abcde' });
      expect(res.status).toBe(400);
    });

    it('rejects special-character-only mobile with 400', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBase, mobile: '!!!!!!!!!!' });
      expect(res.status).toBe(400);
    });

    it('rejects empty mobile with 400', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBase, mobile: '' });
      expect(res.status).toBe(400);
    });

    it('rejects whitespace-only mobile with 400', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBase, mobile: '   ' });
      expect(res.status).toBe(400);
    });

    it('accepts Indian mobile with country code format (+91 XXXXXXXXXX)', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBase, mobile: '+91 9876543210', companyName: 'Mobile Test Corp A' });
      expect(res.status).toBe(201);
    });

    it('accepts 10-digit mobile without country code', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBase, mobile: '9876543210', companyName: 'Mobile Test Corp B' });
      expect(res.status).toBe(201);
    });

    it('accepts mobile with hyphens', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validBase, mobile: '+91-9876543210', companyName: 'Mobile Test Corp C' });
      expect(res.status).toBe(201);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-11: Past required date
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-11: Past Required Date on Enquiry Creation', () => {
    const makeEnquiryPayload = (requiredDate: string) => ({
      customerId,
      requiredDate,
      items: [{ productId, quantity: 1 }],
    });

    it('rejects yesterday as requiredDate with 400', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeEnquiryPayload(utcDateOffset(-1)));
      expect(res.status).toBe(400);
    });

    it('accepts today as requiredDate (boundary: today is valid)', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeEnquiryPayload(utcDateOffset(0)));
      expect(res.status).toBe(201);
    });

    it('accepts tomorrow as requiredDate', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeEnquiryPayload(utcDateOffset(1)));
      expect(res.status).toBe(201);
    });

    it('accepts a date 7 days in the future (existing workflow regression)', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeEnquiryPayload(utcDateOffset(7)));
      expect(res.status).toBe(201);
    });

    it('rejects a date 30 days in the past', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send(makeEnquiryPayload(utcDateOffset(-30)));
      expect(res.status).toBe(400);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BUG-12: Inventory negative-available masking removed
  // ───────────────────────────────────────────────────────────────────────────
  describe('BUG-12: Inventory Available Quantity — No Clamping', () => {
    let testProductId: string;
    let testInventoryId: string;

    beforeAll(async () => {
      // Create a dedicated product for these tests
      const product = await prisma.product.upsert({
        where: { code: 'BUG12-TEST-INV' },
        update: {},
        create: {
          code: 'BUG12-TEST-INV',
          name: 'Bug12 Inventory Test Product',
          category: 'Testing',
          unit: 'PCS',
          basePrice: 100,
        },
      });
      testProductId = product.id;

      // Create inventory with neutral starting state
      const inv = await prisma.inventory.upsert({
        where: { productId: testProductId },
        update: { physicalQuantity: 100, reservedQuantity: 0, damagedQuantity: 0 },
        create: {
          productId: testProductId,
          physicalQuantity: 100,
          reservedQuantity: 0,
          damagedQuantity: 0,
        },
      });
      testInventoryId = inv.id;
    });

    afterAll(async () => {
      // Restore to a valid clean state (all zeros)
      await prisma.inventory.update({
        where: { id: testInventoryId },
        data: { physicalQuantity: 0, reservedQuantity: 0, damagedQuantity: 0 },
      });
    });

    it('TEST 1: normal inventory → available = physical - reserved - damaged', async () => {
      // physical=100, reserved=20, damaged=10 → available=70
      await prisma.inventory.update({
        where: { id: testInventoryId },
        data: { physicalQuantity: 100, reservedQuantity: 20, damagedQuantity: 10 },
      });

      const res = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const inv = res.body.data.find((i: { productId: string }) => i.productId === testProductId);
      expect(inv).toBeDefined();
      expect(inv.physicalQuantity).toBe(100);
      expect(inv.reservedQuantity).toBe(20);
      expect(inv.damagedQuantity).toBe(10);
      expect(inv.availableQuantity).toBe(70);
    });

    it('TEST 2: zero-available inventory → available = 0 exactly', async () => {
      // physical=100, reserved=90, damaged=10 → available=0
      await prisma.inventory.update({
        where: { id: testInventoryId },
        data: { physicalQuantity: 100, reservedQuantity: 90, damagedQuantity: 10 },
      });

      const res = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const inv = res.body.data.find((i: { productId: string }) => i.productId === testProductId);
      expect(inv).toBeDefined();
      expect(inv.availableQuantity).toBe(0);
    });

    it('TEST 3: integrity-defect scenario → available is negative, NOT clamped to 0', async () => {
      // physical=100, reserved=90 (≤ physical ✓), damaged=15
      // available = 100 - 90 - 15 = -5
      // This state is reachable because the DB only constrains reserved ≤ physical,
      // not (reserved + damaged) ≤ physical.
      await prisma.inventory.update({
        where: { id: testInventoryId },
        data: { physicalQuantity: 100, reservedQuantity: 90, damagedQuantity: 15 },
      });

      const res = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const inv = res.body.data.find((i: { productId: string }) => i.productId === testProductId);
      expect(inv).toBeDefined();
      // Without masking, the true value (-5) must be returned
      expect(inv.availableQuantity).toBe(-5);
      // Confirm the old Math.max(0, ...) behavior is NOT present
      expect(inv.availableQuantity).not.toBe(0);
    });
  });
});
