// apps/web/src/server/services/integration.service.ts
//
// Module #21 — Integrations hub.
//
// Provides a uniform connect/disconnect/test/syncNow lifecycle on top of the
// `Integration` model. Each provider is described in PROVIDER_CATALOG below
// so the UI can render cards without hardcoding provider details.

import { withOrg } from "@crawlix/db";
import { auditService } from "./audit.service";

export type IntegrationProvider =
  | "slack"
  | "gmail"
  | "outlook"
  | "hubspot"
  | "salesforce"
  | "zapier"
  | "webhook";

export interface ProviderCatalogEntry {
  key: IntegrationProvider;
  label: string;
  description: string;
  /// auth = the high-level connection style — affects which credential fields
  /// the connect form should show.
  auth: "oauth" | "api_key" | "webhook";
  /// Lucide-style stroke icon path.
  icon: string;
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    key: "slack",
    label: "Slack",
    description: "Post lead alerts and pipeline updates to a Slack channel.",
    auth: "webhook",
    icon: "M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5S16 2.67 16 3.5v5c0 .83-.67 1.5-1.5 1.5z",
  },
  {
    key: "gmail",
    label: "Gmail",
    description: "Send outreach emails from your Gmail account.",
    auth: "oauth",
    icon: "M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  },
  {
    key: "outlook",
    label: "Outlook",
    description: "Send outreach emails from a Microsoft 365 mailbox.",
    auth: "oauth",
    icon: "M21 8v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8m18 0a2 2 0 00-2-2H5a2 2 0 00-2 2m18 0l-9 6-9-6",
  },
  {
    key: "hubspot",
    label: "HubSpot",
    description: "Sync leads and deals to HubSpot CRM.",
    auth: "api_key",
    icon: "M12 8a4 4 0 100 8 4 4 0 000-8zm6 4h2m-16 0h2",
  },
  {
    key: "salesforce",
    label: "Salesforce",
    description: "Sync leads and contacts to Salesforce.",
    auth: "oauth",
    icon: "M4 13a4 4 0 014-4 5 5 0 019-1 4 4 0 015 5 4 4 0 01-3 7H8a4 4 0 01-4-4z",
  },
  {
    key: "zapier",
    label: "Zapier",
    description: "Trigger Zaps from new leads, deals, and stage changes.",
    auth: "webhook",
    icon: "M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-7.07l-2.83 2.83M7.76 16.24l-2.83 2.83m12.14 0l-2.83-2.83M7.76 7.76L4.93 4.93",
  },
  {
    key: "webhook",
    label: "Custom webhook",
    description: "POST events to your own HTTPS endpoint.",
    auth: "webhook",
    icon: "M14 7l-5 5 5 5M21 12H4",
  },
];

