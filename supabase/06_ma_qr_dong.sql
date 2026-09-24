-- =====================================================================
-- 06. MÃ QR ĐỘNG CÓ CHỮ KÝ MÁY CHỦ — ĐỔI 3 GIÂY/LẦN, KIỂM TRA TRÊN MÁY CHỦ
-- Chạy SAU các file 01 → 05. An toàn khi chạy lại.
--
-- Trước đây: mã QR = "mã hội nghị|thời điểm", chỉ điện thoại kiểm tra hạn 60 giây,
--            máy chủ không kiểm tra → biết mã hội nghị là tự tạo được mã hợp lệ.
-- Nay:       mã QR = "mã hội nghị|số thứ tự khung 3 giây|chữ ký HMAC-SHA256".
--            Khoá ký riêng cho từng hội nghị, chỉ người quản lý lấy được.
--            Máy chủ tự kiểm tra chữ ký và độ mới theo ĐỒNG HỒ MÁY CHỦ.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Khoá ký mã QR của từng hội nghị (không ai đọc trực tiếp được)
CREATE TABLE IF NOT EXISTS attendance_qr_keys (
  "sessionId" text PRIMARY KEY,
  secret      text NOT NULL,
  "createdAt" timestamptz DEFAULT now()
);
ALTER TABLE attendance_qr_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON attendance_qr_keys FROM anon, authenticated;

-- Tham số (đổi được bằng UPDATE app_settings ...)
--   qr_step_ms      : chu kỳ đổi mã (mili giây)          — mặc định 3000
--   qr_grace_steps  : số chu kỳ cũ vẫn chấp nhận          — mặc định 3 (≈ 9–12 giây, bù thời gian quét + mạng chậm)
--   guest_ticket_min: số phút khách mời được điền biểu mẫu sau khi quét — mặc định 10
INSERT INTO app_settings (key, value) VALUES
  ('qr_step_ms', '3000'), ('qr_grace_steps', '3'), ('guest_ticket_min', '10')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION qr_setting(p_key text, p_default int)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT nullif(value, '')::int FROM app_settings WHERE key = p_key), p_default)
$$;

