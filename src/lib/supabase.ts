import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// CHẾ ĐỘ THỬ (chỉ dùng khi phát triển, không bật trên bản triển khai):
// VITE_CHE_DO_THU=1 và VITE_TAI_KHOAN_THU='{"Quản trị":"<jwt>","Tổ CSKV":"<jwt>"}'
// -> bỏ qua Supabase Auth, gọi thẳng PostgREST bằng JWT có sẵn.
export const CHE_DO_THU = import.meta.env.VITE_CHE_DO_THU === '1';

const url = import.meta.env.VITE_SUPABASE_URL || (CHE_DO_THU ? window.location.origin : '');
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'che-do-thu';

if (!url) {
  // Hiện lỗi rõ ràng thay vì màn hình trắng khi quên cấu hình
  throw new Error('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong tệp .env');
}

const KHOA_THU = 'bcd57-tai-khoan-thu';

export function taiKhoanThu(): Record<string, string> {
  try { return JSON.parse(import.meta.env.VITE_TAI_KHOAN_THU || '{}'); } catch { return {}; }
}
let tokenBoNho: string | null = null;              // dự phòng khi trình duyệt chặn localStorage (khung nhúng)
export function tokenThu(): string | null {
  try { return localStorage.getItem(KHOA_THU) ?? tokenBoNho; } catch { return tokenBoNho; }
}
export function datTokenThu(t: string | null) {
  tokenBoNho = t;
  try { if (t) localStorage.setItem(KHOA_THU, t); else localStorage.removeItem(KHOA_THU); } catch { /* bỏ qua */ }
}

export const supabase: SupabaseClient = CHE_DO_THU
  ? createClient(url, anonKey, { accessToken: async () => tokenThu() ?? anonKey })
  : createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

export const URL_SUPABASE = url;
export const KHOA_ANON = anonKey;

// Gọi Edge Function kèm JWT người dùng
export async function goiChucNang<T = unknown>(ten: string, body: BodyInit | object, laForm = false): Promise<T> {
  const token = CHE_DO_THU ? tokenThu() : (await supabase.auth.getSession()).data.session?.access_token;
  const res = await fetch(`${url}/functions/v1/${ten}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token ?? anonKey}`,
      apikey: anonKey,
      ...(laForm ? {} : { 'Content-Type': 'application/json' }),
    },
    body: laForm ? (body as BodyInit) : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && 'loi' in data) ? String((data as { loi: string }).loi) : `Lỗi ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

// Rút gọn lỗi Supabase cho người dùng
export function loiDe(e: unknown): string {
  if (!e) return 'Có lỗi xảy ra';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  const o = e as { message?: string; details?: string };
  return o.message || o.details || 'Có lỗi xảy ra';
}
