'use client';

import { useState, useTransition } from 'react';
import { updateNotificationPrefsAction } from './notifications-actions';

export default function NotificationPrefsForm({
  initialWebhookUrl,
  initialEmail
}: {
  initialWebhookUrl: string;
  initialEmail: string;
}) {
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) => {
        setMsg(null);
        start(async () => {
          const r = await updateNotificationPrefsAction(fd);
          setMsg(r.ok ? { kind: 'ok', text: 'Saved.' } : { kind: 'err', text: r.error });
        });
      }}
      className="space-y-3"
    >
      <div>
        <label className="block text-xs font-medium text-ink-700">Webhook URL</label>
        <input
          name="webhookUrl"
          type="url"
          defaultValue={initialWebhookUrl}
          placeholder="https://hooks.slack.com/services/…"
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-ink-500">
          Slack-compatible incoming webhooks work directly. Generic webhooks receive a
          structured JSON payload.
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-700">Digest email</label>
        <input
          name="email"
          type="email"
          defaultValue={initialEmail}
          placeholder="alerts@yourcompany.com"
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-ink-500">
          Optional. Email delivery is a stub today (logs only) until SMTP is wired.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {msg && (
          <span
            className={
              'text-xs ' + (msg.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700')
            }
          >
            {msg.text}
          </span>
        )}
      </div>
    </form>
  );
}
