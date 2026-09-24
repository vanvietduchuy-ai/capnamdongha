/**
 * MÃ QR ĐỘNG CÓ CHỮ KÝ
 * Mã cán bộ : "<mã hội nghị>|<khung 3 giây>|<chữ ký>"
 * Mã khách  : "<trang web>/?guest_session=<mã hội nghị>&s=<khung>&k=<chữ ký>[&c=<cấu hình>]"
 * Chữ ký    = 12 ký tự đầu của HMAC-SHA256(khoá hội nghị, "<mã hội nghị>|<khung>")
 * Máy chủ (hàm qr_valid trong 06_ma_qr_dong.sql) tính lại đúng công thức này để đối chiếu.
 */

const enc = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

const importKey = (secret: string) => {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    keyCache.set(secret, k);
  }
  return k;
};

export const signSlot = async (secret: string, sessionId: string, slot: number): Promise<string> => {
  const sig = await crypto.subtle.sign('HMAC', await importKey(secret), enc.encode(`${sessionId}|${slot}`));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
};

export const officerPayload = (sessionId: string, slot: number, code: string) => `${sessionId}|${slot}|${code}`;

export const guestUrl = (sessionId: string, slot: number, code: string) => {
  let c = '';
  try {
    const raw = localStorage.getItem('cloudConfig');
    if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg.supabaseUrl && cfg.supabaseKey) c = btoa(unescape(encodeURIComponent(JSON.stringify({ u: cfg.supabaseUrl, k: cfg.supabaseKey }))));
    }
  } catch { /* bỏ qua */ }
  const base = `${window.location.origin}/?guest_session=${encodeURIComponent(sessionId)}&s=${slot}&k=${code}`;
  return c ? `${base}&c=${encodeURIComponent(c)}` : base;
};

/** Đọc nội dung mã cán bộ quét được */
export const parseOfficerQr = (text: string): { sessionId: string; slot: number; code: string } | null => {
  const parts = (text || '').trim().split('|');
  if (parts.length !== 3 || !parts[0] || !/^\d{1,15}$/.test(parts[1]) || !/^[0-9a-f]{12}$/i.test(parts[2])) return null;
  return { sessionId: parts[0], slot: Number(parts[1]), code: parts[2] };
};
