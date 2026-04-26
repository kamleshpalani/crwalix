import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import '../styles/globals.css';

export const metadata = {
  title: 'Crawlix — Local Business Lead Intelligence',
  description: 'Find, score and export high-priority local business leads.'
};

// This is an auth-gated SaaS — every page reads cookies via Clerk and/or
// Postgres, so static prerendering would fail. Render everything on demand.
export const dynamic = 'force-dynamic';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap'
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
