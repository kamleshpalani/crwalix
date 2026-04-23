'use client';

import dynamic from 'next/dynamic';

const OrganizationSwitcher = dynamic(
  () => import('@clerk/nextjs').then((m) => m.OrganizationSwitcher),
  { ssr: false, loading: () => null }
);

export default function HeaderOrg() {
  return (
    <OrganizationSwitcher
      hidePersonal
      afterCreateOrganizationUrl="/dashboard"
      afterSelectOrganizationUrl="/dashboard"
      afterLeaveOrganizationUrl="/dashboard"
    />
  );
}
