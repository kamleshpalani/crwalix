-- Track per-organization acceptance of each data provider's Terms of Service.
-- Required by Google Maps Platform / Yelp Fusion / OSM ODbL etc. so we can
-- prove an authorized human consented before issuing API calls in their name.
ALTER TABLE "ProviderConfig"
  ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "termsAcceptedBy" TEXT;
