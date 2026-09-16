import { z } from 'zod';
import { EnquiryStatus } from '@prisma/client';

export const createEnquirySchema = z.object({
  body: z.object({
    customerId: z.string().min(1, 'Customer is required'),
    requiredDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Valid required date is required',
    }),
    notes: z.string().optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1, 'Product is required'),
          quantity: z.number().int().positive('Quantity must be a positive whole number'),
        })
      )
      .min(1, 'At least one product item is required'),
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
