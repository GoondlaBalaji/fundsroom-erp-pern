import { z } from 'zod';

export const createCustomerSchema = z.object({
  body: z.object({
    // BUG-09 FIX: .trim() collapses whitespace-only strings to "" which then
    // fails .min(2), ensuring values like "   " are rejected at the boundary.
    companyName: z
      .string()
      .trim()
      .min(2, 'Company name must be at least 2 characters'),
    contactPerson: z
      .string()
      .trim()
      .min(2, 'Contact person must be at least 2 characters'),
    // BUG-09 + BUG-10 FIX: trim whitespace-only values, then enforce a
    // numeric regex that accepts Indian mobile formats (+91 9876543210,
    // 9876543210) while rejecting alphabetic or arbitrary special-character strings.
    mobile: z
      .string()
      .trim()
      .min(10, 'Valid contact mobile is required')
      .regex(
        /^\+?[\d\s-]{10,}$/,
        'Mobile must contain only digits, spaces, or hyphens (e.g. +91 9876543210)'
      ),
    email: z.string().email('Valid email address is required'),
    // BUG-09 FIX: trim before validating city
    city: z
      .string()
      .trim()
      .min(2, 'City is required'),
  }),
});
