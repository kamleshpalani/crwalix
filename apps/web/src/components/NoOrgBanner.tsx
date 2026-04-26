'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import {
  useAuth,
  useOrganization,
  useOrganizationList,
  useSession
} from '@clerk/nextjs';

const CreateOrganization = dynamic(
  () => import('@clerk/nextjs').then((m) => m.CreateOrganization),
  { ssr: false, loading: () => <p className="text-sm text-ink-500">Loading…</p> }
);

const MAX_REFRESH_ATTEMPTS = 6;

export default function NoOrgBanner() {
  const { isLoaded: authLoaded, orgId: sessionOrgId } = useAuth();
  const { session } = useSession();
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { isLoaded: listLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: { infinite: false }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptsRef = useRef(0);

  const memberships = listLoaded ? userMemberships?.data ?? [] : [];

  // (1) Auto-activate the user's only membership if Clerk hasn't picked one.
  useEffect(() => {
    if (!authLoaded || !listLoaded) return;
    if (sessionOrgId) return;
    if (memberships.length === 1 && setActive) {
      setBusy(true);
      setActive({ organization: memberships[0]!.organization.id })
        .then(() => setBusy(false))
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Failed to activate organization');
          setBusy(false);
        });
    }
  }, [authLoaded, listLoaded, sessionOrgId, memberships, setActive]);

  // (2) Once the client has an active org, force Clerk to mint a fresh
  //     session token (so the cookie carries org_id) and then hard-navigate
  //     so the SSR auth() picks it up.
  useEffect(() => {
    if (!authLoaded || !orgLoaded) return;
    if (!sessionOrgId || !organization?.id) return;
    if (sessionOrgId !== organization.id) return;
    if (!session) return;
    if (attemptsRef.current >= MAX_REFRESH_ATTEMPTS) return;

    attemptsRef.current += 1;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        // Force Clerk to refresh the session JWT (so cookie has org_id).
        await session.getToken({ skipCache: true });
      } catch {
        // ignore — we'll try router.refresh either way
      }
      if (cancelled) return;
      // Hard navigate so middleware + server components see fresh cookies.
      window.location.assign('/dashboard');
    }, attemptsRef.current === 1 ? 50 : 800);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [authLoaded, orgLoaded, sessionOrgId, organization?.id, session]);

  async function continueNow() {
    setBusy(true);
    try {
      await session?.getToken({ skipCache: true });
    } catch {
      /* ignore */
    }
    window.location.assign('/dashboard');
  }

  const showCreate = listLoaded && memberships.length === 0;
  const haveActiveSession = !!sessionOrgId;

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6">
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 max-w-md text-center">
        <strong>
          {haveActiveSession ? 'Connecting your organization…' : 'No organization selected.'}
        </strong>
        <p className="mt-1">
          {haveActiveSession
            ? 'Hang tight while we sync your session. If this stays for more than a few seconds, click Continue.'
            : "Create or pick an organization below — it's your workspace for projects, searches, and leads."}
        </p>
      </div>

      {busy && <p className="text-sm text-ink-500">Activating your organization…</p>}
      {error && (
        <p className="rounded-md border border-rose-300 bg-rose-50 p-2 text-sm text-rose-800">
          {error}
        </p>
      )}

      {haveActiveSession && (
        <button
          type="button"
          onClick={continueNow}
          disabled={busy}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Continue to dashboard
        </button>
      )}

      {!haveActiveSession && memberships.length > 0 && setActive && (
        <div className="glass p-4 w-full max-w-md">
          <p className="text-sm font-medium text-ink-900">Pick an organization</p>
          <ul className="mt-2 divide-y divide-white/60">
            {memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                <span>{m.organization.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setActive({ organization: m.organization.id })
                      .then(async () => {
                        try {
                          await session?.getToken({ skipCache: true });
                        } catch {
                          /* ignore */
                        }
                        window.location.assign('/dashboard');
                      })
                      .catch((e) => {
                        setError(e instanceof Error ? e.message : 'Failed');
                        setBusy(false);
                      });
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-white/70 disabled:opacity-50"
                >
                  Use
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showCreate && (
        <CreateOrganization
          routing="hash"
          skipInvitationScreen
          afterCreateOrganizationUrl="/dashboard"
        />
      )}
    </div>
  );
}
