# Crawlix → Autonomous Revenue OS

**Vision:** A fully automated AI-powered SaaS that runs the entire client lifecycle: discover → qualify → analyze → propose → outreach → close → deliver → invoice → support → report. Minimal human-in-the-loop.

**Status:** Phase 0 complete. Lead-discovery and qualification engine running on Next.js + BullMQ + Supabase + Upstash.

---

## 1. Architectural principles

| Principle                   | Implementation                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-tenant by default** | Every new table carries `organizationId` + Postgres RLS policy (extend `packages/db/migrations/0001_rls.sql`).                                     |
| **Event-driven core**       | Domain events on BullMQ topics; pipelines are pure consumers. New queue: `domain-events`.                                                          |
| **LLM provider router**     | `packages/ai/src/router.ts` — picks OpenAI vs Anthropic per task (cost, latency, capability). All prompts versioned in `packages/ai/prompts/*.md`. |
| **Idempotent jobs**         | Every job has a deterministic `dedupeKey`; BullMQ `jobId` derived from it.                                                                         |
| **Observability first**     | Pino → Better Stack/Datadog; OpenTelemetry traces; Sentry for errors; per-tenant cost meters.                                                      |
| **Compliance baked in**     | Audit log on every mutation; soft-delete + RLS; DSAR export endpoint; consent records.                                                             |
| **Cost guardrails**         | Per-org token/credit budgets enforced at AI router + queue producer.                                                                               |

---

## 2. Domain model additions

New Prisma models (incremental migrations under `packages/db/prisma/migrations`):

```
Deal           — opportunity tied to a Lead, has Stage + amount + probability
Pipeline       — ordered stages per organization
Stage          — Discovery / Proposal / Negotiation / Won / Lost (configurable)
Activity       — call/email/note/task tied to Lead or Deal, append-only
Sequence       — outreach cadence template (steps, delays, channels)
SequenceRun    — instance of a sequence executing against a Lead
Message        — outbound/inbound email/linkedin (threadable)
Proposal       — generated artifact (HTML/PDF), versioned, status, e-sign state
Project        — created on Deal=Won; has Milestones + Tasks + Files
Milestone      — billable checkpoint
TaskItem       — unit of work (renamed to avoid Prisma `Task` collision)
Invoice        — one-off or subscription-derived; line items
Payment        — Stripe charge/payment-intent record
Subscription   — mirrors Stripe subscription state
SupportTicket  — inbound support thread
SupportMessage — agent or AI replies
KnowledgeDoc   — source for support RAG (with embedding column via pgvector)
AuditLog       — who/what/when on every sensitive mutation
ConsentRecord  — ToS/Privacy/Marketing acceptance per user
ApiKey         — per-org programmatic access
UsageEvent     — meter for billing (leads enriched, AI tokens, emails sent)
CostBudget     — per-org limits for AI/email/enrichment
```

---

## 3. Service & package layout

```
apps/
  web/                 # Next.js 14 — dashboard + public marketing + API routes
  worker/              # BullMQ workers (existing)
  inbox/               # NEW: webhook receiver for email replies (Resend/SES inbound)
packages/
  db/                  # Prisma schema + RLS migrations (existing)
  shared/              # Types, queue/job names, zod schemas (existing)
  providers/           # Lead-source providers (existing)
  scoring/             # Lead scoring (existing)
  ai/                  # NEW: LLM router, prompts, embeddings, RAG, cost meter
  outreach/            # NEW: email/linkedin senders, deliverability helpers
  billing/             # NEW: Stripe wrappers, invoice PDF, dunning
  compliance/          # NEW: GDPR/CCPA, DSAR, audit logger
  reporting/           # NEW: report generators, narrative AI summaries
  support/             # NEW: ticket router, RAG-backed AI responder
```

---

## 4. Phased roadmap

Each phase ends with a demo-ready milestone. Items are sized S/M/L.

### Phase 1 — Close the loop (Lead → Won Deal)

