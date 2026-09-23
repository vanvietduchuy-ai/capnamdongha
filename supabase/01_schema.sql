-- --- SCRIPT SETUP AN TOÀN (SAFE MIGRATION) ---
-- Script này sẽ tạo bảng nếu chưa có, hoặc thêm cột mới nếu bảng đã tồn tại.
-- KHÔNG LÀM MẤT DỮ LIỆU CŨ.
-- Cập nhật: Thêm hệ thống trò chơi (Sudoku, Xếp hình, Caro Online)

-- 1. BẢNG USERS (Cán bộ)
CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY);
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "fullName" text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "avatarUrl" text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "isFirstLogin" boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "lastLoginAt" bigint;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department text; -- Mới: Tổ công tác
ALTER TABLE users ADD COLUMN IF NOT EXISTS position text;   -- Mới: Chức danh
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions jsonb; -- Mới: Phân quyền chi tiết
ALTER TABLE users REPLICA IDENTITY FULL;

-- 1.1. TẠO TÀI KHOẢN ADMIN MẶC ĐỊNH (Nếu chưa có)
-- Chỉ tạo khi CSDL chưa có cán bộ nào (chạy lại file không tái tạo tài khoản mật khẩu mặc định)
INSERT INTO users (id, username, password, "fullName", role, department, position, "isFirstLogin", "avatarUrl")
SELECT 'admin', 'admin', '123123', 'Quản trị viên', 'ADMIN', 'Tổ Tổng hợp', 'Trưởng Công an phường', true, 'https://ui-avatars.com/api/?name=Admin&background=000&color=fff'
WHERE NOT EXISTS (SELECT 1 FROM users)
ON CONFLICT (id) DO NOTHING;

-- 2. BẢNG TASKS (Nhiệm vụ)
CREATE TABLE IF NOT EXISTS tasks (id text PRIMARY KEY);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS proposal text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "isProposalRead" boolean DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "managerResponse" jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "dispatchNumber" text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "issuingAuthority" text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "issueDate" text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "assigneeIds" jsonb; -- Dùng cho nhiều người nhận
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "creatorId" text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "dueDate" text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "isRegularDuty" boolean DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "createdAt" bigint;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "acceptedAt" bigint;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "aiSuggestedSteps" jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "calendarSequence" int DEFAULT 0;
ALTER TABLE tasks REPLICA IDENTITY FULL;

-- 2.1. DI CHUYỂN DỮ LIỆU CŨ (Nếu có cột assigneeId cũ)
DO $$
BEGIN
  -- Nếu cột assigneeId tồn tại, hãy chuyển dữ liệu sang mảng assigneeIds
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'assigneeId') THEN
      UPDATE tasks 
      SET "assigneeIds" = jsonb_build_array("assigneeId") 
      WHERE ("assigneeIds" IS NULL OR jsonb_array_length("assigneeIds") = 0) 
      AND "assigneeId" IS NOT NULL;
  END IF;
END
$$;

-- 3. BẢNG NOTIFICATIONS (Thông báo)
CREATE TABLE IF NOT EXISTS notifications (id text PRIMARY KEY);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "userId" text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "isRead" boolean DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "createdAt" bigint;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "taskId" text;
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- 4. BẢNG UTILITIES (Tiện ích)
CREATE TABLE IF NOT EXISTS utilities (id text PRIMARY KEY);
ALTER TABLE utilities ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE utilities ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE utilities ADD COLUMN IF NOT EXISTS icon text;
ALTER TABLE utilities ADD COLUMN IF NOT EXISTS "creatorId" text;
ALTER TABLE utilities ADD COLUMN IF NOT EXISTS scope text;
ALTER TABLE utilities REPLICA IDENTITY FULL;

-- 5. BẢNG CALENDAR_EVENTS (Lịch công tác tuần)
CREATE TABLE IF NOT EXISTS calendar_events (id text PRIMARY KEY);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS date text; -- YYYY-MM-DD
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS session text; -- MORNING/AFTERNOON
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS time text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS chairperson text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS participants text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS "isOnline" boolean DEFAULT false;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS "meetingLink" text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS "creatorId" text;
ALTER TABLE calendar_events REPLICA IDENTITY FULL;

