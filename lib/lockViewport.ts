/**
 * Cố định màn hình trên điện thoại (nhất là iPhone/Safari, vốn bỏ qua user-scalable=no):
 * - chặn phóng to bằng 2 ngón;
 * - không cho trang bị trượt ngang (nếu lỡ lệch thì tự kéo về sát lề trái).
 */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Safari: cử chỉ phóng to
  (['gesturestart', 'gesturechange', 'gestureend'] as const).forEach(ev =>
    document.addEventListener(ev, e => e.preventDefault(), { passive: false }));

  // Chạm 2 ngón kéo/phóng to
  document.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  // Trang không bao giờ lệch ngang
  const fixX = () => { if (window.scrollX !== 0) window.scrollTo(0, window.scrollY); };
  window.addEventListener('scroll', fixX, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(fixX, 300));
  // Bàn phím ảo đóng lại trên iPhone đôi khi để trang lệch: kéo về
  document.addEventListener('focusout', () => setTimeout(fixX, 50));
}

export {};