| #   | Item                                                                                                    | Size | Notes                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| 1.1 | `packages/ai` skeleton: provider router (OpenAI + Anthropic), prompt loader, token meter, retry/backoff | M    | Router decides by `taskKind`; prompts stored as `.md` with frontmatter (model, temp, maxTokens).             |
| 1.2 | `Deal`, `Pipeline`, `Stage`, `Activity` Prisma models + RLS                                             | M    | Seed default pipeline per new org.                                                                           |
| 1.3 | CRM Kanban UI under `apps/web/src/app/(app)/pipeline`                                                   | M    | drag-drop with `@dnd-kit`; activity timeline drawer.                                                         |
| 1.4 | Proposal generator pipeline `apps/worker/src/pipelines/generate-proposal.ts`                            | L    | Inputs: Lead + Intel + Org branding → AI draft → HTML → PDF (Playwright). Versioned `Proposal` rows.         |
| 1.5 | `packages/outreach` — Resend integration, template engine, unsubscribe + tracking pixel                 | M    | Multi-provider behind interface (Resend/SendGrid/SES).                                                       |
| 1.6 | `Sequence` + `SequenceRun` + worker `outreach-sequence.ts`                                              | L    | Steps with delays, conditional branches on open/reply, quiet hours, timezone-aware.                          |
| 1.7 | `apps/inbox` reply receiver                                                                             | M    | Resend inbound webhook → match by `Message-ID` thread → create inbound `Message` → fire `LeadReplied` event. |
| 1.8 | Reply classifier (interested / not / OOO / question) via AI router                                      | S    | Auto-advances `Deal.stage`.                                                                                  |

**Exit criteria:** A new lead is auto-discovered, scored, given a personalized proposal, and put through a 5-touch email cadence; a reply auto-moves it on the Kanban board.

---

### Phase 2 — Money flow

| #   | Item                                                                                                            | Size |
| --- | --------------------------------------------------------------------------------------------------------------- | ---- |
| 2.1 | `packages/billing` Stripe wrapper: customers, subscriptions, prices, portal                                     | M    |
| 2.2 | Stripe webhook handler `apps/web/src/app/api/v1/billing/webhook/route.ts` (signature verify, idempotency table) | M    |
| 2.3 | Subscription model sync + entitlement check middleware                                                          | M    |
| 2.4 | `Invoice` + `Payment` models, manual invoice creation UI for one-off project work                               | M    |
| 2.5 | Invoice PDF (server-side render) + hosted payment link                                                          | S    |
| 2.6 | Dunning worker: retry failed charges, escalate emails, downgrade after grace period                             | M    |
| 2.7 | Usage metering: emit `UsageEvent` on every billable action; nightly aggregation; Stripe metered billing         | L    |
| 2.8 | Per-org `CostBudget` enforcement at AI router + queue producer                                                  | M    |

**Exit criteria:** Customers self-serve sign-up, pay subscription, see invoices, get auto-dunned. Per-tenant cost ceilings prevent runaway AI spend.

---

### Phase 3 — Delivery & client portal

| #   | Item                                                                            | Size |
| --- | ------------------------------------------------------------------------------- | ---- |
| 3.1 | `Project` + `Milestone` + `TaskItem` models, auto-created on `Deal.stage = Won` | M    |
| 3.2 | Project workspace UI (kanban tasks, files, comments)                            | L    |
| 3.3 | Client portal subdomain/route — magic-link login (no Clerk seat needed)         | L    |
| 3.4 | Milestone-triggered invoicing                                                   | S    |
| 3.5 | File storage on Supabase Storage with signed URLs + virus scan hook             | M    |

---

### Phase 4 — Intelligence layer

| #   | Item                                                                                                      | Size |
| --- | --------------------------------------------------------------------------------------------------------- | ---- |
| 4.1 | `packages/reporting` — weekly digest emails (pipeline movement, conversion, top blockers) generated by AI | M    |
| 4.2 | Forecasting: Monte-Carlo on weighted pipeline; conversion-velocity charts                                 | M    |
| 4.3 | Anomaly detection: churn-risk score, dead-pipeline flag, cost-spike alerts                                | M    |
| 4.4 | `packages/support` — ticket inbox, RAG over `KnowledgeDoc` with pgvector embeddings                       | L    |
| 4.5 | AI customer support agent with confidence scoring + human-handoff threshold                               | L    |
| 4.6 | In-app NL search across leads/deals/projects (function-calling agent)                                     | M    |

---

### Phase 5 — Compliance, scale, ops

