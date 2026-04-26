'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateProjectAction, deleteProjectAction } from '../actions';

export default function ProjectEditForm({
  id,
  name,
  description
}: {
  id: string;
  name: string;
  description: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!editing) {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => setEditing(true)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-white/70"
        >
          Edit
        </button>
        <form
          action={(fd) => {
            if (!confirm('Delete this project and all its searches/leads links?')) return;
            startTransition(async () => {
              await deleteProjectAction(fd);
              router.push('/projects');
            });
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md border border-rose-300 bg-white px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form
      action={(fd) => {
        setMsg(null);
        startTransition(async () => {
          const res = await updateProjectAction(fd);
          if (res.ok) {
            setEditing(false);
            router.refresh();
          } else {
            setMsg(res.error);
          }
        });
      }}
      className="space-y-2"
    >
      <input type="hidden" name="id" value={id} />
      <input
        name="name"
        defaultValue={name}
        required
        className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <textarea
        name="description"
        defaultValue={description ?? ''}
        rows={2}
        className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-white/70"
        >
          Cancel
        </button>
        {msg && <span className="text-xs text-rose-600">{msg}</span>}
      </div>
    </form>
  );
}
