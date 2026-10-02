import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CHE_DO_THU, datTokenThu, supabase, taiKhoanThu, tokenThu } from './supabase';

export type VaiTro = 'quan_tri' | 'lanh_dao' | 'don_vi';
export type HoSo = {
  id: string; ho_ten: string; chuc_vu: string | null; email: string | null; vai_tro: VaiTro;
  don_vi_id: string | null; don_vi: { id: string; ma: string; ten: string } | null;
  dau_moi: string[];                                  // lĩnh vực đơn vị làm đầu mối (nq57, chuyen_doi_so, de_an_06…)
};

type Ctx = {
  dangTai: boolean;
  hoSo: HoSo | null;
  loi: string | null;
  dangNhap: (email: string, matKhau: string) => Promise<void>;
  dangNhapThu: (token: string) => Promise<void>;
  dangXuat: () => Promise<void>;
  khoiPhuc: boolean;                                  // vào từ liên kết "quên mật khẩu" trong email
  guiEmailKhoiPhuc: (email: string) => Promise<void>;
  datMatKhau: (matKhau: string) => Promise<void>;
};

// Đổi thông báo lỗi của Supabase Auth sang tiếng Việt
export function loiDangNhap(m: string): string {
  if (/Invalid login credentials/i.test(m)) return 'Sai email hoặc mật khẩu.';
  if (/Email not confirmed/i.test(m)) return 'Tài khoản chưa được kích hoạt. Liên hệ Tổ Tổng hợp – Công an phường.';
  if (/security purposes|rate limit|too many/i.test(m)) return 'Thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  if (/should be different/i.test(m)) return 'Mật khẩu mới phải khác mật khẩu cũ.';
  if (/at least|weak|short/i.test(m)) return 'Mật khẩu chưa đủ mạnh (tối thiểu 8 ký tự).';
  if (/expired|invalid.*(token|link)|otp/i.test(m)) return 'Liên kết đã hết hạn hoặc đã dùng. Hãy gửi lại yêu cầu quên mật khẩu.';
  return m;
}
const AuthCtx = createContext<Ctx | null>(null);

function uidTuJwt(t: string): string | null {
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub ?? null; } catch { return null; }
}

async function taiHoSo(uid: string): Promise<HoSo | null> {
  const { data, error } = await supabase
    .from('nguoi_dung')
    .select('id, ho_ten, chuc_vu, email, vai_tro, don_vi_id, hoat_dong, don_vi(id, ma, ten)')
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.hoat_dong) return null;
  let dauMoi: string[] = [];
  if (data.vai_tro === 'don_vi' && data.don_vi_id) {
    const r = await supabase.from('dau_moi_linh_vuc').select('linh_vuc').eq('don_vi_id', data.don_vi_id);
    dauMoi = ((r.data ?? []) as { linh_vuc: string }[]).map((x) => x.linh_vuc);
  }
  return { ...(data as unknown as HoSo), dau_moi: dauMoi };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [dangTai, setDangTai] = useState(true);
  const [hoSo, setHoSo] = useState<HoSo | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [khoiPhuc, setKhoiPhuc] = useState(() => typeof window !== 'undefined' && /type=recovery/.test(window.location.hash));

  const nap = useCallback(async (uid: string | null) => {
    if (!uid) { setHoSo(null); setDangTai(false); return; }
    try {
      const h = await taiHoSo(uid);
      if (!h) setLoi('Tài khoản chưa được cấp quyền hoặc đã bị khoá. Liên hệ Tổ Tổng hợp – Công an phường.');
      setHoSo(h);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : 'Không tải được hồ sơ người dùng');
    } finally { setDangTai(false); }
  }, []);

  useEffect(() => {
    if (CHE_DO_THU) {
      const t = tokenThu();
      void nap(t ? uidTuJwt(t) : null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => nap(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => { if (e === 'PASSWORD_RECOVERY') setKhoiPhuc(true); void nap(s?.user.id ?? null); });
    return () => sub.subscription.unsubscribe();
  }, [nap]);

  const dangNhap = async (email: string, matKhau: string) => {
    setLoi(null);
    if (CHE_DO_THU) {                                   // chế độ thử (quay video): email -> tài khoản mẫu
      const t = taiKhoanThu()[email.trim().toLowerCase()];
      if (!t || matKhau.length < 6) throw new Error('Sai email hoặc mật khẩu.');
      await dangNhapThu(t); return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: matKhau });
    if (error) throw new Error(loiDangNhap(error.message));
  };
  const guiEmailKhoiPhuc = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` });
    if (error) throw new Error(loiDangNhap(error.message));
  };
  const datMatKhau = async (matKhau: string) => {
    const { error } = await supabase.auth.updateUser({ password: matKhau });
    if (error) throw new Error(loiDangNhap(error.message));
    setKhoiPhuc(false);
    window.history.replaceState(null, '', '/');
  };
  const dangNhapThu = async (token: string) => { datTokenThu(token); setDangTai(true); await nap(uidTuJwt(token)); };
  const dangXuat = async () => {
    if (CHE_DO_THU) datTokenThu(null); else await supabase.auth.signOut();
    setHoSo(null); setLoi(null);
  };

  return <AuthCtx.Provider value={{ dangTai, hoSo, loi, dangNhap, dangNhapThu, dangXuat, khoiPhuc, guiEmailKhoiPhuc, datMatKhau }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth ngoài AuthProvider');
  return c;
}

export const laQuanTri = (h: HoSo | null) => h?.vai_tro === 'quan_tri';
// Đầu mối lĩnh vực: Phòng VH-XH (NQ 57, KHCN, CĐS), Tổ CSKV (Đề án 06)
export const laDauMoi = (h: HoSo | null) => !!h?.dau_moi?.length;
export const dauMoiDa06 = (h: HoSo | null) => !!h?.dau_moi?.includes('de_an_06');
export const dauMoiCds = (h: HoSo | null) => !!h?.dau_moi?.some((x) => ['nq57', 'khcn_dmst', 'chuyen_doi_so'].includes(x));
export const tenLinhVucDauMoi = (h: HoSo | null) => [dauMoiCds(h) ? 'NQ 57, chuyển đổi số' : '', dauMoiDa06(h) ? 'Đề án 06' : ''].filter(Boolean).join(' · ');
export const laCQTTHoacLanhDao = (h: HoSo | null) => h?.vai_tro === 'quan_tri' || h?.vai_tro === 'lanh_dao';
