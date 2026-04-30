-- 0033_role_granular.sql
-- Extend the Role enum to include the four granular internal roles defined
-- in Spec Section 4: SALES, PROJECT_MANAGER, FINANCE.
-- OWNER and ADMIN retain full access (supersets). MEMBER keeps read-only
-- access for areas they don't own.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SALES';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PROJECT_MANAGER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FINANCE';
