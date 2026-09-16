import { z } from 'zod';

export const createCustomerSchema = z.object({
  body: z.object({
    companyName: z.string().min(2, 'Company name must be at least 2 characters'),
    contactPerson: z.string().min(2, 'Contact person must be at least 2 characters'),
    mobile: z.string().min(10, 'Valid contact mobile is required'),
    email: z.string().email('Valid email address is required'),
    city: z.string().min(2, 'City is required'),
  }),
});
