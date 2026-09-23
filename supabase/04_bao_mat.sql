-- =====================================================================
-- 04. BẢO MẬT: PHIÊN ĐĂNG NHẬP + GHI DỮ LIỆU QUA HÀM MÁY CHỦ
-- Chạy SAU 01, 02, 03. An toàn, chạy lại nhiều lần không mất dữ liệu.
--
-- Mục tiêu:
--  - Không ai dùng khoá công khai (anon key) để tự nâng quyền, đổi mật khẩu
--    người khác, xoá cán bộ.
--  - Không ai điểm danh hộ, xoá/sửa bản ghi điểm danh, sửa danh sách triệu tập
--    hay lý do vắng mặt để làm sai lệch báo cáo.
--  - Mọi thao tác ghi trên 4 bảng: users, attendance_sessions,
--    attendance_records, attendance_absences phải đi qua các hàm bên dưới,
--    kèm mã phiên đăng nhập do máy chủ cấp.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. BẢNG PHIÊN ĐĂNG NHẬP (chỉ lưu bản băm của mã phiên)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
  "tokenHash"  text PRIMARY KEY,
  "userId"     text NOT NULL,
  "createdAt"  timestamptz DEFAULT now(),
  "expiresAt"  timestamptz NOT NULL,
  "lastSeenAt" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions ("userId");
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON user_sessions FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. HÀM NỘI BỘ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION now_ms() RETURNS bigint
LANGUAGE sql STABLE AS $$ SELECT (extract(epoch from now()) * 1000)::bigint $$;

