"use client";

import { useEffect, useState } from "react";

type ProjectFile = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export default function ProjectFilesPanel({
  projectId,
}: {
  projectId: string;
}) {
  const [items, setItems] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/v1/projects/${projectId}/files`;

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch(base);
      const j = await r.json();
      setItems(j.items ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      // Step 1: ask the server for a signed PUT URL.
      const reqRes = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "request-upload",
          filename: file.name,
        }),
      });
      if (!reqRes.ok) throw new Error("Failed to start upload");
      const { intent } = await reqRes.json();

      // Step 2: PUT the bytes directly to Supabase Storage.
      const putRes = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${intent.token}`,
          "content-type": file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      // Step 3: confirm + register in DB.
      const confirmRes = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm-upload",
          storagePath: intent.storagePath,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });
      if (!confirmRes.ok) throw new Error("Failed to register file");

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function download(id: string) {
    const r = await fetch(`${base}/${id}`);
    if (!r.ok) return;
    const j = await r.json();
    if (j.url) window.open(j.url, "_blank", "noopener");
  }

  async function remove(id: string) {
    if (!confirm("Delete this file?")) return;
    await fetch(`${base}/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <section className="glass p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink-900">Files</h2>
        <label className="cursor-pointer rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
          {uploading ? "Uploading…" : "+ Upload"}
          <input
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={onUpload}
          />
        </label>
      </div>

      {error && (
        <div className="mt-2 rounded bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </div>
      )}

      <ul className="mt-3 divide-y divide-white/60">
        {loading && <li className="py-3 text-sm text-ink-500">Loading…</li>}
        {!loading && items.length === 0 && (
          <li className="py-3 text-sm text-ink-500">No files yet.</li>
        )}
        {items.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-ink-900">
                {f.filename}
              </div>
              <div className="text-xs text-ink-500">
                {(f.sizeBytes / 1024).toFixed(1)} KB · {f.mimeType}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => download(f.id)}
                className="text-xs font-medium text-slate-700 hover:underline"
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => remove(f.id)}
                className="text-xs text-rose-700 hover:underline"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
