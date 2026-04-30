import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import { prisma } from "@crawlix/db";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";

/** Section 6.1 — current-user profile. */
export default async function ProfilePage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      isSuperAdmin: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!user) return <NoOrgBanner />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="My profile"
        icon="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z"
        description="Update your name and phone. Email and password are managed via your sign-in provider."
      />
      <ProfileForm
        initial={{
          email: user.email,
          firstName: user.firstName ?? "",
          lastName: user.lastName ?? "",
          phone: user.phone ?? "",
          status: user.status,
          isSuperAdmin: user.isSuperAdmin,
          lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
          createdAt: user.createdAt.toISOString(),
        }}
      />
    </div>
  );
}
