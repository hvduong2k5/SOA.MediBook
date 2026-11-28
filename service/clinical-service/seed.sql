-- Clinical Service Demo Seed (idempotent, synthetic data only)
-- Seeds:
--   1. 10 test_catalog items
--   2. 1 PUBLISHED demo encounter for BN-DEMO-0001 (patient_id = 11111111-1111-4111-8111-111111111101)
--      with notes, symptoms, findings, diagnosis, test order/item/result, prescription/item,
--      follow-up recommendation, version 1 snapshot, and PHI audit log (no PHI in metadata).

INSERT INTO test_catalog (test_catalog_id, test_code, test_name, category, description, is_active)
VALUES
('c1000000-0000-4000-8000-000000000001', 'LAB-CBC', 'Công thức máu toàn phần (CBC)', 'HEMATOLOGY', 'Đánh giá hồng cầu, bạch cầu, tiểu cầu', TRUE),
('c1000000-0000-4000-8000-000000000002', 'LAB-GLU', 'Đường huyết lúc đói (Fasting Glucose)', 'BIOCHEMISTRY', 'Sàng lọc rối loạn đường huyết', TRUE),
('c1000000-0000-4000-8000-000000000003', 'LAB-HBA1C', 'HbA1c', 'BIOCHEMISTRY', 'Theo dõi đường huyết trung bình 3 tháng', TRUE),
('c1000000-0000-4000-8000-000000000004', 'LAB-LIPID', 'Bộ mỡ máu (Cholesterol, TG, HDL, LDL)', 'BIOCHEMISTRY', 'Đánh giá nguy cơ tim mạch', TRUE),
('c1000000-0000-4000-8000-000000000005', 'LAB-LFT', 'Chức năng gan (AST, ALT)', 'BIOCHEMISTRY', 'Đánh giá men gan', TRUE),
('c1000000-0000-4000-8000-000000000006', 'LAB-RFT', 'Chức năng thận (Urea, Creatinine)', 'BIOCHEMISTRY', 'Đánh giá mức lọc cầu thận', TRUE),
('c1000000-0000-4000-8000-000000000007', 'LAB-UA', 'Tổng phân tích nước tiểu', 'URINALYSIS', 'Sàng lọc nhiễm khuẩn và bệnh lý thận', TRUE),
('c1000000-0000-4000-8000-000000000008', 'IMG-CXR', 'X-quang ngực thẳng', 'IMAGING', 'Đánh giá phổi và trung thất', TRUE),
('c1000000-0000-4000-8000-000000000009', 'IMG-ABD-US', 'Siêu âm ổ bụng tổng quát', 'IMAGING', 'Đánh giá gan, mật, tụy, lách, thận', TRUE),
('c1000000-0000-4000-8000-000000000010', 'CARD-ECG', 'Điện tâm đồ 12 chuyển đạo (ECG)', 'CARDIOLOGY', 'Đánh giá nhịp tim và dẫn truyền', TRUE)
ON CONFLICT (test_code) DO NOTHING;

-- 1 PUBLISHED demo encounter linked to BN-DEMO-0001
INSERT INTO medical_encounters (
    encounter_id, encounter_code, queue_ticket_id, patient_id, doctor_id,
    specialty_id, branch_id, room_id, status, chief_complaint,
    started_at, completed_at, published_at, published_by_user_id, record_version,
    created_by_user_id, updated_by_user_id
) VALUES (
    'e1000000-0000-4000-8000-000000000001',
    'ENC-DEMO-0001',
    'a1000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111101',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'd1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'PUBLISHED',
    'Khám sức khỏe định kỳ, hơi mệt buổi sáng (dữ liệu demo)',
    '2026-11-27T08:30:00Z',
    '2026-11-27T09:00:00Z',
    '2026-11-27T09:05:00Z',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    1,
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
) ON CONFLICT (encounter_code) DO NOTHING;

INSERT INTO clinical_notes (note_id, encounter_id, note_type, content, author_user_id)
VALUES (
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'SUMMARY',
    'Tổng trạng ổn định, các chỉ số xét nghiệm cơ bản trong giới hạn bình thường (demo).',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
) ON CONFLICT (note_id) DO NOTHING;

INSERT INTO encounter_symptoms (symptom_id, encounter_id, symptom_name, severity, description)
VALUES (
    'e3000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'Mệt nhẹ buổi sáng',
    3,
    'Không sốt, không khó thở (dữ liệu demo)'
) ON CONFLICT (symptom_id) DO NOTHING;

