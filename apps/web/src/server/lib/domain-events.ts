/**
 * publishDomainEvent — web-side fire-and-forget helper that enqueues a domain
 * event onto the `domain-events` BullMQ queue (§6 of AUTOMATION_ROADMAP.md).
 */
import { QueueName, type AnyDomainEvent } from "@crawlix/shared";
import { getQueue } from "@/lib/queue";

export async function publishDomainEvent(event: AnyDomainEvent): Promise<void> {
  try {
    const queue = getQueue(QueueName.DOMAIN_EVENTS);
    await queue.add(event.eventName, event, {
      jobId: `${event.eventName}:${event.organizationId}:${event.occurredAt}`,
      attempts: 1,
      removeOnComplete: 1000,
      removeOnFail: 500,
    });
  } catch {
    // Domain event publishing must never crash the web request.
  }
}
