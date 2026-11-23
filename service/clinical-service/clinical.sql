-- Clinical Service
-- Database: clinical_db
-- Owns medical encounters, clinical notes, diagnoses, basic lab orders/results and prescriptions.
-- patient_id, doctor_id, queue_ticket_id and user_id are external UUID references; no cross-service FKs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE encounter_status AS ENUM ('DRAFT', 'IN_PROGRESS', 'PENDING_RESULTS', 'READY_FOR_REVIEW', 'COMPLETED', 'PUBLISHED');
CREATE TYPE diagnosis_type AS ENUM ('PRIMARY', 'SECONDARY');
CREATE TYPE test_order_status AS ENUM ('REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE test_result_status AS ENUM ('PENDING', 'PRELIMINARY', 'FINAL', 'AMENDED');
CREATE TYPE prescription_status AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

CREATE TABLE medical_encounters (
    encounter_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_code     VARCHAR(50) NOT NULL UNIQUE,
    queue_ticket_id    UUID NOT NULL UNIQUE, -- External Scheduling & Queue ID; one encounter per actual queue visit.
    patient_id         UUID NOT NULL,        -- External Consumer ID.
    doctor_id          UUID NOT NULL,        -- External Provider ID.
    specialty_id       UUID,                 -- External Provider ID snapshot.
    branch_id          UUID,
    room_id            UUID,
    status             encounter_status NOT NULL DEFAULT 'DRAFT',
    chief_complaint    TEXT,
    started_at         TIMESTAMPTZ,
    completed_at       TIMESTAMPTZ,
    published_at       TIMESTAMPTZ,
    created_by_user_id UUID, -- External IAM identifier.
    updated_by_user_id UUID, -- External IAM identifier.
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_encounter_times CHECK (
        completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at
    ),
    CONSTRAINT ck_published_time CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL)
);
CREATE INDEX ix_encounters_patient_time ON medical_encounters (patient_id, created_at DESC);
CREATE INDEX ix_encounters_doctor_time ON medical_encounters (doctor_id, created_at DESC);
CREATE INDEX ix_encounters_status ON medical_encounters (status, created_at DESC);

