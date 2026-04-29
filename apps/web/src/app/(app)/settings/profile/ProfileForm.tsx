"use client";

import { useState } from "react";

export default function ProfileForm({
  initial,
}: {
  initial: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    status: string;
    isSuperAdmin: boolean;
    lastLoginAt: string | null;
    createdAt: string;
  };
}) {
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [phone, setPhone] = useState(initial.phone);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          phone: phone.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.code ?? `HTTP ${res.status}`);
      setMsg({ kind: "ok", text: "Saved." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="space-y-4 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-glass backdrop-blur"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-700">First name</label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-700">Last name</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-700">Email</label>
          <input
            value={initial.email}
            disabled
            className="w-full rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-600"
          />
          <p className="text-[11px] text-ink-500">
            Change via your sign-in provider.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-700">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs text-ink-600 md:grid-cols-4">
        <div>
          <dt className="text-ink-500">Status</dt>
          <dd className="font-medium text-ink-900">{initial.status}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Super admin</dt>
          <dd className="font-medium text-ink-900">
            {initial.isSuperAdmin ? "Yes" : "No"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">Last login</dt>
          <dd className="font-medium text-ink-900">
            {initial.lastLoginAt
              ? new Date(initial.lastLoginAt).toLocaleString()
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">Created</dt>
          <dd className="font-medium text-ink-900">
            {new Date(initial.createdAt).toLocaleDateString()}
          </dd>
        </div>
      </dl>

      {msg && (
        <p
          className={`text-xs ${msg.kind === "ok" ? "text-emerald-700" : "text-rose-600"}`}
        >
          {msg.text}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
