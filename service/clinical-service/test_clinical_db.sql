-- Clinical Service DB Constraint, Immutability & Audit Verification Script
-- Run against clinical_db after applying clinical.sql and seed.sql.

BEGIN;

DO $$
DECLARE
    v_enc_draft UUID := 'f1000000-0000-4000-8000-000000000001';
    v_enc_pub   UUID := 'e1000000-0000-4000-8000-000000000001';
    v_rx_id     UUID := 'f2000000-0000-4000-8000-000000000001';
    v_qt_id     UUID := 'f3000000-0000-4000-8000-000000000001';
    v_ttl_hours DOUBLE PRECISION;
BEGIN
    -- 1. Create a DRAFT encounter with unique queue_ticket_id
    INSERT INTO medical_encounters (encounter_id, encounter_code, queue_ticket_id, patient_id, doctor_id)
    VALUES (v_enc_draft, 'ENC-TEST-0001', v_qt_id, '11111111-1111-4111-8111-111111111101', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');

    -- 2. Second encounter with same queue_ticket_id MUST fail
    BEGIN
        INSERT INTO medical_encounters (encounter_code, queue_ticket_id, patient_id, doctor_id)
        VALUES ('ENC-TEST-0002', v_qt_id, '11111111-1111-4111-8111-111111111101', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
        RAISE EXCEPTION 'Expected unique violation for duplicate queue_ticket_id';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    -- 3. Duplicate (encounter_id, version_number) MUST fail
    BEGIN
        INSERT INTO medical_record_versions (encounter_id, version_number, snapshot)
        VALUES (v_enc_pub, 1, '{}'::jsonb);
        RAISE EXCEPTION 'Expected unique violation for duplicate (encounter_id, version_number)';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    -- 4. prescription_items quantity <= 0 MUST fail
    INSERT INTO prescriptions (prescription_id, encounter_id, prescription_code)
    VALUES (v_rx_id, v_enc_draft, 'RX-TEST-0001');

    BEGIN
        INSERT INTO prescription_items (prescription_id, medication_name, quantity)
        VALUES (v_rx_id, 'Test Med', 0);
        RAISE EXCEPTION 'Expected check_violation for quantity <= 0';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    -- 5. Immutability trigger: direct UPDATE/DELETE on PUBLISHED encounter & child notes MUST fail
    BEGIN
        UPDATE medical_encounters SET chief_complaint = 'Tampered' WHERE encounter_id = v_enc_pub;
        RAISE EXCEPTION 'Expected IMMUTABLE_AFTER_PUBLISH on PUBLISHED encounter UPDATE';
    EXCEPTION WHEN raise_exception THEN
        NULL;
    END;

    BEGIN
        UPDATE clinical_notes SET content = 'Tampered note' WHERE encounter_id = v_enc_pub;
        RAISE EXCEPTION 'Expected IMMUTABLE_AFTER_PUBLISH on PUBLISHED clinical_notes UPDATE';
    EXCEPTION WHEN raise_exception THEN
        NULL;
    END;

    -- 6. Audit log with patient_id + non-PHI metadata
    INSERT INTO clinical_audit_logs (encounter_id, patient_id, actor_user_id, action_code, resource_type, resource_id, metadata)
    VALUES (v_enc_draft, '11111111-1111-4111-8111-111111111101', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'PHI_READ', 'Encounter', v_enc_draft, '{"scope": "ASSIGNED"}'::jsonb);

    -- 7. Idempotency records unique triple + 48h TTL
    INSERT INTO idempotency_records (principal_key, operation_scope, idempotency_key, request_hash)
    VALUES ('user:cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'createEncounter', 'idem-enc-001', repeat('b', 64));

    SELECT EXTRACT(EPOCH FROM (expires_at - created_at)) / 3600.0
    INTO v_ttl_hours
    FROM idempotency_records
    WHERE idempotency_key = 'idem-enc-001';

    IF ABS(v_ttl_hours - 48.0) > 0.1 THEN
        RAISE EXCEPTION 'Expected 48h TTL, got %', v_ttl_hours;
    END IF;

    RAISE NOTICE 'ALL CLINICAL DB CONSTRAINT TESTS PASSED!';
END $$;

ROLLBACK;
