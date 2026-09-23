-- =====================================================================
-- BỔ SUNG: MẬT KHẨU MÃ HOÁ, ĐĂNG KÝ TÀI KHOẢN, OTP QUA EMAIL
-- Chạy SAU file 01_schema.sql. An toàn, chạy lại nhiều lần không mất dữ liệu.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- pg_net dùng để gửi email OTP (nếu Supabase chưa bật, xem mục 9 bên dưới)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------
-- 1. CỘT MỚI CHO BẢNG USERS
-- ---------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS "isApproved" boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailVerified" boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "createdAt" bigint;

-- ---------------------------------------------------------------------
-- 2. KHO MẬT KHẨU RIÊNG (trình duyệt KHÔNG BAO GIỜ đọc được)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_secrets (
  "userId"       text PRIMARY KEY,
  "passwordHash" text NOT NULL,
  "updatedAt"    timestamptz DEFAULT now()
);

ALTER TABLE user_secrets ENABLE ROW LEVEL SECURITY;
-- Cố ý KHÔNG tạo policy nào: mọi truy cập trực tiếp từ ứng dụng đều bị chặn.
-- Chỉ các hàm SECURITY DEFINER bên dưới mới đọc/ghi được bảng này.

-- ---------------------------------------------------------------------
-- 3. TỰ ĐỘNG BĂM MẬT KHẨU
-- Ứng dụng vẫn ghi trường "password" như cũ; trigger sẽ băm rồi xoá sạch
-- bản chữ thường trước khi lưu vào bảng users.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hash_user_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.password IS NOT NULL AND NEW.password <> '' THEN
    INSERT INTO user_secrets ("userId", "passwordHash", "updatedAt")
    VALUES (NEW.id, crypt(NEW.password, gen_salt('bf', 8)), now())
    ON CONFLICT ("userId") DO UPDATE
      SET "passwordHash" = EXCLUDED."passwordHash", "updatedAt" = now();
  END IF;

  NEW.password := NULL;  -- không bao giờ lưu mật khẩu chữ thường
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hash_user_password ON users;
CREATE TRIGGER trg_hash_user_password
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION hash_user_password();

-- 3.1. Chuyển các mật khẩu chữ thường đang có sang dạng băm
INSERT INTO user_secrets ("userId", "passwordHash")
SELECT id, crypt(password, gen_salt('bf', 8))
FROM users
WHERE password IS NOT NULL AND password <> ''
ON CONFLICT ("userId") DO NOTHING;

UPDATE users SET password = NULL WHERE password IS NOT NULL;

-- ---------------------------------------------------------------------
-- 4. BẢNG MÃ OTP (cũng chặn truy cập trực tiếp)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_codes (
  id               bigserial PRIMARY KEY,
  target           text NOT NULL,          -- username (chữ thường)
  purpose          text NOT NULL,          -- 'REGISTER' | 'RESET'
  "codeHash"       text NOT NULL,
  "expiresAt"      timestamptz NOT NULL,
  attempts         int DEFAULT 0,
  used             boolean DEFAULT false,
  "createdAt"      timestamptz DEFAULT now(),
  token            text,
  "tokenExpiresAt" timestamptz
);
CREATE INDEX IF NOT EXISTS idx_otp_target ON otp_codes (target, purpose, "createdAt" DESC);
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 5. CẤU HÌNH HỆ THỐNG (địa chỉ dịch vụ gửi mail, quy tắc duyệt tài khoản)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key   text PRIMARY KEY,
  value text
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO app_settings (key, value) VALUES
  ('require_admin_approval', 'true'),
  ('otp_ttl_minutes',        '5'),
  ('otp_max_attempts',       '5'),
  ('otp_resend_seconds',     '60'),
  ('mailer_url',             ''),   -- URL Web App Google Apps Script (.../exec)
  ('mailer_key',             '')    -- Khoá bảo vệ của Web App (nếu có)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION get_setting(p_key text, p_default text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF((SELECT value FROM app_settings WHERE key = p_key), ''), p_default);
$$;

