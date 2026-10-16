-- =====================================================================
-- 11. CHỐNG ĐIỂM DANH HỘ
-- Chạy SAU các file 01 → 10. An toàn khi chạy lại nhiều lần, không mất dữ liệu.
--
--  1) Chụp khuôn mặt khi điểm danh: so với ảnh mẫu của tài khoản (lần đầu tự tạo ảnh mẫu,
--     chờ Ban tổ chức duyệt). Trùng mặt giữa 2 tài khoản → cảnh báo.
--  2) Phát hiện 1 máy dùng nhiều trình duyệt: cùng dấu vân tay phần cứng + cùng IP
--     trong 15 phút, khác tài khoản → CẢNH BÁO (không chặn).
--  3) Gắn tài khoản với thiết bị: lần đầu tự gắn, đổi máy thì cảnh báo; đổi quá
--     1 lần trong 30 ngày thì chờ duyệt.
--  4) Chặn IP trung tâm dữ liệu / VPN / proxy / Tor (tra cứu ip-api.com, lưu đệm 7 ngày).
--     Dịch vụ tra cứu lỗi → vẫn cho điểm danh, gắn cờ.
--
-- Nguyên tắc: chỉ CHẶN khi chắc chắn (IP VPN, mặt không khớp rõ). Còn lại cho điểm danh
-- và đưa vào danh sách "Chờ kiểm tra" để Ban tổ chức duyệt 1 chạm.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tiện ích gọi HTTP để tra cứu IP (Supabase có sẵn, chỉ cần bật)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Không bật được tiện ích http: phần chặn IP VPN sẽ tạm bỏ qua (vẫn gắn cờ). Lỗi: %', SQLERRM;
END
$$;

-- ---------------------------------------------------------------------
-- 0. THAM SỐ (đổi bằng: UPDATE app_settings SET value = '...' WHERE key = '...')
-- ---------------------------------------------------------------------
--  face_mode          : 'flag'   = không chụp được mặt vẫn cho điểm danh, chờ kiểm tra (mặc định)
--                       'strict' = bắt buộc chụp mặt mới được điểm danh
--                       'off'    = tắt chụp mặt
--  face_ok            : khoảng cách khuôn mặt ≤ mức này là khớp (mặc định 0.5)
--  face_reject        : khoảng cách > mức này là KHÔNG khớp → từ chối (mặc định 0.65)
--  face_same          : 2 tài khoản có mặt gần hơn mức này coi là cùng 1 người (mặc định 0.45)
--  ip_block           : 'on' = chặn IP VPN/proxy/trung tâm dữ liệu, 'off' = chỉ gắn cờ
--  device_change_days : số ngày tính giới hạn đổi máy (mặc định 30)
--  photo_keep_days    : số ngày giữ ảnh điểm danh (mặc định 60; ảnh mẫu giữ vĩnh viễn)
INSERT INTO app_settings (key, value) VALUES
  ('face_mode', 'flag'), ('face_ok', '0.5'), ('face_reject', '0.65'), ('face_same', '0.45'),
  ('ip_block', 'on'), ('device_change_days', '30'), ('photo_keep_days', '60')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 1. BẢNG DỮ LIỆU
-- ---------------------------------------------------------------------
-- Cột bổ sung cho bản ghi điểm danh (đọc công khai như cũ)
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "serverIp"     text;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "faceDist"     real;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "checkFlags"   jsonb;   -- [{code, ref?, refName?}]
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "reviewStatus" text;    -- NULL | PENDING | OK
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "reviewedBy"   text;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "reviewedAt"   bigint;
CREATE INDEX IF NOT EXISTS idx_att_records_review ON attendance_records ("reviewStatus") WHERE "reviewStatus" = 'PENDING';

-- Ảnh mẫu khuôn mặt của cán bộ (KHÔNG ai đọc trực tiếp được)
CREATE TABLE IF NOT EXISTS user_faces (
  "userId"     text PRIMARY KEY,
  descriptor   float8[] NOT NULL,       -- 128 số đặc trưng khuôn mặt
  photo        text,                    -- ảnh JPEG nhỏ (data URL)
  status       text NOT NULL DEFAULT 'PENDING',   -- PENDING | APPROVED
  "createdAt"  bigint,
  "approvedBy" text,
  "approvedAt" bigint
);

