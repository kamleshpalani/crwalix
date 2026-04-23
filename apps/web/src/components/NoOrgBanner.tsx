'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { useOrganization } from '@clerk/nextjs';

const CreateOrganization = dynamic(
  () => import('@clerk/nextjs').then((m) => m.CreateOrganization),
  { ssr: false, loading: () => <p className="text-sm text-slate-500">Loading…</p> }
);

export default function NoOrgBanner() {
  const { organization, isLoaded } = useOrganization();
  const reloadedRef = useRef(false);

  // Once Clerk reports an active organization, do a full-page navigation so the
  // server-side session cookie picks up the new clerkOrgId on the very next
  // request. router.refresh() alone can race with Clerk's cookie set.
  useEffect(() => {
    if (isLoaded && organization?.id && !reloadedRef.current) {
      reloadedRef.current = true;
      window.location.assign('/dashboard');
    }
  }, [isLoaded, organization?.id]);

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6">
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 max-w-md text-center">
        <strong>No organization selected.</strong>
        <p className="mt-1">
          Create an organization below — it's your workspace for projects, searches, and leads.
        </p>
      </div>
      <CreateOrganization routing="hash" skipInvitationScreen />
    </div>
  );
}
