-- Migration: 0038_priority_tier_5_state
-- §10.1 — Extend PriorityTier enum to 5 tiers
--
-- NOTE: PostgreSQL ALTER TYPE ... ADD VALUE cannot run inside a transaction.
-- Run this migration outside a transaction block or with autocommit enabled.
-- Most migration tools (Flyway, goose, raw psql) support this natively.
-- If using Prisma Migrate, this file is a custom SQL migration.

ALTER TYPE "PriorityTier" ADD VALUE IF NOT EXISTS 'CRITICAL';
ALTER TYPE "PriorityTier" ADD VALUE IF NOT EXISTS 'NOT_RECOMMENDED';
