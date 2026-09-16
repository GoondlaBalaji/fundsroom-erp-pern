import request from 'supertest';
import { app, getAuthTokens, getTestCustomerAndProduct } from '../helpers';

describe('TEST 3: Duplicate Sales Order Prevention', () => {
  let salesToken: string;
  let customerId: string;
  let productId: string;
  let quotationId: string;

  beforeAll(async () => {
    const tokens = await getAuthTokens();
    salesToken = tokens.salesToken;

    const data = await getTestCustomerAndProduct();
    customerId = data.customer.id;
    productId = data.product.id;

    // 1. Create Enquiry
    const enqRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId,
        requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        items: [{ productId, quantity: 4 }],
      });

    // 2. Create Quotation and mark ACCEPTED
    const qtnRes = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId: enqRes.body.data.id,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [{ productId, quantity: 4, unitPrice: 4500, discountPct: 0, gstPct: 18 }],
      });

    quotationId = qtnRes.body.data.id;

    await request(app)
      .patch(`/api/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'ACCEPTED' });
  });

  it('allows the first conversion to create a Sales Order', async () => {
    const res = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.quotationId).toBe(quotationId);
  });

  it('rejects subsequent conversion attempts for the same quotation with 409 Conflict', async () => {
    const res = await request(app)
      .post(`/api/quotations/${quotationId}/convert`)
      .set('Authorization', `Bearer ${salesToken}`);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('already been generated');
  });
});
