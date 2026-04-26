'use client';

import { useState, useTransition } from 'react';
import { createSearchAction } from './actions';

type Project = { id: string; name: string };

export default function NewSearchForm({
  projects,
  defaultProjectId
}: {
  projects: Project[];
  defaultProjectId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (projects.length === 0) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Create a <a href="/projects" className="underline">project</a> first before running a search.
      </div>
    );
  }

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
          + New search
        </button>
      ) : (
        <form
          action={(fd) => {
            setMsg(null);
            startTransition(async () => {
              const res = await createSearchAction(fd);
              if (res.ok) {
                setMsg({ kind: 'ok', text: `Queued search ${res.searchId.slice(0, 8)} · run ${res.runId.slice(0, 8)}` });
                setOpen(false);
              } else {
                setMsg({ kind: 'err', text: res.error });
              }
            });
          }}
          className="glass p-4 grid grid-cols-2 gap-3"
        >
          <div className="col-span-2">
            <label className="block text-xs font-medium text-ink-700">Project</label>
            <select
              name="projectId"
              required
              defaultValue={defaultProjectId ?? projects[0]?.id}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-ink-700">Name</label>
            <input
              name="name"
              required
              placeholder="e.g. Austin dentists — run 1"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-ink-700">Keyword / Search query</label>
            <input
              name="keyword"
              required
              placeholder="dentists in Austin, TX"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700">City (optional)</label>
            <input
              name="city"
              placeholder="Austin"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700">Country (ISO-2)</label>
            <input
              name="country"
              maxLength={2}
              defaultValue="US"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700">Result limit</label>
            <input
              name="resultLimit"
              type="number"
              min={1}
              max={500}
              defaultValue={20}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700">Provider</label>
            <select
              name="provider"
              defaultValue="google_places"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="google_places">Google Places</option>
              <option value="foursquare" disabled>Foursquare (soon)</option>
              <option value="yelp_fusion" disabled>Yelp (soon)</option>
              <option value="osm" disabled>OpenStreetMap (soon)</option>
            </select>
          </div>

          <div className="col-span-2 flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? 'Queuing…' : 'Run search'}
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
