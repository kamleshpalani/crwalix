// apps/web/src/server/services/service-packages.service.ts
//
// Module #10b — Predefined service-package catalog.
//
// Each org sees a curated set of "Crawlix presets" plus any custom packages
// the team has authored. Presets are seeded by migration 0029, but newly
// onboarded orgs may not have run that migration yet — `ensureSeeded` lazily
// inserts the defaults the first time someone reads/writes the catalog.

import { withOrg } from "@crawlix/db";

export interface ServicePackageDto {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  category: string | null;
  priceCents: number;
  currency: string;
  billingCycle: string;
  features: string[];
  deliverables: string[];
  scopeItems: string[];
  deliveryDays: number | null;
  isBuiltIn: boolean;
  active: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServicePackageUpsertInput {
  slug?: string;
  name: string;
  summary?: string | null;
  description?: string | null;
  category?: string | null;
  priceCents: number;
  currency?: string;
  billingCycle?: "ONE_TIME" | "MONTHLY" | "YEARLY";
  features?: string[];
  deliverables?: string[];
  scopeItems?: string[];
  deliveryDays?: number | null;
  active?: boolean;
  position?: number;
}

const PRESET_SEEDS: Array<
  Omit<ServicePackageDto, "id" | "createdAt" | "updatedAt">
> = [
  {
    slug: "basic-website",
    name: "Basic Website",
    summary: "5-page mobile-friendly site for small businesses.",
    description:
      "<p>Modern, mobile-friendly 5-page website with copy assistance and basic SEO.</p>",
    category: "website",
    priceCents: 80000,
    currency: "USD",
    billingCycle: "ONE_TIME",
    features: [
      "5 pages",
      "Mobile-friendly",
      "Contact form",
      "Basic SEO",
      "Domain + hosting setup",
    ],
    deliverables: [
      "Designed homepage",
      "4 inner pages",
      "Contact form",
      "Basic on-page SEO",
    ],
    scopeItems: ["Discovery call", "Copy review", "Up to 2 revision rounds"],
    deliveryDays: 21,
    isBuiltIn: true,
    active: true,
    position: 10,
  },
  {
    slug: "business-website",
    name: "Business Website",
    summary: "10-page conversion-focused site with CMS.",
    description:
      "<p>Conversion-optimised 10-page site with CMS so the team can update content without us.</p>",
    category: "website",
    priceCents: 180000,
    currency: "USD",
    billingCycle: "ONE_TIME",
    features: [
      "10 pages",
      "CMS",
      "Blog",
      "On-page SEO",
      "Analytics",
      "Lead-capture forms",
    ],
    deliverables: [
      "10-page site",
      "CMS training",
      "Blog setup",
      "Analytics dashboard",
    ],
    scopeItems: [
      "Discovery + sitemap",
      "Copy assistance",
      "Up to 3 revision rounds",
    ],
    deliveryDays: 35,
    isBuiltIn: true,
    active: true,
    position: 20,
  },
  {
    slug: "ecommerce-store",
    name: "E-Commerce Store",
    summary: "Up to 50 products, payments, inventory.",
    description:
      "<p>Full e-commerce setup with payments, inventory and order management.</p>",
    category: "ecommerce",
    priceCents: 350000,
    currency: "USD",
    billingCycle: "ONE_TIME",
    features: [
      "Up to 50 SKUs",
      "Stripe checkout",
      "Inventory",
      "Order email",
      "Customer accounts",
      "Tax + shipping rules",
    ],
    deliverables: [
      "Storefront",
      "Product upload (50)",
      "Stripe integration",
      "Order workflow",
    ],
    scopeItems: [
      "Discovery + product taxonomy",
      "Payment processor setup",
      "Up to 3 revision rounds",
    ],
    deliveryDays: 45,
    isBuiltIn: true,
    active: true,
    position: 30,
  },
  {
    slug: "website-redesign",
    name: "Website Redesign",
    summary: "Brand + UX refresh of an existing site.",
    description:
      "<p>Modern visual + UX refresh with conversion improvements.</p>",
    category: "website",
    priceCents: 240000,
    currency: "USD",
    billingCycle: "ONE_TIME",
    features: [
      "UX audit",
      "Brand refresh",
      "Page redesign",
      "Performance pass",
      "Accessibility pass",
    ],
    deliverables: [
      "UX audit",
      "Redesigned key pages",
      "Performance + a11y report",
    ],
    scopeItems: [
      "Stakeholder workshop",
      "Design system tokens",
      "Up to 3 revision rounds",
    ],
    deliveryDays: 30,
    isBuiltIn: true,
    active: true,
    position: 40,
  },
  {
    slug: "maintenance-care",
    name: "Maintenance & Care",
    summary: "Monthly upkeep, security, backups.",
    description:
      "<p>Monthly retainer covering updates, security patches, backups and small content edits.</p>",
    category: "support",
    priceCents: 25000,
    currency: "USD",
    billingCycle: "MONTHLY",
    features: [
      "Plugin/CMS updates",
      "Daily backups",
      "Uptime monitoring",
      "Up to 2 hr/mo content edits",
      "Priority support",
    ],
    deliverables: [
      "Monthly health report",
      "Patched dependencies",
      "Backup restore drill",
    ],
    scopeItems: ["Cancel anytime with 30-day notice"],
    deliveryDays: null,
    isBuiltIn: true,
    active: true,
    position: 50,
  },
  {
    slug: "ai-automation",
    name: "AI Automation Pack",
    summary: "Custom AI workflow + chatbot integration.",
    description:
      "<p>Embed an AI assistant or workflow automation tailored to the customer's ops.</p>",
    category: "ai",
    priceCents: 450000,
    currency: "USD",
    billingCycle: "ONE_TIME",
    features: [
      "Use-case workshop",
      "Custom prompt suite",
      "Vector knowledge base",
      "Chat or workflow UI",
      "Analytics",
    ],
    deliverables: [
      "Discovery doc",
      "Working AI workflow",
      "Prompt + KB handoff",
    ],
    scopeItems: ["Customer supplies source content", "Up to 2 revision rounds"],
    deliveryDays: 30,
    isBuiltIn: true,
    active: true,
    position: 60,
  },
];

function rowToDto(row: {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  category: string | null;
  priceCents: number;
  currency: string;
  billingCycle: string;
  features: unknown;
  deliverables: unknown;
  scopeItems: unknown;
  deliveryDays: number | null;
  isBuiltIn: boolean;
  active: boolean;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}): ServicePackageDto {
  const toStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    description: row.description,
    category: row.category,
    priceCents: row.priceCents,
    currency: row.currency,
    billingCycle: row.billingCycle,
    features: toStringArray(row.features),
    deliverables: toStringArray(row.deliverables),
    scopeItems: toStringArray(row.scopeItems),
    deliveryDays: row.deliveryDays,
    isBuiltIn: row.isBuiltIn,
    active: row.active,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const servicePackagesService = {
  /** Lazily seed the 6 Crawlix presets the first time an org hits the catalog. */
  async ensureSeeded(orgId: string): Promise<void> {
    await withOrg(orgId, async (tx) => {
      const existing = await tx.servicePackage.count({
        where: { organizationId: orgId, isBuiltIn: true },
      });
      if (existing > 0) return;
      for (const seed of PRESET_SEEDS) {
        await tx.servicePackage.create({
          data: {
            organizationId: orgId,
            slug: seed.slug,
            name: seed.name,
            summary: seed.summary,
            description: seed.description,
            category: seed.category,
            priceCents: seed.priceCents,
            currency: seed.currency,
            billingCycle: seed.billingCycle,
            features: seed.features as never,
            deliverables: seed.deliverables as never,
            scopeItems: seed.scopeItems as never,
            deliveryDays: seed.deliveryDays,
            isBuiltIn: true,
            active: seed.active,
            position: seed.position,
          },
        });
      }
    });
  },

  async list(
    orgId: string,
    opts: { activeOnly?: boolean } = {},
  ): Promise<ServicePackageDto[]> {
    await this.ensureSeeded(orgId);
    return withOrg(orgId, async (tx) => {
      const rows = await tx.servicePackage.findMany({
        where: {
          organizationId: orgId,
          ...(opts.activeOnly ? { active: true } : {}),
        },
        orderBy: [{ position: "asc" }, { name: "asc" }],
      });
      return rows.map(rowToDto);
    });
  },

  async get(orgId: string, id: string): Promise<ServicePackageDto | null> {
    return withOrg(orgId, async (tx) => {
      const row = await tx.servicePackage.findFirst({
        where: { id, organizationId: orgId },
      });
      return row ? rowToDto(row) : null;
    });
  },

  async create(
    orgId: string,
    userId: string | null,
    input: ServicePackageUpsertInput,
  ): Promise<ServicePackageDto> {
    const slug =
      input.slug?.trim() ||
      input.name.toLowerCase().trim().replaceAll(/\s+/g, "-").slice(0, 60);
    return withOrg(orgId, async (tx) => {
      const row = await tx.servicePackage.create({
        data: {
          organizationId: orgId,
          slug,
          name: input.name,
          summary: input.summary ?? null,
          description: input.description ?? null,
          category: input.category ?? null,
          priceCents: input.priceCents,
          currency: input.currency ?? "USD",
          billingCycle: input.billingCycle ?? "ONE_TIME",
          features: (input.features ?? []) as never,
          deliverables: (input.deliverables ?? []) as never,
          scopeItems: (input.scopeItems ?? []) as never,
          deliveryDays: input.deliveryDays ?? null,
          isBuiltIn: false,
          active: input.active ?? true,
          position: input.position ?? 100,
          createdById: userId,
        },
      });
      return rowToDto(row);
    });
  },

  async update(
    orgId: string,
    id: string,
    input: Partial<ServicePackageUpsertInput>,
  ): Promise<ServicePackageDto | null> {
    return withOrg(orgId, async (tx) => {
      const existing = await tx.servicePackage.findFirst({
        where: { id, organizationId: orgId },
      });
      if (!existing) return null;
      const row = await tx.servicePackage.update({
        where: { id: existing.id },
        data: {
          name: input.name ?? existing.name,
          summary: input.summary ?? existing.summary,
          description: input.description ?? existing.description,
          category: input.category ?? existing.category,
          priceCents: input.priceCents ?? existing.priceCents,
          currency: input.currency ?? existing.currency,
          billingCycle: input.billingCycle ?? existing.billingCycle,
          features:
            input.features !== undefined
              ? (input.features as never)
              : (existing.features as never),
          deliverables:
            input.deliverables !== undefined
              ? (input.deliverables as never)
              : (existing.deliverables as never),
          scopeItems:
            input.scopeItems !== undefined
              ? (input.scopeItems as never)
              : (existing.scopeItems as never),
          deliveryDays:
            input.deliveryDays !== undefined
              ? input.deliveryDays
              : existing.deliveryDays,
          active: input.active ?? existing.active,
          position: input.position ?? existing.position,
        },
      });
      return rowToDto(row);
    });
  },

  async remove(orgId: string, id: string): Promise<boolean> {
    return withOrg(orgId, async (tx) => {
      const existing = await tx.servicePackage.findFirst({
        where: { id, organizationId: orgId },
        select: { id: true, isBuiltIn: true },
      });
      if (!existing) return false;
      // Soft-disable built-ins (preserve catalog), hard-delete custom rows.
      if (existing.isBuiltIn) {
        await tx.servicePackage.update({
          where: { id: existing.id },
          data: { active: false },
        });
      } else {
        await tx.servicePackage.delete({ where: { id: existing.id } });
      }
      return true;
    });
  },
};
