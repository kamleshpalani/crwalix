import { withOrg } from '@crawlix/db';
import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  provider: z.string().min(1),
  enabled: z.boolean(),
  dailyBudget: z.number().int().min(0).max(1_000_000).optional()
});
export type ProviderConfigInput = z.infer<typeof ProviderConfigSchema>;

export const providersService = {
  async list(orgId: string) {
    return withOrg(orgId, (tx) =>
      tx.providerConfig.findMany({ orderBy: { provider: 'asc' } })
    );
  },

  async upsert(orgId: string, input: ProviderConfigInput) {
    return withOrg(orgId, (tx) =>
      tx.providerConfig.upsert({
        where: { organizationId_provider: { organizationId: orgId, provider: input.provider } },
        update: {
          enabled: input.enabled,
          dailyBudget: input.dailyBudget ?? null
        },
        create: {
          organizationId: orgId,
          provider: input.provider,
          enabled: input.enabled,
          dailyBudget: input.dailyBudget ?? null
        }
      })
    );
  },

  /**
   * Record explicit acceptance of a provider's Terms of Service. We store
   * who accepted (Crawlix user id) and when, so we can prove informed
   * consent if a provider audits our usage.
   */
  async acceptTerms(orgId: string, provider: string, userId: string) {
    return withOrg(orgId, (tx) =>
      tx.providerConfig.upsert({
        where: { organizationId_provider: { organizationId: orgId, provider } },
        update: { termsAcceptedAt: new Date(), termsAcceptedBy: userId },
        create: {
          organizationId: orgId,
          provider,
          enabled: true,
          termsAcceptedAt: new Date(),
          termsAcceptedBy: userId
        }
      })
    );
  },

  /**
   * Returns the providers (from the requested set) whose Terms of Service
   * have NOT yet been accepted by anyone in this org. Used to gate search
   * creation so we never call a provider's API on behalf of an org whose
   * admin hasn't agreed to that provider's terms.
   */
  async missingTermsAcceptance(orgId: string, providerIds: string[]): Promise<string[]> {
    if (providerIds.length === 0) return [];
    const rows = await withOrg(orgId, (tx) =>
      tx.providerConfig.findMany({
        where: { provider: { in: providerIds } },
        select: { provider: true, termsAcceptedAt: true }
      })
    );
    const accepted = new Set(
      rows.filter((r) => r.termsAcceptedAt !== null).map((r) => r.provider)
    );
    return providerIds.filter((id) => !accepted.has(id));
  }
};

