# Chống điểm danh hộ — hướng dẫn triển khai và sử dụng

## 1. Cách hoạt động

Khi cán bộ điểm danh:

1. **Chụp khuôn mặt** bằng camera trước. Phần mềm yêu cầu nhìn thẳng, quay nhẹ đầu, rồi nhìn thẳng lại (để chặn việc giơ ảnh chụp sẵn).
2. **Quét mã QR** trên màn hình hội nghị như trước.

Máy chủ kiểm tra 4 lớp:

| Lớp | Xử lý |
|---|---|
| IP thuộc VPN / proxy / trung tâm dữ liệu | **Chặn**, báo tắt VPN |
| Khuôn mặt khác hẳn ảnh mẫu (độ lệch > 0,65) | **Chặn**, ghi vào danh sách "Bị từ chối" |
| Khuôn mặt khớp thấp, trùng mặt người khác, cùng 1 máy khác trình duyệt, máy đang gắn với tài khoản khác, đổi máy nhiều lần, không có ảnh | **Cho điểm danh**, đưa vào "Chờ kiểm tra" |
| Máy mới, chưa tra được IP | Chỉ ghi chú |

Lần điểm danh đầu tiên của mỗi người: ảnh lần đó thành **ảnh mẫu**. Ban tổ chức bấm "Đúng người" là ảnh mẫu được xác nhận.

## 2. Triển khai (làm 1 lần)

### Bước 1 — Cập nhật cơ sở dữ liệu

1. Vào Supabase → **SQL Editor** → **New query**.
2. Dán toàn bộ nội dung file `supabase/11_chong_diem_danh_ho.sql` → **Run**.
3. Nếu thấy dòng thông báo *"Không bật được tiện ích http"*: vào **Database → Extensions**, tìm **http**, bật lên, rồi chạy lại file 11.
   (Không bật thì vẫn điểm danh được, chỉ là không chặn được VPN.)

### Bước 2 — Cập nhật mã nguồn

Tải các file trong gói cập nhật lên GitHub (giữ nguyên thư mục). Vercel tự triển khai lại sau 1–2 phút.

> Nên chạy SQL (bước 1) trước. Nếu web cập nhật trước, điểm danh vẫn chạy bình thường theo kiểu cũ, chưa có chụp mặt.

### Bước 3 — Thử trước hội nghị

1. Tài khoản quản lý → Hội nghị → mở điểm danh một hội nghị thử → thẻ **Kiểm tra** → bấm **Kiểm tra IP mạng máy này** (thử trên Wi-Fi hội trường). Nếu báo "sẽ BỊ CHẶN" thì cho phép IP đó (xem mục 4).
2. Dùng 1 điện thoại cán bộ điểm danh thử: chụp mặt → quét mã → thấy "Điểm danh thành công".
3. Ở thẻ **Kiểm tra** thấy lượt vừa rồi với nhãn "Lần đầu: ảnh mẫu chờ xác nhận" → bấm **Đúng người**.

## 3. Ban tổ chức kiểm tra

- Màn hình đang điểm danh → thẻ **Kiểm tra (số lượt)**. Màn hình **Kết quả điểm danh** cũng có mục này.
- Bấm biểu tượng ảnh để xem **ảnh lúc điểm danh** cạnh **ảnh mẫu**.
- **Đúng người**: giữ lượt điểm danh. **Loại**: xoá lượt, người đó bị tính chưa điểm danh.
- Mục **Bị từ chối**: bấm **Cho điểm danh** nếu chặn nhầm. Với lượt bị chặn do IP, có nút **Cho phép IP này**.
- **Xoá ảnh mẫu**: dùng khi ảnh mẫu sai hoặc người đó thay đổi nhiều (lần sau tự chụp lại ảnh mẫu).
- **Gỡ máy đã gắn**: dùng khi cán bộ đổi điện thoại.

Lượt "Chờ kiểm tra" vẫn tính là **có mặt** cho đến khi Ban tổ chức bấm Loại.

## 4. Tham số (chạy trong SQL Editor khi cần)

```sql
-- Bắt buộc chụp mặt (không cho "Gửi không có ảnh")
UPDATE app_settings SET value = 'strict' WHERE key = 'face_mode';
-- Tắt chụp mặt
UPDATE app_settings SET value = 'off' WHERE key = 'face_mode';
-- Bật lại chế độ mặc định
UPDATE app_settings SET value = 'flag' WHERE key = 'face_mode';

-- Không chặn VPN, chỉ gắn cờ
UPDATE app_settings SET value = 'off' WHERE key = 'ip_block';

-- Ngưỡng khuôn mặt (mặc định 0.5 / 0.65). Tăng face_reject nếu bị chặn nhầm nhiều
UPDATE app_settings SET value = '0.7' WHERE key = 'face_reject';

-- Số ngày giữ ảnh điểm danh (mặc định 60; ảnh mẫu giữ vĩnh viễn)
UPDATE app_settings SET value = '90' WHERE key = 'photo_keep_days';
```

## 5. Dung lượng

- Ảnh mỗi lượt khoảng 10–15 KB, lưu trong cơ sở dữ liệu, tự xoá sau 60 ngày (ảnh của lượt còn chờ kiểm tra được giữ lại).
- Ví dụ: 80 cán bộ × 1 buổi/ngày × 60 ngày ≈ 70 MB, trong mức 500 MB của gói miễn phí.
- Bộ nhận diện khuôn mặt (khoảng 6,7 MB) điện thoại chỉ tải lần đầu, các lần sau dùng bản đã lưu.

## 6. Lưu ý

- Mở bằng **Safari / Chrome**, không mở trong Zalo/Facebook (camera thường không chạy). Phần mềm tự nhắc khi phát hiện.
- iPhone bật **Chuyển tiếp bảo mật iCloud (Private Relay)** sẽ bị coi như VPN → tắt đi hoặc dùng Wi-Fi hội trường.
- Máy không chụp được bằng camera trên trang: dùng nút **Chụp bằng ứng dụng camera của máy** (lượt đó sẽ vào "Chờ kiểm tra").
- Chống điểm danh hộ không đảm bảo tuyệt đối 100%. Ảnh lưu lại là bằng chứng để hậu kiểm.
