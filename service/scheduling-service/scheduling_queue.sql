-- Scheduling & Queue Service
-- Database: scheduling_queue_db
-- Owns appointments, slots, reservations, check-ins and operational queue tickets.
-- patient_id, doctor_id, room_id, branch_id, specialty_id and user_id are external UUID references.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE appointment_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'EXPIRED');
CREATE TYPE booking_source AS ENUM ('ONLINE', 'RECEPTION');
CREATE TYPE slot_status AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');
CREATE TYPE reservation_status AS ENUM ('HELD', 'CONVERTED', 'EXPIRED', 'RELEASED');
CREATE TYPE queue_ticket_source AS ENUM ('APPOINTMENT', 'WALK_IN');
CREATE TYPE queue_ticket_status AS ENUM ('WAITING', 'CALLED', 'IN_PROGRESS', 'COMPLETED', 'LATE', 'NO_SHOW', 'TRANSFERRED', 'CANCELLED');
CREATE TYPE doctor_operational_state AS ENUM ('AVAILABLE', 'BUSY', 'ON_BREAK', 'OFFLINE');

CREATE TABLE booking_policies (
    policy_id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_name            VARCHAR(120) NOT NULL,
    policy_type          VARCHAR(80) NOT NULL,
    max_advance_booking_days INTEGER NOT NULL DEFAULT 30,
    max_advance_checkin_days INTEGER NOT NULL DEFAULT 7,
    min_advance_booking_days  INTEGER NOT NULL DEFAULT 0,
    cancellation_window_minutes INTEGER NOT NULL DEFAULT 15,
    no_show_threshold_minutes INTEGER NOT NULL DEFAULT 15,
    allow_online_cancellation BOOLEAN NOT NULL DEFAULT TRUE,
    allow_online_reschedule   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (policy_name)
);

CREATE TABLE appointments (
    appointment_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_ticket_id    UUID NOT NULL UNIQUE, -- External Scheduling & Queue ID; one appointment per queue ticket.
    patient_id         UUID NOT NULL,        -- External Consumer ID.
    doctor_id          UUID NOT NULL,        -- External Provider ID.
    branch_id          UUID NOT NULL,        -- External Branch ID.
    room_id            UUID,               -- External Room ID.
    specialty_id       UUID,               -- External Provider ID snapshot.
    appointment_code   VARCHAR(50) NOT NULL UNIQUE,
    source             booking_source NOT NULL DEFAULT 'ONLINE',
    status             appointment_status NOT NULL DEFAULT 'PENDING',
    scheduled_at       TIMESTAMPTZ NOT NULL,
    started_at         TIMESTAMPTZ,
    completed_at       TIMESTAMPTZ,
    cancelled_at       TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_by_user_id UUID, -- External IAM identifier.
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_appointment_schedule CHECK (started_at IS NULL OR completed_at IS NULL OR started_at <= completed_at)
);

CREATE INDEX ix_appointments_patient_time ON appointments (patient_id, scheduled_at DESC);
CREATE INDEX ix_appointments_doctor_time ON appointments (doctor_id, scheduled_at DESC);
CREATE INDEX ix_appointments_status ON appointments (status, scheduled_at DESC);
CREATE INDEX ix_appointments_queue_ticket ON appointments (queue_ticket_id);

CREATE TABLE slots (
    slot_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id         UUID NOT NULL REFERENCES branches(branch_id) ON DELETE RESTRICT,
    room_id           UUID REFERENCES rooms(room_id) ON DELETE SET NULL,
    doctor_id         UUID REFERENCES doctors(doctor_id) ON DELETE SET NULL,
    specialty_id      UUID REFERENCES specialties(specialty_id) ON DELETE SET NULL,
    shift_id          UUID REFERENCES work_shifts(shift_id) ON DELETE SET NULL,
    starts_at         TIMESTAMPTZ NOT NULL,
    ends_at           TIMESTAMPTZ NOT NULL,
    slot_status       slot_status NOT NULL DEFAULT 'OPEN',
    capacity          INTEGER NOT NULL DEFAULT 1,
    booked_count      INTEGER NOT NULL DEFAULT 0,
    appointment_id    UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_slot_times CHECK (ends_at > starts_at)
);

