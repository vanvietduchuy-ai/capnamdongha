-- =====================================================================
-- 09. BÁO CÁO NGÀY (tình hình ANTT hằng ngày)
-- Chạy SAU 01–08. An toàn, chạy lại nhiều lần không mất dữ liệu.
--
--  6 ĐẦU MỐI: Tổ An ninh, Tổ CSKV, Tổ CSTT, Tổ PCTP, Trực ban hình sự, Trực ban đơn vị.
--             Tổ Tổng hợp không báo cáo, chỉ tổng hợp.
--  KỲ BÁO CÁO "ngày D": từ <giờ chốt> ngày D-1 đến <giờ chốt> ngày D (mặc định 07:30, giờ Việt Nam).
--             Hạn nộp = giờ chốt ngày D. Nộp sau hạn → ghi "Nộp muộn".
--  NGƯỜI BÁO: KHÔNG phân công cố định. Dùng chung 1 link / 1 mã QR cho cả đơn vị.
--             Cán bộ đăng nhập, TỰ CHỌN vai trò (Tổ An ninh, Tổ CSKV, Tổ CSTT, Tổ PCTP,
--             Trực ban hình sự, Trực ban đơn vị) rồi báo cáo — vì người trực ban, người
--             báo cáo của các tổ thay đổi hằng ngày.
--             Phải đăng nhập — máy chủ ghi đúng tên người báo, không báo hộ được.
--  TRÁCH NHIỆM: mỗi lần nộp là một phiên bản, KHÔNG sửa/xoá được bản đã nộp.
--             Sửa = nộp bản mới; sau hạn nộp phải ghi lý do đính chính. Lưu đủ lịch sử.
--  BẢO MẬT:   Mọi bảng của báo cáo ngày KHÔNG đọc/ghi trực tiếp được; chỉ qua hàm có kiểm tra quyền.
--             Không nhập họ tên, số định danh của đối tượng/bị hại.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. BẢNG
-- ---------------------------------------------------------------------
-- Bản trước có phân công cố định (bảng daily_assign) — nay bỏ. Xoá các hàm phân công cũ nếu đã chạy bản trước.
DROP FUNCTION IF EXISTS app_daily_assignments(text, date, date);
DROP FUNCTION IF EXISTS app_daily_assign(text, text, date, text, text);
DROP FUNCTION IF EXISTS daily_resp(date, text);
DROP TABLE IF EXISTS daily_assign;

-- Mỗi lần nộp = 1 dòng (phiên bản). Chỉ 1 phiên bản active cho mỗi (day, unit).
CREATE TABLE IF NOT EXISTS daily_reports (id text PRIMARY KEY);
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS day            date;
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS unit           text;
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS version        int DEFAULT 1;
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS active         boolean DEFAULT true;
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS status         text;     -- NORMAL | INCIDENT
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS note           text;     -- tình hình chung / ghi chú
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS "reporterId"   text;
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS "reporterName" text;
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS "reporterRole" text;     -- LEADER (lãnh đạo tổ) | DUTY (cán bộ tự chọn vai trò)
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS "submittedAt"  bigint;
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS late           boolean DEFAULT false;
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS reason         text;     -- lý do đính chính (sau hạn)
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS confirmed      boolean DEFAULT true;
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS device         text;
CREATE INDEX IF NOT EXISTS idx_daily_reports_day ON daily_reports (day, unit, active);
-- Mỗi (ngày, đầu mối) chỉ 1 phiên bản đang hiệu lực (chống 2 người nộp cùng lúc)
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_reports_active ON daily_reports (day, unit) WHERE active;

-- Vụ việc của từng phiên bản. "key" giữ nguyên qua các phiên bản để đánh dấu trùng.
CREATE TABLE IF NOT EXISTS daily_incidents (id text PRIMARY KEY);
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS "reportId"  text;
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS key         text;
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS day         date;
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS unit        text;
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS ord         int DEFAULT 0;
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS field       text;     -- lĩnh vực (danh mục cố định)
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS severity    text;     -- Ít nghiêm trọng | Nghiêm trọng | Rất/Đặc biệt nghiêm trọng
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS "occurredAt" text;    -- thời gian xảy ra (chữ)
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS location    text;
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS summary     text;
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS cases       int DEFAULT 1;  -- số vụ việc
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS suspects    int DEFAULT 0;  -- số đối tượng
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS victims     int DEFAULT 0;  -- số người bị hại / thương vong
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS damage      text;     -- thiệt hại
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS handling    text;     -- tình trạng xử lý
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS "handlingNote" text;  -- kết quả xử lý, đơn vị thụ lý, kiến nghị
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS "dupOf"     text;     -- key vụ việc gốc (người báo tự chọn)
ALTER TABLE daily_incidents ADD COLUMN IF NOT EXISTS flash       boolean DEFAULT false; -- đã báo cáo nhanh trước
CREATE INDEX IF NOT EXISTS idx_daily_incidents_report ON daily_incidents ("reportId");
CREATE INDEX IF NOT EXISTS idx_daily_incidents_day ON daily_incidents (day);

