import request from 'supertest';
import { app, getAuthTokens, getTestCustomerAndProduct } from '../helpers';
import prisma from '../../src/config/prisma';

describe('Dispatch Workflow & Inventory Reduction', () => {
  let adminToken: string;
  let salesToken: string;
  let customerId: string;
  let productId: string;
  let orderId: string;
  const orderQty = 6;

  beforeAll(async () => {
    const tokens = await getAuthTokens();
    adminToken = tokens.adminToken;
    salesToken = tokens.salesToken;

    const data = await getTestCustomerAndProduct();
    customerId = data.customer.id;
    productId = data.product.id;

    // Create enquiry, quotation, order
    const enqRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId,
        requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        items: [{ productId, quantity: orderQty }],
      });

    const qtnRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId: enqRes.body.data.id,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [{ productId, quantity: orderQty, unitPrice: 4500, discountPct: 0, gstPct: 18 }],
      });

    await request(app)
      .patch(`/api/quotations/${qtnRes.body.data.id}/status`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'ACCEPTED' });

    const orderRes = await request(app)
      .post(`/api/quotations/${qtnRes.body.data.id}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    orderId = orderRes.body.data.id;
  });

  it('rejects dispatch before order is confirmed', async () => {
    const res = await request(app)
      .post('/api/dispatches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        salesOrderId: orderId,
        vehicleNumber: 'MH-12-TX-9999',
        driverName: 'Suresh Patil',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Cannot dispatch an unconfirmed Sales Order');
  });

  it('confirms the order and reserves stock', async () => {
    const res = await request(app)
      .post(`/api/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');
  });

  it('successfully dispatches the order and reduces both physical and reserved inventory', async () => {
    const invBefore = await prisma.inventory.findUnique({
      where: { productId },
    });
    const physicalBefore = invBefore!.physicalQuantity;
    const reservedBefore = invBefore!.reservedQuantity;

    const res = await request(app)
      .post('/api/dispatches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        salesOrderId: orderId,
        vehicleNumber: 'MH-12-TX-9999',
        driverName: 'Suresh Patil',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dispatchNumber).toMatch(/^DSP-\d{8}-\d{4}$/);
    expect(res.body.data.vehicleNumber).toBe('MH-12-TX-9999');
    expect(res.body.data.driverName).toBe('Suresh Patil');

    // Check inventory reduction:
    // Physical decreases by orderQty
    // Reserved decreases by orderQty
    const invAfter = await prisma.inventory.findUnique({
      where: { productId },
    });
    expect(invAfter!.physicalQuantity).toBe(physicalBefore - orderQty);
    expect(invAfter!.reservedQuantity).toBe(reservedBefore - orderQty);

    // Check order status is DISPATCHED
    const updatedOrder = await prisma.salesOrder.findUnique({
      where: { id: orderId },
    });
    expect(updatedOrder!.status).toBe('DISPATCHED');
  });

  it('rejects duplicate dispatch of the same order', async () => {
    const res = await request(app)
      .post('/api/dispatches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        salesOrderId: orderId,
        vehicleNumber: 'MH-12-TX-9999',
        driverName: 'Suresh Patil',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('already been dispatched');
  });
});
