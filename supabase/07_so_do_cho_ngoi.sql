-- =====================================================================
-- 07. SƠ ĐỒ CHỖ NGỒI & ĐỐI SÁNH KHI ĐIỂM DANH
-- Chạy SAU 01–06. An toàn, chạy lại nhiều lần không mất dữ liệu.
--
--  - seating_layouts        : sơ đồ hội trường (nhập từ Excel), mỗi ghế gắn 1 cán bộ
--  - attendance_sessions    : thêm "seatLayoutId", "seatCompare" (bật đối sánh cho hội nghị)
--  - attendance_seat_flags  : chỉ huy đối sánh tại chỗ: Nghi vấn (đã quét nhưng không thấy
--                             ngồi tại ghế) / Đã xác nhận có mặt đúng chỗ
--  Đọc: công khai như các bảng điểm danh khác. Ghi: chỉ qua hàm app_*, người có quyền quản lý hội nghị.
-- =====================================================================

-- 1. BẢNG SƠ ĐỒ
CREATE TABLE IF NOT EXISTS seating_layouts (id text PRIMARY KEY);
ALTER TABLE seating_layouts ADD COLUMN IF NOT EXISTS name        text;
ALTER TABLE seating_layouts ADD COLUMN IF NOT EXISTS rows        int;
ALTER TABLE seating_layouts ADD COLUMN IF NOT EXISTS "leftCols"  int;
ALTER TABLE seating_layouts ADD COLUMN IF NOT EXISTS "rightCols" int;
ALTER TABLE seating_layouts ADD COLUMN IF NOT EXISTS seats       jsonb;   -- [{r,c,label,team,userId}]
ALTER TABLE seating_layouts ADD COLUMN IF NOT EXISTS "updatedAt" bigint;
ALTER TABLE seating_layouts ADD COLUMN IF NOT EXISTS "updatedBy" text;

-- 2. HỘI NGHỊ: BẬT ĐỐI SÁNH
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS "seatLayoutId" text;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS "seatCompare"  boolean DEFAULT false;

-- 3. ĐÁNH DẤU KHI ĐỐI SÁNH
CREATE TABLE IF NOT EXISTS attendance_seat_flags (id text PRIMARY KEY);   -- `${sessionId}__${userId}`
ALTER TABLE attendance_seat_flags ADD COLUMN IF NOT EXISTS "sessionId" text;
ALTER TABLE attendance_seat_flags ADD COLUMN IF NOT EXISTS "userId"    text;
ALTER TABLE attendance_seat_flags ADD COLUMN IF NOT EXISTS status      text;  -- SUSPECT | CONFIRMED
ALTER TABLE attendance_seat_flags ADD COLUMN IF NOT EXISTS "flaggedBy" text;
ALTER TABLE attendance_seat_flags ADD COLUMN IF NOT EXISTS "flaggedAt" bigint;
ALTER TABLE attendance_seat_flags REPLICA IDENTITY FULL;
CREATE INDEX IF NOT EXISTS idx_seat_flags_session ON attendance_seat_flags ("sessionId");

-- 4. QUYỀN TRUY CẬP: đọc công khai, ghi qua hàm
ALTER TABLE seating_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_seat_flags ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Read Seating Layouts') THEN
    CREATE POLICY "Read Seating Layouts" ON seating_layouts FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Read Seat Flags') THEN
    CREATE POLICY "Read Seat Flags" ON attendance_seat_flags FOR SELECT USING (true);
  END IF;
END
$$;
GRANT SELECT ON seating_layouts, attendance_seat_flags TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON seating_layouts       FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON attendance_seat_flags FROM anon, authenticated;