CREATE TABLE clinical_notes (
    note_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id     UUID NOT NULL REFERENCES medical_encounters(encounter_id) ON DELETE RESTRICT,
    note_type        VARCHAR(50) NOT NULL, -- e.g. TRIAGE, PROGRESS, SUMMARY, DISCHARGE_ADVICE
    content          TEXT NOT NULL,
    author_user_id   UUID, -- External IAM identifier.
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_clinical_notes_encounter_time ON clinical_notes (encounter_id, created_at);

CREATE TABLE encounter_symptoms (
    symptom_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id     UUID NOT NULL REFERENCES medical_encounters(encounter_id) ON DELETE RESTRICT,
    symptom_name     VARCHAR(200) NOT NULL,
    onset_at         TIMESTAMPTZ,
    severity         SMALLINT CHECK (severity IS NULL OR severity BETWEEN 1 AND 10),
    description      TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_symptoms_encounter ON encounter_symptoms (encounter_id);

CREATE TABLE examination_findings (
    finding_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id     UUID NOT NULL REFERENCES medical_encounters(encounter_id) ON DELETE RESTRICT,
    body_system      VARCHAR(100),
    finding_name     VARCHAR(200) NOT NULL,
    finding_value    TEXT,
    unit             VARCHAR(40),
    reference_range  VARCHAR(100),
    is_abnormal      BOOLEAN,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_findings_encounter ON examination_findings (encounter_id);

CREATE TABLE diagnoses (
    diagnosis_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id     UUID NOT NULL REFERENCES medical_encounters(encounter_id) ON DELETE RESTRICT,
    diagnosis_code   VARCHAR(40), -- ICD code if available.
    diagnosis_name   VARCHAR(255) NOT NULL,
    diagnosis_kind   diagnosis_type NOT NULL DEFAULT 'PRIMARY',
    notes            TEXT,
    diagnosed_by_user_id UUID, -- External IAM identifier.
    diagnosed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_diagnoses_encounter ON diagnoses (encounter_id);
CREATE INDEX ix_diagnoses_code ON diagnoses (diagnosis_code) WHERE diagnosis_code IS NOT NULL;

CREATE TABLE test_catalog (
    test_catalog_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_code       VARCHAR(50) NOT NULL UNIQUE,
    test_name       VARCHAR(200) NOT NULL,
    category        VARCHAR(100),
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE test_orders (
    test_order_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id     UUID NOT NULL REFERENCES medical_encounters(encounter_id) ON DELETE RESTRICT,
    order_code       VARCHAR(50) NOT NULL UNIQUE,
    ordered_by_user_id UUID, -- External IAM identifier.
    status           test_order_status NOT NULL DEFAULT 'REQUESTED',
    clinical_indication TEXT,
    ordered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at     TIMESTAMPTZ
);
CREATE INDEX ix_test_orders_encounter ON test_orders (encounter_id, ordered_at DESC);

CREATE TABLE test_order_items (
    test_order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_order_id      UUID NOT NULL REFERENCES test_orders(test_order_id) ON DELETE RESTRICT,
    test_catalog_id    UUID REFERENCES test_catalog(test_catalog_id) ON DELETE SET NULL,
    test_code_snapshot VARCHAR(50),
    test_name_snapshot VARCHAR(200) NOT NULL,
    status             test_order_status NOT NULL DEFAULT 'REQUESTED',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_test_order_items_order ON test_order_items (test_order_id);

CREATE TABLE test_results (
    test_result_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_order_item_id UUID NOT NULL REFERENCES test_order_items(test_order_item_id) ON DELETE RESTRICT,
    result_status      test_result_status NOT NULL DEFAULT 'PENDING',
    result_summary     TEXT,
    result_data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    performed_at       TIMESTAMPTZ,
    verified_by_user_id UUID, -- External IAM identifier (authorized lab user/doctor).
    verified_at        TIMESTAMPTZ,
    source_system      VARCHAR(100) NOT NULL DEFAULT 'MANUAL', -- MANUAL or LIS integration identifier.
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_test_results_item_time ON test_results (test_order_item_id, created_at DESC);

CREATE TABLE diagnostic_files (
    diagnostic_file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_result_id    UUID NOT NULL REFERENCES test_results(test_result_id) ON DELETE RESTRICT,
    file_name         VARCHAR(255) NOT NULL,
    object_storage_key TEXT NOT NULL, -- Store file in object storage; do not store binary files in this table.
    content_type      VARCHAR(120),
    file_size_bytes   BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
    uploaded_by_user_id UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_diagnostic_files_result ON diagnostic_files (test_result_id);

CREATE TABLE prescriptions (
    prescription_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id      UUID NOT NULL REFERENCES medical_encounters(encounter_id) ON DELETE RESTRICT,
    prescription_code VARCHAR(50) NOT NULL UNIQUE,
    status            prescription_status NOT NULL DEFAULT 'DRAFT',
    instructions      TEXT,
    issued_by_user_id UUID, -- External IAM identifier.
    issued_at         TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_prescriptions_encounter ON prescriptions (encounter_id);

CREATE TABLE prescription_items (
    prescription_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id      UUID NOT NULL REFERENCES prescriptions(prescription_id) ON DELETE CASCADE,
    medication_code      VARCHAR(80),
    medication_name      VARCHAR(255) NOT NULL, -- Snapshot; no Pharmacy Service in current scope.
    strength             VARCHAR(100),
    dosage               VARCHAR(150),
    route                VARCHAR(80),
    frequency            VARCHAR(150),
    duration_days        INTEGER CHECK (duration_days IS NULL OR duration_days > 0),
    quantity             NUMERIC(12,2) CHECK (quantity IS NULL OR quantity > 0),
    usage_instruction    TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_prescription_items_prescription ON prescription_items (prescription_id);

CREATE TABLE follow_up_recommendations (
    follow_up_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id       UUID NOT NULL REFERENCES medical_encounters(encounter_id) ON DELETE RESTRICT,
    recommended_date   DATE,
    recommended_after_days INTEGER CHECK (recommended_after_days IS NULL OR recommended_after_days >= 0),
    instructions       TEXT,
    created_by_user_id UUID,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_follow_up_target CHECK (recommended_date IS NOT NULL OR recommended_after_days IS NOT NULL OR instructions IS NOT NULL)
);
CREATE INDEX ix_followups_encounter ON follow_up_recommendations (encounter_id);

CREATE TABLE medical_record_versions (
    version_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id     UUID NOT NULL REFERENCES medical_encounters(encounter_id) ON DELETE RESTRICT,
    version_number   INTEGER NOT NULL CHECK (version_number > 0),
    snapshot         JSONB NOT NULL,
    version_reason   TEXT,
    created_by_user_id UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (encounter_id, version_number)
);

CREATE TABLE clinical_audit_logs (
    audit_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    encounter_id     UUID REFERENCES medical_encounters(encounter_id) ON DELETE RESTRICT,
    actor_user_id    UUID,
    action_code      VARCHAR(100) NOT NULL,
    before_data      JSONB,
    after_data       JSONB,
    reason           TEXT,
    occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_clinical_audit_encounter_time ON clinical_audit_logs (encounter_id, occurred_at DESC);

CREATE VIEW v_completed_encounters_by_doctor AS
SELECT doctor_id, specialty_id, COUNT(*)::BIGINT AS completed_encounters
FROM medical_encounters
WHERE status IN ('COMPLETED', 'PUBLISHED')
GROUP BY doctor_id, specialty_id;

-- Access rule: Patient may read only their own encounters and only after publication.
-- Enforce this in the service/API authorization layer (and optionally PostgreSQL RLS in production).

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