CREATE OR REPLACE FUNCTION token_hash(p_token text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

-- Trả về cán bộ ứng với mã phiên (NULL nếu mã sai/hết hạn/tài khoản bị khoá)
CREATE OR REPLACE FUNCTION session_user_row(p_token text)
RETURNS users
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_uid text; v_user users%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 20 THEN RETURN NULL; END IF;

  UPDATE user_sessions
     SET "lastSeenAt" = now(),
         "expiresAt"  = greatest("expiresAt", now() + interval '30 days')
   WHERE "tokenHash" = token_hash(p_token) AND "expiresAt" > now()
  RETURNING "userId" INTO v_uid;

  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_user FROM users WHERE id = v_uid;
  IF NOT FOUND OR v_user."isApproved" IS FALSE THEN RETURN NULL; END IF;
  RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION role_weight(p_role text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_role
    WHEN 'ADMIN' THEN 100 WHEN 'CHIEF' THEN 90 WHEN 'DEPUTY_CHIEF' THEN 80
    WHEN 'MANAGER' THEN 70 WHEN 'DEPUTY' THEN 60 ELSE 50 END
$$;

CREATE OR REPLACE FUNCTION has_perm(u users, p_perm text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(u.permissions, '[]'::jsonb) ? p_perm
$$;

-- Quyền quản lý điểm danh: Quản trị viên, Trưởng/Phó Trưởng CAP, hoặc được cấp quyền
CREATE OR REPLACE FUNCTION can_manage_attendance(u users) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT u.role IN ('ADMIN','CHIEF','DEPUTY_CHIEF') OR has_perm(u, 'MANAGE_ATTENDANCE')
$$;

-- Quyền quản lý toàn bộ cán bộ (duyệt tài khoản)
CREATE OR REPLACE FUNCTION can_manage_all_users(u users) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT u.role IN ('ADMIN','CHIEF')
      OR (u.role = 'DEPUTY_CHIEF' AND u.department = 'Phụ trách chung')
      OR has_perm(u, 'MANAGE_USERS')
$$;

-- Quy tắc giống màn hình Quản lý cán bộ: chỉ quản lý người cấp thấp hơn,
-- Tổ trưởng/Tổ phó chỉ trong tổ mình, không ai được đụng tới Quản trị viên
-- (trừ chính Quản trị viên).
CREATE OR REPLACE FUNCTION can_manage_target(actor users, p_role text, p_dept text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN actor.role = 'ADMIN' THEN true
    WHEN coalesce(p_role, 'OFFICER') = 'ADMIN' THEN false
    WHEN actor.role = 'CHIEF' THEN true
    WHEN role_weight(actor.role) <= role_weight(p_role) THEN false
    WHEN actor.role IN ('MANAGER','DEPUTY') THEN actor.department IS NOT DISTINCT FROM p_dept
    WHEN actor.role = 'DEPUTY_CHIEF' THEN true
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION err(p_msg text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('ok', false, 'message', p_msg) $$;

CREATE OR REPLACE FUNCTION expired_msg() RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('ok', false, 'code', 'SESSION_EXPIRED',
         'message', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
$$;

-- ---------------------------------------------------------------------
-- 3. ĐĂNG NHẬP / ĐĂNG XUẤT / GIỮ PHIÊN
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_login(p_username text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user  users%ROWTYPE;
  v_hash  text;
  v_token text;
BEGIN
  SELECT * INTO v_user FROM users WHERE lower(username) = lower(trim(p_username)) LIMIT 1;
  IF NOT FOUND THEN RETURN err('Sai tên đăng nhập hoặc mật khẩu.'); END IF;

  SELECT "passwordHash" INTO v_hash FROM user_secrets WHERE "userId" = v_user.id;
  IF v_hash IS NULL OR crypt(p_password, v_hash) <> v_hash THEN
    RETURN err('Sai tên đăng nhập hoặc mật khẩu.');
  END IF;

  IF v_user."emailVerified" IS FALSE THEN
    RETURN err('Tài khoản chưa xác thực email. Vui lòng hoàn tất bước nhập mã OTP.');
  END IF;
  IF v_user."isApproved" IS FALSE THEN
    RETURN err('Tài khoản đang chờ quản trị viên phê duyệt.');
  END IF;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO user_sessions ("tokenHash", "userId", "expiresAt")
  VALUES (token_hash(v_token), v_user.id, now() + interval '30 days');

  -- Dọn phiên cũ đã hết hạn
  DELETE FROM user_sessions WHERE "expiresAt" < now() - interval '1 day';

  UPDATE users SET "lastLoginAt" = now_ms() WHERE id = v_user.id;
  RETURN jsonb_build_object('ok', true, 'token', v_token, 'user', safe_user_json(v_user.id));
END;
$$;

CREATE OR REPLACE FUNCTION app_logout(p_token text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  DELETE FROM user_sessions WHERE "tokenHash" = token_hash(p_token);
  SELECT jsonb_build_object('ok', true);
$$;

-- Giữ phiên + ghi nhận thời điểm hoạt động + trả về thông tin mới nhất của chính mình
CREATE OR REPLACE FUNCTION app_touch(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_user users%ROWTYPE;
BEGIN
  v_user := session_user_row(p_token);
  IF v_user.id IS NULL THEN RETURN expired_msg(); END IF;

  -- Chỉ ghi khi đã quá 3 phút để giảm tải đồng bộ cho các máy khác
  UPDATE users SET "lastLoginAt" = now_ms()
   WHERE id = v_user.id AND coalesce("lastLoginAt", 0) < now_ms() - 180000;

  RETURN jsonb_build_object('ok', true, 'user', safe_user_json(v_user.id));
END;
$$;

-- Đổi mật khẩu: bắt buộc đúng mật khẩu hiện tại (thay bản ở file 02)
CREATE OR REPLACE FUNCTION app_change_password(p_username text, p_old text, p_new text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_user users%ROWTYPE; v_hash text;
BEGIN
  IF length(coalesce(p_new, '')) < 6 THEN RETURN err('Mật khẩu mới phải từ 6 ký tự trở lên.'); END IF;
  SELECT * INTO v_user FROM users WHERE lower(username) = lower(trim(p_username)) LIMIT 1;
  IF NOT FOUND THEN RETURN err('Không tìm thấy tài khoản.'); END IF;

  SELECT "passwordHash" INTO v_hash FROM user_secrets WHERE "userId" = v_user.id;
  IF v_hash IS NULL OR crypt(p_old, v_hash) <> v_hash THEN
    RETURN err('Mật khẩu hiện tại không đúng.');
  END IF;

  UPDATE users SET password = p_new, "isFirstLogin" = false WHERE id = v_user.id;
  RETURN jsonb_build_object('ok', true, 'message', 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
END;
$$;

-- ---------------------------------------------------------------------
-- 4. QUẢN LÝ CÁN BỘ
-- ---------------------------------------------------------------------
-- p_user: đối tượng cán bộ (JSON). p_password: mật khẩu mới (NULL/'' = giữ nguyên)
CREATE OR REPLACE FUNCTION app_save_user(p_token text, p_user jsonb, p_password text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  actor    users%ROWTYPE;
  old      users%ROWTYPE;
  v_id     text := nullif(trim(p_user->>'id'), '');
  v_role   text := coalesce(nullif(p_user->>'role', ''), 'OFFICER');
  v_dept   text := nullif(p_user->>'department', '');
  v_uname  text := lower(trim(coalesce(p_user->>'username', '')));
  v_perms  jsonb;
  v_exists boolean;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF v_uname !~ '^[a-z0-9._]{2,40}$' THEN RETURN err('Tên đăng nhập không hợp lệ.'); END IF;
  IF length(trim(coalesce(p_user->>'fullName', ''))) < 2 THEN RETURN err('Vui lòng nhập họ tên.'); END IF;
  IF v_role NOT IN ('ADMIN','CHIEF','DEPUTY_CHIEF','MANAGER','DEPUTY','OFFICER') THEN
    RETURN err('Chức vụ không hợp lệ.');
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT * INTO old FROM users WHERE id = v_id;
  END IF;
  v_exists := old.id IS NOT NULL;

  -- Quyền với người cũ và với chức vụ/tổ mới
  IF v_exists AND old.id <> actor.id AND NOT can_manage_target(actor, old.role, old.department) THEN
    RETURN err('Bạn không có quyền chỉnh sửa cán bộ này.');
  END IF;
  IF v_exists AND old.id = actor.id AND actor.role <> 'ADMIN' THEN
    -- Tự sửa hồ sơ: không được đổi chức vụ, tổ, quyền
    v_role := old.role; v_dept := old.department;
  ELSIF NOT (v_exists AND old.id = actor.id) AND NOT can_manage_target(actor, v_role, v_dept) THEN
    RETURN err('Bạn không có quyền gán chức vụ/tổ công tác này.');
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE lower(username) = v_uname AND id IS DISTINCT FROM v_id) THEN
    RETURN err('Tên đăng nhập đã tồn tại.');
  END IF;

  -- Chỉ Quản trị viên được phân quyền chi tiết
  IF actor.role = 'ADMIN' THEN
    v_perms := coalesce(p_user->'permissions', '[]'::jsonb);
  ELSE
    v_perms := coalesce(old.permissions, '[]'::jsonb);
  END IF;

  IF v_exists THEN
    UPDATE users SET
      username     = v_uname,
      "fullName"   = trim(p_user->>'fullName'),
      role         = v_role,
      department   = v_dept,
      position     = coalesce(p_user->>'position', old.position),
      email        = nullif(trim(coalesce(p_user->>'email', '')), ''),
      "avatarUrl"  = coalesce(nullif(p_user->>'avatarUrl', ''), old."avatarUrl"),
      permissions  = v_perms,
      password     = nullif(p_password, '')   -- trigger băm và xoá bản chữ thường
    WHERE id = v_id;
  ELSE
    IF length(coalesce(p_password, '')) < 6 THEN
      RETURN err('Mật khẩu ban đầu phải từ 6 ký tự trở lên.');
    END IF;
    v_id := coalesce(v_id, 'u' || now_ms() || floor(random() * 1000)::int);
    INSERT INTO users (id, username, password, "fullName", role, department, position, email,
                       "avatarUrl", permissions, "isFirstLogin", "isApproved", "emailVerified", "createdAt")
    VALUES (v_id, v_uname, p_password, trim(p_user->>'fullName'), v_role, v_dept,
            coalesce(p_user->>'position', ''), nullif(trim(coalesce(p_user->>'email', '')), ''),
            p_user->>'avatarUrl', v_perms, true, true, true, now_ms());
  END IF;

  RETURN jsonb_build_object('ok', true, 'user', safe_user_json(v_id));
END;
$$;

CREATE OR REPLACE FUNCTION app_delete_user(p_token text, p_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE; target users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF actor.id = p_id THEN RETURN err('Không thể xoá tài khoản đang đăng nhập.'); END IF;

  SELECT * INTO target FROM users WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true); END IF;

  -- Duyệt/từ chối tài khoản tự đăng ký
  IF target."isApproved" IS FALSE THEN
    IF NOT can_manage_all_users(actor) THEN RETURN err('Bạn không có quyền từ chối tài khoản.'); END IF;
  ELSIF NOT can_manage_target(actor, target.role, target.department) THEN
    RETURN err('Bạn không có quyền xoá cán bộ này.');
  END IF;

  DELETE FROM user_sessions WHERE "userId" = p_id;
  DELETE FROM user_secrets  WHERE "userId" = p_id;
  DELETE FROM users         WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION app_approve_user(p_token text, p_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_all_users(actor) THEN RETURN err('Bạn không có quyền duyệt tài khoản.'); END IF;
  UPDATE users SET "isApproved" = true WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 5. PHIÊN ĐIỂM DANH
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_create_session(p_token text, p_title text, p_expires_at bigint, p_expected jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE; v_id text; v_now bigint := now_ms();
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền tạo phiên điểm danh.'); END IF;
  IF length(trim(coalesce(p_title, ''))) = 0 THEN RETURN err('Vui lòng nhập tên hội nghị.'); END IF;
  IF p_expires_at IS NULL OR p_expires_at <= v_now THEN RETURN err('Thời gian kết thúc không hợp lệ.'); END IF;
  IF jsonb_typeof(p_expected) <> 'array' OR jsonb_array_length(p_expected) = 0 THEN
    RETURN err('Vui lòng chọn ít nhất 1 cán bộ tham gia.');
  END IF;

  v_id := 'sess_' || v_now || '_' || substr(md5(random()::text), 1, 6);
  INSERT INTO attendance_sessions (id, title, "creatorId", "createdAt", "expiresAt", "isActive", "expectedUserIds")
  VALUES (v_id, trim(p_title), actor.id, v_now, p_expires_at, true, p_expected);

  RETURN jsonb_build_object('ok', true, 'session', (SELECT to_jsonb(s) FROM attendance_sessions s WHERE id = v_id));
END;
$$;

-- Chỉ cho sửa thời hạn / trạng thái. Danh sách triệu tập KHÔNG sửa được sau khi mở phiên.
CREATE OR REPLACE FUNCTION app_update_session(p_token text, p_id text, p_expires_at bigint, p_is_active boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền quản lý phiên điểm danh.'); END IF;

  UPDATE attendance_sessions SET
    "expiresAt" = coalesce(p_expires_at, "expiresAt"),
    "isActive"  = coalesce(p_is_active, "isActive")
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 6. ĐIỂM DANH
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_session_open(p_session_id text)
RETURNS attendance_sessions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM attendance_sessions
  WHERE id = p_session_id AND "isActive" IS NOT FALSE AND "expiresAt" > now_ms()
$$;

-- Cán bộ tự điểm danh: chỉ điểm danh được cho CHÍNH MÌNH
CREATE OR REPLACE FUNCTION app_check_in(
  p_token text, p_session_id text, p_device_id text,
  p_ip text DEFAULT NULL, p_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE; s attendance_sessions%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;

  s := check_session_open(p_session_id);
  IF s.id IS NULL THEN RETURN err('Phiên điểm danh không tồn tại hoặc đã kết thúc.'); END IF;

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

-- Khách mời điểm danh (không cần tài khoản)
CREATE OR REPLACE FUNCTION app_guest_check_in(
  p_session_id text, p_name text, p_unit text, p_phone text,
  p_device_id text, p_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE s attendance_sessions%ROWTYPE; v_phone text; v_uid text;
BEGIN
  s := check_session_open(p_session_id);
  IF s.id IS NULL THEN RETURN err('Phiên điểm danh không tồn tại hoặc đã kết thúc.'); END IF;

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
-- 7. LÝ DO VẮNG MẶT
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_save_absence(
  p_token text, p_session_id text, p_user_id text, p_excused boolean, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE actor users%ROWTYPE; v_id text := p_session_id || '__' || p_user_id;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền ghi lý do vắng mặt.'); END IF;
  IF NOT EXISTS (SELECT 1 FROM attendance_sessions WHERE id = p_session_id) THEN
    RETURN err('Phiên điểm danh không tồn tại.');
  END IF;

  INSERT INTO attendance_absences (id, "sessionId", "userId", excused, reason, "updatedBy", "updatedAt")
  VALUES (v_id, p_session_id, p_user_id, p_excused, left(coalesce(p_reason, ''), 500), actor.id, now_ms())
  ON CONFLICT (id) DO UPDATE SET
    excused = EXCLUDED.excused, reason = EXCLUDED.reason,
    "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = EXCLUDED."updatedAt";
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 8. GỬI EMAIL THÔNG BÁO: chỉ người đã đăng nhập mới gửi được
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS app_send_mail(text, text, text);
CREATE OR REPLACE FUNCTION app_send_mail(p_token text, p_to text, p_subject text, p_body text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, net
AS $$
DECLARE actor users%ROWTYPE; v_url text := get_setting('mailer_url', ''); v_key text := get_setting('mailer_key', '');
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  -- Chỉ gửi tới email của cán bộ trong hệ thống
  IF NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(trim(p_to))) THEN
    RETURN err('Địa chỉ nhận không thuộc hệ thống.');
  END IF;
  IF v_url = '' THEN RETURN err('Chưa khai báo dịch vụ gửi email.'); END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := jsonb_build_object('action', 'sendMail', 'apiKey', v_key,
                                    'to', p_to, 'subject', left(p_subject, 200), 'body', p_body));
  EXCEPTION WHEN OTHERS THEN
    RETURN err(SQLERRM);
  END;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 9. OTP: báo lỗi rõ ràng khi chưa cấu hình dịch vụ gửi mail
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mailer_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_setting('mailer_url', '') <> ''
$$;

CREATE OR REPLACE FUNCTION app_request_otp(p_target text, p_purpose text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_user users%ROWTYPE; v_t text := trim(p_target);
BEGIN
  IF NOT mailer_ready() THEN
    RETURN err('Hệ thống chưa cấu hình dịch vụ gửi email. Liên hệ quản trị viên.');
  END IF;
  SELECT * INTO v_user FROM users
  WHERE lower(username) = lower(v_t) OR lower(email) = lower(v_t) LIMIT 1;
  IF NOT FOUND THEN
    IF p_purpose = 'RESET' THEN RETURN jsonb_build_object('ok', true, 'maskedEmail', '***'); END IF;
    RETURN err('Không tìm thấy tài khoản.');
  END IF;
  RETURN issue_otp(v_user.id, p_purpose);
END;
$$;

-- Đăng ký: chặn ngay từ đầu nếu chưa có dịch vụ gửi mail (tránh tài khoản treo)
CREATE OR REPLACE FUNCTION app_register_guarded(
  p_username text, p_fullname text, p_email text, p_password text, p_position text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT mailer_ready() THEN
    RETURN err('Hệ thống chưa cấu hình dịch vụ gửi email xác thực. Liên hệ quản trị viên để được cấp tài khoản.');
  END IF;
  RETURN app_register(p_username, p_fullname, p_email, p_password, p_position);
END;
$$;

-- Mật khẩu thay đổi (đổi, đặt lại qua OTP, quản trị viên cấp lại) => đăng xuất mọi thiết bị
CREATE OR REPLACE FUNCTION trg_secret_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW."passwordHash" IS DISTINCT FROM OLD."passwordHash" THEN
    DELETE FROM user_sessions WHERE "userId" = NEW."userId";
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_secret_changed ON user_secrets;
CREATE TRIGGER trg_secret_changed AFTER UPDATE ON user_secrets
  FOR EACH ROW EXECUTE FUNCTION trg_secret_changed();

-- ---------------------------------------------------------------------
-- 10. KHOÁ QUYỀN GHI TRỰC TIẾP
-- Ứng dụng chỉ còn được ĐỌC 4 bảng này; mọi thao tác ghi đi qua hàm ở trên.
-- ---------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON users               FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON attendance_sessions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON attendance_records  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON attendance_absences FROM anon, authenticated;
GRANT SELECT ON users, attendance_sessions, attendance_records, attendance_absences TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 11. QUYỀN GỌI HÀM
-- Postgres mặc định cho PUBLIC gọi mọi hàm -> phải thu hồi từ PUBLIC.
-- ---------------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'issue_otp','send_otp_mail','get_setting','safe_user_json','mask_email','cleanup_otp_codes',
        'hash_user_password','now_ms','token_hash','session_user_row','role_weight','has_perm',
        'can_manage_attendance','can_manage_all_users','can_manage_target','err','expired_msg',
        'check_session_open','mailer_ready','trg_secret_changed','app_register'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;

  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'app_login','app_logout','app_touch','app_change_password','app_save_user','app_delete_user',
        'app_approve_user','app_create_session','app_update_session','app_check_in',
        'app_guest_check_in','app_save_absence','app_send_mail','app_request_otp',
        'app_verify_otp','app_reset_password','app_register_guarded'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
  END LOOP;
END
$$;

-- Bản ghi phiên đăng nhập cũ: dọn định kỳ bằng  SELECT cleanup_user_sessions();
CREATE OR REPLACE FUNCTION cleanup_user_sessions() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  DELETE FROM user_sessions WHERE "expiresAt" < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION cleanup_user_sessions() FROM PUBLIC, anon, authenticated;
