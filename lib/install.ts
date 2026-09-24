/**
 * HỖ TRỢ CÀI ỨNG DỤNG LÊN MÀN HÌNH CHÍNH
 * - Android/Chrome/Edge/Samsung: bắt sự kiện `beforeinstallprompt` để có nút "Cài đặt" một chạm.
 * - iPhone/iPad: Apple không cho trang web tự cài → hướng dẫn đúng theo phiên bản iOS và trình duyệt.
 * - Trình duyệt trong Zalo/Facebook/Messenger…: không cài được → hướng dẫn mở bằng Chrome/Safari.
 * Tệp này được nạp ngay khi khởi động (index.tsx) để không lỡ sự kiện của trình duyệt.
 */

export type InstallPlatform = 'android' | 'ios' | 'desktop';
export type InApp = 'zalo' | 'facebook' | 'messenger' | 'instagram' | 'tiktok' | 'line' | 'khac' | null;

export interface InstallEnv {
  platform: InstallPlatform;
  standalone: boolean;       // đang chạy như ứng dụng đã cài
  inApp: InApp;              // đang mở trong trình duyệt của ứng dụng khác
  iosVersion: number;        // 0 nếu không phải iOS
  iosBrowser: 'safari' | 'chrome' | 'firefox' | 'edge' | 'khac' | null;
  androidBrowser: 'chrome' | 'samsung' | 'edge' | 'firefox' | 'khac' | null;
  canPrompt: boolean;        // có nút cài một chạm
  installedHere: boolean;    // vừa cài xong trong phiên này
}

const LS_DISMISS = 'install_hint_dismissed_at';
const LS_INSTALLED = 'app_installed_at';

let deferred: any = null;
let installedHere = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => { try { fn(); } catch { /* bỏ qua */ } });

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();          // tự hiện nút của phần mềm thay cho dải mặc định của trình duyệt
    deferred = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedHere = true;
    try { localStorage.setItem(LS_INSTALLED, String(Date.now())); } catch { /* bỏ qua */ }
    emit();
  });
  try {
    window.matchMedia('(display-mode: standalone)').addEventListener?.('change', emit);
  } catch { /* bỏ qua */ }
}

export const subscribeInstall = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export const detectInstallEnv = (): InstallEnv => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const nav: any = typeof navigator !== 'undefined' ? navigator : {};
  // iPadOS 13+ tự nhận là máy Mac → nhận diện bằng màn hình cảm ứng
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const standalone = (typeof window !== 'undefined' && (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches)) || nav.standalone === true;

  let inApp: InApp = null;
  if (/Zalo/i.test(ua)) inApp = 'zalo';
  else if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) inApp = /Messenger|FBAN\/Messenger|MessengerForiOS/i.test(ua) ? 'messenger' : 'facebook';
  else if (/Instagram/i.test(ua)) inApp = 'instagram';
  else if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) inApp = 'tiktok';
  else if (/\bLine\//i.test(ua)) inApp = 'line';
  else if (isAndroid && /; wv\)/.test(ua)) inApp = 'khac';               // WebView Android không rõ ứng dụng
  else if (isIOS && !/Safari\//i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua)) inApp = 'khac';

  let iosVersion = 0;
  if (isIOS) {
    // Từ iOS 26, Safari "đóng băng" số iOS trong UA ở 18.x → ưu tiên số phiên bản Safari (Version/26 = iOS 26)
    const v = ua.match(/Version\/(\d+)/i);
    const os = ua.match(/OS (\d+)[_.]/i);
    iosVersion = Math.max(v ? parseInt(v[1], 10) : 0, os ? parseInt(os[1], 10) : 0);
  }
  const iosBrowser = !isIOS ? null
    : /CriOS/i.test(ua) ? 'chrome' : /FxiOS/i.test(ua) ? 'firefox' : /EdgiOS/i.test(ua) ? 'edge'
    : /Safari\//i.test(ua) ? 'safari' : 'khac';
  const androidBrowser = !isAndroid ? null
    : /SamsungBrowser/i.test(ua) ? 'samsung' : /EdgA/i.test(ua) ? 'edge' : /Firefox/i.test(ua) ? 'firefox'
    : /Chrome\//i.test(ua) ? 'chrome' : 'khac';

  return {
    platform: isIOS ? 'ios' : isAndroid ? 'android' : 'desktop',
    standalone: !!standalone,
    inApp,
    iosVersion,
    iosBrowser,
    androidBrowser,
    canPrompt: !!deferred,
    installedHere
  };
};

/** Mở hộp cài đặt của trình duyệt. Trả về 'accepted' | 'dismissed' | 'unavailable' */
export const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
  if (!deferred) return 'unavailable';
  const ev = deferred;
  deferred = null;                 // mỗi sự kiện chỉ dùng được một lần
  emit();
  try {
    ev.prompt();
    const r = await ev.userChoice;
    if (r?.outcome === 'accepted') {
      installedHere = true;
      try { localStorage.setItem(LS_INSTALLED, String(Date.now())); } catch { /* bỏ qua */ }
      emit();
      return 'accepted';
    }
    return 'dismissed';
  } catch {
    return 'unavailable';
  }
};

/** Đường dẫn mở trang hiện tại bằng Chrome (dùng khi đang ở trong trình duyệt của Zalo/Facebook trên Android) */
export const chromeIntentUrl = (url: string = typeof location !== 'undefined' ? location.href : '/') => {
  try {
    const u = new URL(url);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
  } catch { return url; }
};

/** Gợi ý cài: ẩn 7 ngày khi người dùng bấm "Để sau" */
export const hintDismissedRecently = (days = 7) => {
  try {
    const t = Number(localStorage.getItem(LS_DISMISS) || 0);
    return t > 0 && Date.now() - t < days * 86400000;
  } catch { return false; }
};
export const dismissHint = () => { try { localStorage.setItem(LS_DISMISS, String(Date.now())); } catch { /* bỏ qua */ } };
export const wasInstalledBefore = () => { try { return !!localStorage.getItem(LS_INSTALLED); } catch { return false; } };

/** Trang cài đặt công khai (in mã QR dán ở trụ sở, gửi đường link) */
export const INSTALL_PATH = '/cai-dat';
export const installPageUrl = () => (typeof location !== 'undefined' ? location.origin : '') + INSTALL_PATH;
