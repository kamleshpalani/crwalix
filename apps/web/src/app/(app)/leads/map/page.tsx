import dynamic from "next/dynamic";
import Link from "next/link";
import { requireOrg, isResponse, isAuthError } from "@/lib/auth";
import NoOrgBanner from "@/components/NoOrgBanner";
import PageHeader from "@/components/PageHeader";
import { leadsService } from "@/server/services/leads.service";
import { parseLeadFilter } from "@/lib/filters";
import LeadFilters from "../LeadFilters";
import type { MapPin } from "./LeadMapClient";

// Leaflet requires browser APIs — dynamic import with SSR disabled
const LeadMapClient = dynamic(() => import("./LeadMapClient"), { ssr: false });

export default async function LeadsMapPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  // Fetch up to 2 000 leads with coordinates for the map
  const filter = parseLeadFilter({ ...searchParams, pageSize: "2000" });
  const { items, total } = await leadsService.list(ctx.orgId, filter);

  const pins: MapPin[] = items
    .filter(
      (l): l is typeof l & { lat: number; lng: number } =>
        typeof l.lat === "number" && typeof l.lng === "number",
    )
    .map((l) => ({
      id: l.id,
      name: l.name,
      lat: l.lat,
      lng: l.lng,
      score: l.score ?? null,
      priorityTier: l.priorityTier ?? null,
      websiteStatus: l.websiteStatus,
      city: l.city ?? null,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pipeline"
        title="Lead Map"
        icon="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
        description="Geographic view of your leads. Colour = priority tier."
        chips={
          <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-ink-600 backdrop-blur">
            {pins.length.toLocaleString()} / {total.toLocaleString()} with
            coords
          </span>
        }
        actions={
          <Link href="/leads" className="btn-ghost">
            ← List view
          </Link>
        }
      />

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/60 bg-white/60 px-4 py-2 text-xs">
        {[
          { label: "Critical", color: "#7c3aed" },
          { label: "High", color: "#ef4444" },
          { label: "Medium", color: "#f59e0b" },
          { label: "Low", color: "#22c55e" },
        ].map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full border-2 border-white shadow"
              style={{ background: color }}
            />
            {label}
          </span>
        ))}
      </div>

      <div className="glass p-4">
        <LeadFilters />
      </div>

      <LeadMapClient pins={pins} />
    </div>
  );
}
