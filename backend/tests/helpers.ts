import request from 'supertest';
import { createApp } from '../src/app';
import prisma from '../src/config/prisma';

export const app = createApp();

export async function getAuthTokens() {
  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@fundsroom.com', password: 'AdminPassword@123' });

  const salesRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'sales@fundsroom.com', password: 'SalesPassword@123' });

  return {
    adminToken: adminRes.body.data.token,
    adminUser: adminRes.body.data.user,
    salesToken: salesRes.body.data.token,
    salesUser: salesRes.body.data.user,
  };
}

export async function getTestCustomerAndProduct() {
  const customer = await prisma.customer.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  const product = await prisma.product.findFirst({
    where: { code: 'IND-VLV-001' },
    include: { inventory: true },
  });

  if (!customer || !product) {
    throw new Error('Test customer or product missing in database');
  }

  return { customer, product };
}
