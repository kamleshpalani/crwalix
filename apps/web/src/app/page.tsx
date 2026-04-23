import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-5xl font-bold tracking-tight">Crawlix</h1>
      <p className="mt-4 text-lg text-slate-600">
        Discover, score and export high-priority local business leads. Built on official
        provider APIs — compliant by design.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/dashboard"
          className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground"
        >
          Go to dashboard
        </Link>
        <Link
          href="/sign-in"
          className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