CREATE INDEX ix_slots_branch_time ON slots (branch_id, starts_at, ends_at);
CREATE INDEX ix_slots_doctor_time ON slots (doctor_id, starts_at, ends_at);
CREATE INDEX ix_slots_status ON slots (slot_status);

CREATE TABLE reservations (
    reservation_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id           UUID NOT NULL REFERENCES slots(slot_id) ON DELETE CASCADE,
    patient_id        UUID NOT NULL,        -- External Consumer ID.
    queue_ticket_id   UUID NOT NULL UNIQUE, -- External Scheduling & Queue ID.
    reservation_status reservation_status NOT NULL DEFAULT 'HELD',
    reserved_at       TIMESTAMPTZ NOT NULL,
    converted_at      TIMESTAMPTZ,
    expires_at        TIMESTAMPTZ NOT NULL,
    cancelled_at      TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_reservation_lifetime CHECK (expires_at > reserved_at)
);

CREATE INDEX ix_reservations_slot_id ON reservations (slot_id);
CREATE INDEX ix_reservations_patient_time ON reservations (patient_id, reserved_at DESC);
CREATE INDEX ix_reservations_status ON reservations (reservation_status);

CREATE TABLE check_ins (
    check_in_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id   UUID NOT NULL REFERENCES appointments(appointment_id) ON DELETE CASCADE,
    patient_id       UUID NOT NULL,        -- External Consumer ID.
    checked_in_at    TIMESTAMPTZ NOT NULL,
    check_in_method  VARCHAR(50) NOT NULL DEFAULT 'RECEPTION', -- ONLINE, RECEPTION, SELF_SERVICE
    queue_ticket_id  UUID NOT NULL UNIQUE, -- External Scheduling & Queue ID.
    status           queue_ticket_status NOT NULL DEFAULT 'WAITING',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_checkins_appointment ON check_ins (appointment_id);
CREATE INDEX ix_checkins_patient_unread ON check_ins (patient_id, checked_in_at DESC)
    WHERE status IN ('WAITING', 'CALLED', 'IN_PROGRESS');
CREATE INDEX ix_checkins_queue_ticket ON check_ins (queue_ticket_id);

CREATE TABLE queue_tickets (
    queue_ticket_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id     UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    patient_id         UUID NOT NULL,        -- External Consumer ID.
    doctor_id          UUID NOT NULL,        -- External Provider ID.
    branch_id          UUID NOT NULL,        -- External Branch ID.
    room_id            UUID,               -- External Room ID.
    source             queue_ticket_source NOT NULL DEFAULT 'WALK_IN',
    status             queue_ticket_status NOT NULL DEFAULT 'WAITING',
    ticket_number      INTEGER NOT NULL,
    called_at          TIMESTAMPTZ,
    completed_at       TIMESTAMPTZ,
    cancelled_at       TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_queue_tickets_patient_time ON queue_tickets (patient_id, created_at DESC);
CREATE INDEX ix_queue_tickets_doctor_time ON queue_tickets (doctor_id, created_at DESC);
CREATE INDEX ix_queue_tickets_status ON queue_tickets (status, created_at DESC);
CREATE INDEX ix_queue_tickets_appointment ON queue_tickets (appointment_id);

CREATE TABLE appointment_cancellation_logs (
    log_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    appointment_id   UUID NOT NULL REFERENCES appointments(appointment_id) ON DELETE CASCADE,
    cancelled_by_user_id UUID, -- External IAM identifier.
    cancellation_reason TEXT,
    cancelled_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_cancellation_logs_appointment ON appointment_cancellation_logs (appointment_id);

-- Service-level counters and views for dashboards.
CREATE VIEW v_appointments_by_status AS
SELECT status, COUNT(*)::BIGINT AS appointment_count
FROM appointments
GROUP BY status;

CREATE VIEW v_slots_by_status AS
SELECT slot_status, COUNT(*)::BIGINT AS slot_count
FROM slots
GROUP BY slot_status;

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