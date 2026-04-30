/**
 * packages/billing/src/paypal/index.ts
 *
 * Lightweight PayPal Orders v2 adapter. Uses raw fetch against the REST API
 * to keep this module dependency-free (no @paypal/checkout-server-sdk pin).
 *
 * The flow is intentionally minimal — enough to charge a one-off invoice or
 * proposal acceptance:
 *   1. createOrder(amount, invoiceId)  → returns { id, approveUrl }
 *   2. client redirects to approveUrl, approves on PayPal, returns to app
 *   3. captureOrder(id)                → returns capture id + status
 *   4. webhook hits paypal-webhook route to confirm capture asynchronously
 *
 * Subscriptions, refunds, and payouts are TODO — add only when needed.
 */

const SANDBOX = "https://api-m.sandbox.paypal.com";
const LIVE = "https://api-m.paypal.com";

export interface PayPalCredentials {
  clientId: string;
  clientSecret: string;
  /** When true, hits sandbox API. Defaults to NODE_ENV !== "production". */
  sandbox?: boolean;
}

export function paypalCredsFromEnv(): PayPalCredentials | null {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    sandbox:
      process.env.PAYPAL_SANDBOX === "true" ||
      process.env.NODE_ENV !== "production",
  };
}

function baseUrl(creds: PayPalCredentials): string {
  return creds.sandbox === false ? LIVE : SANDBOX;
}

let TOKEN_CACHE: { token: string; expiresAt: number } | null = null;

async function getAccessToken(creds: PayPalCredentials): Promise<string> {
  if (TOKEN_CACHE && TOKEN_CACHE.expiresAt > Date.now() + 30_000) {
    return TOKEN_CACHE.token;
  }
  const auth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString(
    "base64",
  );
  const res = await fetch(`${baseUrl(creds)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`paypal auth failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  TOKEN_CACHE = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

export interface CreateOrderInput {
  amountCents: number;
  currency: string;
  /** Internal invoice/proposal id surfaced as `custom_id` for webhook joins. */
  customId: string;
  description?: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreateOrderResult {
  id: string;
  approveUrl: string;
  status: string;
}

export async function createOrder(
  creds: PayPalCredentials,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const token = await getAccessToken(creds);
  const res = await fetch(`${baseUrl(creds)}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: input.customId,
          description: input.description?.slice(0, 127),
          amount: {
            currency_code: input.currency.toUpperCase(),
            value: (input.amountCents / 100).toFixed(2),
          },
        },
      ],
      application_context: {
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
      },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `paypal createOrder failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    id: string;
    status: string;
    links: Array<{ rel: string; href: string }>;
  };
  const approve = json.links.find((l) => l.rel === "approve");
  if (!approve) throw new Error("paypal createOrder: no approve link");
  return { id: json.id, status: json.status, approveUrl: approve.href };
}

export interface CaptureOrderResult {
  orderId: string;
  captureId: string | null;
  status: string;
  payerEmail: string | null;
  amountCents: number;
  currency: string;
  customId: string | null;
}

export async function captureOrder(
  creds: PayPalCredentials,
  orderId: string,
): Promise<CaptureOrderResult> {
  const token = await getAccessToken(creds);
  const res = await fetch(
    `${baseUrl(creds)}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    },
  );
  if (!res.ok) {
    throw new Error(
      `paypal captureOrder failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    id: string;
    status: string;
    payer?: { email_address?: string };
    purchase_units?: Array<{
      custom_id?: string;
      payments?: {
        captures?: Array<{
          id: string;
          amount: { value: string; currency_code: string };
        }>;
      };
    }>;
  };
  const unit = json.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  return {
    orderId: json.id,
    status: json.status,
    captureId: capture?.id ?? null,
    payerEmail: json.payer?.email_address ?? null,
    customId: unit?.custom_id ?? null,
    amountCents: capture
      ? Math.round(parseFloat(capture.amount.value) * 100)
      : 0,
    currency: capture?.amount.currency_code ?? "USD",
  };
}

export interface VerifyWebhookInput {
  body: string;
  headers: Headers;
  webhookId: string;
}

/**
 * Verify a webhook signature using PayPal's verify-webhook-signature endpoint.
 * Returns true when PayPal echoes "SUCCESS"; false otherwise. We deliberately
 * do NOT throw on network errors so the caller can decide whether to log and
 * accept (during local dev) or reject (in production).
 */
export async function verifyWebhook(
  creds: PayPalCredentials,
  input: VerifyWebhookInput,
): Promise<boolean> {
  try {
    const token = await getAccessToken(creds);
    const res = await fetch(
      `${baseUrl(creds)}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          auth_algo: input.headers.get("paypal-auth-algo"),
          cert_url: input.headers.get("paypal-cert-url"),
          transmission_id: input.headers.get("paypal-transmission-id"),
          transmission_sig: input.headers.get("paypal-transmission-sig"),
          transmission_time: input.headers.get("paypal-transmission-time"),
          webhook_id: input.webhookId,
          webhook_event: JSON.parse(input.body),
        }),
      },
    );
    if (!res.ok) return false;
    const json = (await res.json()) as { verification_status?: string };
    return json.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}
