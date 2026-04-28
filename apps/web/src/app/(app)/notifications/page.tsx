import Link from 'next/link';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { notificationsService } from '@/server/services/notifications.service';
import NoOrgBanner from '@/components/NoOrgBanner';
import { markAllNotificationsReadAction } from './actions';

export const dynamic = 'force-dynamic';

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default async function NotificationsPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const items = await notificationsService.list(ctx.orgId, { limit: 100 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="mt-1 text-sm text-ink-600">
            Alerts about newly discovered businesses from your scheduled searches.
          </p>
        </div>
        {items.some((n) => !n.readAt) && (
          <form action={markAllNotificationsReadAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-white"
            >
              Mark all as read
            </button>
          </form>
        )}
      </div>

      <ul className="glass divide-y divide-white/60">
        {items.length === 0 && (
          <li className="p-6 text-sm text-ink-500">
            No notifications yet. Schedule a search (Daily / Weekly / Monthly) and
            you&apos;ll be alerted here when new businesses are discovered.
          </li>
        )}
        {items.map((n) => {
          const inner = (
            <div className={'flex items-start gap-3 p-4 ' + (n.readAt ? 'opacity-70' : '')}>
              {!n.readAt && (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-ink-900">{n.title}</div>
                  <div className="shrink-0 text-xs text-ink-500">
                    {formatRelative(new Date(n.createdAt))}
                  </div>
                </div>
                <div className="mt-0.5 text-sm text-ink-600">{n.body}</div>
              </div>
            </div>
          );
          return (
            <li key={n.id}>
              {n.href ? (
                <Link href={n.href} className="block hover:bg-white/70">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
