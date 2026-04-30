/**
 * @crawlix/billing — Stripe wrapper for Phase 2 money flow.
 *
 * Exports:
 *  - `stripe()` — singleton Stripe client
 *  - Customer helpers (create, update, retrieve)
 *  - Subscription helpers (create, retrieve, cancel, update)
 *  - Portal session generator
 *  - Invoice helpers (create, finalize, pay, void)
 *  - PaymentIntent helpers (create, confirm, capture)
 *
 * Env:
 *  - `STRIPE_SECRET_KEY` (required)
 *  - `STRIPE_PUBLISHABLE_KEY` (optional, for client-side init)
 */

import Stripe from "stripe";

// PayPal adapter is namespaced to avoid name collisions with Stripe helpers
// (both have createOrder/captureOrder concepts in different shapes).
export * as paypal from "./paypal";

let _stripe: Stripe | null = null;

/**
 * Lazy singleton. Throws if STRIPE_SECRET_KEY is not set.
 */
export function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  _stripe = new Stripe(key, {
    apiVersion: "2024-06-20",
    typescript: true,
  });
  return _stripe;
}

/* -------------------------------------------------------------------------- */
/* Customers                                                                   */
/* -------------------------------------------------------------------------- */

export interface CreateCustomerInput {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export async function createCustomer(
  input: CreateCustomerInput,
): Promise<Stripe.Customer> {
  return stripe().customers.create({
    email: input.email,
    name: input.name,
    metadata: input.metadata,
  });
}

export async function retrieveCustomer(
  customerId: string,
): Promise<Stripe.Customer | null> {
  try {
    const result = await stripe().customers.retrieve(customerId);
    if (result.deleted) return null;
    return result;
  } catch (err) {
    if ((err as Stripe.errors.StripeError).statusCode === 404) return null;
    throw err;
  }
}

export async function updateCustomer(
  customerId: string,
  updates: Partial<Stripe.CustomerUpdateParams>,
): Promise<Stripe.Customer> {
  return stripe().customers.update(customerId, updates);
}

/* -------------------------------------------------------------------------- */
/* Subscriptions                                                              */
/* -------------------------------------------------------------------------- */

export interface CreateSubscriptionInput {
  customerId: string;
  priceId: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}

export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<Stripe.Subscription> {
  const params: Stripe.SubscriptionCreateParams = {
    customer: input.customerId,
    items: [{ price: input.priceId }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent"],
    metadata: input.metadata,
  };
  if (input.trialDays) {
    params.trial_period_days = input.trialDays;
  }
  return stripe().subscriptions.create(params);
}

export async function retrieveSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription | null> {
  try {
    return await stripe().subscriptions.retrieve(subscriptionId);
  } catch (err) {
    if ((err as Stripe.errors.StripeError).statusCode === 404) return null;
    throw err;
  }
}

export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd = false,
): Promise<Stripe.Subscription> {
  if (cancelAtPeriodEnd) {
    return stripe().subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }
  return stripe().subscriptions.cancel(subscriptionId);
}

export async function updateSubscription(
  subscriptionId: string,
  updates: Partial<Stripe.SubscriptionUpdateParams>,
): Promise<Stripe.Subscription> {
  return stripe().subscriptions.update(subscriptionId, updates);
}

/* -------------------------------------------------------------------------- */
/* Customer Portal                                                            */
/* -------------------------------------------------------------------------- */

export interface CreatePortalSessionInput {
  customerId: string;
  returnUrl: string;
}

export async function createPortalSession(
  input: CreatePortalSessionInput,
): Promise<Stripe.BillingPortal.Session> {
  return stripe().billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  });
}

/* -------------------------------------------------------------------------- */
/* Invoices                                                                   */
/* -------------------------------------------------------------------------- */

export interface CreateInvoiceInput {
  customerId: string;
  description?: string;
  dueDate?: Date;
  metadata?: Record<string, string>;
  autoAdvance?: boolean;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitAmountCents: number;
}

export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<Stripe.Invoice> {
  const params: Stripe.InvoiceCreateParams = {
    customer: input.customerId,
    description: input.description,
    metadata: input.metadata,
    auto_advance: input.autoAdvance ?? true,
  };
  if (input.dueDate) {
    params.due_date = Math.floor(input.dueDate.getTime() / 1000);
  }
  return stripe().invoices.create(params);
}

export async function addInvoiceLineItem(
  invoiceId: string,
  customerId: string,
  item: InvoiceLineItem,
): Promise<Stripe.InvoiceItem> {
  return stripe().invoiceItems.create({
    customer: customerId,
    invoice: invoiceId,
    description: item.description,
    quantity: item.quantity,
    unit_amount: item.unitAmountCents,
  });
}

export async function finalizeInvoice(
  invoiceId: string,
): Promise<Stripe.Invoice> {
  return stripe().invoices.finalizeInvoice(invoiceId);
}

export async function payInvoice(invoiceId: string): Promise<Stripe.Invoice> {
  return stripe().invoices.pay(invoiceId);
}

export async function voidInvoice(invoiceId: string): Promise<Stripe.Invoice> {
  return stripe().invoices.voidInvoice(invoiceId);
}

export async function retrieveInvoice(
  invoiceId: string,
): Promise<Stripe.Invoice | null> {
  try {
    return await stripe().invoices.retrieve(invoiceId);
  } catch (err) {
    if ((err as Stripe.errors.StripeError).statusCode === 404) return null;
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* PaymentIntents                                                             */
/* -------------------------------------------------------------------------- */

export interface CreatePaymentIntentInput {
  amountCents: number;
  currency?: string;
  customerId?: string;
  description?: string;
  metadata?: Record<string, string>;
}

export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
): Promise<Stripe.PaymentIntent> {
  return stripe().paymentIntents.create({
    amount: input.amountCents,
    currency: input.currency ?? "usd",
    customer: input.customerId,
    description: input.description,
    metadata: input.metadata,
    automatic_payment_methods: { enabled: true },
  });
}

export async function retrievePaymentIntent(
  paymentIntentId: string,
): Promise<Stripe.PaymentIntent | null> {
  try {
    return await stripe().paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    if ((err as Stripe.errors.StripeError).statusCode === 404) return null;
    throw err;
  }
}

export async function confirmPaymentIntent(
  paymentIntentId: string,
  paymentMethodId?: string,
): Promise<Stripe.PaymentIntent> {
  return stripe().paymentIntents.confirm(paymentIntentId, {
    payment_method: paymentMethodId,
  });
}

/* -------------------------------------------------------------------------- */
/* Webhook signature verification                                             */
/* -------------------------------------------------------------------------- */

export function constructWebhookEvent(
  rawBody: string | Buffer,
  signature: string,
  secret: string,
): Stripe.Event {
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}
