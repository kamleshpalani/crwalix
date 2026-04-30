// packages/outreach/src/channels/twilio.ts
//
// Twilio SMS + WhatsApp adapter for outbound outreach.
//
// Both channels share Twilio's REST API (POST /Messages.json), they only
// differ in the `From`/`To` prefix:
//   - SMS:      from `+E.164` to `+E.164`
//   - WhatsApp: from `whatsapp:+E.164` to `whatsapp:+E.164`
//
// Configuration is plain env vars (kept here rather than a @crawlix/config
// dep so this package stays leaf-level). The host app passes them in.

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  /** Default From — `+E.164` for SMS or `whatsapp:+E.164` for WhatsApp. */
  fromNumber: string;
}

export interface TwilioSendInput {
  /** Recipient `+E.164`; the channel adapter prefixes `whatsapp:` if needed. */
  to: string;
  body: string;
  /** Optional override From. */
  from?: string;
  /** Idempotency: pass a stable hash to avoid duplicate sends on retry. */
  messagingServiceSid?: string;
}

export interface TwilioSendResult {
  ok: boolean;
  /** Twilio Message SID when ok=true. */
  sid?: string;
  /** Error code (e.g. "21610" = unsubscribed) when ok=false. */
  code?: string;
  error?: string;
  /** Provider HTTP status. */
  status?: number;
}

async function postMessage(
  creds: TwilioCredentials,
  body: Record<string, string>,
): Promise<TwilioSendResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    creds.accountSid,
  )}/Messages.json`;
  const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString(
    "base64",
  );
  const form = new URLSearchParams(body);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network error",
    };
  }
  const json = (await res.json().catch(() => null)) as {
    sid?: string;
    message?: string;
    code?: number | string;
  } | null;
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      code: json?.code != null ? String(json.code) : undefined,
      error: json?.message ?? `HTTP ${res.status}`,
    };
  }
  return { ok: true, sid: json?.sid, status: res.status };
}

/**
 * Send an SMS message.
 * `to` and the configured `fromNumber` should both be in `+E.164` form.
 */
export async function sendSms(
  creds: TwilioCredentials,
  input: TwilioSendInput,
): Promise<TwilioSendResult> {
  return postMessage(creds, {
    To: input.to,
    From: input.from ?? creds.fromNumber,
    Body: input.body,
    ...(input.messagingServiceSid
      ? { MessagingServiceSid: input.messagingServiceSid }
      : {}),
  });
}

/**
 * Send a WhatsApp message via Twilio. Both numbers must already be
 * WhatsApp-enabled in the Twilio console. Adapter auto-prefixes `whatsapp:`
 * if the caller hasn't.
 */
export async function sendWhatsApp(
  creds: TwilioCredentials,
  input: TwilioSendInput,
): Promise<TwilioSendResult> {
  const ensure = (n: string) =>
    n.startsWith("whatsapp:") ? n : `whatsapp:${n}`;
  return postMessage(creds, {
    To: ensure(input.to),
    From: ensure(input.from ?? creds.fromNumber),
    Body: input.body,
  });
}

/**
 * Pull Twilio creds from env vars at call site. Returns null when not
 * configured — host code can fall back to a no-op or surface a setup error.
 */
export function twilioCredsFromEnv(): TwilioCredentials | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}
