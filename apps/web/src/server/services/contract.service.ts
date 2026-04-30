// apps/web/src/server/services/contract.service.ts
//
// Module #11 — Contracts & agreements with lightweight in-app e-sign.
//
// Tamper-evidence: at SIGN time we hash bodyMarkdown with SHA-256 and store
// the hash, the typed name, IP, user-agent, and timestamp. Any future edit
// to the locked body would invalidate the hash on re-render.

import { withOrg } from "@crawlix/db";
import { createHash, randomBytes } from "node:crypto";

export type ContractStatus =
  | "DRAFT"
  | "SENT"
  | "SIGNED"
  | "DECLINED"
  | "CANCELED"
  | "EXPIRED";

export interface ContractDto {
  id: string;
  number: string | null;
  title: string;
  status: ContractStatus;
  bodyMarkdown: string;
  counterpartyName: string | null;
  counterpartyEmail: string | null;
  shareToken: string | null;
  bodyHashAtSign: string | null;
  signedName: string | null;
  signedAt: string | null;
  signedIp: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  declinedAt: string | null;
  dealId: string | null;
  leadId: string | null;
  projectId: string | null;
  quoteId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractCreateInput {
  title: string;
  bodyMarkdown: string;
  counterpartyName?: string | null;
  counterpartyEmail?: string | null;
  expiresAt?: string | null;
  dealId?: string | null;
  leadId?: string | null;
  projectId?: string | null;
  quoteId?: string | null;
}

interface RawContract {
  id: string;
  number: string | null;
  title: string;
  status: string;
  bodyMarkdown: string;
  counterpartyName: string | null;
  counterpartyEmail: string | null;
  shareToken: string | null;
  bodyHashAtSign: string | null;
  signedName: string | null;
  signedAt: Date | null;
  signedIp: string | null;
  expiresAt: Date | null;
  sentAt: Date | null;
  declinedAt: Date | null;
  dealId: string | null;
  leadId: string | null;
  projectId: string | null;
  quoteId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(c: RawContract): ContractDto {
  return {
    id: c.id,
    number: c.number,
    title: c.title,
    status: c.status as ContractStatus,
    bodyMarkdown: c.bodyMarkdown,
    counterpartyName: c.counterpartyName,
    counterpartyEmail: c.counterpartyEmail,
    shareToken: c.shareToken,
    bodyHashAtSign: c.bodyHashAtSign,
    signedName: c.signedName,
    signedAt: c.signedAt ? c.signedAt.toISOString() : null,
    signedIp: c.signedIp,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
    sentAt: c.sentAt ? c.sentAt.toISOString() : null,
    declinedAt: c.declinedAt ? c.declinedAt.toISOString() : null,
    dealId: c.dealId,
    leadId: c.leadId,
    projectId: c.projectId,
    quoteId: c.quoteId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function nextNumber(
  orgId: string,
  tx: {
    contract: {
      count: (a: { where: { organizationId: string } }) => Promise<number>;
    };
  },
) {
  const n = await tx.contract.count({ where: { organizationId: orgId } });
  return `C-${String(n + 1).padStart(4, "0")}`;
}

async function create(
  orgId: string,
  input: ContractCreateInput,
  userId?: string,
): Promise<ContractDto> {
  return withOrg(orgId, async (tx) => {
    const number = await nextNumber(orgId, tx);
    const created = await tx.contract.create({
      data: {
        organizationId: orgId,
        number,
        title: input.title.trim().slice(0, 200),
        bodyMarkdown: input.bodyMarkdown.slice(0, 100_000),
        counterpartyName: input.counterpartyName?.slice(0, 200) ?? null,
        counterpartyEmail: input.counterpartyEmail?.slice(0, 200) ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        dealId: input.dealId ?? null,
        leadId: input.leadId ?? null,
        projectId: input.projectId ?? null,
        quoteId: input.quoteId ?? null,
        createdById: userId ?? null,
      },
    });
    return toDto(created);
  });
}

async function update(
  orgId: string,
  id: string,
  input: ContractCreateInput,
): Promise<ContractDto> {
  return withOrg(orgId, async (tx) => {
    const existing = await tx.contract.findFirst({
      where: { id, organizationId: orgId },
      select: { status: true },
    });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status !== "DRAFT") throw new Error("NOT_EDITABLE");
    const updated = await tx.contract.update({
      where: { id },
      data: {
        title: input.title.trim().slice(0, 200),
        bodyMarkdown: input.bodyMarkdown.slice(0, 100_000),
        counterpartyName: input.counterpartyName?.slice(0, 200) ?? null,
        counterpartyEmail: input.counterpartyEmail?.slice(0, 200) ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        dealId: input.dealId ?? null,
        leadId: input.leadId ?? null,
        projectId: input.projectId ?? null,
        quoteId: input.quoteId ?? null,
      },
    });
    return toDto(updated);
  });
}

async function list(orgId: string): Promise<ContractDto[]> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx.contract.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map(toDto);
  });
}

