import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Archive, Bell, BarChart3, BookOpen, Radar, CheckSquare, FileText, Home, LayoutGrid, LogOut, Menu, SlidersHorizontal, Target, Users, ShieldCheck,
} from 'lucide-react';
import { dauMoiDa06, laDauMoi, useAuth, type HoSo, type VaiTro } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { ngayGio } from '../lib/dinhDang';
import { cx, LogoBcd } from './ui';

type Muc = { den: string; ten: string; icon: ReactNode; nhom?: string };

function menu(h: HoSo): Muc[] {
  const vt: VaiTro = h.vai_tro;
  const i = (C: typeof Home) => <C className="h-5 w-5" strokeWidth={1.8} />;
  if (vt === 'don_vi') return [
    { den: '/', ten: 'Trang chủ', icon: i(Home) },
    ...(laDauMoi(h) ? [{ den: '/theo-doi', ten: 'Theo dõi lĩnh vực', icon: i(Radar) }] : []),
    { den: '/viec-can-nop', ten: 'Việc cần nộp', icon: i(FileText) },
    ...(dauMoiDa06(h) ? [{ den: '/de-an-06', ten: 'Đề án 06', icon: i(BarChart3) }] : []),
    { den: '/nhiem-vu', ten: 'Nhiệm vụ', icon: i(CheckSquare) },
    { den: '/chi-tieu', ten: 'Chỉ tiêu của tôi', icon: i(Target) },
    { den: '/kho-van-ban', ten: 'Văn bản', icon: i(Archive) },
    { den: '/so-cong-van', ten: 'Sổ công văn', icon: i(BookOpen) },
  ];
  const chung: Muc[] = [
    { den: '/', ten: 'Tổng quan', icon: i(LayoutGrid), nhom: 'ĐIỀU HÀNH' },
    { den: '/nhiem-vu', ten: 'Nhiệm vụ BCĐ', icon: i(CheckSquare), nhom: 'ĐIỀU HÀNH' },
    { den: '/ky-bao-cao', ten: 'Kỳ báo cáo', icon: i(FileText), nhom: 'ĐIỀU HÀNH' },
    { den: '/de-an-06', ten: 'Đề án 06', icon: i(BarChart3), nhom: 'ĐIỀU HÀNH' },
    { den: '/hop', ten: 'Họp BCĐ', icon: i(Users), nhom: 'ĐIỀU HÀNH' },
  ];
  if (vt === 'lanh_dao') return [...chung,
    { den: '/phan-cong', ten: 'Duyệt phân công ĐA06', icon: i(ShieldCheck), nhom: 'ĐIỀU HÀNH' },
    { den: '/kho-van-ban', ten: 'Kho văn bản', icon: i(Archive), nhom: 'LƯU TRỮ' },
    { den: '/so-cong-van', ten: 'Sổ công văn', icon: i(BookOpen), nhom: 'LƯU TRỮ' },
  ];
  return [
    ...chung,
    { den: '/kho-van-ban', ten: 'Kho văn bản', icon: i(Archive), nhom: 'LƯU TRỮ & HỆ THỐNG' },
    { den: '/so-cong-van', ten: 'Sổ công văn', icon: i(BookOpen), nhom: 'LƯU TRỮ & HỆ THỐNG' },
    { den: '/quan-tri', ten: 'Quản trị', icon: i(SlidersHorizontal), nhom: 'LƯU TRỮ & HỆ THỐNG' },
  ];
}

const VAI_TRO: Record<VaiTro, string> = { quan_tri: 'Quản trị · Cơ quan Thường trực', lanh_dao: 'Lãnh đạo BCĐ', don_vi: 'Tài khoản đơn vị' };

function Logo({ toi = true }: { toi?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoBcd className="h-11 w-11" />
      <div className="flex flex-col">
        <span className={cx('text-[15px] font-bold', toi ? 'text-white' : 'text-den')}>BCĐ 57</span>
        <span className={cx('text-xs', toi ? 'text-[#E9CBC7]' : 'text-mo')}>Phường Nam Đông Hà</span>
      </div>
    </div>
  );
}

type ThongBao = { id: number; tieu_de: string; noi_dung: string | null; duong_dan: string | null; da_doc: boolean; luc: string };

