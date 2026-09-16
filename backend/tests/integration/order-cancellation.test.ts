import request from 'supertest';
import { app, getAuthTokens } from '../helpers';
import prisma from '../../src/config/prisma';

describe('Sales Order Cancellation & Inventory Release', () => {
  let adminToken: string;
  let salesToken: string;
  let customerId: string;
  let productId: string;
  const orderQty = 10;

  beforeAll(async () => {
    const tokens = await getAuthTokens();
    adminToken = tokens.adminToken;
    salesToken = tokens.salesToken;

    const customer = await prisma.customer.create({
      data: {
        companyName: 'Cancellation Test Industries Ltd',
        contactPerson: 'Karan Mehra',
        mobile: '+91 9777788888',
        email: `cancel_${Date.now()}@test.com`,
        city: 'Chennai',
      },
    });
    customerId = customer.id;

    const product = await prisma.product.create({
      data: {
        code: `CANCEL-${Date.now()}`,
        name: 'Cancellation Test Pneumatic Valve',
        category: 'Valves',
        unit: 'PCS',
        basePrice: 1500,
        inventory: {
          create: {
            physicalQuantity: 50,
            reservedQuantity: 0,
            damagedQuantity: 0,
          },
        },
      },
    });
    productId = product.id;
  });

  it('cancelling a PENDING sales order updates status to CANCELLED without changing inventory', async () => {
    // 1. Create Enquiry, Quotation, Order
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
        items: [{ productId, quantity: orderQty, unitPrice: 1500, discountPct: 0, gstPct: 18 }],
      });

    const quotationId = qtnRes.body.data.id;
    await request(app)
      .patch(`/api/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'ACCEPTED' });

    const orderRes = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    const orderId = orderRes.body.data.id;

    // 2. Cancel PENDING order
    const cancelRes = await request(app)
      .post(`/api/sales-orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');

    // 3. Inventory must remain unchanged (Physical: 50, Reserved: 0)
    const inv = await prisma.inventory.findUnique({
      where: { productId },
    });
    expect(inv!.physicalQuantity).toBe(50);
    expect(inv!.reservedQuantity).toBe(0);
  });

  it('cancelling a CONFIRMED sales order releases reserved stock back to available', async () => {
    // 1. Create and confirm order
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
        items: [{ productId, quantity: orderQty, unitPrice: 1500, discountPct: 0, gstPct: 18 }],
      });

    const quotationId = qtnRes.body.data.id;
    await request(app)
      .patch(`/api/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'ACCEPTED' });

    const orderRes = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    const orderId = orderRes.body.data.id;

    // Confirm order (reserves 10 units)
    await request(app)
      .post(`/api/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`);

    const invAfterConfirm = await prisma.inventory.findUnique({
      where: { productId },
    });
    expect(invAfterConfirm!.reservedQuantity).toBe(orderQty);

    // 2. Cancel the CONFIRMED order
    const cancelRes = await request(app)
      .post(`/api/sales-orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');

    // 3. Verify reserved stock is released (decreased back to 0)
    const invAfterCancel = await prisma.inventory.findUnique({
      where: { productId },
    });
    expect(invAfterCancel!.physicalQuantity).toBe(50);
    expect(invAfterCancel!.reservedQuantity).toBe(0);
  });

  it('rejects cancellation of an already CANCELLED order with 409 Conflict', async () => {
    // Find any cancelled order
    const cancelledOrder = await prisma.salesOrder.findFirst({
      where: { status: 'CANCELLED' },
    });
    expect(cancelledOrder).not.toBeNull();

    const cancelRes = await request(app)
      .post(`/api/sales-orders/${cancelledOrder!.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(cancelRes.status).toBe(409);
    expect(cancelRes.body.error.message).toContain('already cancelled');
  });

  it('rejects cancellation of a DISPATCHED order with 400 Bad Request', async () => {
    // 1. Create, confirm, and dispatch an order
    const enqRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId,
        requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        items: [{ productId, quantity: 5 }],
      });

    const qtnRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId: enqRes.body.data.id,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [{ productId, quantity: 5, unitPrice: 1500, discountPct: 0, gstPct: 18 }],
      });

    const quotationId = qtnRes.body.data.id;
    await request(app)
      .patch(`/api/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'ACCEPTED' });

    const orderRes = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    const orderId = orderRes.body.data.id;

    await request(app)
      .post(`/api/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`);

    const dispatchRes = await request(app)
      .post('/api/dispatches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        salesOrderId: orderId,
        vehicleNumber: 'MH-12-TX-1111',
        driverName: 'Ramesh Patil',
      });
    expect(dispatchRes.status).toBe(201);

    // 2. Attempt to cancel dispatched order
    const cancelRes = await request(app)
      .post(`/api/sales-orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(cancelRes.status).toBe(400);
    expect(cancelRes.body.error.message).toContain('Cannot cancel an already dispatched Sales Order');
  });
});

