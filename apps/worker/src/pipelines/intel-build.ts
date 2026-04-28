/**
 * Website Intelligence & Competitor Analysis pipeline.
 *
 * Builds a comprehensive multi-site report by reusing the existing
 * `auditWebsite()` heuristic auditor:
 *   1. Audits the primary business URL.
 *   2. (Optional) Auto-detects competitors via Google Places searchNearby.
 *   3. Audits each manual + auto-detected competitor (capped at N).
 *   4. Computes side-by-side scores, gap analysis, recommendations.
 *   5. Persists the full payload into WebsiteIntelReport.summaryJson.
 *
 * Compliance notes (mirrors user spec):
 *   - We only fetch publicly available HTML and public Google Places listings.
 *   - We DO NOT call private analytics, scrape behind-auth content, or use
 *     unauthorised data sources.
 *   - Estimated/inferred values (e.g. opportunityScore) are clearly labelled
 *     in the UI; real visitor counts require a future GA OAuth integration.
 */

import { withOrg } from '@crawlix/db';
import type { IntelBuildJob } from '@crawlix/shared';
import { logger } from '../lib/logger';
import { auditWebsite, type WebsiteAuditResult } from './enrich-website';
import { resolveSearchProvider } from '../providers';
import {
  hunterProvider,
  apolloProvider,
  screenshotOneProvider,
  verifyEmail
} from '@crawlix/providers';

const MAX_COMPETITORS_HARD = 8;
const COMPETITOR_AUDIT_TIMEOUT_MS = 25_000;

interface CompetitorRow {
  id: string;
  url: string;
  name: string | null;
  source: string;
  status: string;
  errorMessage: string | null;
  audit: WebsiteAuditResult | null;
}

interface SiteScores {
  health: number;
  design: number;
  mobile: number;
  performance: number;
  seo: number;
  contact: number;
  security: number;
  business: number;
  conversion: number;
  /** Composite 0-100 used to rank sites. */
  overall: number;
}

interface SiteSummary {
  id: string;
  name: string;
  url: string;
  finalUrl: string | null;
  reachable: boolean;
  health: WebsiteAuditResult['health'] | 'unknown';
  scores: SiteScores;
  signals: WebsiteAuditResult['signals'] | null;
  strengths: string[];
  weaknesses: string[];
  /** Optional rendered screenshot (paid screenshot API). */
  screenshotUrl: string | null;
  /** Optional contact data (Hunter / Apollo). */
  contacts: {
    primaryEmail: string | null;
    decisionMakerName: string | null;
    source: 'hunter' | 'apollo' | null;
    /** Email verification status if a verifier is configured. */
    emailStatus?: 'valid' | 'invalid' | 'risky' | 'unknown' | null;
  };
  /** Optional PageSpeed snapshot (mobile). */
  pageSpeed: {
    performance: number | null;
    lcpSeconds: number | null;
    cls: number | null;
    inpMs: number | null;
  } | null;
  /** Display-only — clearly labelled as estimated in the UI. */
  estimated: {
    /** Rough monthly traffic estimate. Always null until SimilarWeb-class API is wired. */
    monthlyVisits: number | null;
    /** "Connect Google Analytics for actual visitor data." */
    actualVisitsAvailable: false;
  };
}

