import request from 'supertest';
import { app, getAuthTokens, getTestCustomerAndProduct } from '../helpers';
import prisma from '../../src/config/prisma';

describe('TEST 4: Inventory Reservation & Limits', () => {
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

  it('rejects confirmation when requested quantity exceeds available stock', async () => {
    // 1. Check current inventory for product
    const invBefore = await prisma.inventory.findUnique({
      where: { productId },
    });
    expect(invBefore).not.toBeNull();
    const available = invBefore!.physicalQuantity - invBefore!.reservedQuantity;

    // 2. Create Enquiry requesting MORE than available stock
    const excessQuantity = available + 500;
    const enqRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId,
        requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        items: [{ productId, quantity: excessQuantity }],
      });

    // 3. Create & Accept Quotation
    const qtnRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId: enqRes.body.data.id,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [{ productId, quantity: excessQuantity, unitPrice: 4500, discountPct: 0, gstPct: 18 }],
      });

    const quotationId = qtnRes.body.data.id;
    await request(app)
      .patch(`/api/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'ACCEPTED' });

    // 4. Convert to Sales Order
    const convertRes = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    const orderId = convertRes.body.data.id;

    // 5. Admin attempts to confirm and reserve
    const confirmRes = await request(app)
      .post(`/api/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(confirmRes.status).toBe(409);
    expect(confirmRes.body.success).toBe(false);
    expect(confirmRes.body.error.message).toContain('Insufficient stock');

    // 6. Verify inventory was NOT modified
    const invAfter = await prisma.inventory.findUnique({
      where: { productId },
    });
    expect(invAfter!.reservedQuantity).toBe(invBefore!.reservedQuantity);
    expect(invAfter!.physicalQuantity).toBe(invBefore!.physicalQuantity);
  });

  it('successfully reserves stock when available and keeps physical inventory unchanged', async () => {
    // 1. Get initial inventory
    const invBefore = await prisma.inventory.findUnique({
      where: { productId },
    });
    const initialPhysical = invBefore!.physicalQuantity;
    const initialReserved = invBefore!.reservedQuantity;

    const reserveQty = 5;

    // 2. Create Enquiry, Quotation, Convert to Order
    const enqRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId,
        requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        items: [{ productId, quantity: reserveQty }],
      });

    const qtnRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId: enqRes.body.data.id,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [{ productId, quantity: reserveQty, unitPrice: 4500, discountPct: 0, gstPct: 18 }],
      });

    const quotationId = qtnRes.body.data.id;
    await request(app)
      .patch(`/api/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'ACCEPTED' });

    const convertRes = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    const orderId = convertRes.body.data.id;

    // 3. Confirm order by Admin
    const confirmRes = await request(app)
      .post(`/api/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.success).toBe(true);
    expect(confirmRes.body.data.status).toBe('CONFIRMED');

    // 4. Verify: Reserved increased by 5, Physical stayed exactly the same
    const invAfter = await prisma.inventory.findUnique({
      where: { productId },
    });
    expect(invAfter!.reservedQuantity).toBe(initialReserved + reserveQty);
    expect(invAfter!.physicalQuantity).toBe(initialPhysical);
  });
});
