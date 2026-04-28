/**
 * Pure validators for org notification preferences. Kept separate from
 * the server action so they can be unit-tested without Next.js runtime.
 */

export type ValidationResult = { ok: true } | { ok: false; error: string };

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export function validateWebhookUrl(input: string): ValidationResult {
  if (!input) return { ok: true };
  try {
    const u = new URL(input);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: 'Webhook URL must use http(s) protocol.' };
    }
    const host = u.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host) || host.endsWith('.local')) {
      return { ok: false, error: 'Webhook URL host is not allowed.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Webhook URL is malformed.' };
  }
}

export function validateNotificationEmail(input: string): ValidationResult {
  if (!input) return { ok: true };
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(input)) {
    return { ok: false, error: 'Invalid email address.' };
  }
  return { ok: true };
}