-- Ảnh + đặc trưng của từng lượt điểm danh (tự xoá sau photo_keep_days ngày)
CREATE TABLE IF NOT EXISTS attendance_evidence (
  "recordId"   text PRIMARY KEY,
  "sessionId"  text,
  "userId"     text,
  descriptor   float8[],
  photo        text,
  "createdAt"  bigint
);
CREATE INDEX IF NOT EXISTS idx_att_evidence_session ON attendance_evidence ("sessionId");
CREATE INDEX IF NOT EXISTS idx_att_evidence_created ON attendance_evidence ("createdAt");

-- Lượt điểm danh bị TỪ CHỐI (để Ban tổ chức xem và cho điểm danh nếu chặn nhầm)
CREATE TABLE IF NOT EXISTS attendance_attempts (
  id           text PRIMARY KEY,
  "sessionId"  text,
  "userId"     text,
  reason       text,           -- IP_BLOCKED | FACE_MISMATCH | FACE_REQUIRED | REJECTED_BY_REVIEW
  detail       text,
  "faceDist"   real,
  photo        text,
  "serverIp"   text,
  "deviceId"   text,
  fingerprint  text,
  "createdAt"  bigint,
  resolved     text,           -- NULL | ACCEPTED | DISMISSED
  "resolvedBy" text,
  "resolvedAt" bigint
);
CREATE INDEX IF NOT EXISTS idx_att_attempts_session ON attendance_attempts ("sessionId");

-- Thiết bị đã gắn với tài khoản
CREATE TABLE IF NOT EXISTS user_devices (
  id           text PRIMARY KEY,
  "userId"     text NOT NULL,
  "deviceId"   text,
  fingerprint  text,
  active       boolean NOT NULL DEFAULT true,
  "firstSeen"  bigint,
  "lastSeen"   bigint
);
CREATE INDEX IF NOT EXISTS idx_user_devices_user   ON user_devices ("userId");
CREATE INDEX IF NOT EXISTS idx_user_devices_device ON user_devices ("deviceId");

-- Kết quả tra cứu IP (lưu đệm)
CREATE TABLE IF NOT EXISTS ip_reputation (
  ip           text PRIMARY KEY,
  bad          boolean NOT NULL DEFAULT false,
  kind         text,           -- VPN | Proxy | Tor | Trung tâm dữ liệu | ALLOWED
  org          text,
  manual       boolean NOT NULL DEFAULT false,   -- Ban tổ chức cho phép thủ công
  "checkedAt"  timestamptz DEFAULT now()
);
-- Xoá kết quả tra cứu tự động cũ (giữ IP Ban tổ chức đã cho phép) khi chạy lại file này
DELETE FROM ip_reputation WHERE manual = false;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_faces', 'attendance_evidence', 'attendance_attempts', 'user_devices', 'ip_reputation'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------
-- 2. HÀM NỘI BỘ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cfg_num(p_key text, p_default float8)
RETURNS float8 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT nullif(trim(value), '')::float8 FROM app_settings WHERE key = p_key), p_default)
$$;

CREATE OR REPLACE FUNCTION cfg_text(p_key text, p_default text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT nullif(trim(value), '') FROM app_settings WHERE key = p_key), p_default)
$$;

-- IP thật của máy gửi yêu cầu (do Supabase/Cloudflare ghi, điện thoại không tự khai được)
CREATE OR REPLACE FUNCTION client_ip()
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE h jsonb;
BEGIN
  BEGIN
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN others THEN RETURN NULL;
  END;
  IF h IS NULL THEN RETURN NULL; END IF;
  RETURN coalesce(nullif(trim(h->>'cf-connecting-ip'), ''),
                  nullif(trim(h->>'x-real-ip'), ''),
                  nullif(trim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), ''));
END;
$$;

