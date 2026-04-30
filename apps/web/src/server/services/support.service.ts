// apps/web/src/server/services/support.service.ts
//
// Phase 4.4 + 4.5 — Support inbox + knowledge-base RAG agent.
//
// Knowledge base entries are embedded with text-embedding-3-small (1536d)
// and stored as Float[] in Postgres. We rank with in-memory cosine similarity
// at query time; for the article volumes we expect (low thousands per org)
// this is fast enough and avoids requiring pgvector.
//
// The agent enforces JSON output and self-rates confidence; <0.6 or empty KB
// flips needsHandoff so a human teammate is paged.

import { withOrg } from "@crawlix/db";
import { embedText, cosineSim, answerSupportQuestion } from "@crawlix/ai";
import { emitNotification } from "@/server/lib/notify";
import { NotificationKind } from "./notification-kinds";

const TOP_K = 5;
const MAX_ARTICLE_BYTES = 32_000;

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

export interface IngestArticleArgs {
  orgId: string;
  title: string;
  content: string;
  sourceUrl?: string | null;
  tags?: string[];
}

export interface KbArticle {
  id: string;
  title: string;
  content: string;
  sourceUrl: string | null;
  tags: string[];
  hasEmbedding: boolean;
  createdAt: string;
  updatedAt: string;
}

function articleToDto(a: {
  id: string;
  title: string;
  content: string;
  sourceUrl: string | null;
  tags: string[];
  embedding: number[];
  createdAt: Date;
  updatedAt: Date;
}): KbArticle {
  return {
    id: a.id,
    title: a.title,
    content: a.content,
    sourceUrl: a.sourceUrl,
    tags: a.tags,
    hasEmbedding: a.embedding.length > 0,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

async function ingestArticle(args: IngestArticleArgs): Promise<KbArticle> {
  const title = args.title.trim().slice(0, 200);
  const content = args.content.trim().slice(0, MAX_ARTICLE_BYTES);
  if (!title) throw new Error("title is required");
  if (!content) throw new Error("content is required");

  const { vector } = await embedText(`${title}\n\n${content}`);

  return withOrg(args.orgId, async (tx) => {
    const row = await tx.knowledgeArticle.create({
      data: {
        organizationId: args.orgId,
        title,
        content,
        sourceUrl: args.sourceUrl ?? null,
        tags: (args.tags ?? []).slice(0, 20),
        embedding: vector,
      },
    });
    return articleToDto(row);
  });
}

async function listArticles(orgId: string): Promise<KbArticle[]> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx.knowledgeArticle.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    return rows.map(articleToDto);
  });
}

