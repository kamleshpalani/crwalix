import Link from "next/link";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import { providersService } from "@/server/services/providers.service";
import {
  outreachService,
  suppressionService,
} from "@/server/services/outreach.service";
import { listExternalProviders } from "@crawlix/providers";
import ProviderConfigForm from "./ProviderConfigForm";
import ProviderTermsForm from "./ProviderTermsForm";
import OutreachSettingsForm from "./OutreachSettingsForm";
import NotificationPrefsForm from "./NotificationPrefsForm";
import { withOrg } from "@crawlix/db";

interface KnownProvider {
  id: string;
  name: string;
  envHint: string;
  description: string;
  termsUrl: string;
}

const KNOWN_PROVIDERS: KnownProvider[] = [
  {
    id: "google_places",
    name: "Google Places (New)",
    envHint: "GOOGLE_PLACES_API_KEY",
    description: "Text & nearby search for local businesses.",
    termsUrl: "https://cloud.google.com/maps-platform/terms/maps-service-terms",
  },
  {
    id: "yelp_fusion",
    name: "Yelp Fusion",
    envHint: "YELP_FUSION_API_KEY",
    description: "Strong for local SMBs; 24-hour cache limit enforced.",
    termsUrl: "https://docs.developer.yelp.com/docs/fusion-api-terms-of-use",
  },
  {
    id: "osm",
    name: "OpenStreetMap (Overpass)",
    envHint: "— (keyless, ODbL attribution required)",
    description:
      "Free worldwide POI data under the ODbL — attribution to © OpenStreetMap contributors is required.",
    termsUrl: "https://www.openstreetmap.org/copyright",
  },
];

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  const [configs, outreach, suppressions] = await Promise.all([
    providersService.list(ctx.orgId),
    outreachService.get(ctx.orgId),
    suppressionService.list(ctx.orgId, 1),
  ]);
  const compliance = await outreachService.complianceStatus(ctx.orgId);
  const byProvider = new Map(configs.map((c) => [c.provider, c]));
  const orgPrefs = await withOrg(ctx.orgId, (tx) =>
    tx.organization.findUnique({
      where: { id: ctx.orgId },
      select: { notificationWebhookUrl: true, notificationEmail: true },
    }),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        icon="M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4.9a7 7 0 00-2-1.2L14 3h-4l-.5 2.5a7 7 0 00-2 1.2L5 5.8 3 9.2l2 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-.9a7 7 0 002 1.2L10 21h4l.5-2.5a7 7 0 002-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"
        description="Configure providers, accept Terms, and review compliance settings."
      />

      <nav className="flex flex-wrap gap-2">
        <Link
          href="/settings/profile"
          className="rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink-700 shadow-glass backdrop-blur hover:bg-white"
        >
          My profile
        </Link>
        <Link
          href="/settings/organization"
          className="rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink-700 shadow-glass backdrop-blur hover:bg-white"
        >
          Organization
        </Link>
        <Link
          href="/settings/billing"
          className="rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink-700 shadow-glass backdrop-blur hover:bg-white"
        >
          Billing
        </Link>
        <Link
          href="/settings/privacy"
          className="rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink-700 shadow-glass backdrop-blur hover:bg-white"
        >
          Privacy & data
        </Link>
        <Link
          href="/settings/developer"
          className="rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink-700 shadow-glass backdrop-blur hover:bg-white"
        >
          Developer
        </Link>
      </nav>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">
            Search providers
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            API keys are read from worker environment variables. You must accept
            each provider&apos;s Terms before searches against that provider can
            run.
          </p>
        </div>
        <ul className="space-y-3">
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

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">
            Outreach compliance
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Required for any outreach feature. Crawlix will refuse to send email
            on your behalf until these are filled in.
          </p>
        </div>
        <div className="glass p-5">
          <OutreachSettingsForm
            initial={outreach}
            missing={compliance.missing}
            suppressionCount={suppressions.length}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Notifications</h2>
          <p className="mt-1 text-sm text-ink-500">
            Where to deliver alerts when scheduled searches discover new
            businesses. The dashboard bell always shows them; webhook + email
            are optional add-ons.
          </p>
        </div>
        <div className="glass p-5">
          <NotificationPrefsForm
            initialWebhookUrl={orgPrefs?.notificationWebhookUrl ?? ""}
            initialEmail={orgPrefs?.notificationEmail ?? ""}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Scoring rules</h2>
          <p className="mt-1 text-sm text-ink-500">
            The default ruleset (v1.0.0) is currently active. Edit{" "}
            <code className="rounded bg-ink-100/70 px-1 py-0.5 font-mono text-xs">
              packages/scoring/src/rules/default.ts
            </code>{" "}
            to customize.
          </p>
        </div>
        <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {[
            ["missing_website", "Up to +45 for confirmed no website"],
            ["business_status", "−60 if permanently closed"],
            ["review_activity", "Up to +15 with 100+ reviews"],
            ["rating", "Up to +10 for 4.5★+"],
            ["chain_likelihood", "−25 for chain/franchise hints"],
          ].map(([k, v]) => (
            <li
              key={k}
              className="flex items-center justify-between rounded-xl border border-white/60 bg-white/60 px-4 py-3 backdrop-blur"
            >
              <span className="font-mono text-xs font-semibold text-brand-700">
                {k}
              </span>
              <span className="text-xs text-ink-600">{v}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-500">
          Tier thresholds: HIGH ≥ 80, MEDIUM ≥ 60, otherwise LOW.
        </p>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">
            External enrichment APIs
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Optional paid integrations. Each is feature-flagged on its
            environment variable — missing keys silently disable the feature,
            the rest of the app keeps working.
          </p>
        </div>
        <ul className="glass divide-y divide-white/60 overflow-hidden text-sm">
          {listExternalProviders().map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-600">
                    {p.category}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-500">
                  Env: <span className="font-mono">{p.envVars.join(", ")}</span>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  p.configured
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-ink-100 text-ink-600"
                }`}
              >
                {p.configured ? "Configured" : "Not configured"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink-900">Organization</h2>
        <ul className="glass overflow-hidden text-sm">
          <li className="flex items-center justify-between border-b border-white/60 px-5 py-3.5">
            <span className="text-ink-500">Internal organization id</span>
            <span className="font-mono text-xs text-ink-700">{ctx.orgId}</span>
          </li>
          <li className="flex items-center justify-between border-b border-white/60 px-5 py-3.5">
            <span className="text-ink-500">Clerk org id</span>
            <span className="font-mono text-xs text-ink-700">
              {ctx.clerkOrgId}
            </span>
          </li>
          <li className="flex items-center justify-between px-5 py-3.5">
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
