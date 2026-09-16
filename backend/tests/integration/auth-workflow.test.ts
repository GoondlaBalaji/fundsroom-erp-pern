import request from 'supertest';
import { app } from '../helpers';

describe('TEST 6: Authentication & Profile Security', () => {
  it('authenticates ADMIN and SALES_USER successfully with valid credentials', async () => {
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@fundsroom.com', password: 'AdminPassword@123' });

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);
    expect(adminRes.body.data.token).toBeDefined();
    expect(adminRes.body.data.user.role).toBe('ADMIN');

    const salesRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'sales@fundsroom.com', password: 'SalesPassword@123' });

    expect(salesRes.status).toBe(200);
    expect(salesRes.body.success).toBe(true);
    expect(salesRes.body.data.token).toBeDefined();
    expect(salesRes.body.data.user.role).toBe('SALES_USER');
  });

  it('rejects login with incorrect password with 401 Unauthorized', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@fundsroom.com', password: 'WrongPassword@999' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Invalid email or password');
  });

  it('rejects login with non-existent email with 401 Unauthorized', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent_user@fundsroom.com', password: 'AnyPassword@123' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Invalid email or password');
  });

  it('rejects malformed email format with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'Password@123' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Validation failed');
  });

  it('retrieves user profile via GET /api/auth/me with valid Bearer token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@fundsroom.com', password: 'AdminPassword@123' });

    const token = loginRes.body.data.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.email).toBe('admin@fundsroom.com');
    expect(meRes.body.data.role).toBe('ADMIN');
  });

  it('rejects GET /api/auth/me with invalid or forged token with 401 Unauthorized', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer forged_token_invalid_signature');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Invalid or expired authentication token');
  });
});
