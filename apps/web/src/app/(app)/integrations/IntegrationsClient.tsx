"use client";

import { useState } from "react";

interface CatalogEntry {
  key: string;
  label: string;
  description: string;
  auth: "oauth" | "api_key" | "webhook";
  icon: string;
}

interface Integration {
  id: string;
  provider: string;
  label: string;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  accountLabel: string | null;
  config: Record<string, unknown> | null;
  lastError: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_TONES: Record<Integration["status"], string> = {
  CONNECTED: "bg-emerald-100 text-emerald-800",
  DISCONNECTED: "bg-ink-100 text-ink-700",
  ERROR: "bg-rose-100 text-rose-800",
};

export default function IntegrationsClient({
  initialIntegrations,
  catalog,
}: {
  initialIntegrations: Integration[];
  catalog: CatalogEntry[];
}) {
  const [integrations, setIntegrations] =
    useState<Integration[]>(initialIntegrations);
  const [active, setActive] = useState<CatalogEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function findFor(provider: string): Integration | undefined {
    return integrations.find((i) => i.provider === provider);
  }

  async function reload() {
    const r = await fetch("/api/v1/integrations").then((x) => x.json());
    setIntegrations(r.integrations);
  }

  async function handleConnect(form: FormData) {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const credentials: Record<string, unknown> = {};
      const config: Record<string, unknown> = {};
      const accountLabel = (form.get("accountLabel") as string | null) || null;

      if (active.auth === "webhook") {
        const url = form.get("url") as string;
        if (!url) throw new Error("Webhook URL required");
        credentials.url = url;
      } else if (active.auth === "api_key") {
        const apiKey = form.get("apiKey") as string;
        if (!apiKey) throw new Error("API key required");
        credentials.apiKey = apiKey;
      } else {
        // oauth — placeholder until OAuth flow is wired.
        const accessToken = form.get("accessToken") as string;
        if (!accessToken) throw new Error("Access token required");
        credentials.accessToken = accessToken;
      }

      const res = await fetch("/api/v1/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: active.key,
          accountLabel,
          credentials,
          config,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.code ?? `HTTP ${res.status}`);
      }
      await reload();
      setActive(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function action(provider: string, op: "disconnect" | "test" | "sync") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/integrations/${provider}/${op}`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.code ?? `HTTP ${res.status}`);
      if (op === "test" && !body.ok) {
        setError(body.message ?? "Test failed");
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {catalog.map((c) => {
          const found = findFor(c.key);
          return (
            <div
              key={c.key}
              className="flex flex-col gap-3 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-glass backdrop-blur"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-brand text-white">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="h-5 w-5"
                  >
                    <path
                      d={c.icon}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink-900">
                      {c.label}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        found
                          ? STATUS_TONES[found.status]
                          : "bg-ink-100 text-ink-600"
                      }`}
                    >
                      {found?.status ?? "DISCONNECTED"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-600">{c.description}</p>
                  {found?.accountLabel && (
                    <p className="mt-1 text-[11px] text-ink-500">
                      {found.accountLabel}
                    </p>
                  )}
                  {found?.lastError && (
                    <p className="mt-1 text-[11px] text-rose-600">
                      {found.lastError}
                    </p>
                  )}
                  {found?.lastSyncedAt && (
                    <p className="mt-1 text-[11px] text-ink-400">
                      Last synced{" "}
                      {new Date(found.lastSyncedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {found?.status === "CONNECTED" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => action(c.key, "test")}
                      disabled={busy}
                      className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => action(c.key, "sync")}
                      disabled={busy}
                      className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
                    >
                      Sync now
                    </button>
                    <button
                      type="button"
                      onClick={() => action(c.key, "disconnect")}
                      disabled={busy}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActive(c)}
                    disabled={busy}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4">
          <form
            action={handleConnect}
            className="w-full max-w-md space-y-3 rounded-2xl border border-white/60 bg-white p-5 shadow-2xl"
          >
            <h2 className="text-base font-semibold text-ink-900">
              Connect {active.label}
            </h2>
            <p className="text-xs text-ink-600">{active.description}</p>

            <div className="space-y-1">
              <label className="text-xs font-medium text-ink-700">
                Account label (optional)
              </label>
              <input
                name="accountLabel"
                placeholder="e.g. Sales workspace"
                className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {active.auth === "webhook" && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">
                  Webhook URL
                </label>
                <input
                  name="url"
                  required
                  placeholder="https://hooks.slack.com/..."
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            )}
            {active.auth === "api_key" && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">
                  API key
                </label>
                <input
                  name="apiKey"
                  type="password"
                  required
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            )}
            {active.auth === "oauth" && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">
                  Access token
                </label>
                <input
                  name="accessToken"
                  type="password"
                  required
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
                <p className="text-[11px] text-ink-500">
                  OAuth flow not yet wired — paste a token for now.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActive(null)}
                disabled={busy}
                className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "Connecting…" : "Connect"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
