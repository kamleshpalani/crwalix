/**
 * External "growth" providers — paid SaaS APIs that supplement Google Places
 * & the in-house auditor. Every provider here follows the same contract:
 *
 *   • `available()` → returns false when the env key is missing. Callers should
 *     treat the provider as feature-flag-off and degrade gracefully.
 *   • `run(...)` → returns a typed result object on success, OR `null` when
 *     the API key is missing / API call failed. NEVER throws to callers; logs
 *     and swallows errors so a paid-API outage cannot bring down the worker.
 *
 * This file is intentionally a thin transport layer. Business logic (mixing
 * results into audits / intel reports / scoring) lives in the worker
 * pipelines, not here.
 */

const UA = "Crawlix/1.0 (+https://crawlix.app)";
const DEFAULT_TIMEOUT_MS = 15_000;

async function safeFetch(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => ctrl.abort(),
    init?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "User-Agent": UA, ...(init?.headers ?? {}) },
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function envKey(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : null;
}

// ---------------------------------------------------------------------------
// PageSpeed Insights (Google) — free with API key
// https://developers.google.com/speed/docs/insights/v5/get-started
// ---------------------------------------------------------------------------

export interface PageSpeedResult {
  /** 0..100 — Lighthouse performance score (mobile strategy). */
  performance: number | null;
  /** 0..100 — accessibility. */
  accessibility: number | null;
  /** 0..100 — best practices. */
  bestPractices: number | null;
  /** 0..100 — SEO. */
  seo: number | null;
  /** Largest Contentful Paint (seconds). */
  lcpSeconds: number | null;
  /** Cumulative Layout Shift. */
  cls: number | null;
  /** First Input Delay / Interaction to Next Paint (ms). */
  inpMs: number | null;
  /** Whether any Core Web Vitals threshold passed. */
  passedCoreWebVitals: boolean | null;
  fetchedAt: string;
}

export const pageSpeedProvider = {
  id: "pagespeed",
  name: "PageSpeed Insights",
  available(): boolean {
    return !!envKey("PAGESPEED_API_KEY") || !!envKey("GOOGLE_API_KEY");
  },
  async run(url: string): Promise<PageSpeedResult | null> {
    const key = envKey("PAGESPEED_API_KEY") ?? envKey("GOOGLE_API_KEY");
    if (!key) return null;
    const params = new URLSearchParams({
      url,
      key,
      strategy: "mobile",
    });
    for (const cat of [
      "performance",
      "accessibility",
      "best-practices",
      "seo",
    ]) {
      params.append("category", cat);
    }
    const res = await safeFetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
      { timeoutMs: 30_000 },
    );
    if (!res || !res.ok) return null;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return null;
    }
    const data = json as {
      lighthouseResult?: {
        categories?: Record<string, { score?: number }>;
        audits?: Record<
          string,
          { numericValue?: number; displayValue?: string }
        >;
      };
      loadingExperience?: { overall_category?: string };
    };
    const cats = data.lighthouseResult?.categories ?? {};
    const audits = data.lighthouseResult?.audits ?? {};
    const pct = (s?: number): number | null =>
      typeof s === "number" ? Math.round(s * 100) : null;
    const lcp = audits["largest-contentful-paint"]?.numericValue;
    const cls = audits["cumulative-layout-shift"]?.numericValue;
    const inp =
      audits["interactive"]?.numericValue ??
      audits["total-blocking-time"]?.numericValue;
    return {
      performance: pct(cats["performance"]?.score),
      accessibility: pct(cats["accessibility"]?.score),
      bestPractices: pct(cats["best-practices"]?.score),
      seo: pct(cats["seo"]?.score),
      lcpSeconds:
        typeof lcp === "number" ? Math.round((lcp / 1000) * 10) / 10 : null,
      cls: typeof cls === "number" ? Math.round(cls * 1000) / 1000 : null,
      inpMs: typeof inp === "number" ? Math.round(inp) : null,
      passedCoreWebVitals: data.loadingExperience?.overall_category === "FAST",
      fetchedAt: new Date().toISOString(),
    };
  },
};

// ---------------------------------------------------------------------------
// BuiltWith — technology stack
// https://api.builtwith.com/free-api
// ---------------------------------------------------------------------------

