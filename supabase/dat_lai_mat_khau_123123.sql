-- =====================================================================
-- ĐẶT LẠI MẬT KHẨU TẤT CẢ TÀI KHOẢN VỀ MẶC ĐỊNH 123123
-- Chạy 1 lần trong Supabase → SQL Editor (sau khi đã chạy 01 → 06).
-- KHÔNG đưa vào quy trình chạy lại định kỳ.
--
-- Kết quả:
--   • Mọi tài khoản (kể cả admin) đăng nhập được bằng mật khẩu 123123.
--   • Mọi thiết bị đang đăng nhập bị đăng xuất (phiên cũ bị huỷ).
--   • Lần đăng nhập tới, phần mềm BẮT BUỘC mỗi người đổi mật khẩu riêng
--     (vì 123123 ai cũng biết). Nếu KHÔNG muốn bắt buộc đổi, xoá khối số 3.
-- =====================================================================

BEGIN;

-- 1. Đặt lại mật khẩu (lưu dạng băm bcrypt, không lưu chữ thường)
INSERT INTO user_secrets ("userId", "passwordHash", "updatedAt")
SELECT u.id, crypt('123123', gen_salt('bf', 8)), now()
FROM users u
ON CONFLICT ("userId") DO UPDATE
  SET "passwordHash" = EXCLUDED."passwordHash", "updatedAt" = now();

-- 2. Đăng xuất mọi thiết bị
DELETE FROM user_sessions;

-- 3. Bắt buộc đổi mật khẩu ở lần đăng nhập tới
UPDATE users SET "isFirstLogin" = true;

COMMIT;

-- Kiểm tra: số tài khoản đã đặt lại
SELECT count(*) AS so_tai_khoan_da_dat_lai
FROM users u JOIN user_secrets s ON s."userId" = u.id
WHERE crypt('123123', s."passwordHash") = s."passwordHash";
