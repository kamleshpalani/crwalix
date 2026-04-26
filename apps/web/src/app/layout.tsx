import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { Inter } from 'next/font/google';
import '../styles/globals.css';

export const metadata = {
  title: 'Crawlix — Local Business Lead Intelligence',
  description: 'Find, score and export high-priority local business leads.'
};

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap'
});

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({ children }: { children: ReactNode }) {
  const body = (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
  return hasClerk ? <ClerkProvider>{body}</ClerkProvider> : body;
}