-- 6. BẢNG ATTENDANCE_SESSIONS (Phiên điểm danh)
CREATE TABLE IF NOT EXISTS attendance_sessions (id text PRIMARY KEY);
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS "creatorId" text;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS "createdAt" bigint;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS "expiresAt" bigint;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS "isActive" boolean DEFAULT true;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS "expectedUserIds" jsonb;
ALTER TABLE attendance_sessions REPLICA IDENTITY FULL;

-- 7. BẢNG ATTENDANCE_RECORDS (Bản ghi điểm danh)
CREATE TABLE IF NOT EXISTS attendance_records (id text PRIMARY KEY);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "sessionId" text;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "userId" text;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "timestamp" bigint;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "location" jsonb;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "deviceInfo" text;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "deviceId" text; -- Added to match code
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "date" text; -- Added to match code
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "status" text; -- Added to match code
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS "ipAddress" text; -- Added for fraud prevention
ALTER TABLE attendance_records REPLICA IDENTITY FULL;

-- 7.1 UNIQUE CONSTRAINT (Prevent duplicate check-ins)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_attendance_user_session') THEN
        ALTER TABLE attendance_records ADD CONSTRAINT unique_attendance_user_session UNIQUE ("sessionId", "userId");
    END IF;
END
$$;

-- 10. BẢNG GAME_SCORES (Điểm số trò chơi)
CREATE TABLE IF NOT EXISTS game_scores (id text PRIMARY KEY);
ALTER TABLE game_scores ADD COLUMN IF NOT EXISTS "userId" text;
ALTER TABLE game_scores ADD COLUMN IF NOT EXISTS "gameId" text; -- 'SUDOKU', 'PUZZLE', etc.
ALTER TABLE game_scores ADD COLUMN IF NOT EXISTS score bigint; -- Time in seconds or points
ALTER TABLE game_scores ADD COLUMN IF NOT EXISTS "playedAt" bigint;
ALTER TABLE game_scores REPLICA IDENTITY FULL;

-- 11. BẢNG GAME_PROGRESS (Tiến trình trò chơi)
CREATE TABLE IF NOT EXISTS game_progress (id text PRIMARY KEY);
ALTER TABLE game_progress ADD COLUMN IF NOT EXISTS "userId" text;
ALTER TABLE game_progress ADD COLUMN IF NOT EXISTS "gameId" text;
ALTER TABLE game_progress ADD COLUMN IF NOT EXISTS "highestLevel" int DEFAULT 0;
ALTER TABLE game_progress REPLICA IDENTITY FULL;

-- 12. BẢNG CARO_GAMES (Trò chơi Caro online)
CREATE TABLE IF NOT EXISTS caro_games (id text PRIMARY KEY);
ALTER TABLE caro_games ADD COLUMN IF NOT EXISTS "player1Id" text;
ALTER TABLE caro_games ADD COLUMN IF NOT EXISTS "player2Id" text;
ALTER TABLE caro_games ADD COLUMN IF NOT EXISTS "board" text; -- JSON string of the board
ALTER TABLE caro_games ADD COLUMN IF NOT EXISTS "turn" text; -- userId of current turn
ALTER TABLE caro_games ADD COLUMN IF NOT EXISTS "winnerId" text;
ALTER TABLE caro_games ADD COLUMN IF NOT EXISTS "status" text; -- 'WAITING', 'PLAYING', 'FINISHED'
ALTER TABLE caro_games ADD COLUMN IF NOT EXISTS "createdAt" bigint;
ALTER TABLE caro_games REPLICA IDENTITY FULL;

-- 13. KÍCH HOẠT REALTIME (an toàn khi chạy lại: chỉ thêm bảng còn thiếu, không gỡ bảng đã có)
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH t IN ARRAY ARRAY['tasks','users','notifications','utilities','calendar_events',
                           'attendance_sessions','attendance_records','game_scores',
                           'game_progress','caro_games']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;

