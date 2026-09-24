# HƯỚNG DẪN TRIỂN KHAI – PHẦN MỀM ĐIỂM DANH HỘI NGHỊ

Công an phường Nam Đông Hà · Dữ liệu lưu trên **Supabase** (PostgreSQL) · Giao diện chạy trên **Vercel**

---

## 1. Cài đặt cơ sở dữ liệu (làm 1 lần, khoảng 5 phút)

Vào dự án Supabase của đơn vị → **SQL Editor** → dán và chạy **đúng thứ tự** 7 file trong thư mục `supabase/`:

| Thứ tự | File | Nội dung |
|---|---|---|
| 1 | `01_schema.sql` | Toàn bộ bảng dữ liệu, bật đồng bộ tức thời |
| 2 | `02_auth_otp.sql` | Mã hoá mật khẩu (bcrypt), đăng ký tài khoản, OTP quên mật khẩu |
| 3 | `03_absence_report.sql` | Bảng lý do vắng mặt, cột còn thiếu, chỉ mục tăng tốc |
| 4 | `04_bao_mat.sql` | Phiên đăng nhập, khoá quyền ghi trực tiếp, hàm điểm danh trên máy chủ |
| 5 | `05_hoi_nghi.sql` | Tạo hội nghị trước, chọn thành phần, **Bắt đầu / Kết thúc** điểm danh |
| 6 | `06_ma_qr_dong.sql` | Mã QR có chữ ký máy chủ, đổi **3 giây/lần**, máy chủ kiểm tra từng lần quét |
| 7 | `07_so_do_cho_ngoi.sql` | Sơ đồ chỗ ngồi, **Đối sánh sơ đồ chỗ ngồi**, đánh dấu nghi vấn |

- Cả 7 file an toàn khi chạy lại. **Nếu chạy lại, luôn chạy đủ theo thứ tự.** Đặc biệt: đã chạy lại file 04 thì **bắt buộc chạy lại 05 và 06** ngay sau đó (nếu không, mã QR sẽ mất lớp kiểm tra chữ ký).
- Đơn vị đã chạy 01–06: chỉ cần chạy thêm **07_so_do_cho_ngoi.sql** (chạy lúc nào cũng được, không ảnh hưởng điểm danh đang diễn ra), rồi triển khai bản web mới.
- Đơn vị đã chạy 01–05: chỉ cần chạy thêm **06_ma_qr_dong.sql**, rồi **triển khai bản web mới ngay** (bản web cũ không điểm danh được với máy chủ đã chạy 06 và ngược lại — không làm việc này trong lúc đang họp).
- Đơn vị mới chạy 01–04: chạy thêm 05 rồi 06. Các phiên điểm danh cũ được giữ nguyên, tự xếp vào mục "Đã kết thúc".
- Dữ liệu cũ được giữ nguyên; mật khẩu chữ thường đang có sẽ tự động được mã hoá.
- **Sau khi chạy file 04, mọi người phải đăng nhập lại một lần** (hệ thống chuyển sang phiên đăng nhập do máy chủ cấp).

Phần mềm đã cài sẵn địa chỉ dự án Supabase của đơn vị (`DEFAULT_SUPABASE_URL` trong `App.tsx`), nên mọi máy tự kết nối, không phải nhập tay. Nếu đổi sang dự án khác: sửa 2 dòng `DEFAULT_SUPABASE_URL`, `DEFAULT_SUPABASE_KEY` rồi deploy lại.

Kiểm tra: ở **màn hình đăng nhập**, bấm nút góc trên bên phải (**Đã kết nối**) → **Kiểm tra cơ sở dữ liệu** → phải báo "đầy đủ bảng và hàm nghiệp vụ (01–07)".

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

**Người quản lý** (Quản trị viên, Trưởng/Phó Trưởng CAP, hoặc cán bộ được cấp quyền "Quản lý điểm danh") — mục **Điểm danh hội nghị → Hội nghị**:

1. **Tạo hội nghị trước** (nút **+ Tạo hội nghị**, trên điện thoại là nút đỏ góc dưới): tên, thời gian dự kiến, địa điểm.
2. **Chọn thành phần tham dự**: tìm theo tên, chọn nhanh *Tất cả / Lãnh đạo, chỉ huy / Cán bộ / từng tổ*, hoặc chọn theo **nhóm đã lưu** (VD: Chi uỷ, Tổ công tác). Bấm **+ Lưu lựa chọn thành nhóm** để dùng lại lần sau.
   → Hội nghị ở trạng thái **Chưa bắt đầu**: chưa có mã QR, không ai điểm danh được. Có thể sửa, đổi thành phần hoặc xoá.
