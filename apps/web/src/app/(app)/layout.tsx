import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/dashboard" className="font-semibold text-slate-900">Crawlix</Link>
          <Link href="/projects" className="text-slate-600 hover:text-slate-900">Projects</Link>
          <Link href="/leads" className="text-slate-600 hover:text-slate-900">Leads</Link>
          <Link href="/exports" className="text-slate-600 hover:text-slate-900">Exports</Link>
          <Link href="/settings/billing" className="text-slate-600 hover:text-slate-900">Billing</Link>
        </nav>
        <UserButton afterSignOutUrl="/" />
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
