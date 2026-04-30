import { redirect } from "next/navigation";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import { getSubscriptionStatus } from "@/server/services/subscription.service";
import { prisma } from "@crawlix/db";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return redirect("/");
  if (isAuthError(ctx)) return redirect("/");

  const [status, org] = await Promise.all([
    getSubscriptionStatus(ctx.orgId),
    prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { stripeCustomerId: true },
    }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Billing</h1>
      <p className="mt-1 text-sm text-ink-600">
        Manage your subscription and view payment history.
      </p>
      <div className="mt-6">
        <BillingClient
          plan={status.plan}
          isActive={status.isActive}
          stripeStatus={status.stripeStatus}
          currentPeriodEnd={status.currentPeriodEnd?.toISOString()}
          cancelAt={status.cancelAt?.toISOString()}
          hasStripeCustomer={!!org?.stripeCustomerId}
          starterPriceId={process.env.STRIPE_PRICE_ID_STARTER ?? null}
          growthPriceId={process.env.STRIPE_PRICE_ID_GROWTH ?? null}
          scalePriceId={process.env.STRIPE_PRICE_ID_SCALE ?? null}
        />
      </div>
    </div>
  );
}
