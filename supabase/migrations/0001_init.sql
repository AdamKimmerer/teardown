-- Teardown schema, v1 (build plan §Data model). This file and its successors are the only
-- record of the schema. Every table lives in public and is keyed to auth.users.
--
-- Row Level Security is enabled on every table with no policies: the anon and authenticated
-- roles (the public Supabase key) can sign in but read nothing. The API uses the service role,
-- which bypasses RLS, so there is exactly one data path.

create extension if not exists pgcrypto;

-- Enums ----------------------------------------------------------------------------------------

create type session_status as enum ('recording', 'review', 'syncing', 'processing', 'ready', 'failed');
create type region_mode as enum ('viewport', 'freehand', 'element');
create type audio_chunk_status as enum ('uploaded', 'transcribed', 'failed');
create type document_version_source as enum ('generate', 'refine');
create type export_connector as enum ('html', 'html_folder', 'obsidian', 'notion');
create type export_job_status as enum ('queued', 'running', 'done', 'failed');
create type credit_reason as enum ('purchase', 'promo', 'spend', 'refund');
create type usage_kind as enum ('transcribe', 'generate', 'refine');
create type connector_kind as enum ('notion');

-- users ----------------------------------------------------------------------------------------
-- One row per auth.users row, created by the trigger below. Manageable from the dashboard.

create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  -- Set at the start of delete-account so a half-deleted account cannot act while the
  -- storage cascade runs. Deletion is still a hard delete; this is not a soft-delete flag.
  deleted_at timestamptz
);

create function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- sessions -------------------------------------------------------------------------------------

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  status session_status not null default 'recording',
  -- The session clock epoch; every runtime computes t = now - started_at - paused_ms.
  started_at timestamptz not null,
  paused_ms integer not null default 0,
  stopped_at timestamptz,
  title text,
  -- Which processing step failed, so a retry resumes there instead of starting over.
  failed_step text,
  created_at timestamptz not null default now()
);

create index sessions_user_id_created_at_idx on sessions (user_id, created_at desc);

-- captures -------------------------------------------------------------------------------------
-- The original PNG plus the decision the human made; crops are derived (spine §10.1).

create table captures (
  -- Client-generated, so retried uploads upsert instead of duplicating.
  id uuid primary key,
  session_id uuid not null references sessions (id) on delete cascade,
  t_pick_start_ms integer not null,
  t_capture_ms integer not null,
  url text not null,
  page_title text not null default '',
  viewport_w integer not null,
  viewport_h integer not null,
  dpr double precision not null,
  region_mode region_mode not null,
  -- {x, y, w, h} in CSS pixels; null for viewport mode.
  region_rect jsonb,
  selectors text[] not null default '{}',
  primary_element text,
  padding integer not null default 0,
  -- Storage object keys, never URLs. crop_path is a cache: null until generate derives it.
  original_path text,
  crop_path text,
  element_text_hash text,
  created_at timestamptz not null default now()
);

create index captures_session_id_t_capture_ms_idx on captures (session_id, t_capture_ms);

-- audio_chunks ---------------------------------------------------------------------------------
-- One row per VAD-passed chunk; offset_ms is where it starts on the session clock.

create table audio_chunks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  offset_ms integer not null,
  duration_ms integer not null,
  storage_path text not null,
  status audio_chunk_status not null default 'uploaded',
  created_at timestamptz not null default now(),
  unique (session_id, offset_ms)
);

-- transcript_words -----------------------------------------------------------------------------
-- Already rebased from chunk time to the session clock at insert.

create table transcript_words (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  chunk_id uuid not null references audio_chunks (id) on delete cascade,
  word text not null,
  start_ms integer not null,
  end_ms integer not null,
  ordinal integer not null
);

create index transcript_words_session_id_start_ms_idx on transcript_words (session_id, start_ms);

-- documents and document_versions --------------------------------------------------------------
-- One document per session; versions are append-only.

create table documents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions (id) on delete cascade,
  current_version_id uuid, -- foreign key added below, after document_versions exists
  created_at timestamptz not null default now()
);

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  version_no integer not null,
  markdown text not null,
  source document_version_source not null,
  refine_prompt text,
  model text not null,
  created_at timestamptz not null default now(),
  unique (document_id, version_no)
);

alter table documents
  add constraint documents_current_version_id_fkey
  foreign key (current_version_id) references document_versions (id) on delete set null;

-- export_jobs ----------------------------------------------------------------------------------

create table export_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  connector export_connector not null,
  status export_job_status not null default 'queued',
  -- result_path is a storage key for downloads; external_url is where a push landed (Notion).
  result_path text,
  external_url text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index export_jobs_document_id_created_at_idx on export_jobs (document_id, created_at desc);

-- credit_ledger --------------------------------------------------------------------------------
-- Append-only. Balance = sum(delta). Spend is one conditional insert, never read-then-write.

create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  delta integer not null,
  reason credit_reason not null,
  -- Unique so a replayed Stripe webhook inserts nothing.
  stripe_event_id text unique,
  -- Kept (nulled) when the session is deleted; the ledger never loses rows.
  session_id uuid references sessions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index credit_ledger_user_id_idx on credit_ledger (user_id);

-- security_invoker so the view respects RLS like the table under it.
create view credit_balances
with (security_invoker = true)
as
  select user_id, coalesce(sum(delta), 0)::integer as balance
  from credit_ledger
  group by user_id;

-- usage_events ---------------------------------------------------------------------------------
-- One row per OpenAI call, with what was sent and what was billed (spine §6.5).

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  session_id uuid references sessions (id) on delete set null,
  kind usage_kind not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  audio_seconds real,
  image_count integer,
  -- [{ w, h }] per image sent, so the image-token formula can be checked against tokens billed.
  image_pixels jsonb,
  cost_usd_estimate numeric(10, 6),
  created_at timestamptz not null default now()
);

create index usage_events_session_id_idx on usage_events (session_id);
create index usage_events_user_id_created_at_idx on usage_events (user_id, created_at desc);

-- promo_codes ----------------------------------------------------------------------------------

create table promo_codes (
  code text primary key,
  credits integer not null,
  max_redemptions integer not null,
  redeemed_count integer not null default 0,
  expires_at timestamptz
);

-- connector_connections ------------------------------------------------------------------------
-- One row per user per connector. access_token is pgp_sym_encrypt(token, key) with a key held
-- only in API config, so a database read alone does not expose a workspace token.

create table connector_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  connector connector_kind not null,
  access_token bytea not null,
  workspace_name text,
  created_at timestamptz not null default now(),
  unique (user_id, connector)
);

-- Row Level Security: on everywhere, no policies -----------------------------------------------

alter table users enable row level security;
alter table sessions enable row level security;
alter table captures enable row level security;
alter table audio_chunks enable row level security;
alter table transcript_words enable row level security;
alter table documents enable row level security;
alter table document_versions enable row level security;
alter table export_jobs enable row level security;
alter table credit_ledger enable row level security;
alter table usage_events enable row level security;
alter table promo_codes enable row level security;
alter table connector_connections enable row level security;

-- Storage buckets ------------------------------------------------------------------------------
-- All private; the API issues signed upload and download URLs. Keys are
-- <user_id>/<session_id>/<capture_id>.png, .../crop.png, <user_id>/<session_id>/chunks/<offset_ms>.webm,
-- and <user_id>/exports/<job_id>.<ext>, so delete-account is a prefix listing per bucket.

insert into storage.buckets (id, name, public)
values
  ('originals', 'originals', false),
  ('crops', 'crops', false),
  ('audio', 'audio', false),
  ('exports', 'exports', false);
