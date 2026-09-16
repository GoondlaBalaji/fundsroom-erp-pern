import { z } from 'zod';
import { QuotationStatus } from '@prisma/client';

export const createQuotationSchema = z.object({
  body: z.object({
    enquiryId: z.string().min(1, 'Enquiry ID is required'),
    validUntil: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Valid expiration date is required',
    }),
    clientGrandTotal: z.number().optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1, 'Product ID is required'),
          quantity: z.number().int().positive('Quantity must be greater than zero'),
          unitPrice: z.number().nonnegative('Unit price must be non-negative'),
          discountPct: z
            .number()
            .min(0, 'Discount % cannot be less than 0')
            .max(100, 'Discount % cannot exceed 100'),
          gstPct: z.number().min(0, 'GST % cannot be less than 0'),
        })
      )
      .min(1, 'At least one quotation item is required'),
  }),
});

export const updateQuotationStatusSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Quotation ID is required'),
  }),
  body: z.object({
    status: z.nativeEnum(QuotationStatus, {
      errorMap: () => ({ message: 'Invalid quotation status. Allowed: DRAFT, SENT, ACCEPTED, REJECTED' }),
    }),
  }),
});
