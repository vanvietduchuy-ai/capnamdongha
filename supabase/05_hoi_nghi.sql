-- =====================================================================
-- 05. QUY TRÌNH HỘI NGHỊ: TẠO TRƯỚC → CHỌN THÀNH PHẦN → BẮT ĐẦU → KẾT THÚC
-- Chạy SAU 01–04. An toàn, chạy lại nhiều lần không mất dữ liệu.
--
-- Trạng thái phiên (cột status):
--   DRAFT  : đã tạo, chưa bắt đầu điểm danh (chưa có mã QR)
--   OPEN   : đang điểm danh (có mã QR)
--   CLOSED : đã kết thúc (có thể mở lại nếu kết thúc nhầm)
-- =====================================================================

ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS status        text;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS "scheduledAt" bigint;  -- thời gian dự kiến họp
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS location      text;    -- địa điểm
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS "startedAt"   bigint;  -- lúc bấm Bắt đầu lần đầu
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS "endedAt"     bigint;  -- lúc bấm Kết thúc

-- Phiên cũ (tạo trước bản này): suy ra trạng thái
UPDATE attendance_sessions
   SET status = CASE WHEN "isActive" IS NOT FALSE AND "expiresAt" > now_ms() THEN 'OPEN' ELSE 'CLOSED' END,
       "startedAt" = coalesce("startedAt", "createdAt")
 WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_att_sessions_status ON attendance_sessions (status);

-- ---------------------------------------------------------------------
-- Phiên đang mở nhận điểm danh: phải ở trạng thái OPEN, còn hạn
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_session_open(p_session_id text)
RETURNS attendance_sessions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM attendance_sessions
  WHERE id = p_session_id
    AND coalesce(status, 'OPEN') = 'OPEN'
    AND "isActive" IS NOT FALSE
    AND "expiresAt" > now_ms()
$$;

-- Chuẩn hoá danh sách cán bộ: mảng JSON các chuỗi, bỏ trùng, chỉ giữ tài khoản có thật
CREATE OR REPLACE FUNCTION clean_expected(p jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(DISTINCT x ORDER BY x), '[]'::jsonb)
  FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END) AS t(x)
  WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = t.x)
$$;

-- ---------------------------------------------------------------------
-- 1. TẠO / SỬA HỘI NGHỊ
--   - Chưa bắt đầu: sửa tự do tên, thời gian, địa điểm, thành phần.
--   - Đang điểm danh: được đổi tên/địa điểm và BỔ SUNG thành phần (không bớt,
--     tránh xoá người vắng khỏi báo cáo).
--   - Đã kết thúc: chỉ đổi tên/địa điểm.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_save_meeting(
  p_token text, p_id text, p_title text, p_scheduled_at bigint, p_location text, p_expected jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  actor  users%ROWTYPE;
  s      attendance_sessions%ROWTYPE;
  v_id   text;
  v_exp  jsonb := clean_expected(p_expected);
  v_note text := NULL;
  v_st   text;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền quản lý hội nghị.'); END IF;
  IF length(trim(coalesce(p_title, ''))) = 0 THEN RETURN err('Vui lòng nhập tên hội nghị.'); END IF;

  IF nullif(p_id, '') IS NULL THEN
    v_id := 'sess_' || now_ms() || '_' || substr(md5(random()::text), 1, 6);
    INSERT INTO attendance_sessions (id, title, "creatorId", "createdAt", "expiresAt", "isActive",
                                     "expectedUserIds", status, "scheduledAt", location)
    VALUES (v_id, trim(p_title), actor.id, now_ms(), 0, false, v_exp, 'DRAFT',
            p_scheduled_at, nullif(trim(coalesce(p_location, '')), ''));
  ELSE
    SELECT * INTO s FROM attendance_sessions WHERE id = p_id;
    IF NOT FOUND THEN RETURN err('Không tìm thấy hội nghị.'); END IF;
    v_id := s.id;
    v_st := CASE WHEN s.status = 'DRAFT' THEN 'DRAFT'
                 WHEN coalesce(s.status, 'OPEN') = 'OPEN' AND s."isActive" IS NOT FALSE AND s."expiresAt" > now_ms() THEN 'OPEN'
                 ELSE 'CLOSED' END;

    IF v_st = 'DRAFT' THEN
      UPDATE attendance_sessions SET
        title = trim(p_title), "scheduledAt" = p_scheduled_at,
        location = nullif(trim(coalesce(p_location, '')), ''), "expectedUserIds" = v_exp
      WHERE id = v_id;
    ELSIF v_st = 'OPEN' THEN
      -- Chỉ bổ sung, không bớt
      UPDATE attendance_sessions SET
        title = trim(p_title), location = nullif(trim(coalesce(p_location, '')), ''),
        "expectedUserIds" = clean_expected(coalesce("expectedUserIds", '[]'::jsonb) || v_exp)
      WHERE id = v_id;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(s."expectedUserIds", '[]'::jsonb)) o(x)
                 WHERE NOT (v_exp ? o.x)) THEN
        v_note := 'Hội nghị đang điểm danh: chỉ được bổ sung thành phần, không bớt người đã có trong danh sách.';
      END IF;
    ELSE
      UPDATE attendance_sessions SET
        title = trim(p_title), location = nullif(trim(coalesce(p_location, '')), '')
      WHERE id = v_id;
      IF v_exp IS DISTINCT FROM clean_expected(s."expectedUserIds") THEN
        v_note := 'Hội nghị đã kết thúc: không thay đổi được thành phần tham dự.';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'note', v_note,
    'session', (SELECT to_jsonb(x) FROM attendance_sessions x WHERE id = v_id));