-- 5. ĐỒNG BỘ TỨC THỜI
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['seating_layouts', 'attendance_seat_flags'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- 6. LƯU / XOÁ SƠ ĐỒ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_save_layout(p_token text, p_layout jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE; v_id text; v_rows int; v_l int; v_r int; v_seats jsonb;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền quản lý sơ đồ chỗ ngồi.'); END IF;
  IF length(trim(coalesce(p_layout->>'name', ''))) = 0 THEN RETURN err('Vui lòng đặt tên sơ đồ.'); END IF;

  v_rows := greatest(1, least(coalesce((p_layout->>'rows')::int, 1), 40));
  v_l    := greatest(0, least(coalesce((p_layout->>'leftCols')::int, 0), 30));
  v_r    := greatest(0, least(coalesce((p_layout->>'rightCols')::int, 0), 30));
  IF v_l + v_r = 0 THEN RETURN err('Sơ đồ chưa có ghế nào.'); END IF;
  v_seats := CASE WHEN jsonb_typeof(p_layout->'seats') = 'array' THEN p_layout->'seats' ELSE '[]'::jsonb END;
  IF jsonb_array_length(v_seats) > 1200 THEN RETURN err('Sơ đồ quá lớn (tối đa 1200 ghế).'); END IF;

  v_id := coalesce(nullif(p_layout->>'id', ''), 'lay_' || now_ms() || '_' || substr(md5(random()::text), 1, 6));
  INSERT INTO seating_layouts (id, name, rows, "leftCols", "rightCols", seats, "updatedAt", "updatedBy")
  VALUES (v_id, trim(p_layout->>'name'), v_rows, v_l, v_r, v_seats, now_ms(), actor.id)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, rows = EXCLUDED.rows, "leftCols" = EXCLUDED."leftCols", "rightCols" = EXCLUDED."rightCols",
    seats = EXCLUDED.seats, "updatedAt" = EXCLUDED."updatedAt", "updatedBy" = EXCLUDED."updatedBy";

  RETURN jsonb_build_object('ok', true, 'layout', (SELECT to_jsonb(x) FROM seating_layouts x WHERE id = v_id));
END;
$$;

CREATE OR REPLACE FUNCTION app_delete_layout(p_token text, p_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền quản lý sơ đồ chỗ ngồi.'); END IF;
  IF EXISTS (SELECT 1 FROM attendance_sessions WHERE "seatLayoutId" = p_id AND status IN ('DRAFT', 'OPEN')) THEN
    RETURN err('Sơ đồ đang được dùng cho hội nghị chưa kết thúc, chưa xoá được.');
  END IF;
  DELETE FROM seating_layouts WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 7. BẬT / TẮT ĐỐI SÁNH CHO HỘI NGHỊ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_set_meeting_seating(p_token text, p_session_id text, p_layout_id text, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền quản lý hội nghị.'); END IF;
  IF NOT EXISTS (SELECT 1 FROM attendance_sessions WHERE id = p_session_id) THEN RETURN err('Không tìm thấy hội nghị.'); END IF;
  IF coalesce(p_enabled, false) AND NOT EXISTS (SELECT 1 FROM seating_layouts WHERE id = p_layout_id) THEN
    RETURN err('Chưa chọn sơ đồ chỗ ngồi.');
  END IF;
  UPDATE attendance_sessions
     SET "seatCompare" = coalesce(p_enabled, false),
         "seatLayoutId" = CASE WHEN coalesce(p_enabled, false) THEN p_layout_id ELSE coalesce(nullif(p_layout_id, ''), "seatLayoutId") END
   WHERE id = p_session_id;
  RETURN jsonb_build_object('ok', true,
    'session', (SELECT to_jsonb(x) FROM attendance_sessions x WHERE id = p_session_id));
END;
$$;

-- ---------------------------------------------------------------------
-- 8. ĐỐI SÁNH TẠI CHỖ: đánh dấu Nghi vấn / Đã xác nhận / Bỏ đánh dấu (p_status NULL)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_flag_seat(p_token text, p_session_id text, p_user_id text, p_status text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE; v_id text := p_session_id || '__' || p_user_id;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền đối sánh điểm danh.'); END IF;
  IF NOT EXISTS (SELECT 1 FROM attendance_sessions WHERE id = p_session_id) THEN RETURN err('Không tìm thấy hội nghị.'); END IF;

  IF p_status IS NULL OR p_status = '' THEN
    DELETE FROM attendance_seat_flags WHERE id = v_id;
  ELSIF p_status IN ('SUSPECT', 'CONFIRMED') THEN
    INSERT INTO attendance_seat_flags (id, "sessionId", "userId", status, "flaggedBy", "flaggedAt")
    VALUES (v_id, p_session_id, p_user_id, p_status, actor.id, now_ms())
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, "flaggedBy" = EXCLUDED."flaggedBy", "flaggedAt" = EXCLUDED."flaggedAt";
  ELSE
    RETURN err('Trạng thái không hợp lệ.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 9. QUYỀN GỌI HÀM
-- ---------------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('app_save_layout', 'app_delete_layout', 'app_set_meeting_seating', 'app_flag_seat')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
