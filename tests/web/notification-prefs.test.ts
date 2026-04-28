import { describe, it, expect } from 'vitest';
import {
  validateWebhookUrl,
  validateNotificationEmail
} from '../../apps/web/src/lib/notification-prefs';

describe('validateWebhookUrl', () => {
  it('accepts empty (clears value)', () => {
    expect(validateWebhookUrl('')).toEqual({ ok: true });
  });
  it('accepts https Slack-style URL', () => {
    expect(validateWebhookUrl('https://hooks.slack.com/services/T/B/X')).toEqual({ ok: true });
  });
  it('rejects malformed URL', () => {
    const r = validateWebhookUrl('not a url');
    expect(r.ok).toBe(false);
  });
  it('rejects ftp protocol', () => {
    const r = validateWebhookUrl('ftp://example.com/hook');
    expect(r.ok).toBe(false);
  });
  it('blocks localhost (SSRF guard)', () => {
    expect(validateWebhookUrl('http://localhost/x').ok).toBe(false);
    expect(validateWebhookUrl('http://127.0.0.1/x').ok).toBe(false);
    expect(validateWebhookUrl('http://0.0.0.0/x').ok).toBe(false);
    expect(validateWebhookUrl('http://something.local/x').ok).toBe(false);
  });
});

describe('validateNotificationEmail', () => {
  it('accepts empty', () => {
    expect(validateNotificationEmail('')).toEqual({ ok: true });
  });
  it('accepts a normal email', () => {
    expect(validateNotificationEmail('alerts@crawlix.io')).toEqual({ ok: true });
  });
  it('rejects too-short tld', () => {
    expect(validateNotificationEmail('a@b.c').ok).toBe(false);
  });
  it('rejects missing @', () => {
    expect(validateNotificationEmail('not-an-email').ok).toBe(false);
  });
  it('rejects spaces', () => {
    expect(validateNotificationEmail('a b@c.de').ok).toBe(false);
  });
});
