-- =====================================================================
--  12 — Phân quyền quản lý điểm danh: chỉ Quản trị viên và cán bộ được phân quyền
-- =====================================================================
--  Trước đây: ADMIN, CHIEF, DEPUTY_CHIEF hoặc có quyền MANAGE_ATTENDANCE.
--  Nay: lãnh đạo chỉ huy (Trưởng/Phó Trưởng CAP) KHÔNG còn thẩm quyền mặc
--  định theo chức vụ; chỉ ADMIN hoặc người được cấp MANAGE_ATTENDANCE
--  (trong "Quản lý cán bộ → Phân quyền").
--
--  Hàm này được mọi RPC điểm danh dùng chung (tạo/sửa/bắt đầu/kết thúc/xoá
--  hội nghị, mã QR động, sơ đồ chỗ ngồi, đối sánh, lý do vắng, duyệt ảnh
--  điểm danh...) nên chỉ cần thay ở đây là chặn đồng bộ phía máy chủ.
--
--  LƯU Ý SAU KHI CHẠY: tài khoản Trưởng/Phó Trưởng CAP nào đang có sẵn
--  MANAGE_ATTENDANCE trong cột permissions (do bản cũ tự gán khi chọn chức
--  vụ) vẫn còn quyền. Quản trị viên vào Quản lý cán bộ → bỏ tick "Quản lý
--  Điểm danh" cho những tài khoản không được giao.
-- =====================================================================

CREATE OR REPLACE FUNCTION can_manage_attendance(u users) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT u.role = 'ADMIN' OR has_perm(u, 'MANAGE_ATTENDANCE')
$$;
