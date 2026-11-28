-- Consumer Service DB Constraint & Idempotency Verification Script
-- Run against consumer_db after applying consumer.sql and seed.sql.
-- Wrapped in a transaction that rolls back test mutations at the end.

BEGIN;

DO $$
DECLARE
    v_test_patient_1 UUID := '99999999-1111-4111-8111-111111111101';
    v_test_patient_2 UUID := '99999999-1111-4111-8111-111111111102';
    v_test_user_id   UUID := '99999999-aaaa-4aaa-8aaa-aaaaaaaaaa99';
    v_ttl_hours      DOUBLE PRECISION;
BEGIN
    -- 1. Walk-in patients (multiple rows with user_id IS NULL) must succeed
    INSERT INTO patients (patient_id, patient_code, user_id, first_name, last_name)
    VALUES
        (v_test_patient_1, 'BN-TEST-0001', v_test_user_id, 'Test', 'One'),
        (v_test_patient_2, 'BN-TEST-0002', NULL, 'WalkIn', 'Two');

    INSERT INTO patients (patient_code, user_id, first_name, last_name)
    VALUES ('BN-TEST-0003', NULL, 'WalkIn', 'Three');

    -- 2. Unique patient_code must fail on duplicate
    BEGIN
        INSERT INTO patients (patient_code, user_id, first_name, last_name)
        VALUES ('BN-TEST-0001', NULL, 'Dup', 'Code');
        RAISE EXCEPTION 'Expected unique violation for duplicate patient_code';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    -- 3. Unique user_id must fail on duplicate non-null user_id
    BEGIN
        INSERT INTO patients (patient_code, user_id, first_name, last_name)
        VALUES ('BN-TEST-0004', v_test_user_id, 'Dup', 'User');
        RAISE EXCEPTION 'Expected unique violation for duplicate user_id';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    -- 4. Partial unique index on patient_contacts (only one is_primary=TRUE per patient_id + contact_type)
    INSERT INTO patient_contacts (patient_id, contact_type, contact_value, is_primary)
    VALUES (v_test_patient_1, 'PHONE', '0999000001', TRUE);

    -- Second primary PHONE for same patient must fail
    BEGIN
        INSERT INTO patient_contacts (patient_id, contact_type, contact_value, is_primary)
        VALUES (v_test_patient_1, 'PHONE', '0999000002', TRUE);
        RAISE EXCEPTION 'Expected unique violation for second primary PHONE contact';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    -- Primary EMAIL or non-primary PHONE for same patient must succeed
    INSERT INTO patient_contacts (patient_id, contact_type, contact_value, is_primary)
    VALUES
        (v_test_patient_1, 'EMAIL', 'test1@medibook.local', TRUE),
        (v_test_patient_1, 'PHONE', '0999000002', FALSE);

    -- 5. Partial unique index on patient_addresses (only one is_primary=TRUE per patient_id)
    INSERT INTO patient_addresses (patient_id, address_type, address_line, is_primary)
    VALUES (v_test_patient_1, 'HOME', '10 Test Street', TRUE);

    BEGIN
        INSERT INTO patient_addresses (patient_id, address_type, address_line, is_primary)
        VALUES (v_test_patient_1, 'MAILING', '20 Test Street', TRUE);
        RAISE EXCEPTION 'Expected unique violation for second primary address';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    -- 6. Audit log JSONB + reason
    INSERT INTO patient_profile_audit (patient_id, actor_user_id, action_code, before_data, after_data, reason)
    VALUES (
        v_test_patient_1,
        v_test_user_id,
        'TEST_AUDIT',
        '{"profileStatus": "PENDING_VERIFICATION"}'::jsonb,
        '{"profileStatus": "ACTIVE"}'::jsonb,
        'Unit test audit JSONB'
    );

    -- 7. Idempotency records unique triple + 48h TTL + completion check
    INSERT INTO idempotency_records (principal_key, operation_scope, idempotency_key, request_hash)
    VALUES ('user:' || v_test_user_id::text, 'createPatient', 'idem-key-001', repeat('a', 64));

    SELECT EXTRACT(EPOCH FROM (expires_at - created_at)) / 3600.0
    INTO v_ttl_hours
    FROM idempotency_records
    WHERE idempotency_key = 'idem-key-001';

    IF ABS(v_ttl_hours - 48.0) > 0.1 THEN
        RAISE EXCEPTION 'Expected 48h TTL on idempotency_records, got %', v_ttl_hours;
    END IF;

    BEGIN
        INSERT INTO idempotency_records (principal_key, operation_scope, idempotency_key, request_hash)
        VALUES ('user:' || v_test_user_id::text, 'createPatient', 'idem-key-001', repeat('a', 64));
        RAISE EXCEPTION 'Expected unique violation on idempotency triple';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    RAISE NOTICE 'ALL CONSUMER DB CONSTRAINT TESTS PASSED!';
END $$;

ROLLBACK;
