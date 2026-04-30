import { z } from "zod";
import {
  BusinessStatus,
  EnrichmentKind,
  ExportFormat,
  LeadFocus,
  LeadStatus,
  PriorityTier,
  WebsiteStatus,
} from "./enums";

/** Normalized lead shape produced by a search provider adapter. */
export const NormalizedLeadSchema = z.object({
  provider: z.string(),
  externalPlaceId: z.string().min(1),
  name: z.string().min(1),
  categoryPrimary: z.string().optional(),
  categories: z.array(z.string()).default([]),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  businessStatus: z.nativeEnum(BusinessStatus).default(BusinessStatus.UNKNOWN),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  raw: z.unknown(),
});
export type NormalizedLead = z.infer<typeof NormalizedLeadSchema>;

/** Public lead shape returned from API list endpoints. */
export const LeadListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  categoryPrimary: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  websiteStatus: z.nativeEnum(WebsiteStatus),
  rating: z.number().nullable(),
  reviewCount: z.number().nullable(),
  score: z.number().nullable(),
  priorityTier: z.nativeEnum(PriorityTier).nullable(),
  source: z.string(),
  updatedAt: z.string(),
});
export type LeadListItem = z.infer<typeof LeadListItemSchema>;

/** Search create request DTO. */
export const ScheduleFrequencyEnum = z.enum([
  "NONE",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
]);
export type ScheduleFrequency = z.infer<typeof ScheduleFrequencyEnum>;

export const CreateSearchSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(120),
  niche: z.string().optional(),
  keyword: z.string().optional(),
  country: z.string().length(2).optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  radiusMeters: z.number().int().positive().max(50_000).optional(),
  resultLimit: z.number().int().positive().max(500).default(100),
  provider: z.enum(["google_places", "foursquare", "yelp_fusion", "osm"]),
  /** Lead-focus filter applied during ingest. Default keeps every lead. */
  leadFocus: z.nativeEnum(LeadFocus).default(LeadFocus.ALL),
  enrichOnInsert: z.boolean().default(true),
  scoreOnInsert: z.boolean().default(true),
  /** Recurring schedule. NONE = one-shot. */
  scheduleFrequency: ScheduleFrequencyEnum.default("NONE"),
});
export type CreateSearchInput = z.infer<typeof CreateSearchSchema>;

/** Lead list query params. */
export const LeadFilterSchema = z.object({
  projectId: z.string().uuid().optional(),
  listId: z.string().uuid().optional(),
  searchId: z.string().uuid().optional(),
  websiteStatus: z
    .union([z.nativeEnum(WebsiteStatus), z.array(z.nativeEnum(WebsiteStatus))])
    .optional(),
  websiteHealth: z
    .enum(["FRESH", "NEEDS_REVIEW", "OUTDATED", "UNREACHABLE", "NOT_AUDITED"])
    .optional(),
  outreachSuitable: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "string" ? v === "true" : v))
    .optional(),
  /**
   * Filter to leads whose only "website" is a social profile / link-in-bio
   * (Facebook, Instagram, Linktree, business.site, wa.me, etc.). These are
   * effectively no-website leads and convert well for new-website pitches.
   */
  socialOnly: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "string" ? v === "true" : v))
    .optional(),
  /**
   * Filter to leads whose audited website is missing a contact form,
   * booking form, or both. `any` matches missing-either.
   */
  missingForm: z.enum(["contact", "booking", "any"]).optional(),
  priorityTier: z
    .union([z.nativeEnum(PriorityTier), z.array(z.nativeEnum(PriorityTier))])
    .optional(),
  status: z
    .union([z.nativeEnum(LeadStatus), z.array(z.nativeEnum(LeadStatus))])
    .optional(),
  businessScale: z
    .union([
      z.enum(["MICRO", "SMALL", "MEDIUM", "LARGE", "ENTERPRISE", "UNKNOWN"]),
      z.array(
        z.enum(["MICRO", "SMALL", "MEDIUM", "LARGE", "ENTERPRISE", "UNKNOWN"]),
      ),
    ])
    .optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  /** Filter by data source / provider (single or array). */
  provider: z.union([z.string(), z.array(z.string())]).optional(),
  /** Free-text industry filter (case-insensitive contains). */
  industry: z.string().optional(),
  /** Free-text category filter (matches categoryPrimary OR categories[]). */
  category: z.string().optional(),
  /** Convenience boolean: true → has phone, false → missing phone. */
  hasPhone: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "string" ? v === "true" : v))
    .optional(),
  hasEmail: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "string" ? v === "true" : v))
    .optional(),
  hasSocial: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "string" ? v === "true" : v))
    .optional(),
  /** Shortcut: leads whose website needs work (OUTDATED or NEEDS_REVIEW or UNREACHABLE). */
  websiteOutdated: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "string" ? v === "true" : v))
    .optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  minReviewCount: z.coerce.number().int().min(0).optional(),
  assignedUserId: z.string().uuid().optional(),
  crmStage: z.string().optional(),
  /** Newly-discovered window: 24h | 7d | 30d | 90d. */
  discoveredWithin: z.enum(["24h", "7d", "30d", "90d"]).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  search: z.string().optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  sort: z
    .enum(["-score", "score", "-updatedAt", "updatedAt", "name", "-name"])
    .default("-score"),
});
export type LeadFilter = z.infer<typeof LeadFilterSchema>;