export interface BuiltWithResult {
  /** Lower-cased tech tags (e.g. "wordpress", "shopify"). */
  technologies: string[];
  /** Detected CMS platform, if any. */
  cms: string | null;
  /** Detected ecommerce platform, if any. */
  ecommerce: string | null;
  /** Detected analytics tools (e.g. ["google-analytics", "facebook-pixel"]). */
  analytics: string[];
  fetchedAt: string;
}

export const builtWithProvider = {
  id: "builtwith",
  name: "BuiltWith",
  available(): boolean {
    return !!envKey("BUILTWITH_API_KEY");
  },
  async run(domain: string): Promise<BuiltWithResult | null> {
    const key = envKey("BUILTWITH_API_KEY");
    if (!key) return null;
    const cleanDomain = domain
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    const res = await safeFetch(
      `https://api.builtwith.com/free1/api.json?KEY=${encodeURIComponent(key)}&LOOKUP=${encodeURIComponent(cleanDomain)}`,
      { timeoutMs: 20_000 },
    );
    if (!res || !res.ok) return null;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return null;
    }
    const data = json as {
      groups?: { name?: string; categories?: { name?: string }[] }[];
    };
    const techs: string[] = [];
    const analytics: string[] = [];
    let cms: string | null = null;
    let ecommerce: string | null = null;
    for (const g of data.groups ?? []) {
      for (const c of g.categories ?? []) {
        if (!c.name) continue;
        const tag = c.name.toLowerCase().replace(/\s+/g, "-");
        techs.push(tag);
        if (
          !cms &&
          /wordpress|shopify|wix|squarespace|webflow|drupal|joomla|magento|ghost/.test(
            tag,
          )
        )
          cms = tag;
        if (
          !ecommerce &&
          /shopify|woocommerce|magento|bigcommerce|prestashop/.test(tag)
        )
          ecommerce = tag;
        if (/analytics|pixel|tag-manager|hotjar|mixpanel/.test(tag))
          analytics.push(tag);
      }
    }
    return {
      technologies: Array.from(new Set(techs)),
      cms,
      ecommerce,
      analytics: Array.from(new Set(analytics)),
      fetchedAt: new Date().toISOString(),
    };
  },
};

// ---------------------------------------------------------------------------
// Hunter — domain → emails / decision-makers
// https://hunter.io/api-documentation/v2
// ---------------------------------------------------------------------------

export interface ContactPerson {
  email: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  linkedin: string | null;
  /** 0..100 confidence. */
  confidence: number | null;
  source: string;
}

export interface DomainContactsResult {
  emails: ContactPerson[];
  primaryEmail: string | null;
  decisionMakerName: string | null;
  fetchedAt: string;
}

