// Shared enums mirroring the Prisma schema in packages/db.
// Keep in sync with packages/db/prisma/schema.prisma.

export const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Plan = {
  FREE: 'FREE',
  STARTER: 'STARTER',
  GROWTH: 'GROWTH',
  SCALE: 'SCALE',
} as const;
export type Plan = (typeof Plan)[keyof typeof Plan];

export const LeadStatus = {
  NEW: 'NEW',
  ENRICHED: 'ENRICHED',
  REVIEWED: 'REVIEWED',
  EXPORTED: 'EXPORTED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const WebsiteStatus = {
  EXISTS: 'EXISTS',
  EXISTS_MISSING_IN_SOURCE: 'EXISTS_MISSING_IN_SOURCE',
  LIKELY_NONE: 'LIKELY_NONE',
  HIGH_CONFIDENCE_NONE: 'HIGH_CONFIDENCE_NONE',
  UNKNOWN: 'UNKNOWN',
} as const;
export type WebsiteStatus = (typeof WebsiteStatus)[keyof typeof WebsiteStatus];

export const PriorityTier = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;
export type PriorityTier = (typeof PriorityTier)[keyof typeof PriorityTier];

export const EnrichmentKind = {
  WEBSITE_VALIDATION: 'WEBSITE_VALIDATION',
  EMAIL: 'EMAIL',
  EMAIL_VERIFY: 'EMAIL_VERIFY',
  SOCIAL: 'SOCIAL',
  COMPANY: 'COMPANY',
  CONTACT: 'CONTACT',
} as const;
export type EnrichmentKind = (typeof EnrichmentKind)[keyof typeof EnrichmentKind];

export const EnrichmentStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;
export type EnrichmentStatus = (typeof EnrichmentStatus)[keyof typeof EnrichmentStatus];

export const JobStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const ExportStatus = {
  QUEUED: 'QUEUED',
  BUILDING: 'BUILDING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
export type ExportStatus = (typeof ExportStatus)[keyof typeof ExportStatus];

export const ExportFormat = {
  CSV: 'CSV',
  XLSX: 'XLSX',
  GOOGLE_SHEETS: 'GOOGLE_SHEETS',
} as const;
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

export const BusinessStatus = {
  OPERATIONAL: 'OPERATIONAL',
  CLOSED_TEMP: 'CLOSED_TEMP',
  CLOSED_PERM: 'CLOSED_PERM',
  UNKNOWN: 'UNKNOWN',
} as const;
export type BusinessStatus = (typeof BusinessStatus)[keyof typeof BusinessStatus];
