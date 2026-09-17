import { z } from 'zod';
import { QuotationStatus } from '@prisma/client';

// BUG-05 FIX: Database field precision limits
// - gstPct / discountPct: DECIMAL(5,2) → max 999.99, but business rule caps at 100%
// - unitPrice: DECIMAL(12,2) → max 9,999,999,999.99
// We apply the stricter of the two constraints.
const MAX_UNIT_PRICE = 9_999_999_999.99;

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
          // BUG-05 FIX: unitPrice — finite, non-negative, within DB DECIMAL(12,2) capacity
          unitPrice: z
            .number()
            .finite('Unit price must be a finite number')
            .nonnegative('Unit price must be non-negative')
            .max(MAX_UNIT_PRICE, `Unit price cannot exceed ₹${MAX_UNIT_PRICE.toLocaleString('en-IN')}`),
          discountPct: z
            .number()
            .finite('Discount % must be a finite number')
            .min(0, 'Discount % cannot be less than 0')
            .max(100, 'Discount % cannot exceed 100'),
          // BUG-05 FIX: gstPct — finite, bounded 0–100 (percentage semantics)
          gstPct: z
            .number()
            .finite('GST % must be a finite number')
            .min(0, 'GST % cannot be less than 0')
            .max(100, 'GST % cannot exceed 100'),
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
