import { withOrg } from "@crawlix/db";
import {
  EnrichmentKind,
  EnrichmentStatus,
  JobName,
  QueueName,
  WebsiteHealth,
  WebsiteClassification,
  classifyBusinessScale,
  getServicePitch,
  type EnrichmentJob,
} from "@crawlix/shared";
import { pageSpeedProvider, builtWithProvider } from "@crawlix/providers";
import { Queue } from "bullmq";
import { getConnection } from "../lib/redis";
import { logger } from "../lib/logger";

let _scoringQueue: Queue | null = null;
function scoringQueue(): Queue {
  if (!_scoringQueue) {
    _scoringQueue = new Queue(QueueName.SCORING, {
      connection: getConnection(),
    });
  }
  return _scoringQueue;
}

const FETCH_TIMEOUT_MS = Number(process.env.WEBSITE_FETCH_TIMEOUT_MS ?? 25_000);
/** Extra timeout for the second-chance retry after a soft failure. */
const FETCH_RETRY_TIMEOUT_MS = Number(
  process.env.WEBSITE_FETCH_RETRY_TIMEOUT_MS ?? 40_000,
);
/**
 * Default to a real Chrome UA. Many SMB hosts (Cloudflare/Imperva/Akamai)
 * 403 anything that looks like a bot, which makes the audit useless. Sites
 * that explicitly disallow us via robots.txt are still skipped above.
 */
const USER_AGENT =
  process.env.WEBSITE_FETCH_USER_AGENT ??
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
/** Fallback UA used if the first request looks like it was bot-blocked. */
const FALLBACK_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

/** Headers a normal browser sends — reduces bot-mitigation false positives. */
function browserHeaders(ua: string): Record<string, string> {
  return {
    "user-agent": ua,
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "upgrade-insecure-requests": "1",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
  };
}

/** HTTP statuses commonly used by bot-mitigation when blocking by UA. */
const BOT_BLOCK_STATUSES = new Set([401, 403, 405, 406, 429, 451, 503]);

/**
 * Polite robots.txt check. Cached per-host for 1 hour. Returns `true` if
 * the host's robots.txt explicitly disallows our User-Agent (or `*`) from
 * the audit path. We treat fetch errors as "not disallowed" because many
 * SMB sites simply lack a robots.txt.
 */
const ROBOTS_TTL_MS = 60 * 60 * 1000;
const robotsCache = new Map<string, { allowed: boolean; expires: number }>();

async function isAllowedByRobots(
  target: URL,
  signal?: AbortSignal,
): Promise<boolean> {
  const host = target.host;
  const cached = robotsCache.get(host);
  if (cached && cached.expires > Date.now()) return cached.allowed;

  const robotsUrl = `${target.protocol}//${host}/robots.txt`;
  let body = "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(robotsUrl, {
      headers: { "user-agent": USER_AGENT, accept: "text/plain" },
      signal: signal ?? ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) {
      robotsCache.set(host, {
        allowed: true,
        expires: Date.now() + ROBOTS_TTL_MS,
      });
      return true;
    }
    body = await res.text();
  } catch {
    robotsCache.set(host, {
      allowed: true,
      expires: Date.now() + ROBOTS_TTL_MS,
    });
    return true;
  }

  // Minimal robots.txt parser. Looks for the most specific UA group that
  // matches our bot, then `Allow:`/`Disallow:` rules against the path.
  const path = target.pathname || "/";
  const lines = body.split(/\r?\n/);
  const groups: {
    agents: string[];
    rules: { allow: boolean; pattern: string }[];
  }[] = [];
  let current: (typeof groups)[number] | null = null;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (key === "allow" || key === "disallow")) {
      current.rules.push({ allow: key === "allow", pattern: value });
    }
  }

  const ua = USER_AGENT.toLowerCase();
  let chosen = groups.find((g) =>
    g.agents.some((a) => a !== "*" && ua.includes(a)),
  );
  if (!chosen) chosen = groups.find((g) => g.agents.includes("*"));

  let allowed = true;
  if (chosen) {
    let bestLen = -1;
    for (const r of chosen.rules) {
      if (!r.pattern) continue;
      if (path.startsWith(r.pattern) && r.pattern.length > bestLen) {
        bestLen = r.pattern.length;
        allowed = r.allow;
      }
    }
  }

  robotsCache.set(host, { allowed, expires: Date.now() + ROBOTS_TTL_MS });
  return allowed;
}

export interface WebsiteAuditResult {
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  reachable: boolean;
  health: WebsiteHealth;
  healthScore: number;
  /** §9.1 — 7-state classification derived from health score + signals. */
  websiteClassification: WebsiteClassification;
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
    /** TTFB-ish: total time-to-first-byte (HTML downloaded) in ms. */
    fetchMs: number;
    hasContactForm: boolean;
    hasBookingForm: boolean;
    hasSeoBasics: boolean;
    hasTitle: boolean;
    hasMetaDescription: boolean;
    hasH1: boolean;
    /** Actual page <title> text (first 200 chars), null if missing. */
    titleText: string | null;
    /** Meta description content text (first 500 chars), null if missing. */
    metaDescriptionText: string | null;
    /** Public social URLs discovered in the page. */
    facebookUrl: string | null;
    instagramUrl: string | null;
    // ---- Conversion-oriented signals (for Website Intel module) ----
    /** WhatsApp click-to-chat link (wa.me / api.whatsapp.com). */
    whatsappLink: string | null;
    /** Click-to-call `tel:` link present. */
    clickToCall: boolean;
    /** Number of `tel:` links found. */
    telLinkCount: number;
    /** Testimonials / reviews section detected. */
    hasTestimonials: boolean;
    /** Photo gallery / portfolio detected. */
    hasGallery: boolean;
    /** Pricing or packages section detected. */
    hasPricing: boolean;
    /** Internal service / treatment / product pages detected. */
    hasServicePages: boolean;
    /** Trust badges (BBB, Trustpilot, Google Partner, certifications). */
    hasTrustBadges: boolean;
    /** Email-capture / lead form detected (form with input[type=email]). */
    hasLeadCaptureForm: boolean;
    /** Approximate count of call-to-action buttons / links. */
    ctaCount: number;
    /** Approximate count of `<img>` tags. */
    imageCount: number;
    /** §9.2 — JSON-LD / microdata schema.org markup detected. */
    hasSchemaMarkup: boolean;
    /** §9.2 — Analytics snippet detected (GA4, GTM, Plausible, etc.). */
    hasAnalytics: boolean;
    /** §9.2 — Google Maps embed detected. */
    hasGoogleMapsEmbed: boolean;
    /** §9.2 — Navigation landmark element detected (<nav>, role="navigation"). */
    hasNavigation: boolean;
    /** §9.2 — Basic accessibility signals present (alt text, aria attrs). */
    hasAccessibility: boolean;
    /** §9.2 — Heading hierarchy: h1 + at least one h2/h3. */
    hasHeadingStructure: boolean;
  };
  issues: string[];
  /** Findings grouped by improvement domain — what we'd pitch to the lead. */
  categories: {
    design: WebsiteAuditCategory;
    mobile: WebsiteAuditCategory;
    performance: WebsiteAuditCategory;
    seo: WebsiteAuditCategory;
    contact: WebsiteAuditCategory;
    security: WebsiteAuditCategory;
    business: WebsiteAuditCategory;
  };
  /** Final verdict on whether this lead is worth an outreach. */
  outreachFit: {
    suitable: boolean;
    reason: string;
    /** 0–100 — higher = bigger improvement opportunity (better lead). */
    opportunityScore: number;
  };
  /** Optional PageSpeed Insights data (mobile strategy). null when feature flag off. */
  pageSpeed?: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
    lcpSeconds: number | null;
    cls: number | null;
    inpMs: number | null;
    passedCoreWebVitals: boolean | null;
  } | null;
  /** Optional BuiltWith data. null when feature flag off. */
  builtWith?: {
    technologies: string[];
    cms: string | null;
    ecommerce: string | null;
    analytics: string[];
  } | null;
  auditedAt: string;
}

