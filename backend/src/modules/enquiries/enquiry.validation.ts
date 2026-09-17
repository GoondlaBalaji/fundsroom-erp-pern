import { z } from 'zod';
import { EnquiryStatus } from '@prisma/client';

export const createEnquirySchema = z.object({
  body: z.object({
    customerId: z.string().min(1, 'Customer is required'),
    requiredDate: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), {
        message: 'Valid required date is required',
      })
      // BUG-11 FIX: Reject dates in the past. Compare calendar dates as
      // YYYY-MM-DD strings (lexicographic order is correct for ISO dates).
      // We slice to 10 chars so both datetime strings and date-only strings
      // work correctly. Comparison is done in UTC to match the server clock.
      .refine(
        (val) => val.slice(0, 10) >= new Date().toISOString().slice(0, 10),
        { message: 'Required date cannot be in the past' }
      ),
    notes: z.string().optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1, 'Product is required'),
          quantity: z.number().int().positive('Quantity must be a positive whole number'),
        })
      )
      .min(1, 'At least one product item is required')
      // BUG-07 FIX: Reject duplicate product IDs at the validation boundary
      .superRefine((items, ctx) => {
        const seen = new Set<string>();
        for (const item of items) {
          if (seen.has(item.productId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Duplicate products in enquiry line items are not allowed',
            });
            return;
          }
          seen.add(item.productId);
        }
      }),
  }),
});

export const updateEnquiryStatusSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Enquiry ID is required'),
  }),
  body: z.object({
    status: z.nativeEnum(EnquiryStatus, {
      errorMap: () => ({ message: 'Invalid enquiry status. Allowed: NEW, QUOTED, WON, LOST' }),
    }),
  }),
});
