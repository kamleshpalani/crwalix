import { withOrg } from '@crawlix/db';
import {
  EnrichmentKind,
  EnrichmentStatus,
  JobName,
  QueueName,
  WebsiteHealth,
  type EnrichmentJob
} from '@crawlix/shared';
import { Queue } from 'bullmq';
import { getConnection } from '../lib/redis';
import { logger } from '../lib/logger';

let _scoringQueue: Queue | null = null;
function scoringQueue(): Queue {
  if (!_scoringQueue) {
    _scoringQueue = new Queue(QueueName.SCORING, { connection: getConnection() });
  }
  return _scoringQueue;
}

const FETCH_TIMEOUT_MS = Number(process.env.WEBSITE_FETCH_TIMEOUT_MS ?? 10_000);
const USER_AGENT =
  process.env.WEBSITE_FETCH_USER_AGENT ??
  'CrawlixBot/1.0 (+https://crawlix.example/bot)';

export interface WebsiteAuditResult {
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  reachable: boolean;
  health: WebsiteHealth;
  healthScore: number;
  signals: {
    https: boolean;
    hasMobileViewport: boolean;
    hasCharsetMeta: boolean;
    hasOgTags: boolean;
    copyrightYear: number | null;
    copyrightAgeYears: number | null;
    lastModifiedHeader: string | null;
    lastModifiedAgeDays: number | null;
    pageBytes: number;
    technologies: string[];
    parked: boolean;
    redirectedAway: boolean;
  };
  issues: string[];
  auditedAt: string;
}

/**
 * Lightweight website auditor. Uses plain `fetch` to avoid pulling in
 * Playwright (which is heavy + slow). Heuristics only — good enough to
 * separate "this site looks like 2008" from "this is a modern build".
 */
export async function auditWebsite(rawUrl: string): Promise<WebsiteAuditResult> {
  const auditedAt = new Date().toISOString();
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return unreachable(rawUrl, 'invalid-url', auditedAt);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml'
      }
    });
  } catch (err) {
    clearTimeout(timer);
    return unreachable(url.toString(), err instanceof Error ? err.message : 'fetch-failed', auditedAt);
  }
  clearTimeout(timer);

  const finalUrl = res.url || url.toString();
  const finalHost = (() => {
    try {
      return new URL(finalUrl).hostname;
    } catch {
      return url.hostname;
    }
  })();
  const redirectedAway = finalHost.replace(/^www\./, '') !== url.hostname.replace(/^www\./, '');

  if (!res.ok && (res.status >= 400 || res.status === 0)) {
    return unreachable(finalUrl, `http-${res.status}`, auditedAt, res.status);
  }

  const html = await res.text().catch(() => '');
  const lower = html.toLowerCase();
  const pageBytes = html.length;

  const issues: string[] = [];
  const https = url.protocol === 'https:';
  if (!https) issues.push('site is not served over HTTPS');

  const hasMobileViewport = /<meta\s+[^>]*name=["']viewport["'][^>]*content=["'][^"']*width=device-width/i.test(
    html
  );
  if (!hasMobileViewport) issues.push('missing mobile viewport meta');

  const hasCharsetMeta = /<meta\s+[^>]*charset=/i.test(html);
  if (!hasCharsetMeta) issues.push('missing charset meta');

  const hasOgTags = /<meta\s+[^>]*property=["']og:/i.test(html);

  // Copyright year
  const copyMatch =
    html.match(/©\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/) ??
    html.match(/copyright\s*(?:&copy;)?\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/i);
  const copyrightYear = copyMatch ? Number(copyMatch[1]) : null;
  const currentYear = new Date().getUTCFullYear();
  const copyrightAgeYears =
    copyrightYear && copyrightYear <= currentYear ? currentYear - copyrightYear : null;
  if (copyrightAgeYears !== null && copyrightAgeYears >= 3) {
    issues.push(`copyright year is ${copyrightYear} (${copyrightAgeYears}y old)`);
  }

  // Last-Modified
  const lastModifiedHeader = res.headers.get('last-modified');
  let lastModifiedAgeDays: number | null = null;
  if (lastModifiedHeader) {
    const t = Date.parse(lastModifiedHeader);
    if (!Number.isNaN(t)) {
      lastModifiedAgeDays = Math.round((Date.now() - t) / 86400000);
      if (lastModifiedAgeDays >= 365) {
        issues.push(`last-modified is ${lastModifiedAgeDays}d old`);
      }
    }
  }

  // Tech stack signals
  const technologies: string[] = [];
  if (lower.includes('wp-content/') || lower.includes('wp-includes/')) technologies.push('wordpress');
  if (lower.includes('shopify')) technologies.push('shopify');
  if (lower.includes('squarespace')) technologies.push('squarespace');
  if (lower.includes('wix.com')) technologies.push('wix');
  if (lower.includes('webflow')) technologies.push('webflow');
  if (lower.includes('next.js') || lower.includes('/_next/')) technologies.push('nextjs');
  if (lower.includes('data-reactroot') || lower.includes('__react')) technologies.push('react');
  if (lower.includes('bootstrap.min.css')) technologies.push('bootstrap');
  if (lower.includes('jquery-1.') || lower.includes('jquery-2.')) {
    technologies.push('legacy-jquery');
    issues.push('uses legacy jQuery (1.x/2.x)');
  }
  if (lower.includes('frameset')) {
    technologies.push('html-frames');
    issues.push('uses HTML <frameset> (1990s)');
  }
  if (lower.includes('flash') && lower.includes('.swf')) {
    technologies.push('flash');
    issues.push('embeds Adobe Flash');
  }

  // Parked / under construction heuristics
  const parkedHints =
    /(domain (is )?for sale|coming soon|under construction|website expired|this site is parked|godaddy parked)/i;
  const parked = parkedHints.test(html) && pageBytes < 30_000;
  if (parked) issues.push('appears to be a parked/placeholder page');

  // Page weight is a weak signal — only flag if extremely small.
  if (pageBytes < 500) issues.push(`tiny response (${pageBytes} bytes)`);

  // ----- Scoring -----
  let healthScore = 100;
  if (!https) healthScore -= 15;
  if (!hasMobileViewport) healthScore -= 25;
  if (!hasCharsetMeta) healthScore -= 5;
  if (!hasOgTags) healthScore -= 5;
  if (copyrightAgeYears !== null) {
    if (copyrightAgeYears >= 5) healthScore -= 25;
    else if (copyrightAgeYears >= 3) healthScore -= 15;
    else if (copyrightAgeYears >= 2) healthScore -= 5;
  }
  if (lastModifiedAgeDays !== null) {
    if (lastModifiedAgeDays >= 730) healthScore -= 15;
    else if (lastModifiedAgeDays >= 365) healthScore -= 8;
  }
  if (technologies.includes('legacy-jquery')) healthScore -= 10;
  if (technologies.includes('html-frames')) healthScore -= 30;
  if (technologies.includes('flash')) healthScore -= 30;
  if (technologies.includes('wix') || technologies.includes('squarespace') || technologies.includes('webflow')) {
    healthScore += 5; // hosted builders → typically maintained
  }
  if (technologies.includes('nextjs') || technologies.includes('react')) healthScore += 5;
  if (parked) healthScore -= 60;
  if (redirectedAway) healthScore -= 5;

  healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

  let health: WebsiteHealth;
  if (parked) health = WebsiteHealth.UNREACHABLE;
  else if (healthScore >= 75) health = WebsiteHealth.FRESH;
  else if (healthScore >= 50) health = WebsiteHealth.NEEDS_REVIEW;
  else health = WebsiteHealth.OUTDATED;

  return {
    url: url.toString(),
    finalUrl,
    httpStatus: res.status,
    reachable: true,
    health,
    healthScore,
    signals: {
      https,
      hasMobileViewport,
      hasCharsetMeta,
      hasOgTags,
      copyrightYear,
      copyrightAgeYears,
      lastModifiedHeader,
      lastModifiedAgeDays,
      pageBytes,
      technologies,
      parked,
      redirectedAway
    },
    issues,
    auditedAt
  };
}

