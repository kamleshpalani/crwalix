"use client";

import { useState } from "react";

interface VibeAnalysis {
  leadScore: number;
  shouldContact: boolean;
  vibe: string;
  painPoints: string[];
  recommendedService: string;
  recommendedPackage: string;
  outreachAngle: string;
  estimatedDealSize: string;
  conversionProbability: number;
  nextAction: string;
  coldEmail: string;
  whatsappMessage: string;
  callScript: string;
  followUpMessage: string;
  analyzedAt?: string;
  aiProvider?: string;
  aiModel?: string;
}

type OutreachTab = "email" | "whatsapp" | "call" | "followup";

function scoreTone(score: number): string {
  if (score >= 80) return "text-rose-600";
  if (score >= 60) return "text-amber-600";
  if (score >= 40) return "text-emerald-600";
  return "text-slate-500";
}

function scoreTier(score: number): string {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score >= 20) return "LOW";
  return "NOT RECOMMENDED";
}

function tierBg(score: number): string {
  if (score >= 80) return "bg-rose-50 border-rose-200";
  if (score >= 60) return "bg-amber-50 border-amber-200";
  if (score >= 40) return "bg-emerald-50 border-emerald-200";
  return "bg-slate-50 border-slate-200";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="rounded px-2 py-1 text-xs font-medium text-ink-600 hover:bg-white/60 transition"
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function OutreachBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="rounded-lg border border-white/40 bg-white/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          {label}
        </span>
        <CopyButton text={content} />
      </div>
      <pre className="whitespace-pre-wrap break-words text-sm text-ink-800 font-sans leading-relaxed">
        {content}
      </pre>
    </div>
  );
}

export default function VibeProspectCard({
  leadId,
  initial,
}: {
  leadId: string;
  initial: VibeAnalysis | null;
}) {
  const [analysis, setAnalysis] = useState<VibeAnalysis | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<OutreachTab>("email");

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/vibe`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as VibeAnalysis;
      setAnalysis(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const TABS: { id: OutreachTab; label: string }[] = [
    { id: "email", label: "Cold Email" },
    { id: "whatsapp", label: "WhatsApp" },
    { id: "call", label: "Call Script" },
    { id: "followup", label: "Follow-up" },
  ];

  const tabContent: Record<OutreachTab, string | undefined> = analysis
    ? {
        email: analysis.coldEmail,
        whatsapp: analysis.whatsappMessage,
        call: analysis.callScript,
        followup: analysis.followUpMessage,
      }
    : {
        email: undefined,
        whatsapp: undefined,
        call: undefined,
        followup: undefined,
      };

  return (
    <div className="rounded-2xl border border-white/40 bg-white/20 backdrop-blur shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/30 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <h2 className="text-base font-semibold text-ink-900">
            Vibe Prospecting
          </h2>
          {analysis && (
            <span className="text-xs text-ink-400">
              (via {analysis.aiProvider ?? "Claude"})
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void runAnalysis()}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow hover:brightness-110 disabled:opacity-60 transition"
        >
          {loading ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              Analysing…
            </>
          ) : analysis ? (
            "↻ Re-analyse with Claude"
          ) : (
            "✦ Analyse with Claude"
          )}
        </button>
      </div>

      {error && (
        <div className="mx-5 mt-4 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!analysis && !loading && (
        <div className="px-5 py-10 text-center text-sm text-ink-400">
          Click <strong>Analyse with Claude</strong> to generate AI-powered
          prospecting insights and personalised outreach for this lead.
        </div>
      )}

      {analysis && (
        <div className="space-y-5 p-5">
          {/* Score + Vibe */}
          <div
            className={`flex items-start gap-5 rounded-xl border p-4 ${tierBg(analysis.leadScore)}`}
          >
            <div className="flex flex-col items-center min-w-[64px]">
              <div
                className={`text-4xl font-bold ${scoreTone(analysis.leadScore)}`}
              >
                {analysis.leadScore}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-400 mt-0.5">
                Vibe Score
              </div>
              <div
                className={`mt-1 text-[11px] font-bold uppercase ${scoreTone(analysis.leadScore)}`}
              >
                {scoreTier(analysis.leadScore)}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-800 leading-snug">
                {analysis.vibe}
              </p>
              {analysis.analyzedAt && (
                <p className="mt-1 text-[11px] text-ink-400">
                  Analysed {new Date(analysis.analyzedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {/* Contact recommendation + conversion probability */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className={`rounded-xl border p-3 text-center ${
                analysis.shouldContact
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">
                Contact?
              </div>
              <div
                className={`text-lg font-bold ${
                  analysis.shouldContact ? "text-emerald-600" : "text-slate-500"
                }`}
              >
                {analysis.shouldContact ? "✓ Yes" : "✗ Skip"}
              </div>
            </div>
            <div className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1">
                Conversion
              </div>
              <div className="text-lg font-bold text-brand-600">
                {analysis.conversionProbability}%
              </div>
            </div>
          </div>

          {/* Pain points */}
          {analysis.painPoints.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                Pain Points
              </h3>
              <ul className="space-y-1">
                {analysis.painPoints.map((pt, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-ink-700"
                  >
                    <span className="mt-0.5 shrink-0 text-rose-400">●</span>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendation */}
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-brand-600 mb-0.5">
                  Recommended Service
                </div>
                <div className="text-sm font-semibold text-ink-900">
                  {analysis.recommendedService}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-600 mb-0.5">
                  Package
                </div>
                <div className="text-sm font-semibold text-ink-900">
                  {analysis.recommendedPackage}
                </div>
              </div>
            </div>
            {/* Deal size */}
            <div className="mt-3 pt-3 border-t border-brand-100 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-0.5">
                  Est. Deal Size
                </div>
                <div className="text-sm font-bold text-ink-900">
                  {analysis.estimatedDealSize}
                </div>
              </div>
            </div>
          </div>

          {/* Outreach angle */}
          {analysis.outreachAngle && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-1">
                Outreach Angle
              </div>
              <p className="text-sm text-ink-800">{analysis.outreachAngle}</p>
            </div>
          )}

          {/* Next action */}
          {analysis.nextAction && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-1">
                Suggested Next Action
              </div>
              <p className="text-sm font-medium text-ink-800">
                {analysis.nextAction}
              </p>
            </div>
          )}

          {/* Outreach tabs */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Outreach Content
            </h3>
            <div className="flex gap-1 rounded-lg bg-white/40 p-1 mb-3">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                    tab === t.id
                      ? "bg-white shadow text-ink-900"
                      : "text-ink-500 hover:text-ink-800"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tabContent[tab] && (
              <OutreachBlock
                label={TABS.find((t) => t.id === tab)?.label ?? ""}
                content={tabContent[tab]!}
              />
            )}
          </div>

          {analysis.aiModel && (
            <p className="text-[11px] text-ink-400 text-right">
              Powered by {analysis.aiModel}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
