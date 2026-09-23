// --- CẤU HÌNH TELEGRAM BOT ---
// 1. Vào Telegram, chat với @BotFather để tạo bot mới.
// 2. Lấy HTTP API TOKEN dán vào biến BOT_TOKEN dưới đây.
// Ví dụ: '123456789:AAH-x-xxxxxxxxxxxxxxxxxxxx'
const BOT_TOKEN = '7629381766:AAHgYtX3w4QW_i_J8yWjFp9Jz1Gq1wXq1wX'; // <-- THAY TOKEN CỦA BẠN VÀO ĐÂY (Đây là token demo, hãy thay bằng token thật)

export const TelegramService = {
  /**
   * Gửi tin nhắn thông báo đến Telegram
   */
  sendMessage: async (chatId: string, message: string) => {
    if (!chatId || !BOT_TOKEN || BOT_TOKEN.includes('THAY_TOKEN')) {
      console.log('Telegram not configured or missing ChatID');
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
      const payload = {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML' // Cho phép in đậm, in nghiêng
      };

      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
    }
  },

  /**
   * Tạo nội dung tin nhắn cho nhiệm vụ mới
   */
  formatNewTaskMessage: (task: any, creatorName: string) => {
    const icon = task.priority === 'URGENT' ? '🚨' : task.priority === 'HIGH' ? '🔴' : '🔵';
    return `
${icon} <b>ĐỒNG CHÍ CÓ NHIỆM VỤ MỚI</b>

<b>Tiêu đề:</b> ${task.title}
<b>Nội dung:</b> ${task.description}
<b>Hạn xử lý:</b> ${new Date(task.dueDate).toLocaleDateString('vi-VN')}
<b>Người giao:</b> ${creatorName}
${task.isRegularDuty ? '<i>(Công tác thường xuyên)</i>' : ''}

👉 <i>Vui lòng truy cập hệ thống để tiếp nhận.</i>
    `.trim();
  }
};