import { z } from 'zod';
import {
  BusinessStatus,
  EnrichmentKind,
  ExportFormat,
  LeadFocus,
  LeadStatus,
  PriorityTier,
  WebsiteStatus,
} from './enums';

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
  provider: z.enum(['google_places', 'foursquare', 'yelp_fusion', 'osm']),
  /** Lead-focus filter applied during ingest. Default keeps every lead. */
  leadFocus: z.nativeEnum(LeadFocus).default(LeadFocus.ALL),
  enrichOnInsert: z.boolean().default(true),
  scoreOnInsert: z.boolean().default(true),
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
  priorityTier: z
    .union([z.nativeEnum(PriorityTier), z.array(z.nativeEnum(PriorityTier))])
    .optional(),
  status: z
    .union([z.nativeEnum(LeadStatus), z.array(z.nativeEnum(LeadStatus))])
    .optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  search: z.string().optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  sort: z
    .enum(['-score', 'score', '-updatedAt', 'updatedAt', 'name', '-name'])
    .default('-score'),
});
export type LeadFilter = z.infer<typeof LeadFilterSchema>;

/** Export job create DTO. */
export const CreateExportSchema = z.object({
  format: z.nativeEnum(ExportFormat),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('list'), listId: z.string().uuid() }),
    z.object({ kind: z.literal('project'), projectId: z.string().uuid() }),
    z.object({ kind: z.literal('search'), searchId: z.string().uuid() }),
    z.object({ kind: z.literal('filter'), filter: LeadFilterSchema }),
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
