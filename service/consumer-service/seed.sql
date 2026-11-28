-- Consumer Service Demo Seed (idempotent, synthetic data only)
-- Seeds 3 demo patients:
--   1. Linked Patient account (user_id IS NOT NULL) for SELF scope tests
--   2. Walk-in patient (user_id IS NULL) for Receptionist / ASSIGNED tests
--   3. Patient with allergy/medical note (synthetic data)

INSERT INTO patients (
    patient_id, patient_code, user_id, first_name, middle_name, last_name,
    date_of_birth, gender, profile_status, note, created_by_user_id, updated_by_user_id
) VALUES
(
    '11111111-1111-4111-8111-111111111101',
    'BN-DEMO-0001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
    'An', 'Văn', 'Nguyễn',
    '1995-05-20', 'MALE', 'ACTIVE',
    'Hồ sơ bệnh nhân có tài khoản IAM liên kết (dữ liệu demo).',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'
),
(
    '11111111-1111-4111-8111-111111111102',
    'BN-DEMO-0002',
    NULL,
    'Bình', 'Thị', 'Trần',
    '1988-11-12', 'FEMALE', 'ACTIVE',
    'Bệnh nhân walk-in chưa liên kết tài khoản IAM (dữ liệu demo).',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'
),
(
    '11111111-1111-4111-8111-111111111103',
    'BN-DEMO-0003',
    NULL,
    'Châu', 'Minh', 'Lê',
    '2001-03-08', 'OTHER', 'ACTIVE',
    'Dị ứng penicillin, dị ứng hải sản nhẹ (dữ liệu demo).',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01'
)
ON CONFLICT (patient_code) DO NOTHING;

INSERT INTO patient_contacts (
    contact_id, patient_id, contact_type, contact_value, is_primary, is_verified
) VALUES
('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101', 'PHONE', '0901000001', TRUE, TRUE),
('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111101', 'EMAIL', 'an.nguyen.demo@medibook.local', TRUE, TRUE),
('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111102', 'PHONE', '0902000002', TRUE, FALSE),
('22222222-2222-4222-8222-222222222204', '11111111-1111-4111-8111-111111111103', 'PHONE', '0903000003', TRUE, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO patient_addresses (
    address_id, patient_id, address_type, address_line, ward, district, province, country, is_primary
) VALUES
('33333333-3333-4333-8333-333333333301', '11111111-1111-4111-8111-111111111101', 'HOME', '123 Nguyễn Trãi', 'Phường Bến Thành', 'Quận 1', 'TP. Hồ Chí Minh', 'Vietnam', TRUE),
('33333333-3333-4333-8333-333333333302', '11111111-1111-4111-8111-111111111102', 'HOME', '45 Lê Lợi', 'Phường Bến Nghé', 'Quận 1', 'TP. Hồ Chí Minh', 'Vietnam', TRUE),
('33333333-3333-4333-8333-333333333303', '11111111-1111-4111-8111-111111111103', 'HOME', '78 Hai Bà Trưng', 'Phường Đa Kao', 'Quận 1', 'TP. Hồ Chí Minh', 'Vietnam', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO patient_emergency_contacts (
    emergency_contact_id, patient_id, full_name, relationship, phone, note
) VALUES
('44444444-4444-4444-8444-444444444401', '11111111-1111-4111-8111-111111111101', 'Nguyễn Thị Hoa', 'MOTHER', '0911000001', 'Liên hệ khẩn cấp mẫu'),
('44444444-4444-4444-8444-444444444403', '11111111-1111-4111-8111-111111111103', 'Lê Văn Hùng', 'FATHER', '0913000003', 'Biết tiền sử dị ứng penicillin')
ON CONFLICT (emergency_contact_id) DO NOTHING;

INSERT INTO patient_profile_audit (
    patient_id, actor_user_id, action_code, before_data, after_data, reason
)
SELECT
    '11111111-1111-4111-8111-111111111101',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
    'PATIENT_PROFILE_CREATED',
    NULL,
    '{"patientCode": "BN-DEMO-0001", "profileStatus": "ACTIVE"}'::jsonb,
    'Seed hồ sơ bệnh nhân demo có tài khoản IAM'
WHERE NOT EXISTS (
    SELECT 1 FROM patient_profile_audit
    WHERE patient_id = '11111111-1111-4111-8111-111111111101'
      AND action_code = 'PATIENT_PROFILE_CREATED'
);

INSERT INTO patient_profile_audit (
    patient_id, actor_user_id, action_code, before_data, after_data, reason
)
SELECT
    '11111111-1111-4111-8111-111111111103',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
    'PATIENT_NOTE_UPDATED',
    '{"note": null}'::jsonb,
    '{"note": "Dị ứng penicillin, dị ứng hải sản nhẹ (dữ liệu demo)."}'::jsonb,
    'Ghi nhận thông tin dị ứng mẫu'
WHERE NOT EXISTS (
    SELECT 1 FROM patient_profile_audit
    WHERE patient_id = '11111111-1111-4111-8111-111111111103'
      AND action_code = 'PATIENT_NOTE_UPDATED'
);
