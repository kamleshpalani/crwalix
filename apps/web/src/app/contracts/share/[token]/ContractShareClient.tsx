"use client";

import { useState } from "react";

interface Contract {
  id: string;
  number: string | null;
  title: string;
  status: "SENT" | "SIGNED" | "DECLINED";
  bodyMarkdown: string;
  counterpartyName: string | null;
  signedName: string | null;
  signedAt: string | null;
  expiresAt: string | null;
}

export default function ContractShareClient({
  contract: initial,
  token,
}: {
  contract: Contract;
  token: string;
}) {
  const [contract, setContract] = useState<Contract>(initial);
  const [typedName, setTypedName] = useState(contract.counterpartyName ?? "");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sign() {
    if (!agreed) {
      setError("Please confirm you agree before signing.");
      return;
    }
    if (typedName.trim().length < 2) {
      setError("Type your full legal name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/contracts/share/${token}/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ typedName: typedName.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { contract: updated } = (await res.json()) as {
        contract: Contract;
      };
      setContract(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/contracts/share/${token}/decline`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { contract: updated } = (await res.json()) as {
        contract: Contract;
      };
      setContract(updated);
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
            Contract {contract.number}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900">
            {contract.title}
          </h1>
          {contract.expiresAt && (
            <p className="mt-1 text-xs text-ink-500">
              Expires {new Date(contract.expiresAt).toLocaleDateString()}
            </p>
          )}
        </header>

        <article className="prose prose-sm mt-6 max-w-none whitespace-pre-wrap font-serif text-ink-800">
          {contract.bodyMarkdown}
        </article>

        <footer className="mt-8 border-t border-ink-100 pt-6">
          {contract.status === "SENT" && (
            <div className="space-y-3">
              <label className="block text-xs text-ink-600">
                Type your full legal name to sign
                <input
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </label>
              <label className="flex items-start gap-2 text-xs text-ink-700">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I have read and agree to the terms of this contract. I
                  understand that typing my name and clicking Sign creates a
                  legally binding electronic signature.
                </span>
              </label>
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  disabled={busy}
                  onClick={sign}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  Sign
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={decline}
                  className="flex-1 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          )}
          {contract.status === "SIGNED" && (
            <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="font-medium">
                Signed by {contract.signedName} on{" "}
                {contract.signedAt
                  ? new Date(contract.signedAt).toLocaleString()
                  : ""}
                .
              </p>
              <p className="mt-1 text-xs">
                A tamper-evidence hash of the document was recorded at signing.
              </p>
            </div>
          )}
          {contract.status === "DECLINED" && (
            <p className="rounded-lg bg-rose-50 p-4 text-center text-sm font-medium text-rose-800">
              You declined this contract.
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
