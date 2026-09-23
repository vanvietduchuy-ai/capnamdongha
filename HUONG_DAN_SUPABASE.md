# HƯỚNG DẪN TRIỂN KHAI – PHẦN MỀM ĐIỂM DANH HỘI NGHỊ

Công an phường Nam Đông Hà · Dữ liệu lưu trên **Supabase** (PostgreSQL) · Giao diện chạy trên **Vercel**

---

## 1. Cài đặt cơ sở dữ liệu (làm 1 lần, khoảng 5 phút)

Vào dự án Supabase của đơn vị → **SQL Editor** → dán và chạy **đúng thứ tự** 4 file trong thư mục `supabase/`:

| Thứ tự | File | Nội dung |
|---|---|---|
| 1 | `01_schema.sql` | Toàn bộ bảng dữ liệu, bật đồng bộ tức thời |
| 2 | `02_auth_otp.sql` | Mã hoá mật khẩu (bcrypt), đăng ký tài khoản, OTP quên mật khẩu |
| 3 | `03_absence_report.sql` | Bảng lý do vắng mặt, cột còn thiếu, chỉ mục tăng tốc |
| 4 | `04_bao_mat.sql` | Phiên đăng nhập, khoá quyền ghi trực tiếp, hàm điểm danh trên máy chủ |

- Cả 4 file an toàn khi chạy lại. **Nếu chạy lại, luôn chạy đủ cả 4 file theo thứ tự** (file 04 phải chạy sau cùng).
- Dữ liệu cũ được giữ nguyên; mật khẩu chữ thường đang có sẽ tự động được mã hoá.
- **Sau khi chạy file 04, mọi người phải đăng nhập lại một lần** (hệ thống chuyển sang phiên đăng nhập do máy chủ cấp).

Phần mềm đã cài sẵn địa chỉ dự án Supabase của đơn vị (`DEFAULT_SUPABASE_URL` trong `App.tsx`), nên mọi máy tự kết nối, không phải nhập tay. Nếu đổi sang dự án khác: sửa 2 dòng `DEFAULT_SUPABASE_URL`, `DEFAULT_SUPABASE_KEY` rồi deploy lại.

Kiểm tra: ở **màn hình đăng nhập**, bấm nút góc trên bên phải (**Đã kết nối**) → **Kiểm tra cơ sở dữ liệu** → phải báo "đầy đủ bảng và hàm nghiệp vụ (01–04)".

## 2. Dịch vụ gửi email (bắt buộc nếu dùng đăng ký tài khoản / quên mật khẩu)

Supabase không tự gửi được email từ cơ sở dữ liệu, nên dùng một Google Apps Script nhỏ **chỉ để gửi mail** (không lưu dữ liệu):

1. https://script.google.com → **Dự án mới** → dán toàn bộ `google-apps-script/Mailer.gs`.
2. Sửa dòng `MAILER_KEY` thành một chuỗi bí mật bất kỳ (ít nhất 20 ký tự) → **Lưu**.
3. Chạy hàm `guiThu` một lần để cấp quyền gửi mail (thư thử sẽ về hộp thư của bạn).
4. **Triển khai → Tuỳ chọn triển khai mới → Ứng dụng web**: Thực thi với tư cách **Tôi**, Quyền truy cập **Bất kỳ ai** → chép URL `.../exec`.
5. Trong Supabase SQL Editor chạy (thay 2 giá trị):

```sql
UPDATE app_settings SET value = 'https://script.google.com/macros/s/XXXX/exec' WHERE key = 'mailer_url';
UPDATE app_settings SET value = 'CHUOI-BI-MAT-O-BUOC-2'                        WHERE key = 'mailer_key';
```

Chưa làm bước này thì phần mềm vẫn chạy bình thường; riêng Đăng ký và Quên mật khẩu sẽ báo "chưa cấu hình dịch vụ gửi email" (không tạo tài khoản treo).
Hạn mức Gmail thường: 100 thư/ngày.

## 3. Điểm danh hội nghị

**Người quản lý** (Quản trị viên, Trưởng/Phó Trưởng CAP, hoặc cán bộ được cấp quyền "Quản lý điểm danh"):

