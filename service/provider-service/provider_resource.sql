-- Provider / Resource Service
-- Database: provider_db
-- Owns hospital catalogue, doctors, rooms, service catalogue and provider working schedules.
-- Appointment capacity and reservations belong to Scheduling & Queue Service.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE record_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE doctor_work_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE doctor_schedule_status AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');
CREATE TYPE doctor_leave_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE hospitals (
    hospital_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_code  VARCHAR(40) NOT NULL UNIQUE,
    hospital_name  VARCHAR(200) NOT NULL,
    phone          VARCHAR(30),
    email          VARCHAR(255),
    website        VARCHAR(255),
    description    TEXT,
    status         record_status NOT NULL DEFAULT 'ACTIVE',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE branches (
    branch_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id    UUID NOT NULL REFERENCES hospitals(hospital_id) ON DELETE RESTRICT,
    branch_code    VARCHAR(40) NOT NULL UNIQUE,
    branch_name    VARCHAR(200) NOT NULL,
    address_line   VARCHAR(255),
    ward           VARCHAR(120),
    district       VARCHAR(120),
    province       VARCHAR(120),
    country        VARCHAR(100) NOT NULL DEFAULT 'Vietnam',
    phone          VARCHAR(30),
    opening_hours  JSONB NOT NULL DEFAULT '{}'::jsonb,
    status         record_status NOT NULL DEFAULT 'ACTIVE',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_branches_hospital ON branches (hospital_id);

CREATE TABLE specialties (
    specialty_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    specialty_code VARCHAR(40) NOT NULL UNIQUE,
    specialty_name VARCHAR(150) NOT NULL,
    description    TEXT,
    status         record_status NOT NULL DEFAULT 'ACTIVE',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_specialties_name ON specialties (lower(specialty_name));

CREATE TABLE rooms (
    room_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id      UUID NOT NULL REFERENCES branches(branch_id) ON DELETE RESTRICT,
    room_code      VARCHAR(40) NOT NULL,
    room_name      VARCHAR(150) NOT NULL,
    floor_label    VARCHAR(40),
    room_type      VARCHAR(80),
    status         record_status NOT NULL DEFAULT 'ACTIVE',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (branch_id, room_code)
);
CREATE INDEX ix_rooms_branch_status ON rooms (branch_id, status);

CREATE TABLE doctors (
    doctor_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID UNIQUE, -- External reference to Identity & Access Service.
    doctor_code     VARCHAR(40) NOT NULL UNIQUE,
    license_number  VARCHAR(100) UNIQUE,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    display_name    VARCHAR(200),
    academic_title  VARCHAR(100),
    qualification   VARCHAR(200),
    biography       TEXT,
    avatar_url      TEXT,
    work_status     doctor_work_status NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_doctors_name ON doctors (lower(last_name), lower(first_name));
CREATE INDEX ix_doctors_status ON doctors (work_status);

CREATE TABLE doctor_specialties (
    doctor_id      UUID NOT NULL REFERENCES doctors(doctor_id) ON DELETE CASCADE,
    specialty_id   UUID NOT NULL REFERENCES specialties(specialty_id) ON DELETE RESTRICT,
    is_primary     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (doctor_id, specialty_id)
);
CREATE UNIQUE INDEX uq_doctor_primary_specialty ON doctor_specialties (doctor_id) WHERE is_primary;
CREATE INDEX ix_doctor_specialties_specialty ON doctor_specialties (specialty_id);

CREATE TABLE doctor_assignments (
    assignment_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id      UUID NOT NULL REFERENCES doctors(doctor_id) ON DELETE RESTRICT,
    specialty_id   UUID NOT NULL REFERENCES specialties(specialty_id) ON DELETE RESTRICT,
    branch_id      UUID NOT NULL REFERENCES branches(branch_id) ON DELETE RESTRICT,
    room_id        UUID REFERENCES rooms(room_id) ON DELETE SET NULL,
    valid_from     DATE NOT NULL,
    valid_to       DATE,
    is_primary     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_assignment_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX ix_doctor_assignments_doctor_dates ON doctor_assignments (doctor_id, valid_from, valid_to);
CREATE INDEX ix_doctor_assignments_branch_specialty ON doctor_assignments (branch_id, specialty_id);

CREATE TABLE medical_services (
    medical_service_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_code       VARCHAR(50) NOT NULL UNIQUE,
    specialty_id       UUID REFERENCES specialties(specialty_id) ON DELETE SET NULL,
    service_name       VARCHAR(200) NOT NULL,
    service_type       VARCHAR(80) NOT NULL DEFAULT 'CONSULTATION',
    description        TEXT,
    default_duration_minutes INTEGER CHECK (default_duration_minutes IS NULL OR default_duration_minutes > 0),
    status             record_status NOT NULL DEFAULT 'ACTIVE',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_medical_services_specialty ON medical_services (specialty_id, status);

CREATE TABLE service_prices (
    service_price_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medical_service_id UUID NOT NULL REFERENCES medical_services(medical_service_id) ON DELETE RESTRICT,
    currency          CHAR(3) NOT NULL DEFAULT 'VND',
    amount            NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    effective_from    DATE NOT NULL,
    effective_to      DATE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_service_price_dates CHECK (effective_to IS NULL OR effective_to >= effective_from);
CREATE UNIQUE (medical_service_id, effective_from);
CREATE INDEX ix_service_prices_active ON service_prices (medical_service_id, effective_from DESC);

CREATE TABLE work_shifts (
    shift_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id       UUID NOT NULL REFERENCES branches(branch_id) ON DELETE RESTRICT,
    shift_code      VARCHAR(40) NOT NULL,
    shift_name      VARCHAR(100) NOT NULL,
    starts_at_time  TIME NOT NULL,
    ends_at_time    TIME NOT NULL,
    status          record_status NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_shift_times CHECK (ends_at_time > starts_at_time);
    UNIQUE (branch_id, shift_code)
);

CREATE TABLE doctor_schedules (
    schedule_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id       UUID NOT NULL REFERENCES doctors(doctor_id) ON DELETE RESTRICT,
    specialty_id    UUID NOT NULL REFERENCES specialties(specialty_id) ON DELETE RESTRICT,
    branch_id       UUID NOT NULL REFERENCES branches(branch_id) ON DELETE RESTRICT,
    room_id         UUID REFERENCES rooms(room_id) ON DELETE SET NULL,
    shift_id        UUID REFERENCES work_shifts(shift_id) ON DELETE SET NULL,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    status          doctor_schedule_status NOT NULL DEFAULT 'DRAFT',
    published_at    TIMESTAMPTZ,
    created_by_user_id UUID, -- External IAM identifier.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_doctor_schedule_times CHECK (ends_at > starts_at);
);
-- Prevent overlapping published schedules for the same doctor.
ALTER TABLE doctor_schedules
    ADD CONSTRAINT ex_doctor_schedules_no_overlap
    EXCLUDE USING gist (
        doctor_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
    ) WHERE (status = 'PUBLISHED');
CREATE INDEX ix_doctor_schedules_doctor_time ON doctor_schedules (doctor_id, starts_at, ends_at);
CREATE INDEX ix_doctor_schedules_branch_time ON doctor_schedules (branch_id, starts_at);

CREATE TABLE doctor_leaves (
    leave_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id         UUID NOT NULL REFERENCES doctors(doctor_id) ON DELETE RESTRICT,
    starts_at         TIMESTAMPTZ NOT NULL,
    ends_at           TIMESTAMPTZ NOT NULL,
    reason            TEXT,
    status            doctor_leave_status NOT NULL DEFAULT 'PENDING',
    requested_by_user_id UUID, -- External IAM identifier.
    reviewed_by_user_id  UUID, -- External IAM identifier.
    reviewed_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_doctor_leave_times CHECK (ends_at > starts_at);
CREATE INDEX ix_doctor_leaves_doctor_time ON doctor_leaves (doctor_id, starts_at, ends_at);

CREATE TABLE holidays (
    holiday_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id      UUID REFERENCES branches(branch_id) ON DELETE CASCADE,
    holiday_date   DATE NOT NULL,
    holiday_name   VARCHAR(150) NOT NULL,
    description   TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_holiday_branch_date ON holidays (branch_id, holiday_date) WHERE branch_id IS NOT NULL;
CREATE UNIQUE INDEX uq_holiday_global_date ON holidays (holiday_date) WHERE branch_id IS NULL;
CREATE INDEX ix_holidays_date ON holidays (holiday_date);

CREATE TABLE provider_audit_logs (
    audit_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id   UUID,
    entity_type     VARCHAR(80) NOT NULL,
    entity_id       UUID,
    action_code     VARCHAR(100) NOT NULL,
    before_data     JSONB,
    after_data      JSONB,
    reason          TEXT,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_provider_audit_entity_time ON provider_audit_logs (entity_type, entity_id, occurred_at DESC);

-- Provider owns working availability. Scheduling consumes schedule IDs/events and owns booked capacity.

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