-- Báo cáo nhanh (vụ việc nghiêm trọng, báo ngay không chờ báo cáo ngày)
CREATE TABLE IF NOT EXISTS daily_flash (id text PRIMARY KEY);
ALTER TABLE daily_flash ADD COLUMN IF NOT EXISTS key            text;
ALTER TABLE daily_flash ADD COLUMN IF NOT EXISTS day            date;
ALTER TABLE daily_flash ADD COLUMN IF NOT EXISTS unit           text;
ALTER TABLE daily_flash ADD COLUMN IF NOT EXISTS data           jsonb;
ALTER TABLE daily_flash ADD COLUMN IF NOT EXISTS "reporterId"   text;
ALTER TABLE daily_flash ADD COLUMN IF NOT EXISTS "reporterName" text;
ALTER TABLE daily_flash ADD COLUMN IF NOT EXISTS "createdAt"    bigint;
CREATE INDEX IF NOT EXISTS idx_daily_flash_day ON daily_flash (day, unit);

-- Tổ Tổng hợp / chỉ huy đánh dấu vụ trùng (ghi đè lựa chọn của người báo)
CREATE TABLE IF NOT EXISTS daily_dups (key text PRIMARY KEY);
ALTER TABLE daily_dups ADD COLUMN IF NOT EXISTS day         date;
ALTER TABLE daily_dups ADD COLUMN IF NOT EXISTS "dupOf"     text;     -- NULL = khẳng định KHÔNG trùng
ALTER TABLE daily_dups ADD COLUMN IF NOT EXISTS "markedBy"  text;
ALTER TABLE daily_dups ADD COLUMN IF NOT EXISTS "markedAt"  bigint;

INSERT INTO app_settings (key, value) VALUES
  ('daily_deadline',    '07:30'),  -- giờ chốt kỳ báo cáo và hạn nộp (giờ Việt Nam)
  ('daily_late_days',   '7')       -- được nộp bù tối đa bao nhiêu ngày
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. QUYỀN TRUY CẬP: không ai đọc/ghi trực tiếp
-- ---------------------------------------------------------------------
ALTER TABLE daily_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_flash     ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_dups      ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON daily_reports, daily_incidents, daily_flash, daily_dups FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. HÀM NỘI BỘ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION daily_units() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['AN_NINH','CSKV','CSTT','PCTP','TBHS','TBDV'] $$;

