import Link from 'next/link';
import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import { providersService } from '@/server/services/providers.service';
import { outreachService, suppressionService } from '@/server/services/outreach.service';
import ProviderConfigForm from './ProviderConfigForm';
import ProviderTermsForm from './ProviderTermsForm';
import OutreachSettingsForm from './OutreachSettingsForm';

interface KnownProvider {
  id: string;
  name: string;
  envHint: string;
  description: string;
  termsUrl: string;
}

const KNOWN_PROVIDERS: KnownProvider[] = [
  {
    id: 'google_places',
    name: 'Google Places (New)',
    envHint: 'GOOGLE_PLACES_API_KEY',
    description: 'Text & nearby search for local businesses.',
    termsUrl:
      'https://cloud.google.com/maps-platform/terms/maps-service-terms'
  },
  {
    id: 'yelp',
    name: 'Yelp Fusion',
    envHint: 'YELP_FUSION_API_KEY',
    description: 'Strong for local SMBs; 24-hour cache limit enforced.',
    termsUrl: 'https://docs.developer.yelp.com/docs/fusion-api-terms-of-use'
  },
  {
    id: 'osm',
    name: 'OpenStreetMap (Overpass)',
    envHint: '— (keyless, ODbL attribution required)',
    description:
      'Free worldwide POI data under the ODbL — attribution to © OpenStreetMap contributors is required.',
    termsUrl: 'https://www.openstreetmap.org/copyright'
  }
];

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const [configs, outreach, suppressions] = await Promise.all([
    providersService.list(ctx.orgId),
    outreachService.get(ctx.orgId),
    suppressionService.list(ctx.orgId, 1)
  ]);
  const compliance = await outreachService.complianceStatus(ctx.orgId);
  const byProvider = new Map(configs.map((c) => [c.provider, c]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-ink-600">
          Configure providers, accept Terms, and review compliance settings.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium">Search providers</h2>
        <p className="mt-1 text-sm text-ink-500">
          API keys are read from worker environment variables. You must accept
          each provider&apos;s Terms before searches against that provider can run.
        </p>
        <ul className="mt-4 space-y-3">
          {KNOWN_PROVIDERS.map((p) => {
            const cfg = byProvider.get(p.id);
            return (
              <li key={p.id} className="glass p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-ink-500">id: {p.id}</div>
                    <p className="mt-1 text-sm text-ink-600">{p.description}</p>
                    <div className="mt-1 text-xs text-ink-500">
                      Env: <code>{p.envHint}</code>
                    </div>
                  </div>
                  <ProviderConfigForm
                    provider={p.id}
                    enabled={cfg?.enabled ?? true}
                    dailyBudget={cfg?.dailyBudget ?? null}
                  />
                </div>
                <ProviderTermsForm
                  provider={p.id}
                  termsUrl={p.termsUrl}
                  acceptedAt={cfg?.termsAcceptedAt ?? null}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-medium">Outreach compliance</h2>
        <p className="mt-1 text-sm text-ink-500">
          Required for any outreach feature. Crawlix will refuse to send email
          on your behalf until these are filled in.
        </p>
        <div className="mt-4 glass p-4">
          <OutreachSettingsForm
            initial={outreach}
            missing={compliance.missing}
            suppressionCount={suppressions.length}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">Scoring rules</h2>
        <p className="mt-1 text-sm text-ink-500">
          The default ruleset (v1.0.0) is currently active. Edit{' '}
          <code>packages/scoring/src/rules/default.ts</code> to customize.
        </p>
        <ul className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {[
            ['missing_website', 'Up to +45 for confirmed no website'],
            ['business_status', '−60 if permanently closed'],
            ['review_activity', 'Up to +15 with 100+ reviews'],
            ['rating', 'Up to +10 for 4.5★+'],
            ['chain_likelihood', '−25 for chain/franchise hints']
          ].map(([k, v]) => (
            <li
              key={k}
              className="flex items-center justify-between rounded bg-white/40 px-3 py-2"
            >
              <span className="font-mono text-xs text-ink-700">{k}</span>
              <span className="text-xs text-ink-600">{v}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-500">
          Tier thresholds: HIGH ≥ 75, MEDIUM ≥ 45, otherwise LOW.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-medium">Organization</h2>
        <ul className="mt-3 glass text-sm">
          <li className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-ink-500">Internal organization id</span>
            <span className="font-mono text-xs">{ctx.orgId}</span>
          </li>
          <li className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-ink-500">Clerk org id</span>
            <span className="font-mono text-xs">{ctx.clerkOrgId}</span>
          </li>
          <li className="flex items-center justify-between px-4 py-3">
            <span className="text-ink-500">Members</span>
            <Link href="#" className="text-xs text-ink-500">
              Manage in Clerk header switcher
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