3. Đến giờ, bấm **▶ Bắt đầu điểm danh** → chọn thời gian tự đóng (30 phút – 8 giờ, phòng khi quên bấm Kết thúc) → mã QR hiện ngay.
   - **Mã cho cán bộ**: cán bộ mở phần mềm → **Quét mã**. **Mã cho khách mời**: khách dùng camera điện thoại quét, điền họ tên – đơn vị – số điện thoại.
   - Chạm vào mã để **phóng to trình chiếu**. Mã tự đổi **mỗi 3 giây** (vạch đỏ dưới mã là thời gian còn lại).
   - Mỗi mã mang **chữ ký của máy chủ** (khoá riêng từng hội nghị, chỉ người quản lý lấy được). Máy chủ kiểm tra chữ ký và độ mới theo **đồng hồ máy chủ**: mã quá khoảng 9–12 giây bị từ chối, nên ảnh chụp gửi qua Zalo/Messenger hầu như không kịp dùng; không tự tạo được mã; giờ trên điện thoại cán bộ sai cũng không ảnh hưởng.
   - Khách mời: quét mã → được **10 phút** để điền biểu mẫu; đường dẫn tự xoá khỏi thanh địa chỉ nên chuyển tiếp cho người khác không dùng được.
   - Điều chỉnh (nếu mạng hội trường chậm, cán bộ hay báo "mã hết hạn"): `UPDATE app_settings SET value='4' WHERE key='qr_grace_steps';` (mặc định 3 chu kỳ ≈ 9–12 giây). Chu kỳ đổi mã: khoá `qr_step_ms` (mặc định 3000). Thời gian khách điền biểu mẫu: `guest_ticket_min` (mặc định 10).
   - Theo dõi trực tiếp *Chưa điểm danh / Đã điểm danh*; **+15 / +30 phút** để gia hạn; **+ Thành phần** để bổ sung người (đang điểm danh thì chỉ thêm, không bớt được).
4. Bấm **■ Kết thúc điểm danh** → mã QR ngừng hiệu lực, hiện **Kết quả** (triệu tập / có mặt / vắng / tỷ lệ, danh sách vắng) → xuất **Word** hoặc **Excel** ngay.
5. Cần cho người đến muộn điểm danh: ở hội nghị đã kết thúc bấm **↻ Mở lại điểm danh**, xong bấm Kết thúc lại (giờ bắt đầu ban đầu được giữ nguyên trong báo cáo).

Điểm danh được xác nhận **trên máy chủ**: không ai điểm danh hộ được, không điểm danh được nếu không quét mã đang chiếu, không điểm danh được khi hội nghị chưa bắt đầu hoặc đã kết thúc, không sửa/xoá được bản ghi điểm danh, không bỏ bớt được thành phần sau khi đã bắt đầu.

## 4. Báo cáo cán bộ vắng mặt

Mục **Điểm danh hội nghị → Báo cáo vắng** (chỉ người quản lý thấy):

1. Chọn khoảng thời gian (Hôm nay / Tuần / Tháng / Quý / Năm hoặc tự chọn ngày).
2. Mở mục **Hội nghị đưa vào báo cáo** để chọn/bỏ hội nghị. Hội nghị **đang điểm danh** không được chọn sẵn vì chưa đủ căn cứ tính vắng; hội nghị **chưa bắt đầu** không đưa vào báo cáo.
3. Với từng cán bộ vắng, bấm một trong 3 nút *Chưa xác minh / Có lý do / Không lý do* và ghi lý do (VD: đi công tác, nghỉ phép). Tự lưu, các máy khác thấy ngay.
4. Mở mục **Người ký báo cáo** để nhập chức danh, họ tên (phần mềm tự nhớ) → bấm **Xuất Word / Xuất Excel** (trên điện thoại 2 nút luôn nằm ở cuối màn hình):
   - **Word (.docx)**: Báo cáo đúng thể thức NĐ30 (TNR 14, lề 2-2-3-2 cm, giãn dòng 1,2, ký hiệu `/BC-CAP-TH`), gồm: I. Kết quả điểm danh (có bảng theo từng phiên), II. Danh sách cán bộ vắng mặt kèm lý do, III. Tổng hợp số lần vắng theo cán bộ, nơi nhận, chữ ký. Để trống số và ngày tháng để văn thư điền.
   - **Excel (.xlsx)**: 3 trang tính — Danh sách vắng mặt, Tổng hợp theo phiên, Tổng hợp theo cán bộ.

Cán bộ đã bị xoá khỏi hệ thống vẫn xuất hiện trong báo cáo cũ dưới dạng "(Tài khoản đã xoá: mã)". Vì vậy **nên xuất và lưu báo cáo trước khi xoá tài khoản**.

## 5. Đặt lại mật khẩu toàn bộ tài khoản về 123123

