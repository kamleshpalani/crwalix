'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateLeadContactAction } from './contact-actions';

export interface EditableLeadContact {
  id: string;
  ownerName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  googleProfileUrl: string | null;
  address: string | null;
  postalCode: string | null;
}

export default function LeadContactEdit({ lead }: { lead: EditableLeadContact }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function onSubmit(formData: FormData) {
    setMsg(null);
    startTransition(async () => {
      const res = await updateLeadContactAction(formData);
      if (res.ok) {
        setMsg({ kind: 'ok', text: 'Saved.' });
        setOpen(false);
        router.refresh();
      } else {
        setMsg({ kind: 'err', text: res.error });
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-white/70"
      >
        Edit contact
      </button>
    );
  }

  return (
    <form action={onSubmit} className="mt-3 space-y-3 rounded-md border border-slate-200 bg-white/60 p-3">
      <input type="hidden" name="id" value={lead.id} />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Field name="ownerName" label="Owner" defaultValue={lead.ownerName} />
        <Field name="phone" label="Phone" defaultValue={lead.phone} />
        <Field name="email" label="Email" type="email" defaultValue={lead.email} />
        <Field name="website" label="Website" type="url" defaultValue={lead.website} />
        <Field name="facebookUrl" label="Facebook URL" type="url" defaultValue={lead.facebookUrl} />
        <Field name="instagramUrl" label="Instagram URL" type="url" defaultValue={lead.instagramUrl} />
        <Field name="googleProfileUrl" label="Google profile URL" type="url" defaultValue={lead.googleProfileUrl} />
        <Field name="postalCode" label="Postal code" defaultValue={lead.postalCode} />
        <div className="md:col-span-2">
          <Field name="address" label="Address" defaultValue={lead.address} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
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
          type="button"
          onClick={() => { setOpen(false); setMsg(null); }}
          className="text-xs text-ink-500 hover:text-ink-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = 'text'
}: {
  name: string;
  label: string;
  defaultValue: string | null;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-500">
        {label}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline focus:outline-2 focus:outline-slate-900/40"
      />
    </label>
  );
}
