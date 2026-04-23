import { Prisma } from '@prisma/client';
import { prisma } from './client';

/**
 * Runs `fn` inside a Postgres transaction with `app.current_org` set so RLS
 * policies can isolate tenant data. The backend always calls this from
 * request handlers using the authenticated org id.
 */
export async function withOrg<T>(
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_org', $1, true)`, organizationId);
    return fn(tx);
  });
}
