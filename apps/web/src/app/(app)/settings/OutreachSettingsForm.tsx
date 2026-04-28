'use client';

import { useState, useTransition } from 'react';
import { saveOutreachSettingsAction, addSuppressionAction } from './actions';

export interface OutreachInitial {
  senderName?: string | null;
  senderCompany?: string | null;
  senderEmail?: string | null;
  replyToEmail?: string | null;
  mailingAddress?: string | null;
  unsubscribeUrl?: string | null;
  citeProviderInBody?: boolean | null;
}

export default function OutreachSettingsForm({
  initial,
  missing,
  suppressionCount
}: {
  initial: OutreachInitial | null;
  missing: string[];
  suppressionCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [supMsg, setSupMsg] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {missing.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Outreach is blocked until you fill in:{' '}
          <span className="font-mono">{missing.join(', ')}</span>. CAN-SPAM
          requires a real sender identity, postal address, and unsubscribe URL.
        </div>
      ) : (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          ✓ Outreach compliance settings are complete.
        </div>
      )}

      <form
        action={(formData) => {
          setMsg(null);
          startTransition(async () => {
            const res = await saveOutreachSettingsAction(formData);
            setMsg(res.ok ? 'Saved' : res.error);
          });
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <Field
          name="senderName"
          label="Sender name *"
          placeholder="Jane Doe"
          defaultValue={initial?.senderName ?? ''}
        />
        <Field
          name="senderCompany"
          label="Company name *"
          placeholder="Acme Inc."
          defaultValue={initial?.senderCompany ?? ''}
        />
        <Field
          name="senderEmail"
          label="Sender email *"
          type="email"
          placeholder="hello@acme.com"
          defaultValue={initial?.senderEmail ?? ''}
        />
        <Field
          name="replyToEmail"
          label="Reply-To email"
          type="email"
          placeholder="hello@acme.com"
          defaultValue={initial?.replyToEmail ?? ''}
        />
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-ink-700">
            Physical mailing address *
          </label>
          <textarea
            name="mailingAddress"
            rows={2}
            placeholder="123 Main St, Suite 100, San Francisco, CA 94103, USA"
            defaultValue={initial?.mailingAddress ?? ''}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <p className="mt-1 text-[11px] text-ink-500">
            Required by CAN-SPAM § 7704(a)(5). A PO Box, registered mail-drop, or
            commercial address is acceptable.
          </p>
        </div>
        <Field
          name="unsubscribeUrl"
          label="One-click unsubscribe URL *"
          type="url"
          placeholder="https://acme.com/unsubscribe?token={token}"
          defaultValue={initial?.unsubscribeUrl ?? ''}
        />
        <label className="flex cursor-pointer items-start gap-2 text-xs text-ink-700 sm:col-span-2">
          <input
            type="checkbox"
            name="citeProviderInBody"
            defaultChecked={initial?.citeProviderInBody ?? true}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            Auto-append a GDPR Art. 14 disclosure citing the lead&apos;s public
            source provider (e.g. Google Places, Yelp, OpenStreetMap) in the
            email footer.
          </span>
        </label>
        <div className="flex items-center gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save outreach settings'}
          </button>
          {msg && <span className="text-xs text-ink-500">{msg}</span>}
        </div>
      </form>

      <div className="border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Suppression list</h3>
          <span className="text-xs text-ink-500">{suppressionCount} suppressed</span>
        </div>
        <p className="mt-1 text-xs text-ink-500">
          Email addresses on this list will never receive outreach from this
          organization. Unsubscribes and bounces are added automatically.
        </p>
        <form
          action={(formData) => {
            setSupMsg(null);
            startTransition(async () => {
              const res = await addSuppressionAction(formData);
              setSupMsg(res.ok ? 'Added' : res.error);
            });
          }}
          className="mt-2 flex items-center gap-2"
        >
          <input
            type="email"
            name="email"
            placeholder="address@example.com"
            required
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Suppress
          </button>
        </form>
        {supMsg && <p className="mt-1 text-xs text-ink-500">{supMsg}</p>}
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  type = 'text',
  placeholder,
  defaultValue
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-700">{label}</span>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
    </label>
  );
}