interface IntelSummaryPayload {
  generatedAt: string;
  primary: SiteSummary;
  competitors: SiteSummary[];
  /** Field-level winners across the cohort. */
  comparison: Record<string, { leader: string; runnerUp: string | null; values: Record<string, number | string | boolean | null> }>;
  /** Things competitors do that the primary site does not. */
  gaps: string[];
  /** Actionable recommendations grouped into Quick Wins / Strategic. */
  recommendations: { kind: 'quick_win' | 'strategic'; title: string; detail: string }[];
  /** Human-readable disclaimer rendered alongside any inferred metric. */
  disclaimers: string[];
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function categoryScore(status: 'pass' | 'warn' | 'fail' | 'skipped'): number {
  if (status === 'pass') return 100;
  if (status === 'warn') return 60;
  // 'skipped' means we couldn't measure — treat as neutral/unknown (~50)
  // rather than a low score, so the report doesn't penalise sites our
  // crawler simply couldn't reach.
  if (status === 'skipped') return 50;
  return 20;
}

function conversionScoreFromSignals(s: WebsiteAuditResult['signals']): number {
  // 11 binary-ish signals; each contributes ~9 points. CTA count contributes
  // a small bonus when at least one CTA is present.
  let score = 0;
  if (s.hasContactForm) score += 10;
  if (s.hasBookingForm) score += 12;
  if (s.hasLeadCaptureForm) score += 10;
  if (s.clickToCall) score += 10;
  if (s.whatsappLink) score += 8;
  if (s.hasTestimonials) score += 10;
  if (s.hasGallery) score += 8;
  if (s.hasPricing) score += 8;
  if (s.hasServicePages) score += 8;
  if (s.hasTrustBadges) score += 8;
  if (s.facebookUrl || s.instagramUrl) score += 4;
  if (s.ctaCount >= 3) score += 4;
  return Math.max(0, Math.min(100, score));
}

function computeScores(audit: WebsiteAuditResult | null): SiteScores {
  if (!audit || !audit.reachable) {
    return {
      health: 0, design: 0, mobile: 0, performance: 0, seo: 0,
      contact: 0, security: 0, business: 0, conversion: 0, overall: 0
    };
  }
  const c = audit.categories;
  const conversion = conversionScoreFromSignals(audit.signals);
  const design = categoryScore(c.design.status);
  const mobile = categoryScore(c.mobile.status);
  const performance = categoryScore(c.performance.status);
  const seo = categoryScore(c.seo.status);
  const contact = categoryScore(c.contact.status);
  const security = categoryScore(c.security.status);
  const business = categoryScore(c.business.status);
  // Weighted composite. Conversion is heavily weighted because the report's
  // pitch is "more leads from your site".
  const overall = Math.round(
    audit.healthScore * 0.35 +
    conversion * 0.30 +
    seo * 0.10 +
    mobile * 0.10 +
    performance * 0.08 +
    security * 0.07
  );
  return {
    health: audit.healthScore,
    design, mobile, performance, seo, contact, security, business,
    conversion,
    overall: Math.max(0, Math.min(100, overall))
  };
}

function deriveStrengths(audit: WebsiteAuditResult | null): string[] {
  if (!audit || !audit.reachable) return [];
  const s = audit.signals;
  const out: string[] = [];
  if (s.https) out.push('Served over HTTPS');
  if (s.hasMobileViewport) out.push('Mobile-responsive layout');
  if (s.hasSeoBasics) out.push('SEO basics in place (title, meta, H1)');
  if (s.hasOgTags) out.push('Open Graph tags for social sharing');
  if (s.hasContactForm) out.push('Contact form on site');
  if (s.hasBookingForm) out.push('Online booking integration');
  if (s.hasLeadCaptureForm) out.push('Email lead-capture form');
  if (s.clickToCall) out.push('Click-to-call enabled');
  if (s.whatsappLink) out.push('WhatsApp click-to-chat');
  if (s.hasTestimonials) out.push('Customer testimonials shown');
  if (s.hasGallery) out.push('Photo gallery / portfolio');
  if (s.hasPricing) out.push('Pricing or packages displayed');
  if (s.hasServicePages) out.push('Dedicated service pages');
  if (s.hasTrustBadges) out.push('Trust badges / certifications');
  if (s.facebookUrl) out.push('Facebook presence linked');
  if (s.instagramUrl) out.push('Instagram presence linked');
  if (s.fetchMs > 0 && s.fetchMs < 1500) out.push('Fast first-byte response');
  return out;
}

function deriveWeaknesses(audit: WebsiteAuditResult | null): string[] {
  if (!audit) return ['Site not yet analysed'];
  if (!audit.reachable) return audit.issues.length ? audit.issues : ['Site is unreachable'];
  const s = audit.signals;
  const out: string[] = [];
  if (!s.https) out.push('No HTTPS');
  if (!s.hasMobileViewport) out.push('Not mobile-responsive');
  if (!s.hasSeoBasics) out.push('Missing SEO basics');
  if (!s.hasContactForm) out.push('No contact form');
  if (!s.hasBookingForm) out.push('No online booking');
  if (!s.hasLeadCaptureForm) out.push('No email lead-capture');
  if (!s.clickToCall) out.push('No click-to-call link');
  if (!s.whatsappLink) out.push('No WhatsApp link');
  if (!s.hasTestimonials) out.push('No testimonials shown');
  if (!s.hasGallery) out.push('No gallery / portfolio');
  if (!s.hasPricing) out.push('No pricing info');
  if (!s.hasServicePages) out.push('No dedicated service pages');
  if (!s.hasTrustBadges) out.push('No trust badges');
  if (!s.facebookUrl && !s.instagramUrl) out.push('No social presence linked');
  if (s.fetchMs >= 5000) out.push('Slow first-byte response');
  if (s.copyrightAgeYears !== null && s.copyrightAgeYears >= 3) out.push(`Copyright ${s.copyrightAgeYears}y old`);
  return out;
}

// ---------------------------------------------------------------------------
// Comparison + gaps
// ---------------------------------------------------------------------------

function buildComparison(
  primary: SiteSummary,
  competitors: SiteSummary[]
): IntelSummaryPayload['comparison'] {
  const cohort = [primary, ...competitors];
  const comp: IntelSummaryPayload['comparison'] = {};

  const numericKeys: { key: keyof SiteScores; label: string }[] = [
    { key: 'overall', label: 'Overall score' },
    { key: 'health', label: 'Health score' },
    { key: 'conversion', label: 'Conversion readiness' },
    { key: 'seo', label: 'SEO basics' },
    { key: 'mobile', label: 'Mobile readiness' },
    { key: 'performance', label: 'Performance' },
    { key: 'security', label: 'Security' }
  ];

  for (const { key, label } of numericKeys) {
    const ranked = [...cohort].sort((a, b) => b.scores[key] - a.scores[key]);
    const values: Record<string, number> = {};
    for (const s of cohort) values[s.name] = s.scores[key];
    comp[label] = {
      leader: ranked[0].name,
      runnerUp: ranked[1]?.name ?? null,
      values
    };
  }

  return comp;
}

function buildGaps(primary: SiteSummary, competitors: SiteSummary[]): string[] {
  const gaps: string[] = [];
  if (!primary.signals) return gaps;
  const ps = primary.signals;
  const features: { key: keyof WebsiteAuditResult['signals']; label: string }[] = [
    { key: 'hasBookingForm', label: 'Online booking' },
    { key: 'hasLeadCaptureForm', label: 'Email lead-capture form' },
    { key: 'whatsappLink', label: 'WhatsApp click-to-chat' },
    { key: 'clickToCall', label: 'Click-to-call' },
    { key: 'hasTestimonials', label: 'Testimonials' },
    { key: 'hasGallery', label: 'Gallery / portfolio' },
    { key: 'hasPricing', label: 'Pricing info' },
    { key: 'hasServicePages', label: 'Dedicated service pages' },
    { key: 'hasTrustBadges', label: 'Trust badges' },
    { key: 'facebookUrl', label: 'Facebook presence' },
    { key: 'instagramUrl', label: 'Instagram presence' }
  ];

  for (const f of features) {
    const primaryHas = !!ps[f.key];
    if (primaryHas) continue;
    const competitorsWith = competitors.filter((c) => !!c.signals && !!c.signals[f.key]);
    if (competitorsWith.length === 0) continue;
    const names = competitorsWith.map((c) => c.name).slice(0, 3).join(', ');
    gaps.push(`${f.label} — ${competitorsWith.length} of ${competitors.length} competitors have this (${names}). You don't.`);
  }
  return gaps;
}

function buildRecommendations(
  primary: SiteSummary,
  gaps: string[]
): IntelSummaryPayload['recommendations'] {
  const recs: IntelSummaryPayload['recommendations'] = [];
  if (!primary.signals) {
    recs.push({
      kind: 'strategic',
      title: 'Get the website online',
      detail: 'The primary site could not be analysed. Restoring it should be the first priority.'
    });
    return recs;
  }
  const s = primary.signals;
  if (!s.https) recs.push({ kind: 'quick_win', title: 'Enable HTTPS', detail: 'Modern browsers flag plain-HTTP sites as insecure. A free Let\'s Encrypt cert closes this in under an hour.' });
  if (!s.hasMobileViewport) recs.push({ kind: 'quick_win', title: 'Add a mobile viewport', detail: 'A single <meta name="viewport"> tag makes the site usable on phones — currently it isn\'t.' });
  if (!s.hasContactForm && !s.hasLeadCaptureForm) recs.push({ kind: 'quick_win', title: 'Add a lead-capture form', detail: 'No form means every interested visitor has to leave the site to reach you. Even a simple email-only form will lift conversions.' });
  if (!s.clickToCall) recs.push({ kind: 'quick_win', title: 'Add click-to-call', detail: 'A `tel:` link in the header lets mobile visitors call with a single tap.' });
  if (!s.whatsappLink) recs.push({ kind: 'quick_win', title: 'Add WhatsApp click-to-chat', detail: 'A wa.me/<number> link is the highest-converting messaging channel for many SMBs.' });
  if (!s.hasBookingForm) recs.push({ kind: 'strategic', title: 'Add online booking', detail: 'Embedding Calendly / Square / Setmore lets prospects book without phone tag.' });
  if (!s.hasTestimonials) recs.push({ kind: 'strategic', title: 'Showcase testimonials', detail: 'Featuring 3-5 reviews near a CTA materially lifts trust.' });
  if (!s.hasGallery) recs.push({ kind: 'strategic', title: 'Add a portfolio / gallery', detail: 'A "Our work" section is one of the most-viewed pages on service-business sites.' });
  if (!s.hasPricing) recs.push({ kind: 'strategic', title: 'Publish indicative pricing', detail: 'Even ranges (e.g. "from $99") qualify visitors and reduce wasted enquiries.' });
  if (!s.hasServicePages) recs.push({ kind: 'strategic', title: 'Build out service pages', detail: 'Search engines and visitors both expect a page per major service.' });
  if (!s.hasTrustBadges) recs.push({ kind: 'strategic', title: 'Display trust signals', detail: 'Awards, certifications, "Google Verified" badges, etc. — anywhere they\'re honest.' });
  if (!s.facebookUrl && !s.instagramUrl) recs.push({ kind: 'strategic', title: 'Link your social profiles', detail: 'Search engines use these signals; visitors use them to verify you\'re real.' });

  if (gaps.length > 0) {
    recs.push({
      kind: 'strategic',
      title: 'Close competitor feature gaps',
      detail: `${gaps.length} feature(s) competitors offer that you don't — see the gap-analysis section.`
    });
  }
  return recs;
}

// ---------------------------------------------------------------------------
// Competitor auto-detection
// ---------------------------------------------------------------------------

async function autoDetectCompetitors(opts: {
  organizationId: string;
  category: string;
  city: string | null;
  country: string | null;
  excludeUrl: string;
  limit: number;
}): Promise<{ name: string; url: string }[]> {
  try {
    const provider = resolveSearchProvider('google_places');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const page = await provider.search(
        {
          niche: opts.category,
          city: opts.city ?? undefined,
          country: opts.country ?? undefined,
          limit: Math.min(opts.limit * 3, 20)
        },
        {
          logger,
          signal: ctrl.signal,
          credentials: { apiKey: process.env.GOOGLE_MAPS_API_KEY ?? '' },
          meter: async () => {}
        }
      );
      const exclude = normaliseHost(opts.excludeUrl);
      const seen = new Set<string>();
      const out: { name: string; url: string }[] = [];
      for (const lead of page.leads) {
        if (!lead.website) continue;
        const host = normaliseHost(lead.website);
        if (!host || host === exclude || seen.has(host)) continue;
        seen.add(host);
        out.push({ name: lead.name, url: lead.website });
        if (out.length >= opts.limit) break;
      }
      return out;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'intel: competitor auto-detect failed (continuing without auto competitors)'
    );
    return [];
  }
}

