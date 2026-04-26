import { withOrg } from '@crawlix/db';
import crypto from 'node:crypto';
import { z } from 'zod';

/**
 * Outreach compliance services. Centralizes the legal preconditions
 * (CAN-SPAM, GDPR Art. 14) and the suppression list. Any future email
 * sender MUST go through {@link assertCanSendOutreach} before dispatch.
 */

export const OutreachSettingsSchema = z.object({
  senderName: z.string().trim().max(120).optional(),
  senderCompany: z.string().trim().max(160).optional(),
  senderEmail: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  replyToEmail: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  mailingAddress: z.string().trim().max(500).optional(),
  unsubscribeUrl: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  citeProviderInBody: z.boolean().default(true)
});
export type OutreachSettingsInput = z.infer<typeof OutreachSettingsSchema>;

export interface OutreachComplianceStatus {
  ready: boolean;
  missing: string[];
}

export const outreachService = {
  async get(orgId: string) {
    return withOrg(orgId, (tx) =>
      tx.outreachSettings.findUnique({ where: { organizationId: orgId } })
    );
  },

  async upsert(orgId: string, input: OutreachSettingsInput) {
    return withOrg(orgId, (tx) =>
      tx.outreachSettings.upsert({
        where: { organizationId: orgId },
        update: { ...input },
        create: { organizationId: orgId, ...input }
      })
    );
  },

  /**
   * Returns the compliance gate status for outreach. CAN-SPAM requires a
   * truthful sender identity, a valid postal mailing address, and a
   * working unsubscribe path. We treat missing fields as a hard block.
   */
  async complianceStatus(orgId: string): Promise<OutreachComplianceStatus> {
    const s = await this.get(orgId);
    const missing: string[] = [];
    if (!s?.senderName) missing.push('senderName');
    if (!s?.senderCompany) missing.push('senderCompany');
    if (!s?.senderEmail) missing.push('senderEmail');
    if (!s?.mailingAddress) missing.push('mailingAddress');
    if (!s?.unsubscribeUrl) missing.push('unsubscribeUrl');
    return { ready: missing.length === 0, missing };
  }
};

function hashEmail(email: string): string {
  return crypto
    .createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex');
}

export const suppressionService = {
  hashEmail,

  async isSuppressed(orgId: string, email: string): Promise<boolean> {
    const hash = hashEmail(email);
    const hit = await withOrg(orgId, (tx) =>
      tx.outreachSuppression.findUnique({
        where: { organizationId_emailHash: { organizationId: orgId, emailHash: hash } }
      })
    );
    return !!hit;
  },

  async add(
    orgId: string,
    email: string,
    reason: 'UNSUBSCRIBE' | 'BOUNCE' | 'COMPLAINT' | 'MANUAL' = 'UNSUBSCRIBE',
    source?: string
  ) {
    const hash = hashEmail(email);
    return withOrg(orgId, (tx) =>
      tx.outreachSuppression.upsert({
        where: { organizationId_emailHash: { organizationId: orgId, emailHash: hash } },
        update: { reason, source },
        create: { organizationId: orgId, emailHash: hash, reason, source }
      })
    );
  },

  async list(orgId: string, limit = 200) {
    return withOrg(orgId, (tx) =>
      tx.outreachSuppression.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(1000, Math.max(1, limit))
      })
    );
  }
};

/**
 * Build the legally-required footer for any outreach email. CAN-SPAM
 * requires a postal address and a clear opt-out link; GDPR Art. 14 (when
 * the recipient is in the EU/UK) requires we disclose where we obtained
 * their contact details on first contact.
 */
export interface OutreachFooterContext {
  senderCompany: string;
  mailingAddress: string;
  unsubscribeUrl: string;
  /** Optional — citing the public source provider satisfies GDPR Art. 14. */
  sourceProvider?: string;
}

export function buildOutreachFooter(ctx: OutreachFooterContext): string {
  const lines = [
    '',
    '---',
    `${ctx.senderCompany}`,
    ctx.mailingAddress,
    `Unsubscribe: ${ctx.unsubscribeUrl}`
  ];
  if (ctx.sourceProvider) {
    lines.push(
      `We sourced your business contact from the public ${ctx.sourceProvider} listing.`
    );
  }
  return lines.join('\n');
}

/**
 * RFC 8058 / RFC 2369 compliant `List-Unsubscribe` headers. Most ESPs
 * (Gmail, Yahoo, Microsoft) require both a `mailto:` and an HTTPS URL,
 * plus the `List-Unsubscribe-Post` flag for one-click handling.
 */
export function buildListUnsubscribeHeaders(opts: {
  unsubscribeUrl: string;
  unsubscribeMailto?: string;
}): { 'List-Unsubscribe': string; 'List-Unsubscribe-Post': string } {
  const parts = [`<${opts.unsubscribeUrl}>`];
  if (opts.unsubscribeMailto) parts.unshift(`<mailto:${opts.unsubscribeMailto}>`);
  return {
    'List-Unsubscribe': parts.join(', '),
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
  };
}

/**
 * Hard gate that any email-send code path MUST call before dispatch.
 * Throws with a stable message so the UI can show the user exactly which
 * compliance steps remain.
 */
export async function assertCanSendOutreach(
  orgId: string,
  recipientEmail: string
): Promise<void> {
  const status = await outreachService.complianceStatus(orgId);
  if (!status.ready) {
    throw new Error(
      `Outreach blocked: missing compliance settings (${status.missing.join(', ')}). ` +
        `Configure them in Settings → Outreach compliance.`
    );
  }
  if (await suppressionService.isSuppressed(orgId, recipientEmail)) {
    throw new Error('Outreach blocked: recipient is on this organization\'s suppression list.');
  }
}
