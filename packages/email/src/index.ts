/**
 * Tiny email abstraction. Three providers, all behind the same `EmailProvider`
 * interface, selected at runtime via `EMAIL_PROVIDER` env var:
 *
 *   EMAIL_PROVIDER=resend   → Resend HTTPS API (recommended; no extra deps)
 *   EMAIL_PROVIDER=smtp     → Nodemailer over SMTP_URL  (requires `nodemailer`)
 *   EMAIL_PROVIDER=console  → log-only stub (default; safe for local dev)
 *
 * Required env in production:
 *   EMAIL_FROM         — display From address, e.g. "Crawlix <noreply@app.dev>"
 *   RESEND_API_KEY     — when EMAIL_PROVIDER=resend
 *   SMTP_URL           — when EMAIL_PROVIDER=smtp (e.g. smtps://user:pass@host:465)
 *
 * `send()` never throws. Failures are logged and reported via the returned
 * `{ ok: false }` so callers can record delivery state without a try/catch.
 */

export interface EmailMessage {
  /** Single recipient email address. */
  to: string;
  /** Subject line — keep <=78 chars to avoid soft-wrap headaches. */
  subject: string;
  /** Plain-text body. Always required as a deliverability fallback. */
  text: string;
  /** Optional HTML body. */
  html?: string;
  /** Override default from address. */
  from?: string;
  /** Reply-To header. */
  replyTo?: string;
  /** Extra raw headers (e.g. List-Unsubscribe). */
  headers?: Record<string, string>;
}

export interface EmailSendResult {
  ok: boolean;
  /** Provider message id when known. */
  id?: string;
  /** Human-readable error message when `ok=false`. */
  error?: string;
  /** Which provider handled the send. */
  provider: "resend" | "smtp" | "console";
}

export interface EmailProvider {
  readonly name: EmailSendResult["provider"];
  send(msg: EmailMessage): Promise<EmailSendResult>;
}

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const which = (process.env.EMAIL_PROVIDER ?? "console").toLowerCase();
  if (which === "resend" && process.env.RESEND_API_KEY) {
    cached = makeResendProvider(process.env.RESEND_API_KEY);
  } else if (which === "smtp" && process.env.SMTP_URL) {
    cached = makeSmtpProvider(process.env.SMTP_URL);
  } else {
    cached = makeConsoleProvider();
  }
  return cached;
}

/**
 * Convenience wrapper: pull the configured provider, fill in `from` from
 * env, and dispatch. Always resolves; never throws.
 */
export async function sendEmail(
  msg: Omit<EmailMessage, "from"> & { from?: string },
): Promise<EmailSendResult> {
  const provider = getEmailProvider();
  const from =
    msg.from ?? process.env.EMAIL_FROM ?? "Crawlix <no-reply@localhost>";
  try {
    return await provider.send({ ...msg, from });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn("[email] provider threw", provider.name, error);
    return { ok: false, error, provider: provider.name };
  }
}

// ---------- Resend (HTTPS, zero deps) --------------------------------------

function makeResendProvider(apiKey: string): EmailProvider {
  return {
    name: "resend",
    async send(msg) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: msg.from,
            to: [msg.to],
            subject: msg.subject,
            text: msg.text,
            html: msg.html,
            reply_to: msg.replyTo,
            headers: msg.headers,
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return {
            ok: false,
            error: `resend ${res.status}: ${body.slice(0, 200)}`,
            provider: "resend",
          };
        }
        const data = (await res.json().catch(() => ({}))) as { id?: string };
        return { ok: true, id: data.id, provider: "resend" };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          provider: "resend",
        };
      }
    },
  };
}

// ---------- SMTP (lazy nodemailer) -----------------------------------------

function makeSmtpProvider(url: string): EmailProvider {
  // Nodemailer is loaded lazily so the email package does not force the
  // dependency on consumers that only use Resend or console.
  let transporterPromise: Promise<{
    sendMail(opts: Record<string, unknown>): Promise<{ messageId: string }>;
  }> | null = null;

  function getTransporter() {
    if (transporterPromise) return transporterPromise;
    transporterPromise = (async () => {
      try {
        // Nodemailer is an optional peer dep — resolved at runtime only.
        // The indirection keeps TS from requiring its types in builds
        // that don't need SMTP delivery.
        const moduleName = "nodemailer";
        const mod = await import(/* @vite-ignore */ moduleName).catch(() => {
          throw new Error(
            "nodemailer is not installed. Run `npm i nodemailer` in the consuming app, or set EMAIL_PROVIDER=resend.",
          );
        });
        const nodemailer = (mod as { default?: unknown }).default ?? mod;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (nodemailer as any).createTransport(url);
      } catch (err) {
        transporterPromise = null;
        throw err;
      }
    })();
    return transporterPromise;
  }

  return {
    name: "smtp",
    async send(msg) {
      try {
        const t = await getTransporter();
        const info = await t.sendMail({
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
          replyTo: msg.replyTo,
          headers: msg.headers,
        });
        return { ok: true, id: info.messageId, provider: "smtp" };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          provider: "smtp",
        };
      }
    },
  };
}

// ---------- Console (default / dev) ----------------------------------------

function makeConsoleProvider(): EmailProvider {
  return {
    name: "console",
    async send(msg) {
      console.info(
        "[email-console] would send",
        JSON.stringify({
          to: msg.to,
          from: msg.from,
          subject: msg.subject,
          text: msg.text.slice(0, 200),
        }),
      );
      return {
        ok: true,
        id: `console-${Date.now()}`,
        provider: "console",
      };
    },
  };
}

/**
 * Test-only seam to inject a custom provider (e.g. an in-memory recorder).
 * Resets the cached singleton.
 */
export function __setEmailProviderForTests(p: EmailProvider | null) {
  cached = p;
}
