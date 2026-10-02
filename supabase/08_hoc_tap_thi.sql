-- =====================================================================
-- 08. HỌC TẬP & THI TRẮC NGHIỆM CÓ CHỐNG GIAN LẬN
-- Chạy SAU 01–07. An toàn, chạy lại nhiều lần không mất dữ liệu.
--
--  NGÂN HÀNG CÂU HỎI (quiz_questions)  : KHÔNG ai đọc trực tiếp được (đáp án nằm ở đây).
--                                        Chỉ người quản lý học tập xem qua hàm app_list_questions.
--  HỌC TẬP  learn_courses / learn_lessons / learn_progress : đọc công khai, ghi qua hàm.
--           Thời gian học do máy chủ cộng có giới hạn theo thời gian thực (không "bơm" giờ được).
--           Câu hỏi ôn cuối bài do máy chủ chấm, trả lời xong mới biết đáp án.
--  THI      exams (công khai)  / exam_attempts (KHÔNG công khai: đề, đáp án, bài làm)
--           exam_events (công khai): nhật ký bất thường để màn hình giám thị cập nhật tức thời.
--           Mỗi người một đề (đảo câu, đảo đáp án), chấm trên máy chủ, đồng hồ máy chủ,
--           thi tập trung phải quét mã QR phòng thi (đổi 3 giây/lần, dùng chung chữ ký với 06),
--           rời màn hình quá số lần quy định → tự nộp, đổi máy giữa chừng → khoá bài chờ giám thị.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. BẢNG
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_questions (id text PRIMARY KEY);
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS stt         int;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS topic       text;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS level       text;      -- Nhận biết | Thông hiểu | Vận dụng
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS text        text;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS options     jsonb;     -- ["...", "...", ...]
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS correct     int;       -- chỉ số trong options (0 = A)
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS explanation text;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS source      text;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS active      boolean DEFAULT true;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS "createdAt" bigint;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS "createdBy" text;
CREATE INDEX IF NOT EXISTS idx_quiz_topic ON quiz_questions (topic);

CREATE TABLE IF NOT EXISTS learn_courses (id text PRIMARY KEY);
ALTER TABLE learn_courses ADD COLUMN IF NOT EXISTS title         text;
ALTER TABLE learn_courses ADD COLUMN IF NOT EXISTS description   text;
ALTER TABLE learn_courses ADD COLUMN IF NOT EXISTS deadline      bigint;
ALTER TABLE learn_courses ADD COLUMN IF NOT EXISTS "assigneeIds" jsonb DEFAULT '[]'::jsonb;   -- [] = toàn đơn vị
ALTER TABLE learn_courses ADD COLUMN IF NOT EXISTS status        text DEFAULT 'DRAFT';       -- DRAFT | PUBLISHED
ALTER TABLE learn_courses ADD COLUMN IF NOT EXISTS sequential    boolean DEFAULT true;       -- học theo thứ tự
ALTER TABLE learn_courses ADD COLUMN IF NOT EXISTS "createdAt"   bigint;
ALTER TABLE learn_courses ADD COLUMN IF NOT EXISTS "createdBy"   text;
ALTER TABLE learn_courses ADD COLUMN IF NOT EXISTS "updatedAt"   bigint;

CREATE TABLE IF NOT EXISTS learn_lessons (id text PRIMARY KEY);
ALTER TABLE learn_lessons ADD COLUMN IF NOT EXISTS "courseId"    text;
ALTER TABLE learn_lessons ADD COLUMN IF NOT EXISTS chapter       text;
ALTER TABLE learn_lessons ADD COLUMN IF NOT EXISTS ord           int DEFAULT 0;
ALTER TABLE learn_lessons ADD COLUMN IF NOT EXISTS title         text;
ALTER TABLE learn_lessons ADD COLUMN IF NOT EXISTS body          text;
ALTER TABLE learn_lessons ADD COLUMN IF NOT EXISTS "videoUrl"    text;
ALTER TABLE learn_lessons ADD COLUMN IF NOT EXISTS "videoKind"   text;     -- YOUTUBE | FILE | DRIVE
ALTER TABLE learn_lessons ADD COLUMN IF NOT EXISTS "pdfUrl"      text;
ALTER TABLE learn_lessons ADD COLUMN IF NOT EXISTS "minSeconds"  int DEFAULT 0;
ALTER TABLE learn_lessons ADD COLUMN IF NOT EXISTS "questionIds" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE learn_lessons ADD COLUMN IF NOT EXISTS "quizCount"   int DEFAULT 3;
ALTER TABLE learn_lessons ADD COLUMN IF NOT EXISTS "quizPass"    int DEFAULT 2;
ALTER TABLE learn_lessons ADD COLUMN IF NOT EXISTS "updatedAt"   bigint;
CREATE INDEX IF NOT EXISTS idx_lessons_course ON learn_lessons ("courseId");

CREATE TABLE IF NOT EXISTS learn_progress (id text PRIMARY KEY);        -- `${lessonId}__${userId}`
ALTER TABLE learn_progress ADD COLUMN IF NOT EXISTS "lessonId"    text;
ALTER TABLE learn_progress ADD COLUMN IF NOT EXISTS "courseId"    text;
ALTER TABLE learn_progress ADD COLUMN IF NOT EXISTS "userId"      text;
ALTER TABLE learn_progress ADD COLUMN IF NOT EXISTS seconds       int DEFAULT 0;
ALTER TABLE learn_progress ADD COLUMN IF NOT EXISTS "videoPct"    int DEFAULT 0;
ALTER TABLE learn_progress ADD COLUMN IF NOT EXISTS "quizServed"  jsonb;
ALTER TABLE learn_progress ADD COLUMN IF NOT EXISTS "quizAnswers" jsonb;    -- {questionId: true|false}
ALTER TABLE learn_progress ADD COLUMN IF NOT EXISTS "quizBest"    int DEFAULT 0;   -- % đúng cao nhất
ALTER TABLE learn_progress ADD COLUMN IF NOT EXISTS "quizTries"   int DEFAULT 0;
ALTER TABLE learn_progress ADD COLUMN IF NOT EXISTS completed     boolean DEFAULT false;
ALTER TABLE learn_progress ADD COLUMN IF NOT EXISTS "completedAt" bigint;
ALTER TABLE learn_progress ADD COLUMN IF NOT EXISTS "lastBeatAt"  bigint;
ALTER TABLE learn_progress ADD COLUMN IF NOT EXISTS "updatedAt"   bigint;
ALTER TABLE learn_progress REPLICA IDENTITY FULL;
CREATE INDEX IF NOT EXISTS idx_progress_course ON learn_progress ("courseId");
CREATE INDEX IF NOT EXISTS idx_progress_user   ON learn_progress ("userId");

CREATE TABLE IF NOT EXISTS learn_upload_tickets (ticket text PRIMARY KEY);
ALTER TABLE learn_upload_tickets ADD COLUMN IF NOT EXISTS "userId"    text;
ALTER TABLE learn_upload_tickets ADD COLUMN IF NOT EXISTS "expiresAt" bigint;

CREATE TABLE IF NOT EXISTS exams (id text PRIMARY KEY);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS title             text;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS mode              text DEFAULT 'HALL';   -- HALL (tập trung) | HOME (tại nhà)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS location          text;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "startAt"         bigint;                -- khung giờ được vào thi (tuỳ chọn)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "endAt"           bigint;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "durationMin"     int DEFAULT 30;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "questionCount"   int DEFAULT 30;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS topics            jsonb DEFAULT '[]'::jsonb;  -- lọc chủ đề ([] = tất cả)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "questionIds"     jsonb DEFAULT '[]'::jsonb;  -- chọn tay ([] = theo chủ đề)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "passScore"       numeric DEFAULT 5;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "maxLeave"        int DEFAULT 3;          -- 0 = chỉ ghi nhận
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "requireCourseId" text;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "assigneeIds"     jsonb DEFAULT '[]'::jsonb;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "seatLayoutId"    text;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS settings          jsonb DEFAULT '{}'::jsonb;  -- shuffle, oneDevice, watermark, showScore, showReview
ALTER TABLE exams ADD COLUMN IF NOT EXISTS status            text DEFAULT 'DRAFT';  -- DRAFT | OPEN | CLOSED
ALTER TABLE exams ADD COLUMN IF NOT EXISTS published         boolean DEFAULT false; -- đã công bố kết quả
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "openedAt"        bigint;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "closedAt"        bigint;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "createdAt"       bigint;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "createdBy"       text;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS "updatedAt"       bigint;

