-- Consumer Service
-- Database: consumer_db
-- Owns administrative patient profiles. user_id is an external IAM identifier; no cross-database FK.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
    CREATE TYPE patient_gender AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE patient_profile_status AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING_VERIFICATION');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE patient_contact_type AS ENUM ('PHONE', 'EMAIL');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE patient_address_type AS ENUM ('HOME', 'MAILING', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS patients (
    patient_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_code        VARCHAR(40) NOT NULL UNIQUE,
    user_id             UUID UNIQUE, -- External reference to Identity & Access Service; nullable for walk-in patients.
    first_name          VARCHAR(100) NOT NULL,
    middle_name         VARCHAR(100),
    last_name           VARCHAR(100) NOT NULL,
    date_of_birth       DATE,
    gender              patient_gender NOT NULL DEFAULT 'UNKNOWN',
    profile_status      patient_profile_status NOT NULL DEFAULT 'ACTIVE',
    note                TEXT,
    created_by_user_id  UUID, -- External IAM identifier.
    updated_by_user_id  UUID, -- External IAM identifier.
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_patients_name ON patients (lower(last_name), lower(first_name));
CREATE INDEX IF NOT EXISTS ix_patients_first_name_lower ON patients (lower(first_name));
CREATE INDEX IF NOT EXISTS ix_patients_code_lower ON patients (lower(patient_code));
CREATE INDEX IF NOT EXISTS ix_patients_created_at ON patients (created_at DESC);

CREATE TABLE IF NOT EXISTS patient_contacts (
    contact_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    contact_type    patient_contact_type NOT NULL,
    contact_value   VARCHAR(255) NOT NULL,
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (patient_id, contact_type, contact_value)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_primary_contact_type
    ON patient_contacts (patient_id, contact_type) WHERE is_primary;
CREATE INDEX IF NOT EXISTS ix_patient_contacts_value ON patient_contacts (contact_type, lower(contact_value));

CREATE TABLE IF NOT EXISTS patient_addresses (
    address_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id       UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    address_type     patient_address_type NOT NULL DEFAULT 'HOME',
    address_line     VARCHAR(255) NOT NULL,
    ward             VARCHAR(120),
    district         VARCHAR(120),
    province         VARCHAR(120),
    country          VARCHAR(100) NOT NULL DEFAULT 'Vietnam',
    is_primary       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_primary_address ON patient_addresses (patient_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS ix_patient_addresses_patient ON patient_addresses (patient_id);

CREATE TABLE IF NOT EXISTS patient_emergency_contacts (
    emergency_contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id           UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    full_name            VARCHAR(200) NOT NULL,
    relationship         VARCHAR(80),
    phone                VARCHAR(30) NOT NULL,
    note                 TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_emergency_contacts_patient ON patient_emergency_contacts (patient_id);

CREATE TABLE IF NOT EXISTS patient_profile_audit (
    audit_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id        UUID NOT NULL REFERENCES patients(patient_id) ON DELETE RESTRICT,
    actor_user_id     UUID, -- External IAM identifier.
    action_code       VARCHAR(80) NOT NULL,
    before_data       JSONB,
    after_data        JSONB,
    reason            TEXT,
    occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_patient_audit_patient_time ON patient_profile_audit (patient_id, occurred_at DESC);

-- Simple service-owned count for the Admin dashboard.
CREATE OR REPLACE VIEW v_patient_count_by_status AS
SELECT profile_status, COUNT(*)::BIGINT AS patient_count
FROM patients
GROUP BY profile_status;

-- Transactional Outbox migration. Apply once to this service-owned database.
-- Insert the outbox row in the SAME business transaction as the aggregate update.
CREATE TABLE IF NOT EXISTS outbox_events (
    event_id           UUID PRIMARY KEY, -- Reuse the event envelope eventId.
    aggregate_type     VARCHAR(100) NOT NULL,
    aggregate_id       UUID NOT NULL,
    aggregate_version  BIGINT,
    event_type         VARCHAR(180) NOT NULL,
    routing_key        VARCHAR(180) NOT NULL,
    payload            JSONB NOT NULL, -- Full event envelope; do not put PHI/PII in it.
    headers            JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at        TIMESTAMPTZ NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    available_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    publish_attempts   INTEGER NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0),
    locked_by          VARCHAR(120),
    locked_until       TIMESTAMPTZ,
    published_at       TIMESTAMPTZ,
    last_error         TEXT,
    CONSTRAINT ck_outbox_lease CHECK ((locked_by IS NULL AND locked_until IS NULL) OR (locked_by IS NOT NULL AND locked_until IS NOT NULL)),
    CONSTRAINT ck_outbox_published_unlock CHECK (published_at IS NULL OR (locked_by IS NULL AND locked_until IS NULL))
);
CREATE INDEX IF NOT EXISTS ix_outbox_ready
    ON outbox_events (available_at, created_at)
    WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_outbox_aggregate_version
    ON outbox_events (aggregate_type, aggregate_id, aggregate_version);

-- Idempotency records for mutating requests (e.g. createPatient with Idempotency-Key).
-- Enforces unique triple (principal_key, operation_scope, idempotency_key) with 48h TTL.
CREATE TABLE IF NOT EXISTS idempotency_records (
    idempotency_record_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    principal_key           VARCHAR(200) NOT NULL, -- e.g. user:<uuid> or service:<client-id>
    operation_scope         VARCHAR(180) NOT NULL, -- e.g. createPatient or POST:/api/v1/patients
    idempotency_key         VARCHAR(120) NOT NULL,
    request_hash            CHAR(64) NOT NULL,     -- SHA-256 hex digest of canonical request payload
    state                   VARCHAR(16) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (state IN ('IN_PROGRESS', 'COMPLETED')),
    response_status         SMALLINT,
    response_body_encrypted BYTEA,
    response_key_version    VARCHAR(80),
    resource_type           VARCHAR(80),
    resource_id             UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at              TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '48 hours'),
    completed_at            TIMESTAMPTZ,
    CONSTRAINT uq_idempotency_principal_operation_key UNIQUE (principal_key, operation_scope, idempotency_key),
    CONSTRAINT ck_idempotency_completion CHECK (
        (state = 'IN_PROGRESS' AND completed_at IS NULL)
        OR (state = 'COMPLETED' AND completed_at IS NOT NULL AND response_status IS NOT NULL)
    ),
    CONSTRAINT ck_idempotency_expiry CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS ix_idempotency_expires_at
    ON idempotency_records (expires_at);
