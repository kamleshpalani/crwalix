"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const items: { href: string; label: string; icon: string }[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "M3 12l9-9 9 9M5 10v10h14V10",
  },
  {
    href: "/search",
    label: "Ask AI",
    icon: "M9 11a4 4 0 118 0 4 4 0 01-8 0zM21 21l-4.3-4.3",
  },
  {
    href: "/projects",
    label: "Projects",
    icon: "M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4",
  },
  {
    href: "/searches",
    label: "Searches",
    icon: "M21 21l-4.3-4.3M11 18a7 7 0 110-14 7 7 0 010 14z",
  },
  {
    href: "/leads",
    label: "Leads",
    icon: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM3 21a9 9 0 0118 0",
  },
  {
    href: "/pipeline",
    label: "Pipeline",
    icon: "M4 6h6v6H4zM14 6h6v12h-6zM4 14h6v4H4z",
  },
  {
    href: "/quotes",
    label: "Quotes",
    icon: "M9 12h6m-6 4h6M5 7h14M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z",
  },
  {
    href: "/contracts",
    label: "Contracts",
    icon: "M9 12h6m-6 4h4M5 21h14a2 2 0 002-2V7l-5-5H5a2 2 0 00-2 2v14a2 2 0 002 2z",
  },
  {
    href: "/invoices",
    label: "Invoices",
    icon: "M9 14h6m-6 4h6M5 21h14a2 2 0 002-2V7l-5-5H5a2 2 0 00-2 2v14a2 2 0 002 2z",
  },
  {
    href: "/exports",
    label: "Exports",
    icon: "M12 3v12m0 0l-4-4m4 4l4-4M5 21h14",
  },
  {
    href: "/intel",
    label: "Intel",
    icon: "M3 12h3m12 0h3M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6l2.1-2.1M12 8a4 4 0 100 8 4 4 0 000-8z",
  },
  {
    href: "/enrichments",
    label: "Enrichment",
    icon: "M19 11a7 7 0 11-14 0 7 7 0 0114 0zM12 4v3m0 8v3m4-7h3m-14 0h3",
  },
  {
    href: "/notifications",
    label: "Notifications",
    icon: "M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0",
  },
  {
    href: "/anomalies",
    label: "Anomalies",
    icon: "M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.74-3l-7.07-12a2 2 0 00-3.48 0L3.19 16a2 2 0 001.74 3z",
  },
  {
    href: "/support",
    label: "Support",
    icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4.9a7 7 0 00-2-1.2L14 3h-4l-.5 2.5a7 7 0 00-2 1.2L5 5.8 3 9.2l2 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-.9a7 7 0 002 1.2L10 21h4l.5-2.5a7 7 0 002-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  },
  {
    href: "/audit",
    label: "Audit log",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  },
];

export default function Sidebar() {
  const pathname = usePathname() ?? "";
  return (
    <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-60 shrink-0 flex-col gap-3 px-3 py-4 lg:flex">
      <Link
        href="/dashboard"
        className="group mb-2 flex items-center gap-2 px-2 py-1"
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-brand text-white shadow-glow">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path
              d="M4 7l8-4 8 4-8 4-8-4zm0 5l8 4 8-4M4 17l8 4 8-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="text-base font-semibold tracking-tight text-ink-900">
          Crawlix
        </span>
      </Link>

      <nav className="flex flex-col gap-1">
        {items.map((it) => {
          const active =
            pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link key={it.href} href={it.href} className="relative">
              <span className={`nav-link ${active ? "nav-link-active" : ""}`}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-4 w-4 shrink-0"
                >
                  <path
                    d={it.icon}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
                <span>{it.label}</span>
                {active && (
                  <motion.span
                    layoutId="nav-active-pill"
                    className="absolute inset-0 -z-10 rounded-xl bg-white/80 shadow-glass"
                    transition={{ type: "spring", bounce: 0.18, duration: 0.5 }}
                  />
                )}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-2 pb-2 text-[11px] text-ink-400">
        <p>© Crawlix · v0.1</p>
      </div>
    </aside>
  );
}