CREATE TABLE IF NOT EXISTS exam_attempts (id text PRIMARY KEY);         -- `${examId}__${userId}`
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "examId"        text;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "userId"        text;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS status          text;   -- IN_PROGRESS | LOCKED | SUBMITTED | AUTO_SUBMITTED | VOID
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS paper           jsonb;  -- [{id,text,options:[{i,t}]}] theo thứ tự hiển thị
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS keys            jsonb;  -- {questionId: chỉ số đáp án đúng}
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS answers         jsonb DEFAULT '{}'::jsonb;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "answeredCount" int DEFAULT 0;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS total           int DEFAULT 0;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "correctCount"  int;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS score           numeric;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "startedAt"     bigint;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS deadline        bigint;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "submittedAt"   bigint;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "submitReason"  text;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "deviceId"      text;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "deviceLabel"   text;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "deviceChanges" int DEFAULT 0;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "allowNewDevice" boolean DEFAULT false;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "leaveCount"    int DEFAULT 0;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "leaveMs"       bigint DEFAULT 0;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "lockReason"    text;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS "lastSeenAt"    bigint;
CREATE INDEX IF NOT EXISTS idx_attempts_exam ON exam_attempts ("examId");

CREATE TABLE IF NOT EXISTS exam_events (id text PRIMARY KEY);
ALTER TABLE exam_events ADD COLUMN IF NOT EXISTS "examId" text;
ALTER TABLE exam_events ADD COLUMN IF NOT EXISTS "userId" text;
ALTER TABLE exam_events ADD COLUMN IF NOT EXISTS kind     text;   -- START RESUME LEAVE DEVICE_CHANGE SHARED_DEVICE LOCK UNLOCK SUBMIT AUTO_SUBMIT RESET VOID EXTRA OPEN CLOSE
ALTER TABLE exam_events ADD COLUMN IF NOT EXISTS detail   text;
ALTER TABLE exam_events ADD COLUMN IF NOT EXISTS at       bigint;
ALTER TABLE exam_events REPLICA IDENTITY FULL;
CREATE INDEX IF NOT EXISTS idx_exam_events_exam ON exam_events ("examId");

-- ---------------------------------------------------------------------
-- 2. QUYỀN TRUY CẬP
-- ---------------------------------------------------------------------
ALTER TABLE quiz_questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_upload_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quiz_questions, exam_attempts, learn_upload_tickets FROM anon, authenticated;

ALTER TABLE learn_courses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_lessons  ENABLE ROW LEVEL SECURITY;
ALTER TABLE learn_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams          ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_events    ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['learn_courses', 'learn_lessons', 'learn_progress', 'exams', 'exam_events'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Read ' || t) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', 'Read ' || t, t);
    END IF;
    EXECUTE format('GRANT SELECT ON %I TO anon, authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %I FROM anon, authenticated', t);
  END LOOP;
END
$$;