CREATE OR REPLACE FUNCTION daily_unit_dept(p_unit text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_unit WHEN 'AN_NINH' THEN 'Tổ An ninh' WHEN 'CSKV' THEN 'Tổ CSKV'
                     WHEN 'CSTT' THEN 'Tổ CSTT' WHEN 'PCTP' THEN 'Tổ PCTP' ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION daily_unit_name(p_unit text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_unit WHEN 'TBHS' THEN 'Trực ban hình sự' WHEN 'TBDV' THEN 'Trực ban đơn vị'
                     ELSE coalesce(daily_unit_dept(p_unit), p_unit) END
$$;

-- Quản lý báo cáo ngày: Quản trị viên, Trưởng/Phó Trưởng CAP, Tổ trưởng/Tổ phó Tổ Tổng hợp, hoặc được cấp quyền
CREATE OR REPLACE FUNCTION can_manage_daily(u users) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT u.role IN ('ADMIN','CHIEF','DEPUTY_CHIEF')
      OR (u.department = 'Tổ Tổng hợp' AND u.role IN ('MANAGER','DEPUTY'))
      OR has_perm(u, 'MANAGE_DAILY_REPORT')
$$;

-- Tổ trưởng / Tổ phó của tổ ứng với đầu mối
CREATE OR REPLACE FUNCTION daily_is_leader(u users, p_unit text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT daily_unit_dept(p_unit) IS NOT NULL AND u.department = daily_unit_dept(p_unit) AND u.role IN ('MANAGER','DEPUTY')
$$;

CREATE OR REPLACE FUNCTION daily_deadline_time() RETURNS time
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v text := get_setting('daily_deadline', '07:30');
BEGIN
  RETURN v::time;
EXCEPTION WHEN others THEN RETURN '07:30'::time;
END;
$$;

-- Thời điểm hết hạn của kỳ báo cáo ngày D
CREATE OR REPLACE FUNCTION daily_deadline_at(p_day date) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT (p_day + daily_deadline_time()) AT TIME ZONE 'Asia/Ho_Chi_Minh'
$$;

-- Kỳ báo cáo đang mở (ngày D mà hạn nộp chưa qua)
CREATE OR REPLACE FUNCTION daily_current_day() RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time < daily_deadline_time()
              THEN (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
              ELSE (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1 END
$$;

-- Vai trò khi báo cáo: mọi cán bộ đã duyệt (trừ tài khoản quản trị kỹ thuật) tự chọn đầu mối để báo.
--   LEADER = Tổ trưởng/Tổ phó của tổ đó; DUTY = cán bộ tự chọn vai trò (trực ban, cán bộ của tổ…); NULL = không được báo
CREATE OR REPLACE FUNCTION daily_role(u users, p_day date, p_unit text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF u.id IS NULL OR u.role = 'ADMIN' OR NOT coalesce(u."isApproved", true) THEN RETURN NULL; END IF;
  IF NOT (p_unit = ANY (daily_units())) THEN RETURN NULL; END IF;
  IF daily_is_leader(u, p_unit) THEN RETURN 'LEADER'; END IF;
  RETURN 'DUTY';
END;
$$;

CREATE OR REPLACE FUNCTION daily_uname(p_id text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT "fullName" FROM users WHERE id = p_id
$$;

-- Gửi thông báo trong app (bảng notifications đã có đồng bộ tức thời)
CREATE OR REPLACE FUNCTION daily_notify(p_user text, p_title text, p_msg text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  INSERT INTO notifications (id, "userId", title, message, "isRead", "createdAt", type)
  SELECT new_id('nt'), p_user, p_title, p_msg, false, now_ms(), 'SYSTEM'
  WHERE p_user IS NOT NULL
$$;

-- Người nhận báo cáo nhanh: chỉ huy + người quản lý báo cáo ngày (trừ tài khoản quản trị kỹ thuật)
CREATE OR REPLACE FUNCTION daily_managers() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id FROM users u
   WHERE coalesce(u."isApproved", true) AND u.role <> 'ADMIN' AND can_manage_daily(u)
$$;

-- Kiểm tra 1 vụ việc, trả thông báo lỗi (NULL = hợp lệ)
CREATE OR REPLACE FUNCTION daily_incident_invalid(i jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE all_text text;
BEGIN
  IF length(trim(coalesce(i->>'field', ''))) = 0 THEN RETURN 'chưa chọn lĩnh vực'; END IF;
  IF length(trim(coalesce(i->>'summary', ''))) < 5 THEN RETURN 'chưa nhập nội dung vụ việc'; END IF;
  IF coalesce(i->>'cases', '1') !~ '^\d{1,4}$' OR (i->>'cases')::int < 1 THEN RETURN 'số vụ việc phải từ 1 trở lên'; END IF;
  IF coalesce(i->>'suspects', '0') !~ '^\d{1,4}$' THEN RETURN 'số đối tượng không hợp lệ'; END IF;
  IF coalesce(i->>'victims', '0') !~ '^\d{1,4}$' THEN RETURN 'số bị hại/thương vong không hợp lệ'; END IF;
  all_text := concat_ws(' ', i->>'summary', i->>'location', i->>'damage', i->>'handlingNote', i->>'occurredAt');
  -- Chặn số định danh / số điện thoại (dãy 9–12 chữ số bắt đầu bằng 0; số tiền không bị chặn)
  IF all_text ~ '(^|\D)0\d{8,11}(\D|$)' THEN RETURN 'có dãy số giống số định danh/điện thoại — không nhập thông tin định danh'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION daily_report_json(r daily_reports) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(r) || jsonb_build_object(
    'deadlineAt', (extract(epoch FROM daily_deadline_at(r.day)) * 1000)::bigint,
    'incidents', coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.ord, i.id) FROM daily_incidents i WHERE i."reportId" = r.id), '[]'::jsonb))
$$;

-- Tình hình 1 đầu mối trong 1 ngày
CREATE OR REPLACE FUNCTION daily_unit_json(p_day date, p_unit text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE rep daily_reports%ROWTYPE;
BEGIN
  SELECT * INTO rep FROM daily_reports WHERE day = p_day AND unit = p_unit AND active ORDER BY version DESC LIMIT 1;
  RETURN jsonb_build_object(
    'unit', p_unit, 'unitName', daily_unit_name(p_unit),
    'report', CASE WHEN rep.id IS NULL THEN NULL ELSE daily_report_json(rep) END,
    'versions', (SELECT count(*) FROM daily_reports WHERE day = p_day AND unit = p_unit),
    'flash', coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f."createdAt") FROM daily_flash f WHERE f.day = p_day AND f.unit = p_unit), '[]'::jsonb));
END;
$$;

-- ---------------------------------------------------------------------
-- 4. HÀM GỌI TỪ ỨNG DỤNG
-- ---------------------------------------------------------------------

-- Cấu hình + tình hình báo cáo kỳ đang mở của 6 đầu mối (để cán bộ chọn vai trò báo cáo)
CREATE OR REPLACE FUNCTION app_daily_me(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; d date; prev date; u text; v_role text; mine jsonb := '[]'::jsonb; rep daily_reports%ROWTYPE; v_start date;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  d := daily_current_day(); prev := d - 1;
  v_start := (SELECT min(day) FROM daily_reports);   -- trước ngày bắt đầu dùng thì không nhắc nộp bù
  FOREACH u IN ARRAY daily_units() LOOP
    v_role := daily_role(actor, d, u);
    IF v_role IS NULL THEN CONTINUE; END IF;
    -- Kỳ đang mở
    rep := NULL;
    SELECT * INTO rep FROM daily_reports WHERE day = d AND unit = u AND active LIMIT 1;
    mine := mine || jsonb_build_object('unit', u, 'unitName', daily_unit_name(u), 'day', d, 'role', v_role,
              'reported', rep.id IS NOT NULL, 'status', rep.status, 'reporterName', rep."reporterName", 'submittedAt', rep."submittedAt",
              'flash', (SELECT count(*) FROM daily_flash f WHERE f.day = d AND f.unit = u),
              'own', daily_unit_dept(u) IS NOT NULL AND daily_unit_dept(u) = actor.department);
    -- Kỳ vừa đóng mà chưa có ai báo (nộp bù)
    IF v_start IS NOT NULL AND prev >= v_start
       AND NOT EXISTS (SELECT 1 FROM daily_reports WHERE day = prev AND unit = u AND active) THEN
      mine := mine || jsonb_build_object('unit', u, 'unitName', daily_unit_name(u), 'day', prev, 'role', v_role, 'reported', false, 'overdue', true);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true,
    'v', 3,                         -- phiên bản hàm máy chủ (ứng dụng dùng để phát hiện máy chủ chưa cập nhật)
    'currentDay', d,
    'deadline', to_char(daily_deadline_time(), 'HH24:MI'),
    'deadlineAt', (extract(epoch FROM daily_deadline_at(d)) * 1000)::bigint,
    'serverNow', now_ms(),
    'lateDays', get_setting('daily_late_days', '7')::int,
    'canManage', can_manage_daily(actor),
    'leaderOf', coalesce((SELECT jsonb_agg(x) FROM unnest(daily_units()) x WHERE daily_is_leader(actor, x)), '[]'::jsonb),
    'mine', mine);
END;
$$;

-- Mở biểu mẫu báo cáo của 1 đầu mối, 1 ngày
CREATE OR REPLACE FUNCTION app_daily_get(p_token text, p_day date, p_unit text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; v_role text; mgr boolean; others jsonb;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT (p_unit = ANY (daily_units())) THEN RETURN err('Đầu mối báo cáo không hợp lệ.'); END IF;
  v_role := daily_role(actor, p_day, p_unit);
  mgr := can_manage_daily(actor);
  IF v_role IS NULL AND NOT mgr THEN RETURN err('Tài khoản này không dùng để báo cáo ngày.'); END IF;
  -- Vụ việc các đầu mối khác đã báo cùng ngày (tóm tắt, để chọn "trùng với vụ đã có")
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', i.key, 'unit', i.unit, 'unitName', daily_unit_name(i.unit), 'field', i.field,
           'location', i.location, 'occurredAt', i."occurredAt", 'summary', left(i.summary, 200)) ORDER BY i.unit, i.ord), '[]'::jsonb)
    INTO others
    FROM daily_incidents i JOIN daily_reports r ON r.id = i."reportId"
   WHERE r.day = p_day AND r.active AND r.unit <> p_unit;
  others := others || coalesce((SELECT jsonb_agg(jsonb_build_object('key', f.key, 'unit', f.unit, 'unitName', daily_unit_name(f.unit),
           'field', f.data->>'field', 'location', f.data->>'location', 'occurredAt', f.data->>'occurredAt', 'summary', left(f.data->>'summary', 200), 'flash', true))
      FROM daily_flash f WHERE f.day = p_day AND f.unit <> p_unit
       AND NOT EXISTS (SELECT 1 FROM daily_incidents i JOIN daily_reports r ON r.id = i."reportId" WHERE r.active AND i.key = f.key)), '[]'::jsonb);
  RETURN jsonb_build_object('ok', true, 'role', v_role, 'canSubmit', v_role IS NOT NULL,
    'day', p_day, 'currentDay', daily_current_day(),
    'deadlineAt', (extract(epoch FROM daily_deadline_at(p_day)) * 1000)::bigint,
    'periodFrom', (extract(epoch FROM daily_deadline_at(p_day - 1)) * 1000)::bigint,
    'unitInfo', daily_unit_json(p_day, p_unit), 'others', others);
END;
$$;

-- Nộp báo cáo (mỗi lần nộp là 1 phiên bản mới; bản cũ giữ lại)
CREATE OR REPLACE FUNCTION app_daily_submit(p_token text, p_day date, p_unit text, p_status text, p_note text,
                                            p_incidents jsonb, p_reason text, p_confirm boolean, p_device text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; v_role text; cur date; old daily_reports%ROWTYPE; v_id text; v_ver int;
        v_late boolean; it jsonb; bad text; n int := 0; v_key text;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT (p_unit = ANY (daily_units())) THEN RETURN err('Đầu mối báo cáo không hợp lệ.'); END IF;
  v_role := daily_role(actor, p_day, p_unit);
  IF v_role IS NULL THEN RETURN err('Tài khoản này không dùng để báo cáo ngày (tài khoản quản trị hoặc chưa được duyệt).'); END IF;
  cur := daily_current_day();
  IF p_day > cur THEN RETURN err('Chưa đến kỳ báo cáo ngày ' || to_char(p_day, 'DD/MM/YYYY') || '.'); END IF;
  IF p_day < cur - get_setting('daily_late_days', '7')::int THEN RETURN err('Đã quá thời hạn nộp bù cho ngày này. Liên hệ Tổ Tổng hợp.'); END IF;
  IF coalesce(p_confirm, false) IS NOT TRUE THEN RETURN err('Cần đánh dấu xác nhận chịu trách nhiệm về nội dung báo cáo.'); END IF;
  IF p_status NOT IN ('NORMAL', 'INCIDENT') THEN RETURN err('Trạng thái báo cáo không hợp lệ.'); END IF;
  p_incidents := jarr(p_incidents);
  IF p_status = 'INCIDENT' AND jsonb_array_length(p_incidents) = 0 THEN RETURN err('Đã chọn "Có vụ việc" thì phải nhập ít nhất 1 vụ việc.'); END IF;
  IF p_status = 'NORMAL' THEN p_incidents := '[]'::jsonb; END IF;
  IF p_status = 'NORMAL' AND EXISTS (SELECT 1 FROM daily_flash WHERE day = p_day AND unit = p_unit) THEN
    RETURN err('Đầu mối đã có báo cáo nhanh vụ việc trong kỳ này nên không thể báo "Bình thường". Chọn "Có vụ việc".');
  END IF;
  IF jsonb_array_length(p_incidents) > 50 THEN RETURN err('Tối đa 50 vụ việc trong một báo cáo.'); END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(p_incidents) LOOP
    n := n + 1;
    bad := daily_incident_invalid(it);
    IF bad IS NOT NULL THEN RETURN err('Vụ việc thứ ' || n || ': ' || bad || '.'); END IF;
  END LOOP;
  IF length(coalesce(p_note, '')) > 3000 THEN RETURN err('Phần tình hình chung quá dài (tối đa 3.000 ký tự).'); END IF;
  IF coalesce(p_note, '') ~ '(^|\D)0\d{8,11}(\D|$)' THEN RETURN err('Phần tình hình chung có dãy số giống số định danh/điện thoại — không nhập thông tin định danh.'); END IF;

  SELECT * INTO old FROM daily_reports WHERE day = p_day AND unit = p_unit AND active ORDER BY version DESC LIMIT 1 FOR UPDATE;
  v_late := now() > daily_deadline_at(p_day);
  IF old.id IS NOT NULL AND v_late AND length(trim(coalesce(p_reason, ''))) < 5 THEN
    RETURN err('Đã qua hạn nộp: muốn đính chính phải ghi lý do.');
  END IF;
  v_ver := coalesce((SELECT max(version) FROM daily_reports WHERE day = p_day AND unit = p_unit), 0) + 1;
  UPDATE daily_reports SET active = false WHERE day = p_day AND unit = p_unit AND active;
  v_id := new_id('dr');
  INSERT INTO daily_reports (id, day, unit, version, active, status, note, "reporterId", "reporterName", "reporterRole",
                             "submittedAt", late, reason, confirmed, device)
  VALUES (v_id, p_day, p_unit, v_ver, true, p_status, nullif(trim(coalesce(p_note, '')), ''), actor.id, actor."fullName", v_role,
          now_ms(), v_late, nullif(trim(coalesce(p_reason, '')), ''), true, left(p_device, 200));
  n := 0;
  FOR it IN SELECT * FROM jsonb_array_elements(p_incidents) LOOP
    n := n + 1;
    v_key := coalesce(nullif(it->>'key', ''), new_id('ik'));
    INSERT INTO daily_incidents (id, "reportId", key, day, unit, ord, field, severity, "occurredAt", location, summary,
                                 cases, suspects, victims, damage, handling, "handlingNote", "dupOf", flash)
    VALUES (new_id('di'), v_id, v_key, p_day, p_unit, n, trim(it->>'field'), nullif(trim(coalesce(it->>'severity', '')), ''),
            nullif(trim(coalesce(it->>'occurredAt', '')), ''), nullif(trim(coalesce(it->>'location', '')), ''), trim(it->>'summary'),
            coalesce(nullif(it->>'cases', '')::int, 1), coalesce(nullif(it->>'suspects', '')::int, 0), coalesce(nullif(it->>'victims', '')::int, 0),
            nullif(trim(coalesce(it->>'damage', '')), ''), nullif(trim(coalesce(it->>'handling', '')), ''),
            nullif(trim(coalesce(it->>'handlingNote', '')), ''), nullif(it->>'dupOf', ''),
            EXISTS (SELECT 1 FROM daily_flash f WHERE f.key = v_key));
  END LOOP;
  -- Báo cáo nhanh của kỳ này chưa có trong danh sách → giữ nguyên, tự gộp vào báo cáo
  INSERT INTO daily_incidents (id, "reportId", key, day, unit, ord, field, severity, "occurredAt", location, summary,
                               cases, suspects, victims, damage, handling, "handlingNote", flash)
  SELECT new_id('di'), v_id, f.key, p_day, p_unit, 1000 + row_number() OVER (ORDER BY f."createdAt"),
         f.data->>'field', f.data->>'severity', f.data->>'occurredAt', f.data->>'location', f.data->>'summary',
         coalesce(nullif(f.data->>'cases', '')::int, 1), coalesce(nullif(f.data->>'suspects', '')::int, 0), coalesce(nullif(f.data->>'victims', '')::int, 0),
         f.data->>'damage', f.data->>'handling', f.data->>'handlingNote', true
    FROM daily_flash f
   WHERE f.day = p_day AND f.unit = p_unit
     AND NOT EXISTS (SELECT 1 FROM daily_incidents i WHERE i."reportId" = v_id AND i.key = f.key);
  RETURN jsonb_build_object('ok', true, 'version', v_ver, 'late', v_late,
    'report', (SELECT daily_report_json(r) FROM daily_reports r WHERE r.id = v_id));
END;
$$;

-- Báo cáo nhanh 1 vụ việc nghiêm trọng: lưu ngay + thông báo cho chỉ huy
CREATE OR REPLACE FUNCTION app_daily_flash(p_token text, p_unit text, p_incident jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; d date; v_role text; bad text; v_key text; m text;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT (p_unit = ANY (daily_units())) THEN RETURN err('Đầu mối báo cáo không hợp lệ.'); END IF;
  d := daily_current_day();
  v_role := daily_role(actor, d, p_unit);
  IF v_role IS NULL THEN RETURN err('Tài khoản này không dùng để báo cáo ngày.'); END IF;
  bad := daily_incident_invalid(p_incident);
  IF bad IS NOT NULL THEN RETURN err('Vụ việc ' || bad || '.'); END IF;
  v_key := coalesce(nullif(p_incident->>'key', ''), new_id('ik'));
  INSERT INTO daily_flash (id, key, day, unit, data, "reporterId", "reporterName", "createdAt")
  VALUES (new_id('fl'), v_key, d, p_unit, p_incident || jsonb_build_object('key', v_key), actor.id, actor."fullName", now_ms());
  FOR m IN SELECT * FROM daily_managers() LOOP
    PERFORM daily_notify(m, 'Báo cáo nhanh: ' || daily_unit_name(p_unit),
      actor."fullName" || ' báo cáo nhanh 1 vụ việc lĩnh vực ' || (p_incident->>'field') ||
      CASE WHEN coalesce(p_incident->>'severity', '') <> '' THEN ' (' || (p_incident->>'severity') || ')' ELSE '' END ||
      '. Mở mục Báo cáo ngày để xem chi tiết.');
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'key', v_key, 'day', d);
END;
$$;

-- Bảng theo dõi 1 ngày (chỉ huy, Tổ Tổng hợp; tổ trưởng xem được đầu mối tổ mình)
CREATE OR REPLACE FUNCTION app_daily_board(p_token text, p_day date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; mgr boolean; u text; units jsonb := '[]'::jsonb;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  mgr := can_manage_daily(actor);
  FOREACH u IN ARRAY daily_units() LOOP
    IF mgr OR daily_is_leader(actor, u) THEN units := units || daily_unit_json(p_day, u); END IF;
  END LOOP;
  IF jsonb_array_length(units) = 0 THEN RETURN err('Bạn không có quyền xem bảng theo dõi báo cáo ngày.'); END IF;
  RETURN jsonb_build_object('ok', true, 'day', p_day, 'currentDay', daily_current_day(), 'canManage', mgr,
    'deadlineAt', (extract(epoch FROM daily_deadline_at(p_day)) * 1000)::bigint,
    'periodFrom', (extract(epoch FROM daily_deadline_at(p_day - 1)) * 1000)::bigint,
    'units', units,
    'dups', CASE WHEN mgr THEN coalesce((SELECT jsonb_object_agg(key, coalesce("dupOf", '')) FROM daily_dups WHERE day = p_day), '{}'::jsonb) ELSE '{}'::jsonb END);
END;
$$;

-- Lịch sử các phiên bản của 1 đầu mối, 1 ngày
CREATE OR REPLACE FUNCTION app_daily_history(p_token text, p_day date, p_unit text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT (can_manage_daily(actor) OR daily_role(actor, p_day, p_unit) IS NOT NULL) THEN RETURN err('Bạn không có quyền xem lịch sử báo cáo này.'); END IF;
  RETURN jsonb_build_object('ok', true, 'versions',
    coalesce((SELECT jsonb_agg(daily_report_json(r) ORDER BY r.version DESC) FROM daily_reports r WHERE r.day = p_day AND r.unit = p_unit), '[]'::jsonb));
END;
$$;

-- Số liệu một khoảng thời gian (tuần, tháng, quý…) — chỉ người quản lý
CREATE OR REPLACE FUNCTION app_daily_range(p_token text, p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_daily(actor) THEN RETURN err('Bạn không có quyền xem số liệu tổng hợp.'); END IF;
  IF p_to < p_from OR p_to - p_from > 400 THEN RETURN err('Khoảng thời gian không hợp lệ (tối đa 400 ngày).'); END IF;
  RETURN jsonb_build_object('ok', true, 'from', p_from, 'to', p_to, 'currentDay', daily_current_day(),
    'startDay', (SELECT min(day) FROM daily_reports),   -- ngày bắt đầu dùng báo cáo ngày (trước đó không tính "không báo")
    'reports', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'day', r.day, 'unit', r.unit, 'status', r.status, 'note', r.note,
                 'reporterName', r."reporterName", 'submittedAt', r."submittedAt", 'late', r.late, 'version', r.version)
                 ORDER BY r.day, r.unit) FROM daily_reports r WHERE r.active AND r.day BETWEEN p_from AND p_to), '[]'::jsonb),
    'incidents', coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.day, i.unit, i.ord) FROM daily_incidents i
                 JOIN daily_reports r ON r.id = i."reportId" WHERE r.active AND r.day BETWEEN p_from AND p_to), '[]'::jsonb),
    'dups', coalesce((SELECT jsonb_object_agg(key, coalesce("dupOf", '')) FROM daily_dups WHERE day BETWEEN p_from AND p_to), '{}'::jsonb),
    'firstLate', coalesce((SELECT jsonb_object_agg(r.day || '|' || r.unit, r.late) FROM daily_reports r WHERE r.version = 1 AND r.day BETWEEN p_from AND p_to), '{}'::jsonb));