export interface IntegrationDto {
  id: string;
  provider: IntegrationProvider;
  label: string;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  accountLabel: string | null;
  config: Record<string, unknown> | null;
  lastError: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function knownProvider(key: string): key is IntegrationProvider {
  return PROVIDER_CATALOG.some((p) => p.key === key);
}

function entry(p: IntegrationProvider): ProviderCatalogEntry {
  return PROVIDER_CATALOG.find((c) => c.key === p)!;
}

function toDto(row: {
  id: string;
  provider: string;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  accountLabel: string | null;
  config: unknown;
  lastError: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): IntegrationDto {
  return {
    id: row.id,
    provider: row.provider as IntegrationProvider,
    label: knownProvider(row.provider)
      ? entry(row.provider).label
      : row.provider,
    status: row.status,
    accountLabel: row.accountLabel,
    config: (row.config as Record<string, unknown> | null) ?? null,
    lastError: row.lastError,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function list(orgId: string): Promise<IntegrationDto[]> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx.integration.findMany({
      where: { organizationId: orgId },
      orderBy: { provider: "asc" },
    });
    return rows.map(toDto);
  });
}

export interface ConnectInput {
  provider: IntegrationProvider;
  accountLabel?: string | null;
  /// Sensitive — stored as Json, never returned via DTO.
  credentials?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

async function connect(
  orgId: string,
  userId: string,
  input: ConnectInput,
): Promise<IntegrationDto> {
  if (!knownProvider(input.provider)) throw new Error("UNKNOWN_PROVIDER");
  const dto = await withOrg(orgId, async (tx) => {
    const existing = await tx.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId: orgId,
          provider: input.provider,
        },
      },
    });
    const data = {
      organizationId: orgId,
      provider: input.provider,
      status: "CONNECTED" as const,
      accountLabel: input.accountLabel ?? null,
      credentials: (input.credentials ?? undefined) as object | undefined,
      config: (input.config ?? undefined) as object | undefined,
      lastError: null,
      createdById: userId,
    };
    const row = existing
      ? await tx.integration.update({
          where: { id: existing.id },
          data: {
            status: "CONNECTED",
            accountLabel: data.accountLabel,
            credentials: data.credentials,
            config: data.config,
            lastError: null,
          },
        })
      : await tx.integration.create({ data });
    return toDto(row);
  });
  await auditService.record({
    orgId,
    userId,
    action: "integration.connect",
    target: input.provider,
    metadata: { id: dto.id, accountLabel: dto.accountLabel },
  });
  return dto;
}

async function disconnect(
  orgId: string,
  userId: string,
  provider: IntegrationProvider,
): Promise<IntegrationDto | null> {
  const dto = await withOrg(orgId, async (tx) => {
    const row = await tx.integration.findUnique({
      where: { organizationId_provider: { organizationId: orgId, provider } },
    });
    if (!row) return null;
    const updated = await tx.integration.update({
      where: { id: row.id },
      data: {
        status: "DISCONNECTED",
        credentials: undefined,
      },
    });
    return toDto(updated);
  });
  if (dto) {
    await auditService.record({
      orgId,
      userId,
      action: "integration.disconnect",
      target: provider,
      metadata: { id: dto.id },
    });
  }
  return dto;
}

async function test(
  orgId: string,
  userId: string,
  provider: IntegrationProvider,
): Promise<{ ok: boolean; message?: string }> {
  // Stub test: in real life each provider would have its own ping logic
  // (Slack auth.test, Gmail token refresh, HubSpot /oauth/v1/access-tokens, etc).
  const result = await withOrg(orgId, async (tx) => {
    const row = await tx.integration.findUnique({
      where: { organizationId_provider: { organizationId: orgId, provider } },
    });
    if (!row || row.status !== "CONNECTED") {
      return { ok: false, message: "Not connected." };
    }
    const cred = row.credentials as Record<string, unknown> | null;
    if (!cred || Object.keys(cred).length === 0) {
      return { ok: false, message: "Missing credentials." };
    }
    return { ok: true };
  });
  await auditService.record({
    orgId,
    userId,
    action: "integration.test",
    target: provider,
    metadata: result,
  });
  return result;
}

async function syncNow(
  orgId: string,
  userId: string,
  provider: IntegrationProvider,
): Promise<{ ok: boolean }> {
  // Stub sync: marks lastSyncedAt and clears errors. A real adapter would
  // fan out per-provider sync logic here.
  const ok = await withOrg(orgId, async (tx) => {
    const row = await tx.integration.findUnique({
      where: { organizationId_provider: { organizationId: orgId, provider } },
    });
    if (!row || row.status !== "CONNECTED") return false;
    await tx.integration.update({
      where: { id: row.id },
      data: { lastSyncedAt: new Date(), lastError: null },
    });
    return true;
  });
  await auditService.record({
    orgId,
    userId,
    action: "integration.sync",
    target: provider,
    metadata: { ok },
  });
  return { ok };
}

export const integrationService = {
  list,
  connect,
  disconnect,
  test,
  syncNow,
  PROVIDER_CATALOG,
};
