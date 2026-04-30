/**
 * CRM push adapters — HubSpot, Zoho CRM, Apollo.io, Clearbit Enrichment.
 *
 * All adapters follow the same contract:
 *   available() → false when the required env key is missing
 *   pushContact(lead) → { id, url? } on success, null on failure
 *
 * Security note: credentials are NEVER logged. All HTTP errors are caught
 * and returned as null so a CRM outage cannot break the main app.
 */

const UA = "Crawlix/1.0 (+https://crawlix.app)";
const TIMEOUT_MS = 20_000;

async function safeFetch(
  url: string,
  init: RequestInit,
): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface CrmLeadInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  category?: string | null;
  rating?: number | null;
  score?: number | null;
  /** Source lead ID in Crawlix for cross-reference. */
  crawlixLeadId: string;
}

export interface CrmPushResult {
  /** Remote record ID in the CRM. */
  id: string;
  /** Direct URL to the record in the CRM UI, if available. */
  url?: string;
}

// ---------------------------------------------------------------------------
// HubSpot Contacts API v3
// https://developers.hubspot.com/docs/api/crm/contacts
// ---------------------------------------------------------------------------

export const hubspot = {
  available(): boolean {
    return Boolean(env("HUBSPOT_ACCESS_TOKEN"));
  },

  async pushContact(lead: CrmLeadInput): Promise<CrmPushResult | null> {
    const token = env("HUBSPOT_ACCESS_TOKEN");
    if (!token) return null;

    const properties: Record<string, string> = {
      firstname: lead.name.split(" ")[0] ?? lead.name,
      lastname: lead.name.split(" ").slice(1).join(" ") || "",
      ...(lead.phone ? { phone: lead.phone } : {}),
      ...(lead.email ? { email: lead.email } : {}),
      ...(lead.website ? { website: lead.website } : {}),
      ...(lead.address ? { address: lead.address } : {}),
      ...(lead.city ? { city: lead.city } : {}),
      ...(lead.state ? { state: lead.state } : {}),
      ...(lead.country ? { country: lead.country } : {}),
      crawlix_lead_id: lead.crawlixLeadId,
      ...(lead.score !== null && lead.score !== undefined
        ? { crawlix_score: String(lead.score) }
        : {}),
    };

    const res = await safeFetch(
      "https://api.hubapi.com/crm/v3/objects/contacts",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "User-Agent": UA,
        },
        body: JSON.stringify({ properties }),
      },
    );

    if (!res || !res.ok) return null;
    const data = (await res.json()) as { id: string };
    return {
      id: data.id,
      url: `https://app.hubspot.com/contacts/${data.id}`,
    };
  },

  /** Upsert by email to avoid duplicates when email is present. */
  async upsertByEmail(lead: CrmLeadInput): Promise<CrmPushResult | null> {
    if (!lead.email) return this.pushContact(lead);
    const token = env("HUBSPOT_ACCESS_TOKEN");
    if (!token) return null;

    const properties: Record<string, string> = {
      firstname: lead.name.split(" ")[0] ?? lead.name,
      lastname: lead.name.split(" ").slice(1).join(" ") || "",
      ...(lead.phone ? { phone: lead.phone } : {}),
      ...(lead.website ? { website: lead.website } : {}),
      ...(lead.city ? { city: lead.city } : {}),
      crawlix_lead_id: lead.crawlixLeadId,
    };

    const res = await safeFetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(lead.email!)}?idProperty=email`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "User-Agent": UA,
        },
        body: JSON.stringify({ properties }),
      },
    );

    if (!res) return null;
    if (res.status === 404) return this.pushContact(lead);
    if (!res.ok) return null;
    const data = (await res.json()) as { id: string };
    return { id: data.id, url: `https://app.hubspot.com/contacts/${data.id}` };
  },
};

// ---------------------------------------------------------------------------
// Zoho CRM Leads API v6
// https://www.zoho.com/crm/developer/docs/api/v6/insert-records.html
// Auth: OAuth2 access token
// ---------------------------------------------------------------------------