END;
$$;

-- Đánh dấu vụ trùng (Tổ Tổng hợp / chỉ huy). p_dup_of NULL hoặc '' = không trùng; p_clear = xoá đánh dấu
CREATE OR REPLACE FUNCTION app_daily_mark_dup(p_token text, p_day date, p_key text, p_dup_of text, p_clear boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_daily(actor) THEN RETURN err('Bạn không có quyền gộp vụ việc trùng.'); END IF;
  IF p_key = p_dup_of THEN RETURN err('Không thể gộp vụ việc với chính nó.'); END IF;
  IF coalesce(p_clear, false) THEN
    DELETE FROM daily_dups WHERE key = p_key;
  ELSE
    INSERT INTO daily_dups (key, day, "dupOf", "markedBy", "markedAt") VALUES (p_key, p_day, nullif(p_dup_of, ''), actor.id, now_ms())
    ON CONFLICT (key) DO UPDATE SET "dupOf" = EXCLUDED."dupOf", "markedBy" = EXCLUDED."markedBy", "markedAt" = EXCLUDED."markedAt", day = EXCLUDED.day;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Nhắc các đầu mối chưa báo cáo kỳ p_day (gửi thông báo trong app). Trả số người đã nhắc.
CREATE OR REPLACE FUNCTION daily_remind(p_day date) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
-- Không phân công cố định nên: 4 tổ → nhắc toàn bộ cán bộ của tổ; Trực ban hình sự / Trực ban đơn vị → nhắc
-- chỉ huy và Tổ Tổng hợp (người quản lý báo cáo ngày) để liên hệ người đang trực.
DECLARE u text; uid text; n int := 0; missing text[] := '{}'; msg text;
BEGIN
  FOREACH u IN ARRAY daily_units() LOOP
    IF NOT EXISTS (SELECT 1 FROM daily_reports WHERE day = p_day AND unit = u AND active) THEN
      IF daily_unit_dept(u) IS NOT NULL THEN
        FOR uid IN SELECT x.id FROM users x WHERE x.department = daily_unit_dept(u) AND x.role <> 'ADMIN' AND coalesce(x."isApproved", true) LOOP
          PERFORM daily_notify(uid, 'Nhắc báo cáo ngày', daily_unit_name(u) || ' chưa báo cáo ngày ' || to_char(p_day, 'DD/MM/YYYY') ||
            '. Hạn nộp ' || to_char(daily_deadline_time(), 'HH24:MI') || '. Đồng chí được giao báo cáo thì mở mục Báo cáo ngày, chọn vai trò ' ||
            daily_unit_name(u) || '.'); n := n + 1;
        END LOOP;
      ELSE
        missing := missing || daily_unit_name(u);
      END IF;
    END IF;
  END LOOP;
  IF array_length(missing, 1) > 0 THEN
    msg := array_to_string(missing, ', ') || ' chưa báo cáo ngày ' || to_char(p_day, 'DD/MM/YYYY') || '. Đề nghị liên hệ cán bộ đang trực.';
    FOR uid IN SELECT * FROM daily_managers() LOOP
      PERFORM daily_notify(uid, 'Nhắc báo cáo ngày (trực ban)', msg); n := n + 1;
    END LOOP;
  END IF;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION app_daily_remind(p_token text, p_day date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_daily(actor) THEN RETURN err('Bạn không có quyền nhắc báo cáo.'); END IF;
  RETURN jsonb_build_object('ok', true, 'sent', daily_remind(p_day));
END;
$$;

-- Đổi giờ chốt / hạn nộp (chỉ Quản trị viên, Trưởng CAP)
CREATE OR REPLACE FUNCTION app_daily_settings(p_token text, p_deadline text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF actor.role NOT IN ('ADMIN', 'CHIEF') THEN RETURN err('Chỉ Quản trị viên, Trưởng Công an phường đổi được giờ chốt báo cáo.'); END IF;
  IF p_deadline !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN RETURN err('Giờ chốt không hợp lệ (dạng HH:MM).'); END IF;
  INSERT INTO app_settings (key, value) VALUES ('daily_deadline', p_deadline)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 5. TỰ ĐỘNG NHẮC (nếu dự án bật pg_cron): 30 phút trước giờ chốt mặc định 07:30 → 07:00 giờ VN (00:00 UTC)
--    Đổi giờ chốt thì sửa lịch này trong Supabase → Integrations → Cron.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('nhac-bao-cao-ngay');
    EXCEPTION WHEN others THEN NULL;
    END;
    PERFORM cron.schedule('nhac-bao-cao-ngay', '0 0 * * *', 'SELECT public.daily_remind(public.daily_current_day())');
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- 6. CẤP QUYỀN GỌI HÀM
-- ---------------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('app_daily_me','app_daily_get','app_daily_submit','app_daily_flash','app_daily_board',
                               'app_daily_history','app_daily_range','app_daily_mark_dup',
                               'app_daily_remind','app_daily_settings')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('daily_role','daily_uname','daily_notify','daily_managers','daily_report_json',
                               'daily_unit_json','daily_remind','daily_deadline_time')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