export const hunterProvider = {
  id: "hunter",
  name: "Hunter",
  available(): boolean {
    return !!envKey("HUNTER_API_KEY");
  },
  async run(domain: string): Promise<DomainContactsResult | null> {
    const key = envKey("HUNTER_API_KEY");
    if (!key) return null;
    const cleanDomain = domain
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    const res = await safeFetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(cleanDomain)}&api_key=${encodeURIComponent(key)}`,
      { timeoutMs: 20_000 },
    );
    if (!res || !res.ok) return null;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return null;
    }
    const data = json as {
      data?: {
        emails?: {
          value: string;
          first_name?: string;
          last_name?: string;
          position?: string;
          linkedin?: string;
          confidence?: number;
        }[];
      };
    };
    const raw = data.data?.emails ?? [];
    const emails: ContactPerson[] = raw.map((e) => ({
      email: e.value,
      firstName: e.first_name ?? null,
      lastName: e.last_name ?? null,
      position: e.position ?? null,
      linkedin: e.linkedin ?? null,
      confidence: e.confidence ?? null,
      source: "hunter",
    }));
    const decisionMaker =
      emails.find((e) =>
        /owner|ceo|founder|director|manager/i.test(e.position ?? ""),
      ) ?? emails[0];
    return {
      emails,
      primaryEmail: emails[0]?.email ?? null,
      decisionMakerName: decisionMaker
        ? [decisionMaker.firstName, decisionMaker.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() || null
        : null,
      fetchedAt: new Date().toISOString(),
    };
  },
};

// ---------------------------------------------------------------------------
// Apollo — domain → people search
// https://apolloio.github.io/apollo-api-docs/
// ---------------------------------------------------------------------------

export const apolloProvider = {
  id: "apollo",
  name: "Apollo",
  available(): boolean {
    return !!envKey("APOLLO_API_KEY");
  },
  async run(domain: string): Promise<DomainContactsResult | null> {
    const key = envKey("APOLLO_API_KEY");
    if (!key) return null;
    const cleanDomain = domain
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    const res = await safeFetch(
      "https://api.apollo.io/v1/mixed_people/search",
      {
        method: "POST",
        timeoutMs: 25_000,
        headers: { "Content-Type": "application/json", "X-Api-Key": key },
        body: JSON.stringify({
          q_organization_domains: cleanDomain,
          page: 1,
          per_page: 5,
          person_titles: ["owner", "founder", "ceo", "director", "manager"],
        }),
      },
    );
    if (!res || !res.ok) return null;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return null;
    }
    const data = json as {
      people?: {
        email?: string;
        first_name?: string;
        last_name?: string;
        title?: string;
        linkedin_url?: string;
      }[];
    };
    const emails: ContactPerson[] = (data.people ?? [])
      .filter((p) => !!p.email)
      .map((p) => ({
        email: p.email!,
        firstName: p.first_name ?? null,
        lastName: p.last_name ?? null,
        position: p.title ?? null,
        linkedin: p.linkedin_url ?? null,
        confidence: null,
        source: "apollo",
      }));
    return {
      emails,
      primaryEmail: emails[0]?.email ?? null,
      decisionMakerName: emails[0]
        ? [emails[0].firstName, emails[0].lastName]
            .filter(Boolean)
            .join(" ")
            .trim() || null
        : null,
      fetchedAt: new Date().toISOString(),
    };
  },
};

// ---------------------------------------------------------------------------
// Email verification — ZeroBounce / NeverBounce
// ---------------------------------------------------------------------------

export interface EmailVerificationResult {
  email: string;
  status: "valid" | "invalid" | "risky" | "unknown";
  reason: string | null;
  provider: "zerobounce" | "neverbounce";
  fetchedAt: string;
}

export const zeroBounceProvider = {
  id: "zerobounce",
  name: "ZeroBounce",
  available(): boolean {
    return !!envKey("ZEROBOUNCE_API_KEY");
  },
  async run(email: string): Promise<EmailVerificationResult | null> {
    const key = envKey("ZEROBOUNCE_API_KEY");
    if (!key) return null;
    const res = await safeFetch(
      `https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}`,
    );
    if (!res || !res.ok) return null;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return null;
    }
    const data = json as { status?: string; sub_status?: string };
    const map: Record<string, EmailVerificationResult["status"]> = {
      valid: "valid",
      invalid: "invalid",
      do_not_mail: "risky",
      "catch-all": "risky",
      unknown: "unknown",
      spamtrap: "risky",
      abuse: "risky",
    };
    return {
      email,
      status: map[data.status ?? "unknown"] ?? "unknown",
      reason: data.sub_status ?? null,
      provider: "zerobounce",
      fetchedAt: new Date().toISOString(),
    };
  },
};

export const neverBounceProvider = {
  id: "neverbounce",
  name: "NeverBounce",
  available(): boolean {
    return !!envKey("NEVERBOUNCE_API_KEY");
  },
  async run(email: string): Promise<EmailVerificationResult | null> {
    const key = envKey("NEVERBOUNCE_API_KEY");
    if (!key) return null;
    const res = await safeFetch(
      `https://api.neverbounce.com/v4/single/check?key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}`,
    );
    if (!res || !res.ok) return null;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return null;
    }
    const data = json as { result?: string; flags?: string[] };
    const map: Record<string, EmailVerificationResult["status"]> = {
      valid: "valid",
      invalid: "invalid",
      disposable: "risky",
      catchall: "risky",
      unknown: "unknown",
    };
    return {
      email,
      status: map[data.result ?? "unknown"] ?? "unknown",
      reason: data.flags?.join(",") ?? null,
      provider: "neverbounce",
      fetchedAt: new Date().toISOString(),
    };
  },
};

/** Try ZeroBounce first, then NeverBounce. Returns null if neither configured. */
export async function verifyEmail(
  email: string,
): Promise<EmailVerificationResult | null> {
  if (zeroBounceProvider.available()) {
    const r = await zeroBounceProvider.run(email);
    if (r) return r;
  }
  if (neverBounceProvider.available()) {
    const r = await neverBounceProvider.run(email);
    if (r) return r;
  }
  return null;
}

// ---------------------------------------------------------------------------
// ScreenshotOne — full-page website screenshot
// https://screenshotone.com/docs/
// ---------------------------------------------------------------------------