-- Tra cứu IP: {checked, bad, kind, org}. Lỗi/hết lượt → checked = false (không chặn)
CREATE OR REPLACE FUNCTION ip_reputation_of(p_ip text, p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE r ip_reputation%ROWTYPE; v_status int; v_body text; j jsonb;
        v_bad boolean; v_kind text; v_org text;
BEGIN
  IF p_ip IS NULL OR p_ip = '' THEN RETURN jsonb_build_object('checked', false); END IF;

  SELECT * INTO r FROM ip_reputation WHERE ip = p_ip;
  IF FOUND AND (r.manual OR (NOT p_force AND r."checkedAt" > now() - CASE WHEN r.bad THEN interval '1 day' ELSE interval '7 days' END)) THEN
    RETURN jsonb_build_object('checked', true, 'bad', r.bad, 'kind', r.kind, 'org', r.org, 'cached', true);
  END IF;

  -- ip-api.com (miễn phí, dùng phi thương mại, 45 lượt/phút; có lưu đệm nên đủ dùng)
  BEGIN
    PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '2500');
    SELECT status, content INTO v_status, v_body
      FROM extensions.http_get('http://ip-api.com/json/' || p_ip || '?fields=status,message,proxy,hosting,isp,org,as');
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('checked', false, 'error', left(SQLERRM, 200));
  END;

  IF v_status IS DISTINCT FROM 200 OR v_body IS NULL THEN
    RETURN jsonb_build_object('checked', false, 'error', 'HTTP ' || coalesce(v_status::text, '?'));
  END IF;
  BEGIN
    j := v_body::jsonb;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('checked', false, 'error', 'Dữ liệu tra cứu không hợp lệ');
  END;
  IF coalesce(j->>'status', '') <> 'success' THEN
    RETURN jsonb_build_object('checked', false, 'error', left(coalesce(j->>'message', 'tra cứu thất bại'), 200));
  END IF;

  v_kind := CASE
    WHEN coalesce((j->>'proxy')::boolean, false)   THEN 'VPN/Proxy'
    WHEN coalesce((j->>'hosting')::boolean, false) THEN 'Trung tâm dữ liệu'
    ELSE NULL END;
  v_bad := v_kind IS NOT NULL;
  v_org := left(coalesce(nullif(j->>'isp', ''), nullif(j->>'org', ''), j->>'as', ''), 120);

  INSERT INTO ip_reputation (ip, bad, kind, org, manual, "checkedAt")
  VALUES (p_ip, v_bad, v_kind, v_org, false, now())
  ON CONFLICT (ip) DO UPDATE SET bad = EXCLUDED.bad, kind = EXCLUDED.kind, org = EXCLUDED.org, "checkedAt" = now()
  WHERE ip_reputation.manual = false;

  RETURN jsonb_build_object('checked', true, 'bad', v_bad, 'kind', v_kind, 'org', v_org);
END;
$$;

-- Khoảng cách giữa 2 khuôn mặt (càng nhỏ càng giống)
CREATE OR REPLACE FUNCTION face_dist(a float8[], b float8[])
RETURNS float8 LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN a IS NULL OR b IS NULL OR array_length(a, 1) IS DISTINCT FROM array_length(b, 1) THEN NULL
         ELSE sqrt((SELECT sum((x - y) * (x - y)) FROM unnest(a, b) AS t(x, y))) END
$$;

-- Đọc 128 số đặc trưng từ JSON, sai định dạng → NULL
CREATE OR REPLACE FUNCTION face_from_json(p jsonb)
RETURNS float8[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v float8[];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) <> 128 THEN RETURN NULL; END IF;
  SELECT array_agg(x::float8 ORDER BY i) INTO v
    FROM jsonb_array_elements_text(p) WITH ORDINALITY AS t(x, i);
  IF EXISTS (SELECT 1 FROM unnest(v) z WHERE z IS NULL OR abs(z) > 5) THEN RETURN NULL; END IF;
  RETURN v;
EXCEPTION WHEN others THEN RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION user_name(p_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT "fullName" FROM users WHERE id = p_id), p_id)
$$;

