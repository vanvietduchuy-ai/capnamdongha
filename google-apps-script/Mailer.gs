/*************************************************************
 * DỊCH VỤ GỬI EMAIL CHO PHẦN MỀM ĐIỂM DANH HỘI NGHỊ
 * Công an phường Nam Đông Hà
 *
 * Chỉ làm MỘT việc: nhận yêu cầu từ máy chủ Supabase và gửi email
 * (mã OTP đăng ký / quên mật khẩu, thông báo giao việc).
 * Không lưu bất kỳ dữ liệu nào.
 *
 * Triển khai:
 *  1. script.google.com → Dự án mới → dán toàn bộ file này → Lưu.
 *  2. Đổi MAILER_KEY bên dưới thành một chuỗi bí mật (ít nhất 20 ký tự).
 *  3. Triển khai → Tuỳ chọn triển khai mới → Ứng dụng web:
 *       Thực thi với tư cách: Tôi — Người có quyền truy cập: Bất kỳ ai.
 *  4. Chép URL .../exec và MAILER_KEY vào bảng app_settings của Supabase
 *     (xem HUONG_DAN_SUPABASE.md, mục 2).
 *************************************************************/

// BẮT BUỘC đổi: chuỗi bí mật, trùng với app_settings.mailer_key trên Supabase
var MAILER_KEY = 'DOI-CHUOI-BI-MAT-NAY-TRUOC-KHI-TRIEN-KHAI';

// Tên người gửi hiển thị trong hộp thư
var SENDER_NAME = 'Công an phường Nam Đông Hà';

// Giới hạn chống lạm dụng: tối đa số thư gửi tới cùng một địa chỉ trong 1 giờ
var MAX_PER_ADDRESS_PER_HOUR = 10;

function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, message: 'Dữ liệu không hợp lệ' }); }

  if (!MAILER_KEY || MAILER_KEY.indexOf('DOI-CHUOI') === 0) {
    return out_({ ok: false, message: 'Chưa đặt MAILER_KEY trong Mailer.gs' });
  }
  if (String(p.apiKey || '') !== MAILER_KEY) return out_({ ok: false, message: 'Sai khoá' });
  if (p.action !== 'sendMail') return out_({ ok: false, message: 'Hành động không hỗ trợ' });

  var to = String(p.to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return out_({ ok: false, message: 'Email không hợp lệ' });

  // Chống gửi dồn dập tới 1 địa chỉ
  var cache = CacheService.getScriptCache();
  var key = 'cnt_' + to.toLowerCase();
  var count = Number(cache.get(key) || 0);
  if (count >= MAX_PER_ADDRESS_PER_HOUR) return out_({ ok: false, message: 'Vượt giới hạn gửi' });
  cache.put(key, String(count + 1), 3600);

  var subject = String(p.subject || 'Thông báo từ hệ thống').slice(0, 200);
  var body = String(p.body || '');
  var isHtml = /<\s*[a-z][^>]*>/i.test(body);

  try {
    var msg = { to: to, subject: subject, name: SENDER_NAME };
    if (isHtml) {
      msg.htmlBody = body;
      msg.body = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
      msg.body = body;
    }
    MailApp.sendEmail(msg);
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, message: String(err) });
  }
}

function doGet() {
  return out_({ ok: true, service: 'mailer', remainingDailyQuota: MailApp.getRemainingDailyQuota() });
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Chạy tay 1 lần trong trình soạn thảo để cấp quyền gửi mail và thử gửi cho chính mình
function guiThu() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Thử dịch vụ gửi mail', 'Dịch vụ gửi mail hoạt động.');
}
