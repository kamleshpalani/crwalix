/**
 * Per-tenant sliding-window rate limiter (Phase 5.4).
 *
 * Uses ioredis directly (no external ratelimit library).
 * Implements a sliding-window counter using the INCR + PEXPIRE pattern:
 *
 *   key   = rl:{orgId}:{tier}:{windowSlot}
 *   slot  = Math.floor(Date.now() / windowMs)
 *
 * Each request increments the counter for the current window slot.
 * The slot key expires automatically after 2× the window size so there
 * is no need for manual cleanup.
 *
 * Tiers and their limits (configurable via env vars):
 *   standard  — 200 req / min   (general API calls)
 *   ai        —  10 req / min   (AI generation / enrichment)
 *   outreach  —  30 req / min   (outreach sends / sequences)
 */

import IORedis from "ioredis";

let _redis: IORedis | null = null;

function getRedis(): IORedis {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL not set");
  _redis = new IORedis(url, { maxRetriesPerRequest: null });
  return _redis;
}

// Tier configuration — limits per window.
const TIERS = {
  standard: {
    windowMs: 60_000,
    max: Number(process.env.RL_STANDARD_MAX ?? 200),
  },
  ai: {
    windowMs: 60_000,
    max: Number(process.env.RL_AI_MAX ?? 10),
  },
  outreach: {
    windowMs: 60_000,
    max: Number(process.env.RL_OUTREACH_MAX ?? 30),
  },
} as const;

export type RateLimitTier = keyof typeof TIERS;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAfterMs: number;
}

/**
 * Check and increment the rate-limit counter for an org + tier.
 * Returns `allowed: false` when the limit is exceeded.
 *
 * @param orgId  Internal organization ID.
 * @param tier   Rate-limit bucket: "standard" | "ai" | "outreach".
 */
export async function checkRateLimit(
  orgId: string,
  tier: RateLimitTier,
): Promise<RateLimitResult> {
  const { windowMs, max } = TIERS[tier];
  const now = Date.now();
  const slot = Math.floor(now / windowMs);
  const key = `rl:${orgId}:${tier}:${slot}`;

  const redis = getRedis();

  // INCR + PEXPIRE in a pipeline (atomic enough for rate limiting).
  const [[incrErr, count], [expireErr]] = (await redis
    .pipeline()
    .incr(key)
    .pexpire(key, windowMs * 2)
    .exec()) as [[Error | null, number], [Error | null, number]];

  if (incrErr || expireErr) {
    // If Redis is down, fail open to avoid breaking production traffic.
    return {
      allowed: true,
      remaining: max,
      limit: max,
      resetAfterMs: windowMs,
    };
  }

  const remaining = Math.max(0, max - count);
  const resetAfterMs = windowMs - (now % windowMs);

  return {
    allowed: count <= max,
    remaining,
    limit: max,
    resetAfterMs,
  };
}

/**
 * Convenience helper for Next.js route handlers.
 * Returns a 429 Response if the rate limit is exceeded, otherwise null.
 *
 * Usage:
 *   const limited = await rateLimitOrg(orgId, "ai");
 *   if (limited) return limited;
 */
export async function rateLimitOrg(
  orgId: string,
  tier: RateLimitTier,
): Promise<Response | null> {
  const result = await checkRateLimit(orgId, tier);
  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: {
          code: "RATE_LIMITED",
          message: `Too many requests. Retry after ${Math.ceil(result.resetAfterMs / 1000)}s.`,
          retryAfterMs: result.resetAfterMs,
        },
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(result.resetAfterMs / 1000)),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(
            Math.ceil((Date.now() + result.resetAfterMs) / 1000),
          ),
        },
      },
    );
  }
  return null;
}