export interface ScreenshotResult {
  /** Direct (signed) URL to the rendered image. */
  imageUrl: string;
  /** Provider that served the screenshot. */
  provider: "screenshotone" | "urlbox";
  fetchedAt: string;
}

export const screenshotOneProvider = {
  id: "screenshotone",
  name: "ScreenshotOne",
  available(): boolean {
    return !!envKey("SCREENSHOTONE_ACCESS_KEY");
  },
  /**
   * Returns a signed image URL. (We don't proxy the bytes — the browser
   * loads them directly so screenshots can render even on bandwidth-tight
   * server-rendered pages.)
   */
  run(url: string): ScreenshotResult | null {
    const key = envKey("SCREENSHOTONE_ACCESS_KEY");
    if (!key) return null;
    const params = new URLSearchParams({
      access_key: key,
      url,
      viewport_width: "1280",
      viewport_height: "800",
      device_scale_factor: "1",
      format: "jpg",
      image_quality: "80",
      cache: "true",
      cache_ttl: "86400",
      block_ads: "true",
      block_cookie_banners: "true",
      block_trackers: "true",
    });
    return {
      imageUrl: `https://api.screenshotone.com/take?${params.toString()}`,
      provider: "screenshotone",
      fetchedAt: new Date().toISOString(),
    };
  },
};

// ---------------------------------------------------------------------------
// BrightLocal — local rank tracking (stub — needs account-specific endpoint)
// https://www.brightlocal.com/api/
// ---------------------------------------------------------------------------

export interface BrightLocalRankResult {
  averageRank: number | null;
  topThreeCount: number | null;
  fetchedAt: string;
  source: "brightlocal";
}

export const brightLocalProvider = {
  id: "brightlocal",
  name: "BrightLocal",
  available(): boolean {
    return !!envKey("BRIGHTLOCAL_API_KEY");
  },
  async run(_args: {
    businessName: string;
    city?: string;
    country?: string;
  }): Promise<BrightLocalRankResult | null> {
    if (!envKey("BRIGHTLOCAL_API_KEY")) return null;
    // BrightLocal Local Rank Tracker API requires a pre-configured campaign id
    // per business, which is set up out-of-band. Until a campaign mapping
    // exists, return null to keep this feature-flagged off without breaking.
    return null;
  },
};

// ---------------------------------------------------------------------------
// Catalog — for the Settings UI to show which providers are wired up
// ---------------------------------------------------------------------------

export interface ExternalProviderStatus {
  id: string;
  name: string;
  envVars: string[];
  configured: boolean;
  category: "speed" | "tech" | "email" | "verify" | "screenshot" | "rank";
}

export function listExternalProviders(): ExternalProviderStatus[] {
  return [
    {
      id: "pagespeed",
      name: "PageSpeed Insights",
      envVars: ["PAGESPEED_API_KEY", "GOOGLE_API_KEY"],
      configured: pageSpeedProvider.available(),
      category: "speed",
    },
    {
      id: "builtwith",
      name: "BuiltWith",
      envVars: ["BUILTWITH_API_KEY"],
      configured: builtWithProvider.available(),
      category: "tech",
    },
    {
      id: "hunter",
      name: "Hunter",
      envVars: ["HUNTER_API_KEY"],
      configured: hunterProvider.available(),
      category: "email",
    },
    {
      id: "apollo",
      name: "Apollo",
      envVars: ["APOLLO_API_KEY"],
      configured: apolloProvider.available(),
      category: "email",
    },
    {
      id: "zerobounce",
      name: "ZeroBounce",
      envVars: ["ZEROBOUNCE_API_KEY"],
      configured: zeroBounceProvider.available(),
      category: "verify",
    },
    {
      id: "neverbounce",
      name: "NeverBounce",
      envVars: ["NEVERBOUNCE_API_KEY"],
      configured: neverBounceProvider.available(),
      category: "verify",
    },
    {
      id: "screenshotone",
      name: "ScreenshotOne",
      envVars: ["SCREENSHOTONE_ACCESS_KEY"],
      configured: screenshotOneProvider.available(),
      category: "screenshot",
    },
    {
      id: "brightlocal",
      name: "BrightLocal",
      envVars: ["BRIGHTLOCAL_API_KEY"],
      configured: brightLocalProvider.available(),
      category: "rank",
    },
  ];
}

// CRM push adapters (HubSpot, Zoho, Apollo.io, Clearbit)
export * from "./crm";
