import type React from 'react';

/**
 * Đóng hộp thoại khi bấm vào nền mờ — CHỈ khi cả lúc nhấn và lúc nhả đều ở trên nền.
 * Tránh lỗi: nhấn trong hộp thoại (bôi đen chữ, kéo thanh trượt, kéo chọn ô) rồi
 * nhả chuột ra ngoài → trình duyệt phát sự kiện click lên nền → hộp thoại tự tắt.
 *
 * Dùng: <div className="fixed inset-0 ..." {...backdropClose(onClose)}>
 */
const pressedOnBackdrop = new WeakSet<EventTarget>();

export const backdropClose = (onClose: () => void) => ({
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) pressedOnBackdrop.add(e.currentTarget);
    else pressedOnBackdrop.delete(e.currentTarget);
  },
  onClick: (e: React.MouseEvent<HTMLElement>) => {
    const ok = e.target === e.currentTarget && pressedOnBackdrop.has(e.currentTarget);
    pressedOnBackdrop.delete(e.currentTarget);
    if (ok) onClose();
  },
});