function normaliseHost(raw: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main job handler
// ---------------------------------------------------------------------------

export async function runIntelBuild(job: IntelBuildJob): Promise<void> {
  const log = logger.child({ job: 'intel.build', reportId: job.reportId });

  // Mark as running
  const report = await withOrg(job.organizationId, (tx) =>
    tx.websiteIntelReport.update({
      where: { id: job.reportId },
      data: { status: 'running', errorMessage: null }
    })
  );

  try {
    // Audit primary site
    log.info({ url: report.primaryUrl }, 'intel: auditing primary');
    const primaryAudit = await auditSafe(report.primaryUrl);

    // Load existing manual competitors
    const manualCompetitors = await withOrg(job.organizationId, (tx) =>
      tx.websiteIntelCompetitor.findMany({
        where: { reportId: report.id },
        orderBy: { createdAt: 'asc' }
      })
    );

    // Auto-detect if requested and we have category info
    const slotsLeft = Math.max(0, Math.min(job.maxCompetitors, MAX_COMPETITORS_HARD) - manualCompetitors.length);
    if (job.autoDetectCompetitors && slotsLeft > 0 && report.category) {
      const found = await autoDetectCompetitors({
        organizationId: job.organizationId,
        category: report.category,
        city: report.city,
        country: report.country,
        excludeUrl: report.primaryUrl,
        limit: slotsLeft
      });
      // Persist auto-detected rows
      for (const c of found) {
        if (manualCompetitors.some((m) => normaliseHost(m.url) === normaliseHost(c.url))) continue;
        const created = await withOrg(job.organizationId, (tx) =>
          tx.websiteIntelCompetitor.create({
            data: {
              organizationId: job.organizationId,
              reportId: report.id,
              source: 'auto',
              name: c.name,
              url: c.url,
              status: 'queued'
            }
          })
        );
        manualCompetitors.push(created);
      }
    }

    // Audit each competitor
    const competitorRows: CompetitorRow[] = [];
    for (const c of manualCompetitors) {
      log.info({ url: c.url }, 'intel: auditing competitor');
      const audit = await auditSafe(c.url);
      const status = audit ? 'complete' : 'failed';
      const errorMessage = audit ? null : 'audit failed';
      await withOrg(job.organizationId, (tx) =>
        tx.websiteIntelCompetitor.update({
          where: { id: c.id },
          data: audit
            ? { status, errorMessage, auditJson: audit as unknown as object }
            : { status, errorMessage }
        })
      );
      competitorRows.push({
        id: c.id,
        url: c.url,
        name: c.name,
        source: c.source,
        status,
        errorMessage,
        audit
      });
    }

    // Build summary payload
    const primaryEnrich = await enrichSiteForReport(report.primaryUrl, primaryAudit);
    const primarySummary = toSiteSummary({
      id: report.id,
      name: report.title,
      url: report.primaryUrl,
      audit: primaryAudit,
      screenshotUrl: primaryEnrich.screenshotUrl,
      contacts: primaryEnrich.contacts
    });
    const competitorSummaries: SiteSummary[] = [];
    for (const c of competitorRows) {
      const enr = await enrichSiteForReport(c.url, c.audit);
      competitorSummaries.push(
        toSiteSummary({
          id: c.id,
          name: c.name ?? hostnameOf(c.url),
          url: c.url,
          audit: c.audit,
          screenshotUrl: enr.screenshotUrl,
          contacts: enr.contacts
        })
      );
    }
    const comparison = buildComparison(primarySummary, competitorSummaries);
    const gaps = buildGaps(primarySummary, competitorSummaries);
    const recommendations = buildRecommendations(primarySummary, gaps);

    const payload: IntelSummaryPayload = {
      generatedAt: new Date().toISOString(),
      primary: primarySummary,
      competitors: competitorSummaries,
      comparison,
      gaps,
      recommendations,
      disclaimers: [
        'Visitor counts and bounce-rate metrics require a Google Analytics connection (not yet linked).',
        'Competitor traffic estimates require a third-party data provider (e.g. SimilarWeb) and are not enabled.',
        'All findings are inferred from publicly available HTML and the public Google Places listing only.'
      ]
    };

    await withOrg(job.organizationId, (tx) =>
      tx.websiteIntelReport.update({
        where: { id: report.id },
        data: {
          status: 'complete',
          summaryJson: payload as unknown as object,
          errorMessage: null
        }
      })
    );

    log.info(
      { primaryScore: primarySummary.scores.overall, competitors: competitorSummaries.length },
      'intel: report complete'
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'intel: report failed');
    await withOrg(job.organizationId, (tx) =>
      tx.websiteIntelReport.update({
        where: { id: report.id },
        data: { status: 'failed', errorMessage: msg }
      })
    );
    throw err;
  }
}

function toSiteSummary(args: {
  id: string;
  name: string;
  url: string;
  audit: WebsiteAuditResult | null;
  screenshotUrl?: string | null;
  contacts?: { primaryEmail: string | null; decisionMakerName: string | null; source: 'hunter' | 'apollo' | null };
}): SiteSummary {
  const a = args.audit;
  return {
    id: args.id,
    name: args.name,
    url: args.url,
    finalUrl: a?.finalUrl ?? null,
    reachable: !!a?.reachable,
    health: a ? a.health : 'unknown',
    scores: computeScores(a),
    signals: a?.signals ?? null,
    strengths: deriveStrengths(a),
    weaknesses: deriveWeaknesses(a),
    screenshotUrl: args.screenshotUrl ?? null,
    contacts: args.contacts ?? { primaryEmail: null, decisionMakerName: null, source: null },
    pageSpeed: a?.pageSpeed
      ? {
          performance: a.pageSpeed.performance,
          lcpSeconds: a.pageSpeed.lcpSeconds,
          cls: a.pageSpeed.cls,
          inpMs: a.pageSpeed.inpMs
        }
      : null,
    estimated: { monthlyVisits: null, actualVisitsAvailable: false }
  };
}

function hostnameOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./i, ''); }
  catch { return url; }
}

