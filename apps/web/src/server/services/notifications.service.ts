/**
 * In-app notification feed accessor for the web tier.
 *
 * Reads + an `emit()` shortcut that delegates to the canonical writer in
 * `@/server/lib/notify`. Worker pipelines have their own equivalent in
 * `apps/worker/src/lib/notify.ts`; the two implementations intentionally
 * mirror each other so both tiers can fire notifications without import
 * cycles.
 */
import { withOrg } from "@crawlix/db";
import { emitNotification, type NotifyInput } from "@/server/lib/notify";

export type EmitInput = NotifyInput;

export const notificationsService = {
  async list(
    orgId: string,
    opts: { limit?: number; unreadOnly?: boolean } = {},
  ) {
    const limit = Math.min(100, opts.limit ?? 50);
    return withOrg(orgId, (tx) =>
      tx.notification.findMany({
        where: {
          organizationId: orgId,
          ...(opts.unreadOnly ? { readAt: null } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    );
  },

  async unreadCount(orgId: string): Promise<number> {
    return withOrg(orgId, (tx) =>
      tx.notification.count({ where: { organizationId: orgId, readAt: null } }),
    );
  },

  async markRead(orgId: string, ids: string[]) {
    if (ids.length === 0) return 0;
    return withOrg(orgId, async (tx) => {
      const r = await tx.notification.updateMany({
        where: { organizationId: orgId, id: { in: ids }, readAt: null },
        data: { readAt: new Date() },
      });
      return r.count;
    });
  },

  async markAllRead(orgId: string) {
    return withOrg(orgId, async (tx) => {
      const r = await tx.notification.updateMany({
        where: { organizationId: orgId, readAt: null },
        data: { readAt: new Date() },
      });
      return r.count;
    });
  },

  /** Convenience wrapper around the canonical emitter. */
  async emit(input: NotifyInput): Promise<void> {
    return emitNotification(input);
  },
};
