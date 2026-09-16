import request from 'supertest';
import { app, getAuthTokens, getTestCustomerAndProduct } from '../helpers';

describe('TEST 5: Role-Based Access Control (RBAC) Enforcement', () => {
  let salesToken: string;
  let adminToken: string;
  let orderId: string;

  beforeAll(async () => {
    const tokens = await getAuthTokens();
    adminToken = tokens.adminToken;
    salesToken = tokens.salesToken;

    const { customer, product } = await getTestCustomerAndProduct();

    // Create enquiry
    const enqRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId: customer.id,
        requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        items: [{ productId: product.id, quantity: 2 }],
      });

    // Create & Accept quotation
    const qtnRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId: enqRes.body.data.id,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [{ productId: product.id, quantity: 2, unitPrice: 4500, discountPct: 0, gstPct: 18 }],
      });

    const quotationId = qtnRes.body.data.id;
    await request(app)
      .patch(`/api/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'ACCEPTED' });

    // Convert to order
    const convertRes = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    orderId = convertRes.body.data.id;
  });

  it('forbids SALES_USER from confirming a sales order with 403 Forbidden', async () => {
    const res = await request(app)
      .post(`/api/sales-orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${salesToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Access denied');
  });

  it('forbids SALES_USER from dispatching an order with 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/dispatches')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        salesOrderId: orderId,
        vehicleNumber: 'MH-12-AB-1234',
        driverName: 'Ramesh Kumar',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Access denied');
  });

  it('rejects unauthenticated requests to protected endpoints with 401 Unauthorized', async () => {
    const res = await request(app).get('/api/sales-orders');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