-- 14. CHÍNH SÁCH BẢO MẬT (RLS - Safe)
-- Cho phép đọc/ghi công khai (Phù hợp demo/nội bộ đơn giản)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE caro_games ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public Access Users') THEN
        CREATE POLICY "Public Access Users" ON users FOR ALL USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public Access Tasks') THEN
        CREATE POLICY "Public Access Tasks" ON tasks FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public Access Notifications') THEN
        CREATE POLICY "Public Access Notifications" ON notifications FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public Access Utilities') THEN
        CREATE POLICY "Public Access Utilities" ON utilities FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public Access Calendar Events') THEN
        CREATE POLICY "Public Access Calendar Events" ON calendar_events FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public Access Attendance Sessions') THEN
        CREATE POLICY "Public Access Attendance Sessions" ON attendance_sessions FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public Access Attendance Records') THEN
        CREATE POLICY "Public Access Attendance Records" ON attendance_records FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public Access Game Scores') THEN
        CREATE POLICY "Public Access Game Scores" ON game_scores FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public Access Game Progress') THEN
        CREATE POLICY "Public Access Game Progress" ON game_progress FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public Access Caro Games') THEN
        CREATE POLICY "Public Access Caro Games" ON caro_games FOR ALL USING (true);
    END IF;
END
$$;

-- 15. BẢNG MAP_ZONES (Sơ đồ bảo vệ - Các vùng/chốt)
CREATE TABLE IF NOT EXISTS map_zones (id text PRIMARY KEY);
ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS type text; -- 'Polygon', 'Rectangle', 'Polyline', 'Label'
ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS positions jsonb; -- Coordinates
ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS "assignedUserIds" jsonb; -- Array of user IDs
ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS "fillColor" text;
ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS "textColor" text;
ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS "dutyId" text; -- Link to specific duty
ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS "createdAt" bigint;
ALTER TABLE map_zones ADD COLUMN IF NOT EXISTS "updatedAt" bigint;
ALTER TABLE map_zones REPLICA IDENTITY FULL;

-- 16. BẢNG DUTY_INFO (Thông tin đợt bảo vệ)
CREATE TABLE IF NOT EXISTS duty_info (id text PRIMARY KEY);
ALTER TABLE duty_info ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE duty_info ADD COLUMN IF NOT EXISTS "startTime" text;
ALTER TABLE duty_info ADD COLUMN IF NOT EXISTS "endTime" text;
ALTER TABLE duty_info ADD COLUMN IF NOT EXISTS "isActive" boolean DEFAULT true;
ALTER TABLE duty_info ADD COLUMN IF NOT EXISTS "mapType" text DEFAULT 'real';
ALTER TABLE duty_info ADD COLUMN IF NOT EXISTS "mapImageUrl" text;
ALTER TABLE duty_info ADD COLUMN IF NOT EXISTS "imageWidth" int;
ALTER TABLE duty_info ADD COLUMN IF NOT EXISTS "imageHeight" int;
ALTER TABLE duty_info ADD COLUMN IF NOT EXISTS "createdAt" bigint;
ALTER TABLE duty_info ADD COLUMN IF NOT EXISTS "updatedAt" bigint;
ALTER TABLE duty_info REPLICA IDENTITY FULL;

-- 17. KÍCH HOẠT REALTIME CHO MAP
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['map_zones','duty_info']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;

-- 18. CHÍNH SÁCH BẢO MẬT CHO MAP
ALTER TABLE map_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_info ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public Access Map Zones') THEN
        CREATE POLICY "Public Access Map Zones" ON map_zones FOR ALL USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public Access Duty Info') THEN
        CREATE POLICY "Public Access Duty Info" ON duty_info FOR ALL USING (true);
    END IF;
END
$$;

-- 19. BẢNG USER_GROUPS (Nhóm tuỳ chọn)
CREATE TABLE IF NOT EXISTS user_groups (id text PRIMARY KEY);
ALTER TABLE user_groups ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE user_groups ADD COLUMN IF NOT EXISTS "userIds" jsonb;
ALTER TABLE user_groups ADD COLUMN IF NOT EXISTS "creatorId" text;
ALTER TABLE user_groups REPLICA IDENTITY FULL;

-- 20. KÍCH HOẠT REALTIME CHO USER_GROUPS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_groups']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;

-- 21. CHÍNH SÁCH BẢO MẬT CHO USER_GROUPS
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public Access User Groups') THEN
        CREATE POLICY "Public Access User Groups" ON user_groups FOR ALL USING (true);
    END IF;
END
$$;
