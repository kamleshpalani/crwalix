import { withOrg } from "@crawlix/db";
import {
  EnrichmentKind,
  EnrichmentStatus,
  JobName,
  QueueName,
  type LeadFilter,
  type LeadStatus,
  type CreateLeadInput,
  type PatchLeadInput,
} from "@crawlix/shared";
import { enqueue } from "@/lib/queue";
import {
  digitsOnly,
  normalizeName,
  normalizeAddress,
} from "@/server/services/lead-dedup";

export const leadsService = {
  async list(orgId: string, filter: LeadFilter) {
    const skip = (filter.page - 1) * filter.pageSize;

    const where: Record<string, unknown> = { organizationId: orgId };
    if (filter.city)
      where.city = { contains: filter.city, mode: "insensitive" };
    if (filter.state)
      where.state = { contains: filter.state, mode: "insensitive" };
    if (filter.country)
      where.country = { equals: filter.country, mode: "insensitive" };
    if (filter.postalCode)
      where.postalCode = { contains: filter.postalCode, mode: "insensitive" };
    if (filter.minScore !== undefined) where.score = { gte: filter.minScore };
    if (filter.websiteStatus) {
      where.websiteStatus = Array.isArray(filter.websiteStatus)
        ? { in: filter.websiteStatus }
        : filter.websiteStatus;
    }
    if (filter.websiteHealth) {
      where.websiteHealth = filter.websiteHealth;
    }
    if (filter.outreachSuitable !== undefined) {
      // websiteAudit is JSON; filter by audit.outreachFit.suitable.
      where.websiteAudit = {
        path: ["outreachFit", "suitable"],
        equals: filter.outreachSuitable,
      };
    }
    if (filter.socialOnly) {
      // Match websites whose host is a social network / link-in-bio. Kept in
      // sync with SOCIAL_ONLY_HOSTS in packages/scoring/src/rules/default.ts.
      const SOCIAL_HOSTS = [
        "facebook.com",
        "m.facebook.com",
        "fb.com",
        "instagram.com",
        "linktr.ee",
        "linkin.bio",
        "business.site",
        "sites.google.com",
        "wa.me",
        "api.whatsapp.com",
        "t.me",
        "twitter.com",
        "x.com",
        "tiktok.com",
        "youtube.com",
      ];
      where.OR = [
        ...((where.OR as object[] | undefined) ?? []),
        ...SOCIAL_HOSTS.map((h) => ({
          website: { contains: h, mode: "insensitive" as const },
        })),
      ];
    }
    if (filter.missingForm) {
      // websiteAudit.signals.{hasContactForm,hasBookingForm} are booleans
      // populated by the audit. Filter accordingly. Only meaningful for
      // EXISTS leads — otherwise the signals are unset.
      const path = (key: "hasContactForm" | "hasBookingForm") => ({
        websiteAudit: { path: ["signals", key], equals: false } as const,
      });
      const conds =
        filter.missingForm === "contact"
          ? [path("hasContactForm")]
          : filter.missingForm === "booking"
            ? [path("hasBookingForm")]
            : [path("hasContactForm"), path("hasBookingForm")]; // 'any' → missing both
      where.AND = [
        ...((where.AND as object[] | undefined) ?? []),
        { websiteStatus: "EXISTS" },
        ...conds,
      ];
    }
    if (filter.priorityTier) {
      where.priorityTier = Array.isArray(filter.priorityTier)
        ? { in: filter.priorityTier }
        : filter.priorityTier;
    }
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: "insensitive" } },
        { phone: { contains: filter.search } },
      ];
    }
    if (filter.projectId) {
      where.sources = {
        some: { searchRun: { search: { projectId: filter.projectId } } },
      };
    }
    if (filter.searchId) {
      where.sources = { some: { searchRun: { searchId: filter.searchId } } };
    }
    if (filter.listId) {
      where.listMemberships = { some: { listId: filter.listId } };
    }
    if (filter.status) {
      where.status = Array.isArray(filter.status)
        ? { in: filter.status }
        : filter.status;
    }
    if (filter.businessScale) {
      where.businessScale = Array.isArray(filter.businessScale)
        ? { in: filter.businessScale }
        : filter.businessScale;
    }
    if (filter.provider) {
      where.provider = Array.isArray(filter.provider)
        ? { in: filter.provider }
        : filter.provider;
    }
    if (filter.industry) {
      where.industry = { contains: filter.industry, mode: "insensitive" };
    }
    if (filter.category) {
      const cat = filter.category;
      where.AND = [
        ...((where.AND as object[] | undefined) ?? []),
        {
          OR: [
            {
              categoryPrimary: { contains: cat, mode: "insensitive" as const },
            },
            { categories: { has: cat } },
          ],
        },
      ];
    }
    if (filter.hasPhone === true) {
      where.AND = [
        ...((where.AND as object[] | undefined) ?? []),
        { phone: { not: null } },
      ];
    } else if (filter.hasPhone === false) {
      where.AND = [
        ...((where.AND as object[] | undefined) ?? []),
        { phone: null },
      ];
    }
    if (filter.hasEmail === true) {
      where.AND = [
        ...((where.AND as object[] | undefined) ?? []),
        { email: { not: null } },
      ];
    } else if (filter.hasEmail === false) {
      where.AND = [
        ...((where.AND as object[] | undefined) ?? []),
        { email: null },
      ];
    }
    if (filter.hasSocial === true) {
      where.AND = [
        ...((where.AND as object[] | undefined) ?? []),
        {
          OR: [
            { facebookUrl: { not: null } },
            { instagramUrl: { not: null } },
            { googleProfileUrl: { not: null } },
          ],
        },
      ];
    } else if (filter.hasSocial === false) {
      where.AND = [
        ...((where.AND as object[] | undefined) ?? []),
        { facebookUrl: null },
        { instagramUrl: null },
        { googleProfileUrl: null },
      ];
    }
    if (filter.websiteOutdated === true) {
      where.websiteHealth = { in: ["OUTDATED", "NEEDS_REVIEW", "UNREACHABLE"] };
    }
    if (typeof filter.minRating === "number") {
      where.rating = { gte: filter.minRating };
    }
    if (typeof filter.minReviewCount === "number") {
      where.reviewCount = { gte: filter.minReviewCount };
    }
    if (filter.assignedUserId) {
      where.assignedUserId = filter.assignedUserId;
    }
    if (filter.crmStage) {
      where.crmStage = filter.crmStage;
    }
    if (filter.tag) {
      where.tags = { has: filter.tag };
    }
    if (filter.discoveredWithin) {
      const ms: Record<string, number> = {
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
        "90d": 90 * 24 * 60 * 60 * 1000,
      };
      const window = ms[filter.discoveredWithin];
      if (window) {
        where.createdAt = { gte: new Date(Date.now() - window) };
      }
    }

    const orderBy = orderByFromSort(filter.sort);

    return withOrg(orgId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.lead.findMany({
          where,
          orderBy,
          skip,
          take: filter.pageSize,
          include: { scores: { take: 1, orderBy: { createdAt: "desc" } } },
        }),
        tx.lead.count({ where }),
      ]);
      return { items, total, page: filter.page, pageSize: filter.pageSize };
    });
  },

  async get(orgId: string, id: string) {
    return withOrg(orgId, (tx) =>
      tx.lead.findFirst({
        where: { id },
        include: {
          enrichments: { orderBy: { createdAt: "desc" } },
          scores: { orderBy: { createdAt: "desc" }, take: 5 },
          sources: {
            take: 10,
            orderBy: { createdAt: "desc" },
            include: { searchRun: { include: { search: true } } },
          },
          mergeHistoryAsCanonical: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      }),
    );
  },

  async setStatus(orgId: string, id: string, status: LeadStatus) {
    return withOrg(orgId, (tx) =>
      tx.lead.update({
        where: { id },
        data: { status },
      }),
    );
  },

  async setStatusBulk(orgId: string, ids: string[], status: LeadStatus) {
    if (ids.length === 0) return 0;
    return withOrg(orgId, async (tx) => {
      const res = await tx.lead.updateMany({
        where: { id: { in: ids } },
        data: { status },
      });
      return res.count;
    });
  },

  async setNotes(orgId: string, id: string, notes: string) {
    return withOrg(orgId, (tx) =>
      tx.lead.update({
        where: { id },
        data: { notes: notes.length ? notes : null },
      }),
    );
  },

  /**
   * Update user-editable contact fields on a lead. Only fields explicitly
   * present in the patch are touched; empty strings clear nullable fields.
   */
  async patchContact(
    orgId: string,
    id: string,
    patch: {
      ownerName?: string | null;
      phone?: string | null;
      email?: string | null;
      website?: string | null;
      facebookUrl?: string | null;
      instagramUrl?: string | null;
      googleProfileUrl?: string | null;
      address?: string | null;
      postalCode?: string | null;
    },
  ) {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      data[k] = v;
    }
    if (Object.keys(data).length === 0) return null;
    return withOrg(orgId, (tx) => tx.lead.update({ where: { id }, data }));
  },

  async addTag(orgId: string, id: string, tag: string) {
    const clean = tag.trim().toLowerCase();
    if (!clean) return null;
    return withOrg(orgId, async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id },
        select: { tags: true },
      });
      if (!lead) return null;
      if (lead.tags.includes(clean)) return lead;
      return tx.lead.update({
        where: { id },
        data: { tags: { set: [...lead.tags, clean] } },
        select: { tags: true },
      });
    });
  },

  async removeTag(orgId: string, id: string, tag: string) {
    return withOrg(orgId, async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id },
        select: { tags: true },
      });
      if (!lead) return null;
      return tx.lead.update({
        where: { id },
        data: { tags: { set: lead.tags.filter((t) => t !== tag) } },
        select: { tags: true },
      });
    });
  },

  /** Manually queue a website-validation enrichment for a lead. */
  async auditWebsite(
    orgId: string,
    leadId: string,
  ): Promise<
    { ok: true; enrichmentId: string } | { ok: false; reason: string }
  > {
    const lead = await withOrg(orgId, (tx) =>
      tx.lead.findFirst({
        where: { id: leadId },
        select: { id: true, website: true },
      }),
    );
    if (!lead) return { ok: false, reason: "Lead not found" };
    if (!lead.website)
      return { ok: false, reason: "Lead has no website to audit" };

    const enrichment = await withOrg(orgId, (tx) =>
      tx.enrichment.create({
        data: {
          organizationId: orgId,
          leadId,
          kind: EnrichmentKind.WEBSITE_VALIDATION,
          provider: "crawlix-auditor",
          status: EnrichmentStatus.QUEUED,
        },
      }),
    );

    await enqueue(QueueName.ENRICHMENT, JobName.ENRICH_WEBSITE, {
      organizationId: orgId,
      enrichmentId: enrichment.id,
      leadId,
      kind: EnrichmentKind.WEBSITE_VALIDATION,
      provider: "crawlix-auditor",
    });
    return { ok: true, enrichmentId: enrichment.id };
  },

  /**
   * Manually create a lead. Performs dedup against existing leads. Behavior:
   *   - If a high-confidence duplicate is found (≥0.85 OR exact/place_id) and
   *     `mode='merge'` (default), the existing lead's missing fields are
   *     filled in and a LeadMergeHistory row (status='auto_merged') is
   *     written. The duplicate is NOT counted against the org's quota.
   *   - If a low-confidence fuzzy duplicate is found (name_address / name_geo /
   *     name_city below 0.85), a NEW lead is created and a LeadMergeHistory
   *     row (status='pending_review') is written linking the two so a human
   *     can approve or reject the merge.
   *   - If `mode='create_anyway'`, a new row is created regardless.
   */
  async create(
    orgId: string,
    input: CreateLeadInput,
    opts: { mode?: "merge" | "create_anyway"; createdByUserId?: string } = {},
  ): Promise<
    | {
        ok: true;
        leadId: string;
        created: true;
        pendingReview?: {
          canonicalLeadId: string;
          reason: string;
          confidence: number;
        };
      }
    | { ok: true; leadId: string; created: false; mergedReason: string }
  > {
    const { findDupOnEntry } = await import("./lead-dedup");
    const mode = opts.mode ?? "merge";
    const provider = input.provider || "manual";
    const externalPlaceId =
      input.externalPlaceId ||
      (provider === "manual"
        ? `manual:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
        : `${provider}:${Math.random().toString(36).slice(2, 12)}`);

    const phoneNorm = digitsOnly(input.phone) || null;
    const emailNorm = input.email ? input.email.toLowerCase().trim() : null;
    const nameNorm = normalizeName(input.name);
    const addrNorm = normalizeAddress(input.address) || null;

    return withOrg(orgId, async (tx) => {
      if (mode === "merge") {
        const dup = await findDupOnEntry(tx, orgId, {
          name: input.name,
          phone: input.phone,
          email: input.email,
          website: input.website,
          provider,
          externalPlaceId,
          city: input.city,
          address: input.address,
          lat: input.lat,
          lng: input.lng,
        });
        if (dup) {
          const isFuzzy =
            dup.reason === "name_address" ||
            dup.reason === "name_geo" ||
            dup.reason === "name_city";
          const lowConfidence = isFuzzy && dup.confidence < 0.85;
          if (lowConfidence) {
            // Defer to human review: create the new lead AND write a
            // pending_review row so the user can approve/reject.
            const created = await tx.lead.create({
              data: buildCreateData({
                orgId,
                provider,
                externalPlaceId,
                input,
                phoneNorm,
                emailNorm,
                nameNorm,
                addrNorm,
              }),
              select: { id: true },
            });
            await tx.leadMergeHistory.create({
              data: {
                organizationId: orgId,
                canonicalLeadId: dup.leadId,
                pendingLeadId: created.id,
                reason: dup.reason,
                confidence: dup.confidence,
                fromProvider: provider,
                fromExternalId: externalPlaceId,
                payload: input as unknown as object,
                status: "pending_review",
              },
            });
            return {
              ok: true,
              leadId: created.id,
              created: true,
              pendingReview: {
                canonicalLeadId: dup.leadId,
                reason: dup.reason,
                confidence: dup.confidence,
              },
            };
          }
          // Fill missing fields without overwriting existing data.
          const existing = await tx.lead.findFirst({
            where: { id: dup.leadId },
            select: {
              phone: true,
              email: true,
              website: true,
              ownerName: true,
              address: true,
              city: true,
              state: true,
              country: true,
              postalCode: true,
              lat: true,
              lng: true,
              rating: true,
              reviewCount: true,
              industry: true,
              categoryPrimary: true,
              categories: true,
            },
          });
          if (existing) {
            const update: Record<string, unknown> = { lastSeenAt: new Date() };
            const fillIfEmpty = <K extends keyof typeof existing>(
              k: K,
              v: unknown,
            ) => {
              if (v === undefined || v === null || v === "") return;
              if (
                existing[k] === null ||
                existing[k] === undefined ||
                existing[k] === ""
              ) {
                update[k as string] = v;
              }
            };
            fillIfEmpty("phone", input.phone);
            fillIfEmpty("email", input.email);
            fillIfEmpty("website", input.website);
            fillIfEmpty("ownerName", input.ownerName);
            fillIfEmpty("address", input.address);
            fillIfEmpty("city", input.city);
            fillIfEmpty("state", input.state);
            fillIfEmpty("country", input.country);
            fillIfEmpty("postalCode", input.postalCode);
            fillIfEmpty("lat", input.lat);
            fillIfEmpty("lng", input.lng);
            fillIfEmpty("rating", input.rating);
            fillIfEmpty("reviewCount", input.reviewCount);
            fillIfEmpty("industry", input.industry);
            fillIfEmpty("categoryPrimary", input.categoryPrimary);

            if (input.categories?.length) {
              const merged = Array.from(
                new Set([...(existing.categories ?? []), ...input.categories]),
              );
              update.categories = { set: merged };
            }
            if (input.email && !existing.email) {
              update.emailNormalized = emailNorm;
            }
            if (input.phone && !existing.phone) {
              update.phoneNormalized = phoneNorm;
            }
            await tx.lead.update({ where: { id: dup.leadId }, data: update });
          }
          await tx.leadMergeHistory.create({
            data: {
              organizationId: orgId,
              canonicalLeadId: dup.leadId,
              reason: dup.reason,
              confidence: dup.confidence,
              fromProvider: provider,
              fromExternalId: externalPlaceId,
              payload: input as unknown as object,
              status: "auto_merged",
            },
          });
          return {
            ok: true,
            leadId: dup.leadId,
            created: false,
            mergedReason: dup.reason,
          };
        }
      }

      const created = await tx.lead.create({
        data: buildCreateData({
          orgId,
          provider,
          externalPlaceId,
          input,
          phoneNorm,
          emailNorm,
          nameNorm,
          addrNorm,
        }),
        select: { id: true },
      });
      return { ok: true, leadId: created.id, created: true };
    });
  },

  /** Update lead-level fields not covered by patchContact. */
  async patchLead(orgId: string, id: string, patch: PatchLeadInput) {
    const data: Record<string, unknown> = {};
    if (patch.industry !== undefined) data.industry = patch.industry ?? null;
    if (patch.assignedUserId !== undefined)
      data.assignedUserId = patch.assignedUserId ?? null;
    if (patch.crmStage !== undefined) data.crmStage = patch.crmStage ?? null;
    if (Object.keys(data).length === 0) return null;
    return withOrg(orgId, (tx) => tx.lead.update({ where: { id }, data }));
  },

  /**
   * Import a CSV blob of leads. Returns counts of created / merged / failed.
   * Uses the same dedup-aware `create()` flow per row, so duplicates fold
   * into existing leads and don't double-count against quota.
   */
  async importCsv(
    orgId: string,
    csv: string,
    opts: { provider?: string } = {},
  ): Promise<{
    ok: true;
    created: number;
    merged: number;
    failed: number;
    errors: Array<{ row: number; error: string }>;
  }> {
    const provider = opts.provider || "csv_import";
    const rows = parseCsv(csv);
    if (rows.length === 0) {
      return { ok: true, created: 0, merged: 0, failed: 0, errors: [] };
    }
    const header = rows[0]!.map((h) => h.trim().toLowerCase());
    const nameIdx = header.findIndex(
      (h) => h === "name" || h === "business_name" || h === "businessname",
    );
    if (nameIdx === -1) {
      return {
        ok: true,
        created: 0,
        merged: 0,
        failed: rows.length - 1,
        errors: [{ row: 0, error: "missing 'name' column" }],
      };
    }
    const colIdx = (...keys: string[]) => {
      for (const k of keys) {
        const i = header.indexOf(k);
        if (i !== -1) return i;
      }
      return -1;
    };
    const idx = {
      name: nameIdx,
      phone: colIdx("phone", "phone_number", "phonenumber"),
      email: colIdx("email"),
      website: colIdx("website", "website_url", "url"),
      address: colIdx("address", "full_address"),
      city: colIdx("city"),
      state: colIdx("state", "region"),
      country: colIdx("country"),
      postalCode: colIdx("postalcode", "postal_code", "zip", "zipcode"),
      category: colIdx("category", "categoryprimary"),
      industry: colIdx("industry"),
      ownerName: colIdx("ownername", "owner_name", "contact", "contact_name"),
      facebook: colIdx("facebook", "facebookurl", "facebook_url"),
      instagram: colIdx("instagram", "instagramurl", "instagram_url"),
      rating: colIdx("rating", "google_rating"),
      reviewCount: colIdx("reviewcount", "review_count", "reviews"),
      lat: colIdx("lat", "latitude"),
      lng: colIdx("lng", "lon", "long", "longitude"),
    };

    let created = 0;
    let merged = 0;
    let failed = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!;
      const get = (j: number) =>
        j === -1 ? undefined : (row[j] ?? "").trim() || undefined;
      const name = get(idx.name);
      if (!name) {
        failed++;
        errors.push({ row: i + 1, error: "empty name" });
        continue;
      }
      const ratingRaw = get(idx.rating);
      const reviewRaw = get(idx.reviewCount);
      const latRaw = get(idx.lat);
      const lngRaw = get(idx.lng);
      try {
        const result = await this.create(
          orgId,
          {
            name,
            provider,
            phone: get(idx.phone),
            email: get(idx.email),
            website: get(idx.website),
            address: get(idx.address),
            city: get(idx.city),
            state: get(idx.state),
            country: get(idx.country),
            postalCode: get(idx.postalCode),
            categoryPrimary: get(idx.category),
            industry: get(idx.industry),
            ownerName: get(idx.ownerName),
            facebookUrl: get(idx.facebook),
            instagramUrl: get(idx.instagram),
            rating: ratingRaw ? Number(ratingRaw) : undefined,
            reviewCount: reviewRaw ? Math.trunc(Number(reviewRaw)) : undefined,
            lat: latRaw ? Number(latRaw) : undefined,
            lng: lngRaw ? Number(lngRaw) : undefined,
          },
          { mode: "merge" },
        );
        if (result.created) created++;
        else merged++;
      } catch (err) {
        failed++;
        errors.push({
          row: i + 1,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { ok: true, created, merged, failed, errors };
  },

  /**
   * Bulk import a parsed array of rows. Used by XLSX upload — the route
   * parses the workbook into [header, ...rows] and calls this. Internally
   * just stringifies to CSV and reuses `importCsv` so the dedup path is
   * exactly the same (Section 7.2: identical merge semantics across
   * formats).
   */
  async importRows(
    orgId: string,
    rows: string[][],
    opts: { provider?: string } = {},
  ) {
    const csv = rows
      .map((r) => r.map((c) => csvEscape(c)).join(","))
      .join("\n");
    return this.importCsv(orgId, csv, opts);
  },

  /** List low-confidence dedupe hits awaiting human review (Section 7.4). */
  async listPendingMerges(orgId: string, take = 50) {
    return withOrg(orgId, (tx) =>
      tx.leadMergeHistory.findMany({
        where: { organizationId: orgId, status: "pending_review" },
        orderBy: { createdAt: "desc" },
        take,
        include: {
          canonical: {
            select: {
              id: true,
              name: true,
              city: true,
              phone: true,
              website: true,
            },
          },
          pending: {
            select: {
              id: true,
              name: true,
              city: true,
              phone: true,
              website: true,
            },
          },
        },
      }),
    );
  },

  /**
   * Approve a pending merge: fold the pending lead into the canonical lead
   * (filling missing fields, transferring sources/enrichments) and delete
   * the pending lead. Marks the history row 'confirmed'.
   */
  async approveMerge(orgId: string, mergeId: string, reviewerId: string) {
    return withOrg(orgId, async (tx) => {
      const row = await tx.leadMergeHistory.findFirst({
        where: { id: mergeId, organizationId: orgId, status: "pending_review" },
      });
      if (!row || !row.pendingLeadId) {
        return { ok: false as const, error: "NOT_FOUND" as const };
      }
      const pending = await tx.lead.findFirst({
        where: { id: row.pendingLeadId, organizationId: orgId },
      });
      const canonical = await tx.lead.findFirst({
        where: { id: row.canonicalLeadId, organizationId: orgId },
        select: {
          phone: true,
          email: true,
          website: true,
          ownerName: true,
          address: true,
          city: true,
          state: true,
          country: true,
          postalCode: true,
          lat: true,
          lng: true,
          rating: true,
          reviewCount: true,
          industry: true,
          categoryPrimary: true,
          categories: true,
          facebookUrl: true,
          instagramUrl: true,
          googleProfileUrl: true,
        },
      });
      if (!pending || !canonical) {
        return { ok: false as const, error: "NOT_FOUND" as const };
      }
      const update: Record<string, unknown> = { lastSeenAt: new Date() };
      const fill = <K extends keyof typeof canonical>(k: K, v: unknown) => {
        if (v === undefined || v === null || v === "") return;
        const cur = canonical[k];
        if (cur === null || cur === undefined || cur === "") {
          update[k as string] = v;
        }
      };
      fill("phone", pending.phone);
      fill("email", pending.email);
      fill("website", pending.website);
      fill("ownerName", pending.ownerName);
      fill("address", pending.address);
      fill("city", pending.city);
      fill("state", pending.state);
      fill("country", pending.country);
      fill("postalCode", pending.postalCode);
      fill("lat", pending.lat);
      fill("lng", pending.lng);
      fill("rating", pending.rating);
      fill("reviewCount", pending.reviewCount);
      fill("industry", pending.industry);
      fill("categoryPrimary", pending.categoryPrimary);
      fill("facebookUrl", pending.facebookUrl);
      fill("instagramUrl", pending.instagramUrl);
      fill("googleProfileUrl", pending.googleProfileUrl);
      if (pending.categories?.length) {
        update.categories = {
          set: Array.from(
            new Set([...(canonical.categories ?? []), ...pending.categories]),
          ),
        };
      }
      await tx.lead.update({
        where: { id: row.canonicalLeadId },
        data: update,
      });

      // Re-parent dependent rows to the canonical lead.
      await tx.leadSource.updateMany({
        where: { leadId: row.pendingLeadId },
        data: { leadId: row.canonicalLeadId },
      });
      await tx.enrichment.updateMany({
        where: { leadId: row.pendingLeadId },
        data: { leadId: row.canonicalLeadId },
      });

      await tx.lead.delete({ where: { id: row.pendingLeadId } });

      await tx.leadMergeHistory.update({
        where: { id: row.id },
        data: {
          status: "confirmed",
          pendingLeadId: null,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
        },
      });
      return { ok: true as const, canonicalLeadId: row.canonicalLeadId };
    });
  },

  /** Reject a pending merge: keep both leads as separate records. */
  async rejectMerge(orgId: string, mergeId: string, reviewerId: string) {
    return withOrg(orgId, async (tx) => {
      const row = await tx.leadMergeHistory.findFirst({
        where: { id: mergeId, organizationId: orgId, status: "pending_review" },
      });
      if (!row) return { ok: false as const, error: "NOT_FOUND" as const };
      await tx.leadMergeHistory.update({
        where: { id: row.id },
        data: {
          status: "rejected",
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
        },
      });
      return { ok: true as const };
    });
  },
};

/** Build the Prisma create payload for a new Lead from a CreateLeadInput. */
function buildCreateData(args: {
  orgId: string;
  provider: string;
  externalPlaceId: string;
  input: CreateLeadInput;
  phoneNorm: string | null;
  emailNorm: string | null;
  nameNorm: string;
  addrNorm: string | null;
}) {
  const {
    orgId,
    provider,
    externalPlaceId,
    input,
    phoneNorm,
    emailNorm,
    nameNorm,
    addrNorm,
  } = args;
  return {
    organizationId: orgId,
    provider,
    externalPlaceId,
    name: input.name,
    nameNormalized: nameNorm,
    categoryPrimary: input.categoryPrimary ?? null,
    categories: input.categories ?? [],
    industry: input.industry ?? null,
    phone: input.phone ?? null,
    phoneNormalized: phoneNorm,
    email: input.email ?? null,
    emailNormalized: emailNorm,
    ownerName: input.ownerName ?? null,
    website: input.website ?? null,
    facebookUrl: input.facebookUrl ?? null,
    instagramUrl: input.instagramUrl ?? null,
    googleProfileUrl: input.googleProfileUrl ?? null,
    sourceUrl: input.sourceUrl ?? null,
    address: input.address ?? null,
    addressNormalized: addrNorm,
    city: input.city ?? null,
    state: input.state ?? null,
    country: input.country ?? null,
    postalCode: input.postalCode ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    rating: input.rating ?? null,
    reviewCount: input.reviewCount ?? null,
    openingHours: (input.openingHours ?? undefined) as object | undefined,
    notes: input.notes ?? null,
    tags: input.tags ?? [],
    assignedUserId: input.assignedUserId ?? null,
    crmStage: input.crmStage ?? null,
    rawPayload: { source: "web_create", input } as unknown as object,
    normalizedPayload: { source: "web_create" } as unknown as object,
  };
}

function csvEscape(value: string): string {
  const v = value ?? "";
  if (/[",\r\n]/.test(v)) return `"${v.replaceAll('"', '""')}"`;
  return v;
}

/**
 * Minimal CSV parser supporting quoted fields, embedded newlines, and
 * doubled-quote escapes. Returns rows of string columns.
 */
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else if (c === "\r") {
        // skip
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v && v.length > 0));
}

function orderByFromSort(sort: LeadFilter["sort"]) {
  switch (sort) {
    case "score":
      return { score: "asc" as const };
    case "-score":
      return { score: "desc" as const };
    case "updatedAt":
      return { updatedAt: "asc" as const };
    case "-updatedAt":
      return { updatedAt: "desc" as const };
    case "name":
      return { name: "asc" as const };
    case "-name":
      return { name: "desc" as const };
  }
}
