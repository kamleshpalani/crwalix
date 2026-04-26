'use client';

import { useState, useTransition } from 'react';
import { acceptProviderTermsAction } from './actions';

export default function ProviderTermsForm({
  provider,
  termsUrl,
  acceptedAt
}: {
  provider: string;
  termsUrl: string;
  acceptedAt: Date | string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (acceptedAt) {
    return (
      <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        ✓ Terms accepted on{' '}
        {new Date(acceptedAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })}
        .{' '}
        <a
          href={termsUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="underline"
        >
          Review terms
        </a>
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        setMsg(null);
        startTransition(async () => {
          const res = await acceptProviderTermsAction(formData);
          setMsg(res.ok ? 'Accepted' : res.error);
        });
      }}
      className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
    >
      <input type="hidden" name="provider" value={provider} />
      <label className="flex cursor-pointer items-start gap-2">
        <input type="checkbox" name="consent" className="mt-0.5 h-4 w-4" />
        <span>
          I have read and accept the{' '}
          <a
            href={termsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline"
          >
            provider&apos;s Terms of Service
          </a>{' '}
          on behalf of this organization. Searches against this provider will be
          attributable to this acceptance.
        </span>
      </label>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Accept terms'}
        </button>
        {msg && <span className="text-amber-800">{msg}</span>}
      </div>
    </form>
  );
}
