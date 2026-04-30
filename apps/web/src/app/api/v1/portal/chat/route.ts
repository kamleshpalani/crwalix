/**
 * POST /api/v1/portal/chat
 *
 * Client-facing AI assistant scoped to a single portal session. Answers
 * questions about the client's project, proposals, invoices, milestones,
 * and packages — never about other tenants. Uses a system prompt that
 * forbids tool calls, browsing, or off-topic answers.
 *
 * Auth: portal session cookie (signed HMAC, see portal.service).
 * Rate-limit: 20 messages per session per hour (in-memory; replace with
 * Redis when portal traffic warrants it).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { aiComplete } from "@crawlix/ai";
import { withOrg } from "@crawlix/db";
import {
  PORTAL_COOKIE_NAME,
  decodePortalSession,
} from "@/server/services/portal.service";

const BodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(10)
    .optional(),
});

// Naive in-process rate limit. Resets on cold start; that's fine for v1.
const RATE = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 20;

function rateLimit(key: string): boolean {
  const now = Date.now();
  const cur = RATE.get(key);
  if (!cur || cur.resetAt < now) {
    RATE.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (cur.count >= MAX_PER_WINDOW) return false;
  cur.count += 1;
  return true;
}

interface PortalContext {
  projectName: string;
  projectStatus: string;
  milestones: Array<{ title: string; status: string; dueAt: string | null }>;
  invoices: Array<{
    number: string | null;
    status: string;
    totalCents: number;
    currency: string;
    dueAt: string | null;
  }>;
  proposals: Array<{
    version: number;
    status: string;
    sentAt: string | null;
  }>;
}

async function loadContext(
  orgId: string,
  projectId: string,
): Promise<PortalContext | null> {
  return withOrg(orgId, async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      select: { id: true, name: true, status: true, dealId: true },
    });
    if (!project) return null;

    const [milestones, invoices, proposals] = await Promise.all([
      tx.milestone.findMany({
        where: { organizationId: orgId, projectId },
        orderBy: { position: "asc" },
        take: 10,
        select: { title: true, status: true, dueAt: true },
      }),
      tx.invoice.findMany({
        where: { organizationId: orgId, projectId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          number: true,
          status: true,
          totalCents: true,
          currency: true,
          dueAt: true,
        },
      }),
      project.dealId
        ? tx.proposal.findMany({
            where: { organizationId: orgId, dealId: project.dealId },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { version: true, status: true, sentAt: true },
          })
        : Promise.resolve(
            [] as Array<{
              version: number;
              status: string;
              sentAt: Date | null;
            }>,
          ),
    ]);

    return {
      projectName: project.name,
      projectStatus: project.status,
      milestones: milestones.map((m) => ({
        title: m.title,
        status: m.status,
        dueAt: m.dueAt ? m.dueAt.toISOString().slice(0, 10) : null,
      })),
      invoices: invoices.map((i) => ({
        number: i.number,
        status: i.status,
        totalCents: i.totalCents,
        currency: i.currency,
        dueAt: i.dueAt ? i.dueAt.toISOString().slice(0, 10) : null,
      })),
      proposals: proposals.map((p) => ({
        version: p.version,
        status: p.status,
        sentAt: p.sentAt ? p.sentAt.toISOString().slice(0, 10) : null,
      })),
    };
  });
}

function buildSystem(ctx: PortalContext): string {
  const lines = [
    "You are the project assistant for a client portal. You answer ONLY questions about the client's own project, milestones, invoices, and proposals listed below.",
    "Never reveal information about other clients, internal pricing, or anything not in the data block.",
    "If asked something outside scope, politely redirect the client to email their project manager.",
    "Keep replies under 120 words, plain prose, no markdown headings.",
    "",
    "PROJECT DATA:",
    `Project: ${ctx.projectName} (${ctx.projectStatus})`,
    "Milestones:",
    ...ctx.milestones.map(
      (m) => `  - ${m.title} [${m.status}]${m.dueAt ? ` due ${m.dueAt}` : ""}`,
    ),
    "Invoices:",
    ...ctx.invoices.map(
      (i) =>
        `  - ${i.number ?? "(no #)"} ${i.status} ${(i.totalCents / 100).toFixed(2)} ${i.currency}${i.dueAt ? ` due ${i.dueAt}` : ""}`,
    ),
    "Proposals:",
    ...ctx.proposals.map(
      (p) =>
        `  - v${p.version} [${p.status}]${p.sentAt ? ` sent ${p.sentAt}` : ""}`,
    ),
  ];
  return lines.join("\n");
}

export async function POST(req: Request) {
  const cookie = cookies().get(PORTAL_COOKIE_NAME)?.value;
  const session = decodePortalSession(cookie);
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED" } },
      { status: 401 },
    );
  }

  if (!rateLimit(session.accessId)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED" } },
      { status: 429 },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_BODY",
          details: err instanceof z.ZodError ? err.flatten() : undefined,
        },
      },
      { status: 400 },
    );
  }

  const ctx = await loadContext(session.orgId, session.projectId);
  if (!ctx) {
    return NextResponse.json(
      { error: { code: "PROJECT_NOT_FOUND" } },
      { status: 404 },
    );
  }

  const messages = [
    { role: "system" as const, content: buildSystem(ctx) },
    ...(body.history ?? []),
    { role: "user" as const, content: body.message },
  ];

  try {
    const result = await aiComplete({
      taskKind: "support.answer",
      organizationId: session.orgId,
      messages,
      maxTokens: 400,
      temperature: 0.3,
    });
    return NextResponse.json({ reply: result.text.trim() });
  } catch (err) {
    console.error("[portal/chat] ai error", err);
    return NextResponse.json(
      { error: { code: "AI_UNAVAILABLE" } },
      { status: 502 },
    );
  }
}
