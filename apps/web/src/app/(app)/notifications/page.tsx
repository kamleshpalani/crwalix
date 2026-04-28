import Link from 'next/link';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { notificationsService } from '@/server/services/notifications.service';
import NoOrgBanner from '@/components/NoOrgBanner';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
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
  const unreadCount = items.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Activity feed"
        title="Notifications"
        icon="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"
        description="Alerts about newly discovered businesses from your scheduled searches."
        chips={
          unreadCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              {unreadCount} unread
            </span>
          ) : (
            <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
              All caught up
            </span>
          )
        }
        actions={
          unreadCount > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <button type="submit" className="btn-ghost">
                Mark all as read
              </button>
            </form>
          ) : null
        }
      />

      {items.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"
            title="No notifications yet"
            description="Schedule a search (Daily / Weekly / Monthly) and you'll be alerted here when new businesses are discovered."
            action={
              <Link href="/searches" className="btn-primary">
                Schedule a search →
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="glass divide-y divide-white/60 overflow-hidden">
          {items.map((n) => {
            const inner = (
              <div
                className={
                  'flex items-start gap-3 p-5 transition hover:bg-white/70 ' +
                  (n.readAt ? 'opacity-70' : '')
                }
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    n.readAt ? 'bg-ink-300' : 'animate-pulse bg-emerald-500'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-ink-900">{n.title}</div>
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
                  <Link href={n.href} className="block">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
