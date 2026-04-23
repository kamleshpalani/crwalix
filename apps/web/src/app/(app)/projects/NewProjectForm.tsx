'use client';

import { useState, useTransition } from 'react';
import { createProjectAction } from './actions';

export default function NewProjectForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + New project
        </button>
      ) : (
        <form
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const res = await createProjectAction(fd);
              if (res.ok) setOpen(false);
              else setError(res.error);
            });
          }}
          className="rounded-md border border-slate-200 bg-white p-4 space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-slate-700">Name</label>
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="e.g. Austin dentists"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Description</label>
            <textarea
              name="description"
              maxLength={500}
              rows={2}
              placeholder="Optional"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <div className="text-xs text-rose-600">{error}</div>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-md px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
