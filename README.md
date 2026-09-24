# Phần mềm Điểm danh Hội nghị – Công an phường Nam Đông Hà

Ứng dụng web (React + Vite) quản lý điểm danh hội nghị, nhiệm vụ, lịch công tác
tuần, sơ đồ bảo vệ và các tiện ích nội bộ.

**Dữ liệu lưu trên Supabase (PostgreSQL)**, đồng bộ tức thời giữa các máy.

## Chạy trên máy

Yêu cầu: Node.js

```bash
npm install
npm run dev        # chạy thử
npm run build      # đóng gói triển khai
```

Đặt `GEMINI_API_KEY` trong `.env.local` nếu dùng tính năng gợi ý AI.

## Triển khai lên Vercel

Đẩy mã nguồn lên GitHub → import vào Vercel → Deploy. Cấu hình sẵn trong
`vercel.json` (framework Vite, output `dist`, SPA rewrite, cache assets).
Các bước chi tiết tại mục 8 của file [HUONG_DAN_SUPABASE.md](./HUONG_DAN_SUPABASE.md).

## Kết nối cơ sở dữ liệu

Xem hướng dẫn chi tiết tại [HUONG_DAN_SUPABASE.md](./HUONG_DAN_SUPABASE.md).
Cơ sở dữ liệu: 6 file SQL trong thư mục `supabase/` (chạy theo thứ tự 01 → 06).

## Cấu trúc chính

| Đường dẫn | Vai trò |
|---|---|
| `supabase/01_schema.sql` | Toàn bộ bảng dữ liệu + bật đồng bộ tức thời |
| `supabase/02_auth_otp.sql` | Mã hoá mật khẩu, đăng ký tài khoản, OTP |
| `supabase/03_absence_report.sql` | Lý do vắng mặt, cột bổ sung, chỉ mục |
| `supabase/04_bao_mat.sql` | Phiên đăng nhập, hàm ghi dữ liệu trên máy chủ, khoá quyền ghi trực tiếp |
| `supabase/05_hoi_nghi.sql` | Hội nghị: tạo trước, chọn thành phần, Bắt đầu / Kết thúc điểm danh |
| `supabase/06_ma_qr_dong.sql` | Mã QR có chữ ký máy chủ, đổi 3 giây/lần |
| `supabase/dat_lai_mat_khau_123123.sql` | Đặt lại mật khẩu mọi tài khoản về 123123 (chạy khi cần) |
| `lib/brand.ts` | Tên đơn vị, đường dẫn logo |
| `index.css` | Bộ quy chuẩn giao diện: màu, bo góc, bóng, chữ |
| `lib/install.ts`, `components/InstallGuide.tsx` | Nhận diện thiết bị, nút cài một chạm, hướng dẫn iPhone/Zalo, trang `/cai-dat` |
| `lib/qrCode.ts` | Tạo / đọc mã QR có chữ ký |
| `components/MeetingManager.tsx` | Màn hình Hội nghị (danh sách, mã QR, kết quả) |
| `components/ParticipantPicker.tsx` | Chọn thành phần tham dự (theo tổ, chức vụ, nhóm) |
| `google-apps-script/Mailer.gs` | Dịch vụ gửi email OTP / thông báo |
| `components/AbsenceReport.tsx` | Màn hình Báo cáo cán bộ vắng mặt |
| `services/absenceReportService.ts` | Tổng hợp số liệu, xuất Word (NĐ30) và Excel |
| `lib/supabase.ts` | Khởi tạo kết nối Supabase từ cấu hình lưu trong trình duyệt |
| `services/mockDatabase.ts` | Toàn bộ nghiệp vụ dữ liệu (có chế độ dự phòng lưu máy cục bộ) |
| `components/CloudSyncModal.tsx` | Màn hình cấu hình kết nối Supabase |
| `public/service-worker.js` | Thông báo nền (đọc Supabase REST định kỳ) |
| `vercel.json` | Cấu hình triển khai Vercel |

Khi chưa cấu hình Supabase, phần mềm vẫn chạy được và lưu tạm trên
trình duyệt (localStorage).
