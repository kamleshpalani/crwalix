-- 0029_service_packages.sql
-- Module #10b: Predefined service-package catalog.
-- Apply AFTER `prisma db push`/`prisma migrate deploy` so the table exists.

begin;

alter table "ServicePackage"
  drop constraint if exists service_package_org_fk,
  add  constraint service_package_org_fk
    foreign key ("organizationId") references "Organization"(id) on delete cascade;

alter table "ServicePackage" enable row level security;

drop policy if exists tenant_isolation on public."ServicePackage";
create policy tenant_isolation on public."ServicePackage"
  using ("organizationId" = public.current_org())
  with check ("organizationId" = public.current_org());

-- ---------------------------------------------------------------------------
-- Seed Crawlix-curated presets for every existing organization.
-- The web service-packages.service.ts also seeds on first read for new orgs,
-- so this block is just a one-time backfill for already-onboarded tenants.
-- ---------------------------------------------------------------------------
do $$
declare
  org record;
begin
  for org in select id from "Organization" loop
    insert into "ServicePackage"
      (id, "organizationId", slug, name, summary, description, category,
       "priceCents", currency, "billingCycle", features, deliverables,
       "scopeItems", "deliveryDays", "isBuiltIn", active, position,
       "createdAt", "updatedAt")
    values
      (gen_random_uuid(), org.id, 'basic-website', 'Basic Website',
       '5-page mobile-friendly site for small businesses.',
       '<p>Modern, mobile-friendly 5-page website with copy assistance and basic SEO.</p>',
       'website', 80000, 'USD', 'ONE_TIME',
       '["5 pages","Mobile-friendly","Contact form","Basic SEO","Domain + hosting setup"]'::jsonb,
       '["Designed homepage","4 inner pages","Contact form","Basic on-page SEO"]'::jsonb,
       '["Discovery call","Copy review","Up to 2 revision rounds"]'::jsonb,
       21, true, true, 10, now(), now()),

      (gen_random_uuid(), org.id, 'business-website', 'Business Website',
       '10-page conversion-focused site with CMS.',
       '<p>Conversion-optimised 10-page site with CMS so the team can update content without us.</p>',
       'website', 180000, 'USD', 'ONE_TIME',
       '["10 pages","CMS","Blog","On-page SEO","Analytics","Lead-capture forms"]'::jsonb,
       '["10-page site","CMS training","Blog setup","Analytics dashboard"]'::jsonb,
       '["Discovery + sitemap","Copy assistance","Up to 3 revision rounds"]'::jsonb,
       35, true, true, 20, now(), now()),

      (gen_random_uuid(), org.id, 'ecommerce-store', 'E-Commerce Store',
       'Up to 50 products, payments, inventory.',
       '<p>Full e-commerce setup with payments, inventory and order management.</p>',
       'ecommerce', 350000, 'USD', 'ONE_TIME',
       '["Up to 50 SKUs","Stripe checkout","Inventory","Order email","Customer accounts","Tax + shipping rules"]'::jsonb,
       '["Storefront","Product upload (50)","Stripe integration","Order workflow"]'::jsonb,
       '["Discovery + product taxonomy","Payment processor setup","Up to 3 revision rounds"]'::jsonb,
       45, true, true, 30, now(), now()),

      (gen_random_uuid(), org.id, 'website-redesign', 'Website Redesign',
       'Brand + UX refresh of an existing site.',
       '<p>Modern visual + UX refresh with conversion improvements.</p>',
       'website', 240000, 'USD', 'ONE_TIME',
       '["UX audit","Brand refresh","Page redesign","Performance pass","Accessibility pass"]'::jsonb,
       '["UX audit","Redesigned key pages","Performance + a11y report"]'::jsonb,
       '["Stakeholder workshop","Design system tokens","Up to 3 revision rounds"]'::jsonb,
       30, true, true, 40, now(), now()),

      (gen_random_uuid(), org.id, 'maintenance-care', 'Maintenance & Care',
       'Monthly upkeep, security, backups.',
       '<p>Monthly retainer covering updates, security patches, backups and small content edits.</p>',
       'support', 25000, 'USD', 'MONTHLY',
       '["Plugin/CMS updates","Daily backups","Uptime monitoring","Up to 2 hr/mo content edits","Priority support"]'::jsonb,
       '["Monthly health report","Patched dependencies","Backup restore drill"]'::jsonb,
       '["Cancel anytime with 30-day notice"]'::jsonb,
       null, true, true, 50, now(), now()),

      (gen_random_uuid(), org.id, 'ai-automation', 'AI Automation Pack',
       'Custom AI workflow + chatbot integration.',
       '<p>Embed an AI assistant or workflow automation tailored to the customer''s ops.</p>',
       'ai', 450000, 'USD', 'ONE_TIME',
       '["Use-case workshop","Custom prompt suite","Vector knowledge base","Chat or workflow UI","Analytics"]'::jsonb,
       '["Discovery doc","Working AI workflow","Prompt + KB handoff"]'::jsonb,
       '["Customer supplies source content","Up to 2 revision rounds"]'::jsonb,
       30, true, true, 60, now(), now())
    on conflict ("organizationId", slug) do nothing;
  end loop;
end $$;

commit;