function Chuong({ moSangPhai = false }: { moSangPhai?: boolean }) {
  const [ds, setDs] = useState<ThongBao[]>([]);
  const [mo, setMo] = useState(false);
  const nav = useNavigate();
  const tai = async () => {
    const { data } = await supabase.from('thong_bao').select('id, tieu_de, noi_dung, duong_dan, da_doc, luc').order('luc', { ascending: false }).limit(15);
    setDs((data as ThongBao[]) ?? []);
  };
  useEffect(() => { void tai(); const i = setInterval(tai, 60000); return () => clearInterval(i); }, []);
  const chuaDoc = ds.filter((x) => !x.da_doc).length;
  const bam = async (t: ThongBao) => {
    setMo(false);
    if (!t.da_doc) { await supabase.from('thong_bao').update({ da_doc: true }).eq('id', t.id); void tai(); }
    if (t.duong_dan) nav(t.duong_dan);
  };
  return (
    <div className="relative">
      <button onClick={() => setMo(!mo)} aria-label={`Thông báo${chuaDoc ? `, ${chuaDoc} chưa đọc` : ''}`}
        className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-vien bg-white text-den">
        <Bell className="h-5 w-5" strokeWidth={1.8} />
        {chuaDoc > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-do" />}
      </button>
      {mo && (
        <div className={cx('absolute z-50 mt-2 w-80 max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-vien bg-white text-den shadow-xl', moSangPhai ? 'left-0' : 'right-0')}>
          <div className="border-b border-vien px-4 py-3 text-sm font-bold">Thông báo</div>
          {ds.length === 0 && <div className="p-4 text-sm text-mo">Chưa có thông báo.</div>}
          {ds.map((t) => (
            <button key={t.id} onClick={() => bam(t)} className={cx('flex w-full flex-col gap-0.5 border-b border-[#F1EEE7] px-4 py-3 text-left hover:bg-nen-2', !t.da_doc && 'bg-xanh-nhat/40')}>
              <span className="text-[13px] font-semibold">{t.tieu_de}</span>
              {t.noi_dung && <span className="line-clamp-2 text-xs text-mo">{t.noi_dung}</span>}
              <span className="text-[11px] text-mo">{ngayGio(t.luc)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function KhungTrang() {
  const { hoSo, dangXuat } = useAuth();
  const location = useLocation();
  const [moThem, setMoThem] = useState(false);
  if (!hoSo) return null;
  const ds = menu(hoSo);
  const nhom = [...new Set(ds.map((m) => m.nhom ?? 'ĐƠN VỊ'))];
  const chuTat = hoSo.ho_ten.split(' ').slice(-2).map((x) => x[0]).join('').toUpperCase();

  const Link = ({ m, gon = false }: { m: Muc; gon?: boolean }) => (
    <NavLink to={m.den} end={m.den === '/'}
      className={({ isActive }) => gon
        ? cx('flex h-full flex-col items-center justify-center gap-0.5 text-[10.5px]', isActive ? 'font-bold text-do' : 'text-mo')
        : cx('flex h-11 items-center gap-3 rounded-xl px-3 text-[14px]', isActive ? 'bg-white/10 font-semibold text-white shadow-[inset_3px_0_0_var(--color-vang)]' : 'text-[#F6E3E0] hover:bg-white/5')}>
      {m.icon}<span className={gon ? 'max-w-full truncate' : ''}>{m.ten}</span>
    </NavLink>
  );
  const chinh = ds.length > 4 ? ds.slice(0, 3) : ds;
  const them = ds.length > 4 ? ds.slice(3) : [];

  return (
    <div className="flex min-h-screen">
      <nav aria-label="Điều hướng chính" className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-7 bg-gradient-to-b from-[#6E0D12] via-ink to-[#3A0508] px-4 py-6 lg:flex">
        <div className="flex items-center justify-between gap-2 px-2"><Logo /><Chuong moSangPhai /></div>
        {nhom.map((n) => (
          <div key={n} className="flex flex-col gap-1">
            <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-[#D2A19B]">{n}</div>
            {ds.filter((m) => (m.nhom ?? 'ĐƠN VỊ') === n).map((m) => <Link key={m.den} m={m} />)}
          </div>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8ECF3] text-[13px] font-bold text-den">{chuTat}</div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-semibold text-white">{hoSo.ho_ten}</span>
            <span className="truncate text-[11px] text-[#E9CBC7]">{hoSo.vai_tro === 'don_vi' ? hoSo.don_vi?.ten : VAI_TRO[hoSo.vai_tro]}</span>
          </div>
          <button onClick={dangXuat} aria-label="Đăng xuất" className="flex h-10 w-10 items-center justify-center rounded-lg text-[#E9CBC7] hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-vien bg-nen/95 px-4 py-3 backdrop-blur lg:hidden">
          <LogoBcd className="h-10 w-10" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[11.5px] text-mo">{hoSo.vai_tro === 'don_vi' ? 'Tài khoản đơn vị' : VAI_TRO[hoSo.vai_tro]}</span>
            <span className="truncate text-[15px] font-bold">{hoSo.vai_tro === 'don_vi' ? hoSo.don_vi?.ten : hoSo.ho_ten}</span>
          </div>
          <Chuong />
          <button onClick={dangXuat} aria-label="Đăng xuất" className="flex h-11 w-11 items-center justify-center rounded-xl border border-vien bg-white"><LogOut className="h-4 w-4" /></button>
        </div>
        <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-4 pb-28 pt-5 lg:px-8 lg:pb-10 lg:pt-6">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Thanh điều hướng" className="fixed inset-x-0 bottom-0 z-30 grid h-[72px] grid-cols-4 border-t border-vien bg-white px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {chinh.map((m) => <Link key={m.den} m={m} gon />)}
        {them.length > 0 && (
          <button onClick={() => setMoThem(true)} className={cx('flex h-full flex-col items-center justify-center gap-0.5 text-[10.5px]', them.some((m) => m.den !== '/' && location.pathname.startsWith(m.den)) ? 'font-bold text-do' : 'text-mo')}>
            <Menu className="h-5 w-5" strokeWidth={1.8} /><span className="text-[10.5px]">Thêm</span>
          </button>
        )}
      </nav>
      {moThem && (
        <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setMoThem(false)}>
          <div role="dialog" aria-label="Mục khác" className="absolute inset-x-0 bottom-0 flex flex-col gap-1 rounded-t-3xl bg-white p-4 pb-[calc(88px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            {them.map((m) => (
              <NavLink key={m.den} to={m.den} onClick={() => setMoThem(false)}
                className={({ isActive }) => cx('flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px]', isActive ? 'bg-nen font-bold' : '')}>
                {m.icon}{m.ten}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
