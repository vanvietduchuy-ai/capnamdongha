/**
 * KẾT NỐI SUPABASE
 * Cấu hình (URL + anon key) lưu trong trình duyệt nên đổi là có hiệu lực ngay,
 * không cần build lại. Biến `supabase` là proxy: các màn hình cũ
 * (Sơ đồ bảo vệ – MapDuty...) import và dùng như bình thường.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const CLOUD_CONFIG_KEY = 'cloudConfig';
const LEGACY_CONFIG_KEY = 'supabaseConfig';

export interface CloudConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

export const readStoredConfig = (): CloudConfig | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY) || localStorage.getItem(LEGACY_CONFIG_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p.supabaseUrl || !p.supabaseKey) return null;
    return { supabaseUrl: p.supabaseUrl, supabaseKey: p.supabaseKey };
  } catch {
    return null;
  }
};

export const saveStoredConfig = (config: CloudConfig) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config));
  localStorage.removeItem(LEGACY_CONFIG_KEY);
};

export const clearStoredConfig = () => {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(CLOUD_CONFIG_KEY);
  localStorage.removeItem(LEGACY_CONFIG_KEY);
};

export const buildClient = (config: CloudConfig): SupabaseClient =>
  createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 5 } }
  });

let client: SupabaseClient | null = null;
let clientKey = '';

/** Lấy client hiện tại, tự dựng lại khi cấu hình thay đổi */
export const getClient = (): SupabaseClient => {
  const cfg = readStoredConfig();
  const key = cfg ? cfg.supabaseUrl + '|' + cfg.supabaseKey : 'none';

  if (!client || clientKey !== key) {
    clientKey = key;
    client = buildClient(cfg || {
      // Chưa cấu hình: dựng client rỗng để ứng dụng không vỡ,
      // các lệnh gọi sẽ trả về lỗi thay vì làm sập màn hình.
      supabaseUrl: 'https://chua-cau-hinh.supabase.co',
      supabaseKey: 'chua-cau-hinh'
    });
  }
  return client;
};

export const setClientConfig = (config: CloudConfig) => {
  saveStoredConfig(config);
  clientKey = '';
  client = null;
  return getClient();
};

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getClient() as any;
    const value = c[prop];
    return typeof value === 'function' ? value.bind(c) : value;
  }
});

export default supabase;

/* ===================== PHIÊN ĐĂNG NHẬP MÁY CHỦ ===================== */
// Mã phiên do hàm app_login cấp. Mọi thao tác ghi quan trọng (cán bộ, điểm danh,
// lý do vắng) phải gửi kèm mã này; máy chủ tự xác định người thực hiện.
const TOKEN_KEY = 'sessionToken';

export const getSessionToken = (): string => {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};

export const setSessionToken = (token: string) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* bỏ qua */ }
};

export const SESSION_EXPIRED_EVENT = 'app-session-expired';

/** Gọi hàm máy chủ, chuẩn hoá kết quả { ok, message, ...data } */
export const callRpc = async <T = any>(fn: string, params: Record<string, any>): Promise<T & { ok: boolean; message?: string; code?: string }> => {
  try {
    const { data, error } = await getClient().rpc(fn, params);
    if (error) {
      const code = (error as any).code;
      const notInstalled = code === 'PGRST202' || code === '42883';
      return {
        ok: false,
        code,
        message: notInstalled
          ? 'Máy chủ chưa được cập nhật chức năng này. Quản trị viên cần chạy đủ các file SQL (01 → 06) trong thư mục supabase/.'
          : (error.message || 'Lỗi máy chủ')
      } as any;
    }
    const res = (data || {}) as any;
    if (res.code === 'SESSION_EXPIRED' && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return { ok: !!res.ok, ...res };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Không kết nối được máy chủ. Kiểm tra mạng.' } as any;
  }
};
