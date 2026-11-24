-- Draft only. Not wired into startup or deployment.
-- Preserve original serialized event bytes; JSONB alone cannot preserve hash inputs.
CREATE TABLE cash_research_events_v2 (
  stream text NOT NULL CHECK (length(stream) > 0),
  lane_model text GENERATED ALWAYS AS (split_part(stream, ':', 1) || ':' || split_part(stream, ':', 2)) STORED,
  CHECK (stream ~ '^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+ NOT NULL CHECK (sequence > 0),
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
-- Stream identity must include lane, model version and original chain identity.
-- Cross-chain uniqueness is enforced by lane_model; canonical lane/model naming,
-- verified replay, transactional head locking,
-- least-privilege grants and migration reconciliation are required before use.
-- Ingestion time is not proof of pre-expiry prediction timing.
-- No automatic migration, deletion, rotation or runtime activation.
),
  sequence bigint NOT NULL CHECK (sequence > 0),
  market_id text NOT NULL CHECK (length(market_id) > 0),
  event_type text NOT NULL CHECK (event_type IN ('FORECAST','OUTCOME')),
  event_hash text NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  previous_hash text NOT NULL CHECK (previous_hash = 'GENESIS' OR previous_hash ~ '^[0-9a-f]{64}$'),
  original_event text NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (stream, sequence),
  UNIQUE (stream, market_id, event_type),
  UNIQUE (stream, event_hash)
);
-- Stream identity must include lane, model version and original chain identity.
-- Cross-chain duplicate prevention, verified replay, transactional head locking,
-- least-privilege grants and migration reconciliation are required before use.
-- Ingestion time is not proof of pre-expiry prediction timing.
-- No automatic migration, deletion, rotation or runtime activation.
