-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'STARTER', 'GROWTH', 'SCALE');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'VERIFIED', 'CONTACTED', 'INTERESTED', 'FOLLOW_UP', 'NOT_INTERESTED', 'CONVERTED', 'CLOSED', 'ENRICHED', 'REVIEWED', 'EXPORTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WebsiteStatus" AS ENUM ('EXISTS', 'EXISTS_MISSING_IN_SOURCE', 'LIKELY_NONE', 'HIGH_CONFIDENCE_NONE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PriorityTier" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "EnrichmentKind" AS ENUM ('WEBSITE_VALIDATION', 'EMAIL', 'EMAIL_VERIFY', 'SOCIAL', 'COMPANY', 'CONTACT');

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'BUILDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'XLSX', 'GOOGLE_SHEETS');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('OPERATIONAL', 'CLOSED_TEMP', 'CLOSED_PERM', 'UNKNOWN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "clerkOrgId" TEXT,
    "name" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "notificationWebhookUrl" TEXT,
    "notificationEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "plan" "Plan" NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Search" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "niche" TEXT,
    "keyword" TEXT,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "radiusMeters" INTEGER,
    "resultLimit" INTEGER NOT NULL DEFAULT 100,
    "provider" TEXT NOT NULL,
    "leadFocus" TEXT NOT NULL DEFAULT 'ALL',
    "scheduleFrequency" TEXT NOT NULL DEFAULT 'NONE',
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Search_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL,
    "totalFetched" INTEGER NOT NULL DEFAULT 0,
    "totalInserted" INTEGER NOT NULL DEFAULT 0,
    "totalDuplicate" INTEGER NOT NULL DEFAULT 0,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalPlaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "categoryPrimary" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "email" TEXT,
    "emailNormalized" TEXT,
    "ownerName" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "googleProfileUrl" TEXT,
    "servicePitch" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "website" TEXT,
    "websiteStatus" "WebsiteStatus" NOT NULL DEFAULT 'UNKNOWN',
    "websiteHealth" TEXT NOT NULL DEFAULT 'NOT_AUDITED',
    "websiteHealthScore" INTEGER,
    "websiteAudit" JSONB,
    "websiteAuditedAt" TIMESTAMP(3),
    "sourceUrl" TEXT,
    "address" TEXT,
    "addressNormalized" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "businessStatus" "BusinessStatus" NOT NULL DEFAULT 'UNKNOWN',
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "score" INTEGER,
    "priorityTier" "PriorityTier",
    "scoreBreakdown" JSONB,
    "businessScale" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "businessScaleConfidence" INTEGER,
    "businessScaleSignals" JSONB,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEnrichedAt" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL,
    "normalizedPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadScore" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "priorityTier" "PriorityTier" NOT NULL,
    "breakdown" JSONB NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrichment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" "EnrichmentKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "EnrichmentStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "rawResult" JSONB,
    "normalized" JSONB,
    "error" TEXT,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrichment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadList" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadListItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "listId" TEXT,
    "projectId" TEXT,
    "searchId" TEXT,
    "filterJson" JSONB,
    "storagePath" TEXT,
    "googleSheetId" TEXT,
    "rowCount" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "queue" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "apiKeyEncrypted" TEXT,
    "dailyBudget" INTEGER,
    "metadata" JSONB,
    "termsAcceptedAt" TIMESTAMP(3),
    "termsAcceptedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "senderName" TEXT,
    "senderCompany" TEXT,
    "senderEmail" TEXT,
    "replyToEmail" TEXT,
    "mailingAddress" TEXT,
    "unsubscribeUrl" TEXT,
    "citeProviderInBody" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachSuppression" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'UNSUBSCRIBE',
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchEdit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "editedById" TEXT,
    "diff" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEdit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "editedById" TEXT,
    "diff" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteIntelReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "primaryUrl" TEXT NOT NULL,
    "category" TEXT,
    "city" TEXT,
    "country" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorMessage" TEXT,
    "summaryJson" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteIntelReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteIntelCompetitor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "name" TEXT,
    "url" TEXT NOT NULL,
    "auditJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteIntelCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_clerkOrgId_key" ON "Organization"("clerkOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "UsageLog_organizationId_kind_createdAt_idx" ON "UsageLog"("organizationId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

-- CreateIndex
CREATE INDEX "Search_organizationId_projectId_idx" ON "Search"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "Search_scheduleFrequency_nextRunAt_idx" ON "Search"("scheduleFrequency", "nextRunAt");

-- CreateIndex
CREATE INDEX "SearchRun_organizationId_searchId_idx" ON "SearchRun"("organizationId", "searchId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_nameNormalized_idx" ON "Lead"("organizationId", "nameNormalized");

-- CreateIndex
CREATE INDEX "Lead_organizationId_phoneNormalized_idx" ON "Lead"("organizationId", "phoneNormalized");

-- CreateIndex
CREATE INDEX "Lead_organizationId_websiteStatus_idx" ON "Lead"("organizationId", "websiteStatus");

-- CreateIndex
CREATE INDEX "Lead_organizationId_priorityTier_score_idx" ON "Lead"("organizationId", "priorityTier", "score");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_organizationId_provider_externalPlaceId_key" ON "Lead"("organizationId", "provider", "externalPlaceId");

-- CreateIndex
CREATE INDEX "LeadSource_leadId_idx" ON "LeadSource"("leadId");

-- CreateIndex
CREATE INDEX "LeadScore_leadId_createdAt_idx" ON "LeadScore"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "Enrichment_organizationId_leadId_kind_idx" ON "Enrichment"("organizationId", "leadId", "kind");

-- CreateIndex
CREATE INDEX "LeadList_organizationId_idx" ON "LeadList"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadListItem_listId_leadId_key" ON "LeadListItem"("listId", "leadId");

-- CreateIndex
CREATE INDEX "ExportJob_organizationId_status_idx" ON "ExportJob"("organizationId", "status");

-- CreateIndex
CREATE INDEX "BackgroundJob_queue_status_idx" ON "BackgroundJob"("queue", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConfig_organizationId_provider_key" ON "ProviderConfig"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachSettings_organizationId_key" ON "OutreachSettings"("organizationId");

-- CreateIndex
CREATE INDEX "OutreachSuppression_organizationId_createdAt_idx" ON "OutreachSuppression"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachSuppression_organizationId_emailHash_key" ON "OutreachSuppression"("organizationId", "emailHash");

-- CreateIndex
CREATE INDEX "Notification_organizationId_readAt_createdAt_idx" ON "Notification"("organizationId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_kind_createdAt_idx" ON "Notification"("organizationId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "SearchEdit_organizationId_searchId_createdAt_idx" ON "SearchEdit"("organizationId", "searchId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectEdit_organizationId_projectId_createdAt_idx" ON "ProjectEdit"("organizationId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "WebsiteIntelReport_organizationId_createdAt_idx" ON "WebsiteIntelReport"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "WebsiteIntelReport_organizationId_leadId_idx" ON "WebsiteIntelReport"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "WebsiteIntelCompetitor_organizationId_reportId_idx" ON "WebsiteIntelCompetitor"("organizationId", "reportId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Search" ADD CONSTRAINT "Search_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRun" ADD CONSTRAINT "SearchRun_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "Search"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScore" ADD CONSTRAINT "LeadScore_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrichment" ADD CONSTRAINT "Enrichment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadList" ADD CONSTRAINT "LeadList_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadListItem" ADD CONSTRAINT "LeadListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "LeadList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadListItem" ADD CONSTRAINT "LeadListItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderConfig" ADD CONSTRAINT "ProviderConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSettings" ADD CONSTRAINT "OutreachSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSuppression" ADD CONSTRAINT "OutreachSuppression_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteIntelCompetitor" ADD CONSTRAINT "WebsiteIntelCompetitor_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WebsiteIntelReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

