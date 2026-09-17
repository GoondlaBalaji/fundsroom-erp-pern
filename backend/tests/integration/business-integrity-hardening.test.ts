import request from 'supertest';
import { app, getAuthTokens, getTestCustomerAndProduct } from '../helpers';
import prisma from '../../src/config/prisma';

describe('Phase 1B: Business Integrity Hardening (BUG-01, BUG-02, BUG-03)', () => {
  let adminToken: string;
  let salesToken: string;
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

  describe('BUG-01: Quotation Immutability After Sales Order Conversion', () => {
    let convertedQuotationId: string;
    let salesOrderId: string;

    beforeAll(async () => {
      // 1. Create Enquiry
      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [{ productId, quantity: 2 }],
        });

      // 2. Create Quotation
      const qtnRes = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          enquiryId: enqRes.body.data.id,
          validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
          items: [{ productId, quantity: 2, unitPrice: 4500, discountPct: 0, gstPct: 18 }],
        });

      convertedQuotationId = qtnRes.body.data.id;

      // 3. Mark ACCEPTED
      await request(app)
        .patch(`/api/quotations/${convertedQuotationId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'ACCEPTED' });

      // 4. Convert to Sales Order
      const convertRes = await request(app)
        .post(`/api/quotations/${convertedQuotationId}/convert`)
        .set('Authorization', `Bearer ${salesToken}`);

      salesOrderId = convertRes.body.data.id;
    });

    it('rejects attempt to change converted quotation status to REJECTED with 409 Conflict', async () => {
      const res = await request(app)
        .patch(`/api/quotations/${convertedQuotationId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'REJECTED' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already been converted to a Sales Order');

      // Verify quotation remains ACCEPTED in database
      const qtnInDb = await prisma.quotation.findUnique({
        where: { id: convertedQuotationId },
      });
      expect(qtnInDb!.status).toBe('ACCEPTED');

      // Verify Sales Order remains valid
      const soInDb = await prisma.salesOrder.findUnique({
        where: { id: salesOrderId },
      });
      expect(soInDb).not.toBeNull();
      expect(soInDb!.status).toBe('PENDING');
    });

    it('rejects attempt to change converted quotation status to DRAFT with 409 Conflict', async () => {
      const res = await request(app)
        .patch(`/api/quotations/${convertedQuotationId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'DRAFT' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already been converted to a Sales Order');

      // Verify status in DB is still ACCEPTED
      const qtnInDb = await prisma.quotation.findUnique({
        where: { id: convertedQuotationId },
      });
      expect(qtnInDb!.status).toBe('ACCEPTED');
    });

    it('allows valid status updates for an unconverted quotation', async () => {
      // Create unconverted quotation
      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [{ productId, quantity: 1 }],
        });

      const qtnRes = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          enquiryId: enqRes.body.data.id,
          validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
          items: [{ productId, quantity: 1, unitPrice: 4500, discountPct: 0, gstPct: 18 }],
        });

      const unconvertedId = qtnRes.body.data.id;

      // Update to SENT
      const sentRes = await request(app)
        .patch(`/api/quotations/${unconvertedId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'SENT' });
      expect(sentRes.status).toBe(200);
      expect(sentRes.body.data.status).toBe('SENT');

      // Update to ACCEPTED
      const acceptedRes = await request(app)
        .patch(`/api/quotations/${unconvertedId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'ACCEPTED' });
      expect(acceptedRes.status).toBe(200);
      expect(acceptedRes.body.data.status).toBe('ACCEPTED');
    });
  });

  describe('BUG-02: PostgreSQL Inventory CHECK Constraints', () => {
    let testProductId: string;

    beforeAll(async () => {
      const product = await prisma.product.create({
        data: {
          code: `CHK-TEST-${Date.now()}`,
          name: 'Check Constraint Test Item',
          category: 'Testing',
          unit: 'PCS',
          basePrice: 1000,
        },
      });
      testProductId = product.id;
    });

    it('fails when physical_quantity is negative', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO inventories (id, product_id, physical_quantity, reserved_quantity, damaged_quantity, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          `chk-inv-neg-phys-${Date.now()}`,
          testProductId,
          -1,
          0,
          0
        )
      ).rejects.toThrow(/chk_physical_qty_non_negative/);
    });

    it('fails when reserved_quantity is negative', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO inventories (id, product_id, physical_quantity, reserved_quantity, damaged_quantity, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          `chk-inv-neg-res-${Date.now()}`,
          testProductId,
          50,
          -1,
          0
        )
      ).rejects.toThrow(/chk_reserved_qty_non_negative/);
    });

    it('fails when damaged_quantity is negative', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO inventories (id, product_id, physical_quantity, reserved_quantity, damaged_quantity, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          `chk-inv-neg-dmg-${Date.now()}`,
          testProductId,
          50,
          0,
          -1
        )
      ).rejects.toThrow(/chk_damaged_qty_non_negative/);
    });

    it('fails when reserved_quantity exceeds physical_quantity', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO inventories (id, product_id, physical_quantity, reserved_quantity, damaged_quantity, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          `chk-inv-res-gt-phys-${Date.now()}`,
          testProductId,
          50,
          51,
          0
        )
      ).rejects.toThrow(/chk_reserved_le_physical/);
    });

    it('succeeds with valid inventory data satisfying all check constraints', async () => {
      const invId = `chk-inv-valid-${Date.now()}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO inventories (id, product_id, physical_quantity, reserved_quantity, damaged_quantity, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        invId,
        testProductId,
        100,
        30,
        10
      );

      const created = await prisma.inventory.findUnique({
        where: { id: invId },
      });
      expect(created).not.toBeNull();
      expect(created!.physicalQuantity).toBe(100);
      expect(created!.reservedQuantity).toBe(30);
      expect(created!.damagedQuantity).toBe(10);
    });
  });

  describe('BUG-03: Prevent Manual Enquiry Transition Directly to WON', () => {
    it('rejects manual transition of a NEW enquiry to WON with 400 Bad Request', async () => {
      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [{ productId, quantity: 1 }],
        });

      const enquiryId = enqRes.body.data.id;

      // Attempt manual transition to WON
      const res = await request(app)
        .patch(`/api/enquiries/${enquiryId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'WON' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Enquiries can only transition to WON via Sales Order conversion');

      // Verify enquiry status in DB is still NEW
      const enqInDb = await prisma.enquiry.findUnique({
        where: { id: enquiryId },
      });
      expect(enqInDb!.status).toBe('NEW');
    });

    it('rejects manual transition of a LOST enquiry to WON with 400 Bad Request', async () => {
      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [{ productId, quantity: 1 }],
        });

      const enquiryId = enqRes.body.data.id;

      // Mark as LOST
      await request(app)
        .patch(`/api/enquiries/${enquiryId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'LOST' });

      // Attempt manual transition to WON
      const res = await request(app)
        .patch(`/api/enquiries/${enquiryId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'WON' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Enquiries can only transition to WON via Sales Order conversion');

      // Verify enquiry status in DB is still LOST
      const enqInDb = await prisma.enquiry.findUnique({
        where: { id: enquiryId },
      });
      expect(enqInDb!.status).toBe('LOST');
    });

    it('allows legitimate transition to WON via quotation conversion to Sales Order', async () => {
      // 1. Create Enquiry
      const enqRes = await request(app)
        .post('/api/enquiries')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          customerId,
          requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          items: [{ productId, quantity: 1 }],
        });

      const enquiryId = enqRes.body.data.id;
      expect(enqRes.body.data.status).toBe('NEW');

      // 2. Create Quotation
      const qtnRes = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${salesToken}`)
        .send({
          enquiryId,
          validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
          items: [{ productId, quantity: 1, unitPrice: 4500, discountPct: 0, gstPct: 18 }],
        });

      const quotationId = qtnRes.body.data.id;

      // 3. Mark ACCEPTED
      await request(app)
        .patch(`/api/quotations/${quotationId}/status`)
        .set('Authorization', `Bearer ${salesToken}`)
        .send({ status: 'ACCEPTED' });

      // 4. Convert to Sales Order
      const convertRes = await request(app)
        .post(`/api/quotations/${quotationId}/convert`)
        .set('Authorization', `Bearer ${salesToken}`);

      expect(convertRes.status).toBe(201);
      expect(convertRes.body.success).toBe(true);

      // 5. Verify that enquiry automatically transitioned to WON via the authoritative conversion workflow
      const enqInDb = await prisma.enquiry.findUnique({
        where: { id: enquiryId },
      });
      expect(enqInDb!.status).toBe('WON');
    });
  });
});
