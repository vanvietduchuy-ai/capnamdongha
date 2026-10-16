/**
 * NHẬN DIỆN THIẾT BỊ KHI ĐIỂM DANH
 * - deviceId: mã ngẫu nhiên lưu trong trình duyệt → mỗi trình duyệt một mã.
 * - fingerprint: "dấu vân tay phần cứng" — các thông số GIỐNG NHAU giữa các trình duyệt
 *   trên cùng một máy (màn hình, chip đồ hoạ, số nhân CPU, bộ nhớ, múi giờ...).
 *   Máy chủ dùng để CẢNH BÁO khi 1 máy điểm danh cho nhiều tài khoản bằng nhiều trình duyệt.
 *   Không dùng để chặn vì nhiều máy cùng đời có thể trùng dấu vân tay.
 */

const DEVICE_KEY = 'attendance_device_id';

export const getDeviceId = (): string => {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      const rnd = (crypto as any)?.randomUUID
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
        : Math.random().toString(36).slice(2, 11) + Math.random().toString(36).slice(2, 9);
      id = `device_${Date.now().toString(36)}_${rnd}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
};

/** Tên chip đồ hoạ (giống nhau giữa Chrome/Cốc Cốc/Edge trên cùng máy; Safari che bớt) */
const gpuName = (): string => {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'nogl';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    // Bỏ phần phiên bản trình điều khiển để các trình duyệt khác nhau cho cùng kết quả
    return String(r || '').replace(/\(.*?\)/g, '').replace(/ANGLE|Direct3D.*|OpenGL.*|vs_.*|ps_.*/gi, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60);
  } catch {
    return 'nogl';
  }
};

const hash = (s: string): string => {
  // FNV-1a 32 bit, 2 vòng để giảm trùng
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
};

export const getFingerprint = (): string => {
  try {
    const w = Math.max(screen.width, screen.height);
    const h = Math.min(screen.width, screen.height);
    const nav: any = navigator;
    const parts = [
      `${w}x${h}`,
      Math.round((window.devicePixelRatio || 1) * 100),
      screen.colorDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      nav.hardwareConcurrency || '?',
      nav.maxTouchPoints || 0,
      /iPhone|iPad|iPod/i.test(nav.userAgent) ? 'ios' : /Android/i.test(nav.userAgent) ? 'android' : (nav.platform || '?'),
      gpuName()
    ];
    return 'fp2_' + hash(parts.join('|'));
  } catch {
    return '';
  }
};
