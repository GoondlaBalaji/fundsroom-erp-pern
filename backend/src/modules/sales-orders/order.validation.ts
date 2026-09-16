import { z } from 'zod';

export const confirmOrderSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Order ID is required'),
  }),
});

export const cancelOrderSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Order ID is required'),
  }),
  body: z
    .object({
      reason: z.string().optional(),
    })
    .optional(),
});
