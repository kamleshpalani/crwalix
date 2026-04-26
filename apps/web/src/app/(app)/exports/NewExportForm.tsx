'use client';

import { useState, useTransition } from 'react';
import { createExportAction } from './actions';

type Project = { id: string; name: string };
type Search = { id: string; name: string };

type SourceKind = 'filter' | 'project' | 'search';

export default function NewExportForm({
  projects,
  searches
}: {
  projects: Project[];
  searches: Search[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SourceKind>('filter');
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMsg(null);
          }}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + New export
        </button>
      ) : (
        <form
          action={(fd) => {
            setMsg(null);
            startTransition(async () => {
              const res = await createExportAction(fd);
              if (res.ok) {
                setMsg({ kind: 'ok', text: `Created export ${res.exportId.slice(0, 8)}` });
                setOpen(false);
              } else {
                setMsg({ kind: 'err', text: res.error });
              }
            });
          }}
          className="grid grid-cols-2 gap-3 glass p-4"
        >
          <div>
            <label className="block text-xs font-medium text-ink-700">Format</label>
            <select
              name="format"
              defaultValue="CSV"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="CSV">CSV</option>
              <option value="XLSX" disabled>
                XLSX (soon)
              </option>
              <option value="GOOGLE_SHEETS" disabled>
                Google Sheets (soon)
              </option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700">Source</label>
            <select
              name="sourceKind"
              value={kind}
              onChange={(e) => setKind(e.target.value as SourceKind)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="filter">All leads (filter)</option>
              <option value="project">Project</option>
              <option value="search">Search</option>
            </select>
          </div>

          {kind === 'project' && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-700">Project</label>
              <select
                name="projectId"
                required
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                {projects.length === 0 && <option value="">— no projects —</option>}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {kind === 'search' && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-700">Search</label>
              <select
                name="searchId"
                required
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                {searches.length === 0 && <option value="">— no searches —</option>}
                {searches.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {kind === 'filter' && (
            <>
              <div>
                <label className="block text-xs font-medium text-ink-700">Min score</label>
                <input
                  name="minScore"
                  type="number"
                  min={0}
                  max={100}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700">Priority tier</label>
                <select
                  name="priorityTier"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Any</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>
            </>
          )}

          <div className="col-span-2 flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? 'Creating…' : 'Create export'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setMsg(null);
              }}
              className="rounded-md px-4 py-2 text-sm text-ink-600 hover:text-ink-900"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {msg && (
        <div
          className={
            'mt-3 rounded-md p-3 text-sm ' +
            (msg.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200')
          }
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
