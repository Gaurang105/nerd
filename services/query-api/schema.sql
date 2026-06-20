-- Local-dev bootstrap schema for the query-api gateway.
-- Core RAG tables use the exact DDL from nerd_erd.md. The analytical mirror tables
-- are best-effort from the ERD's key-column list (full DDL normally comes from the
-- BigQuery mirror job) so the /sql endpoint can be exercised locally.

-- ---------- Core RAG tables (written by the sync cron) ----------
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT,
  url TEXT,
  content_hash TEXT,
  source_metadata JSONB,
  last_synced_at BIGINT,
  updated_at BIGINT,
  deleted_at BIGINT
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  token_count INTEGER
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  finished_at BIGINT,
  docs_scanned INTEGER DEFAULT 0,
  docs_new INTEGER DEFAULT 0,
  docs_updated INTEGER DEFAULT 0,
  docs_skipped INTEGER DEFAULT 0,
  docs_deleted INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS documents_content_hash_idx ON documents(content_hash);
CREATE INDEX IF NOT EXISTS document_chunks_doc_id_idx ON document_chunks(doc_id);

-- ---------- BigQuery analytical mirror (queried via text-to-SQL) ----------
CREATE TABLE IF NOT EXISTS dim_experiences (
  experience_id TEXT PRIMARY KEY,
  experience_name TEXT,
  city TEXT,
  country TEXT,
  primary_category_name TEXT,
  average_rating NUMERIC,
  count_ratings INTEGER,
  listing_final_price NUMERIC,
  currency TEXT,
  is_available BOOLEAN
);

CREATE TABLE IF NOT EXISTS dim_experience_listings (
  ticket_id TEXT PRIMARY KEY,
  experience_id TEXT,
  city TEXT,
  listing_status TEXT,
  plc_status TEXT,
  content_status TEXT,
  inventory_status TEXT,
  sp_name TEXT,
  owner TEXT,
  priority TEXT
);

CREATE TABLE IF NOT EXISTS dim_experience_management (
  experience_id TEXT,
  experience_city TEXT,
  category_name TEXT,
  collection_name TEXT,
  sub_category_name TEXT,
  combined_entity_name TEXT
);

CREATE TABLE IF NOT EXISTS experience_listing_events (
  ticket_id TEXT,
  experience_id TEXT,
  event_name TEXT,
  event_timestamp TIMESTAMPTZ,
  city TEXT,
  days_since_previous_step NUMERIC
);

CREATE INDEX IF NOT EXISTS experience_listing_events_ts_idx ON experience_listing_events(event_timestamp);
CREATE INDEX IF NOT EXISTS experience_listing_events_exp_idx ON experience_listing_events(experience_id);

CREATE TABLE IF NOT EXISTS fct_zendesk_ops_tickets (
  ticket_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ,
  custom_city TEXT,
  priority TEXT,
  ticket_status TEXT,
  has_met_sla BOOLEAN,
  sla_hours NUMERIC,
  minutes_to_full_resolution NUMERIC,
  l1_categorisation TEXT,
  l2_categorisation TEXT
);

-- Full DDL comes from the mirror job; stub for local bootstrap.
CREATE TABLE IF NOT EXISTS dim_vendor_tours (
  vendor_tour_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ
);
