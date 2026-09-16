import request from 'supertest';
import { app, getAuthTokens } from '../helpers';
import prisma from '../../src/config/prisma';

describe('BONUS TEST: Concurrent Inventory Reservation Safety', () => {
  let adminToken: string;
  let salesToken: string;
  let customerId: string;
  let testProductId: string;
  let orderAId: string;
  let orderBId: string;

  beforeAll(async () => {
    const tokens = await getAuthTokens();
    adminToken = tokens.adminToken;
    salesToken = tokens.salesToken;

    // Create an isolated test customer
    const customer = await prisma.customer.create({
      data: {
        companyName: 'Concurrency Test Works Ltd',
        contactPerson: 'Arun Varma',
        mobile: '+91 9999988888',
        email: `concurrency_${Date.now()}@test.com`,
        city: 'Bengaluru',
      },
    });
    customerId = customer.id;

    // Create an isolated product with EXACTLY 100 available units (Physical: 100, Reserved: 0)
    const product = await prisma.product.create({
      data: {
        code: `CONCUR-${Date.now()}`,
        name: 'Concurrency Test Hydraulic Actuator',
        category: 'Actuators',
        unit: 'PCS',
        basePrice: 5000,
        inventory: {
          create: {
            physicalQuantity: 100,
            reservedQuantity: 0,
            damagedQuantity: 0,
          },
        },
      },
      include: { inventory: true },
    });
    testProductId = product.id;

    // Create Order A (requires 80 units)
    const enqARes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId,
        requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        items: [{ productId: testProductId, quantity: 80 }],
      });

    const qtnARes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId: enqARes.body.data.id,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [{ productId: testProductId, quantity: 80, unitPrice: 5000, discountPct: 0, gstPct: 18 }],
      });

    await request(app)
      .patch(`/api/quotations/${qtnARes.body.data.id}/status`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'ACCEPTED' });

    const orderARes = await request(app)
      .post(`/api/quotations/${qtnARes.body.data.id}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);
    orderAId = orderARes.body.data.id;

    // Create Order B (requires 50 units)
    const enqBRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId,
        requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        items: [{ productId: testProductId, quantity: 50 }],
      });

    const qtnBRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId: enqBRes.body.data.id,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [{ productId: testProductId, quantity: 50, unitPrice: 5000, discountPct: 0, gstPct: 18 }],
      });

    await request(app)
      .patch(`/api/quotations/${qtnBRes.body.data.id}/status`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'ACCEPTED' });

    const orderBRes = await request(app)
      .post(`/api/quotations/${qtnBRes.body.data.id}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);
    orderBId = orderBRes.body.data.id;
  });

  it('handles simultaneous reservations safely: exactly one order succeeds and one is rejected', async () => {
    // Both arrive almost simultaneously: Order A needs 80, Order B needs 50. Available is only 100.
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/sales-orders/${orderAId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`),
      request(app)
        .post(`/api/sales-orders/${orderBId}/confirm`)
        .set('Authorization', `Bearer ${adminToken}`),
    ]);

    const statuses = [res1.status, res2.status].sort();

    // Exactly one 200 (Success) and exactly one 409 (Conflict - Insufficient Stock)
    expect(statuses).toEqual([200, 409]);

    // Check the final inventory in PostgreSQL: reserved must never be 130!
    const finalInv = await prisma.inventory.findUnique({
      where: { productId: testProductId },
    });

    expect(finalInv).not.toBeNull();
    expect(finalInv!.physicalQuantity).toBe(100);

    // Reserved must be either 80 (if A won) or 50 (if B won)
    expect([50, 80]).toContain(finalInv!.reservedQuantity);

    // Available must be strictly non-negative (either 20 or 50)
    const available = finalInv!.physicalQuantity - finalInv!.reservedQuantity;
    expect(available).toBeGreaterThanOrEqual(0);
  });
});
