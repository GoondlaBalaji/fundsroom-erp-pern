import { z } from 'zod';

export const createDispatchSchema = z.object({
  body: z.object({
    salesOrderId: z.string().min(1, 'Sales Order ID is required'),
    vehicleNumber: z.string().min(2, 'Vehicle number is required'),
    driverName: z.string().min(2, 'Driver name is required'),
  }),
});