-- Thêm cờ vào bản ghi đã có (dùng khi phát hiện trùng với người điểm danh trước)
CREATE OR REPLACE FUNCTION add_record_flag(p_record_id text, p_flag jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE attendance_records
     SET "checkFlags" = coalesce("checkFlags", '[]'::jsonb) || jsonb_build_array(p_flag),
         "reviewStatus" = 'PENDING'
   WHERE id = p_record_id
     AND NOT coalesce("checkFlags", '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('code', p_flag->>'code', 'ref', p_flag->>'ref'));
$$;

CREATE OR REPLACE FUNCTION log_attempt(p_session text, p_user text, p_reason text, p_detail text,
  p_dist float8, p_photo text, p_ip text, p_device text, p_fp text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO attendance_attempts (id, "sessionId", "userId", reason, detail, "faceDist", photo,
                                   "serverIp", "deviceId", fingerprint, "createdAt")
  VALUES ('atp_' || now_ms() || '_' || substr(md5(random()::text), 1, 6), p_session, p_user, p_reason,
          left(p_detail, 300), p_dist, p_photo, p_ip, p_device, p_fp, now_ms());
$$;

-- ---------------------------------------------------------------------
-- 3. CẤU HÌNH CHO MÀN HÌNH ĐIỂM DANH (không cần đăng nhập, không lộ gì nhạy cảm)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_checkin_config()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('ok', true, 'faceMode', cfg_text('face_mode', 'flag'))
$$;

-- ---------------------------------------------------------------------
-- 4. ĐIỂM DANH (thay bản ở file 06)
-- p_face: {descriptor:[128 số], photo:'data:image/jpeg;base64,...', live:true|false,
--          method:'camera'|'file'|'none', reason:'...'}
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS app_check_in(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION app_check_in(
  p_token text, p_session_id text, p_device_id text,
  p_ip text DEFAULT NULL, p_fingerprint text DEFAULT NULL, p_qr text DEFAULT NULL,
  p_face jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  actor users%ROWTYPE; s attendance_sessions%ROWTYPE; parts text[];
  v_now bigint := now_ms(); v_rec_id text; v_ip text; v_rep jsonb;
  v_flags jsonb := '[]'::jsonb; v_heavy boolean := false;
  v_mode text; v_desc float8[]; v_photo text; v_method text; v_dist float8;
  v_face user_faces%ROWTYPE; v_ok float8; v_reject float8; v_same float8;
  v_other record; v_dev user_devices%ROWTYPE; v_cnt int; v_days int;
  v_fp text := nullif(trim(coalesce(p_fingerprint, '')), '');
  v_device text := nullif(trim(coalesce(p_device_id, '')), '');
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

  v_rec_id := s.id || '__' || actor.id;
  IF EXISTS (SELECT 1 FROM attendance_records WHERE id = v_rec_id OR ("sessionId" = s.id AND "userId" = actor.id)) THEN
    RETURN err('Bạn đã điểm danh cho hội nghị này rồi.');
  END IF;

  IF v_device IS NOT NULL AND EXISTS (
       SELECT 1 FROM attendance_records
       WHERE "sessionId" = s.id AND "deviceId" = v_device AND "userId" <> actor.id) THEN
    RETURN err('Thiết bị này đã được sử dụng để điểm danh cho tài khoản khác.');
  END IF;

  -- Ảnh chụp (nếu có) — giới hạn ~110 KB
  v_photo := p_face->>'photo';
  IF v_photo IS NULL OR v_photo !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' OR length(v_photo) > 150000 THEN
    v_photo := NULL;
  END IF;
  v_desc   := face_from_json(p_face->'descriptor');
  v_method := coalesce(nullif(p_face->>'method', ''), CASE WHEN v_desc IS NULL THEN 'none' ELSE 'camera' END);

  -- ---------- (4) IP trung tâm dữ liệu / VPN ----------
  v_ip  := client_ip();
  v_rep := ip_reputation_of(v_ip);
  IF coalesce((v_rep->>'checked')::boolean, false) = false THEN
    v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'IP_UNCHECKED'));
  ELSIF (v_rep->>'bad')::boolean THEN
    IF cfg_text('ip_block', 'on') = 'on' THEN
      PERFORM log_attempt(s.id, actor.id, 'IP_BLOCKED',
        coalesce(v_rep->>'kind', '') || CASE WHEN coalesce(v_rep->>'org', '') <> '' THEN ' – ' || (v_rep->>'org') ELSE '' END,
        NULL, v_photo, v_ip, v_device, v_fp);
      RETURN err('Máy đang kết nối qua ' || coalesce(v_rep->>'kind', 'VPN/proxy')
        || CASE WHEN coalesce(v_rep->>'org', '') <> '' THEN ' (' || (v_rep->>'org') || ')' ELSE '' END
        || '. Tắt VPN, ứng dụng đổi IP hoặc "Chuyển tiếp bảo mật iCloud" (Private Relay), dùng Wi-Fi hội trường hoặc 4G rồi quét lại.');
    END IF;
    v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'IP_BAD', 'refName', coalesce(v_rep->>'kind', '') || ' ' || coalesce(v_rep->>'org', '')));
    v_heavy := true;
  END IF;

  -- ---------- (1) Khuôn mặt ----------
  v_mode   := cfg_text('face_mode', 'flag');
  v_ok     := cfg_num('face_ok', 0.5);
  v_reject := cfg_num('face_reject', 0.65);
  v_same   := cfg_num('face_same', 0.45);

  IF v_mode <> 'off' THEN
    IF v_desc IS NULL THEN
      IF v_mode = 'strict' THEN
        PERFORM log_attempt(s.id, actor.id, 'FACE_REQUIRED', coalesce(p_face->>'reason', ''), NULL, v_photo, v_ip, v_device, v_fp);
        RETURN err('Cần chụp khuôn mặt để điểm danh. Nếu máy không chụp được, đến bàn Ban tổ chức để được điểm danh.');
      END IF;
      v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'FACE_NONE', 'refName', left(coalesce(p_face->>'reason', ''), 120)));
      v_heavy := true;
    ELSE
      SELECT * INTO v_face FROM user_faces WHERE "userId" = actor.id;
      IF NOT FOUND THEN
        -- Lần đầu: lấy ảnh này làm ảnh mẫu, chờ Ban tổ chức duyệt
        INSERT INTO user_faces ("userId", descriptor, photo, status, "createdAt")
        VALUES (actor.id, v_desc, v_photo, 'PENDING', v_now)
        ON CONFLICT ("userId") DO NOTHING;
        v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'FACE_ENROLL'));
        v_heavy := true;
        -- Mặt này đã là ảnh mẫu của tài khoản khác?
        FOR v_other IN
          SELECT f."userId", face_dist(f.descriptor, v_desc) AS d FROM user_faces f
           WHERE f."userId" <> actor.id ORDER BY 2 ASC LIMIT 1
        LOOP
          IF v_other.d IS NOT NULL AND v_other.d < v_same THEN
            v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'FACE_DUP_ENROLL', 'ref', v_other."userId", 'refName', user_name(v_other."userId")));
          END IF;
        END LOOP;
      ELSE
        v_dist := face_dist(v_face.descriptor, v_desc);
        IF v_dist IS NOT NULL AND v_dist > v_reject THEN
          PERFORM log_attempt(s.id, actor.id, 'FACE_MISMATCH', 'Khoảng cách ' || round(v_dist::numeric, 2), v_dist, v_photo, v_ip, v_device, v_fp);
          RETURN err('Khuôn mặt không khớp với ảnh mẫu của tài khoản này. Chụp lại nơi đủ sáng, nhìn thẳng camera. Nếu vẫn không được, báo Ban tổ chức để được xác nhận.');
        ELSIF v_dist IS NOT NULL AND v_dist > v_ok THEN
          v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'FACE_WEAK', 'refName', round(v_dist::numeric, 2)::text));
          v_heavy := true;
        END IF;
      END IF;

      IF v_method = 'file' THEN
        v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'FACE_FILE'));
        v_heavy := true;
      ELSIF coalesce((p_face->>'live')::boolean, false) = false THEN
        v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'FACE_NOLIVE'));
        v_heavy := true;
      END IF;

      -- Cùng khuôn mặt với người khác đã điểm danh trong hội nghị này
      FOR v_other IN
        SELECT e."recordId", e."userId", face_dist(e.descriptor, v_desc) AS d
          FROM attendance_evidence e
         WHERE e."sessionId" = s.id AND e."userId" <> actor.id AND e.descriptor IS NOT NULL
      LOOP
        IF v_other.d IS NOT NULL AND v_other.d < v_same THEN
          v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'FACE_LIKE_OTHER', 'ref', v_other."userId", 'refName', user_name(v_other."userId")));
          v_heavy := true;
          PERFORM add_record_flag(v_other."recordId", jsonb_build_object('code', 'FACE_LIKE_OTHER', 'ref', actor.id, 'refName', actor."fullName"));
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- ---------- (3) Gắn tài khoản với thiết bị ----------
  v_days := greatest(cfg_num('device_change_days', 30)::int, 1);
  IF v_device IS NOT NULL THEN
    SELECT * INTO v_dev FROM user_devices
     WHERE "userId" = actor.id AND active
       AND ("deviceId" = v_device OR (v_fp IS NOT NULL AND fingerprint = v_fp))
     ORDER BY ("deviceId" = v_device) DESC LIMIT 1;
    IF FOUND THEN
      -- Cùng máy (kể cả khi trình duyệt đã xoá dữ liệu nhưng phần cứng giống hệt)
      UPDATE user_devices SET "lastSeen" = v_now, "deviceId" = v_device, fingerprint = coalesce(v_fp, fingerprint)
       WHERE id = v_dev.id;
    ELSE
      SELECT count(*) INTO v_cnt FROM user_devices WHERE "userId" = actor.id;
      IF v_cnt > 0 THEN
        SELECT count(*) INTO v_cnt FROM user_devices
         WHERE "userId" = actor.id AND "firstSeen" > v_now - v_days::bigint * 86400000
           AND id <> (SELECT id FROM user_devices WHERE "userId" = actor.id ORDER BY "firstSeen" ASC LIMIT 1);
        IF v_cnt >= 1 THEN
          v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'DEVICE_CHANGE_LIMIT', 'refName', (v_cnt + 1)::text));
          v_heavy := true;
        ELSE
          v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'DEVICE_NEW'));
        END IF;
        UPDATE user_devices SET active = false WHERE "userId" = actor.id AND active;
      END IF;
      INSERT INTO user_devices (id, "userId", "deviceId", fingerprint, active, "firstSeen", "lastSeen")
      VALUES ('dev_' || v_now || '_' || substr(md5(random()::text), 1, 6), actor.id, v_device, v_fp, true, v_now, v_now);
    END IF;

    -- Máy này đang gắn với tài khoản khác?
    FOR v_other IN
      SELECT DISTINCT "userId" FROM user_devices WHERE active AND "deviceId" = v_device AND "userId" <> actor.id
    LOOP
      v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'DEVICE_OF_OTHER', 'ref', v_other."userId", 'refName', user_name(v_other."userId")));
      v_heavy := true;
    END LOOP;
  END IF;

  -- ---------- (2) Cùng 1 máy, khác trình duyệt ----------
  IF v_fp IS NOT NULL AND v_ip IS NOT NULL THEN
    FOR v_other IN
      SELECT id, "userId" FROM attendance_records
       WHERE "sessionId" = s.id AND "userId" <> actor.id AND "guestName" IS NULL
         AND fingerprint = v_fp AND "serverIp" = v_ip AND "timestamp" > v_now - 15 * 60000
    LOOP
      v_flags := v_flags || jsonb_build_array(jsonb_build_object('code', 'SAME_DEVICE', 'ref', v_other."userId", 'refName', user_name(v_other."userId")));
      v_heavy := true;
      PERFORM add_record_flag(v_other.id, jsonb_build_object('code', 'SAME_DEVICE', 'ref', actor.id, 'refName', actor."fullName"));
    END LOOP;
  END IF;

  -- ---------- Ghi nhận ----------
  INSERT INTO attendance_records (id, "sessionId", "userId", "timestamp", date, "deviceId",
                                  "ipAddress", fingerprint, status, "serverIp", "faceDist", "checkFlags", "reviewStatus")
  VALUES (v_rec_id, s.id, actor.id, v_now,
          to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'),
          v_device, p_ip, v_fp, 'PRESENT', v_ip, v_dist,
          CASE WHEN jsonb_array_length(v_flags) > 0 THEN v_flags ELSE NULL END,
          CASE WHEN v_heavy THEN 'PENDING' ELSE NULL END)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN err('Bạn đã điểm danh cho hội nghị này rồi.'); END IF;

  IF v_desc IS NOT NULL OR v_photo IS NOT NULL THEN
    INSERT INTO attendance_evidence ("recordId", "sessionId", "userId", descriptor, photo, "createdAt")
    VALUES (v_rec_id, s.id, actor.id, v_desc, v_photo, v_now)
    ON CONFLICT ("recordId") DO UPDATE SET descriptor = EXCLUDED.descriptor, photo = EXCLUDED.photo, "createdAt" = EXCLUDED."createdAt";
  END IF;

  -- Dọn ảnh cũ (thỉnh thoảng, giữ ảnh của lượt còn chờ kiểm tra)
  IF random() < 0.05 THEN
    DELETE FROM attendance_evidence e
     WHERE e."createdAt" < v_now - cfg_num('photo_keep_days', 60)::bigint * 86400000
       AND NOT EXISTS (SELECT 1 FROM attendance_records r WHERE r.id = e."recordId" AND r."reviewStatus" = 'PENDING');
    DELETE FROM attendance_attempts
     WHERE "createdAt" < v_now - cfg_num('photo_keep_days', 60)::bigint * 86400000;
  END IF;

  RETURN jsonb_build_object('ok', true, 'title', s.title,
    'expected', coalesce(s."expectedUserIds", '[]'::jsonb) ? actor.id,
    'pending', v_heavy,
    'enrolled', v_flags @> '[{"code":"FACE_ENROLL"}]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------
-- 5. BAN TỔ CHỨC: KIỂM TRA, DUYỆT
-- ---------------------------------------------------------------------
-- Danh sách lượt bị từ chối + trạng thái ảnh mẫu của những người trong hội nghị
CREATE OR REPLACE FUNCTION app_checkin_review(p_token text, p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền kiểm tra điểm danh.'); END IF;
  RETURN jsonb_build_object('ok', true,
    'attempts', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'userId', a."userId", 'reason', a.reason, 'detail', a.detail, 'faceDist', a."faceDist",
        'serverIp', a."serverIp", 'createdAt', a."createdAt", 'resolved', a.resolved, 'hasPhoto', a.photo IS NOT NULL)
        ORDER BY a."createdAt" DESC)
      FROM attendance_attempts a WHERE a."sessionId" = p_session_id), '[]'::jsonb),
    'faces', coalesce((SELECT jsonb_object_agg(f."userId", f.status)
      FROM user_faces f WHERE f."userId" IN (SELECT "userId" FROM attendance_records WHERE "sessionId" = p_session_id
                                              UNION SELECT "userId" FROM attendance_attempts WHERE "sessionId" = p_session_id)), '{}'::jsonb)
  );
