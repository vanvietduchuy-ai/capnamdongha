// Dịch vụ gửi Email thông báo
// Email thông báo được gửi qua dịch vụ gửi mail đã khai báo trong Supabase
// (bảng app_settings.mailer_url — xem file supabase/02_auth_otp.sql).
import { supabase, getSessionToken } from '../lib/supabase';

export const EmailService = {
  /**
   * Tạo nội dung email thông báo nhiệm vụ mới
   */
  generateNewTaskContent: (task: any, creatorName: string) => {
    const subject = `[CAP Nam Đông Hà] Nhiệm vụ mới: ${task.title}`;
    const body = `
Kính gửi đồng chí,

Đồng chí vừa được giao nhiệm vụ mới trên hệ thống Điều hành Tác nghiệp.

THÔNG TIN NHIỆM VỤ:
--------------------
Tiêu đề: ${task.title}
Số hiệu văn bản: ${task.dispatchNumber || 'Không có'}
Người giao: ${creatorName}
Hạn xử lý: ${task.isRegularDuty ? 'Thường xuyên' : new Date(task.dueDate).toLocaleDateString('vi-VN')}
Độ ưu tiên: ${task.priority === 'URGENT' ? 'HỎA TỐC' : task.priority === 'HIGH' ? 'Cao' : 'Bình thường'}

NỘI DUNG CHỈ ĐẠO:
${task.description}

Đề nghị đồng chí truy cập hệ thống để tiếp nhận và xử lý.
Trân trọng.
    `.trim();

    return { subject, body };
  },

  /**
   * Mở trình gửi email mặc định (Outlook/Mail App) của thiết bị
   * Đây là cách an toàn nhất nếu không có Backend server.
   */
  openMailClient: (email: string, subject: string, body: string) => {
    if (!email) return;
    const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, '_blank');
  },

  /**
   * Giả lập gửi email tự động (Dùng cho Demo hoặc tích hợp EmailJS sau này)
   */
  sendNotification: async (email: string, task: any, creatorName: string) => {
    if (!email || !email.includes('@')) {
        console.log('Invalid email address:', email);
        return;
    }

    const { subject, body } = EmailService.generateNewTaskContent(task, creatorName);

    // --- GỬI QUA DỊCH VỤ ĐÃ KHAI BÁO TRONG SUPABASE ---
    try {
        const { data, error } = await supabase.rpc('app_send_mail', {
            p_token: getSessionToken(),
            p_to: email,
            p_subject: subject,
            p_body: body
        });

        if (error) {
            console.error('Gửi email thất bại:', error.message);
            return false;
        }
        return !!data?.ok;
    } catch (e) {
        console.error('Gửi email thất bại:', e);
        return false;
    }
  }
};