-- 0017_billing.sql
-- Phase 2: Money flow.
-- Adds Invoice, Payment, StripeWebhookEvent, CostBudget tables.
--
-- Apply via: psql $DIRECT_URL -f packages/db/migrations/0017_billing.sql
-- Or paste into the Supabase SQL editor.
--
-- Idempotent: safe to re-run.

begin;

-- -------------------------------------------------------------------------
-- Invoice
-- -------------------------------------------------------------------------
create table if not exists "Invoice" (
  id                    text primary key,
  "organizationId"      text not null,
  "dealId"              text,
  "projectId"           text,
  "stripeInvoiceId"     text,
  status                text not null default 'DRAFT',
  currency              text not null default 'USD',
  "subtotalCents"       integer not null default 0,
  "taxCents"            integer not null default 0,
  "totalCents"          integer not null default 0,
  "amountPaidCents"     integer not null default 0,
  "amountDueCents"      integer not null default 0,
  number                text,
  memo                  text,
  "lineItems"           jsonb not null default '[]',
  "dueAt"               timestamp(3),
  "sentAt"              timestamp(3),
  "paidAt"              timestamp(3),
  "voidedAt"            timestamp(3),
  "hostedUrl"           text,
  "pdfUrl"              text,
  metadata              jsonb,
  "createdById"         text,
  "createdAt"           timestamp(3) not null default now(),
  "updatedAt"           timestamp(3) not null default now()
);

create unique index if not exists "Invoice_stripe_invoice_id_key"
  on "Invoice"("stripeInvoiceId");
create unique index if not exists "Invoice_number_key"
  on "Invoice"(number);
create index if not exists "Invoice_org_status_idx"
  on "Invoice"("organizationId", status, "createdAt");
create index if not exists "Invoice_org_deal_idx"
  on "Invoice"("organizationId", "dealId");
create index if not exists "Invoice_org_project_idx"
  on "Invoice"("organizationId", "projectId");

alter table "Invoice"
  drop constraint if exists invoice_org_fk,
  add  constraint invoice_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "Invoice"
  drop constraint if exists invoice_deal_fk,
  add  constraint invoice_deal_fk
    foreign key ("dealId") references "Deal"(id) on delete set null;

alter table "Invoice"
  drop constraint if exists invoice_project_fk,
  add  constraint invoice_project_fk
    foreign key ("projectId") references "Project"(id) on delete set null;

alter table "Invoice" enable row level security;
drop policy if exists tenant_isolation on public."Invoice";
create policy tenant_isolation on public."Invoice"
  using ("organizationId" = public.current_org())
  with check ("organizationId" = public.current_org());

-- -------------------------------------------------------------------------
-- Payment
-- -------------------------------------------------------------------------
create table if not exists "Payment" (
  id                        text primary key,
  "organizationId"          text not null,
  "invoiceId"               text not null,
  "stripePaymentIntentId"   text,
  "stripeChargeId"          text,
  status                    text not null default 'PENDING',
  currency                  text not null default 'USD',
  "amountCents"             integer not null,
  "failureCode"             text,
  "failureMessage"          text,
  "refundedCents"           integer not null default 0,
  "paidAt"                  timestamp(3),
  "refundedAt"              timestamp(3),
  metadata                  jsonb,
  "createdAt"               timestamp(3) not null default now(),
  "updatedAt"               timestamp(3) not null default now()
);

create unique index if not exists "Payment_stripe_pi_key"
  on "Payment"("stripePaymentIntentId");
create index if not exists "Payment_org_invoice_idx"
  on "Payment"("organizationId", "invoiceId");
create index if not exists "Payment_org_status_idx"
  on "Payment"("organizationId", status, "createdAt");

alter table "Payment"
  drop constraint if exists payment_org_fk,
  add  constraint payment_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "Payment"
  drop constraint if exists payment_invoice_fk,
  add  constraint payment_invoice_fk
    foreign key ("invoiceId") references "Invoice"(id) on delete cascade;

alter table "Payment" enable row level security;
drop policy if exists tenant_isolation on public."Payment";
create policy tenant_isolation on public."Payment"
  using ("organizationId" = public.current_org())
  with check ("organizationId" = public.current_org());

-- -------------------------------------------------------------------------
-- StripeWebhookEvent  (global — no RLS needed)
-- -------------------------------------------------------------------------
create table if not exists "StripeWebhookEvent" (
  id            text primary key,
  type          text not null,
  "processedAt" timestamp(3) not null default now()
);

create index if not exists "StripeWebhookEvent_processed_idx"
  on "StripeWebhookEvent"("processedAt");

-- -------------------------------------------------------------------------
-- CostBudget
-- -------------------------------------------------------------------------
create table if not exists "CostBudget" (
  id                       text primary key,
  "organizationId"         text not null,
  "aiMonthlyLimitCents"    integer,
  "emailMonthlyLimit"      integer,
  "enrichMonthlyLimit"     integer,
  "hardLimitReached"       boolean not null default false,
  "createdAt"              timestamp(3) not null default now(),
  "updatedAt"              timestamp(3) not null default now()
);

create unique index if not exists "CostBudget_org_key"
  on "CostBudget"("organizationId");

alter table "CostBudget"
  drop constraint if exists cost_budget_org_fk,
  add  constraint cost_budget_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "CostBudget" enable row level security;
drop policy if exists tenant_isolation on public."CostBudget";
create policy tenant_isolation on public."CostBudget"
  using ("organizationId" = public.current_org())
  with check ("organizationId" = public.current_org());

commit;