END;
$$;

-- Ảnh để đối chiếu: p_kind = 'record' | 'attempt'. Trả kèm ảnh mẫu của tài khoản
CREATE OR REPLACE FUNCTION app_checkin_photo(p_token text, p_kind text, p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; v_photo text; v_uid text;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền xem ảnh điểm danh.'); END IF;
  IF p_kind = 'attempt' THEN
    SELECT photo, "userId" INTO v_photo, v_uid FROM attendance_attempts WHERE id = p_id;
  ELSE
    SELECT e.photo, r."userId" INTO v_photo, v_uid
      FROM attendance_records r LEFT JOIN attendance_evidence e ON e."recordId" = r.id WHERE r.id = p_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'photo', v_photo,
    'enrollPhoto', (SELECT photo FROM user_faces WHERE "userId" = v_uid),
    'enrollStatus', (SELECT status FROM user_faces WHERE "userId" = v_uid));
END;
$$;

-- Duyệt lượt điểm danh bị gắn cờ: OK = xác nhận đúng người; REJECT = loại (xoá bản ghi)
CREATE OR REPLACE FUNCTION app_checkin_decide(p_token text, p_record_id text, p_decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; r attendance_records%ROWTYPE; v_photo text;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền duyệt điểm danh.'); END IF;
  SELECT * INTO r FROM attendance_records WHERE id = p_record_id;
  IF NOT FOUND THEN RETURN err('Không tìm thấy lượt điểm danh.'); END IF;

  IF p_decision = 'OK' THEN
    UPDATE attendance_records SET "reviewStatus" = 'OK', "reviewedBy" = actor.id, "reviewedAt" = now_ms() WHERE id = r.id;
    -- Lần đầu điểm danh: xác nhận luôn ảnh mẫu
    UPDATE user_faces SET status = 'APPROVED', "approvedBy" = actor.id, "approvedAt" = now_ms()
     WHERE "userId" = r."userId" AND status = 'PENDING';
  ELSIF p_decision = 'REJECT' THEN
    SELECT photo INTO v_photo FROM attendance_evidence WHERE "recordId" = r.id;
    INSERT INTO attendance_attempts (id, "sessionId", "userId", reason, detail, "faceDist", photo, "serverIp",
                                     "deviceId", fingerprint, "createdAt", resolved, "resolvedBy", "resolvedAt")
    VALUES ('atp_' || now_ms() || '_' || substr(md5(random()::text), 1, 6), r."sessionId", r."userId",
            'REJECTED_BY_REVIEW', 'Loại bởi ' || actor."fullName", r."faceDist", v_photo, r."serverIp",
            r."deviceId", r.fingerprint, r."timestamp", 'DISMISSED', actor.id, now_ms());
    DELETE FROM attendance_evidence WHERE "recordId" = r.id;
    DELETE FROM attendance_records WHERE id = r.id;
    -- Ảnh mẫu chưa duyệt tạo từ lượt bị loại → xoá để lần sau chụp lại
    DELETE FROM user_faces WHERE "userId" = r."userId" AND status = 'PENDING';
  ELSE
    RETURN err('Quyết định không hợp lệ.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Lượt bị từ chối: ACCEPT = cho điểm danh (chặn nhầm), DISMISS = giữ nguyên từ chối
CREATE OR REPLACE FUNCTION app_attempt_resolve(p_token text, p_attempt_id text, p_decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; a attendance_attempts%ROWTYPE; v_id text;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền duyệt điểm danh.'); END IF;
  SELECT * INTO a FROM attendance_attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN RETURN err('Không tìm thấy lượt điểm danh.'); END IF;

  IF p_decision = 'ACCEPT' THEN
    v_id := a."sessionId" || '__' || a."userId";
    INSERT INTO attendance_records (id, "sessionId", "userId", "timestamp", date, "deviceId", fingerprint,
                                    status, "serverIp", "faceDist", "checkFlags", "reviewStatus", "reviewedBy", "reviewedAt")
    VALUES (v_id, a."sessionId", a."userId", a."createdAt",
            to_char(to_timestamp(a."createdAt" / 1000.0) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'),
            a."deviceId", a.fingerprint, 'PRESENT', a."serverIp", a."faceDist",
            jsonb_build_array(jsonb_build_object('code', 'MANUAL_OK', 'refName', actor."fullName")), 'OK', actor.id, now_ms())
    ON CONFLICT DO NOTHING;
    IF a.photo IS NOT NULL THEN
      INSERT INTO attendance_evidence ("recordId", "sessionId", "userId", photo, "createdAt")
      VALUES (v_id, a."sessionId", a."userId", a.photo, a."createdAt") ON CONFLICT ("recordId") DO NOTHING;
    END IF;
    UPDATE attendance_attempts SET resolved = 'ACCEPTED', "resolvedBy" = actor.id, "resolvedAt" = now_ms() WHERE id = a.id;
  ELSIF p_decision = 'DISMISS' THEN
    UPDATE attendance_attempts SET resolved = 'DISMISSED', "resolvedBy" = actor.id, "resolvedAt" = now_ms() WHERE id = a.id;
  ELSE
    RETURN err('Quyết định không hợp lệ.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Xoá ảnh mẫu (người đó chụp lại ở lần điểm danh sau) / gỡ gắn thiết bị
CREATE OR REPLACE FUNCTION app_reset_user_check(p_token text, p_user_id text, p_what text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền thực hiện.'); END IF;
  IF p_what = 'FACE' THEN
    DELETE FROM user_faces WHERE "userId" = p_user_id;
  ELSIF p_what = 'DEVICE' THEN
    DELETE FROM user_devices WHERE "userId" = p_user_id;
  ELSE
    RETURN err('Thao tác không hợp lệ.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Cho phép một IP bị nhận nhầm là VPN (ví dụ IP Wi-Fi hội trường)
CREATE OR REPLACE FUNCTION app_ip_allow(p_token text, p_ip text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền thực hiện.'); END IF;
  IF coalesce(trim(p_ip), '') = '' THEN RETURN err('Thiếu địa chỉ IP.'); END IF;
  INSERT INTO ip_reputation (ip, bad, kind, org, manual, "checkedAt")
  VALUES (trim(p_ip), false, 'ALLOWED', 'Cho phép bởi ' || actor."fullName", true, now())
  ON CONFLICT (ip) DO UPDATE SET bad = false, kind = 'ALLOWED', org = EXCLUDED.org, manual = true, "checkedAt" = now();
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Kiểm tra nhanh: IP máy đang dùng + kết quả tra cứu (để thử trước hội nghị)
CREATE OR REPLACE FUNCTION app_ip_debug(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; v_ip text;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_attendance(actor) THEN RETURN err('Bạn không có quyền thực hiện.'); END IF;
  v_ip := client_ip();
  RETURN jsonb_build_object('ok', true, 'ip', v_ip, 'rep', ip_reputation_of(v_ip, true));
END;
$$;

-- ---------------------------------------------------------------------
-- 6. QUYỀN GỌI HÀM
-- ---------------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('cfg_num', 'cfg_text', 'client_ip', 'ip_reputation_of', 'face_from_json',
                               'user_name', 'add_record_flag', 'log_attempt')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;

  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('app_checkin_config', 'app_check_in', 'app_checkin_review', 'app_checkin_photo',
                               'app_checkin_decide', 'app_attempt_resolve', 'app_reset_user_check',
                               'app_ip_allow', 'app_ip_debug')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