/** Export job create DTO. */
export const CreateExportSchema = z.object({
  format: z.nativeEnum(ExportFormat),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("list"), listId: z.string().uuid() }),
    z.object({ kind: z.literal("project"), projectId: z.string().uuid() }),
    z.object({ kind: z.literal("search"), searchId: z.string().uuid() }),
    z.object({ kind: z.literal("filter"), filter: LeadFilterSchema }),
  ]),
  options: z
    .object({
      googleSheetId: z.string().optional(),
      includeRawPayload: z.boolean().default(false),
    })
    .default({}),
});
export type CreateExportInput = z.infer<typeof CreateExportSchema>;

/** Bulk enrichment request. */
export const BulkEnrichSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(1000),
  kinds: z.array(z.nativeEnum(EnrichmentKind)).min(1),
});
export type BulkEnrichInput = z.infer<typeof BulkEnrichSchema>;

/**
 * Manual / CSV / API lead creation. Caller-supplied provider defaults to
 * 'manual' for one-off entry, 'csv_import' for CSV upload, etc.
 */
export const CreateLeadSchema = z.object({
  name: z.string().min(1).max(300),
  provider: z.string().min(1).max(64).default("manual"),
  externalPlaceId: z.string().min(1).max(200).optional(),
  categoryPrimary: z.string().max(120).optional(),
  categories: z.array(z.string().max(120)).max(20).optional(),
  industry: z.string().max(120).optional(),
  phone: z.string().max(60).optional(),
  email: z.string().email().max(200).optional(),
  ownerName: z.string().max(200).optional(),
  website: z.string().url().max(500).optional(),
  facebookUrl: z.string().url().max(500).optional(),
  instagramUrl: z.string().url().max(500).optional(),
  googleProfileUrl: z.string().url().max(500).optional(),
  sourceUrl: z.string().url().max(500).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  postalCode: z.string().max(40).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().min(0).optional(),
  openingHours: z.unknown().optional(),
  notes: z.string().max(4000).optional(),
  tags: z.array(z.string().max(40)).max(40).optional(),
  assignedUserId: z.string().uuid().optional(),
  crmStage: z.string().max(60).optional(),
});
export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;

/** PATCH for fields beyond the existing contact patch (assignment, stage, etc). */
export const PatchLeadSchema = z.object({
  industry: z.string().max(120).nullish(),
  assignedUserId: z.string().uuid().nullish(),
  crmStage: z.string().max(60).nullish(),
});
export type PatchLeadInput = z.infer<typeof PatchLeadSchema>;
