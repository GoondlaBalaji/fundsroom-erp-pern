import request from 'supertest';
import { app, getAuthTokens, getTestCustomerAndProduct } from '../helpers';

describe('TEST 2: Quotation Status Rules for Sales Order Conversion', () => {
  let salesToken: string;
  let customerId: string;
  let productId: string;
  let enquiryId: string;

  beforeAll(async () => {
    const tokens = await getAuthTokens();
    salesToken = tokens.salesToken;

    const data = await getTestCustomerAndProduct();
    customerId = data.customer.id;
    productId = data.product.id;

    const enqRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId,
        requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        items: [{ productId, quantity: 5 }],
      });

    enquiryId = enqRes.body.data.id;
  });

  it('prevents conversion of DRAFT quotation to Sales Order', async () => {
    // 1. Create a quotation (default status: DRAFT)
    const qtnRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [{ productId, quantity: 5, unitPrice: 4500, discountPct: 0, gstPct: 18 }],
      });

    const quotationId = qtnRes.body.data.id;

    // 2. Attempt to convert DRAFT quotation
    const convertRes = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    expect(convertRes.status).toBe(400);
    expect(convertRes.body.success).toBe(false);
    expect(convertRes.body.error.message).toContain('Quotation must be in ACCEPTED status');
  });

  it('prevents conversion of REJECTED quotation to Sales Order', async () => {
    // 1. Create a quotation and reject it
    const qtnRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [{ productId, quantity: 5, unitPrice: 4500, discountPct: 0, gstPct: 18 }],
      });

    const quotationId = qtnRes.body.data.id;

    await request(app)
      .patch(`/api/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'REJECTED' });

    // 2. Attempt to convert REJECTED quotation
    const convertRes = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    expect(convertRes.status).toBe(400);
    expect(convertRes.body.success).toBe(false);
    expect(convertRes.body.error.message).toContain('Quotation must be in ACCEPTED status');
  });

  it('allows conversion when quotation is in ACCEPTED status', async () => {
    // 1. Create quotation and mark ACCEPTED
    const qtnRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [{ productId, quantity: 5, unitPrice: 4500, discountPct: 5, gstPct: 18 }],
      });

    const quotationId = qtnRes.body.data.id;

    await request(app)
      .patch(`/api/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'ACCEPTED' });

    // 2. Convert ACCEPTED quotation
    const convertRes = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    expect(convertRes.status).toBe(201);
    expect(convertRes.body.success).toBe(true);
    expect(convertRes.body.data.status).toBe('PENDING');
    expect(convertRes.body.data.orderNumber).toMatch(/^SO-\d{8}-\d{4}$/);
  });
});
