import Link from 'next/link';
import type { ReactNode } from 'react';
import HeaderUser from '@/components/HeaderUser';
import HeaderOrg from '@/components/HeaderOrg';

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/dashboard" className="font-semibold text-slate-900">Crawlix</Link>
          <Link href="/projects" className="text-slate-600 hover:text-slate-900">Projects</Link>
          <Link href="/searches" className="text-slate-600 hover:text-slate-900">Searches</Link>
          <Link href="/leads" className="text-slate-600 hover:text-slate-900">Leads</Link>
          <Link href="/exports" className="text-slate-600 hover:text-slate-900">Exports</Link>
          <Link href="/settings/billing" className="text-slate-600 hover:text-slate-900">Billing</Link>
        </nav>
        {hasClerk ? (
          <div className="flex items-center gap-3">
            <HeaderOrg />
            <HeaderUser />
          </div>
        ) : (
          <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">
            Clerk keys not configured
          </span>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
