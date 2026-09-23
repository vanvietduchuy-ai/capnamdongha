-- =====================================================================
-- BỔ SUNG: GHI NHẬN LÝ DO VẮNG MẶT & BÁO CÁO CÁN BỘ VẮNG MẶT
-- Chạy SAU 01_schema.sql và 02_auth_otp.sql. An toàn, chạy lại nhiều lần.
-- =====================================================================

-- 1. BẢNG LÝ DO VẮNG MẶT (mỗi cán bộ / mỗi phiên điểm danh 1 dòng)
CREATE TABLE IF NOT EXISTS attendance_absences (id text PRIMARY KEY);
ALTER TABLE attendance_absences ADD COLUMN IF NOT EXISTS "sessionId" text;
ALTER TABLE attendance_absences ADD COLUMN IF NOT EXISTS "userId"    text;
ALTER TABLE attendance_absences ADD COLUMN IF NOT EXISTS excused     boolean;   -- true: có lý do, false: không lý do, null: chưa xác minh
ALTER TABLE attendance_absences ADD COLUMN IF NOT EXISTS reason      text;      -- nội dung lý do / ghi chú
ALTER TABLE attendance_absences ADD COLUMN IF NOT EXISTS "updatedBy" text;
ALTER TABLE attendance_absences ADD COLUMN IF NOT EXISTS "updatedAt" bigint;
ALTER TABLE attendance_absences REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_absence_user_session') THEN
    ALTER TABLE attendance_absences
      ADD CONSTRAINT unique_absence_user_session UNIQUE ("sessionId", "userId");
  END IF;
END
$$;

-- 2. CHỈ MỤC TĂNG TỐC TRA CỨU BÁO CÁO
CREATE INDEX IF NOT EXISTS idx_att_records_session  ON attendance_records ("sessionId");
CREATE INDEX IF NOT EXISTS idx_att_sessions_created ON attendance_sessions ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_att_absences_session ON attendance_absences ("sessionId");
CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications ("userId");

-- 3. QUYỀN TRUY CẬP (đồng bộ với các bảng nghiệp vụ khác)
ALTER TABLE attendance_absences ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public Access Attendance Absences') THEN
    CREATE POLICY "Public Access Attendance Absences" ON attendance_absences FOR ALL USING (true);
  END IF;
END
$$;

-- 4. ĐỒNG BỘ TỨC THỜI
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND tablename = 'attendance_absences') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE attendance_absences;
  END IF;
END
$$;

-- 5. BỔ SUNG CỘT CÒN THIẾU (mã nguồn có dùng nhưng lược đồ gốc chưa có)
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS fingerprint  text;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "guestName"  text;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "guestUnit"  text;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "guestPhone" text;
ALTER TABLE calendar_events    ADD COLUMN IF NOT EXISTS department   text;