Chạy file `supabase/dat_lai_mat_khau_123123.sql` trong SQL Editor (chạy 1 lần, không đưa vào quy trình chạy lại):
- Mọi tài khoản (kể cả `admin`) đăng nhập bằng **123123**; mọi thiết bị đang đăng nhập bị đăng xuất.
- Lần đăng nhập tới, mỗi người **bắt buộc đổi mật khẩu riêng** (xoá khối số 3 trong file nếu không muốn bắt buộc).
- Dòng cuối file in ra số tài khoản đã đặt lại để đối chiếu.

## 5b. Đăng ký tài khoản & quên mật khẩu

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

## 8b. Logo đơn vị

Phần mềm dùng tệp `public/logo.svg` (biểu tượng khiên – sao, vẽ sẵn, không phụ thuộc trang web khác). Muốn dùng logo Công an chính thức:
1. Chép tệp ảnh logo (nền trong suốt, vuông) vào thư mục `public/`, đặt tên `logo.png`.
2. Mở `lib/brand.ts`, đổi `LOGO_URL = '/logo.svg'` thành `LOGO_URL = '/logo.png'`.
3. (Tuỳ chọn) Thay `public/icon-192.png`, `icon-512.png`, `icon-180.png` — biểu tượng khi cài ứng dụng lên màn hình điện thoại.
4. Deploy lại.

## 8c. Cài ứng dụng lên điện thoại, máy tính

Phần mềm tự nhận biết thiết bị và trình duyệt, rồi hiện đúng cách cài:

| Thiết bị / trình duyệt | Cách cài |
|---|---|
| Android – Chrome, Edge | Nút **Cài đặt ứng dụng** → trình duyệt hỏi → **Cài đặt**. Một chạm |
| Android – Samsung Internet | Hướng dẫn: ≡ → Thêm trang vào → Màn hình chính |
| iPhone/iPad – Safari | Hướng dẫn từng bước, đúng theo iOS 26 (nút ••• → Chia sẻ) hoặc iOS cũ (nút Chia sẻ). Sau khi thêm, **mở từ biểu tượng và đăng nhập lại một lần** |
| Mở từ link trong **Zalo, Facebook, Messenger** | Trình duyệt của các ứng dụng này không cài được. Android có nút **Mở bằng Chrome**; iPhone hướng dẫn ••• → Mở trong Safari, kèm nút sao chép link |
| Máy tính – Chrome, Edge | Nút cài một chạm, hoặc biểu tượng cài ở thanh địa chỉ. Có mã QR để cài sang điện thoại |

Lối vào: dải gợi ý ở trang chủ (bấm "Để sau" thì 7 ngày sau mới hiện lại), mục **Cài đặt ứng dụng** trong menu, dòng **Cài ứng dụng lên điện thoại** ở màn đăng nhập. Máy đã cài thì các mục này tự ẩn.

**Trang công khai `/cai-dat`** (VD: `https://<tên-miền>/cai-dat`), không cần đăng nhập:
- Gửi link này cho cán bộ, hoặc bấm **In tờ QR**: in ra A4 một mã QR lớn để dán ở trụ sở, hội trường.
- Dặn cán bộ **quét bằng camera điện thoại**, không quét bằng Zalo (Zalo mở trong trình duyệt riêng, không cài được).

## 8d. Quét mã từ xa (điện thoại mạnh, yếu)

Bộ quét mã cán bộ đã được viết lại (tệp `lib/qrScanEngine.ts`):

- Xin camera 1920×1080 (máy mạnh) hoặc 1280×720 (máy yếu), giải mã ở độ phân giải gốc. Bản cũ chỉ giải mã ảnh khoảng 360 điểm ảnh.
- Tự quét luân phiên toàn khung và vùng giữa khung, nên bắt được mã nhỏ ở xa mà không cần bấm gì.
- Nút **1× / 2× / 4×** và chụm hai ngón:
  - máy có zoom camera (iPhone iOS 17 trở lên, phần lớn máy Android dùng Chrome) phóng bằng camera thật;
  - máy không có thì phóng số.
- Android Chrome dùng bộ đọc mã có sẵn của máy. iPhone dùng bộ đọc ZXing đi kèm.
- Máy chậm thì tự giảm kích thước ảnh và nhịp quét, không giật, không nóng máy.
- Mã cán bộ chuyển sang mức sửa lỗi L: mã thưa hơn (29×29 ô thay cho 37×37), ô to hơn khoảng 27%.

Khoảng cách quét được, ước tính theo kết quả kiểm thử, đã trừ hao cho rung tay và loá màn:

| Mã QR hiển thị rộng | Bản cũ | Máy yếu | Máy mạnh | Máy có zoom camera 2–3× |
|---|---|---|---|---|
| 9 cm (ô mã trên màn hình máy tính) | khoảng 0,3 m | khoảng 0,7 m | khoảng 1 m | khoảng 2–3 m |
| 55 cm (tivi 55 inch, chế độ phóng to) | khoảng 2 m | khoảng 4 m | khoảng 5,5 m | khoảng 11–16 m |
| 1,2 m (máy chiếu, chế độ phóng to) | khoảng 4 m | khoảng 9 m | khoảng 12 m | trên 20 m |

