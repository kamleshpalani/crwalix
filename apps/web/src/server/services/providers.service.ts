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
  }
};
