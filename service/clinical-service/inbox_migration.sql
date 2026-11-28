-- Idempotent Inbox migration for clinical_db event deduplication
CREATE TABLE IF NOT EXISTS inbox_messages (
    event_id          UUID PRIMARY KEY,
    consumer_name     VARCHAR(120) NOT NULL,
    event_type        VARCHAR(180) NOT NULL,
    received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    processing_status VARCHAR(32) NOT NULL DEFAULT 'PROCESSED',
    error_message     TEXT
);
CREATE INDEX IF NOT EXISTS ix_inbox_consumer_time ON inbox_messages (consumer_name, processed_at DESC);
