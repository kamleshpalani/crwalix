import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { supportService } from "@/server/services/support.service";
import { publishDomainEvent } from "@/server/lib/domain-events";

const Body = z.object({
  subject: z.string().min(1).max(200),
  leadId: z.string().uuid().optional().nullable(),
  channel: z.string().max(40).optional(),
  initialMessage: z.string().max(8000).optional(),
});

export async function GET() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  const tickets = await supportService.listTickets(ctx.orgId);
  return NextResponse.json({ tickets });
}

export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return ctx;
  if (isAuthError(ctx))
    return NextResponse.json({ error: { code: ctx.code } }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON" } },
      { status: 400 },
    );
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const ticket = await supportService.createTicket({
    orgId: ctx.orgId,
    subject: parsed.data.subject,
    leadId: parsed.data.leadId ?? null,
    channel: parsed.data.channel,
    initialMessage: parsed.data.initialMessage,
  });

  // §6 domain event — TicketOpened.
  void publishDomainEvent({
    eventName: "TicketOpened",
    organizationId: ctx.orgId,
    occurredAt: new Date().toISOString(),
    payload: { ticketId: ticket.id, subject: ticket.subject },
  });

  return NextResponse.json({ ticket });
}
