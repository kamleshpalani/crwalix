"use client";

import { useState } from "react";

interface Initial {
  slug: string;
  name: string;
  plan: string;
  status: string;
  billingStatus: string;
  companyEmail: string;
  companyPhone: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  aiUsageLimit: number | null;
  leadSearchLimit: number | null;
}

const STATUS_TONES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  SUSPENDED: "bg-rose-100 text-rose-800",
  PENDING: "bg-amber-100 text-amber-800",
  DELETED: "bg-ink-200 text-ink-600",
};

const BILLING_TONES: Record<string, string> = {
  TRIAL: "bg-indigo-100 text-indigo-700",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  PAST_DUE: "bg-amber-100 text-amber-800",
  CANCELED: "bg-rose-100 text-rose-800",
  NONE: "bg-ink-100 text-ink-700",
};

export default function OrganizationForm({
  canEdit,
  initial,
}: {
  canEdit: boolean;
  initial: Initial;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  function set<K extends keyof Initial>(k: K, val: Initial[K]) {
    setV((cur) => ({ ...cur, [k]: val }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/organization/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: v.name.trim(),
          companyEmail: v.companyEmail.trim() || null,
          companyPhone: v.companyPhone.trim() || null,
          website: v.website.trim() || null,
          addressLine1: v.addressLine1.trim() || null,
          addressLine2: v.addressLine2.trim() || null,
          city: v.city.trim() || null,
          state: v.state.trim() || null,
          postalCode: v.postalCode.trim() || null,
          country: v.country.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.code ?? `HTTP ${res.status}`);
      setMsg({ kind: "ok", text: "Saved." });
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Failed",
      });
    } finally {
      setBusy(false);
    }
  }

  const Field = ({
    label,
    k,
    placeholder,
    type = "text",
  }: {
    label: string;
    k: keyof Initial;
    placeholder?: string;
    type?: string;
  }) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-ink-700">{label}</label>
      <input
        type={type}
        value={(v[k] as string | null) ?? ""}
        onChange={(e) => set(k, e.target.value as Initial[typeof k])}
        placeholder={placeholder}
        disabled={!canEdit}
        className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none disabled:bg-ink-50 disabled:text-ink-600"
      />
    </div>
  );

  return (
    <form
      onSubmit={save}
      className="space-y-5 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-glass backdrop-blur"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            STATUS_TONES[v.status] ?? "bg-ink-100 text-ink-700"
          }`}
        >
          {v.status}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            BILLING_TONES[v.billingStatus] ?? "bg-ink-100 text-ink-700"
          }`}
        >
          Billing: {v.billingStatus}
        </span>
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-700">
          Plan: {v.plan}
        </span>
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-700">
          Slug: {v.slug}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Company name" k="name" />
        <Field label="Company email" k="companyEmail" type="email" />
        <Field label="Company phone" k="companyPhone" />
        <Field label="Website" k="website" placeholder="https://example.com" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Address line 1" k="addressLine1" />
        <Field label="Address line 2" k="addressLine2" />
        <Field label="City" k="city" />
        <Field label="State / Region" k="state" />
        <Field label="Postal code" k="postalCode" />
        <Field label="Country" k="country" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-700">
            AI usage limit
          </label>
          <input
            value={v.aiUsageLimit ?? ""}
            disabled
            className="w-full rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-600"
          />
          <p className="text-[11px] text-ink-500">
            {v.aiUsageLimit == null ? "Unlimited (set by platform admin)" : ""}
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-700">
            Lead search limit
          </label>
          <input
            value={v.leadSearchLimit ?? ""}
            disabled
            className="w-full rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-600"
          />
          <p className="text-[11px] text-ink-500">
            {v.leadSearchLimit == null
              ? "Unlimited (set by platform admin)"
              : ""}
          </p>
        </div>
      </div>

      {msg && (
        <p
          className={`text-xs ${msg.kind === "ok" ? "text-emerald-700" : "text-rose-600"}`}
        >
          {msg.text}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !canEdit}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
      >
        {!canEdit
          ? "Admins/owners only"
          : busy
            ? "Saving…"
            : "Save organization"}
      </button>
    </form>
  );
}
