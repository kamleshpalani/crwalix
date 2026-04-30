-- §9.3 — Add WEBSITE_REPORT value to the EnrichmentKind enum.
-- ALTER TYPE ... ADD VALUE must run outside a transaction block.

ALTER TYPE "EnrichmentKind" ADD VALUE IF NOT EXISTS 'WEBSITE_REPORT';
