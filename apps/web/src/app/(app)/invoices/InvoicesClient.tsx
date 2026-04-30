"use client";

import { useMemo, useState } from "react";

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
  amountPaidCents: number;
  amountDueCents: number;
  shareToken: string | null;
  stripeInvoiceId: string | null;
  hostedUrl: string | null;
  dueAt: string | null;
  paidAt: string | null;
  lineItems: LineItem[];
  createdAt: string;
}

const STATUS_TONES: Record<Invoice["status"], string> = {
  DRAFT: "bg-ink-100 text-ink-700",
  OPEN: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
  UNCOLLECTIBLE: "bg-rose-100 text-rose-800",
  VOID: "bg-ink-200 text-ink-600",
};

function fmt(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );
}

interface DraftLine {
  description: string;
  quantity: string;
  unitCents: string;
}

export default function InvoicesClient({
  initialInvoices,
}: {
  initialInvoices: Invoice[];
}) {
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [memo, setMemo] = useState("");
  const [taxRatePct, setTaxRatePct] = useState("0");
  const [dueAt, setDueAt] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { description: "", quantity: "1", unitCents: "0" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const subtotalCents = lines.reduce((s, l) => {
      const q = Math.max(0, parseInt(l.quantity || "0", 10) || 0);
      const u = Math.max(0, Math.round(parseFloat(l.unitCents || "0") * 100));
      return s + q * u;
    }, 0);
    const tax = Math.round(
      (subtotalCents * (parseFloat(taxRatePct || "0") || 0)) / 100,
    );
    return { subtotalCents, taxCents: tax, totalCents: subtotalCents + tax };
  }, [lines, taxRatePct]);

  function addLine() {
    setLines((cur) => [
      ...cur,
      { description: "", quantity: "1", unitCents: "0" },
    ]);
  }
  function removeLine(idx: number) {
    setLines((cur) => cur.filter((_, i) => i !== idx));
  }
  function setLine(idx: number, key: keyof DraftLine, value: string) {
    setLines((cur) =>
      cur.map((l, i) => (i === idx ? { ...l, [key]: value } : l)),
    );
  }

  function shareUrl(token: string | null) {
    if (!token || typeof window === "undefined") return null;
    return `${window.location.origin}/invoices/share/${token}`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const lineItems = lines
        .filter((l) => l.description.trim().length > 0)
        .map((l) => ({
          description: l.description.trim(),
          quantity: parseInt(l.quantity, 10) || 0,
          unitCents: Math.round(parseFloat(l.unitCents) * 100) || 0,
        }));
      const res = await fetch("/api/v1/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title || null,
          customerName: customerName || null,
          customerEmail: customerEmail || null,
          memo: memo || null,
          lineItems,
          taxRatePct: parseFloat(taxRatePct) || 0,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.code ?? `HTTP ${res.status}`);
      }
      const { invoice } = (await res.json()) as { invoice: Invoice };
      setInvoices((cur) => [invoice, ...cur]);
      setShowForm(false);
      setTitle("");
      setCustomerName("");
      setCustomerEmail("");
      setMemo("");
      setTaxRatePct("0");
      setDueAt("");
      setLines([{ description: "", quantity: "1", unitCents: "0" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function send(id: string) {
    const res = await fetch(`/api/v1/invoices/${id}/send`, { method: "POST" });
    if (res.ok) {
      const { invoice } = (await res.json()) as { invoice: Invoice };
      setInvoices((cur) => cur.map((i) => (i.id === id ? invoice : i)));
    }
  }

  async function markPaid(id: string) {
    if (!confirm("Mark this invoice as paid?")) return;
    const res = await fetch(`/api/v1/invoices/${id}/mark-paid`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "manual" }),
    });
    if (res.ok) {
      const { invoice } = (await res.json()) as { invoice: Invoice };
      setInvoices((cur) => cur.map((i) => (i.id === id ? invoice : i)));
    }
  }

  async function voidInv(id: string) {
    if (!confirm("Void this invoice?")) return;
    const res = await fetch(`/api/v1/invoices/${id}/void`, { method: "POST" });
    if (res.ok) {
      const { invoice } = (await res.json()) as { invoice: Invoice };
      setInvoices((cur) => cur.map((i) => (i.id === id ? invoice : i)));
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this draft invoice?")) return;
    const res = await fetch(`/api/v1/invoices/${id}`, { method: "DELETE" });
    if (res.ok) setInvoices((cur) => cur.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          {showForm ? "Cancel" : "New invoice"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-glass backdrop-blur"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <input
              maxLength={200}
              placeholder="Invoice title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              maxLength={200}
              placeholder="Customer name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              type="email"
              maxLength={200}
              placeholder="Customer email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-700">Line items</p>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <input
                  required
                  placeholder="Description"
                  value={l.description}
                  onChange={(e) => setLine(i, "description", e.target.value)}
                  className="col-span-6 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Qty"
                  value={l.quantity}
                  onChange={(e) => setLine(i, "quantity", e.target.value)}
                  className="col-span-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Unit price"
                  value={l.unitCents}
                  onChange={(e) => setLine(i, "unitCents", e.target.value)}
                  className="col-span-3 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  disabled={lines.length === 1}
                  className="col-span-1 text-xs text-rose-600 hover:underline disabled:opacity-30"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addLine}
              className="text-xs font-medium text-emerald-700 hover:underline"
            >
              + Add line
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="text-xs text-ink-600">
              Tax rate %
              <input
                type="number"
                min={0}
                step="0.01"
                value={taxRatePct}
                onChange={(e) => setTaxRatePct(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <div className="col-span-2 md:col-span-3 self-end rounded-lg bg-ink-50 px-4 py-2 text-right text-sm">
              <div>Subtotal: {fmt(totals.subtotalCents, "USD")}</div>
              <div>Tax: {fmt(totals.taxCents, "USD")}</div>
              <div className="font-semibold">
                Total: {fmt(totals.totalCents, "USD")}
              </div>
            </div>
          </div>

          <textarea
            placeholder="Memo (optional)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="h-20 w-full resize-y rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Create invoice"}
          </button>
        </form>
      )}

      <ul className="divide-y divide-ink-100 rounded-2xl border border-white/60 bg-white/70 shadow-glass backdrop-blur">
        {invoices.map((inv) => {
          const url = shareUrl(inv.shareToken);
          const stripe = !!inv.stripeInvoiceId;
          return (
            <li
              key={inv.id}
              className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-500">
                    {inv.number ?? "—"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONES[inv.status]}`}
                  >
                    {inv.status}
                  </span>
                  {stripe && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                      Stripe
                    </span>
                  )}
                </div>
                <p className="truncate text-sm font-medium text-ink-900">
                  {inv.title ?? inv.customerName ?? "Untitled"}
                </p>
                <p className="text-xs text-ink-500">
                  {fmt(inv.totalCents, inv.currency)}
                  {inv.amountDueCents > 0
                    ? ` · due ${fmt(inv.amountDueCents, inv.currency)}`
                    : ""}
                  {inv.dueAt
                    ? ` · ${new Date(inv.dueAt).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {!stripe && inv.status === "DRAFT" && (
                  <button
                    type="button"
                    onClick={() => send(inv.id)}
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
                {inv.hostedUrl && (
                  <a
                    href={inv.hostedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-ink-700 hover:bg-ink-50"
                  >
                    View
                  </a>
                )}
                {!stripe && inv.status === "OPEN" && (
                  <button
                    type="button"
                    onClick={() => markPaid(inv.id)}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-800 hover:bg-emerald-100"
                  >
                    Mark paid
                  </button>
                )}
                {!stripe &&
                  (inv.status === "DRAFT" || inv.status === "OPEN") && (
                    <button
                      type="button"
                      onClick={() => voidInv(inv.id)}
                      className="rounded-lg px-2 py-1 text-ink-500 hover:underline"
                    >
                      Void
                    </button>
                  )}
                {!stripe && inv.status === "DRAFT" && (
                  <button
                    type="button"
                    onClick={() => remove(inv.id)}
                    className="rounded-lg px-2 py-1 text-rose-600 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {invoices.length === 0 && (
          <li className="p-6 text-center text-sm text-ink-500">
            No invoices yet.
          </li>
        )}
      </ul>
    </div>
  );
}
