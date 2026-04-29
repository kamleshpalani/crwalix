"use client";

import { useState } from "react";

export default function PortalLoginPage({
  searchParams,
}: {
  searchParams: { e?: string };
}) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const error =
    searchParams.e === "expired"
      ? "Your link has expired. Request a new one below."
      : searchParams.e === "invalid"
        ? "That link wasn't valid. Try requesting a new one."
        : searchParams.e === "unconfigured"
          ? "The client portal isn't fully set up yet. Please contact your project team."
          : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      await fetch("/api/v1/portal/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">
        Sign in to your project
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Enter the email your project team invited. We&apos;ll send you a secure
        sign-in link.
      </p>

      {error ? (
        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      {submitted ? (
        <div className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          If that email has portal access, a sign-in link is on its way. The
          link expires in 30 minutes.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-600">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              placeholder="you@company.com"
            />
          </label>
          <button
            type="submit"
            disabled={pending || !email}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send sign-in link"}
          </button>
        </form>
      )}
    </div>
  );
}
