-- Phase 2B-1: Idempotency Infrastructure
-- Adds the idempotency_keys table with composite uniqueness, FK to users, and expiresAt index.

CREATE TYPE "IdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "idempotency_keys" (
  "id"             TEXT                NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "key"            TEXT                NOT NULL,
  "userId"         TEXT                NOT NULL,
  "method"         TEXT                NOT NULL,
  "path"           TEXT                NOT NULL,
  "payloadHash"    TEXT                NOT NULL,
  "status"         "IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
  "responseStatus" INTEGER,
  "responseBody"   TEXT,
  "createdAt"      TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"      TIMESTAMP(3)        NOT NULL,
  CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "idempotency_keys_unique" UNIQUE ("key", "userId", "method", "path"),
  CONSTRAINT "idempotency_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys" ("expiresAt");