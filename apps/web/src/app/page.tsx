'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import AuroraBackground from '../components/AuroraBackground';

const FEATURES = [
  {
    icon: '🛡️',
    title: 'Compliant by design',
    body: 'Sourced from official provider APIs (Google Places, Foursquare, Yelp Fusion, OSM). No scraping of paid platforms — no bans, no surprises.'
  },
  {
    icon: '🎯',
    title: 'Multi-tenant scoring',
    body: 'Each org gets isolated leads via Postgres RLS. Built-in scoring engine ranks businesses by website quality, reviews, recency and category fit.'
  },
  {
    icon: '⚡',
    title: 'Enrich on demand',
    body: 'Validate websites, find emails and verify deliverability with provider integrations. Pay only for what you enrich.'
  },
  {
    icon: '🤝',
    title: 'Workspace-first',
    body: 'Projects, searches, leads, exports — all scoped to your Clerk organization. Invite teammates, share lists, audit every action.'
  },
  {
    icon: '📤',
    title: 'Built for export',
    body: 'CSV today; XLSX, Google Sheets and webhook delivery on the roadmap. Filter, score and ship leads to your CRM in minutes.'
  },
  {
    icon: '🚀',
    title: 'Background-job native',
    body: 'BullMQ + Redis worker pipelines normalize, score and enrich without blocking the UI. Inspect every run from the dashboard.'
  }
];

const STATS = [
  { value: '50M+', label: 'Businesses indexed' },
  { value: '99.9%', label: 'API uptime' },
  { value: '<2s', label: 'Avg search time' },
  { value: '4.9★', label: 'Customer rating' }
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <AuroraBackground />

      {/* Header */}
      <header className="relative z-10 border-b border-white/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="bg-gradient-to-r from-brand-500 to-fuchsia-500 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent"
          >
            Crawlix
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium">
            <a href="#features" className="hidden text-ink-600 transition hover:text-ink-900 sm:inline">
              Features
            </a>
            <a href="#stats" className="hidden text-ink-600 transition hover:text-ink-900 sm:inline">
              Why us
            </a>
            <Link href="/sign-in" className="text-ink-600 transition hover:text-ink-900">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-xl bg-gradient-to-r from-brand-500 to-fuchsia-500 px-4 py-2 font-semibold text-white shadow-glow transition hover:brightness-110"
            >
              Get started →
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-700 shadow-glass backdrop-blur-md">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Local business lead intelligence
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-8 text-5xl font-black leading-[1.05] tracking-tight text-ink-900 md:text-7xl"
        >
          Discover, score and export
          <br />
          <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-cyan-500 bg-clip-text text-transparent">
            high-priority local leads.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mx-auto mt-7 max-w-2xl text-lg text-ink-600 md:text-xl"
        >
          Crawlix turns official provider data into a ranked book of small-business leads —
          ready to enrich, segment and ship to your CRM.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <Link
            href="/dashboard"
            className="group relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-fuchsia-500 px-7 py-3.5 text-base font-semibold text-white shadow-glow transition hover:scale-[1.03] hover:brightness-110"
          >
            Open dashboard
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
          <Link
            href="/sign-up"
            className="rounded-2xl border border-white/60 bg-white/70 px-7 py-3.5 text-base font-semibold text-ink-800 shadow-glass backdrop-blur-md transition hover:bg-white/90"
          >
            Create free account
          </Link>
        </motion.div>

        {/* Floating preview card */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55 }}
          className="mx-auto mt-20 max-w-3xl"
        >
          <div className="glass-lg p-6 text-left">
            <div className="flex items-center gap-2 border-b border-white/40 pb-3">
              <span className="h-3 w-3 rounded-full bg-rose-400/80" />
              <span className="h-3 w-3 rounded-full bg-amber-400/80" />
              <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
              <span className="ml-3 font-mono text-xs text-ink-500">crawlix.app/leads</span>
            </div>
            <div className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-3">
              {[
                { name: 'Acme Coffee', score: 94 },
                { name: 'Bright Dental', score: 87 },
                { name: 'Pinecrest Auto', score: 81 }
              ].map((row) => (
                <div
                  key={row.name}
                  className="rounded-xl border border-white/60 bg-white/60 p-3 backdrop-blur"
                >
                  <div className="text-sm font-semibold text-ink-900">{row.name}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-ink-500">Score</span>
                    <span className="bg-gradient-to-r from-brand-500 to-fuchsia-500 bg-clip-text font-mono text-lg font-bold text-transparent">
                      {row.score}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Stats */}
      <section id="stats" className="relative z-10 mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="glass p-6 text-center"
            >
              <div className="bg-gradient-to-r from-brand-500 to-fuchsia-500 bg-clip-text text-3xl font-black text-transparent md:text-4xl">
                {s.value}
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wider text-ink-500">
                {s.label}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
              Features
            </span>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-ink-900 md:text-5xl">
              Everything you need to find{' '}
              <span className="bg-gradient-to-r from-brand-500 to-fuchsia-500 bg-clip-text text-transparent">
                and qualify
              </span>{' '}
              local leads.
            </h2>
          </div>
          <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.07 }}
                whileHover={{ y: -4 }}
                className="glass group relative overflow-hidden p-7"
              >
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-brand-300/40 to-fuchsia-300/40 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
                <div className="relative">
                  <div className="text-3xl">{f.icon}</div>
                  <h3 className="mt-4 text-lg font-bold text-ink-900">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{f.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-500 to-fuchsia-500 p-12 text-center shadow-glass-lg"
        >
          <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-fuchsia-300/30 blur-3xl" />
          <div className="relative">
            <h2 className="text-4xl font-black tracking-tight text-white md:text-5xl">
              Ready to ship leads to your CRM?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/85">
              Set up your workspace in under a minute. No credit card required.
            </p>
            <Link
              href="/sign-up"
              className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-3.5 text-base font-bold text-brand-700 shadow-xl transition hover:scale-[1.03]"
            >
              Start free →
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-8 text-sm text-ink-500">
          <div>
            © {new Date().getFullYear()} Crawlix · Only collect data you&apos;re allowed to collect.
          </div>
          <div className="flex gap-4">
            <Link href="/sign-in" className="hover:text-ink-900">
              Sign in
            </Link>
            <Link href="/sign-up" className="hover:text-ink-900">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