async function get(orgId: string, id: string): Promise<ContractDto | null> {
  return withOrg(orgId, async (tx) => {
    const row = await tx.contract.findFirst({
      where: { id, organizationId: orgId },
    });
    return row ? toDto(row) : null;
  });
}

async function send(orgId: string, id: string): Promise<ContractDto> {
  return withOrg(orgId, async (tx) => {
    const existing = await tx.contract.findFirst({
      where: { id, organizationId: orgId },
      select: { status: true, shareToken: true },
    });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status !== "DRAFT") throw new Error("ALREADY_SENT");
    const token = existing.shareToken ?? randomBytes(24).toString("hex");
    const updated = await tx.contract.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date(), shareToken: token },
    });
    return toDto(updated);
  });
}

async function cancel(orgId: string, id: string): Promise<ContractDto> {
  return withOrg(orgId, async (tx) => {
    const existing = await tx.contract.findFirst({
      where: { id, organizationId: orgId },
      select: { status: true },
    });
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status === "SIGNED") throw new Error("ALREADY_SIGNED");
    const updated = await tx.contract.update({
      where: { id },
      data: { status: "CANCELED" },
    });
    return toDto(updated);
  });
}

async function remove(orgId: string, id: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx.contract.deleteMany({ where: { id, organizationId: orgId } });
  });
}

// ---- Public share-token operations ----------------------------------------

async function getByShareToken(token: string): Promise<ContractDto | null> {
  const { prisma } = await import("@crawlix/db");
  const row = await prisma.contract.findFirst({
    where: {
      shareToken: token,
      status: { in: ["SENT", "SIGNED", "DECLINED"] },
    },
  });
  return row ? toDto(row) : null;
}

async function signByShareToken(args: {
  token: string;
  typedName: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<ContractDto | null> {
  const { prisma } = await import("@crawlix/db");
  const existing = await prisma.contract.findFirst({
    where: { shareToken: args.token },
    select: { id: true, status: true, expiresAt: true, bodyMarkdown: true },
  });
  if (!existing) return null;
  if (existing.status !== "SENT") return null;
  if (existing.expiresAt && existing.expiresAt.getTime() < Date.now()) {
    await prisma.contract.update({
      where: { id: existing.id },
      data: { status: "EXPIRED" },
    });
    return null;
  }
  const name = args.typedName.trim().slice(0, 200);
  if (name.length === 0) return null;
  const hash = createHash("sha256").update(existing.bodyMarkdown).digest("hex");
  const updated = await prisma.contract.update({
    where: { id: existing.id },
    data: {
      status: "SIGNED",
      signedAt: new Date(),
      signedName: name,
      signedIp: args.ip?.slice(0, 64) ?? null,
      signedUserAgent: args.userAgent?.slice(0, 500) ?? null,
      bodyHashAtSign: hash,
    },
  });
  return toDto(updated);
}

async function declineByShareToken(token: string): Promise<ContractDto | null> {
  const { prisma } = await import("@crawlix/db");
  const existing = await prisma.contract.findFirst({
    where: { shareToken: token },
    select: { id: true, status: true },
  });
  if (!existing || existing.status !== "SENT") return null;
  const updated = await prisma.contract.update({
    where: { id: existing.id },
    data: { status: "DECLINED", declinedAt: new Date() },
  });
  return toDto(updated);
}

export const contractService = {
  create,
  update,
  list,
  get,
  send,
  cancel,
  remove,
  getByShareToken,
  signByShareToken,
  declineByShareToken,
};
