"use client";

import { useState } from "react";

interface LineItem {
  description: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
}

interface Invoice {
  id: string;
  number: string | null;
  title: string | null;
  status: "DRAFT" | "OPEN" | "PAID" | "UNCOLLECTIBLE" | "VOID";
  currency: string;
  customerName: string | null;
  customerEmail: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  amountDueCents: number;
  amountPaidCents: number;
  memo: string | null;
  lineItems: LineItem[];
  dueAt: string | null;
  paidAt: string | null;
}

function fmt(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );
}

export default function InvoiceShareClient({
  invoice,
  token,
}: {
  invoice: Invoice;
  token: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      // Module #15 wires this to Stripe Checkout via /api/v1/payments/checkout/share/[token]
      const res = await fetch(`/api/v1/payments/checkout/share/${token}`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.code ?? `HTTP ${res.status}`);
      }
      const { url } = (await res.json()) as { url?: string };
      if (url) window.location.href = url;
      else throw new Error("NO_URL");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-2xl border border-ink-100 bg-white p-8 shadow-sm">
        <header className="flex items-baseline justify-between border-b border-ink-100 pb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-500">
              Invoice {invoice.number}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-ink-900">
              {invoice.title ?? "Invoice"}
            </h1>
            {invoice.customerName && (
              <p className="mt-1 text-sm text-ink-600">
                For {invoice.customerName}
              </p>
            )}
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              invoice.status === "PAID"
                ? "bg-emerald-100 text-emerald-800"
                : invoice.status === "OPEN"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-ink-100 text-ink-700"
            }`}
          >
            {invoice.status}
          </span>
        </header>

        <table className="mt-6 w-full text-sm">
          <thead className="border-b border-ink-100 text-left text-xs uppercase text-ink-500">
            <tr>
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Unit</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((l, i) => (
              <tr key={i} className="border-b border-ink-50">
                <td className="py-2">{l.description}</td>
                <td className="py-2 text-right">{l.quantity}</td>
                <td className="py-2 text-right">
                  {fmt(l.unitCents, invoice.currency)}
                </td>
                <td className="py-2 text-right">
                  {fmt(l.totalCents, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-600">Subtotal</span>
            <span>{fmt(invoice.subtotalCents, invoice.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-600">Tax</span>
            <span>{fmt(invoice.taxCents, invoice.currency)}</span>
          </div>
          <div className="flex justify-between border-t border-ink-100 pt-1 font-semibold">
            <span>Total</span>
            <span>{fmt(invoice.totalCents, invoice.currency)}</span>
          </div>
          {invoice.amountPaidCents > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Paid</span>
              <span>{fmt(invoice.amountPaidCents, invoice.currency)}</span>
            </div>
          )}
          {invoice.amountDueCents > 0 && (
            <div className="flex justify-between font-semibold">
              <span>Amount due</span>
              <span>{fmt(invoice.amountDueCents, invoice.currency)}</span>
            </div>
          )}
        </div>

        {invoice.memo && (
          <p className="mt-6 whitespace-pre-wrap text-xs text-ink-600">
            {invoice.memo}
          </p>
        )}

        <footer className="mt-8 border-t border-ink-100 pt-6">
          {invoice.status === "OPEN" && invoice.amountDueCents > 0 && (
            <div className="space-y-2">
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <button
                type="button"
                disabled={busy}
                onClick={pay}
                className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy
                  ? "Redirecting…"
                  : `Pay ${fmt(invoice.amountDueCents, invoice.currency)}`}
              </button>
              <p className="text-center text-xs text-ink-500">
                Secure payment powered by Stripe.
              </p>
            </div>
          )}
          {invoice.status === "PAID" && (
            <p className="rounded-lg bg-emerald-50 p-4 text-center text-sm font-medium text-emerald-800">
              Paid in full
              {invoice.paidAt
                ? ` on ${new Date(invoice.paidAt).toLocaleDateString()}`
                : ""}
              . Thank you!
            </p>
          )}
          {invoice.status === "VOID" && (
            <p className="rounded-lg bg-ink-50 p-4 text-center text-sm font-medium text-ink-600">
              This invoice has been voided.
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
