import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import './styles/globals.css';

export const metadata = {
  title: 'Crawlix — Local Business Lead Intelligence',
  description: 'Find, score and export high-priority local business leads.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