Mẹo cho phòng họp lớn:

- Luôn bấm vào mã để **phóng to toàn màn hình** khi trình chiếu.
- Ngồi xa hơn khoảng 10 lần chiều rộng mã thì bấm 2× hoặc 4×.
- Giảm độ sáng máy chiếu nếu mã bị loá trắng.

## 8e. Đối sánh sơ đồ chỗ ngồi (chống gọi video nhờ quét hộ)

**Chuẩn bị sơ đồ (làm 1 lần):** Điểm danh → Tạo hội nghị → bật **Đối sánh sơ đồ chỗ ngồi** → **Quản lý sơ đồ** → **Nhập từ Excel**.

Tệp Excel theo mẫu `mau_so_do_cho_ngoi.xlsx`:
- Mỗi ô là 1 ghế, ghi tên và tổ. Tổ đứng trước hay sau tên đều được: "Minh Quốc AN", "CSKV Viết Hiền". Chỉ huy ghi "Đ/c Hồng", "Đ/c N. Trung".
- Cột giữa ghi số hàng 1, 2, 3… Hàng 1 là hàng sát bục chủ toạ. Dòng tiêu đề và mũi tên tự bỏ qua.
- Mã tổ: AN (An ninh), CSKV, CSTT, PCTP, TH (Tổng hợp).

Phần mềm tự ghép theo **tổ + tên**. Ô trùng tên hoặc không tìm thấy người thì hiện ở mục **Cần chọn đúng cán bộ**, chọn tay một lần rồi **Lưu sơ đồ**. Chạm vào ghế trên sơ đồ để sửa tên hoặc đổi người. Chưa có tệp Excel thì dùng **Tạo theo tổ**.

**Khi họp:**
- **Màn chiếu** (chạm vào mã QR để phóng to): mã QR cao hết màn hình bên trái, sơ đồ bên phải. Màu ghế:
  - **xanh** = đã điểm danh;
  - **đỏ** = chưa điểm danh;
  - **vàng** = vắng có lý do (đã ghi ở Báo cáo vắng);
  - **trắng** = không thuộc thành phần;
  - **viền cam có dấu !** = nghi vấn.
- **Chỉ huy đối sánh trên điện thoại:** mở hội nghị đang điểm danh → thẻ **Sơ đồ** → chạm ghế.
  - Ghế xanh mà nhìn thấy trống thì bấm **Không thấy tại chỗ → Nghi vấn**.
  - Thấy đúng người thì bấm **Có mặt đúng chỗ**.
  - Phần mềm ghi lại người đánh dấu và thời gian. Cán bộ thường không tự gỡ được.
- **Kết quả hội nghị** tách riêng mục **Nghi vấn** để chỉ huy xem xét.
- Người trong thành phần chưa có ghế trên sơ đồ vẫn điểm danh bình thường, hiện ở danh sách "Chưa có chỗ".

## 9. Danh sách kiểm tra trước khi đưa vào sử dụng

- [ ] Chạy đủ 6 file SQL theo thứ tự trên dự án Supabase của đơn vị (đã chạy 01–05 thì chạy thêm 06), triển khai bản web mới ngay sau đó.
- [ ] Đăng nhập `admin` → **đổi mật khẩu ngay** (mật khẩu mặc định 123123 ai cũng biết).
- [ ] Màn hình đăng nhập → nút **Đã kết nối** → Kiểm tra cơ sở dữ liệu → báo đầy đủ 01–07.
- [ ] Kiểm tra danh sách cán bộ, **điền email** cho từng người (cần cho quên mật khẩu).
- [ ] Cấp quyền "Quản lý điểm danh" cho cán bộ trực tiếp tổ chức hội nghị (nếu không phải Trưởng/Phó).
- [ ] Triển khai `Mailer.gs`, khai báo `mailer_url`, `mailer_key` (nếu dùng đăng ký/quên mật khẩu).
- [ ] Chạy thử: tạo hội nghị, chọn 3–4 người, Bắt đầu, cho 1 khách mời quét mã, Kết thúc; xuất Word + Excel.
- [ ] Thử trên cả Android và iPhone: quét mã, camera được cấp quyền, phần mềm chạy trên HTTPS (link Vercel).
- [ ] In tờ QR ở trang `/cai-dat`, dán tại trụ sở; nhắc cán bộ cài ứng dụng và bật thông báo.
- [ ] Nhắc cán bộ: mỗi người dùng điện thoại riêng để điểm danh; giờ điện thoại để tự động.