CREATE OR REPLACE FUNCTION qr_secret_of(p_session_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v text;
BEGIN
  SELECT secret INTO v FROM attendance_qr_keys WHERE "sessionId" = p_session_id;
  IF v IS NULL THEN
    INSERT INTO attendance_qr_keys ("sessionId", secret)
    VALUES (p_session_id, encode(gen_random_bytes(32), 'hex'))
    ON CONFLICT ("sessionId") DO NOTHING;
    SELECT secret INTO v FROM attendance_qr_keys WHERE "sessionId" = p_session_id;
  END IF;
  RETURN v;
END;
$$;

-- Chữ ký 12 ký tự hex của (hội nghị, khung thời gian, mục đích)
CREATE OR REPLACE FUNCTION qr_sign(p_session_id text, p_data text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT left(encode(hmac(p_data, qr_secret_of(p_session_id), 'sha256'), 'hex'), 12)
$$;

-- Kiểm tra mã: đúng chữ ký + khung thời gian còn mới (theo đồng hồ máy chủ)
CREATE OR REPLACE FUNCTION qr_valid(p_session_id text, p_slot bigint, p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_now bigint; v_step int; v_grace int;
BEGIN
  IF p_session_id IS NULL OR p_slot IS NULL OR p_code IS NULL THEN RETURN false; END IF;
  v_step  := greatest(qr_setting('qr_step_ms', 3000), 1000);
  v_grace := greatest(qr_setting('qr_grace_steps', 3), 1);
  v_now   := now_ms() / v_step;
  IF p_slot < v_now - v_grace OR p_slot > v_now + 1 THEN RETURN false; END IF;
  RETURN lower(p_code) = qr_sign(p_session_id, p_session_id || '|' || p_slot);
END;
$$;

-- ---------------------------------------------------------------------
-- 1. Người quản lý lấy khoá ký để máy chiếu tự sinh mã 3 giây/lần
--    (vẫn chạy khi mạng chập chờn; trả kèm giờ máy chủ để bù lệch đồng hồ)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_qr_key(p_token text, p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; s attendance_sessions%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền hiển thị mã điểm danh.'); END IF;
  s := check_session_open(p_session_id);
  IF s.id IS NULL THEN RETURN err('Hội nghị chưa bắt đầu hoặc đã kết thúc.'); END IF;
  RETURN jsonb_build_object('ok', true,
    'secret', qr_secret_of(s.id),
    'serverNow', now_ms(),
    'stepMs', greatest(qr_setting('qr_step_ms', 3000), 1000));
END;
$$;

-- ---------------------------------------------------------------------
-- 2. Cán bộ điểm danh: bắt buộc gửi kèm nội dung mã QR vừa quét
--    Định dạng: "<mã hội nghị>|<khung>|<chữ ký>"
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS app_check_in(text, text, text, text, text);

CREATE OR REPLACE FUNCTION app_check_in(
  p_token text, p_session_id text, p_device_id text,
  p_ip text DEFAULT NULL, p_fingerprint text DEFAULT NULL, p_qr text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE; s attendance_sessions%ROWTYPE; parts text[];
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;

  s := check_session_open(p_session_id);
  IF s.id IS NULL THEN RETURN err('Hội nghị chưa bắt đầu hoặc đã kết thúc điểm danh.'); END IF;

  parts := string_to_array(coalesce(p_qr, ''), '|');
  IF array_length(parts, 1) IS DISTINCT FROM 3 OR parts[1] <> s.id OR parts[2] !~ '^\d{1,15}$'
     OR NOT qr_valid(s.id, parts[2]::bigint, parts[3]) THEN
    RETURN err('Mã QR không hợp lệ hoặc đã hết hạn. Vui lòng quét mã đang hiển thị trên màn hình.');
  END IF;

  IF EXISTS (SELECT 1 FROM attendance_records WHERE "sessionId" = s.id AND "userId" = actor.id) THEN
    RETURN err('Bạn đã điểm danh cho hội nghị này rồi.');
  END IF;

  IF coalesce(p_device_id, '') <> '' AND EXISTS (
       SELECT 1 FROM attendance_records
       WHERE "sessionId" = s.id AND "deviceId" = p_device_id AND "userId" <> actor.id) THEN
    RETURN err('Thiết bị này đã được sử dụng để điểm danh cho tài khoản khác.');
  END IF;

  INSERT INTO attendance_records (id, "sessionId", "userId", "timestamp", date, "deviceId",
                                  "ipAddress", fingerprint, status)
  VALUES (s.id || '__' || actor.id, s.id, actor.id, now_ms(),
          to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'),
          p_device_id, p_ip, p_fingerprint, 'PRESENT')
  ON CONFLICT DO NOTHING;

  IF NOT FOUND THEN RETURN err('Bạn đã điểm danh cho hội nghị này rồi.'); END IF;

  RETURN jsonb_build_object('ok', true, 'title', s.title,
    'expected', coalesce(s."expectedUserIds", '[]'::jsonb) ? actor.id);
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Khách mời: quét mã → nhận "vé" có hạn (mặc định 10 phút) để điền biểu mẫu
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_guest_ticket(p_session_id text, p_slot bigint, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s attendance_sessions%ROWTYPE; v_issued bigint := now_ms();
BEGIN
  s := check_session_open(p_session_id);
  IF s.id IS NULL THEN RETURN err('Hội nghị chưa bắt đầu hoặc đã kết thúc điểm danh.'); END IF;
  IF NOT qr_valid(s.id, p_slot, p_code) THEN
    RETURN err('Mã QR đã hết hạn. Vui lòng quét lại mã đang hiển thị trên màn hình.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'title', s.title,
    'ticket', v_issued || '.' || qr_sign(s.id, 'guest|' || s.id || '|' || v_issued));
END;
$$;

DROP FUNCTION IF EXISTS app_guest_check_in(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION app_guest_check_in(
  p_session_id text, p_name text, p_unit text, p_phone text,
  p_device_id text, p_ip text DEFAULT NULL, p_ticket text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE s attendance_sessions%ROWTYPE; v_phone text; v_uid text; parts text[]; v_issued bigint;
BEGIN
  s := check_session_open(p_session_id);
  IF s.id IS NULL THEN RETURN err('Hội nghị chưa bắt đầu hoặc đã kết thúc điểm danh.'); END IF;

  parts := string_to_array(coalesce(p_ticket, ''), '.');
  IF array_length(parts, 1) IS DISTINCT FROM 2 OR parts[1] !~ '^\d{1,15}$' THEN
    RETURN err('Vui lòng quét mã QR trên màn hình hội nghị để điểm danh.');
  END IF;
  v_issued := parts[1]::bigint;
  IF v_issued > now_ms() + 5000
     OR now_ms() - v_issued > qr_setting('guest_ticket_min', 10)::bigint * 60000
     OR lower(parts[2]) <> qr_sign(s.id, 'guest|' || s.id || '|' || v_issued) THEN
    RETURN err('Đã quá thời gian điền thông tin. Vui lòng quét lại mã QR trên màn hình.');
  END IF;

  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  IF length(v_phone) < 9 OR length(v_phone) > 12 THEN RETURN err('Số điện thoại không hợp lệ.'); END IF;
  IF length(trim(coalesce(p_name, ''))) < 2 THEN RETURN err('Vui lòng nhập họ tên.'); END IF;

  v_uid := 'guest_' || v_phone;
  IF EXISTS (SELECT 1 FROM attendance_records WHERE "sessionId" = s.id AND "userId" = v_uid) THEN
    RETURN err('Bạn đã điểm danh cho hội nghị này rồi.');
  END IF;
  IF coalesce(p_device_id, '') <> '' AND EXISTS (
       SELECT 1 FROM attendance_records
       WHERE "sessionId" = s.id AND "deviceId" = p_device_id AND "userId" <> v_uid) THEN
    RETURN err('Thiết bị này đã được sử dụng để điểm danh cho người khác.');
  END IF;

  INSERT INTO attendance_records (id, "sessionId", "userId", "timestamp", date, "deviceId",
                                  "ipAddress", status, "guestName", "guestUnit", "guestPhone")
  VALUES (s.id || '__' || v_uid, s.id, v_uid, now_ms(),
          to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'),
          p_device_id, p_ip, 'PRESENT', left(trim(p_name), 120), left(trim(coalesce(p_unit, '')), 200), v_phone)
  ON CONFLICT DO NOTHING;

  IF NOT FOUND THEN RETURN err('Bạn đã điểm danh cho hội nghị này rồi.'); END IF;
  RETURN jsonb_build_object('ok', true, 'title', s.title);
END;
$$;

-- ---------------------------------------------------------------------
-- 4. Quyền gọi hàm
-- ---------------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('qr_setting', 'qr_secret_of', 'qr_sign', 'qr_valid')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;

  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('app_qr_key', 'app_check_in', 'app_guest_ticket', 'app_guest_check_in')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