| #   | Item                                                                              | Size |
| --- | --------------------------------------------------------------------------------- | ---- |
| 5.1 | Audit log on all mutations (Prisma middleware)                                    | M    |
| 5.2 | GDPR/CCPA: data export endpoint, right-to-delete worker, consent log              | M    |
| 5.3 | Email deliverability: SPF/DKIM/DMARC, warm-up plan, suppression list              | M    |
| 5.4 | Per-tenant rate limiting (Upstash Ratelimit) on API + AI calls                    | S    |
| 5.5 | Observability: OpenTelemetry traces (worker + web), Sentry, Better Stack logs     | M    |
| 5.6 | DR: nightly logical backup of Supabase, restore runbook                           | S    |
| 5.7 | SOC2-lite: access reviews, secrets in Doppler/Infisical, IP allowlist for prod DB | L    |
| 5.8 | Public REST API + API keys + Webhooks for customers                               | L    |

---

## 5. AI router design (`packages/ai`)

```
ai.complete({
  taskKind: 'proposal.draft' | 'reply.classify' | 'report.weekly' | 'support.answer' | ...,
  input,
  orgId,                     // for cost meter + budget check
  model?: override,
})
```

- Prompts in `packages/ai/prompts/<taskKind>.md` with YAML frontmatter:
  ```yaml
  ---
  defaultProvider: openai
  defaultModel: gpt-4o-mini
  fallbacks: [anthropic:claude-3-5-haiku]
  temperature: 0.3
  maxTokens: 1200
  costCeilingUsd: 0.05
  ---
  ```
- Fallback on rate-limit / 5xx; structured-output mode (zod schema) wherever possible.
- Token usage written to `UsageEvent` (kind=`ai.tokens`).

---

## 6. Event catalog (BullMQ)

| Event                  | Producer          | Consumers                                 |
| ---------------------- | ----------------- | ----------------------------------------- |
| `LeadDiscovered`       | search-ingest     | scoring, enrichment                       |
| `LeadQualified`        | scoring           | proposal generator (if score ≥ threshold) |
| `ProposalReady`        | generate-proposal | outreach sequence start                   |
| `MessageSent`          | outreach          | activity log, usage meter                 |
| `MessageReceived`      | inbox webhook     | reply classifier                          |
| `DealStageChanged`     | crm               | reporting, automation rules               |
| `DealWon`              | crm               | project auto-create, invoice              |
| `InvoicePaid`          | stripe webhook    | activity log, project unlock              |
| `SubscriptionCanceled` | stripe webhook    | offboarding worker                        |
| `TicketOpened`         | support           | AI responder                              |
| `BudgetExceeded`       | cost-meter        | throttle producer, alert org admin        |

---

## 7. Security & compliance checklist (per phase)

- [ ] All new Prisma models include `organizationId` + RLS policy migration
- [ ] All new API routes call `requireOrgMember()` + `requirePlan()` middleware
- [ ] All AI prompts strip PII before sending unless `taskKind` allowlists it
- [ ] All outbound emails honor suppression list + include unsubscribe link
- [ ] Stripe webhook verifies signature + replays via idempotency table
- [ ] Secrets only via env or Doppler — never committed
- [ ] DSAR export covers every new table

---

## 8. Open decisions

1. **Hosting for worker** — Render starter (current `render.yaml`) is fine to start, but Phase 4 RAG + Phase 1 Playwright PDF will need more memory. Plan to upgrade to Render `standard` or move worker to Fly.io.
2. **PDF rendering** — reuse worker's Playwright vs. dedicated `@sparticuz/chromium` on a serverless function? Recommend reusing worker.
3. **Vector store** — pgvector on Supabase (simpler, one DB) vs. dedicated (Pinecone/Qdrant). Recommend pgvector for Phase 4 start; revisit at scale.
4. **E-signature on proposals** — DocuSign vs. simple typed-name + IP log MVP. Recommend MVP first.
5. **Client-portal auth** — Clerk org-invites (paid seat per client) vs. magic-link only for clients (free). Recommend magic-link.

---

## 9. First sprint (2 weeks) — concrete tickets

If we commit to Phase 1, the first sprint should ship:

1. `packages/ai` skeleton with router + 1 working prompt (`proposal.draft`)
2. `Deal`/`Pipeline`/`Stage`/`Activity` migrations + seed
3. Pipeline Kanban page (read-only first)
4. `generate-proposal` worker pipeline producing HTML proposal stored on Supabase Storage
5. Trigger button in Lead detail page → enqueue proposal job → preview link
6. Activity timeline on Lead detail

This proves the AI loop end-to-end before investing in outreach automation.
