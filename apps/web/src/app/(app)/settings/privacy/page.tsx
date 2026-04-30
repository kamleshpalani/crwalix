"use client";

/**
 * Privacy settings page — DSAR (Data Subject Access Requests).
 * Allows users to download their data (EXPORT) or request deletion (ERASE).
 */

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";

type DsarStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

interface DsarRequest {
  id: string;
  type: "EXPORT" | "ERASE";
  status: DsarStatus;
  exportUrl: string | null;
  exportExpiresAt: string | null;
  processedAt: string | null;
  createdAt: string;
}

const STATUS_BADGE: Record<DsarStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

export default function PrivacyPage() {
  const [requests, setRequests] = useState<DsarRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"EXPORT" | "ERASE" | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/me/dsar");
      const data = await res.json();
      setRequests(data.requests ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(type: "EXPORT" | "ERASE") {
    setSubmitting(type);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/me/dsar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setMessage({
            type: "error",
            text: "You already have a pending request of this type.",
          });
        } else {
          setMessage({
            type: "error",
            text: data?.error?.code ?? "Request failed.",
          });
        }
        return;
      }
      setMessage({
        type: "success",
        text:
          type === "EXPORT"
            ? "Export request submitted. You will be notified when your data is ready."
            : "Deletion request submitted. Your data will be anonymised shortly.",
      });
      await load();
    } finally {
      setSubmitting(null);
    }
  }

  const hasPendingExport = requests.some(
    (r) =>
      r.type === "EXPORT" &&
      (r.status === "PENDING" || r.status === "PROCESSING"),
  );
  const hasPendingErase = requests.some(
    (r) =>
      r.type === "ERASE" &&
      (r.status === "PENDING" || r.status === "PROCESSING"),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Privacy & data"
        icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        description="Manage your personal data in accordance with GDPR / data protection regulations."
      />

      {/* Action cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Export */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <svg
                className="h-5 w-5 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </span>
            <h3 className="font-semibold text-gray-900">Download my data</h3>
          </div>
          <p className="mb-4 text-sm text-gray-500">
            Request a copy of all personal data associated with your account.
            You&apos;ll receive a download link once the export is ready (within
            a few minutes).
          </p>
          <button
            onClick={() => submit("EXPORT")}
            disabled={submitting === "EXPORT" || hasPendingExport}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting === "EXPORT"
              ? "Submitting…"
              : hasPendingExport
                ? "Request pending…"
                : "Request export"}
          </button>
        </div>

        {/* Erase */}
        <div className="rounded-xl border border-red-100 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
              <svg
                className="h-5 w-5 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </span>
            <h3 className="font-semibold text-gray-900">Delete my data</h3>
          </div>
          <p className="mb-4 text-sm text-gray-500">
            Request erasure of your personal data (right to be forgotten). Your
            name, email, and contact details will be anonymised. Organisation
            data is retained per our data retention policy.
          </p>
          <button
            onClick={() => submit("ERASE")}
            disabled={submitting === "ERASE" || hasPendingErase}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting === "ERASE"
              ? "Submitting…"
              : hasPendingErase
                ? "Request pending…"
                : "Request deletion"}
          </button>
        </div>
      </div>

      {/* Feedback message */}
      {message && (
        <div
          className={`rounded-lg p-4 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Request history */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Request history
          </h3>
        </div>
        {loading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            Loading…
          </div>
        ) : requests.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            No requests yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {r.type === "EXPORT" ? "Data export" : "Data deletion"}
                  </p>
                  <p className="text-xs text-gray-500">
                    Submitted {new Date(r.createdAt).toLocaleDateString()}
                    {r.processedAt &&
                      ` · Completed ${new Date(r.processedAt).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {r.status === "COMPLETED" && r.exportUrl && (
                    <a
                      href={r.exportUrl}
                      download="crawlix-export.json"
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      Download
                    </a>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}
                  >
                    {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
