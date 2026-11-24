-- Draft only; never execute against live storage without approval.
CREATE TABLE cash_research_events_v2 (
 stream text NOT NULL CHECK (stream ~ '^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$'),
 lane_model text GENERATED ALWAYS AS (split_part(stream, ':', 1) || ':' || split_part(stream, ':', 2)) STORED,
 sequence bigint NOT NULL CHECK (sequence > 0),
 market_id text NOT NULL CHECK (length(market_id) > 0),
 event_type text NOT NULL CHECK (event_type IN ('FORECAST','OUTCOME')),
 event_hash text NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$'),
 previous_hash text NOT NULL CHECK (previous_hash = 'GENESIS' OR previous_hash ~ '^[0-9a-f]{64}$'),
 original_event text NOT NULL,
 ingested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (stream, sequence),
 UNIQUE (lane_model, market_id, event_type),
 UNIQUE (stream, event_hash)
);
-- Canonical model identifiers, verified replay, least-privilege grants and
-- migration reconciliation remain prerequisites. Ingestion time is not
-- independent pre-expiry evidence. No automatic migration or activation.
