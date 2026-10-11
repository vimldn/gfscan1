-- Can I Eat That? — initial schema
-- All writes happen server-side with the service role. RLS is enabled with no
-- public policies, so the anon key cannot read or write anything directly.

create extension if not exists "pgcrypto";

-- Products seen (display cache only; never the basis of a classification)
create table if not exists public.products (
  barcode           text primary key check (barcode ~ '^[0-9]{8,14}$'),
  product_name      text,
  brand             text,
  image_url         text,
  first_seen_at     timestamptz not null default now(),
  last_fetched_at   timestamptz
);

-- One row per provider record per source revision. Immutable evidence.
create table if not exists public.source_observations (
  id                    text primary key,              -- provider:recordId:lastModified
  barcode               text not null,
  provider              text not null,                 -- open_food_facts | usda_fdc | ...
  provider_record_id    text not null,
  source_type           text not null check (source_type in
                          ('community_database','government_database','manufacturer','authorised_certification','authorised_retailer')),
  source_url            text not null,
  licence               text not null,
  product_name          text,
  brand                 text,
  quantity              text,
  image_url             text,
  countries             text[] not null default '{}',
  markets               text[] not null default '{}',
  ingredients_text      text,
  ingredients_lang      text,
  ingredients_complete  boolean,
  allergens             text[],                        -- NULL = field absent (unknown)
  traces                text[],
  labels                text[],
  gf_claims             jsonb not null default '[]',
  completeness_score    numeric,
  source_last_modified  timestamptz,                   -- when the SOURCE last changed it
  fetched_at            timestamptz not null,          -- when THIS APP fetched it
  raw                   jsonb,                         -- raw response where licence permits (OFF: ODbL, USDA: CC0)
  created_at            timestamptz not null default now()
);
create index if not exists source_observations_barcode_idx on public.source_observations (barcode, fetched_at desc);
create index if not exists source_observations_provider_idx on public.source_observations (provider, provider_record_id);

-- Rule set versions (full rule definitions stored for audit)
create table if not exists public.rule_versions (
  version     text primary key,
  rules       jsonb not null,
  created_at  timestamptz not null default now()
);

-- Every classification produced, with the rule ids and evidence that decided it
create table if not exists public.classifications (
  id               uuid primary key default gen_random_uuid(),
  barcode          text not null,
  rule_version     text not null references public.rule_versions(version),
  status           text not null check (status in ('VERIFIED_GLUTEN_FREE','CONTAINS_GLUTEN','UNVERIFIED')),
  claim_basis      text not null check (claim_basis in ('manufacturer_claim','certification','community_label','none')),
  target_market    text not null default 'GB',
  decided_by       text[] not null,
  hits             jsonb not null,
  precautionary    jsonb not null default '[]',
  observation_ids  text[] not null,
  classified_at    timestamptz not null
);
create index if not exists classifications_barcode_idx on public.classifications (barcode, classified_at desc);

-- Independent verification evidence (for future manufacturer/certification integrations).
-- A row here is required before any source can be typed 'manufacturer' or 'authorised_certification'.
create table if not exists public.verification_evidence (
  id              uuid primary key default gen_random_uuid(),
  barcode         text not null,
  provider        text not null,
  evidence_type   text not null check (evidence_type in ('manufacturer_claim','certification_licence','lab_test')),
  claim           text not null,                       -- e.g. 'gluten_free'
  market          text not null default 'GB',
  document_url    text,
  verified_by     text not null,                       -- person or system that checked it
  verified_at     timestamptz not null,
  expires_at      timestamptz,
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists verification_evidence_barcode_idx on public.verification_evidence (barcode);

-- FSA alerts (OGL v3)
create table if not exists public.recall_alerts (
  id                  text primary key,                -- FSA notation
  title               text not null,
  type                text[] not null default '{}',
  created             date,
  url                 text not null,
  reporting_business  text,
  allergens           jsonb not null default '[]',
  products            jsonb not null default '[]',
  fetched_at          timestamptz not null default now()
);

create table if not exists public.recall_matches (
  id               uuid primary key default gen_random_uuid(),
  barcode          text not null,
  alert_id         text not null references public.recall_alerts(id),
  level            text not null check (level in ('confirmed','possible')),
  concerns_gluten  boolean not null,
  reason           text not null,
  matched_at       timestamptz not null default now(),
  unique (barcode, alert_id)
);

-- User reports (reviewed by humans; never change results automatically)
create table if not exists public.user_reports (
  id                     uuid primary key default gen_random_uuid(),
  barcode                text not null,
  issue_type             text not null,
  details                text not null check (char_length(details) between 5 and 2000),
  contact_email          text,
  classification_status  text,
  observation_ids        text[] not null default '{}',
  status                 text not null default 'new' check (status in ('new','triaged','resolved','rejected')),
  created_at             timestamptz not null default now()
);
create index if not exists user_reports_status_idx on public.user_reports (status, created_at desc);

alter table public.products              enable row level security;
alter table public.source_observations   enable row level security;
alter table public.rule_versions         enable row level security;
alter table public.classifications       enable row level security;
alter table public.verification_evidence enable row level security;
alter table public.recall_alerts         enable row level security;
alter table public.recall_matches        enable row level security;
alter table public.user_reports          enable row level security;
