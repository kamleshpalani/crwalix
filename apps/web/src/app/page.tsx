import Link from 'next/link';

const FEATURES = [
  {
    title: 'Compliant by design',
    body: 'Sourced from official provider APIs (Google Places, Foursquare, Yelp Fusion, OSM). No scraping of paid platforms — no bans, no surprises.'
  },
  {
    title: 'Multi-tenant scoring',
    body: 'Each org gets isolated leads via Postgres RLS. Built-in scoring engine ranks businesses by website quality, reviews, recency and category fit.'
  },
  {
    title: 'Enrich on demand',
    body: 'Validate websites, find emails and verify deliverability with provider integrations. Pay only for what you enrich.'
  },
  {
    title: 'Workspace-first',
    body: 'Projects, searches, leads, exports — all scoped to your Clerk organization. Invite teammates, share lists, audit every action.'
  },
  {
    title: 'Built for export',
    body: 'CSV today; XLSX, Google Sheets and webhook delivery on the roadmap. Filter, score and ship leads to your CRM in minutes.'
  },
  {
    title: 'Background-job native',
    body: 'BullMQ + Redis worker pipelines normalize, score and enrich without blocking the UI. Inspect every run from the dashboard.'
  }
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-white/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-ink-900">
            Crawlix
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <a href="#features" className="text-ink-600 hover:text-ink-900">
              Features
            </a>
            <Link href="/sign-in" className="text-ink-600 hover:text-ink-900">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <span className="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
          Local business lead intelligence
        </span>
        <h1 className="mt-6 text-5xl font-bold tracking-tight text-ink-900">
          Discover, score and export
          <br />
          high-priority local leads.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-600">
          Crawlix turns official provider data into a ranked book of small-business leads —
          ready to enrich, segment and ship to your CRM.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground hover:opacity-90"
          >
            Open dashboard
          </Link>
          <Link
            href="/sign-up"
            className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-ink-700 hover:bg-white/70"
          >
            Create account
          </Link>
        </div>
      </section>

      <section id="features" className="border-t border-white/60 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight text-ink-900">
            Everything you need to find and qualify local leads.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-lg border border-white/60 bg-white/40 p-6"
              >
                <h3 className="text-base font-semibold text-ink-900">{f.title}</h3>
                <p className="mt-2 text-sm text-ink-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/60 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-ink-500">
          © {new Date().getFullYear()} Crawlix · Only collect data you're allowed to collect.
        </div>
      </footer>
    </main>
  );
}
