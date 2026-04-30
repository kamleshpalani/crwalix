/**
 * publishDomainEvent — fire-and-forget helper that enqueues a domain event
 * onto the `domain-events` BullMQ queue (§6 of AUTOMATION_ROADMAP.md).
 *
 * Consumers (scoring, outreach, reporting pipelines) listen on this queue and
 * react to events without being tightly coupled to the producer.
 */
import { Queue } from "bullmq";
import { QueueName, type AnyDomainEvent } from "@crawlix/shared";
import { getConnection } from "./redis";
import { logger } from "./logger";

let domainEventsQueue: Queue | null = null;

function getQueue(): Queue {
  if (!domainEventsQueue) {
    domainEventsQueue = new Queue(QueueName.DOMAIN_EVENTS, {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 500,
        attempts: 1, // domain events are best-effort; don't retry
      },
    });
  }
  return domainEventsQueue;
}

export async function publishDomainEvent(event: AnyDomainEvent): Promise<void> {
  try {
    const queue = getQueue();
    await queue.add(event.eventName, event, {
      jobId: `${event.eventName}:${event.organizationId}:${event.occurredAt}`,
    });
  } catch (err) {
    // Domain event publishing must never crash the producer.
    logger.error(
      { err, eventName: event.eventName },
      "Failed to publish domain event",
    );
  }
}
