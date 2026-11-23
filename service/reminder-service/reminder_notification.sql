-- Reminder & Notification Service
-- Database: reminder_notification_db
-- Reminder Worker and Notification Handler may run as separate processes but share this service-owned database.
-- recipient_user_id and target_entity_id are external identifiers; no cross-service FKs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE reminder_job_status AS ENUM ('PENDING', 'PROCESSING', 'RETRYING', 'SENT', 'CANCELLED', 'FAILED');
CREATE TYPE notification_channel_type AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');
CREATE TYPE notification_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');
CREATE TYPE delivery_status AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE notification_channels (
    channel_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_code     notification_channel_type NOT NULL UNIQUE,
    display_name     VARCHAR(100) NOT NULL,
    provider_name    VARCHAR(100),
    is_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    secret_reference VARCHAR(255), -- Reference to Vault/secret manager; never store provider secrets here.
    configuration   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_templates (
    template_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_code    VARCHAR(120) NOT NULL,
    channel_code     notification_channel_type NOT NULL,
    locale           VARCHAR(12) NOT NULL DEFAULT 'vi-VN',
    subject_template TEXT,
    body_template    TEXT NOT NULL,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (template_code, channel_code, locale)
);

CREATE TABLE notification_preferences (
    preference_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL, -- External IAM identifier.
    channel_code    notification_channel_type NOT NULL,
    is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, channel_code)
);

CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID NOT NULL, -- External IAM identifier.
    notification_type VARCHAR(100) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    body            TEXT NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_event_id VARCHAR(160),
    status          notification_status NOT NULL DEFAULT 'PENDING',
    read_at         TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_notification_event_recipient_type
    ON notifications (source_event_id, recipient_user_id, notification_type)
    WHERE source_event_id IS NOT NULL;
CREATE INDEX ix_notifications_recipient_unread ON notifications (recipient_user_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE TABLE notification_delivery_logs (
    delivery_log_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    notification_id UUID NOT NULL REFERENCES notifications(notification_id) ON DELETE CASCADE,
    channel_code    notification_channel_type NOT NULL,
    attempt_number  INTEGER NOT NULL CHECK (attempt_number > 0),
    status          delivery_status NOT NULL DEFAULT 'PENDING',
    provider_message_id VARCHAR(255),
    failure_code    VARCHAR(100),
    response_summary TEXT,
    attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    UNIQUE (notification_id, channel_code, attempt_number)
);
CREATE INDEX ix_delivery_logs_status_time ON notification_delivery_logs (status, attempted_at DESC);

CREATE TABLE reminder_jobs (
    reminder_job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reminder_type   VARCHAR(100) NOT NULL, -- APPOINTMENT_BEFORE, FOLLOW_UP, etc.
    target_type     VARCHAR(80) NOT NULL,  -- APPOINTMENT, FOLLOW_UP, etc.
    target_entity_id UUID NOT NULL,        -- External ID owned by Scheduling or Clinical.
    recipient_user_id UUID NOT NULL,       -- External IAM identifier.
    scheduled_at    TIMESTAMPTZ NOT NULL,
    status          reminder_job_status NOT NULL DEFAULT 'PENDING',
    idempotency_key VARCHAR(180) NOT NULL UNIQUE,
    source_event_id VARCHAR(160),
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempt_count   INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts    INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
    next_attempt_at TIMESTAMPTZ,
    locked_at       TIMESTAMPTZ,
    locked_by       VARCHAR(120),
    last_error      TEXT,
    sent_at         TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_reminder_jobs_due ON reminder_jobs (COALESCE(next_attempt_at, scheduled_at), reminder_job_id)
    WHERE status IN ('PENDING', 'RETRYING');
CREATE INDEX ix_reminder_jobs_target ON reminder_jobs (target_type, target_entity_id);

CREATE TABLE reminder_attempts (
    reminder_attempt_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reminder_job_id UUID NOT NULL REFERENCES reminder_jobs(reminder_job_id) ON DELETE CASCADE,
    attempt_number   INTEGER NOT NULL CHECK (attempt_number > 0),
    outcome          VARCHAR(20) NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE')),
    error_message    TEXT,
    attempted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (reminder_job_id, attempt_number)
);
CREATE INDEX ix_reminder_attempts_job_time ON reminder_attempts (reminder_job_id, attempted_at DESC);

CREATE TABLE processed_events (
    event_id         VARCHAR(160) PRIMARY KEY,
    event_type       VARCHAR(120) NOT NULL,
    processed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    processing_result VARCHAR(20) NOT NULL CHECK (processing_result IN ('SUCCESS', 'IGNORED', 'FAILED')),
    error_message    TEXT
);

CREATE TABLE notification_audit_logs (
    audit_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id    UUID, -- External IAM identifier; null for system worker.
    entity_type      VARCHAR(80) NOT NULL,
    entity_id        UUID,
    action_code      VARCHAR(100) NOT NULL,
    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_notification_audit_entity_time ON notification_audit_logs (entity_type, entity_id, occurred_at DESC);

-- Seed built-in channels; actual providers and secrets are configured per environment.
INSERT INTO notification_channels (channel_code, display_name, provider_name, is_enabled) VALUES
    ('IN_APP', 'Thông báo trong ứng dụng', 'INTERNAL', TRUE),
    ('EMAIL', 'Email', NULL, FALSE),
    ('SMS', 'SMS', NULL, FALSE),
    ('PUSH', 'Push notification', NULL, FALSE)
ON CONFLICT (channel_code) DO NOTHING;

-- Worker should claim due jobs transactionally (e.g. SELECT ... FOR UPDATE SKIP LOCKED),
-- then create notifications/delivery logs idempotently and update the job state.