async function deleteArticle(orgId: string, id: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx.knowledgeArticle.deleteMany({
      where: { id, organizationId: orgId },
    });
  });
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export interface TicketDto {
  id: string;
  subject: string;
  status: string;
  channel: string;
  leadId: string | null;
  assignedUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDto {
  id: string;
  ticketId: string;
  role: "USER" | "AI" | "AGENT";
  content: string;
  confidence: number | null;
  citedArticleIds: string[];
  needsHandoff: boolean;
  createdAt: string;
}

function ticketToDto(t: {
  id: string;
  subject: string;
  status: string;
  channel: string;
  leadId: string | null;
  assignedUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TicketDto {
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    channel: t.channel,
    leadId: t.leadId,
    assignedUserId: t.assignedUserId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function messageToDto(m: {
  id: string;
  ticketId: string;
  role: string;
  content: string;
  confidence: number | null;
  citedArticleIds: string[];
  needsHandoff: boolean;
  createdAt: Date;
}): MessageDto {
  const role: MessageDto["role"] =
    m.role === "AI" || m.role === "AGENT" ? m.role : "USER";
  return {
    id: m.id,
    ticketId: m.ticketId,
    role,
    content: m.content,
    confidence: m.confidence,
    citedArticleIds: m.citedArticleIds,
    needsHandoff: m.needsHandoff,
    createdAt: m.createdAt.toISOString(),
  };
}

export interface CreateTicketArgs {
  orgId: string;
  subject: string;
  leadId?: string | null;
  channel?: string;
  initialMessage?: string;
}

async function createTicket(args: CreateTicketArgs): Promise<TicketDto> {
  const subject = args.subject.trim().slice(0, 200);
  if (!subject) throw new Error("subject is required");

  const dto = await withOrg(args.orgId, async (tx) => {
    const ticket = await tx.supportTicket.create({
      data: {
        organizationId: args.orgId,
        subject,
        leadId: args.leadId ?? null,
        channel: args.channel ?? "manual",
      },
    });
    if (args.initialMessage && args.initialMessage.trim().length > 0) {
      await tx.supportMessage.create({
        data: {
          organizationId: args.orgId,
          ticketId: ticket.id,
          role: "USER",
          content: args.initialMessage.trim().slice(0, 8000),
        },
      });
    }
    return ticketToDto(ticket);
  });

  void emitNotification({
    organizationId: args.orgId,
    kind: NotificationKind.TICKET_CREATED,
    title: `Support ticket: ${dto.subject}`,
    body: args.initialMessage?.slice(0, 200) ?? "New support ticket opened.",
    href: `/support/${dto.id}`,
    data: { ticketId: dto.id, channel: dto.channel },
  });

  return dto;
}

async function listTickets(orgId: string): Promise<TicketDto[]> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx.supportTicket.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return rows.map(ticketToDto);
  });
}

async function getTicketWithMessages(
  orgId: string,
  ticketId: string,
): Promise<{ ticket: TicketDto; messages: MessageDto[] } | null> {
  return withOrg(orgId, async (tx) => {
    const ticket = await tx.supportTicket.findFirst({
      where: { id: ticketId, organizationId: orgId },
    });
    if (!ticket) return null;
    const msgs = await tx.supportMessage.findMany({
      where: { ticketId, organizationId: orgId },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return {
      ticket: ticketToDto(ticket),
      messages: msgs.map(messageToDto),
    };
  });
}

// ---------------------------------------------------------------------------
// RAG agent
// ---------------------------------------------------------------------------

export interface AskAgentArgs {
  orgId: string;
  question: string;
  /** If set, USER + AI messages are persisted to the ticket. */
  ticketId?: string;
  brandVoice?: string;
}

export interface AskAgentResult {
  answer: string;
  confidence: number;
  needsHandoff: boolean;
  citedArticles: { id: string; title: string }[];
  ticketId?: string;
  usage: { promptTokens: number; completionTokens: number; costUsd: number };
}

async function askAgent(args: AskAgentArgs): Promise<AskAgentResult> {
  const question = args.question.trim().slice(0, 4000);
  if (!question) throw new Error("question is required");

  // 1. Embed query.
  const { vector: qVec } = await embedText(question);

  // 2. Rank articles in-memory.
  type Ranked = {
    id: string;
    title: string;
    content: string;
    score: number;
  };

  const ranked: Ranked[] = await withOrg(args.orgId, async (tx) => {
    const rows = await tx.knowledgeArticle.findMany({
      where: { organizationId: args.orgId },
      take: 500,
      orderBy: { updatedAt: "desc" },
    });
    return rows
      .map((r) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        score: cosineSim(qVec, r.embedding),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);
  });

  // 3. Pull recent history if ticketId provided.
  let history: { role: "USER" | "AI" | "AGENT"; content: string }[] = [];
  if (args.ticketId) {
    history = await withOrg(args.orgId, async (tx) => {
      const msgs = await tx.supportMessage.findMany({
        where: { ticketId: args.ticketId!, organizationId: args.orgId },
        orderBy: { createdAt: "asc" },
        take: 12,
      });
      return msgs.map((m) => ({
        role:
          m.role === "AI" || m.role === "AGENT"
            ? (m.role as "AI" | "AGENT")
            : ("USER" as const),
        content: m.content,
      }));
    });
  }

  // 4. Call the model.
  const reply = await answerSupportQuestion({
    organizationId: args.orgId,
    question,
    brandVoice: args.brandVoice,
    history,
    articles: ranked.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      score: r.score,
    })),
  });

  // 5. Persist if ticket attached.
  if (args.ticketId) {
    await withOrg(args.orgId, async (tx) => {
      await tx.supportMessage.create({
        data: {
          organizationId: args.orgId,
          ticketId: args.ticketId!,
          role: "USER",
          content: question,
        },
      });
      await tx.supportMessage.create({
        data: {
          organizationId: args.orgId,
          ticketId: args.ticketId!,
          role: "AI",
          content: reply.answer,
          confidence: reply.confidence,
          citedArticleIds: reply.citedArticleIds,
          needsHandoff: reply.needsHandoff,
        },
      });
      await tx.supportTicket.update({
        where: { id: args.ticketId! },
        data: {
          status: reply.needsHandoff ? "PENDING" : "OPEN",
          updatedAt: new Date(),
        },
      });
    });
  }

  const titleById = new Map(ranked.map((r) => [r.id, r.title]));
  return {
    answer: reply.answer,
    confidence: reply.confidence,
    needsHandoff: reply.needsHandoff,
    citedArticles: reply.citedArticleIds
      .map((id) => ({ id, title: titleById.get(id) ?? "Article" }))
      .filter((c) => titleById.has(c.id)),
    ticketId: args.ticketId,
    usage: reply.usage,
  };
}

// ---------------------------------------------------------------------------

export const supportService = {
  ingestArticle,
  listArticles,
  deleteArticle,
  createTicket,
  listTickets,
  getTicketWithMessages,
  askAgent,
};
