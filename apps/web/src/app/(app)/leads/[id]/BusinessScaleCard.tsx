"use client";

import { useState } from "react";
import { BUSINESS_SCALE_LABELS, type BusinessScale } from "@crawlix/shared";

type ScaleSignal = {
  signal?: string;
  weight?: number;
  scale?: string;
};

type ClassifyResponse = {
  scale: string;
  confidence: number;
  reasoning: string;
  signals: ScaleSignal[];
  inputs: {
    locationCount: number | null;
    revenueEstimate: string | null;
    employeeEstimate: number | null;
    linkedinEmployeeRange: string | null;
  };
};

function scaleTone(
  scale: string | null,
): "violet" | "rose" | "amber" | "emerald" | "slate" {
  if (!scale || scale === "UNKNOWN") return "slate";
  if (scale === "ENTERPRISE") return "violet";
  if (scale === "LARGE") return "rose";
  if (scale === "MEDIUM") return "amber";
  return "emerald"; // MICRO | SMALL
}

const TONE_CLASSES: Record<
  "violet" | "rose" | "amber" | "emerald" | "slate",
  string
> = {
  violet: "bg-violet-100 text-violet-800 border-violet-200",
  rose: "bg-rose-100 text-rose-800 border-rose-200",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
  slate: "bg-slate-100 text-slate-700 border-slate-200",
};

export interface BusinessScaleCardProps {
  leadId: string;
  scale: BusinessScale | string | null;
  confidence: number | null;
  signals: unknown;
  locationCount: number | null;
  revenueEstimate: string | null;
  employeeEstimate: number | null;
  linkedinEmployeeRange: string | null;
}

export default function BusinessScaleCard({
  leadId,
  scale: initialScale,
  confidence: initialConfidence,
  signals: initialSignals,
  locationCount: initialLocations,
  revenueEstimate: initialRevenue,
  employeeEstimate: initialEmployees,
  linkedinEmployeeRange: initialLinkedin,
}: BusinessScaleCardProps) {
  const [scale, setScale] = useState<string | null>(initialScale ?? null);
  const [confidence, setConfidence] = useState<number | null>(
    initialConfidence ?? null,
  );
  const [reasoning, setReasoning] = useState<string | null>(
    (initialSignals as { reasoning?: string } | null)?.reasoning ?? null,
  );
  const [signals, setSignals] = useState<ScaleSignal[]>(
    (initialSignals as { signals?: ScaleSignal[] } | null)?.signals ?? [],
  );

  const [locationCount, setLocationCount] = useState<string>(
    initialLocations != null ? String(initialLocations) : "",
  );
  const [revenueEstimate, setRevenueEstimate] = useState(initialRevenue ?? "");
  const [employeeEstimate, setEmployeeEstimate] = useState<string>(
    initialEmployees != null ? String(initialEmployees) : "",
  );
  const [linkedinEmployeeRange, setLinkedinEmployeeRange] = useState(
    initialLinkedin ?? "",
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function reclassify() {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (locationCount !== "") body.locationCount = Number(locationCount);
      if (revenueEstimate.trim()) body.revenueEstimate = revenueEstimate.trim();
      if (employeeEstimate !== "")
        body.employeeEstimate = Number(employeeEstimate);
      if (linkedinEmployeeRange.trim())
        body.linkedinEmployeeRange = linkedinEmployeeRange.trim();

      const res = await fetch(`/api/v1/leads/${leadId}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } };
        throw new Error(data.error?.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ClassifyResponse;
      setScale(data.scale);
      setConfidence(data.confidence);
      setReasoning(data.reasoning);
      setSignals(data.signals ?? []);
      setShowForm(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const tone = scaleTone(scale);
  const label =
    BUSINESS_SCALE_LABELS[(scale as BusinessScale) ?? "UNKNOWN"] ??
    "Unclassified";

  return (
    <div className="glass p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink-900">
            Business Size Classification
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}
            >
              {label}
            </span>
            {typeof confidence === "number" && confidence > 0 && (
              <span className="text-xs text-ink-600">
                confidence{" "}
                <span className="font-mono font-semibold">
                  {confidence}/100
                </span>
              </span>
            )}
          </div>
          {reasoning && (
            <p className="mt-2 text-sm text-ink-700">{reasoning}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="shrink-0 rounded-lg border border-white/40 bg-white/30 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-white/50 transition"
        >
          {showForm ? "Cancel" : "✎ Edit & Reclassify"}
        </button>
      </div>

      {/* Classification signals */}
      {signals.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Classification signals
          </h3>
          <ul className="divide-y divide-white/60 text-xs">
            {signals.slice(0, 10).map((s, i) => (
              <li
                key={`${s.scale ?? ""}-${i}`}
                className="flex items-center justify-between gap-3 py-1.5"
              >
                <span className="text-ink-700">{s.signal}</span>
                <span className="shrink-0 font-mono text-ink-400">
                  {s.scale} +{s.weight}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Extended-input form */}
      {showForm && (
        <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4 space-y-3">
          <p className="text-xs text-ink-500">
            Supply any publicly available data to improve classification
            accuracy. Leave fields blank to use the existing value.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-ink-700">
                Number of locations
              </span>
              <input
                type="number"
                min={1}
                max={100000}
                value={locationCount}
                onChange={(e) => setLocationCount(e.target.value)}
                placeholder="e.g. 3"
                className="w-full rounded-lg border border-white/60 bg-white/70 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-ink-700">
                Revenue estimate
              </span>
              <input
                type="text"
                value={revenueEstimate}
                onChange={(e) => setRevenueEstimate(e.target.value)}
                placeholder='e.g. "$1M–$10M"'
                className="w-full rounded-lg border border-white/60 bg-white/70 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <p className="text-[10px] text-ink-400">
                From publicly available sources only.
              </p>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-ink-700">
                Employee estimate
              </span>
              <input
                type="number"
                min={1}
                value={employeeEstimate}
                onChange={(e) => setEmployeeEstimate(e.target.value)}
                placeholder="e.g. 25"
                className="w-full rounded-lg border border-white/60 bg-white/70 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <p className="text-[10px] text-ink-400">
                From publicly available sources only.
              </p>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-ink-700">
                LinkedIn employee range
              </span>
              <input
                type="text"
                value={linkedinEmployeeRange}
                onChange={(e) => setLinkedinEmployeeRange(e.target.value)}
                placeholder='e.g. "11-50"'
                className="w-full rounded-lg border border-white/60 bg-white/70 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={() => void reclassify()}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow hover:brightness-110 disabled:opacity-60 transition"
          >
            {loading ? "Reclassifying…" : "↻ Reclassify"}
          </button>
        </div>
      )}

      {/* Stored inputs summary (when form is closed and any are set) */}
      {!showForm &&
        (locationCount ||
          revenueEstimate ||
          employeeEstimate ||
          linkedinEmployeeRange) && (
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-500 border-t border-white/40 pt-3">
            {locationCount && (
              <span>
                📍 <span className="font-medium">{locationCount}</span> location
                {Number(locationCount) > 1 ? "s" : ""}
              </span>
            )}
            {employeeEstimate && (
              <span>
                👥 ~<span className="font-medium">{employeeEstimate}</span>{" "}
                employees
              </span>
            )}
            {linkedinEmployeeRange && (
              <span>
                LinkedIn:{" "}
                <span className="font-medium">{linkedinEmployeeRange}</span>
              </span>
            )}
            {revenueEstimate && (
              <span>
                💰 <span className="font-medium">{revenueEstimate}</span>
              </span>
            )}
          </div>
        )}
    </div>
  );
}