export const zoho = {
  available(): boolean {
    return Boolean(env("ZOHO_ACCESS_TOKEN") && env("ZOHO_API_DOMAIN"));
  },

  async pushLead(lead: CrmLeadInput): Promise<CrmPushResult | null> {
    const token = env("ZOHO_ACCESS_TOKEN");
    const domain = env("ZOHO_API_DOMAIN") ?? "https://www.zohoapis.com";
    if (!token) return null;

    const nameParts = lead.name.split(" ");
    const record = {
      Last_Name: nameParts.slice(1).join(" ") || lead.name,
      First_Name: nameParts[0] ?? "",
      ...(lead.phone ? { Phone: lead.phone } : {}),
      ...(lead.email ? { Email: lead.email } : {}),
      ...(lead.website ? { Website: lead.website } : {}),
      ...(lead.city ? { City: lead.city } : {}),
      ...(lead.state ? { State: lead.state } : {}),
      ...(lead.country ? { Country: lead.country } : {}),
      Lead_Source: "Crawlix",
      Description: `Crawlix lead ID: ${lead.crawlixLeadId}${lead.score !== null && lead.score !== undefined ? ` | Score: ${lead.score}` : ""}`,
    };

    const res = await safeFetch(`${domain}/crm/v6/Leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Zoho-oauthtoken ${token}`,
        "User-Agent": UA,
      },
      body: JSON.stringify({ data: [record] }),
    });

    if (!res || !res.ok) return null;
    const body = (await res.json()) as {
      data?: Array<{ details?: { id?: string } }>;
    };
    const id = body.data?.[0]?.details?.id;
    if (!id) return null;
    return {
      id,
      url: `${domain.replace("www.zohoapis", "crm.zoho")}/crm/org/tab/Leads/${id}`,
    };
  },
};

// ---------------------------------------------------------------------------
// Apollo.io People API
// https://apolloio.github.io/apollo-api-docs/?shell#people-api
// ---------------------------------------------------------------------------

export const apollo = {
  available(): boolean {
    return Boolean(env("APOLLO_API_KEY"));
  },

  async pushContact(lead: CrmLeadInput): Promise<CrmPushResult | null> {
    const apiKey = env("APOLLO_API_KEY");
    if (!apiKey) return null;

    const nameParts = lead.name.split(" ");
    const body: Record<string, unknown> = {
      first_name: nameParts[0] ?? lead.name,
      last_name: nameParts.slice(1).join(" ") || null,
      ...(lead.email ? { email: lead.email } : {}),
      ...(lead.phone ? { direct_phone: lead.phone } : {}),
      ...(lead.website ? { organization_website_url: lead.website } : {}),
      ...(lead.city ? { city: lead.city } : {}),
      ...(lead.country ? { country: lead.country } : {}),
    };

    const res = await safeFetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
        "User-Agent": UA,
      },
      body: JSON.stringify(body),
    });

    if (!res || !res.ok) return null;
    const data = (await res.json()) as { person?: { id?: string } };
    const id = data.person?.id;
    if (!id) return null;
    return { id, url: `https://app.apollo.io/#/people/${id}` };
  },
};

// ---------------------------------------------------------------------------
// Clearbit Enrichment (Company + Person)
// https://dashboard.clearbit.com/docs#enrichment-api
// ---------------------------------------------------------------------------

export interface ClearbitEnrichResult {
  companyName?: string;
  companyDomain?: string;
  employeeCount?: number;
  industry?: string;
  description?: string;
  linkedinUrl?: string;
  twitterHandle?: string;
  city?: string;
  country?: string;
}

export const clearbit = {
  available(): boolean {
    return Boolean(env("CLEARBIT_API_KEY"));
  },

  /** Enrich a company by domain. Returns structured data; does NOT push. */
  async enrichCompany(domain: string): Promise<ClearbitEnrichResult | null> {
    const apiKey = env("CLEARBIT_API_KEY");
    if (!apiKey) return null;

    const res = await safeFetch(
      `https://company.clearbit.com/v2/companies/find?domain=${encodeURIComponent(domain)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": UA,
        },
      },
    );

    if (!res || !res.ok) return null;
    const data = (await res.json()) as {
      name?: string;
      domain?: string;
      metrics?: { employees?: number };
      category?: { industry?: string };
      description?: string;
      linkedin?: { handle?: string };
      twitter?: { handle?: string };
      geo?: { city?: string; country?: string };
    };

    return {
      companyName: data.name,
      companyDomain: data.domain,
      employeeCount: data.metrics?.employees,
      industry: data.category?.industry,
      description: data.description,
      linkedinUrl: data.linkedin?.handle
        ? `https://linkedin.com/company/${data.linkedin.handle}`
        : undefined,
      twitterHandle: data.twitter?.handle,
      city: data.geo?.city,
      country: data.geo?.country,
    };
  },

  /** Enrich a person by email. */
  async enrichPerson(email: string): Promise<{
    name?: string;
    role?: string;
    linkedinUrl?: string;
    company?: string;
  } | null> {
    const apiKey = env("CLEARBIT_API_KEY");
    if (!apiKey) return null;

    const res = await safeFetch(
      `https://person.clearbit.com/v2/people/find?email=${encodeURIComponent(email)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": UA,
        },
      },
    );

    if (!res || !res.ok) return null;
    const data = (await res.json()) as {
      name?: { fullName?: string };
      employment?: { title?: string; name?: string };
      linkedin?: { handle?: string };
    };

    return {
      name: data.name?.fullName,
      role: data.employment?.title,
      company: data.employment?.name,
      linkedinUrl: data.linkedin?.handle
        ? `https://linkedin.com/in/${data.linkedin.handle}`
        : undefined,
    };
  },
};
