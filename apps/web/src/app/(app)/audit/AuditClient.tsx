"use client";

import { useMemo, useState } from "react";

interface AuditEntry {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  target: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

const ACTION_TONES: Record<string, string> = {
  sign: "bg-emerald-100 text-emerald-800",
  pay: "bg-emerald-100 text-emerald-800",
  paid: "bg-emerald-100 text-emerald-800",
  send: "bg-amber-100 text-amber-800",
  send_: "bg-amber-100 text-amber-800",
  void: "bg-rose-100 text-rose-800",
  decline: "bg-rose-100 text-rose-800",
  cancel: "bg-rose-100 text-rose-800",
  delete: "bg-rose-100 text-rose-800",
};

function tone(action: string): string {
  for (const key of Object.keys(ACTION_TONES)) {
    if (action.includes(key)) return ACTION_TONES[key]!;
  }
  return "bg-ink-100 text-ink-700";
}

export default function AuditClient({
  initialEntries,
}: {
  initialEntries: AuditEntry[];
}) {
  const [entries] = useState<AuditEntry[]>(initialEntries);
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (
        actionFilter &&
        !e.action.toLowerCase().includes(actionFilter.toLowerCase())
      )
        return false;
      if (
        userFilter &&
        !(e.userEmail ?? "").toLowerCase().includes(userFilter.toLowerCase())
      )
        return false;
      return true;
    });
  }, [entries, actionFilter, userFilter]);

  const distinctActions = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.action);
    return Array.from(set).sort();
  }, [entries]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        >
          <option value="">All actions</option>
          {distinctActions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          placeholder="Filter by user email"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
      </div>

      <ul className="divide-y divide-ink-100 rounded-2xl border border-white/60 bg-white/70 shadow-glass backdrop-blur">
        {filtered.map((e) => {
          const isOpen = expanded === e.id;
          return (
            <li key={e.id} className="p-4">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : e.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone(e.action)}`}
                    >
                      {e.action}
                    </span>
                    {e.target && (
                      <span className="truncate font-mono text-[11px] text-ink-500">
                        {e.target}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink-600">
                    {e.userEmail ?? "system"}
                    {e.ip ? ` · ${e.ip}` : ""}
                  </p>
                </div>
                <span className="whitespace-nowrap text-xs text-ink-400">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </button>
              {isOpen && (
                <div className="mt-3 rounded-lg bg-ink-50 p-3 text-xs">
                  {e.metadata && (
                    <pre className="overflow-auto text-[11px]">
                      {JSON.stringify(e.metadata, null, 2)}
                    </pre>
                  )}
                  {e.userAgent && (
                    <p className="mt-2 text-[11px] text-ink-500">
                      UA: {e.userAgent}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="p-6 text-center text-sm text-ink-500">
            No matching entries.
          </li>
        )}
      </ul>
    </div>
  );
}
