"use client";

/**
 * Developer settings — API key management (Phase 5.8).
 *
 * Lists active API keys, creates new keys (showing plaintext once),
 * and allows individual key revocation.
 */

import { useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function DeveloperPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const plaintextRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/developer/api-keys");
      const data = await res.json();
      setKeys(data.keys ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    setCreatedKey(null);
    try {
      const res = await fetch("/api/v1/developer/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Failed to create key.");
        return;
      }
      setCreatedKey(data.key.plaintext);
      setNewKeyName("");
      await load();
      // Auto-select the displayed plaintext so the user can easily copy.
      setTimeout(() => plaintextRef.current?.select(), 100);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (
      !confirm(
        "Revoke this API key? Any integrations using it will stop working immediately.",
      )
    )
      return;
    setRevoking(id);
    try {
      await fetch(`/api/v1/developer/api-keys/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Developer"
        title="API keys"
        icon="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
        description="Generate API keys for programmatic access. Keys are shown once — store them securely."
      />

      {/* Create new key */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">
          Create new key
        </h3>
        <form onSubmit={handleCreate} className="flex items-end gap-3">
          <div className="flex-1">
            <label
              htmlFor="key-name"
              className="mb-1.5 block text-xs font-medium text-gray-700"
            >
              Key name
            </label>
            <input
              id="key-name"
              type="text"
              placeholder="e.g. CI/CD pipeline, Zapier integration"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              maxLength={100}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !newKeyName.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create key"}
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      {/* Newly created key — shown once */}
      {createdKey && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6">
          <div className="mb-2 flex items-center gap-2">
            <svg
              className="h-5 w-5 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <p className="text-sm font-semibold text-green-800">
              API key created — copy it now
            </p>
          </div>
          <p className="mb-3 text-xs text-green-700">
            This is the only time this key will be shown. It cannot be
            recovered.
          </p>
          <div className="flex items-center gap-2">
            <input
              ref={plaintextRef}
              type="text"
              readOnly
              value={createdKey}
              className="flex-1 rounded-lg border border-green-300 bg-white px-3 py-2 font-mono text-xs text-gray-800"
            />
            <button
              onClick={() => {
                void navigator.clipboard.writeText(createdKey);
              }}
              className="rounded-lg border border-green-300 bg-white px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-100"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Keys list */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Active keys {!loading && `(${keys.length} / 10)`}
          </h3>
        </div>
        {loading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            Loading…
          </div>
        ) : keys.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            No API keys yet. Create one above.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{k.name}</p>
                  <p className="font-mono text-xs text-gray-400">
                    {k.keyPrefix}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt
                      ? ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                      : " · Never used"}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(k.id)}
                  disabled={revoking === k.id}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {revoking === k.id ? "Revoking…" : "Revoke"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Usage instructions */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-6">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">
          Using your API key
        </h3>
        <p className="mb-3 text-xs text-gray-500">
          Pass the key in the <code className="font-mono">Authorization</code>{" "}
          header on every request:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-green-400">
          {`curl https://your-crawlix-url/api/v1/leads \\
  -H "Authorization: Bearer ck_live_..."`}
        </pre>
      </div>
    </div>
  );
}
