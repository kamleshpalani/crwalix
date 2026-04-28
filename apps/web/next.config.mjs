/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@crawlix/shared', '@crawlix/providers', '@crawlix/scoring', '@crawlix/db'],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bullmq', 'ioredis']
  },
  // Auth-gated SaaS — every route is dynamic; we don't need static error
  // pages. Skip the optional static export step that triggers Next 14's
  // Pages-Router `_error` fallback (which conflicts with App Router +
  // ClerkProvider during prerender).
  skipTrailingSlashRedirect: true,
  output: 'standalone'
};
export default nextConfig;
