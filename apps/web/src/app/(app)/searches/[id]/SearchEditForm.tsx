'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateSearchAction, rerunSearchAction } from './actions';

export interface EditableSearch {
  id: string;
  name: string;
  keyword: string | null;
  niche: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  radiusMeters: number | null;
  resultLimit: number;
  leadFocus: string | null;
  scheduleFrequency: string;
  provider: string;
}

export default function SearchEditForm({ search }: { search: EditableSearch }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function onSubmit(formData: FormData) {
    setMsg(null);
    startTransition(async () => {
      const res = await updateSearchAction(formData);
      if (res.ok) {
        setMsg({ kind: 'ok', text: res.message });
        router.refresh();
      } else {
        setMsg({ kind: 'err', text: res.error });
      }
    });
  }

  function onSaveAndRerun(formData: FormData) {
    setMsg(null);
    startTransition(async () => {
      const upd = await updateSearchAction(formData);
      if (!upd.ok) {
        setMsg({ kind: 'err', text: upd.error });
        return;
      }
      const re = await rerunSearchAction(search.id);
      if (re.ok) {
        setMsg({ kind: 'ok', text: `Saved. ${re.message}` });
        router.refresh();
      } else {
        setMsg({ kind: 'err', text: `Saved but re-run failed: ${re.error}` });
      }
    });
  }

  if (!open) {
    return (
      <div className="glass p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Edit search</h2>
            <p className="text-xs text-ink-500">
              Adjust the query, result limit, lead focus, or schedule. Changes apply on the next run.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-white/70"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="glass p-4 space-y-4">
      <input type="hidden" name="id" value={search.id} />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Edit search</h2>
        <button
          type="button"
          onClick={() => { setOpen(false); setMsg(null); }}
          className="text-xs text-ink-500 hover:text-ink-900"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Name" required>
          <input
            name="name" defaultValue={search.name} required maxLength={120}
            className="input"
          />
        </Field>
        <Field label="Provider">
          <input value={search.provider} disabled className="input bg-slate-50 text-ink-500" />
        </Field>

        <Field label="Keyword">
          <input name="keyword" defaultValue={search.keyword ?? ''} className="input" />
        </Field>
        <Field label="Niche">
          <input name="niche" defaultValue={search.niche ?? ''} className="input" />
        </Field>

        <Field label="City">
          <input name="city" defaultValue={search.city ?? ''} className="input" />
        </Field>
        <Field label="State / Region">
          <input name="state" defaultValue={search.state ?? ''} className="input" />
        </Field>
        <Field label="Country (ISO-2)">
          <input
            name="country" defaultValue={search.country ?? ''} maxLength={2} minLength={2}
            className="input uppercase"
          />
        </Field>
        <Field label="Postal code">
          <input name="postalCode" defaultValue={search.postalCode ?? ''} className="input" />
        </Field>

        <Field label="Radius (meters, max 50000)">
          <input
            name="radiusMeters" type="number" min={0} max={50000}
            defaultValue={search.radiusMeters ?? ''} className="input"
          />
        </Field>
        <Field label="Result limit (1–500)" required>
          <input
            name="resultLimit" type="number" min={1} max={500}
            defaultValue={search.resultLimit} required className="input"
          />
        </Field>

        <Field label="Lead focus">
          <select name="leadFocus" defaultValue={search.leadFocus ?? 'ALL'} className="input">
            <option value="ALL">All leads</option>
            <option value="NO_WEBSITE">No website only</option>
            <option value="HIGH_OR_MED">High or medium priority</option>
          </select>
        </Field>
        <Field label="Schedule">
          <select name="scheduleFrequency" defaultValue={search.scheduleFrequency} className="input">
            <option value="NONE">One-shot</option>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        {msg && (
          <span
            className={
              'mr-auto rounded-md border px-2 py-1 text-xs ' +
              (msg.kind === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800')
            }
          >
            {msg.text}
          </span>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-white/70 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={(e) => {
            const form = e.currentTarget.closest('form');
            if (form) onSaveAndRerun(new FormData(form));
          }}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? 'Working…' : 'Save & re-run'}
        </button>
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(203 213 225);
          background: white;
          padding: 0.5rem 0.625rem;
          font-size: 0.875rem;
        }
        :global(.input:focus) {
          outline: 2px solid rgb(15 23 42 / 0.4);
          outline-offset: 1px;
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-600">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </span>
      {children}
    </label>
  );
}