END;
$$;

-- ---------------------------------------------------------------------
-- 2. BẮT ĐẦU ĐIỂM DANH (tạo mã QR) — cũng dùng để MỞ LẠI phiên đã kết thúc
--    p_auto_end_minutes: tự đóng sau bao nhiêu phút nếu quên bấm Kết thúc
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_start_session(p_token text, p_id text, p_auto_end_minutes int DEFAULT 120)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE; s attendance_sessions%ROWTYPE; v_min int;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền bắt đầu điểm danh.'); END IF;

  SELECT * INTO s FROM attendance_sessions WHERE id = p_id;
  IF NOT FOUND THEN RETURN err('Không tìm thấy hội nghị.'); END IF;
  IF jsonb_array_length(coalesce(s."expectedUserIds", '[]'::jsonb)) = 0 THEN
    RETURN err('Chưa chọn thành phần tham dự. Vui lòng chọn cán bộ trước khi bắt đầu.');
  END IF;

  v_min := greatest(5, least(coalesce(p_auto_end_minutes, 120), 1440));

  UPDATE attendance_sessions SET
    status      = 'OPEN',
    "isActive"  = true,
    "startedAt" = coalesce("startedAt", now_ms()),
    "endedAt"   = NULL,
    "expiresAt" = now_ms() + v_min::bigint * 60000
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true,
    'session', (SELECT to_jsonb(x) FROM attendance_sessions x WHERE id = p_id));
END;
$$;

-- ---------------------------------------------------------------------
-- 3. KẾT THÚC / GIA HẠN (thay bản ở file 04, ghi thêm trạng thái)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_update_session(p_token text, p_id text, p_expires_at bigint, p_is_active boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền quản lý phiên điểm danh.'); END IF;

  IF p_is_active IS FALSE THEN
    UPDATE attendance_sessions SET
      "isActive" = false,
      status     = CASE WHEN status = 'DRAFT' THEN 'DRAFT' ELSE 'CLOSED' END,
      "endedAt"  = CASE WHEN status = 'DRAFT' THEN "endedAt" ELSE now_ms() END,
      "expiresAt" = CASE WHEN status = 'DRAFT' THEN "expiresAt" ELSE least("expiresAt", now_ms()) END
    WHERE id = p_id;
  ELSE
    UPDATE attendance_sessions SET
      "expiresAt" = coalesce(p_expires_at, "expiresAt")
    WHERE id = p_id AND coalesce(status, 'OPEN') = 'OPEN';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Tạo nhanh (bản cũ: tạo và bắt đầu ngay) — giữ tương thích, ghi trạng thái OPEN
CREATE OR REPLACE FUNCTION app_create_session(p_token text, p_title text, p_expires_at bigint, p_expected jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE; v_id text; v_now bigint := now_ms(); v_exp jsonb := clean_expected(p_expected);
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền tạo phiên điểm danh.'); END IF;
  IF length(trim(coalesce(p_title, ''))) = 0 THEN RETURN err('Vui lòng nhập tên hội nghị.'); END IF;
  IF p_expires_at IS NULL OR p_expires_at <= v_now THEN RETURN err('Thời gian kết thúc không hợp lệ.'); END IF;
  IF jsonb_array_length(v_exp) = 0 THEN RETURN err('Vui lòng chọn ít nhất 1 cán bộ tham gia.'); END IF;

  v_id := 'sess_' || v_now || '_' || substr(md5(random()::text), 1, 6);
  INSERT INTO attendance_sessions (id, title, "creatorId", "createdAt", "expiresAt", "isActive",
                                   "expectedUserIds", status, "startedAt")
  VALUES (v_id, trim(p_title), actor.id, v_now, p_expires_at, true, v_exp, 'OPEN', v_now);

  RETURN jsonb_build_object('ok', true, 'session', (SELECT to_jsonb(s) FROM attendance_sessions s WHERE id = v_id));
END;
$$;

-- ---------------------------------------------------------------------
-- 4. XOÁ HỘI NGHỊ: chỉ xoá được khi CHƯA BẮT ĐẦU (bảo toàn kết quả điểm danh)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_delete_meeting(p_token text, p_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE; s attendance_sessions%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền xoá hội nghị.'); END IF;

  SELECT * INTO s FROM attendance_sessions WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true); END IF;
  IF coalesce(s.status, 'CLOSED') <> 'DRAFT'
     OR EXISTS (SELECT 1 FROM attendance_records WHERE "sessionId" = p_id) THEN
    RETURN err('Chỉ xoá được hội nghị chưa bắt đầu điểm danh.');
  END IF;

  DELETE FROM attendance_absences WHERE "sessionId" = p_id;
  DELETE FROM attendance_sessions WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 5. QUYỀN GỌI HÀM
-- ---------------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('check_session_open', 'clean_expected')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;

  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('app_save_meeting', 'app_start_session', 'app_update_session',
                               'app_create_session', 'app_delete_meeting')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
  END LOOP;
END
$$;
