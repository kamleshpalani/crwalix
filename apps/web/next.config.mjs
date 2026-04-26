/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@crawlix/shared', '@crawlix/providers', '@crawlix/scoring', '@crawlix/db'],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bullmq', 'ioredis']
  }
};
export default nextConfig;
