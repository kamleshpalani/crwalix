"use client";

import { useState } from "react";

interface Quote {
  id: string;
  number: string | null;
  title: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
  terms: string | null;
  validUntil: string | null;
  items: {
    id: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }[];
}

function fmt(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );
}

export default function QuoteShareClient({
  quote: initial,
  token,
}: {
  quote: Quote;
  token: string;
}) {
  const [quote, setQuote] = useState<Quote>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "accept" | "decline") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/quotes/share/${token}/${action}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { quote: updated } = (await res.json()) as { quote: Quote };
      setQuote(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-2xl border border-ink-100 bg-white p-8 shadow-sm">
        <header className="border-b border-ink-100 pb-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">
            Quote {quote.number}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900">
            {quote.title}
          </h1>
          {quote.validUntil && (
            <p className="mt-1 text-xs text-ink-500">
              Valid until {new Date(quote.validUntil).toLocaleDateString()}
            </p>
          )}
        </header>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-xs uppercase text-ink-500">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((it) => (
              <tr key={it.id} className="border-b border-ink-50">
                <td className="py-2 text-ink-900">{it.description}</td>
                <td className="py-2 text-right text-ink-700">{it.quantity}</td>
                <td className="py-2 text-right text-ink-700">
                  {fmt(it.unitPriceCents, quote.currency)}
                </td>
                <td className="py-2 text-right text-ink-900">
                  {fmt(it.lineTotalCents, quote.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between text-ink-600">
            <span>Subtotal</span>
            <span>{fmt(quote.subtotalCents, quote.currency)}</span>
          </div>
          {quote.discountCents > 0 && (
            <div className="flex justify-between text-ink-600">
              <span>Discount</span>
              <span>−{fmt(quote.discountCents, quote.currency)}</span>
            </div>
          )}
          {quote.taxCents > 0 && (
            <div className="flex justify-between text-ink-600">
              <span>Tax</span>
              <span>{fmt(quote.taxCents, quote.currency)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-semibold text-ink-900">
            <span>Total</span>
            <span>{fmt(quote.totalCents, quote.currency)}</span>
          </div>
        </div>

        {quote.notes && (
          <section className="mt-6 rounded-lg bg-ink-50 p-4 text-sm text-ink-700">
            <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">
              Notes
            </h3>
            <p className="mt-1 whitespace-pre-wrap">{quote.notes}</p>
          </section>
        )}
        {quote.terms && (
          <section className="mt-3 rounded-lg bg-ink-50 p-4 text-xs text-ink-600">
            <h3 className="font-medium uppercase tracking-wide text-ink-500">
              Terms
            </h3>
            <p className="mt-1 whitespace-pre-wrap">{quote.terms}</p>
          </section>
        )}

        <footer className="mt-8 border-t border-ink-100 pt-6">
          {quote.status === "SENT" && (
            <div className="flex flex-col items-stretch gap-3 sm:flex-row">
              <button
                type="button"
                disabled={busy}
                onClick={() => act("accept")}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                Accept quote
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => act("decline")}
                className="flex-1 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          )}
          {quote.status === "ACCEPTED" && (
            <p className="rounded-lg bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-800">
              Thanks — you accepted this quote on{" "}
              {/* server set acceptedAt; not in payload, so just say now */}
              record.
            </p>
          )}
          {quote.status === "DECLINED" && (
            <p className="rounded-lg bg-rose-50 p-4 text-center text-sm font-medium text-rose-800">
              You declined this quote.
            </p>
          )}
          {quote.status === "EXPIRED" && (
            <p className="rounded-lg bg-ink-100 p-4 text-center text-sm text-ink-700">
              This quote has expired. Please contact us for a new one.
            </p>
          )}
          {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
        </footer>
      </div>
    </div>
  );
}