1. Mục **Điểm danh hội nghị → Quản lý** → nhập tên hội nghị, thời gian, chọn thành phần → **Tạo mã QR**.
2. Chiếu mã lên màn hình. Có 2 loại mã:
   - **QR cán bộ**: cán bộ mở phần mềm → **Quét mã**.
   - **QR khách mời**: khách dùng camera điện thoại quét, điền họ tên – đơn vị – số điện thoại, không cần tài khoản.
3. Mã tự đổi mỗi 5 giây (chống chụp ảnh gửi cho người vắng). Mỗi điện thoại chỉ điểm danh cho 1 người.
4. Bấm **Kết thúc điểm danh** → hộp tổng kết hiện số có mặt/vắng → **Báo cáo Word** hoặc **Bảng Excel** xuất ngay cho phiên đó.

Điểm danh được xác nhận **trên máy chủ**: không ai điểm danh hộ được, không sửa/xoá được bản ghi điểm danh, không sửa được danh sách triệu tập sau khi đã mở phiên.

## 4. Báo cáo cán bộ vắng mặt

Mục **Điểm danh hội nghị → Báo cáo vắng** (chỉ người quản lý thấy):

1. Chọn khoảng thời gian (Hôm nay / Tuần / Tháng / Quý / Năm hoặc tự chọn ngày).
2. Tích chọn các phiên cần báo cáo. Phiên **đang mở** không được chọn sẵn vì chưa đủ căn cứ tính vắng.
3. Với từng cán bộ vắng, chọn **Tình trạng**: *Có lý do / Không lý do / Chưa xác minh* và ghi lý do (VD: đi công tác, nghỉ phép). Tự lưu, các máy khác thấy ngay.
4. Nhập chức danh, họ tên người ký → xuất:
   - **Word (.docx)**: Báo cáo đúng thể thức NĐ30 (TNR 14, lề 2-2-3-2 cm, giãn dòng 1,2, ký hiệu `/BC-CAP-TH`), gồm: I. Kết quả điểm danh (có bảng theo từng phiên), II. Danh sách cán bộ vắng mặt kèm lý do, III. Tổng hợp số lần vắng theo cán bộ, nơi nhận, chữ ký. Để trống số và ngày tháng để văn thư điền.
   - **Excel (.xlsx)**: 3 trang tính — Danh sách vắng mặt, Tổng hợp theo phiên, Tổng hợp theo cán bộ.

Cán bộ đã bị xoá khỏi hệ thống vẫn xuất hiện trong báo cáo cũ dưới dạng "(Tài khoản đã xoá: mã)". Vì vậy **nên xuất và lưu báo cáo trước khi xoá tài khoản**.

## 5. Đăng ký tài khoản & quên mật khẩu

- **Đăng ký**: màn hình đăng nhập → "Đăng ký ngay" → nhận mã 6 số qua email → nhập mã → **chờ duyệt**.
- **Duyệt**: Quản lý Cán bộ → khung "Tài khoản chờ phê duyệt" → Duyệt / Từ chối (Quản trị viên, Trưởng CAP, Phó Trưởng CAP phụ trách chung).
- **Quên mật khẩu**: nhập tên đăng nhập hoặc email → mã 6 số → đặt mật khẩu mới. Đổi/đặt lại mật khẩu sẽ **đăng xuất mọi thiết bị khác** của tài khoản đó.

Tham số trong bảng `app_settings`: `require_admin_approval` (mặc định `true` – khuyến nghị giữ nguyên), `otp_ttl_minutes` (5), `otp_max_attempts` (5), `otp_resend_seconds` (60).

## 6. Bảo mật – những gì đã có và điều cần biết

