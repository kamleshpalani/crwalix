import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import { prisma } from "@crawlix/db";
import OrganizationForm from "./OrganizationForm";

export const dynamic = "force-dynamic";

/** Section 6.2 — tenant (Organization) profile. */
export default async function OrganizationSettingsPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const role = (ctx.role || "").toLowerCase();
  const canEdit =
    ctx.isSuperAdmin || role.includes("admin") || role.includes("owner");

  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: {
      id: true,
      slug: true,
      name: true,
      plan: true,
      status: true,
      billingStatus: true,
      companyEmail: true,
      companyPhone: true,
      website: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      aiUsageLimit: true,
      leadSearchLimit: true,
      createdAt: true,
    },
  });
  if (!org) return <NoOrgBanner />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tenant"
        title="Organization"
        icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2m-2 0v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4M9 7h2m-2 4h2m4-4h2m-2 4h2"
        description="Update your company details. Plan, limits, and status are managed by platform admins."
      />
      <OrganizationForm
        canEdit={canEdit}
        initial={{
          slug: org.slug,
          name: org.name,
          plan: org.plan,
          status: org.status,
          billingStatus: org.billingStatus,
          companyEmail: org.companyEmail ?? "",
          companyPhone: org.companyPhone ?? "",
          website: org.website ?? "",
          addressLine1: org.addressLine1 ?? "",
          addressLine2: org.addressLine2 ?? "",
          city: org.city ?? "",
          state: org.state ?? "",
          postalCode: org.postalCode ?? "",
          country: org.country ?? "",
          aiUsageLimit: org.aiUsageLimit,
          leadSearchLimit: org.leadSearchLimit,
        }}
      />
    </div>
  );
}