async function auditSafe(url: string): Promise<WebsiteAuditResult | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), COMPETITOR_AUDIT_TIMEOUT_MS);
    try {
      return await auditWebsite(url);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logger.warn({ url, err: err instanceof Error ? err.message : String(err) }, 'intel: audit threw');
    return null;
  }
}

/**
 * Run the optional paid-API enrichments for a single site (screenshot +
 * contact discovery). All providers feature-flag off if their env key
 * is missing, so this is a no-op in self-hosted setups without keys.
 */
async function enrichSiteForReport(
  url: string,
  audit: WebsiteAuditResult | null
): Promise<{
  screenshotUrl: string | null;
  contacts: { primaryEmail: string | null; decisionMakerName: string | null; source: 'hunter' | 'apollo' | null; emailStatus: 'valid' | 'invalid' | 'risky' | 'unknown' | null };
}> {
  let screenshotUrl: string | null = null;
  if (screenshotOneProvider.available() && audit?.reachable) {
    try {
      const shot = screenshotOneProvider.run(audit.finalUrl ?? url);
      screenshotUrl = shot?.imageUrl ?? null;
    } catch {
      // ignore
    }
  }

  let contacts: { primaryEmail: string | null; decisionMakerName: string | null; source: 'hunter' | 'apollo' | null; emailStatus: 'valid' | 'invalid' | 'risky' | 'unknown' | null } = {
    primaryEmail: null,
    decisionMakerName: null,
    source: null,
    emailStatus: null
  };
  const host = hostnameOf(url);
  if (host) {
    try {
      if (hunterProvider.available()) {
        const r = await hunterProvider.run(host);
        if (r) {
          contacts = { primaryEmail: r.primaryEmail, decisionMakerName: r.decisionMakerName, source: 'hunter', emailStatus: null };
        }
      }
      if (!contacts.primaryEmail && apolloProvider.available()) {
        const r = await apolloProvider.run(host);
        if (r) {
          contacts = { primaryEmail: r.primaryEmail, decisionMakerName: r.decisionMakerName, source: 'apollo', emailStatus: null };
        }
      }
    } catch {
      // ignore
    }
  }

  // If we found an email and a verifier is configured, mark its deliverability.
  if (contacts.primaryEmail) {
    try {
      const v = await verifyEmail(contacts.primaryEmail);
      if (v) contacts.emailStatus = v.status;
    } catch {
      // ignore
    }
  }
  return { screenshotUrl, contacts };
}
