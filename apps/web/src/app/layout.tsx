import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import '../styles/globals.css';

export const metadata = {
  title: 'Crawlix — Local Business Lead Intelligence',
  description: 'Find, score and export high-priority local business leads.'
};

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({ children }: { children: ReactNode }) {
  const body = (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
  return hasClerk ? <ClerkProvider>{body}</ClerkProvider> : body;
}
