import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  JWT_SECRET: process.env.JWT_SECRET || 'fundsroom_fallback_jwt_secret_key_2026',
  DATABASE_URL: process.env.DATABASE_URL || '',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  NODE_ENV: process.env.NODE_ENV || 'development',
  // Idempotency TTL in hours.
  // Controls how long an idempotency key remains valid for response replay.
  // After this window the key is treated as expired and will not replay.
  // Default: 24 hours. Set via IDEMPOTENCY_TTL_HOURS in .env.
  IDEMPOTENCY_TTL_HOURS: process.env.IDEMPOTENCY_TTL_HOURS
    ? parseInt(process.env.IDEMPOTENCY_TTL_HOURS, 10)
    : 24,
};