function unreachable(
  rawUrl: string,
  reason: string,
  auditedAt: string,
  status: number | null = null
): WebsiteAuditResult {
  return {
    url: rawUrl,
    finalUrl: null,
    httpStatus: status,
    reachable: false,
    health: WebsiteHealth.UNREACHABLE,
    healthScore: 0,
    signals: {
      https: rawUrl.startsWith('https:'),
      hasMobileViewport: false,
      hasCharsetMeta: false,
      hasOgTags: false,
      copyrightYear: null,
      copyrightAgeYears: null,
      lastModifiedHeader: null,
      lastModifiedAgeDays: null,
      pageBytes: 0,
      technologies: [],
      parked: false,
      redirectedAway: false
    },
    issues: [`unreachable: ${reason}`],
    auditedAt
  };
}

/** BullMQ handler for the `enrich.website` job. */
export async function runWebsiteEnrichment(job: EnrichmentJob): Promise<void> {
  const log = logger.child({ job: 'enrich.website', leadId: job.leadId, enrichmentId: job.enrichmentId });

  await withOrg(job.organizationId, (tx) =>
    tx.enrichment.update({
      where: { id: job.enrichmentId },
      data: { status: EnrichmentStatus.RUNNING, startedAt: new Date(), attempts: { increment: 1 } }
    })
  );

  let lead;
  try {
    lead = await withOrg(job.organizationId, (tx) =>
      tx.lead.findUnique({ where: { id: job.leadId }, select: { id: true, website: true } })
    );
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'failed to load lead');
    throw err;
  }

  if (!lead?.website) {
    log.info('lead has no website; skipping');
    await withOrg(job.organizationId, (tx) =>
      tx.enrichment.update({
        where: { id: job.enrichmentId },
        data: { status: EnrichmentStatus.SKIPPED, finishedAt: new Date() }
      })
    );
    return;
  }

  const result = await auditWebsite(lead.website);
  log.info(
    { health: result.health, score: result.healthScore, issues: result.issues.length },
    'website audited'
  );

  await withOrg(job.organizationId, async (tx) => {
    await tx.lead.update({
      where: { id: job.leadId },
      data: {
        websiteHealth: result.health,
        websiteHealthScore: result.healthScore,
        websiteAudit: result as unknown as object,
        websiteAuditedAt: new Date(),
        lastEnrichedAt: new Date()
      }
    });
    await tx.enrichment.update({
      where: { id: job.enrichmentId },
      data: {
        status: EnrichmentStatus.SUCCEEDED,
        finishedAt: new Date(),
        normalized: result as unknown as object
      }
    });
  });

  // Re-score so the priorityTier reflects the fresh audit.
  await scoringQueue().add(JobName.SCORE_LEAD, {
    organizationId: job.organizationId,
    leadId: job.leadId,
    rulesetVersion: 'v1.0.0'
  });
}

export const _testing = { auditWebsite };

// Silence unused-import lint when only types are referenced.
void EnrichmentKind;
