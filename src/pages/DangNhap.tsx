import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Lock, Mail, TriangleAlert } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { CHE_DO_THU, taiKhoanThu } from '../lib/supabase';
import { HopLoi, LogoBcd, Nut, cx } from '../components/ui';

export const TEN_PHAN_MEM = 'Hệ thống điều hành BCĐ 57';
type CheDo = 'dang_nhap' | 'quen' | 'da_gui' | 'dat';
const KHOA_EMAIL = 'bcd57-email';
const docEmail = () => { try { return localStorage.getItem(KHOA_EMAIL) ?? ''; } catch { return ''; } };
const ghiEmail = (e: string) => { try { localStorage.setItem(KHOA_EMAIL, e); } catch { /* bỏ qua */ } };

function OVao({ nhan, icon, phai, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { nhan: string; icon: ReactNode; phai?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-mo-2">
      {nhan}
      <span className="relative flex items-center">
        <span className="pointer-events-none absolute left-3.5 text-mo">{icon}</span>
        <input {...p} className="h-12 w-full rounded-xl border border-vien-2 bg-nen-2 pl-11 pr-12 text-[15px] font-normal text-den outline-none transition placeholder:text-[#9AA1AE] focus:border-do focus:bg-white focus:ring-4 focus:ring-do/10 focus-visible:outline-none" />
        {phai && <span className="absolute right-1.5">{phai}</span>}
      </span>
    </label>
  );
}

export default function DangNhap() {
  const { dangNhap, dangNhapThu, loi: loiHoSo, khoiPhuc, guiEmailKhoiPhuc, datMatKhau } = useAuth();
  const [cheDo, setCheDo] = useState<CheDo>(khoiPhuc ? 'dat' : 'dang_nhap');
  const [email, setEmail] = useState(docEmail);
  const [matKhau, setMatKhau] = useState('');
  const [matKhau2, setMatKhau2] = useState('');
  const [hien, setHien] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => { if (khoiPhuc) setCheDo('dat'); }, [khoiPhuc]);
  const doiCheDo = (c: CheDo) => { setCheDo(c); setLoi(null); setMatKhau(''); setMatKhau2(''); };
  const phim = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  const chay = async (f: () => Promise<void>) => {
    setDangChay(true); setLoi(null);
    try { await f(); } catch (x) { setLoi(x instanceof Error ? x.message : 'Có lỗi xảy ra, vui lòng thử lại.'); }
    finally { setDangChay(false); }
  };

  const gui = (e: FormEvent) => {
    e.preventDefault();
    if (cheDo === 'dang_nhap') void chay(async () => { await dangNhap(email, matKhau); ghiEmail(email.trim()); });
    if (cheDo === 'quen') void chay(async () => { await guiEmailKhoiPhuc(email); setCheDo('da_gui'); });
    if (cheDo === 'dat') {
      if (matKhau.length < 8 || !/[A-Za-z]/.test(matKhau) || !/\d/.test(matKhau)) { setLoi('Mật khẩu cần tối thiểu 8 ký tự, có cả chữ và số.'); return; }
      if (matKhau !== matKhau2) { setLoi('Hai lần nhập mật khẩu không khớp.'); return; }
      void chay(() => datMatKhau(matKhau));
    }
  };

  const nutMat = (
    <button type="button" onClick={() => setHien(!hien)} aria-label={hien ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-mo hover:bg-nen-3">
      {hien ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
    </button>
  );
  const dieuKien: [boolean, string][] = [[matKhau.length >= 8, 'Tối thiểu 8 ký tự'], [/[A-Za-z]/.test(matKhau) && /\d/.test(matKhau), 'Có cả chữ và số'], [!!matKhau && matKhau === matKhau2, 'Nhập lại khớp']];
  const loiHien = loi ?? (cheDo === 'dang_nhap' ? loiHoSo : null);

  const TIEU_DE: Record<CheDo, [string, string]> = {
    dang_nhap: ['Đăng nhập', ''],
    quen: ['Quên mật khẩu', 'Nhập email của tài khoản, hệ thống gửi liên kết đặt lại mật khẩu.'],
    da_gui: ['Kiểm tra email', ''],
    dat: ['Đặt mật khẩu mới', 'Mật khẩu dùng cho các lần đăng nhập sau.'],
  };

  return (
    <div className="grid min-h-screen bg-nen lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* ---------- Bảng thương hiệu: ảnh nền cờ Đảng, lớp phủ đỏ sẫm để chữ luôn đọc rõ ---------- */}
      <aside className="relative min-h-[200px] overflow-hidden bg-[#5A0709] text-white lg:min-h-screen">
        {/* Điện thoại: ảnh phủ kín dải tiêu đề. Máy tính: ảnh giữ đúng tỉ lệ ở phần trên, hoà dần vào nền đỏ sẫm */}
        <img src="/nen-dang-nhap.jpg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover lg:bottom-auto lg:h-auto lg:object-top" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#2a0204]/20 via-[#4a0507]/65 to-[#2a0204]/95 lg:hidden" />
        <div aria-hidden className="absolute inset-x-0 top-0 hidden aspect-[848/530] bg-gradient-to-b from-transparent from-35% via-[#5A0709]/70 via-75% to-[#5A0709] lg:block" />
        <div aria-hidden className="absolute inset-0 hidden bg-gradient-to-t from-[#3A0406] via-transparent via-40% to-transparent lg:block" />

        <div className="relative flex h-full flex-col justify-between gap-8 px-5 py-6 sm:px-10 lg:px-14 lg:py-12">
          <div className="flex items-center gap-3.5 self-start rounded-2xl bg-black/35 py-2 pl-2 pr-5 ring-1 ring-white/10 backdrop-blur-md">
            <LogoBcd className="h-11 w-11 rounded-xl ring-2 ring-vang/50 lg:h-14 lg:w-14 lg:rounded-2xl" />
            <div className="flex flex-col">
              <span className="text-[15px] font-bold lg:text-base">Ban Chỉ đạo 57</span>
              <span className="text-xs text-white/80 lg:text-[13px]">Phường Nam Đông Hà · tỉnh Quảng Trị</span>
            </div>
          </div>

          <div className="flex max-w-xl flex-col gap-3 [text-shadow:0_2px_16px_rgba(0,0,0,.5)] lg:gap-4">
            <span className="hidden self-start rounded-full border border-vang-nhat/40 sm:inline-block bg-black/25 px-3 py-1 text-[10.5px] font-semibold tracking-wider text-vang-nhat backdrop-blur-sm lg:text-[11.5px]">KHCN · ĐỔI MỚI SÁNG TẠO · CHUYỂN ĐỔI SỐ · ĐỀ ÁN 06</span>
            <span className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-vang lg:text-[15px]">{TEN_PHAN_MEM}</span>
            <h2 className="m-0 text-[26px] font-extrabold leading-[1.15] tracking-tight lg:text-[42px]">Điều hành Ban Chỉ đạo<br />trên một màn hình.</h2>
            <p className="m-0 max-w-md text-[13.5px] leading-relaxed text-white/85 lg:text-[15px]">Theo dõi báo cáo của các đơn vị, tiến độ nhiệm vụ và chỉ tiêu Đề án 06 — cập nhật tức thời cho Cơ quan Thường trực, lãnh đạo và đơn vị.</p>
          </div>
        </div>
      </aside>

      {/* ---------- Biểu mẫu ---------- */}
      <main className="flex items-start justify-center px-4 pb-10 pt-8 sm:items-center sm:px-8 lg:py-12">
        <div className="flex w-full max-w-[420px] flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            {(cheDo === 'quen' || cheDo === 'da_gui') && (
              <button type="button" onClick={() => doiCheDo('dang_nhap')} className="-ml-2 mb-2 flex min-h-10 items-center gap-1.5 self-start rounded-lg px-2 text-[13px] font-semibold text-mo hover:bg-nen-3">
                <ArrowLeft className="h-4 w-4" />Quay lại đăng nhập
              </button>
            )}
            <h1 className="m-0 text-[28px] font-extrabold tracking-tight">{TIEU_DE[cheDo][0]}</h1>
            {TIEU_DE[cheDo][1] && <p className="m-0 text-[14.5px] text-mo">{TIEU_DE[cheDo][1]}</p>}
          </div>

          {CHE_DO_THU && !import.meta.env.VITE_THU_FORM && cheDo === 'dang_nhap' ? (
            <div className="flex flex-col gap-3 rounded-3xl border border-vien bg-white p-5 shadow-sm">
              {loiHien && <HopLoi loi={loiHien} />}
              <div className="flex items-center gap-2 rounded-xl bg-cam-nhat px-3 py-2 text-[13px] text-cam-dam"><TriangleAlert className="h-4 w-4" />Chế độ thử nghiệm — chọn tài khoản mẫu</div>
              {Object.entries(taiKhoanThu()).map(([ten, token]) => (
                <Nut key={ten} type="button" kieu="phu" className="justify-start" onClick={() => dangNhapThu(token)}>{ten}</Nut>
              ))}
            </div>
          ) : cheDo === 'da_gui' ? (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-vien bg-white p-7 text-center shadow-sm">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-xanh-nhat text-xanh"><Mail className="h-6 w-6" /></span>
              <p className="m-0 text-[15px]">Nếu <b>{email.trim()}</b> là email của một tài khoản, hệ thống đã gửi liên kết đặt lại mật khẩu.</p>
              <p className="m-0 text-[13px] text-mo">Mở email trên thiết bị này và bấm vào liên kết. Không thấy thư: kiểm tra mục Spam hoặc liên hệ Tổ Tổng hợp để được cấp lại mật khẩu.</p>
            </div>
          ) : (
            <form onSubmit={gui} noValidate={false} className="flex flex-col gap-4 rounded-3xl border border-vien bg-white p-5 shadow-sm sm:p-7">
              {loiHien && <HopLoi loi={loiHien} />}
              {cheDo !== 'dat' && (
                <OVao nhan="Email" icon={<Mail className="h-[18px] w-[18px]" />} type="email" inputMode="email" autoComplete="username" required
                  placeholder="ten@donvi.gov.vn" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={!email} />
              )}
              {cheDo === 'dang_nhap' && (
                <div className="flex flex-col gap-1.5">
                  <OVao nhan="Mật khẩu" icon={<Lock className="h-[18px] w-[18px]" />} type={hien ? 'text' : 'password'} autoComplete="current-password" required
                    value={matKhau} onChange={(e) => setMatKhau(e.target.value)} onKeyUp={phim} onKeyDown={phim} autoFocus={!!email} phai={nutMat} />
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <span className={cx('flex items-center gap-1 text-xs font-semibold text-cam-dam', !capsLock && 'invisible')}><TriangleAlert className="h-3.5 w-3.5" />Đang bật Caps Lock</span>
                    <button type="button" onClick={() => doiCheDo('quen')} className="rounded-md px-1 text-[13px] font-semibold text-[#A4161A] hover:underline">Quên mật khẩu?</button>
                  </div>
                </div>
              )}
              {cheDo === 'dat' && (
                <>
                  <OVao nhan="Mật khẩu mới" icon={<KeyRound className="h-[18px] w-[18px]" />} type={hien ? 'text' : 'password'} autoComplete="new-password" required autoFocus
                    value={matKhau} onChange={(e) => setMatKhau(e.target.value)} onKeyUp={phim} phai={nutMat} />
                  <OVao nhan="Nhập lại mật khẩu mới" icon={<KeyRound className="h-[18px] w-[18px]" />} type={hien ? 'text' : 'password'} autoComplete="new-password" required
                    value={matKhau2} onChange={(e) => setMatKhau2(e.target.value)} onKeyUp={phim} />
                  <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
                    {dieuKien.map(([dat, t]) => <li key={t} className={cx('flex items-center gap-1', dat ? 'font-semibold text-[#166534]' : 'text-mo')}><CheckCircle2 className="h-3.5 w-3.5" />{t}</li>)}
                  </ul>
                  {capsLock && <span className="flex items-center gap-1 text-xs font-semibold text-cam-dam"><TriangleAlert className="h-3.5 w-3.5" />Đang bật Caps Lock</span>}
                </>
              )}
              <Nut kieu="do" type="submit" dangChay={dangChay} className="mt-1 h-12 text-[15px]">
                {cheDo === 'dang_nhap' ? 'Đăng nhập' : cheDo === 'quen' ? 'Gửi liên kết đặt lại' : 'Lưu mật khẩu mới'}
              </Nut>
            </form>
          )}

          <p className="m-0 text-center text-[13px] text-mo">Chưa có tài khoản: liên hệ Tổ Tổng hợp – Công an phường.</p>
        </div>
      </main>
    </div>
  );
}
