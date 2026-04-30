"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Plan = "FREE" | "STARTER" | "GROWTH" | "SCALE";

interface BillingInvoice {
  id: string;
  number: string | null;
  status: string;
  totalCents: number;
  amountDueCents: number;
  currency: string;
  dueAt: string | null;
  paidAt: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
  createdAt: string;
}

interface Props {
  plan: Plan;
  isActive: boolean;
  stripeStatus?: string;
  currentPeriodEnd?: string;
  cancelAt?: string;
  hasStripeCustomer: boolean;
  starterPriceId: string | null;
  growthPriceId: string | null;
  scalePriceId: string | null;
}

const PLAN_DISPLAY: Record<
  Plan,
  { label: string; price: string; features: string[] }
> = {
  FREE: {
    label: "Free",
    price: "$0 / mo",
    features: [
      "100 leads",
      "5 searches / month",
      "10k AI tokens / month",
      "50 outbound emails / month",
    ],
  },
  STARTER: {
    label: "Starter",
    price: "$49 / mo",
    features: [
      "1,000 leads",
      "50 searches / month",
      "100k AI tokens / month",
      "500 emails / month",
      "AI proposals",
      "Outreach sequences",
    ],
  },
  GROWTH: {
    label: "Growth",
    price: "$149 / mo",
    features: [
      "10,000 leads",
      "200 searches / month",
      "500k AI tokens / month",
      "5,000 emails / month",
      "AI proposals",
      "Sequences",
      "Advanced CRM",
    ],
  },
  SCALE: {
    label: "Scale",
    price: "$399 / mo",
    features: [
      "100,000 leads",
      "1,000 searches / month",
      "2M AI tokens / month",
      "50,000 emails / month",
      "AI proposals",
      "Sequences",
      "Advanced CRM",
      "Priority support",
    ],
  },
};

function fmtDate(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

const INVOICE_STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-ink-100 text-ink-700",
  OPEN: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
  UNCOLLECTIBLE: "bg-rose-100 text-rose-800",
  VOID: "bg-ink-200 text-ink-600",
};

const ORDERED_PLANS: Plan[] = ["FREE", "STARTER", "GROWTH", "SCALE"];

interface PlanCardProps {
  p: Plan;
  currentPlan: Plan;
  priceId: string | null;
  loading: string | null;
  onCheckout: (priceId: string) => void;
}

function PlanCardCta({
  p,
  currentPlan,
  priceId,
  loading,
  onCheckout,
}: Readonly<PlanCardProps>) {
  const isCurrent = p === currentPlan;
  const isDowngrade =
    ORDERED_PLANS.indexOf(p) < ORDERED_PLANS.indexOf(currentPlan);

  if (isCurrent) {
    return (
      <span className="btn-secondary text-center text-xs opacity-60 cursor-default">
        Current plan
      </span>
    );
  }
  if (p === "FREE") {
    return (
      <span className="text-center text-xs text-ink-400">
        {isDowngrade ? "Contact support to downgrade" : "Free forever"}
      </span>
    );
  }
  if (!priceId) {
    return (
      <span className="text-center text-xs text-ink-400">Contact sales</span>
    );
  }
  let btnLabel = "Upgrade";
  if (loading === priceId) {
    btnLabel = "Redirecting\u2026";
  } else if (isDowngrade) {
    btnLabel = "Switch plan";
  }
  return (
    <button
      onClick={() => onCheckout(priceId)}
      disabled={loading === priceId}
      className="btn-primary text-sm"
    >
      {btnLabel}
    </button>
  );
}

function PlanCard(props: Readonly<PlanCardProps>) {
  const { p, currentPlan } = props;
  const info = PLAN_DISPLAY[p];
  const isCurrent = p === currentPlan;

  return (
    <div
      className={`rounded-xl border p-5 flex flex-col gap-4 transition-shadow ${
        isCurrent
          ? "border-accent-500 shadow-md bg-accent-50/40"
          : "border-ink-200 bg-white hover:shadow-sm"
      }`}
    >
      <div>
        <p className="font-semibold text-ink-900">{info.label}</p>
        <p className="text-sm text-ink-500 mt-0.5">{info.price}</p>
      </div>
      <ul className="space-y-1 flex-1">
        {info.features.map((f) => (
          <li key={f} className="text-xs text-ink-600 flex gap-1.5">
            <span className="text-emerald-500 mt-0.5">✓</span>
            {f}
          </li>
        ))}
      </ul>
      <PlanCardCta {...props} />
    </div>
  );
}

