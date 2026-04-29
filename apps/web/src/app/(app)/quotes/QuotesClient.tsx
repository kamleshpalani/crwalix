"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface QuoteItem {
  id?: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
}

interface Quote {
  id: string;
  number: string | null;
  title: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  shareToken: string | null;
  validUntil: string | null;
  createdAt: string;
  items: {
    id: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }[];
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(cents / 100);
}

const STATUS_TONES: Record<Quote["status"], string> = {
  DRAFT: "bg-ink-100 text-ink-700",
  SENT: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-rose-100 text-rose-800",
  EXPIRED: "bg-ink-200 text-ink-600",
};

export default function QuotesClient({
  initialQuotes,
}: {
  initialQuotes: Quote[];
}) {
  const router = useRouter();
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  const [showForm, setShowForm] = useState(false);

  // form state
  const [title, setTitle] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [discount, setDiscount] = useState(0);
  const [taxBps, setTaxBps] = useState(0);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [items, setItems] = useState<QuoteItem[]>([
    { description: "", quantity: 1, unitPriceCents: 0 },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const sub = items.reduce(
      (s, it) => s + Math.round(it.quantity * it.unitPriceCents),
      0,
    );
    const disc = Math.max(0, Math.min(sub, discount));
    const taxable = sub - disc;
    const tax = Math.round((taxable * taxBps) / 10_000);
    return { sub, disc, tax, total: taxable + tax };
  }, [items, discount, taxBps]);

  function setItem(idx: number, patch: Partial<QuoteItem>) {
    setItems((cur) =>
      cur.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  }
  function addItem() {
    setItems((cur) => [
      ...cur,
      { description: "", quantity: 1, unitPriceCents: 0 },
    ]);
  }
  function removeItem(idx: number) {
    setItems((cur) => (cur.length > 1 ? cur.filter((_, i) => i !== idx) : cur));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          currency,
          discountCents: discount,
          taxRateBps: taxBps,
          notes: notes || null,
          terms: terms || null,
          validUntil: validUntil ? new Date(validUntil).toISOString() : null,
          items,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.code ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { quote: Quote };
      setQuotes((cur) => [data.quote, ...cur]);
      setShowForm(false);
      setTitle("");
      setItems([{ description: "", quantity: 1, unitPriceCents: 0 }]);
      setDiscount(0);
      setTaxBps(0);
      setNotes("");
      setTerms("");
      setValidUntil("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendQuote(id: string) {
    const res = await fetch(`/api/v1/quotes/${id}/send`, { method: "POST" });
    if (res.ok) {
      const { quote } = (await res.json()) as { quote: Quote };
      setQuotes((cur) => cur.map((q) => (q.id === id ? quote : q)));
    }
  }

  async function deleteQuote(id: string) {
    if (!confirm("Delete this quote?")) return;
    const res = await fetch(`/api/v1/quotes/${id}`, { method: "DELETE" });
    if (res.ok) setQuotes((cur) => cur.filter((q) => q.id !== id));
  }

  function shareUrl(token: string | null): string | null {
    if (!token || typeof window === "undefined") return null;
    return `${window.location.origin}/quotes/share/${token}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          {showForm ? "Cancel" : "New quote"}
        </button>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="text-xs text-ink-500 hover:text-ink-800"
        >
          Refresh
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-glass backdrop-blur"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <input
              required
              maxLength={200}
              placeholder="Quote title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              maxLength={3}
              placeholder="USD"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm uppercase focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-ink-700">
              Line items
            </h3>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid gap-2 md:grid-cols-12">
                  <input
                    required
                    placeholder="Description"
                    value={it.description}
                    onChange={(e) =>
                      setItem(idx, { description: e.target.value })
                    }
                    className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm md:col-span-6 focus:border-emerald-500 focus:outline-none"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Qty"
                    value={it.quantity}
                    onChange={(e) =>
                      setItem(idx, { quantity: Number(e.target.value) })
                    }
                    className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm md:col-span-2 focus:border-emerald-500 focus:outline-none"
                  />
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="Unit (cents)"
                    value={it.unitPriceCents}
                    onChange={(e) =>
                      setItem(idx, { unitPriceCents: Number(e.target.value) })
                    }
                    className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm md:col-span-3 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="rounded-lg border border-ink-200 bg-white px-2 text-xs text-rose-600 hover:bg-rose-50 md:col-span-1"
                    disabled={items.length === 1}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addItem}
                className="text-xs text-emerald-700 hover:underline"
              >
                + Add line
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-xs text-ink-600">
              Discount (cents)
              <input
                type="number"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-xs text-ink-600">
              Tax rate (bps; 800 = 8%)
              <input
                type="number"
                min="0"
                max="20000"
                value={taxBps}
                onChange={(e) => setTaxBps(Number(e.target.value))}
                className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-xs text-ink-600">
              Valid until
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <textarea
              placeholder="Customer-facing notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-20 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <textarea
              placeholder="Terms and conditions"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="h-20 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-3 text-sm">
            <div className="space-y-0.5 text-ink-600">
              <div>Subtotal: {formatMoney(totals.sub, currency)}</div>
              <div>Discount: −{formatMoney(totals.disc, currency)}</div>
              <div>Tax: {formatMoney(totals.tax, currency)}</div>
            </div>
            <div className="text-lg font-semibold text-ink-900">
              Total: {formatMoney(totals.total, currency)}
            </div>
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Create quote"}
          </button>
        </form>
      )}

      <ul className="divide-y divide-ink-100 rounded-2xl border border-white/60 bg-white/70 shadow-glass backdrop-blur">
        {quotes.map((q) => {
          const url = shareUrl(q.shareToken);
          return (
            <li
              key={q.id}
              className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-500">
                    {q.number ?? "—"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONES[q.status]}`}
                  >
                    {q.status}
                  </span>
                </div>
                <p className="truncate text-sm font-medium text-ink-900">
                  {q.title}
                </p>
                <p className="text-xs text-ink-500">
                  {q.items.length} item{q.items.length === 1 ? "" : "s"} ·{" "}
                  {formatMoney(q.totalCents, q.currency)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {q.status === "DRAFT" && (
                  <button
                    type="button"
                    onClick={() => sendQuote(q.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700"
                  >
                    Send
                  </button>
                )}
                {url && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(url)}
                    className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-ink-700 hover:bg-ink-50"
                  >
                    Copy link
                  </button>
                )}
                {q.status === "DRAFT" && (
                  <button
                    type="button"
                    onClick={() => deleteQuote(q.id)}
                    className="rounded-lg px-2 py-1 text-rose-600 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {quotes.length === 0 && (
          <li className="p-6 text-center text-sm text-ink-500">
            No quotes yet.
          </li>
        )}
      </ul>
    </div>
  );
}
