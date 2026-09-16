import request from 'supertest';
import { app, getAuthTokens } from '../helpers';
import prisma from '../../src/config/prisma';

describe('Same-Order Concurrent Confirmation Safety', () => {
  let adminToken: string;
  let salesToken: string;
  let customerId: string;
  let productId: string;
  let orderId: string;
  const quantityToReserve = 15;

  beforeAll(async () => {
    const tokens = await getAuthTokens();
    adminToken = tokens.adminToken;
    salesToken = tokens.salesToken;

    // Create unique test customer
    const customer = await prisma.customer.create({
      data: {
        companyName: 'Same Order Concurrency Works Ltd',
        contactPerson: 'Sameer Sen',
        mobile: '+91 9123456780',
        email: `same_order_${Date.now()}@test.com`,
        city: 'Hyderabad',
      },
    });
    customerId = customer.id;

    // Create unique test product with ample stock
    const product = await prisma.product.create({
      data: {
        code: `SAME-ORD-${Date.now()}`,
        name: 'Same Order Test Coupling Unit',
        category: 'Couplings',
        unit: 'PCS',
        basePrice: 2000,
        inventory: {
          create: {
            physicalQuantity: 100,
            reservedQuantity: 0,
            damagedQuantity: 0,
          },
        },
      },
    });
    productId = product.id;

    // Create Enquiry
    const enqRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId,
        requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        items: [{ productId, quantity: quantityToReserve }],
      });

    // Create Quotation & Accept
    const qtnRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId: enqRes.body.data.id,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [{ productId, quantity: quantityToReserve, unitPrice: 2000, discountPct: 0, gstPct: 18 }],
      });

    const quotationId = qtnRes.body.data.id;
    await request(app)
      .patch(`/api/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'ACCEPTED' });

    // Convert to Sales Order
    const convertRes = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    orderId = convertRes.body.data.id;
  });

  it('prevents double-confirmation on the same order when confirmed simultaneously', async () => {
    // Two simultaneous confirmation calls for the exact same orderId
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/sales-orders/${orderId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`),
      request(app)
        .post(`/api/sales-orders/${orderId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`),
    ]);

    const statuses = [res1.status, res2.status].sort();

    // Exactly one 200 (Success) and exactly one 409 (Conflict - already confirmed)
    expect(statuses).toEqual([200, 409]);

    // Check inventory: reserved quantity must be EXACTLY quantityToReserve (15), NEVER doubled (30)
    const inv = await prisma.inventory.findUnique({
      where: { productId },
    });

    expect(inv).not.toBeNull();
    expect(inv!.physicalQuantity).toBe(100);
    expect(inv!.reservedQuantity).toBe(quantityToReserve);

    // Verify order status is CONFIRMED
    const order = await prisma.salesOrder.findUnique({
      where: { id: orderId },
    });
    expect(order!.status).toBe('CONFIRMED');
  });
});
