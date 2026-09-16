import request from 'supertest';
import { app, getAuthTokens, getTestCustomerAndProduct } from '../helpers';
import prisma from '../../src/config/prisma';

describe('TEST 1: Quotation Calculation & Tampering Prevention', () => {
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

    // Create enquiry
    const enqRes = await request(app)
      .post('/api/enquiries')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        customerId,
        requiredDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        notes: 'Calculation test enquiry',
        items: [{ productId, quantity: 10 }],
      });

    enquiryId = enqRes.body.data.id;
  });

  it('correctly calculates base amount, discount, GST, and grand total on the backend', async () => {
    // Quantity: 10, Unit Price: 4500
    // Base: 10 * 4500 = 45,000
    // Discount 10%: 4,500 -> Net: 40,500
    // GST 18%: 40,500 * 0.18 = 7,290
    // Line Amount: 40,500 + 7,290 = 47,790
    const res = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [
          {
            productId,
            quantity: 10,
            unitPrice: 4500,
            discountPct: 10,
            gstPct: 18,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const quotation = res.body.data;
    expect(Number(quotation.subtotal)).toBe(45000);
    expect(Number(quotation.totalDiscount)).toBe(4500);
    expect(Number(quotation.totalGst)).toBe(7290);
    expect(Number(quotation.grandTotal)).toBe(47790);

    const item = quotation.items[0];
    expect(Number(item.baseAmount)).toBe(45000);
    expect(Number(item.discountAmount)).toBe(4500);
    expect(Number(item.netAmount)).toBe(40500);
    expect(Number(item.gstAmount)).toBe(7290);
    expect(Number(item.lineAmount)).toBe(47790);
  });

  it('rejects tampered client total that does not match authoritative calculation', async () => {
    const res = await request(app)
      .post('/api/quotations')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        enquiryId,
        validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
        clientGrandTotal: 1000, // Tampered fake amount (actual is ~47,790)
        items: [
          {
            productId,
            quantity: 10,
            unitPrice: 4500,
            discountPct: 10,
            gstPct: 18,
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Quotation total discrepancy detected');
  });
});