**Đã có:**
- Mật khẩu băm bcrypt ở bảng riêng; trình duyệt không bao giờ nhận mật khẩu hay chuỗi băm.
- Đăng nhập cấp mã phiên 30 ngày (chỉ lưu bản băm trên máy chủ). Tài khoản bị xoá/khoá thì máy đang dùng bị đăng xuất ngay lần kiểm tra kế tiếp.
- Bảng cán bộ, phiên điểm danh, bản ghi điểm danh, lý do vắng: **chỉ ghi được qua hàm máy chủ**, có kiểm tra quyền theo đúng quy tắc của màn hình Quản lý cán bộ (Tổ trưởng chỉ quản lý tổ mình, không ai đụng tới Quản trị viên, chỉ Quản trị viên phân quyền chi tiết).
- Các hàm nội bộ (đọc cấu hình, phát mã OTP…) đã bị thu hồi quyền gọi từ bên ngoài.

**Giới hạn còn lại (cần biết khi dùng cho công việc thật):**
- Khoá công khai (anon/publishable) nằm trong mã giao diện. Ai có khoá này vẫn **đọc được** danh sách cán bộ (họ tên, email, chức vụ), lịch công tác, nhiệm vụ, kết quả điểm danh; và vẫn **sửa được** các bảng phụ: nhiệm vụ, thông báo, lịch công tác, tiện ích, sơ đồ bảo vệ, trò chơi. Muốn khoá cả phần này cần chuyển sang Supabase Auth — nên làm ở giai đoạn sau.
- Vì vậy **chỉ nhập dữ liệu hành chính thông thường**, không nhập nội dung mật, tài liệu nghiệp vụ.
- Khoá Gemini (nếu cấu hình biến `GEMINI_API_KEY`) cũng nằm trong mã giao diện: chỉ dùng khoá riêng đã giới hạn hạn mức.

## 7. Bảo trì định kỳ

Chạy trong SQL Editor (hằng tháng, hoặc đặt lịch bằng pg_cron):

```sql
SELECT cleanup_otp_codes();      -- dọn mã OTP cũ
SELECT cleanup_user_sessions();  -- dọn phiên đăng nhập hết hạn
```

Supabase gói miễn phí **không tự sao lưu** và **tạm dừng dự án nếu 7 ngày không hoạt động**. Sau mỗi hội nghị lớn nên xuất báo cáo Excel lưu lại; định kỳ vào **Table Editor** xuất CSV các bảng `users`, `attendance_sessions`, `attendance_records`, `attendance_absences`.

---

## 8. Triển khai lên Vercel

1. Đưa toàn bộ mã nguồn lên GitHub (file `package.json` phải nằm ngay gốc kho).
2. Vercel → **Add New → Project** → Import kho → giữ cấu hình mặc định (đã có `vercel.json`) → **Deploy**.
3. Từ lần sau chỉ cần `git push` là tự triển khai lại.

Nếu điện thoại vẫn hiện bản cũ sau khi cập nhật: đóng hẳn ứng dụng rồi mở lại (hoặc xoá và thêm lại vào màn hình chính).

---

## 9. Danh sách kiểm tra trước khi đưa vào sử dụng

- [ ] Chạy đủ 4 file SQL theo thứ tự trên dự án Supabase của đơn vị.
- [ ] Đăng nhập `admin` → **đổi mật khẩu ngay** (mật khẩu mặc định 123123 ai cũng biết).
- [ ] Màn hình đăng nhập → nút **Đã kết nối** → Kiểm tra cơ sở dữ liệu → báo đầy đủ 01–04.
- [ ] Kiểm tra danh sách cán bộ, **điền email** cho từng người (cần cho quên mật khẩu).
- [ ] Cấp quyền "Quản lý điểm danh" cho cán bộ trực tiếp tổ chức hội nghị (nếu không phải Trưởng/Phó).
- [ ] Triển khai `Mailer.gs`, khai báo `mailer_url`, `mailer_key` (nếu dùng đăng ký/quên mật khẩu).
- [ ] Chạy thử 1 phiên điểm danh với 3–4 người, 1 khách mời; kết thúc phiên; xuất Word + Excel.
- [ ] Thử trên cả Android và iPhone: quét mã, camera được cấp quyền, phần mềm chạy trên HTTPS (link Vercel).
- [ ] Nhắc cán bộ: mỗi người dùng điện thoại riêng để điểm danh; giờ điện thoại để tự động.
