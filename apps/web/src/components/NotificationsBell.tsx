/**
 * Header notifications bell — shows unread count + links to /notifications.
 * Server component so the count is always fresh on navigation.
 */
import Link from 'next/link';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import { notificationsService } from '@/server/services/notifications.service';

export default async function NotificationsBell() {
  const ctx = await requireOrg();
  if (isResponse(ctx) || isAuthError(ctx)) return null;
  const unread = await notificationsService.unreadCount(ctx.orgId).catch((err) => {
    console.error('NotificationsBell: unreadCount failed', err);
    return 0;
  });

  return (
    <Link
      href="/notifications"
      aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
      className="relative grid h-9 w-9 place-items-center rounded-md hover:bg-white/60"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-ink-700">
        <path
          d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