function InvoiceHistory({
  invoices,
}: Readonly<{ invoices: BillingInvoice[] | null }>) {
  if (invoices === null) {
    return <p className="text-sm text-ink-400">Loading…</p>;
  }
  if (invoices.length === 0) {
    return <p className="text-sm text-ink-400">No invoices yet.</p>;
  }
  return (
    <div className="glass divide-y divide-ink-100">
      {invoices.map((inv) => (
        <div
          key={inv.id}
          className="flex items-center justify-between px-5 py-3 text-sm"
        >
          <div className="flex items-center gap-3">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                INVOICE_STATUS_STYLE[inv.status] ?? "bg-ink-100 text-ink-700"
              }`}
            >
              {inv.status}
            </span>
            <span className="text-ink-700">
              {inv.number ?? inv.id.slice(-6).toUpperCase()}
            </span>
            <span className="text-ink-400 text-xs">
              {fmtDate(inv.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-ink-900 font-medium">
              {fmtMoney(inv.totalCents, inv.currency)}
            </span>
            {inv.hostedUrl && (
              <a
                href={inv.hostedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent-600 hover:underline"
              >
                View
              </a>
            )}
            {inv.pdfUrl && (
              <a
                href={inv.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent-600 hover:underline"
              >
                PDF
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BillingClient({
  plan,
  isActive,
  stripeStatus,
  currentPeriodEnd,
  cancelAt,
  hasStripeCustomer,
  starterPriceId,
  growthPriceId,
  scalePriceId,
}: Readonly<Props>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[] | null>(null);

  // Show success banner if redirected back from Stripe Checkout.
  useEffect(() => {
    if (searchParams.get("session")) {
      setToast("Subscription activated — welcome aboard!");
      router.replace("/settings/billing");
    }
  }, [searchParams, router]);

  // Load invoice history once.
  useEffect(() => {
    if (!hasStripeCustomer) return;
    fetch("/api/v1/billing/invoices")
      .then((r) => r.json())
      .then((data) => setInvoices(data.invoices ?? []))
      .catch(() => setInvoices([]));
  }, [hasStripeCustomer]);

  async function startCheckout(priceId: string) {
    setLoading(priceId);
    try {
      const res = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error?.code === "ALREADY_SUBSCRIBED") {
          await openPortal();
        } else {
          setToast("Could not start checkout — please try again.");
        }
        return;
      }
      if (data.url) globalThis.location.href = data.url;
    } catch {
      setToast("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  async function openPortal() {
    setLoading("portal");
    try {
      const res = await fetch("/api/v1/billing/portal", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        globalThis.location.href = data.url;
      } else {
        setToast("Could not open billing portal — please try again.");
      }
    } catch {
      setToast("Something went wrong.");
    } finally {
      setLoading(null);
    }
  }

  const priceIds: Record<Plan, string | null> = {
    FREE: null,
    STARTER: starterPriceId,
    GROWTH: growthPriceId,
    SCALE: scalePriceId,
  };

  const orderedPlans = ORDERED_PLANS;

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between">
          <span>{toast}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-4 text-emerald-600 hover:text-emerald-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* Current plan summary */}
      <div className="glass p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-500 font-medium">
              Current plan
            </p>
            <p className="text-2xl font-semibold text-ink-900 mt-1">
              {PLAN_DISPLAY[plan].label}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {stripeStatus && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  isActive
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {stripeStatus.replaceAll("_", " ")}
              </span>
            )}
            {hasStripeCustomer && (
              <button
                onClick={openPortal}
                disabled={loading === "portal"}
                className="btn-secondary text-sm"
              >
                {loading === "portal" ? "Opening…" : "Manage billing"}
              </button>
            )}
          </div>
        </div>

        {currentPeriodEnd && (
          <p className="text-sm text-ink-500">
            {cancelAt
              ? `Cancels on ${fmtDate(cancelAt)}`
              : `Renews on ${fmtDate(currentPeriodEnd)}`}
          </p>
        )}
      </div>

      {/* Plan cards */}
      <div>
        <h2 className="text-sm font-medium text-ink-700 mb-3">Plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {orderedPlans.map((p) => (
            <PlanCard
              key={p}
              p={p}
              currentPlan={plan}
              priceId={priceIds[p]}
              loading={loading}
              onCheckout={startCheckout}
            />
          ))}
        </div>
      </div>

      {/* Invoice history */}
      {hasStripeCustomer && (
        <div>
          <h2 className="text-sm font-medium text-ink-700 mb-3">
            Payment history
          </h2>
          <InvoiceHistory invoices={invoices} />
        </div>
      )}
    </div>
  );
}