export interface WebsiteAuditCategory {
  /**
   * pass | warn | fail | skipped.
   *
   * `skipped` means we genuinely could not measure this category (e.g. the
   * site timed out / was unreachable from our crawler). It is **not** a
   * failure of the business — the UI must render it as a neutral state so
   * the lead's report does not falsely accuse them of being broken when
   * really our fetch could not complete.
   */
  status: "pass" | "warn" | "fail" | "skipped";
  /** Human-readable label for the category. */
  label: string;
  /** Specific findings within this category. */
  findings: string[];
}

/**
 * Lightweight website auditor. Uses plain `fetch` to avoid pulling in
 * Playwright (which is heavy + slow). Heuristics only — good enough to
 * separate "this site looks like 2008" from "this is a modern build".
 */
export async function auditWebsite(
  rawUrl: string,
): Promise<WebsiteAuditResult> {
  const auditedAt = new Date().toISOString();

  // ---- URL normalization ------------------------------------------------
  // Inputs from providers can be messy: missing scheme ("acme.com"), tracking
  // params, trailing whitespace, smart quotes, etc. We sanitize here so the
  // auditor doesn't fail "fetch failed" on otherwise-fine sites.
  const cleaned = (rawUrl ?? "")
    .trim()
    .replace(/^[<"']+|[>"'.,;]+$/g, "")
    .replace(/\s+/g, "");
  if (!cleaned) {
    return unreachable(rawUrl, "invalid-url", auditedAt);
  }
  const withScheme = /^https?:\/\//i.test(cleaned)
    ? cleaned
    : `https://${cleaned}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return unreachable(rawUrl, "invalid-url", auditedAt);
  }
  if (!url.hostname || !url.hostname.includes(".")) {
    return unreachable(rawUrl, "invalid-url", auditedAt);
  }

  // Respect robots.txt before issuing the audit GET.
  const allowed = await isAllowedByRobots(url).catch(() => true);
  if (!allowed) {
    return unreachable(url.toString(), "robots-disallowed", auditedAt);
  }

  /**
   * Try GET, then HEAD, then a fallback UA. Many SMB hosts route through
   * Cloudflare/Imperva and 403 unfamiliar UAs — we want a real verdict
   * about the site, not about the WAF.
   */
  async function tryFetch(
    target: URL,
    method: "GET" | "HEAD",
    ua: string,
    signal: AbortSignal,
  ): Promise<Response | { error: string }> {
    try {
      return await fetch(target.toString(), {
        method,
        redirect: "follow",
        signal,
        headers: browserHeaders(ua),
      });
    } catch (err) {
      // undici wraps the real cause (ENOTFOUND, ECONNREFUSED, certificate,
      // EAI_AGAIN, …). Surface it so categories can attribute the failure.
      const e = err as {
        message?: string;
        cause?: { code?: string; message?: string };
      };
      const code = e?.cause?.code;
      const msg = e?.cause?.message ?? e?.message ?? "fetch-failed";
      return { error: code ? `${code}: ${msg}` : msg };
    }
  }

  // Build the variant cascade: original first, then sensible recoveries.
  // - If hostname has no `www.`, also try `www.<host>`.
  // - If we picked https because input had no scheme, also try http.
  const hasWww = url.hostname.startsWith("www.");
  const variants: URL[] = [url];
  if (!hasWww) {
    const v = new URL(url.toString());
    v.hostname = `www.${url.hostname}`;
    variants.push(v);
  }
  if (url.protocol === "https:") {
    const v = new URL(url.toString());
    v.protocol = "http:";
    variants.push(v);
    if (!hasWww) {
      const v2 = new URL(url.toString());
      v2.protocol = "http:";
      v2.hostname = `www.${url.hostname}`;
      variants.push(v2);
    }
  }

  let res: Response | null = null;
  let lastError = "fetch-failed";
  let succeededWith = url;
  const t0 = Date.now();
  let timer: NodeJS.Timeout | null = null;
  let ctrl = new AbortController();

  outer: for (const variant of variants) {
    ctrl = new AbortController();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const attempts: Array<{ method: "GET" | "HEAD"; ua: string }> = [
      { method: "GET", ua: USER_AGENT },
      { method: "GET", ua: FALLBACK_UA },
      { method: "HEAD", ua: USER_AGENT },
    ];
    for (const a of attempts) {
      const r = await tryFetch(variant, a.method, a.ua, ctrl.signal);
      if ("error" in r) {
        lastError = r.error;
        // DNS / refused / TLS errors → no point retrying same host with HEAD;
        // skip to next variant.
        if (
          /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ERR_TLS|UNABLE_TO_VERIFY|CERT_/i.test(
            r.error,
          )
        ) {
          break;
        }
        continue;
      }
      res = r;
      succeededWith = variant;
      if (r.ok) break outer;
      if (!BOT_BLOCK_STATUSES.has(r.status)) break outer;
      // Bot-block status — drain and try next attempt/variant.
      await r.text().catch(() => "");
    }
  }
  if (timer) clearTimeout(timer);

  // Second-chance pass: if we got nothing (or only timeouts) on the first
  // round, give the slowest variant one more attempt with a longer timeout.
  // Many SMB sites on shared hosting exceed 12-25s on first byte but do
  // eventually respond — and falsely marking them "unreachable" hides
  // genuinely high-value leads from the operator.
  if (!res && /ABORT|TIMEOUT|ETIMEDOUT/i.test(lastError)) {
    const retryCtrl = new AbortController();
    const retryTimer = setTimeout(
      () => retryCtrl.abort(),
      FETCH_RETRY_TIMEOUT_MS,
    );
    try {
      const r = await tryFetch(
        variants[0],
        "GET",
        USER_AGENT,
        retryCtrl.signal,
      );
      if (!("error" in r)) {
        res = r;
        succeededWith = variants[0];
      } else {
        lastError = r.error;
      }
    } finally {
      clearTimeout(retryTimer);
    }
  }

  if (!res) {
    return unreachable(url.toString(), lastError, auditedAt);
  }
  // From here on, treat the variant that responded as our canonical URL so
  // the audit reflects what actually loaded (e.g. http://www.foo.com).
  url = succeededWith;
  const fetchMs = Date.now() - t0;

  const finalUrl = res.url || url.toString();
  const finalHost = (() => {
    try {
      return new URL(finalUrl).hostname;
    } catch {
      return url.hostname;
    }
  })();
  const redirectedAway =
    finalHost.replace(/^www\./, "") !== url.hostname.replace(/^www\./, "");

  if (!res.ok && (res.status >= 400 || res.status === 0)) {
    return unreachable(finalUrl, `http-${res.status}`, auditedAt, res.status);
  }

  const html = await res.text().catch(() => "");
  const lower = html.toLowerCase();
  const pageBytes = html.length;

  const issues: string[] = [];
  const https = url.protocol === "https:";
  if (!https) issues.push("site is not served over HTTPS");

  const hasMobileViewport =
    /<meta\s+[^>]*name=["']viewport["'][^>]*content=["'][^"']*width=device-width/i.test(
      html,
    );
  if (!hasMobileViewport) issues.push("missing mobile viewport meta");

  const hasCharsetMeta = /<meta\s+[^>]*charset=/i.test(html);
  if (!hasCharsetMeta) issues.push("missing charset meta");

  const hasOgTags = /<meta\s+[^>]*property=["']og:/i.test(html);

  // Copyright year
  const copyMatch =
    html.match(/©\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/) ??
    html.match(/copyright\s*(?:&copy;)?\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/i);
  const copyrightYear = copyMatch ? Number(copyMatch[1]) : null;
  const currentYear = new Date().getUTCFullYear();
  const copyrightAgeYears =
    copyrightYear && copyrightYear <= currentYear
      ? currentYear - copyrightYear
      : null;
  if (copyrightAgeYears !== null && copyrightAgeYears >= 3) {
    issues.push(
      `copyright year is ${copyrightYear} (${copyrightAgeYears}y old)`,
    );
  }

  // Last-Modified
  const lastModifiedHeader = res.headers.get("last-modified");
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
  if (lower.includes("wp-content/") || lower.includes("wp-includes/"))
    technologies.push("wordpress");
  if (lower.includes("shopify")) technologies.push("shopify");
  if (lower.includes("squarespace")) technologies.push("squarespace");
  if (lower.includes("wix.com")) technologies.push("wix");
  if (lower.includes("webflow")) technologies.push("webflow");
  if (lower.includes("next.js") || lower.includes("/_next/"))
    technologies.push("nextjs");
  if (lower.includes("data-reactroot") || lower.includes("__react"))
    technologies.push("react");
  if (lower.includes("bootstrap.min.css")) technologies.push("bootstrap");
  if (lower.includes("jquery-1.") || lower.includes("jquery-2.")) {
    technologies.push("legacy-jquery");
    issues.push("uses legacy jQuery (1.x/2.x)");
  }
  if (lower.includes("frameset")) {
    technologies.push("html-frames");
    issues.push("uses HTML <frameset> (1990s)");
  }
  if (lower.includes("flash") && lower.includes(".swf")) {
    technologies.push("flash");
    issues.push("embeds Adobe Flash");
  }

  // Parked / under construction heuristics
  const parkedHints =
    /(domain (is )?for sale|coming soon|under construction|website expired|this site is parked|godaddy parked)/i;
  const parked = parkedHints.test(html) && pageBytes < 30_000;
  if (parked) issues.push("appears to be a parked/placeholder page");

  // Speed: TTFB > 5s = slow website (a real lead-quality signal).
  if (fetchMs >= 5000)
    issues.push(`slow website (${(fetchMs / 1000).toFixed(1)}s to first byte)`);

  // SEO basics
  const titleMatch = html.match(/<title[^>]*>([^<]{2,})<\/title>/i);
  const hasTitle = !!titleMatch;
  const titleText = titleMatch ? titleMatch[1].trim().slice(0, 200) : null;
  const metaDescMatch =
    html.match(
      /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']{10,})["']/i,
    ) ??
    html.match(
      /<meta\s+[^>]*content=["']([^"']{10,})["'][^>]*name=["']description["']/i,
    );
  const hasMetaDescription = !!metaDescMatch;
  const metaDescriptionText = metaDescMatch
    ? metaDescMatch[1].trim().slice(0, 500)
    : null;
  const hasH1 = /<h1[\s>]/i.test(html);
  const hasSeoBasics = hasTitle && hasMetaDescription && hasH1;
  if (!hasTitle) issues.push("missing <title> tag");
  if (!hasMetaDescription) issues.push("missing meta description");
  if (!hasH1) issues.push("missing <h1> tag");

  // Contact form: any <form> + an email input or "contact" hint nearby.
  const hasFormTag = /<form[\s>]/i.test(html);
  const hasEmailInput = /<input\s+[^>]*type=["']email["']/i.test(html);
  const hasContactHint =
    /(contact[ -]?(us|form)|get in touch|send (us )?a message)/i.test(html);
  const hasMailto = /href=["']mailto:/i.test(html);
  const hasContactForm =
    (hasFormTag && (hasEmailInput || hasContactHint)) || hasMailto;
  if (!hasContactForm) issues.push("no contact form / mailto link");

  // Booking form: external scheduler link or in-page form labelled as such.
  const bookingHosts =
    /(calendly\.com|cal\.com|squareup\.com\/(appointments|book)|setmore\.com|acuityscheduling\.com|booksy\.com|fresha\.com|opentable\.com|simplybook\.me|10to8\.com|tockify\.com)/i;
  const bookingHints =
    /(book (now|online|an? appointment)|reserve a table|schedule (a )?(consultation|appointment|call|visit))/i;
  const hasBookingForm = bookingHosts.test(html) || bookingHints.test(html);
  if (!hasBookingForm)
    issues.push("no online booking / scheduling integration");

  // Social presence
  const fbMatch = html.match(
    /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9._%-]+(?:\/[A-Za-z0-9._%-]*)?/i,
  );
  const igMatch = html.match(
    /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._%-]+\/?/i,
  );
  const facebookUrl = fbMatch ? fbMatch[0] : null;
  const instagramUrl = igMatch ? igMatch[0] : null;

  // ----- Conversion-oriented signals (for Website Intel module) -----
  const waMatch = html.match(
    /https?:\/\/(?:wa\.me\/\d+|api\.whatsapp\.com\/send\?[^"'<>\s]*|chat\.whatsapp\.com\/[A-Za-z0-9]+)/i,
  );
  const whatsappLink = waMatch ? waMatch[0] : null;

  const telLinks = html.match(/href\s*=\s*["']tel:[^"']+["']/gi) || [];
  const telLinkCount = telLinks.length;
  const clickToCall = telLinkCount > 0;

  const hasTestimonials =
    /testimonial|what (?:our )?clients say|customer stories|happy customers|client reviews|hear from our|5[\s-]star/i.test(
      html,
    );

  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  const imageCount = imgTags.length;
  const hasGallery =
    imageCount >= 8 ||
    /\b(gallery|portfolio|our work|case stud(?:y|ies)|before[\s-]?(?:and|&)[\s-]?after)\b/i.test(
      html,
    );

  const hasPricing =
    /\b(pricing|our packages|price list|starting at|starts? from|book a (?:plan|package))\b/i.test(
      html,
    ) || /(?:\$|₹|€|£)\s?\d{2,}(?:[.,]\d{2})?\b/.test(html);

  const servicePathMatches =
    html.match(
      /href\s*=\s*["'][^"']*\/(?:services?|treatments?|products?|menu|offerings?)\/[^"']*["']/gi,
    ) || [];
  const hasServicePages =
    new Set(servicePathMatches.map((s) => s.toLowerCase())).size >= 2;

  const hasTrustBadges =
    /(google[\s-]partner|trustpilot|bbb\.org|better business bureau|verified business|accredited|iso\s?\d{4}|yelp[\s-]?(verified|elite))/i.test(
      html,
    );

  // form with input[type=email] within ~600 chars window
  const hasLeadCaptureForm =
    /<form\b[\s\S]{0,1500}?<input[^>]+type\s*=\s*["']email["'][\s\S]{0,1500}?<\/form>/i.test(
      html,
    );

  // CTA count: anchors / buttons whose visible text matches an action verb
  const ctaTexts =
    html.match(/<(?:a|button)\b[^>]*>([^<]{1,60})<\/(?:a|button)>/gi) || [];
  const ctaPattern =
    /\b(book(?:\s+now)?|call(?:\s+us)?|get\s+(?:started|a\s+quote|in\s+touch)|contact(?:\s+us)?|sign\s+up|request|schedule|reserve|order(?:\s+now)?|buy(?:\s+now)?|enroll|subscribe|register|claim|try\s+free)\b/i;
  const ctaCount = ctaTexts.filter((t) => ctaPattern.test(t)).length;

  // §9.2 — Schema markup (JSON-LD or microdata)
  const hasSchemaMarkup =
    /<script[^>]+type=["']application\/ld\+json["']/i.test(html) ||
    /\bitemscope\b/i.test(html) ||
    /\bitemtype=["']https?:\/\/schema\.org/i.test(html);

  // §9.2 — Analytics snippet (GA4, GTM, Plausible, Matomo, HotJar, Segment, Mixpanel)
  const hasAnalytics =
    /googletagmanager\.com\/gtm\.js|gtag\s*\(|ga\s*\(|analytics\.js|plausible\.io|matomo\.org|hotjar\.com|segment\.com\/analytics|cdn\.mxpnl\.com/i.test(
      html,
    );

  // §9.2 — Google Maps embed (iframe or Maps JS API)
  const hasGoogleMapsEmbed =
    /maps\.googleapis\.com\/maps\/api|maps\.google\.com\/maps\?|google\.com\/maps\/embed/i.test(
      html,
    );

  // §9.2 — Navigation element (<nav> or role="navigation")
  const hasNavigation =
    /<nav[\s>]/i.test(html) ||
    /role=["']navigation["']/i.test(html) ||
    /<ul[^>]*(?:class|id)=["'][^"']*(nav|menu|navigation)[^"']*["']/i.test(
      html,
    );

  // §9.2 — Basic accessibility signals (aria-label, alt text usage, role attrs)
  const altImgCount = (html.match(/<img\b[^>]+alt=["'][^"']{2,}/gi) || [])
    .length;
  const hasAccessibility =
    (imageCount === 0 || altImgCount / imageCount >= 0.5) &&
    /\baria-(?:label|describedby|hidden|live|role)\b/i.test(html);

  // §9.2 — Heading structure (h2 or h3 present in addition to h1)
  const hasHeadingStructure = /<h[23][\s>]/i.test(html) && hasH1;

  // Page weight is a weak signal — only flag if extremely small.
  if (pageBytes < 500) issues.push(`tiny response (${pageBytes} bytes)`);

  // ----- Scoring -----
  let healthScore = 100;
  if (!https) healthScore -= 15;
  if (!hasMobileViewport) healthScore -= 25;
  if (!hasCharsetMeta) healthScore -= 5;
  if (!hasOgTags) healthScore -= 5;
  if (fetchMs >= 8000) healthScore -= 15;
  else if (fetchMs >= 5000) healthScore -= 8;
  if (!hasTitle) healthScore -= 6;
  if (!hasMetaDescription) healthScore -= 6;
  if (!hasH1) healthScore -= 4;
  if (!hasContactForm) healthScore -= 8;
  if (copyrightAgeYears !== null) {
    if (copyrightAgeYears >= 5) healthScore -= 25;
    else if (copyrightAgeYears >= 3) healthScore -= 15;
    else if (copyrightAgeYears >= 2) healthScore -= 5;
  }
  if (lastModifiedAgeDays !== null) {
    if (lastModifiedAgeDays >= 730) healthScore -= 15;
    else if (lastModifiedAgeDays >= 365) healthScore -= 8;
  }
  if (technologies.includes("legacy-jquery")) healthScore -= 10;
  if (technologies.includes("html-frames")) healthScore -= 30;
  if (technologies.includes("flash")) healthScore -= 30;
  if (
    technologies.includes("wix") ||
    technologies.includes("squarespace") ||
    technologies.includes("webflow")
  ) {
    healthScore += 5; // hosted builders → typically maintained
  }
  if (technologies.includes("nextjs") || technologies.includes("react"))
    healthScore += 5;
  if (parked) healthScore -= 60;
  if (redirectedAway) healthScore -= 5;

  healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

  let health: WebsiteHealth;
  if (parked) health = WebsiteHealth.UNREACHABLE;
  else if (healthScore >= 75) health = WebsiteHealth.FRESH;
  else if (healthScore >= 50) health = WebsiteHealth.NEEDS_REVIEW;
  else health = WebsiteHealth.OUTDATED;

  // ----- Categorized findings (what we'd pitch to the prospect) -----
  const categories = buildCategories({
    https,
    hasMobileViewport,
    fetchMs,
    pageBytes,
    hasTitle,
    hasMetaDescription,
    hasH1,
    hasOgTags,
    hasContactForm,
    hasBookingForm,
    copyrightAgeYears,
    lastModifiedAgeDays,
    technologies,
    parked,
    redirectedAway,
    hasFacebook: !!facebookUrl,
    hasInstagram: !!instagramUrl,
    hasSchemaMarkup,
    hasAnalytics,
    hasGoogleMapsEmbed,
    hasNavigation,
    hasAccessibility,
    hasHeadingStructure,
    ctaCount,
  });

  const outreachFit = decideOutreachFit({
    reachable: true,
    parked,
    healthScore,
    categories,
  });

  // ----- External / paid APIs (feature-flagged) -----
  // Run sequentially with short timeouts so an outage of one paid API can't
  // stall the audit. Each provider returns null when its key is not set.
  let pageSpeed: WebsiteAuditResult["pageSpeed"] = null;
  let builtWith: WebsiteAuditResult["builtWith"] = null;
  try {
    if (pageSpeedProvider.available()) {
      const ps = await pageSpeedProvider.run(finalUrl ?? url.toString());
      if (ps) {
        pageSpeed = {
          performance: ps.performance,
          accessibility: ps.accessibility,
          bestPractices: ps.bestPractices,
          seo: ps.seo,
          lcpSeconds: ps.lcpSeconds,
          cls: ps.cls,
          inpMs: ps.inpMs,
          passedCoreWebVitals: ps.passedCoreWebVitals,
        };
        // Fold real Lighthouse perf into our health score (most authoritative).
        if (typeof ps.performance === "number") {
          if (ps.performance < 50) {
            healthScore = Math.max(0, healthScore - 15);
            issues.push(
              `PageSpeed performance ${ps.performance}/100 (below 50)`,
            );
          } else if (ps.performance < 75) {
            healthScore = Math.max(0, healthScore - 8);
            issues.push(
              `PageSpeed performance ${ps.performance}/100 (below 75)`,
            );
          }
        }
      }
    }
  } catch {
    // swallow — paid API must never crash the audit
  }
  try {
    if (builtWithProvider.available()) {
      const host = url.hostname;
      const bw = await builtWithProvider.run(host);
      if (bw) {
        builtWith = {
          technologies: bw.technologies,
          cms: bw.cms,
          ecommerce: bw.ecommerce,
          analytics: bw.analytics,
        };
        // Merge BuiltWith techs into our heuristic list (deduped).
        for (const t of bw.technologies) {
          if (!technologies.includes(t)) technologies.push(t);
        }
      }
    }
  } catch {
    // swallow
  }

  // Re-clamp after PageSpeed adjustments, and re-derive health bucket.
  healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));
  if (parked) health = WebsiteHealth.UNREACHABLE;
  else if (healthScore >= 75) health = WebsiteHealth.FRESH;
  else if (healthScore >= 50) health = WebsiteHealth.NEEDS_REVIEW;
  else health = WebsiteHealth.OUTDATED;

  // §9.1 — derive classification (needs a partial result shape; built inline)
  const partialResult = {
    reachable: true,
    health,
    healthScore,
    httpStatus: res.status,
    signals: {
      https,
      hasMobileViewport,
      technologies,
      copyrightAgeYears,
    },
    categories,
  } as unknown as WebsiteAuditResult;
  const websiteClassification = deriveWebsiteClassification(
    true,
    partialResult,
  );

  return {
    url: url.toString(),
    finalUrl,
    httpStatus: res.status,
    reachable: true,
    health,
    healthScore,
    websiteClassification,
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
      redirectedAway,
      fetchMs,
      hasContactForm,
      hasBookingForm,
      hasSeoBasics,
      hasTitle,
      hasMetaDescription,
      hasH1,
      titleText,
      metaDescriptionText,
      facebookUrl,
      instagramUrl,
      whatsappLink,
      clickToCall,
      telLinkCount,
      hasTestimonials,
      hasGallery,
      hasPricing,
      hasServicePages,
      hasTrustBadges,
      hasLeadCaptureForm,
      ctaCount,
      imageCount,
      hasSchemaMarkup,
      hasAnalytics,
      hasGoogleMapsEmbed,
      hasNavigation,
      hasAccessibility,
      hasHeadingStructure,
    },
    issues,
    categories,
    outreachFit,
    pageSpeed,
    builtWith,
    auditedAt,
  };
}

function unreachable(
  rawUrl: string,
  reason: string,
  auditedAt: string,
  status: number | null = null,
): WebsiteAuditResult {
  // Attribute the failure to the most relevant category so the report says
  // *why* (DNS, TLS, timeout, 5xx) instead of a generic "site unreachable".
  const r = (reason ?? "").toUpperCase();
  const isDns = /ENOTFOUND|EAI_AGAIN|EAI_NODATA|DNS/.test(r);
  const isRefused = /ECONNREFUSED|ECONNRESET|EPIPE/.test(r);
  const isTls =
    /ERR_TLS|UNABLE_TO_VERIFY|CERT_|SSL/.test(r) || /\bTLS\b/.test(r);
  const isTimeout = /ABORT|TIMEOUT|ETIMEDOUT/.test(r);
  const isHttp = /^HTTP-\d{3}$/.test(r);

  const headline = isDns
    ? "domain does not resolve (DNS lookup failed)"
    : isTls
      ? "HTTPS handshake failed (expired or misconfigured certificate)"
      : isRefused
        ? "server refused the connection"
        : isTimeout
          ? `no response within ${Math.round(FETCH_RETRY_TIMEOUT_MS / 1000)}s (timed out — site may be slow or temporarily down)`
          : isHttp
            ? `server responded ${r.replace("HTTP-", "")} (likely down or blocked)`
            : `unreachable: ${reason || "fetch failed"}`;

  const skipMsg = isDns
    ? "cannot evaluate — domain does not resolve"
    : isTls
      ? "cannot evaluate — site is unreachable over HTTPS"
      : isTimeout
        ? "cannot evaluate — site did not respond in time"
        : "cannot evaluate — site is unreachable";

  const cat = (label: string, finding: string): WebsiteAuditCategory => ({
    status: "fail",
    label,
    findings: [finding],
  });
  // We genuinely couldn't measure these — mark them 'skipped' so the report
  // doesn't accuse the business of failing things our crawler didn't observe.
  const skip = (label: string): WebsiteAuditCategory => ({
    status: "skipped",
    label,
    findings: [skipMsg],
  });

  const securityFinding = isTls
    ? "HTTPS certificate problem (expired, self-signed, or wrong host)"
    : !rawUrl.startsWith("https:")
      ? "served over plain HTTP — modernize with HTTPS"
      : isDns
        ? "domain does not resolve — site appears offline"
        : "no HTTPS response from the server";

  const businessFinding = isDns
    ? "domain does not resolve — likely abandoned or misregistered"
    : isHttp
      ? "server returns an error — site is effectively offline"
      : "cannot evaluate — site is unreachable";

  // For pure timeouts we genuinely don't know whether the site is fast/slow,
  // present, or secure — only that *our* crawler couldn't reach it. Mark
  // those as 'skipped' instead of 'fail' so the user can re-run the audit.
  // DNS / TLS / HTTP-error / refused-connection are real signals → 'fail'.
  const performanceCategory: WebsiteAuditCategory = isTimeout
    ? skip("Performance & reliability")
    : cat("Performance & reliability", headline);
  const securityCategory: WebsiteAuditCategory =
    isTimeout && rawUrl.startsWith("https:")
      ? skip("Security (HTTPS)")
      : cat("Security (HTTPS)", securityFinding);
  const businessCategory: WebsiteAuditCategory = isTimeout
    ? skip("Business presence")
    : cat("Business presence", businessFinding);

  const categories = {
    design: skip("Design & content freshness"),
    mobile: skip("Mobile responsiveness"),
    performance: performanceCategory,
    seo: skip("SEO basics"),
    contact: skip("Contact & conversion"),
    security: securityCategory,
    business: businessCategory,
  };
  return {
    url: rawUrl,
    finalUrl: null,
    httpStatus: status,
    reachable: false,
    health: WebsiteHealth.UNREACHABLE,
    healthScore: 0,
    websiteClassification: isTls
      ? WebsiteClassification.TECHNICAL_ISSUES
      : WebsiteClassification.NOT_LOADING,
    signals: {
      https: rawUrl.startsWith("https:"),
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
      redirectedAway: false,
      fetchMs: 0,
      hasContactForm: false,
      hasBookingForm: false,
      hasSeoBasics: false,
      hasTitle: false,
      hasMetaDescription: false,
      hasH1: false,
      titleText: null,
      metaDescriptionText: null,
      facebookUrl: null,
      instagramUrl: null,
      whatsappLink: null,
      clickToCall: false,
      telLinkCount: 0,
      hasTestimonials: false,
      hasGallery: false,
      hasPricing: false,
      hasServicePages: false,
      hasTrustBadges: false,
      hasLeadCaptureForm: false,
      ctaCount: 0,
      imageCount: 0,
      hasSchemaMarkup: false,
      hasAnalytics: false,
      hasGoogleMapsEmbed: false,
      hasNavigation: false,
      hasAccessibility: false,
      hasHeadingStructure: false,
    },
    issues: [headline],
    categories,
    outreachFit: {
      suitable: true,
      reason: isDns
        ? 'Domain does not resolve — strong opening for a "we can rebuild & host your site" pitch.'
        : isTls
          ? "HTTPS is broken — easy quick-win pitch (renew cert + modernize)."
          : 'Website is unreachable — strong opening for a "we can rebuild & host your site" pitch.',
      opportunityScore: 95,
    },
    pageSpeed: null,
    builtWith: null,
    auditedAt,
  };
}

interface CategoryInputs {
  https: boolean;
  hasMobileViewport: boolean;
  fetchMs: number;
  pageBytes: number;
  hasTitle: boolean;
  hasMetaDescription: boolean;
  hasH1: boolean;
  hasOgTags: boolean;
  hasContactForm: boolean;
  hasBookingForm: boolean;
  copyrightAgeYears: number | null;
  lastModifiedAgeDays: number | null;
  technologies: string[];
  parked: boolean;
  redirectedAway: boolean;
  hasFacebook: boolean;
  hasInstagram: boolean;
  // §9.2 additions
  hasSchemaMarkup: boolean;
  hasAnalytics: boolean;
  hasGoogleMapsEmbed: boolean;
  hasNavigation: boolean;
  hasAccessibility: boolean;
  hasHeadingStructure: boolean;
  ctaCount: number;
}

function buildCategories(s: CategoryInputs): WebsiteAuditResult["categories"] {
  const cat = (
    label: string,
    findings: Array<{ ok: boolean; severity?: "warn" | "fail"; msg: string }>,
  ): WebsiteAuditCategory => {
    const failures = findings.filter((f) => !f.ok);
    const hasFail = failures.some((f) => (f.severity ?? "fail") === "fail");
    const hasWarn = failures.some((f) => f.severity === "warn");
    const status: WebsiteAuditCategory["status"] = hasFail
      ? "fail"
      : hasWarn
        ? "warn"
        : "pass";
    return { label, status, findings: failures.map((f) => f.msg) };
  };

  // Design & content freshness
  const design = cat("Design & content freshness", [
    {
      ok: s.copyrightAgeYears === null || s.copyrightAgeYears < 3,
      severity:
        s.copyrightAgeYears !== null && s.copyrightAgeYears >= 5
          ? "fail"
          : "warn",
      msg:
        s.copyrightAgeYears !== null
          ? `copyright is ${s.copyrightAgeYears} year(s) old — site looks neglected`
          : "",
    },
    {
      ok: s.lastModifiedAgeDays === null || s.lastModifiedAgeDays < 365,
      severity: "warn",
      msg: s.lastModifiedAgeDays
        ? `homepage last modified ${s.lastModifiedAgeDays} day(s) ago`
        : "",
    },
    {
      ok: !s.technologies.includes("legacy-jquery"),
      severity: "warn",
      msg: "uses outdated jQuery 1.x/2.x",
    },
    {
      ok: !s.technologies.includes("html-frames"),
      msg: "built on 1990s HTML framesets",
    },
    {
      ok: !s.technologies.includes("flash"),
      msg: "embeds Adobe Flash content",
    },
    {
      ok: !s.parked,
      msg: "looks like a parked / placeholder page",
    },
  ]);

  // Mobile responsiveness
  const mobile = cat("Mobile responsiveness", [
    {
      ok: s.hasMobileViewport,
      msg: "no mobile viewport meta — won't scale on phones",
    },
  ]);

  // Performance & reliability
  const performance = cat("Performance & loading speed", [
    {
      ok: s.fetchMs < 5000,
      severity: s.fetchMs >= 8000 ? "fail" : "warn",
      msg: `slow first byte (${(s.fetchMs / 1000).toFixed(1)}s)`,
    },
    {
      ok: s.pageBytes >= 500,
      msg: `tiny response (${s.pageBytes} bytes) — page may be broken`,
    },
    {
      ok: !s.redirectedAway,
      severity: "warn",
      msg: "redirects to a different domain",
    },
  ]);

  // SEO basics
  const seo = cat("SEO basics", [
    { ok: s.hasTitle, msg: "missing <title> tag" },
    { ok: s.hasMetaDescription, msg: "missing meta description" },
    { ok: s.hasH1, msg: "missing <h1> heading" },
    {
      ok: s.hasOgTags,
      severity: "warn",
      msg: "no Open Graph tags — poor link previews",
    },
    {
      ok: s.hasSchemaMarkup,
      severity: "warn",
      msg: "no schema.org markup — limits rich results in Google",
    },
    {
      ok: s.hasHeadingStructure,
      severity: "warn",
      msg: "poor heading hierarchy (h2/h3 missing)",
    },
  ]);

  // Contact & conversion
  const contact = cat("Contact & conversion options", [
    {
      ok: s.hasContactForm,
      msg: "no contact form / mailto link — visitors can't reach the business",
    },
    {
      ok: s.hasBookingForm,
      severity: "warn",
      msg: "no online booking / scheduling — losing after-hours leads",
    },
    {
      ok: s.ctaCount > 0,
      severity: "warn",
      msg: "no call-to-action buttons detected",
    },
  ]);

  // Security
  const security = cat("Security (HTTPS)", [
    { ok: s.https, msg: "served over plain HTTP — browsers warn visitors" },
  ]);

  // Business presence
  const business = cat("Business / social presence", [
    {
      ok: s.hasFacebook || s.hasInstagram,
      severity: "warn",
      msg: "no Facebook/Instagram link found on site",
    },
    {
      ok: s.hasAnalytics,
      severity: "warn",
      msg: "no analytics tracking detected — owner can’t measure traffic",
    },
    {
      ok: s.hasGoogleMapsEmbed,
      severity: "warn",
      msg: "no Google Maps embed — local customers may struggle to find them",
    },
    {
      ok: s.hasNavigation,
      severity: "warn",
      msg: "no navigation landmark detected — poor site structure",
    },
    {
      ok: s.hasAccessibility,
      severity: "warn",
      msg: "accessibility signals missing (alt text, ARIA) — excludes users with disabilities",
    },
  ]);

  return { design, mobile, performance, seo, contact, security, business };
}

function decideOutreachFit(input: {
  reachable: boolean;
  parked: boolean;
  healthScore: number;
  categories: WebsiteAuditResult["categories"];
}): WebsiteAuditResult["outreachFit"] {
  const cats = Object.values(input.categories);
  const failCount = cats.filter((c) => c.status === "fail").length;
  const warnCount = cats.filter((c) => c.status === "warn").length;

  // Higher = more room to improve = better outreach fit.
  const opportunityScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(100 - input.healthScore + failCount * 5 + warnCount * 2),
    ),
  );

  if (input.parked) {
    return {
      suitable: true,
      reason: "Domain is parked — they need a real site built.",
      opportunityScore: 95,
    };
  }

  // Healthy site with no failures → not worth pitching a rebuild.
  if (failCount === 0 && warnCount <= 1 && input.healthScore >= 80) {
    return {
      suitable: false,
      reason:
        "Website meets modern standards (HTTPS, mobile, SEO, contact). Skip — low pitch value.",
      opportunityScore,
    };
  }

  if (failCount >= 3 || input.healthScore < 50) {
    return {
      suitable: true,
      reason: `Multiple critical gaps (${failCount} failing categor${failCount === 1 ? "y" : "ies"}). Strong fit for a website redesign pitch.`,
      opportunityScore,
    };
  }

  if (failCount >= 1 || warnCount >= 2) {
    return {
      suitable: true,
      reason:
        "Targeted improvements available. Lead the pitch with the failing category.",
      opportunityScore,
    };
  }

  return {
    suitable: false,
    reason: "Site is in reasonable shape — limited proposal value.",
    opportunityScore,
  };
}

/**
 * §9.1 — Derive the human-readable WebsiteClassification from an audit result
 * and whether the lead had a website URL on record.
 */
function deriveWebsiteClassification(
  hasWebsiteUrl: boolean,
  result: WebsiteAuditResult,
): WebsiteClassification {
  if (!hasWebsiteUrl) return WebsiteClassification.NO_WEBSITE;

  if (!result.reachable) {
    const sig = result.signals;
    // Bot-blocked / TLS failure / hard timeout counts as technical issues, not
    // simply "not loading".
    if (!sig.https || sig.technologies.includes("flash")) {
      return WebsiteClassification.TECHNICAL_ISSUES;
    }
    return WebsiteClassification.NOT_LOADING;
  }

  const s = result.signals;

  // Technical issues: no HTTPS, Flash, or heavy staleness + missing basics
  if (
    !s.https ||
    s.technologies.includes("flash") ||
    s.technologies.includes("html-frames") ||
    (result.httpStatus !== null && result.httpStatus >= 500)
  ) {
    return WebsiteClassification.TECHNICAL_ISSUES;
  }

  const score = result.healthScore;

  // Modern: high score + mobile + HTTPS
  if (score >= 75 && s.hasMobileViewport && s.https) {
    return WebsiteClassification.MODERN;
  }

  // Outdated: very low score or multiple staleness signals
  if (
    score < 35 ||
    (s.copyrightAgeYears !== null && s.copyrightAgeYears >= 5) ||
    s.technologies.includes("legacy-jquery")
  ) {
    return WebsiteClassification.OUTDATED;
  }

  // Needs redesign: multiple fail categories
  const failCount = Object.values(result.categories).filter(
    (c) => c.status === "fail",
  ).length;
  if (failCount >= 3 || (!s.hasMobileViewport && score < 55)) {
    return WebsiteClassification.NEEDS_REDESIGN;
  }

  return WebsiteClassification.WEBSITE_FOUND;
}

/** BullMQ handler for the `enrich.website` job. */
export async function runWebsiteEnrichment(job: EnrichmentJob): Promise<void> {
  const log = logger.child({
    job: "enrich.website",
    leadId: job.leadId,
    enrichmentId: job.enrichmentId,
  });

  await withOrg(job.organizationId, (tx) =>
    tx.enrichment.update({
      where: { id: job.enrichmentId },
      data: {
        status: EnrichmentStatus.RUNNING,
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    }),
  );

  let lead;
  try {
    lead = await withOrg(job.organizationId, (tx) =>
      tx.lead.findUnique({
        where: { id: job.leadId },
        select: {
          id: true,
          website: true,
          name: true,
          categoryPrimary: true,
          categories: true,
          reviewCount: true,
          rating: true,
        },
      }),
    );
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      "failed to load lead",
    );
    throw err;
  }

  if (!lead?.website) {
    log.info("lead has no website; skipping");
    await withOrg(job.organizationId, (tx) =>
      tx.enrichment.update({
        where: { id: job.enrichmentId },
        data: { status: EnrichmentStatus.SKIPPED, finishedAt: new Date() },
      }),
    );
    return;
  }

  const result = await auditWebsite(lead.website);
  log.info(
    {
      health: result.health,
      score: result.healthScore,
      issues: result.issues.length,
    },
    "website audited",
  );

  const pitch = getServicePitch({
    websiteHealth: result.health,
    hasWebsite: result.reachable,
    hasMobileViewport: result.signals.hasMobileViewport,
    hasContactForm: result.signals.hasContactForm,
    hasBookingForm: result.signals.hasBookingForm,
    hasSeoBasics: result.signals.hasSeoBasics,
    hasFacebook: !!result.signals.facebookUrl,
    hasInstagram: !!result.signals.instagramUrl,
  });

  // Refine the business-scale classification with fresh audit signals.
  const classification = classifyBusinessScale({
    name: lead.name,
    categoryPrimary: lead.categoryPrimary,
    categories: lead.categories,
    reviewCount: lead.reviewCount,
    rating: lead.rating,
    hasWebsite: result.reachable,
    websiteHealthScore: result.healthScore,
    technologies: result.signals.technologies,
    hasSeoBasics: result.signals.hasSeoBasics,
    hasOgTags: result.signals.hasOgTags,
    pageBytes: result.signals.pageBytes,
    hasFacebook: !!result.signals.facebookUrl,
    hasInstagram: !!result.signals.instagramUrl,
  });

  await withOrg(job.organizationId, async (tx) => {
    await tx.lead.update({
      where: { id: job.leadId },
      data: {
        websiteHealth: result.health,
        websiteHealthScore: result.healthScore,
        websiteAudit: result as unknown as object,
        websiteAuditedAt: new Date(),
        lastEnrichedAt: new Date(),
        facebookUrl: result.signals.facebookUrl ?? undefined,
        instagramUrl: result.signals.instagramUrl ?? undefined,
        servicePitch: pitch,
        businessScale: classification.scale,
        businessScaleConfidence: classification.confidence,
        businessScaleSignals: classification as unknown as object,
        // §8.1 — deduplicated tech stack from heuristics + BuiltWith
        techStack: result.signals.technologies,
        // §8.1 — SEO metadata extracted from page HTML
        seoTitle: result.signals.titleText ?? undefined,
        seoDescription: result.signals.metaDescriptionText ?? undefined,
        // §8.1 — mobile viewport + contact form presence
        isMobileReady: result.signals.hasMobileViewport,
        hasContactForm: result.signals.hasContactForm,
        // §9.2 — extended audit boolean signals
        hasSeoBasics: result.signals.hasSeoBasics,
        hasSchemaMarkup: result.signals.hasSchemaMarkup,
        hasAnalytics: result.signals.hasAnalytics,
        hasBookingForm: result.signals.hasBookingForm,
        hasLeadCaptureForm: result.signals.hasLeadCaptureForm,
        // §9.1 — 7-state classification
        websiteClassification: result.websiteClassification,
      },
    });
    await tx.enrichment.update({
      where: { id: job.enrichmentId },
      data: {
        status: EnrichmentStatus.SUCCEEDED,
        finishedAt: new Date(),
        normalized: result as unknown as object,
      },
    });
  });

  // Re-score so the priorityTier reflects the fresh audit.
  await scoringQueue().add(JobName.SCORE_LEAD, {
    organizationId: job.organizationId,
    leadId: job.leadId,
    rulesetVersion: "v1.0.0",
  });
}

export const _testing = { auditWebsite };

// Silence unused-import lint when only types are referenced.
void EnrichmentKind;
