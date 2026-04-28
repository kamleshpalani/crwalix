import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import HeaderUser from '@/components/HeaderUser';
import HeaderOrg from '@/components/HeaderOrg';
import NotificationsBell from '@/components/NotificationsBell';
import Sidebar from '@/components/Sidebar';
import AuroraBackground from '@/components/AuroraBackground';
import PageTransition from '@/components/PageTransition';

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function AppLayout({ children }: { children: ReactNode }) {
  const shell = (
    <div className="relative min-h-screen">
      <AuroraBackground />

      <div className="mx-auto flex w-full max-w-[1440px] gap-4 px-4 py-4 lg:px-6">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="glass sticky top-4 z-30 flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-brand text-white shadow-glow">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path
                    d="M4 7l8-4 8 4-8 4-8-4zm0 5l8 4 8-4M4 17l8 4 8-4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="text-sm font-semibold">Crawlix</span>
            </div>
            <div className="hidden flex-1 items-center gap-2 lg:flex">
              <div className="relative w-full max-w-md">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                >
                  <path
                    d="M21 21l-4.3-4.3M11 18a7 7 0 110-14 7 7 0 010 14z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  type="search"
                  placeholder="Search leads, projects, searches…"
                  className="w-full pl-9 text-sm"
                />
              </div>
            </div>
            {hasClerk ? (
              <div className="flex items-center gap-2">
                <HeaderOrg />
                <NotificationsBell />
                <HeaderUser />
              </div>
            ) : (
              <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs text-amber-800">
                Clerk keys not configured
              </span>
            )}
          </header>

          <main className="min-h-[calc(100vh-7rem)] pb-12">
            <PageTransition>{children}</PageTransition>
          </main>

          <footer className="px-2 pb-6 pt-2 text-[11px] leading-relaxed text-ink-500">
            <p>
              Business data sourced from{' '}
              <a
                href="https://developers.google.com/maps/documentation/places/web-service/policies"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-ink-700"
              >
                Google Maps Platform
              </a>
              ,{' '}
              <a
                href="https://docs.developer.yelp.com/docs/fusion-api-terms-of-use"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-ink-700"
              >
                Yelp Fusion
              </a>
              , and{' '}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-ink-700"
              >
                © OpenStreetMap contributors
              </a>{' '}
              (ODbL). Used under each provider&apos;s API terms. Crawlix is a B2B
              lead-research tool — please honor unsubscribe requests and applicable
              CAN-SPAM / GDPR rules in your outreach.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
  return hasClerk ? <ClerkProvider>{shell}</ClerkProvider> : shell;
}