-- Đồng bộ tức thời
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['learn_courses', 'learn_lessons', 'learn_progress', 'exams', 'exam_events'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- 3. HÀM NỘI BỘ
-- ---------------------------------------------------------------------
-- Quyền quản lý học tập & thi: Quản trị viên, Trưởng/Phó Trưởng CAP, hoặc được cấp quyền
CREATE OR REPLACE FUNCTION can_manage_learning(u users) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT u.role IN ('ADMIN','CHIEF','DEPUTY_CHIEF') OR has_perm(u, 'MANAGE_LEARNING')
$$;

CREATE OR REPLACE FUNCTION is_assigned(p_list jsonb, p_uid text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(p_list) IS DISTINCT FROM 'array' OR jsonb_array_length(p_list) = 0 OR p_list ? p_uid
$$;

CREATE OR REPLACE FUNCTION new_id(p_prefix text) RETURNS text
LANGUAGE sql VOLATILE SET search_path = public, extensions AS $$
  SELECT p_prefix || '_' || now_ms() || '_' || encode(gen_random_bytes(4), 'hex')
$$;

CREATE OR REPLACE FUNCTION jarr(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END
$$;

CREATE OR REPLACE FUNCTION exam_log(p_exam text, p_user text, p_kind text, p_detail text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  INSERT INTO exam_events (id, "examId", "userId", kind, detail, at)
  VALUES (new_id('ev'), p_exam, p_user, p_kind, p_detail, now_ms())
$$;

-- Kiểm tra câu hỏi hợp lệ, trả thông báo lỗi (NULL = hợp lệ)
CREATE OR REPLACE FUNCTION quiz_invalid(q jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE n int;
BEGIN
  IF length(trim(coalesce(q->>'text', ''))) = 0 THEN RETURN 'thiếu nội dung câu hỏi'; END IF;
  IF jsonb_typeof(q->'options') IS DISTINCT FROM 'array' THEN RETURN 'thiếu đáp án'; END IF;
  n := jsonb_array_length(q->'options');
  IF n < 2 OR n > 6 THEN RETURN 'cần từ 2 đến 6 đáp án'; END IF;
  IF (q->>'correct') IS NULL OR (q->>'correct') !~ '^\d+$' OR (q->>'correct')::int >= n THEN RETURN 'đáp án đúng không hợp lệ'; END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------
-- 4. NGÂN HÀNG CÂU HỎI
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_list_questions(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền xem ngân hàng câu hỏi.'); END IF;
  RETURN jsonb_build_object('ok', true, 'questions',
    coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.topic NULLS LAST, q.stt NULLS LAST, q."createdAt") FROM quiz_questions q), '[]'::jsonb));
END;
$$;

-- Nhập nhiều câu (từ Excel). Câu trùng nội dung (không phân biệt hoa thường) → cập nhật.
CREATE OR REPLACE FUNCTION app_import_questions(p_token text, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; it jsonb; v_err text; v_id text; n_new int := 0; n_upd int := 0; errs jsonb := '[]'::jsonb; idx int := 0;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền nhập câu hỏi.'); END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RETURN err('Dữ liệu không hợp lệ.'); END IF;
  IF jsonb_array_length(p_items) > 3000 THEN RETURN err('Mỗi lần nhập tối đa 3000 câu.'); END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    idx := idx + 1;
    v_err := quiz_invalid(it);
    IF v_err IS NOT NULL THEN
      errs := errs || jsonb_build_object('row', coalesce(it->>'row', idx::text), 'message', v_err);
      CONTINUE;
    END IF;
    SELECT id INTO v_id FROM quiz_questions WHERE lower(trim(text)) = lower(trim(it->>'text')) LIMIT 1;
    IF v_id IS NULL THEN
      INSERT INTO quiz_questions (id, stt, topic, level, text, options, correct, explanation, source, active, "createdAt", "createdBy")
      VALUES (new_id('q'), nullif(it->>'stt', '')::int, nullif(trim(it->>'topic'), ''), nullif(trim(it->>'level'), ''),
              trim(it->>'text'), it->'options', (it->>'correct')::int, nullif(trim(it->>'explanation'), ''),
              nullif(trim(it->>'source'), ''), true, now_ms(), actor.id);
      n_new := n_new + 1;
    ELSE
      UPDATE quiz_questions SET stt = coalesce(nullif(it->>'stt', '')::int, stt), topic = nullif(trim(it->>'topic'), ''),
             level = nullif(trim(it->>'level'), ''), options = it->'options', correct = (it->>'correct')::int,
             explanation = nullif(trim(it->>'explanation'), ''), source = nullif(trim(it->>'source'), ''), active = true
       WHERE id = v_id;
      n_upd := n_upd + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'inserted', n_new, 'updated', n_upd, 'errors', errs);
END;
$$;

CREATE OR REPLACE FUNCTION app_save_question(p_token text, p_q jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; v_err text; v_id text;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền sửa câu hỏi.'); END IF;
  v_err := quiz_invalid(p_q);
  IF v_err IS NOT NULL THEN RETURN err('Câu hỏi ' || v_err || '.'); END IF;
  v_id := coalesce(nullif(p_q->>'id', ''), new_id('q'));
  INSERT INTO quiz_questions (id, stt, topic, level, text, options, correct, explanation, source, active, "createdAt", "createdBy")
  VALUES (v_id, nullif(p_q->>'stt', '')::int, nullif(trim(p_q->>'topic'), ''), nullif(trim(p_q->>'level'), ''),
          trim(p_q->>'text'), p_q->'options', (p_q->>'correct')::int, nullif(trim(p_q->>'explanation'), ''),
          nullif(trim(p_q->>'source'), ''), coalesce((p_q->>'active')::boolean, true), now_ms(), actor.id)
  ON CONFLICT (id) DO UPDATE SET stt = EXCLUDED.stt, topic = EXCLUDED.topic, level = EXCLUDED.level, text = EXCLUDED.text,
     options = EXCLUDED.options, correct = EXCLUDED.correct, explanation = EXCLUDED.explanation,
     source = EXCLUDED.source, active = EXCLUDED.active;
  RETURN jsonb_build_object('ok', true, 'question', (SELECT to_jsonb(q) FROM quiz_questions q WHERE id = v_id));
END;
$$;

CREATE OR REPLACE FUNCTION app_delete_questions(p_token text, p_ids jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; n int;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền xoá câu hỏi.'); END IF;
  DELETE FROM quiz_questions WHERE id IN (SELECT jsonb_array_elements_text(jarr(p_ids)));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', n);
END;
$$;

-- ---------------------------------------------------------------------
-- 5. KHOÁ HỌC & BÀI HỌC (soạn bài)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_save_course(p_token text, p_c jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; v_id text;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền soạn khoá học.'); END IF;
  IF length(trim(coalesce(p_c->>'title', ''))) = 0 THEN RETURN err('Vui lòng nhập tên khoá học.'); END IF;
  v_id := coalesce(nullif(p_c->>'id', ''), new_id('crs'));
  INSERT INTO learn_courses (id, title, description, deadline, "assigneeIds", status, sequential, "createdAt", "createdBy", "updatedAt")
  VALUES (v_id, trim(p_c->>'title'), p_c->>'description', nullif(p_c->>'deadline', '')::bigint, jarr(p_c->'assigneeIds'),
          CASE WHEN p_c->>'status' = 'PUBLISHED' THEN 'PUBLISHED' ELSE 'DRAFT' END,
          coalesce((p_c->>'sequential')::boolean, true), now_ms(), actor.id, now_ms())
  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, deadline = EXCLUDED.deadline,
     "assigneeIds" = EXCLUDED."assigneeIds", status = EXCLUDED.status, sequential = EXCLUDED.sequential, "updatedAt" = now_ms();
  RETURN jsonb_build_object('ok', true, 'course', (SELECT to_jsonb(c) FROM learn_courses c WHERE id = v_id));
END;
$$;

CREATE OR REPLACE FUNCTION app_delete_course(p_token text, p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền xoá khoá học.'); END IF;
  IF EXISTS (SELECT 1 FROM exams WHERE "requireCourseId" = p_id AND status <> 'CLOSED') THEN
    RETURN err('Khoá học đang là điều kiện dự thi của một kỳ thi chưa kết thúc.');
  END IF;
  DELETE FROM learn_progress WHERE "courseId" = p_id;
  DELETE FROM learn_lessons WHERE "courseId" = p_id;
  DELETE FROM learn_courses WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION app_save_lesson(p_token text, p_l jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; v_id text; v_kind text; v_n int; v_pass int; v_pool int;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền soạn bài học.'); END IF;
  IF NOT EXISTS (SELECT 1 FROM learn_courses WHERE id = p_l->>'courseId') THEN RETURN err('Không tìm thấy khoá học.'); END IF;
  IF length(trim(coalesce(p_l->>'title', ''))) = 0 THEN RETURN err('Vui lòng nhập tên bài học.'); END IF;
  v_kind := CASE WHEN coalesce(p_l->>'videoUrl', '') = '' THEN NULL
                 WHEN p_l->>'videoKind' IN ('YOUTUBE', 'FILE', 'DRIVE') THEN p_l->>'videoKind' ELSE 'FILE' END;
  v_pool := jsonb_array_length(jarr(p_l->'questionIds'));
  v_n    := least(greatest(coalesce(nullif(p_l->>'quizCount', '')::int, 3), 0), v_pool);
  v_pass := least(greatest(coalesce(nullif(p_l->>'quizPass', '')::int, ceil(v_n * 2.0 / 3)::int), 0), v_n);
  v_id := coalesce(nullif(p_l->>'id', ''), new_id('les'));
  INSERT INTO learn_lessons (id, "courseId", chapter, ord, title, body, "videoUrl", "videoKind", "pdfUrl",
                             "minSeconds", "questionIds", "quizCount", "quizPass", "updatedAt")
  VALUES (v_id, p_l->>'courseId', nullif(trim(p_l->>'chapter'), ''), coalesce(nullif(p_l->>'ord', '')::int, 0),
          trim(p_l->>'title'), p_l->>'body', nullif(trim(p_l->>'videoUrl'), ''), v_kind, nullif(trim(p_l->>'pdfUrl'), ''),
          greatest(coalesce(nullif(p_l->>'minSeconds', '')::int, 0), 0), jarr(p_l->'questionIds'), v_n, v_pass, now_ms())
  ON CONFLICT (id) DO UPDATE SET chapter = EXCLUDED.chapter, ord = EXCLUDED.ord, title = EXCLUDED.title, body = EXCLUDED.body,
     "videoUrl" = EXCLUDED."videoUrl", "videoKind" = EXCLUDED."videoKind", "pdfUrl" = EXCLUDED."pdfUrl",
     "minSeconds" = EXCLUDED."minSeconds", "questionIds" = EXCLUDED."questionIds", "quizCount" = EXCLUDED."quizCount",
     "quizPass" = EXCLUDED."quizPass", "updatedAt" = now_ms();
  UPDATE learn_courses SET "updatedAt" = now_ms() WHERE id = p_l->>'courseId';
  RETURN jsonb_build_object('ok', true, 'lesson', (SELECT to_jsonb(l) FROM learn_lessons l WHERE id = v_id));
END;
$$;

CREATE OR REPLACE FUNCTION app_delete_lesson(p_token text, p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền xoá bài học.'); END IF;
  DELETE FROM learn_progress WHERE "lessonId" = p_id;
  DELETE FROM learn_lessons WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Vé tải tệp (video/PDF) lên kho "hoc-tap": 30 phút, chỉ người soạn bài lấy được
CREATE OR REPLACE FUNCTION app_learn_upload_ticket(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; v text := 'up' || encode(gen_random_bytes(12), 'hex');
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền tải tệp bài học.'); END IF;
  DELETE FROM learn_upload_tickets WHERE "expiresAt" < now_ms();
  INSERT INTO learn_upload_tickets (ticket, "userId", "expiresAt") VALUES (v, actor.id, now_ms() + 30 * 60000);
  RETURN jsonb_build_object('ok', true, 'ticket', v, 'bucket', 'hoc-tap');
END;
$$;

CREATE OR REPLACE FUNCTION learn_ticket_ok(p_ticket text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM learn_upload_tickets WHERE ticket = p_ticket AND "expiresAt" > now_ms())
$$;

-- ---------------------------------------------------------------------
-- 6. HỌC BÀI: tính giờ học, câu hỏi ôn cuối bài
-- ---------------------------------------------------------------------
-- Bài đã được mở chưa (học theo thứ tự: mọi bài đứng trước phải xong)
CREATE OR REPLACE FUNCTION lesson_unlocked(p_uid text, l learn_lessons) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT coalesce((SELECT sequential FROM learn_courses WHERE id = l."courseId"), true)
      OR NOT EXISTS (
        SELECT 1 FROM learn_lessons p
         WHERE p."courseId" = l."courseId" AND (p.ord < l.ord OR (p.ord = l.ord AND p.id < l.id))
           AND NOT EXISTS (SELECT 1 FROM learn_progress g WHERE g.id = p.id || '__' || p_uid AND g.completed))
$$;

CREATE OR REPLACE FUNCTION lesson_ready_for_quiz(l learn_lessons, g learn_progress) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(g.seconds, 0) >= coalesce(l."minSeconds", 0)
     AND (l."videoKind" IS NULL OR l."videoKind" = 'DRIVE' OR coalesce(g."videoPct", 0) >= 90)
$$;

CREATE OR REPLACE FUNCTION learn_access(actor users, l learn_lessons) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c learn_courses%ROWTYPE;
BEGIN
  IF l.id IS NULL THEN RETURN 'Không tìm thấy bài học.'; END IF;
  SELECT * INTO c FROM learn_courses WHERE id = l."courseId";
  IF c.id IS NULL THEN RETURN 'Không tìm thấy khoá học.'; END IF;
  IF can_manage_learning(actor) THEN RETURN NULL; END IF;   -- người soạn bài được học thử
  IF c.status <> 'PUBLISHED' OR NOT is_assigned(c."assigneeIds", actor.id) THEN RETURN 'Bạn không được giao khoá học này.'; END IF;
  IF NOT lesson_unlocked(actor.id, l) THEN RETURN 'Cần học xong các bài trước.'; END IF;
  RETURN NULL;
END;
$$;

-- Gửi mỗi ~15 giây khi đang học thật (màn hình mở + có thao tác / video đang chạy)
-- Máy chủ chỉ cộng tối đa số giây thực đã trôi qua kể từ lần gửi trước (+3 giây bù mạng), mỗi lần ≤ 35 giây.
CREATE OR REPLACE FUNCTION app_learn_beat(p_token text, p_lesson_id text, p_seconds int, p_video_pct int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; l learn_lessons%ROWTYPE; g learn_progress%ROWTYPE; v_msg text; v_add int; v_now bigint := now_ms();
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  SELECT * INTO l FROM learn_lessons WHERE id = p_lesson_id;
  v_msg := learn_access(actor, l);
  IF v_msg IS NOT NULL THEN RETURN err(v_msg); END IF;

  INSERT INTO learn_progress (id, "lessonId", "courseId", "userId", seconds, "videoPct", "updatedAt")
  VALUES (l.id || '__' || actor.id, l.id, l."courseId", actor.id, 0, 0, v_now)
  ON CONFLICT (id) DO NOTHING;
  SELECT * INTO g FROM learn_progress WHERE id = l.id || '__' || actor.id FOR UPDATE;

  v_add := least(greatest(coalesce(p_seconds, 0), 0), 35);
  IF g."lastBeatAt" IS NOT NULL THEN
    v_add := least(v_add, ((v_now - g."lastBeatAt") / 1000)::int + 3);
  END IF;

  UPDATE learn_progress
     SET seconds = seconds + greatest(v_add, 0),
         "videoPct" = greatest(coalesce("videoPct", 0), least(greatest(coalesce(p_video_pct, 0), 0), 100)),
         "lastBeatAt" = v_now, "updatedAt" = v_now
   WHERE id = g.id
  RETURNING * INTO g;

  -- Bài không có câu hỏi ôn: đủ giờ + xem đủ video là hoàn thành
  IF NOT g.completed AND coalesce(l."quizCount", 0) = 0 AND lesson_ready_for_quiz(l, g) THEN
    UPDATE learn_progress SET completed = true, "completedAt" = v_now WHERE id = g.id RETURNING * INTO g;
  END IF;
  RETURN jsonb_build_object('ok', true, 'progress', to_jsonb(g), 'ready', lesson_ready_for_quiz(l, g));
END;
$$;

-- Lấy (hoặc tiếp tục) lượt ôn tập: câu hỏi KHÔNG kèm đáp án
CREATE OR REPLACE FUNCTION app_lesson_quiz(p_token text, p_lesson_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; l learn_lessons%ROWTYPE; g learn_progress%ROWTYPE; v_msg text; v_done boolean;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  SELECT * INTO l FROM learn_lessons WHERE id = p_lesson_id;
  v_msg := learn_access(actor, l);
  IF v_msg IS NOT NULL THEN RETURN err(v_msg); END IF;
  IF coalesce(l."quizCount", 0) = 0 THEN RETURN err('Bài này không có câu hỏi ôn.'); END IF;
  SELECT * INTO g FROM learn_progress WHERE id = l.id || '__' || actor.id;
  IF g.id IS NULL OR NOT lesson_ready_for_quiz(l, g) THEN
    RETURN err('Cần học đủ thời gian tối thiểu và xem hết video trước khi làm câu hỏi ôn.');
  END IF;

  v_done := g."quizServed" IS NOT NULL
        AND jsonb_array_length(g."quizServed") > 0
        AND (SELECT count(*) FROM jsonb_object_keys(coalesce(g."quizAnswers", '{}'::jsonb))) >= jsonb_array_length(g."quizServed");
  IF g."quizServed" IS NULL OR jsonb_array_length(g."quizServed") = 0 OR v_done THEN
    UPDATE learn_progress
       SET "quizServed" = (SELECT coalesce(jsonb_agg(id), '[]'::jsonb) FROM (
                             SELECT q.id FROM quiz_questions q
                              WHERE q.id IN (SELECT jsonb_array_elements_text(jarr(l."questionIds")))
                              ORDER BY random() LIMIT l."quizCount") s),
           "quizAnswers" = '{}'::jsonb, "quizTries" = coalesce("quizTries", 0) + 1, "updatedAt" = now_ms()
     WHERE id = g.id RETURNING * INTO g;
  END IF;

  RETURN jsonb_build_object('ok', true, 'need', l."quizPass", 'total', jsonb_array_length(g."quizServed"),
    'answers', coalesce(g."quizAnswers", '{}'::jsonb), 'completed', g.completed,
    'questions', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text,
                     'options', (SELECT jsonb_agg(jsonb_build_object('i', i, 't', q.options->>i) ORDER BY random())
                                   FROM generate_series(0, jsonb_array_length(q.options) - 1) i)) ORDER BY s.ord), '[]'::jsonb)
                    FROM jsonb_array_elements_text(g."quizServed") WITH ORDINALITY AS s(qid, ord)
                    JOIN quiz_questions q ON q.id = s.qid));
END;
$$;

-- Trả lời 1 câu ôn: máy chủ chấm, trả đáp án đúng + giải thích
CREATE OR REPLACE FUNCTION app_lesson_answer(p_token text, p_lesson_id text, p_question_id text, p_choice int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; l learn_lessons%ROWTYPE; g learn_progress%ROWTYPE; q quiz_questions%ROWTYPE;
        v_ok boolean; v_answered int; v_right int; v_total int; v_finished boolean := false; v_passed boolean := false;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  SELECT * INTO l FROM learn_lessons WHERE id = p_lesson_id;
  SELECT * INTO g FROM learn_progress WHERE id = p_lesson_id || '__' || actor.id FOR UPDATE;
  IF l.id IS NULL OR g.id IS NULL OR g."quizServed" IS NULL OR NOT (g."quizServed" ? p_question_id) THEN
    RETURN err('Câu hỏi không thuộc lượt ôn tập hiện tại. Vui lòng mở lại.');
  END IF;
  IF coalesce(g."quizAnswers", '{}'::jsonb) ? p_question_id THEN RETURN err('Câu này đã trả lời.'); END IF;
  SELECT * INTO q FROM quiz_questions WHERE id = p_question_id;
  IF q.id IS NULL THEN RETURN err('Câu hỏi đã bị xoá.'); END IF;

  v_ok := (p_choice = q.correct);
  UPDATE learn_progress SET "quizAnswers" = coalesce("quizAnswers", '{}'::jsonb) || jsonb_build_object(p_question_id, v_ok),
         "updatedAt" = now_ms()
   WHERE id = g.id RETURNING * INTO g;

  v_total    := jsonb_array_length(g."quizServed");
  v_answered := (SELECT count(*) FROM jsonb_object_keys(g."quizAnswers"));
  v_right    := (SELECT count(*) FROM jsonb_each(g."quizAnswers") e WHERE e.value = 'true'::jsonb);
  IF v_answered >= v_total THEN
    v_finished := true;
    v_passed := v_right >= l."quizPass";
    UPDATE learn_progress
       SET "quizBest" = greatest(coalesce("quizBest", 0), (100 * v_right / greatest(v_total, 1))),
           completed = completed OR v_passed,
           "completedAt" = CASE WHEN NOT completed AND v_passed THEN now_ms() ELSE "completedAt" END
     WHERE id = g.id RETURNING * INTO g;
  END IF;
  RETURN jsonb_build_object('ok', true, 'correct', v_ok, 'correctIndex', q.correct, 'explanation', q.explanation,
    'source', q.source, 'finished', v_finished, 'passed', v_passed, 'right', v_right, 'total', v_total,
    'need', l."quizPass", 'completed', g.completed);
END;
$$;

-- ---------------------------------------------------------------------
-- 7. KỲ THI: soạn, mở/đóng, mã QR phòng thi
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION exam_pool_size(e exams) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM quiz_questions q
   WHERE CASE WHEN jsonb_array_length(jarr(e."questionIds")) > 0
              THEN q.id IN (SELECT jsonb_array_elements_text(e."questionIds"))
              ELSE coalesce(q.active, true) AND (jsonb_array_length(jarr(e.topics)) = 0 OR q.topic IN (SELECT jsonb_array_elements_text(e.topics)))
         END
$$;

CREATE OR REPLACE FUNCTION app_save_exam(p_token text, p_e jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; v_id text; e exams%ROWTYPE; v_pool int;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền tạo kỳ thi.'); END IF;
  IF length(trim(coalesce(p_e->>'title', ''))) = 0 THEN RETURN err('Vui lòng nhập tên kỳ thi.'); END IF;
  v_id := coalesce(nullif(p_e->>'id', ''), new_id('exm'));
  SELECT * INTO e FROM exams WHERE id = v_id;
  IF e.id IS NOT NULL AND e.status <> 'DRAFT' AND EXISTS (SELECT 1 FROM exam_attempts WHERE "examId" = v_id) THEN
    -- Đã có người thi: chỉ sửa tên, địa điểm, khung giờ, thành phần
    UPDATE exams SET title = trim(p_e->>'title'), location = p_e->>'location',
           "startAt" = nullif(p_e->>'startAt', '')::bigint, "endAt" = nullif(p_e->>'endAt', '')::bigint,
           "assigneeIds" = jarr(p_e->'assigneeIds'), "seatLayoutId" = nullif(p_e->>'seatLayoutId', ''), "updatedAt" = now_ms()
     WHERE id = v_id;
    RETURN jsonb_build_object('ok', true, 'exam', (SELECT to_jsonb(x) FROM exams x WHERE id = v_id),
      'message', 'Kỳ thi đã có người làm bài: chỉ cập nhật tên, địa điểm, khung giờ và thành phần.');
  END IF;

  INSERT INTO exams (id, title, mode, location, "startAt", "endAt", "durationMin", "questionCount", topics, "questionIds",
                     "passScore", "maxLeave", "requireCourseId", "assigneeIds", "seatLayoutId", settings, status,
                     "createdAt", "createdBy", "updatedAt")
  VALUES (v_id, trim(p_e->>'title'), CASE WHEN p_e->>'mode' = 'HOME' THEN 'HOME' ELSE 'HALL' END, p_e->>'location',
          nullif(p_e->>'startAt', '')::bigint, nullif(p_e->>'endAt', '')::bigint,
          least(greatest(coalesce(nullif(p_e->>'durationMin', '')::int, 30), 1), 300),
          least(greatest(coalesce(nullif(p_e->>'questionCount', '')::int, 30), 1), 200),
          jarr(p_e->'topics'), jarr(p_e->'questionIds'),
          least(greatest(coalesce(nullif(p_e->>'passScore', '')::numeric, 5), 0), 10),
          least(greatest(coalesce(nullif(p_e->>'maxLeave', '')::int, 3), 0), 20),
          nullif(p_e->>'requireCourseId', ''), jarr(p_e->'assigneeIds'), nullif(p_e->>'seatLayoutId', ''),
          coalesce(p_e->'settings', '{}'::jsonb), 'DRAFT', now_ms(), actor.id, now_ms())
  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, mode = EXCLUDED.mode, location = EXCLUDED.location,
     "startAt" = EXCLUDED."startAt", "endAt" = EXCLUDED."endAt", "durationMin" = EXCLUDED."durationMin",
     "questionCount" = EXCLUDED."questionCount", topics = EXCLUDED.topics, "questionIds" = EXCLUDED."questionIds",
     "passScore" = EXCLUDED."passScore", "maxLeave" = EXCLUDED."maxLeave", "requireCourseId" = EXCLUDED."requireCourseId",
     "assigneeIds" = EXCLUDED."assigneeIds", "seatLayoutId" = EXCLUDED."seatLayoutId", settings = EXCLUDED.settings,
     "updatedAt" = now_ms();
  SELECT * INTO e FROM exams WHERE id = v_id;
  v_pool := exam_pool_size(e);
  RETURN jsonb_build_object('ok', true, 'exam', to_jsonb(e), 'pool', v_pool,
    'message', CASE WHEN v_pool < e."questionCount"
                    THEN 'Lưu ý: ngân hàng chỉ có ' || v_pool || ' câu phù hợp, ít hơn số câu mỗi đề (' || e."questionCount" || ').' END);
END;
$$;

CREATE OR REPLACE FUNCTION app_delete_exam(p_token text, p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền xoá kỳ thi.'); END IF;
  IF EXISTS (SELECT 1 FROM exams WHERE id = p_id AND status = 'OPEN') THEN RETURN err('Đóng kỳ thi trước khi xoá.'); END IF;
  DELETE FROM exam_events WHERE "examId" = p_id;
  DELETE FROM exam_attempts WHERE "examId" = p_id;
  DELETE FROM exams WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Chấm bài (dùng đáp án đã chụp lại lúc phát đề)
CREATE OR REPLACE FUNCTION exam_grade(p_attempt_id text, p_status text, p_reason text)
RETURNS exam_attempts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE a exam_attempts%ROWTYPE; v_right int;
BEGIN
  SELECT * INTO a FROM exam_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF a.id IS NULL OR a.status NOT IN ('IN_PROGRESS', 'LOCKED') THEN RETURN a; END IF;
  SELECT count(*) INTO v_right FROM jsonb_each(coalesce(a.answers, '{}'::jsonb)) x
   WHERE a.keys ? x.key AND (a.keys->>x.key) = (x.value #>> '{}');
  UPDATE exam_attempts
     SET status = p_status, "submitReason" = p_reason, "submittedAt" = now_ms(), "correctCount" = v_right,
         score = round(10.0 * v_right / greatest(total, 1), 2)
   WHERE id = a.id RETURNING * INTO a;
  PERFORM exam_log(a."examId", a."userId", CASE WHEN p_status = 'SUBMITTED' THEN 'SUBMIT' ELSE 'AUTO_SUBMIT' END, p_reason);
  RETURN a;
END;
$$;

-- Thu các bài đã quá giờ (gọi khi giám thị xem / thí sinh vào lại)
CREATE OR REPLACE FUNCTION exam_sweep(p_exam_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM exam_attempts
            WHERE "examId" = p_exam_id AND status = 'IN_PROGRESS' AND deadline + 20000 < now_ms() LOOP
    PERFORM exam_grade(r.id, 'AUTO_SUBMITTED', 'Hết giờ');
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app_exam_status(p_token text, p_id text, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; e exams%ROWTYPE; r record;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền điều hành kỳ thi.'); END IF;
  SELECT * INTO e FROM exams WHERE id = p_id;
  IF e.id IS NULL THEN RETURN err('Không tìm thấy kỳ thi.'); END IF;
  IF p_status = 'OPEN' THEN
    IF exam_pool_size(e) = 0 THEN RETURN err('Ngân hàng chưa có câu hỏi phù hợp cho kỳ thi này.'); END IF;
    UPDATE exams SET status = 'OPEN', "openedAt" = coalesce("openedAt", now_ms()), "closedAt" = NULL WHERE id = p_id;
    PERFORM exam_log(p_id, actor.id, 'OPEN', NULL);
  ELSIF p_status = 'CLOSED' THEN
    FOR r IN SELECT id FROM exam_attempts WHERE "examId" = p_id AND status IN ('IN_PROGRESS', 'LOCKED') LOOP
      PERFORM exam_grade(r.id, 'AUTO_SUBMITTED', 'Giám thị thu bài');
    END LOOP;
    UPDATE exams SET status = 'CLOSED', "closedAt" = now_ms() WHERE id = p_id;
    PERFORM exam_log(p_id, actor.id, 'CLOSE', NULL);
  ELSE
    RETURN err('Trạng thái không hợp lệ.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'exam', (SELECT to_jsonb(x) FROM exams x WHERE id = p_id));
END;
$$;

-- Khoá ký mã QR phòng thi (cùng cơ chế với hội nghị, file 06)
CREATE OR REPLACE FUNCTION app_exam_key(p_token text, p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền hiển thị mã phòng thi.'); END IF;
  IF NOT EXISTS (SELECT 1 FROM exams WHERE id = p_id AND status = 'OPEN') THEN RETURN err('Kỳ thi chưa mở.'); END IF;
  RETURN jsonb_build_object('ok', true, 'secret', qr_secret_of(p_id), 'serverNow', now_ms(),
                            'stepMs', greatest(qr_setting('qr_step_ms', 3000), 1000));
END;
$$;

-- ---------------------------------------------------------------------
-- 8. THÍ SINH: vào thi, trả lời, rời màn hình, nộp bài
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION exam_paper_json(a exam_attempts, e exams) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('ok', true,
    'attempt', jsonb_build_object('status', a.status, 'startedAt', a."startedAt", 'deadline', a.deadline,
                                  'serverNow', now_ms(), 'leaveCount', a."leaveCount", 'maxLeave', e."maxLeave",
                                  'total', a.total, 'lockReason', a."lockReason"),
    'questions', a.paper, 'answers', coalesce(a.answers, '{}'::jsonb))
$$;

CREATE OR REPLACE FUNCTION app_exam_start(p_token text, p_id text, p_qr text, p_device_id text, p_device_label text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; e exams%ROWTYPE; a exam_attempts%ROWTYPE; parts text[]; v_now bigint := now_ms();
        v_paper jsonb; v_keys jsonb; v_shuffle boolean; v_total int; v_missing int; v_unlocked boolean;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  SELECT * INTO e FROM exams WHERE id = p_id;
  IF e.id IS NULL THEN RETURN err('Không tìm thấy kỳ thi.'); END IF;
  IF NOT is_assigned(e."assigneeIds", actor.id) THEN RETURN err('Bạn không có tên trong danh sách dự thi.'); END IF;
  PERFORM exam_sweep(p_id);
  SELECT * INTO a FROM exam_attempts WHERE id = p_id || '__' || actor.id FOR UPDATE;

  IF a.id IS NOT NULL THEN
    IF a.status IN ('SUBMITTED', 'AUTO_SUBMITTED') THEN RETURN err('Bạn đã nộp bài kỳ thi này.'); END IF;
    IF a.status = 'VOID' THEN RETURN err('Bài thi của bạn đã bị huỷ. Liên hệ giám thị.'); END IF;
    IF e.status <> 'OPEN' THEN RETURN err('Kỳ thi đã đóng.'); END IF;
    IF a.status = 'LOCKED' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'LOCKED',
        'message', 'Bài thi đang tạm khoá: ' || coalesce(a."lockReason", '') || '. Chờ giám thị mở khoá.');
    END IF;
    -- Đổi máy giữa chừng → khoá bài chờ giám thị (trừ khi giám thị đã cho phép)
    IF coalesce((e.settings->>'oneDevice')::boolean, true) AND coalesce(p_device_id, '') <> coalesce(a."deviceId", '')
       AND NOT coalesce(a."allowNewDevice", false) THEN
      UPDATE exam_attempts SET status = 'LOCKED', "lockReason" = 'Đăng nhập máy khác khi đang thi',
             "deviceChanges" = "deviceChanges" + 1 WHERE id = a.id;
      PERFORM exam_log(p_id, actor.id, 'DEVICE_CHANGE', coalesce(p_device_label, '') || ' (trước đó: ' || coalesce(a."deviceLabel", '?') || ')');
      RETURN jsonb_build_object('ok', false, 'code', 'LOCKED',
        'message', 'Bài thi đang làm trên máy khác. Bài đã tạm khoá, báo giám thị để được mở khoá.');
    END IF;
    v_unlocked := coalesce(a."allowNewDevice", false);
    IF e.mode = 'HALL' AND v_unlocked THEN
      -- Sau khi giám thị mở khoá vẫn phải quét lại mã phòng thi
      parts := string_to_array(coalesce(p_qr, ''), '|');
      IF array_length(parts, 1) IS DISTINCT FROM 3 OR parts[1] <> e.id OR parts[2] !~ '^\d{1,15}$'
         OR NOT qr_valid(e.id, parts[2]::bigint, parts[3]) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'NEED_QR', 'message', 'Quét mã QR phòng thi để vào lại.');
      END IF;
    END IF;
    UPDATE exam_attempts
       SET "deviceId" = coalesce(nullif(p_device_id, ''), "deviceId"), "deviceLabel" = coalesce(nullif(p_device_label, ''), "deviceLabel"),
           "allowNewDevice" = false, "lastSeenAt" = v_now,
           "leaveCount" = "leaveCount" + CASE WHEN v_unlocked THEN 0 ELSE 1 END
     WHERE id = a.id RETURNING * INTO a;
    PERFORM exam_log(p_id, actor.id, 'RESUME', CASE WHEN v_unlocked THEN 'Vào lại sau khi mở khoá' ELSE 'Thoát ra rồi vào lại' END);
    IF e."maxLeave" > 0 AND a."leaveCount" >= e."maxLeave" THEN
      a := exam_grade(a.id, 'AUTO_SUBMITTED', 'Rời màn hình ' || a."leaveCount" || ' lần');
      RETURN jsonb_build_object('ok', false, 'code', 'SUBMITTED', 'message', 'Bạn đã rời bài thi quá số lần cho phép, bài đã tự nộp.');
    END IF;
    RETURN exam_paper_json(a, e);
  END IF;

  -- Lần đầu vào thi
  IF e.status <> 'OPEN' THEN RETURN err(CASE WHEN e.status = 'CLOSED' THEN 'Kỳ thi đã kết thúc.' ELSE 'Kỳ thi chưa mở.' END); END IF;
  IF e."startAt" IS NOT NULL AND v_now < e."startAt" THEN RETURN err('Chưa đến giờ thi.'); END IF;
  IF e."endAt" IS NOT NULL AND v_now > e."endAt" THEN RETURN err('Đã hết thời gian vào thi.'); END IF;
  IF e.mode = 'HALL' THEN
    parts := string_to_array(coalesce(p_qr, ''), '|');
    IF array_length(parts, 1) IS DISTINCT FROM 3 OR parts[1] <> e.id OR parts[2] !~ '^\d{1,15}$'
       OR NOT qr_valid(e.id, parts[2]::bigint, parts[3]) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'NEED_QR',
        'message', 'Mã QR phòng thi không hợp lệ hoặc đã hết hạn. Quét mã đang chiếu trên màn hình.');
    END IF;
  END IF;
  IF e."requireCourseId" IS NOT NULL THEN
    SELECT count(*) INTO v_missing FROM learn_lessons l
     WHERE l."courseId" = e."requireCourseId"
       AND NOT EXISTS (SELECT 1 FROM learn_progress g WHERE g.id = l.id || '__' || actor.id AND g.completed);
    IF v_missing > 0 THEN
      RETURN err('Bạn cần học xong khoá học bắt buộc trước khi dự thi (còn ' || v_missing || ' bài).');
    END IF;
  END IF;

  v_shuffle := coalesce((e.settings->>'shuffle')::boolean, true);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text,
           'options', (SELECT jsonb_agg(jsonb_build_object('i', i, 't', q.options->>i)
                                        ORDER BY CASE WHEN v_shuffle THEN random() ELSE i END)
                         FROM generate_series(0, jsonb_array_length(q.options) - 1) i))
           ORDER BY CASE WHEN v_shuffle THEN q.rnd ELSE 0 END, q.topic, q.stt, q."createdAt"), '[]'::jsonb),
         coalesce(jsonb_object_agg(q.id, q.correct), '{}'::jsonb),
         count(*)
    INTO v_paper, v_keys, v_total
    FROM (SELECT x.*, random() AS rnd FROM quiz_questions x
           WHERE CASE WHEN jsonb_array_length(jarr(e."questionIds")) > 0
                      THEN x.id IN (SELECT jsonb_array_elements_text(e."questionIds"))
                      ELSE coalesce(x.active, true) AND (jsonb_array_length(jarr(e.topics)) = 0 OR x.topic IN (SELECT jsonb_array_elements_text(e.topics)))
                 END
           ORDER BY CASE WHEN v_shuffle THEN random() ELSE 0 END, x.topic, x.stt, x."createdAt"
           LIMIT e."questionCount") q;
  IF v_total = 0 THEN RETURN err('Ngân hàng chưa có câu hỏi cho kỳ thi này.'); END IF;

  INSERT INTO exam_attempts (id, "examId", "userId", status, paper, keys, answers, "answeredCount", total,
                             "startedAt", deadline, "deviceId", "deviceLabel", "lastSeenAt")
  VALUES (p_id || '__' || actor.id, p_id, actor.id, 'IN_PROGRESS', v_paper, v_keys, '{}'::jsonb, 0, v_total,
          v_now, CASE WHEN e."endAt" IS NOT NULL AND e.mode = 'HOME'
                      THEN least(v_now + e."durationMin" * 60000::bigint, e."endAt")
                      ELSE v_now + e."durationMin" * 60000::bigint END,
          nullif(p_device_id, ''), nullif(p_device_label, ''), v_now)
  RETURNING * INTO a;
  PERFORM exam_log(p_id, actor.id, 'START', p_device_label);

  -- Cùng thiết bị với người khác trong cùng kỳ thi → ghi nhận nghi vấn
  IF coalesce(p_device_id, '') <> '' AND EXISTS (
       SELECT 1 FROM exam_attempts WHERE "examId" = p_id AND "deviceId" = p_device_id AND "userId" <> actor.id) THEN
    PERFORM exam_log(p_id, actor.id, 'SHARED_DEVICE', 'Thiết bị đã được dùng cho tài khoản khác trong kỳ thi');
  END IF;
  RETURN exam_paper_json(a, e);
END;
$$;

DROP FUNCTION IF EXISTS exam_live_attempt(text, text);
DROP FUNCTION IF EXISTS app_exam_answer(text, text, text, int);
DROP FUNCTION IF EXISTS app_exam_event(text, text, text, bigint);
DROP FUNCTION IF EXISTS app_exam_submit(text, text);

-- Bài đang làm của người gọi. Gửi kèm mã thiết bị: máy khác (không phải máy đang giữ bài) bị từ chối.
CREATE OR REPLACE FUNCTION exam_live_attempt(p_token text, p_id text, p_device_id text, OUT actor users, OUT a exam_attempts, OUT msg jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN msg := expired_msg(); RETURN; END IF;
  SELECT * INTO a FROM exam_attempts WHERE id = p_id || '__' || actor.id FOR UPDATE;
  IF a.id IS NULL THEN msg := err('Bạn chưa vào thi.'); RETURN; END IF;
  IF a.status = 'IN_PROGRESS' AND now_ms() > a.deadline + 20000 THEN
    a := exam_grade(a.id, 'AUTO_SUBMITTED', 'Hết giờ');
  END IF;
  IF a.status = 'LOCKED' THEN msg := jsonb_build_object('ok', false, 'code', 'LOCKED', 'message', 'Bài thi đang tạm khoá, chờ giám thị.'); RETURN; END IF;
  IF a.status <> 'IN_PROGRESS' THEN msg := jsonb_build_object('ok', false, 'code', 'SUBMITTED', 'message', 'Bài thi đã được nộp.'); RETURN; END IF;
  IF coalesce(p_device_id, '') <> '' AND a."deviceId" IS NOT NULL AND p_device_id <> a."deviceId" THEN
    msg := jsonb_build_object('ok', false, 'code', 'OTHER_DEVICE', 'message', 'Bài thi đang được làm trên máy khác.'); RETURN;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_exam_answer(p_token text, p_id text, p_question_id text, p_choice int, p_device_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE r record; v_answers jsonb;
BEGIN
  SELECT * INTO r FROM exam_live_attempt(p_token, p_id, p_device_id);
  IF r.msg IS NOT NULL THEN RETURN r.msg; END IF;
  IF NOT ((r.a).keys ? p_question_id) THEN RETURN err('Câu hỏi không thuộc đề của bạn.'); END IF;
  IF p_choice IS NULL THEN
    v_answers := coalesce((r.a).answers, '{}'::jsonb) - p_question_id;
  ELSE
    v_answers := coalesce((r.a).answers, '{}'::jsonb) || jsonb_build_object(p_question_id, p_choice);
  END IF;
  UPDATE exam_attempts SET answers = v_answers, "answeredCount" = (SELECT count(*) FROM jsonb_object_keys(v_answers)),
         "lastSeenAt" = now_ms()
   WHERE id = (r.a).id;
  RETURN jsonb_build_object('ok', true, 'serverNow', now_ms(), 'deadline', (r.a).deadline);
END;
$$;

-- kind: LEAVE (p_ms = số mili giây rời đi) | PING (giữ kết nối)
CREATE OR REPLACE FUNCTION app_exam_event(p_token text, p_id text, p_kind text, p_ms bigint DEFAULT 0, p_device_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE r record; a exam_attempts%ROWTYPE; v_max int;
BEGIN
  SELECT * INTO r FROM exam_live_attempt(p_token, p_id, p_device_id);
  IF r.msg IS NOT NULL THEN RETURN r.msg; END IF;
  a := r.a;
  IF p_kind = 'LEAVE' THEN
    SELECT "maxLeave" INTO v_max FROM exams WHERE id = p_id;
    UPDATE exam_attempts SET "leaveCount" = "leaveCount" + 1, "leaveMs" = "leaveMs" + greatest(coalesce(p_ms, 0), 0),
           "lastSeenAt" = now_ms()
     WHERE id = a.id RETURNING * INTO a;
    PERFORM exam_log(p_id, a."userId", 'LEAVE', 'Lần ' || a."leaveCount" || ' · ' || round(greatest(coalesce(p_ms, 0), 0) / 1000.0) || ' giây');
    IF v_max > 0 AND a."leaveCount" >= v_max THEN
      a := exam_grade(a.id, 'AUTO_SUBMITTED', 'Rời màn hình ' || a."leaveCount" || ' lần');
      RETURN jsonb_build_object('ok', true, 'submitted', true, 'leaveCount', a."leaveCount", 'maxLeave', v_max);
    END IF;
    RETURN jsonb_build_object('ok', true, 'submitted', false, 'leaveCount', a."leaveCount", 'maxLeave', v_max,
                              'serverNow', now_ms(), 'deadline', a.deadline);
  END IF;
  UPDATE exam_attempts SET "lastSeenAt" = now_ms() WHERE id = a.id;
  RETURN jsonb_build_object('ok', true, 'serverNow', now_ms(), 'deadline', a.deadline, 'leaveCount', a."leaveCount");
END;
$$;

CREATE OR REPLACE FUNCTION app_exam_submit(p_token text, p_id text, p_device_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE r record; a exam_attempts%ROWTYPE; e exams%ROWTYPE;
BEGIN
  SELECT * INTO r FROM exam_live_attempt(p_token, p_id, p_device_id);
  IF r.msg IS NOT NULL AND r.msg->>'code' IS DISTINCT FROM 'SUBMITTED' THEN RETURN r.msg; END IF;
  a := r.a;
  IF a.status = 'IN_PROGRESS' THEN a := exam_grade(a.id, 'SUBMITTED', 'Thí sinh nộp bài'); END IF;
  SELECT * INTO e FROM exams WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'status', a.status, 'total', a.total, 'answered', a."answeredCount",
    'score', CASE WHEN coalesce((e.settings->>'showScore')::boolean, true) OR e.published THEN a.score END,
    'correct', CASE WHEN coalesce((e.settings->>'showScore')::boolean, true) OR e.published THEN a."correctCount" END,
    'passed', CASE WHEN coalesce((e.settings->>'showScore')::boolean, true) OR e.published THEN a.score >= e."passScore" END);
END;
$$;

-- Bài thi của tôi (danh sách) + xem lại đáp án khi đã công bố
CREATE OR REPLACE FUNCTION app_exam_my(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  RETURN jsonb_build_object('ok', true, 'serverNow', now_ms(), 'attempts', coalesce((
    SELECT jsonb_agg(jsonb_build_object('examId', a."examId", 'status',
             CASE WHEN a.status = 'IN_PROGRESS' AND now_ms() > a.deadline + 20000 THEN 'AUTO_SUBMITTED' ELSE a.status END,
             'answered', a."answeredCount", 'total', a.total, 'startedAt', a."startedAt", 'deadline', a.deadline,
             'submittedAt', a."submittedAt", 'leaveCount', a."leaveCount",
             'score', CASE WHEN coalesce((e.settings->>'showScore')::boolean, true) OR e.published THEN a.score END,
             'correct', CASE WHEN coalesce((e.settings->>'showScore')::boolean, true) OR e.published THEN a."correctCount" END))
      FROM exam_attempts a JOIN exams e ON e.id = a."examId" WHERE a."userId" = actor.id), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION app_exam_review(p_token text, p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; a exam_attempts%ROWTYPE; e exams%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  SELECT * INTO e FROM exams WHERE id = p_id;
  SELECT * INTO a FROM exam_attempts WHERE id = p_id || '__' || actor.id;
  IF a.id IS NULL OR a.status NOT IN ('SUBMITTED', 'AUTO_SUBMITTED') THEN RETURN err('Chưa có bài làm đã nộp.'); END IF;
  IF NOT (e.published AND coalesce((e.settings->>'showReview')::boolean, true)) THEN
    RETURN err('Kết quả chi tiết chưa được công bố.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'score', a.score, 'correct', a."correctCount", 'total', a.total,
    'questions', a.paper, 'answers', a.answers, 'keys', a.keys,
    'explanations', (SELECT coalesce(jsonb_object_agg(q.id, q.explanation), '{}'::jsonb) FROM quiz_questions q WHERE a.keys ? q.id));
END;
$$;

-- ---------------------------------------------------------------------
-- 9. GIÁM THỊ: theo dõi trực tiếp, xử lý, kết quả
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_exam_monitor(p_token text, p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền giám sát kỳ thi.'); END IF;
  PERFORM exam_sweep(p_id);
  RETURN jsonb_build_object('ok', true, 'serverNow', now_ms(), 'attempts', coalesce((
    SELECT jsonb_agg(jsonb_build_object('userId', a."userId", 'status', a.status, 'answered', a."answeredCount",
             'total', a.total, 'startedAt', a."startedAt", 'deadline', a.deadline, 'submittedAt', a."submittedAt",
             'submitReason', a."submitReason", 'leaveCount', a."leaveCount", 'leaveMs', a."leaveMs",
             'deviceLabel', a."deviceLabel", 'deviceChanges', a."deviceChanges", 'lockReason', a."lockReason",
             'lastSeenAt', a."lastSeenAt", 'score', a.score, 'correct', a."correctCount"))
      FROM exam_attempts a WHERE a."examId" = p_id), '[]'::jsonb));
END;
$$;

-- p_action: UNLOCK (cho làm tiếp, được đổi máy) | VOID (huỷ bài) | RESET (cho thi lại) | EXTRA (cộng phút; p_user_id NULL = tất cả) | SUBMIT (thu bài 1 người)
CREATE OR REPLACE FUNCTION app_exam_action(p_token text, p_id text, p_user_id text, p_action text, p_minutes int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE; v_aid text := p_id || '__' || coalesce(p_user_id, ''); n int := 0;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền xử lý bài thi.'); END IF;
  IF NOT EXISTS (SELECT 1 FROM exams WHERE id = p_id) THEN RETURN err('Không tìm thấy kỳ thi.'); END IF;

  IF p_action = 'EXTRA' THEN
    IF coalesce(p_minutes, 0) <= 0 OR p_minutes > 120 THEN RETURN err('Số phút không hợp lệ.'); END IF;
    UPDATE exam_attempts SET deadline = deadline + p_minutes * 60000::bigint
     WHERE "examId" = p_id AND status IN ('IN_PROGRESS', 'LOCKED') AND (p_user_id IS NULL OR "userId" = p_user_id);
    GET DIAGNOSTICS n = ROW_COUNT;
    UPDATE exams SET "endAt" = "endAt" + p_minutes * 60000::bigint WHERE id = p_id AND "endAt" IS NOT NULL AND p_user_id IS NULL;
    PERFORM exam_log(p_id, p_user_id, 'EXTRA', '+' || p_minutes || ' phút · ' || n || ' bài');
  ELSIF p_action = 'UNLOCK' THEN
    UPDATE exam_attempts SET status = 'IN_PROGRESS', "lockReason" = NULL, "allowNewDevice" = true
     WHERE id = v_aid AND status = 'LOCKED';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN RETURN err('Bài thi không ở trạng thái tạm khoá.'); END IF;
    PERFORM exam_log(p_id, p_user_id, 'UNLOCK', 'Giám thị cho làm tiếp');
  ELSIF p_action = 'SUBMIT' THEN
    PERFORM exam_grade(v_aid, 'AUTO_SUBMITTED', 'Giám thị thu bài');
  ELSIF p_action = 'VOID' THEN
    UPDATE exam_attempts SET status = 'VOID', "submitReason" = 'Giám thị huỷ bài', "submittedAt" = coalesce("submittedAt", now_ms())
     WHERE id = v_aid;
    PERFORM exam_log(p_id, p_user_id, 'VOID', 'Huỷ kết quả');
  ELSIF p_action = 'RESET' THEN
    DELETE FROM exam_attempts WHERE id = v_aid;
    PERFORM exam_log(p_id, p_user_id, 'RESET', 'Cho thi lại');
  ELSE
    RETURN err('Thao tác không hợp lệ.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'affected', n);
END;
$$;

-- Kết quả đầy đủ cho người quản lý: bài làm + đáp án + nội dung câu hỏi (để phân tích)
CREATE OR REPLACE FUNCTION app_exam_results(p_token text, p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền xem kết quả.'); END IF;
  PERFORM exam_sweep(p_id);
  RETURN jsonb_build_object('ok', true,
    'attempts', coalesce((SELECT jsonb_agg(jsonb_build_object('userId', a."userId", 'status', a.status,
                  'answers', a.answers, 'keys', a.keys, 'total', a.total, 'answered', a."answeredCount",
                  'correct', a."correctCount", 'score', a.score, 'startedAt', a."startedAt", 'submittedAt', a."submittedAt",
                  'submitReason', a."submitReason", 'leaveCount', a."leaveCount", 'leaveMs', a."leaveMs",
                  'deviceId', a."deviceId", 'deviceLabel', a."deviceLabel", 'deviceChanges', a."deviceChanges"))
                  FROM exam_attempts a WHERE a."examId" = p_id), '[]'::jsonb),
    'questions', coalesce((SELECT jsonb_object_agg(x.qid, jsonb_build_object('text', x.qtext, 'topic', q.topic))
                  FROM (SELECT DISTINCT ON (p->>'id') p->>'id' AS qid, p->>'text' AS qtext
                          FROM exam_attempts a, jsonb_array_elements(a.paper) p WHERE a."examId" = p_id) x
                  LEFT JOIN quiz_questions q ON q.id = x.qid), '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION app_exam_publish(p_token text, p_id text, p_published boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE actor users%ROWTYPE;
BEGIN
  actor := session_user_row(p_token);
  IF actor.id IS NULL THEN RETURN expired_msg(); END IF;
  IF NOT can_manage_learning(actor) THEN RETURN err('Bạn không có quyền công bố kết quả.'); END IF;
  UPDATE exams SET published = coalesce(p_published, false), "updatedAt" = now_ms() WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 10. KHO TỆP "hoc-tap" (video, PDF) — chỉ tạo khi có Supabase Storage
--     Đọc công khai qua đường link; tải lên phải có vé từ app_learn_upload_ticket.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
    BEGIN
      EXECUTE $q$INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
                VALUES ('hoc-tap', 'hoc-tap', true, 209715200,
                        ARRAY['video/mp4','video/webm','video/quicktime','application/pdf'])
                ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 209715200,
                        allowed_mime_types = ARRAY['video/mp4','video/webm','video/quicktime','application/pdf']$q$;
    EXCEPTION WHEN undefined_column THEN
      EXECUTE $q$INSERT INTO storage.buckets (id, name, public) VALUES ('hoc-tap', 'hoc-tap', true)
                ON CONFLICT (id) DO UPDATE SET public = true$q$;
    END;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'Upload hoc-tap co ve') THEN
      EXECUTE $q$CREATE POLICY "Upload hoc-tap co ve" ON storage.objects FOR INSERT TO anon, authenticated
                WITH CHECK (bucket_id = 'hoc-tap' AND public.learn_ticket_ok(split_part(name, '/', 1)))$q$;
    END IF;
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- 11. QUYỀN GỌI HÀM
-- ---------------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND (p.proname LIKE 'app\_%' AND p.proname IN (
                   'app_list_questions','app_import_questions','app_save_question','app_delete_questions',
                   'app_save_course','app_delete_course','app_save_lesson','app_delete_lesson','app_learn_upload_ticket',
                   'app_learn_beat','app_lesson_quiz','app_lesson_answer',
                   'app_save_exam','app_delete_exam','app_exam_status','app_exam_key','app_exam_start','app_exam_answer',
                   'app_exam_event','app_exam_submit','app_exam_my','app_exam_review','app_exam_monitor','app_exam_action',
                   'app_exam_results','app_exam_publish'))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
  END LOOP;
  -- Hàm nội bộ: không cho gọi từ bên ngoài
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('exam_grade','exam_sweep','exam_log','exam_live_attempt','exam_paper_json','exam_pool_size',
                               'lesson_unlocked','learn_access','new_id')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END
$$;
-- learn_ticket_ok phải gọi được từ chính sách kho tệp
GRANT EXECUTE ON FUNCTION learn_ticket_ok(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
