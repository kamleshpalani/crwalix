import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __crawlixPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__crawlixPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalThis.__crawlixPrisma = prisma;