INSERT INTO examination_findings (finding_id, encounter_id, body_system, finding_name, finding_value, unit, reference_range, is_abnormal)
VALUES (
    'e4000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'CARDIOVASCULAR',
    'Huyết áp tâm thu / tâm trương',
    '118/76',
    'mmHg',
    '90/60 - 120/80',
    FALSE
) ON CONFLICT (finding_id) DO NOTHING;

INSERT INTO diagnoses (diagnosis_id, encounter_id, diagnosis_code, diagnosis_name, diagnosis_kind, diagnosed_by_user_id)
VALUES (
    'e5000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'Z00.0',
    'Khám sức khỏe tổng quát định kỳ (demo)',
    'PRIMARY',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
) ON CONFLICT (diagnosis_id) DO NOTHING;

INSERT INTO test_orders (test_order_id, encounter_id, order_code, ordered_by_user_id, status, clinical_indication, completed_at)
VALUES (
    'e6000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'ORD-DEMO-0001',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'COMPLETED',
    'Kiểm tra đường huyết định kỳ',
    '2026-11-27T08:55:00Z'
) ON CONFLICT (order_code) DO NOTHING;

INSERT INTO test_order_items (test_order_item_id, test_order_id, test_catalog_id, test_code_snapshot, test_name_snapshot, status)
VALUES (
    'e7000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'LAB-GLU',
    'Đường huyết lúc đói (Fasting Glucose)',
    'COMPLETED'
) ON CONFLICT (test_order_item_id) DO NOTHING;

INSERT INTO test_results (test_result_id, test_order_item_id, result_status, result_summary, result_data, performed_at, verified_by_user_id, verified_at)
VALUES (
    'e8000000-0000-4000-8000-000000000001',
    'e7000000-0000-4000-8000-000000000001',
    'FINAL',
    'Đường huyết bình thường',
    '{"glucoseMmolL": 5.1, "referenceRange": "3.9 - 5.6"}'::jsonb,
    '2026-11-27T08:50:00Z',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '2026-11-27T08:55:00Z'
) ON CONFLICT (test_result_id) DO NOTHING;

INSERT INTO prescriptions (prescription_id, encounter_id, prescription_code, status, instructions, issued_by_user_id, issued_at)
VALUES (
    'e9000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'RX-DEMO-0001',
    'ISSUED',
    'Uống sau ăn sáng (dữ liệu demo)',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '2026-11-27T09:02:00Z'
) ON CONFLICT (prescription_code) DO NOTHING;

INSERT INTO prescription_items (prescription_item_id, prescription_id, medication_code, medication_name, strength, dosage, route, frequency, duration_days, quantity, usage_instruction)
VALUES (
    'ea000000-0000-4000-8000-000000000001',
    'e9000000-0000-4000-8000-000000000001',
    'MED-VITC-500',
    'Vitamin C 500mg (demo)',
    '500mg',
    '1 viên',
    'ORAL',
    '1 lần/ngày',
    10,
    10.00,
    'Uống sau bữa sáng'
) ON CONFLICT (prescription_item_id) DO NOTHING;

INSERT INTO follow_up_recommendations (follow_up_id, encounter_id, recommended_after_days, instructions, created_by_user_id)
VALUES (
    'eb000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    180,
    'Tái khám định kỳ sau 6 tháng (demo)',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
) ON CONFLICT (follow_up_id) DO NOTHING;

INSERT INTO medical_record_versions (version_id, encounter_id, version_number, snapshot, version_reason, created_by_user_id)
VALUES (
    'ec000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    1,
    '{"encounterCode": "ENC-DEMO-0001", "status": "PUBLISHED", "recordVersion": 1}'::jsonb,
    'Initial publish (demo)',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
) ON CONFLICT (encounter_id, version_number) DO NOTHING;

INSERT INTO clinical_audit_logs (encounter_id, patient_id, actor_user_id, action_code, resource_type, resource_id, metadata, reason)
SELECT
    'e1000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111101',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'ENCOUNTER_PUBLISHED',
    'Encounter',
    'e1000000-0000-4000-8000-000000000001',
    '{"recordVersion": 1}'::jsonb,
    'Seed published demo encounter'
WHERE NOT EXISTS (
    SELECT 1 FROM clinical_audit_logs
    WHERE encounter_id = 'e1000000-0000-4000-8000-000000000001'
      AND action_code = 'ENCOUNTER_PUBLISHED'
);