-- ---------------------------------------------------------------------
-- 6. GỬI EMAIL OTP
-- Supabase không gửi được email tuỳ ý từ SQL, nên dùng lại Web App
-- Google Apps Script đã có (chỉ để gửi mail). Xem mục 9 nếu muốn thay.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION send_otp_mail(p_email text, p_fullname text, p_code text, p_purpose text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, net
AS $$
DECLARE
  v_url   text := get_setting('mailer_url', '');
  v_key   text := get_setting('mailer_key', '');
  v_ttl   text := get_setting('otp_ttl_minutes', '5');
  v_title text;
  v_html  text;
BEGIN
  IF v_url = '' THEN RETURN; END IF;

  v_title := CASE WHEN p_purpose = 'RESET'
                  THEN 'Mã xác thực đặt lại mật khẩu'
                  ELSE 'Mã xác thực đăng ký tài khoản' END;

  v_html :=
    '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">' ||
      '<div style="background:#7f1d1d;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">' ||
        '<div style="font-size:12px;letter-spacing:1px">CÔNG AN PHƯỜNG NAM ĐÔNG HÀ</div>' ||
        '<div style="font-size:18px;font-weight:bold;margin-top:4px">' || v_title || '</div>' ||
      '</div>' ||
      '<div style="border:1px solid #e7e5e4;border-top:0;border-radius:0 0 12px 12px;padding:20px">' ||
        '<p>Kính gửi đồng chí <b>' || COALESCE(p_fullname, '') || '</b>,</p>' ||
        '<p>Mã xác thực của đồng chí là:</p>' ||
        '<div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;' ||
             'background:#fef2f2;color:#b91c1c;padding:16px;border-radius:12px;border:1px dashed #fca5a5">' ||
          p_code ||
        '</div>' ||
        '<p style="font-size:13px;color:#57534e">Mã có hiệu lực trong <b>' || v_ttl ||
          ' phút</b> và chỉ dùng được một lần.</p>' ||
        '<p style="font-size:13px;color:#b91c1c">Tuyệt đối KHÔNG cung cấp mã này cho bất kỳ ai.</p>' ||
      '</div>' ||
    '</div>';

  BEGIN
    PERFORM net.http_post(
      url     := v_url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := jsonb_build_object(
                   'action',  'sendMail',
                   'apiKey',  v_key,
                   'to',      p_email,
                   'subject', '[CAP Nam Đông Hà] ' || v_title || ': ' || p_code,
                   'body',    v_html
                 )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Không gửi được email OTP: %', SQLERRM;
  END;
END;
$$;

-- ---------------------------------------------------------------------
-- 7. CÁC HÀM NGHIỆP VỤ (ứng dụng gọi qua rpc)
-- ---------------------------------------------------------------------

-- Trả về bản ghi cán bộ, đã loại bỏ mọi thông tin bí mật
CREATE OR REPLACE FUNCTION safe_user_json(p_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(u) - 'password' FROM users u WHERE u.id = p_id;
$$;

CREATE OR REPLACE FUNCTION mask_email(p_email text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_email IS NULL OR position('@' in p_email) = 0 THEN '***'
    ELSE left(split_part(p_email, '@', 1), 2) || '***@' || split_part(p_email, '@', 2)
  END;
$$;

-- 7.1. ĐĂNG NHẬP (đối chiếu mật khẩu ngay trên máy chủ)
CREATE OR REPLACE FUNCTION app_login(p_username text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user   users%ROWTYPE;
  v_hash   text;
  v_now    bigint := (extract(epoch from now()) * 1000)::bigint;
BEGIN
  SELECT * INTO v_user FROM users WHERE lower(username) = lower(trim(p_username)) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Sai tên đăng nhập hoặc mật khẩu.');
  END IF;

  SELECT "passwordHash" INTO v_hash FROM user_secrets WHERE "userId" = v_user.id;
  IF v_hash IS NULL OR crypt(p_password, v_hash) <> v_hash THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Sai tên đăng nhập hoặc mật khẩu.');
  END IF;

  IF v_user."isApproved" IS FALSE THEN
    RETURN jsonb_build_object('ok', false, 'message',
      CASE WHEN v_user."emailVerified" IS FALSE
           THEN 'Tài khoản chưa xác thực email. Vui lòng hoàn tất bước nhập mã OTP.'
           ELSE 'Tài khoản đang chờ quản trị viên phê duyệt.' END);
  END IF;

  UPDATE users SET "lastLoginAt" = v_now WHERE id = v_user.id;
  RETURN jsonb_build_object('ok', true, 'user', safe_user_json(v_user.id));
END;
$$;

-- 7.2. ĐỔI MẬT KHẨU (phải nhập đúng mật khẩu hiện tại)
CREATE OR REPLACE FUNCTION app_change_password(p_username text, p_old text, p_new text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_user users%ROWTYPE; v_hash text;
BEGIN
  IF length(p_new) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Mật khẩu mới phải từ 6 ký tự trở lên.');
  END IF;

  SELECT * INTO v_user FROM users WHERE lower(username) = lower(trim(p_username)) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy tài khoản.');
  END IF;

  SELECT "passwordHash" INTO v_hash FROM user_secrets WHERE "userId" = v_user.id;
  IF v_hash IS NULL OR crypt(p_old, v_hash) <> v_hash THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Mật khẩu hiện tại không đúng.');
  END IF;

  UPDATE users SET password = p_new, "isFirstLogin" = false WHERE id = v_user.id;
  RETURN jsonb_build_object('ok', true, 'message', 'Đổi mật khẩu thành công.');
END;
$$;

-- 7.3. PHÁT HÀNH MÃ OTP
CREATE OR REPLACE FUNCTION issue_otp(p_user_id text, p_purpose text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user    users%ROWTYPE;
  v_last    timestamptz;
  v_gap     int := get_setting('otp_resend_seconds', '60')::int;
  v_ttl     int := get_setting('otp_ttl_minutes', '5')::int;
  v_code    text;
  v_target  text;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy tài khoản.');
  END IF;

  IF v_user.email IS NULL OR position('@' in v_user.email) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message',
      'Tài khoản này chưa khai báo email hợp lệ. Liên hệ quản trị viên để được hỗ trợ.');
  END IF;

  v_target := lower(v_user.username);

  SELECT max("createdAt") INTO v_last
  FROM otp_codes WHERE target = v_target AND purpose = p_purpose;

  IF v_last IS NOT NULL AND now() - v_last < make_interval(secs => v_gap) THEN
    RETURN jsonb_build_object('ok', false, 'message',
      'Vui lòng đợi ' || ceil(extract(epoch from (v_last + make_interval(secs => v_gap) - now())))::int
      || ' giây trước khi yêu cầu mã mới.');
  END IF;

  UPDATE otp_codes SET used = true
  WHERE target = v_target AND purpose = p_purpose AND used = false;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  INSERT INTO otp_codes (target, purpose, "codeHash", "expiresAt")
  VALUES (v_target, p_purpose, crypt(v_code, gen_salt('bf', 6)),
          now() + make_interval(mins => v_ttl));

  PERFORM send_otp_mail(v_user.email, v_user."fullName", v_code, p_purpose);

  RETURN jsonb_build_object('ok', true, 'maskedEmail', mask_email(v_user.email),
                            'expiresInMinutes', v_ttl);
END;
$$;

-- 7.4. ĐĂNG KÝ TÀI KHOẢN
CREATE OR REPLACE FUNCTION app_register(
  p_username text, p_fullname text, p_email text, p_password text, p_position text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_id       text;
  v_approval boolean := get_setting('require_admin_approval', 'true')::boolean;
  v_otp      jsonb;
  v_username text := lower(trim(p_username));
  v_email    text := trim(p_email);
BEGIN
  IF v_username !~ '^[a-z0-9._]{3,30}$' THEN
    RETURN jsonb_build_object('ok', false, 'message',
      'Tên đăng nhập từ 3-30 ký tự, chỉ gồm chữ thường, số, dấu chấm hoặc gạch dưới.');
  END IF;
  IF length(trim(p_fullname)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Vui lòng nhập họ tên đầy đủ.');
  END IF;
  IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Địa chỉ email không hợp lệ.');
  END IF;
  IF length(p_password) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Mật khẩu phải từ 6 ký tự trở lên.');
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE lower(username) = v_username) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Tên đăng nhập đã tồn tại.');
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(v_email)) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Email này đã được sử dụng cho tài khoản khác.');
  END IF;

  v_id := 'u_' || (extract(epoch from now()) * 1000)::bigint || '_' || floor(random() * 1000)::int;

  INSERT INTO users (id, username, password, "fullName", email, role, department, position,
                     "isFirstLogin", "emailVerified", "isApproved", "createdAt", "avatarUrl")
  VALUES (v_id, v_username, p_password, trim(p_fullname), v_email, 'OFFICER',
          'Tổ Tổng hợp', COALESCE(p_position, ''), false, false, NOT v_approval,
          (extract(epoch from now()) * 1000)::bigint,
          'https://ui-avatars.com/api/?name=' || replace(trim(p_fullname), ' ', '+') ||
          '&background=059669&color=fff');

  v_otp := issue_otp(v_id, 'REGISTER');
  IF (v_otp->>'ok')::boolean IS NOT TRUE THEN
    DELETE FROM users WHERE id = v_id;   -- huỷ đăng ký nếu không gửi được mã
    RETURN v_otp;
  END IF;

  RETURN jsonb_build_object('ok', true, 'username', v_username,
                            'maskedEmail', v_otp->>'maskedEmail',
                            'requireApproval', v_approval);
END;
$$;

-- 7.5. YÊU CẦU GỬI LẠI MÃ
CREATE OR REPLACE FUNCTION app_request_otp(p_target text, p_purpose text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_user users%ROWTYPE; v_t text := trim(p_target);
BEGIN
  SELECT * INTO v_user FROM users
  WHERE lower(username) = lower(v_t) OR lower(email) = lower(v_t) LIMIT 1;

  IF NOT FOUND THEN
    -- Không tiết lộ tài khoản có tồn tại hay không
    IF p_purpose = 'RESET' THEN
      RETURN jsonb_build_object('ok', true, 'maskedEmail', '***');
    END IF;
    RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy tài khoản.');
  END IF;

  RETURN issue_otp(v_user.id, p_purpose);
END;
$$;

-- 7.6. XÁC THỰC MÃ OTP
CREATE OR REPLACE FUNCTION app_verify_otp(p_target text, p_purpose text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_user     users%ROWTYPE;
  v_rec      otp_codes%ROWTYPE;
  v_max      int := get_setting('otp_max_attempts', '5')::int;
  v_token    text;
  v_approval boolean := get_setting('require_admin_approval', 'true')::boolean;
  v_t        text := trim(p_target);
BEGIN
  SELECT * INTO v_user FROM users
  WHERE lower(username) = lower(v_t) OR lower(email) = lower(v_t) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy tài khoản.');
  END IF;

  SELECT * INTO v_rec FROM otp_codes
  WHERE target = lower(v_user.username) AND purpose = p_purpose AND used = false
  ORDER BY "createdAt" DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message',
      'Chưa có mã xác thực nào. Vui lòng bấm gửi lại mã.');
  END IF;
  IF now() > v_rec."expiresAt" THEN
    RETURN jsonb_build_object('ok', false, 'message',
      'Mã xác thực đã hết hạn. Vui lòng lấy mã mới.');
  END IF;
  IF v_rec.attempts >= v_max THEN
    RETURN jsonb_build_object('ok', false, 'message',
      'Nhập sai quá số lần cho phép. Vui lòng lấy mã mới.');
  END IF;

  IF crypt(trim(p_code), v_rec."codeHash") <> v_rec."codeHash" THEN
    UPDATE otp_codes SET attempts = attempts + 1 WHERE id = v_rec.id;
    RETURN jsonb_build_object('ok', false, 'message',
      'Mã xác thực không đúng. Còn ' || (v_max - v_rec.attempts - 1) || ' lần thử.');
  END IF;

  IF p_purpose = 'RESET' THEN
    v_token := gen_random_uuid()::text;
    UPDATE otp_codes SET used = true, token = v_token,
                         "tokenExpiresAt" = now() + interval '10 minutes'
    WHERE id = v_rec.id;
    RETURN jsonb_build_object('ok', true, 'resetToken', v_token, 'username', v_user.username);
  END IF;

  UPDATE otp_codes SET used = true WHERE id = v_rec.id;
  UPDATE users SET "emailVerified" = true WHERE id = v_user.id;

  RETURN jsonb_build_object('ok', true, 'username', v_user.username,
                            'requireApproval', v_approval AND (v_user."isApproved" IS FALSE));
END;
$$;

-- 7.7. ĐẶT LẠI MẬT KHẨU BẰNG TOKEN
CREATE OR REPLACE FUNCTION app_reset_password(p_target text, p_token text, p_new_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_user users%ROWTYPE; v_rec otp_codes%ROWTYPE; v_t text := trim(p_target);
BEGIN
  IF length(p_new_password) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Mật khẩu mới phải từ 6 ký tự trở lên.');
  END IF;

  SELECT * INTO v_user FROM users
  WHERE lower(username) = lower(v_t) OR lower(email) = lower(v_t) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Không tìm thấy tài khoản.');
  END IF;

  SELECT * INTO v_rec FROM otp_codes
  WHERE target = lower(v_user.username) AND purpose = 'RESET' AND token = p_token LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message',
      'Phiên xác thực không hợp lệ. Vui lòng thực hiện lại.');
  END IF;
  IF now() > v_rec."tokenExpiresAt" THEN
    RETURN jsonb_build_object('ok', false, 'message',
      'Phiên xác thực đã hết hạn. Vui lòng thực hiện lại.');
  END IF;

  UPDATE users SET password = p_new_password, "isFirstLogin" = false WHERE id = v_user.id;
  UPDATE otp_codes SET token = NULL, "tokenExpiresAt" = NULL WHERE id = v_rec.id;

  RETURN jsonb_build_object('ok', true, 'message', 'Đặt lại mật khẩu thành công.');
END;
$$;


-- 7.8. GỬI EMAIL THÔNG BÁO THÔNG THƯỜNG (ứng dụng gọi)
CREATE OR REPLACE FUNCTION app_send_mail(p_to text, p_subject text, p_body text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, net
AS $$
DECLARE
  v_url text := get_setting('mailer_url', '');
  v_key text := get_setting('mailer_key', '');
BEGIN
  IF v_url = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Chưa khai báo dịch vụ gửi email.');
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := jsonb_build_object('action', 'sendMail', 'apiKey', v_key,
                                    'to', p_to, 'subject', p_subject, 'body', p_body)
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'message', SQLERRM);
  END;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 8. CẤP QUYỀN GỌI HÀM CHO ỨNG DỤNG
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION app_login(text, text)                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_change_password(text, text, text)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_register(text, text, text, text, text)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_request_otp(text, text)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_verify_otp(text, text, text)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_reset_password(text, text, text)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION app_send_mail(text, text, text)              TO anon, authenticated;

-- Các hàm nội bộ: KHÔNG cấp quyền cho ứng dụng
REVOKE EXECUTE ON FUNCTION issue_otp(text, text)                       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION send_otp_mail(text, text, text, text)       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_setting(text, text)                     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION safe_user_json(text)                        FROM anon, authenticated;

-- Chặn tuyệt đối truy cập trực tiếp vào các bảng nhạy cảm (phòng thủ nhiều lớp)
REVOKE ALL ON user_secrets FROM anon, authenticated;
REVOKE ALL ON otp_codes    FROM anon, authenticated;
REVOKE ALL ON app_settings FROM anon, authenticated;

-- Dọn mã OTP cũ (chạy tay hoặc đặt lịch pg_cron)
CREATE OR REPLACE FUNCTION cleanup_otp_codes()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  DELETE FROM otp_codes WHERE "expiresAt" < now() - interval '1 day';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------
-- 9. KHAI BÁO DỊCH VỤ GỬI EMAIL  ***BẮT BUỘC LÀM***
-- Supabase không gửi được email tuỳ ý từ SQL. Hệ thống dùng lại Web App
-- Google Apps Script (chỉ để gửi mail, không lưu dữ liệu gì).
-- Thay URL bên dưới rồi chạy:
-- ---------------------------------------------------------------------
-- UPDATE app_settings SET value = 'https://script.google.com/macros/s/XXX/exec'
--   WHERE key = 'mailer_url';
-- UPDATE app_settings SET value = '' WHERE key = 'mailer_key';

-- Tắt yêu cầu duyệt tài khoản (KHÔNG khuyến nghị):
-- UPDATE app_settings SET value = 'false' WHERE key = 'require_admin_approval';
