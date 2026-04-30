import Link from "next/link";
import PageHeader from "@/components/PageHeader";

const REPORTS = [
  {
    href: "/reports/leads",
    title: "Leads",
    description: "Intake volume, top sources, and lifecycle status mix.",
    icon: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2",
  },
  {
    href: "/reports/sales",
    title: "Sales",
    description: "Pipeline conversion, win rate, and won revenue.",
    icon: "M3 17l6-6 4 4 8-8",
  },
  {
    href: "/reports/billing",
    title: "Billing",
    description: "Invoicing, collections, MRR, and outstanding balances.",
    icon: "M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z",
  },
];

export default function ReportsHubPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Insights"
        icon="M9 19V6l12-3v13"
        description="High-level dashboards across lead generation, sales, and billing."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {REPORTS.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="glass rounded-2xl p-5 transition hover:shadow-md"
          >
            <h2 className="text-base font-semibold text-ink-900">{r.title}</h2>
            <p className="mt-2 text-sm text-ink-600">{r.description}</p>
            <p className="mt-4 text-sm font-medium text-brand-600">
              Open \u2192
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
