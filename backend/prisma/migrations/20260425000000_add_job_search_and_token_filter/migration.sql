-- Migration: Add paymentToken field, composite index on (status, createdAt),
-- and a PostgreSQL GIN index for full-text search on Job title + description.
-- Issue #329: Add full-text search and filter to job listing API

-- 1. Add paymentToken column (nullable, e.g. "XLM", "USDC")
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "paymentToken" TEXT;

-- 2. Index on paymentToken for fast token-based filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Job_paymentToken_idx"
  ON "Job" ("paymentToken");

-- 3. Composite index on (status, createdAt DESC) for default sort + status filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Job_status_createdAt_idx"
  ON "Job" ("status", "createdAt" DESC);

-- 4. GIN index for full-text search on title + description
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Job_fts_idx"
  ON "Job"
  USING GIN (to_tsvector('english', "title" || ' ' || "description"));