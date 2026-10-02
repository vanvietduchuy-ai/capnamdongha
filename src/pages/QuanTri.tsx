import { useState } from 'react';
import { Plus } from 'lucide-react';
import { goiChucNang, loiDe, supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { ngayGio } from '../lib/dinhDang';
import { Chip, DangTai, HopLoi, HopThoai, lopO, Nut, O, The, TieuDeThe, TieuDeTrang, cx } from '../components/ui';
import { BangPhanCong } from './PhanCong';
import { useAuth } from '../lib/auth';

type Tab = 'tai_khoan' | 'don_vi' | 'phan_cong' | 'lich' | 'nhat_ky' | 'sao_luu';
const TABS: [Tab, string][] = [['tai_khoan', 'Tài khoản'], ['don_vi', 'Đơn vị'], ['phan_cong', 'Phân công chỉ tiêu'], ['lich', 'Cài đặt'], ['nhat_ky', 'Nhật ký'], ['sao_luu', 'Sao lưu']];

export default function QuanTri() {
  const [tab, setTab] = useState<Tab>('tai_khoan');
  return (
    <>
      <TieuDeTrang ten="Quản trị" />
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-vien">
        {TABS.map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('h-11 whitespace-nowrap px-4 text-sm', tab === k ? 'border-b-[2.5px] border-ink font-bold' : 'font-medium text-mo')}>{t}</button>)}
      </div>
      {tab === 'tai_khoan' && <TaiKhoan />}
      {tab === 'don_vi' && <><DauMoi /><DonVi /></>}
      {tab === 'phan_cong' && <BangPhanCong nhung />}
      {tab === 'lich' && <CaiDat />}
      {tab === 'nhat_ky' && <NhatKy />}
      {tab === 'sao_luu' && <SaoLuu />}
    </>
  );
}

type Nd = { id: string; ho_ten: string; email: string | null; chuc_vu: string | null; vai_tro: string; don_vi_id: string | null; hoat_dong: boolean; don_vi: { ten: string } | null };
const VT: Record<string, [string, string, string]> = { quan_tri: ['Quản trị', 'bg-ink', 'text-white'], lanh_dao: ['Lãnh đạo', 'bg-nguy-nhat', 'text-nguy'], don_vi: ['Đơn vị', 'bg-nen-3', 'text-mo-2'] };

function TaiKhoan() {
  const { hoSo } = useAuth();
  const [mo, setMo] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const { data, loi: loiTai, dangTai, taiLai } = useDuLieu(async () => {
    const [a, b] = await Promise.all([
      supabase.from('nguoi_dung').select('id, ho_ten, email, chuc_vu, vai_tro, don_vi_id, hoat_dong, don_vi(ten)').order('vai_tro').order('ho_ten'),
      supabase.from('don_vi').select('id, ten').eq('hoat_dong', true).order('thu_tu'),
    ]);
    return { nd: (kq(a) ?? []) as unknown as Nd[], dv: (kq(b) ?? []) as { id: string; ten: string }[] };
  });
  const doi = async (id: string, sua: Partial<Nd>) => {
    if (id === hoSo?.id && (sua.vai_tro || sua.hoat_dong === false)) { setLoi('Không tự khoá hoặc đổi vai trò tài khoản đang dùng.'); return; }
    if (sua.vai_tro && !window.confirm(`Đổi vai trò thành "${VT[sua.vai_tro][0]}"?`)) { void taiLai(); return; }
    if (sua.hoat_dong === false && !window.confirm('Khoá tài khoản này?')) return;
    setLoi(null); const { error } = await supabase.from('nguoi_dung').update(sua).eq('id', id); if (error) setLoi(loiDe(error)); else void taiLai(); };
  const datLaiMk = async (nd: Nd) => {
    const mk = window.prompt(`Mật khẩu mới cho ${nd.ho_ten} (ít nhất 8 ký tự):`);
    if (!mk) return;
    try { await goiChucNang('quan-tri-tai-khoan', { hanh_dong: 'dat_lai_mat_khau', id: nd.id, mat_khau: mk }); setLoi(null); window.alert('Đã đặt lại mật khẩu.'); }
    catch (e) { setLoi(loiDe(e)); }
  };
  return (
    <>
      <div className="flex"><span className="flex-1" /><Nut kieu="chinh" icon={<Plus className="h-4 w-4" />} onClick={() => setMo(true)}>Tạo tài khoản</Nut></div>
      {(loi || loiTai) && <HopLoi loi={(loi || loiTai)!} />}
      {dangTai && !data && <DangTai />}
      {data && (
        <The className="overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="bg-nen-2 text-left text-[11px] text-mo"><tr><th className="px-4 py-3">NGƯỜI DÙNG</th><th className="px-2">ĐƠN VỊ</th><th className="px-2">VAI TRÒ</th><th className="px-2">TRẠNG THÁI</th><th className="px-4 text-right">THAO TÁC</th></tr></thead>
            <tbody>{data.nd.map((n) => (
              <tr key={n.id} className="border-t border-[#F1EEE7]">
                <td className="px-4 py-2.5"><div className="font-semibold">{n.ho_ten}</div><div className="text-xs text-mo">{n.email}{n.chuc_vu && ` · ${n.chuc_vu}`}</div></td>
                <td className="px-2"><select aria-label="Đơn vị" className={cx(lopO, 'min-h-9 text-[13px]')} value={n.don_vi_id ?? ''} onChange={(e) => doi(n.id, { don_vi_id: e.target.value || null })}><option value="">—</option>{data.dv.map((d) => <option key={d.id} value={d.id}>{d.ten}</option>)}</select></td>
                <td className="px-2"><select aria-label="Vai trò" className={cx(lopO, 'min-h-9 text-[13px]')} value={n.vai_tro} onChange={(e) => doi(n.id, { vai_tro: e.target.value })}>{Object.entries(VT).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select></td>
                <td className="px-2"><Chip nen={n.hoat_dong ? 'bg-xanh-nhat' : 'bg-cam-nhat'} chu={n.hoat_dong ? 'text-xanh' : 'text-cam-dam'}>{n.hoat_dong ? 'Đang hoạt động' : 'Đã khoá'}</Chip></td>
                <td className="whitespace-nowrap px-4 text-right">
                  <button className="mr-3 font-semibold text-[#A4161A]" onClick={() => datLaiMk(n)}>Đặt lại mật khẩu</button>
                  <button className={cx('font-semibold', n.hoat_dong ? 'text-nguy' : 'text-xanh')} onClick={() => doi(n.id, { hoat_dong: !n.hoat_dong })}>{n.hoat_dong ? 'Khoá' : 'Mở khoá'}</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div></The>
      )}
      <TaoTaiKhoan mo={mo} dong={() => setMo(false)} donVi={data?.dv ?? []} xong={() => { setMo(false); void taiLai(); }} />
    </>
  );
}

function TaoTaiKhoan({ mo, dong, donVi, xong }: { mo: boolean; dong: () => void; donVi: { id: string; ten: string }[]; xong: () => void }) {
  const [f, setF] = useState({ email: '', mat_khau: '', ho_ten: '', chuc_vu: '', vai_tro: 'don_vi', don_vi_id: '' });
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const tao = async () => {
    setLoi(null);
    if (!f.email || f.mat_khau.length < 8 || !f.ho_ten) { setLoi('Nhập email, họ tên và mật khẩu tối thiểu 8 ký tự'); return; }
    if (f.vai_tro === 'don_vi' && !f.don_vi_id) { setLoi('Tài khoản đơn vị phải chọn đơn vị'); return; }
    setDangChay(true);
    try { await goiChucNang('quan-tri-tai-khoan', { hanh_dong: 'tao', ...f, don_vi_id: f.don_vi_id || null }); xong(); setF({ email: '', mat_khau: '', ho_ten: '', chuc_vu: '', vai_tro: 'don_vi', don_vi_id: '' }); }
    catch (e) { setLoi(loiDe(e)); } finally { setDangChay(false); }
  };
  return (
    <HopThoai mo={mo} dong={dong} tieuDe="Tạo tài khoản">
      <div className="flex flex-col gap-3">
        {loi && <HopLoi loi={loi} />}
        <O nhan="Họ và tên"><input className={lopO} value={f.ho_ten} onChange={(e) => setF({ ...f, ho_ten: e.target.value })} /></O>
        <O nhan="Chức vụ"><input className={lopO} value={f.chuc_vu} onChange={(e) => setF({ ...f, chuc_vu: e.target.value })} /></O>
        <O nhan="Email đăng nhập"><input className={lopO} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></O>
        <O nhan="Mật khẩu ban đầu (tối thiểu 8 ký tự)"><input className={lopO} type="text" value={f.mat_khau} onChange={(e) => setF({ ...f, mat_khau: e.target.value })} /></O>
        <div className="grid grid-cols-2 gap-3">
          <O nhan="Vai trò"><select className={lopO} value={f.vai_tro} onChange={(e) => setF({ ...f, vai_tro: e.target.value })}>{Object.entries(VT).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select></O>
          <O nhan="Đơn vị"><select className={lopO} value={f.don_vi_id} onChange={(e) => setF({ ...f, don_vi_id: e.target.value })}><option value="">—</option>{donVi.map((d) => <option key={d.id} value={d.id}>{d.ten}</option>)}</select></O>
        </div>
        <Nut kieu="chinh" dangChay={dangChay} onClick={tao}>Tạo tài khoản</Nut>
      </div>
    </HopThoai>
  );
}

// Đầu mối lĩnh vực: đơn vị nhận, đôn đốc, tổng hợp báo cáo của các đơn vị rồi gửi Thường trực BCĐ
const LV_DAU_MOI: [string, string][] = [['nq57', 'Nghị quyết 57'], ['khcn_dmst', 'KHCN, đổi mới sáng tạo'], ['chuyen_doi_so', 'Chuyển đổi số'], ['de_an_06', 'Đề án 06']];
function DauMoi() {
  const [loi, setLoi] = useState<string | null>(null);
  const { data, taiLai } = useDuLieu(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('dau_moi_linh_vuc').select('linh_vuc, don_vi_id'),
      supabase.from('don_vi').select('id, ten').eq('hoat_dong', true).eq('phai_bao_cao', true).order('thu_tu'),
      supabase.from('cau_hinh').select('gia_tri').eq('khoa', 'tong_hop_linh_vuc').maybeSingle(),
    ]);
    return { dm: (kq(a) ?? []) as { linh_vuc: string; don_vi_id: string }[], dv: (kq(b) ?? []) as { id: string; ten: string }[], ngay: Number((c.data?.gia_tri as { sau_han_don_vi_ngay?: number } | undefined)?.sau_han_don_vi_ngay ?? 2) };
  });
  const chay = async (p: PromiseLike<{ error: unknown }>) => { setLoi(null); const { error } = await p; if (error) setLoi(loiDe(error)); else void taiLai(); };
  if (!data) return null;
  return (
    <The className="flex flex-col gap-1 p-4">
      <TieuDeThe>Đầu mối lĩnh vực</TieuDeThe>
      <p className="m-0 mb-1 text-[13px] text-mo">Đơn vị đầu mối theo dõi, nhắc, tiếp nhận báo cáo của các đơn vị và gửi báo cáo tổng hợp cho Thường trực BCĐ.</p>
      {loi && <HopLoi loi={loi} />}
      {LV_DAU_MOI.map(([lv, ten]) => (
        <Hang key={lv} nhan={ten}>
          <select aria-label={`Đầu mối ${ten}`} className={cx(lopO, 'min-h-10 min-w-64')} value={data.dm.find((x) => x.linh_vuc === lv)?.don_vi_id ?? ''}
            onChange={(e) => chay(e.target.value
              ? supabase.from('dau_moi_linh_vuc').upsert({ linh_vuc: lv, don_vi_id: e.target.value })
              : supabase.from('dau_moi_linh_vuc').delete().eq('linh_vuc', lv))}>
            <option value="">— Không có (đơn vị gửi thẳng Thường trực) —</option>
            {data.dv.map((d) => <option key={d.id} value={d.id}>{d.ten}</option>)}
          </select>
        </Hang>
      ))}
      <Hang nhan="Hạn nộp tổng hợp lĩnh vực">
        <input type="number" min={0} max={10} aria-label="Số ngày sau hạn đơn vị" className={cx(lopO, 'so w-20')} defaultValue={data.ngay}
          onBlur={(e) => chay(supabase.from('cau_hinh').update({ gia_tri: { sau_han_don_vi_ngay: Number(e.target.value) || 0 } }).eq('khoa', 'tong_hop_linh_vuc'))} />
        <span className="text-[13px] text-mo">ngày sau hạn đơn vị</span>
      </Hang>
    </The>
  );
}

type Dv = { id: string; ma: string; ten: string; loai: string; thu_tu: number; phai_bao_cao: boolean; hoat_dong: boolean }
  & { the_thuc: string; co_quan_chu_quan: string | null; ten_ban_hanh: string | null; ky_hieu: string | null; nguoi_ky_chuc_danh: string | null; nguoi_ky_ho_ten: string | null };
function DonVi() {
  const [loi, setLoi] = useState<string | null>(null);
  const [moi, setMoi] = useState({ ma: '', ten: '', loai: 'phong_ban' });
  const { data, dangTai, taiLai } = useDuLieu(async () => (kq(await supabase.from('don_vi').select('*').order('thu_tu')) ?? []) as Dv[]);
  const chay = async (p: PromiseLike<{ error: unknown }>) => { setLoi(null); const { error } = await p; if (error) setLoi(loiDe(error)); else void taiLai(); };
  return (
    <>
      {loi && <HopLoi loi={loi} />}
      {dangTai && !data && <DangTai />}
      {data && (
        <The className="overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="bg-nen-2 text-left text-[11px] text-mo"><tr><th className="px-4 py-3">MÃ</th><th className="px-2">TÊN ĐƠN VỊ</th><th className="px-2">PHẢI NỘP BÁO CÁO ĐỊNH KỲ</th><th className="px-2">HOẠT ĐỘNG</th></tr></thead>
            <tbody>{data.map((d) => (
              <tr key={d.id} className="border-t border-[#F1EEE7]">
                <td className="so px-4 py-2.5 text-xs">{d.ma}</td><td className="px-2 font-semibold">{d.ten}</td>
                <td className="px-2"><input type="checkbox" aria-label="Phải nộp báo cáo" className="h-5 w-5 accent-ink" checked={d.phai_bao_cao} onChange={(e) => chay(supabase.from('don_vi').update({ phai_bao_cao: e.target.checked }).eq('id', d.id))} /></td>
                <td className="px-2"><input type="checkbox" aria-label="Hoạt động" className="h-5 w-5 accent-ink" checked={d.hoat_dong} onChange={(e) => chay(supabase.from('don_vi').update({ hoat_dong: e.target.checked }).eq('id', d.id))} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t border-vien bg-nen-2 p-4">
          <input aria-label="Mã đơn vị" placeholder="MÃ (vd DOAN_TN)" className={cx(lopO, 'w-40')} value={moi.ma} onChange={(e) => setMoi({ ...moi, ma: e.target.value.toUpperCase() })} />
          <input aria-label="Tên đơn vị" placeholder="Tên đơn vị" className={cx(lopO, 'flex-1')} value={moi.ten} onChange={(e) => setMoi({ ...moi, ten: e.target.value })} />
          <select aria-label="Loại" className={lopO} value={moi.loai} onChange={(e) => setMoi({ ...moi, loai: e.target.value })}><option value="phong_ban">Phòng, ban</option><option value="doan_the">Đoàn thể</option><option value="truong_hoc">Trường học</option><option value="cong_an">Công an</option><option value="khac">Khác</option></select>
          <Nut disabled={!moi.ma || !moi.ten} onClick={() => chay(supabase.from('don_vi').insert({ ...moi, thu_tu: 95 }))}>Thêm đơn vị</Nut>
        </div></The>
      )}
    </>
  );
}

type LichKy = { id: string; ten: string; loai: string; quy_tac: Record<string, unknown> };
type NguoiKy = { chuc_danh: string; ho_ten: string };
type TheThuc = { co_quan_cap_tren: string; co_quan: string; ky_hieu: string; dia_danh: string; truong_ban: NguoiKy; cqtt_ky_to_trinh: NguoiKy };
const THU = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];

function Hang({ nhan, children }: { nhan: string; children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#F1EEE7] py-3 text-sm"><span className="w-full font-semibold sm:w-56">{nhan}</span><div className="flex flex-wrap items-center gap-2">{children}</div></div>;
}

// Cài đặt bằng biểu mẫu (không sửa JSON): lịch tự mở kỳ, nhắc hạn, người ký, thể thức văn bản BCĐ
function CaiDat() {
  const { data, dangTai, taiLai } = useDuLieu(async () => {
    const [a, b] = await Promise.all([supabase.from('cau_hinh').select('khoa, gia_tri'), supabase.from('lich_ky').select('id, ten, loai, quy_tac')]);
    const ch = Object.fromEntries(((kq(a) ?? []) as { khoa: string; gia_tri: unknown }[]).map((x) => [x.khoa, x.gia_tri]));
    return { ch, lich: (kq(b) ?? []) as LichKy[] };
  });
  const [g, setG] = useState<Record<string, unknown> | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const [tb, setTb] = useState<{ loi?: string; ok?: string } | null>(null);
  if (dangTai && !data) return <DangTai />;
  if (!data) return null;

  const thang = data.lich.find((l) => l.loai === 'thang');
  const tuan = data.lich.find((l) => l.loai === 'da06_tuan');
  const nh = (data.ch.nhac_han ?? {}) as Record<string, unknown>;
  const kenh = (data.ch.kenh_nhac ?? ['web']) as string[];
  const nk = (data.ch.nguoi_ky_bao_cao ?? { chuc_danh: '', ho_ten: '' }) as NguoiKy;
  const tt = (data.ch.the_thuc_bcd ?? {}) as TheThuc;
  const macDinh: Record<string, unknown> = {
    t_mo: thang?.quy_tac.mo_ngay ?? 15, t_han: thang?.quy_tac.han_ngay ?? 8, t_gio: thang?.quy_tac.han_gio ?? '17:00', t_tinh: thang?.quy_tac.han_gui_tinh_ngay ?? 12,
    w_thu: tuan?.quy_tac.mo_thu ?? 1, w_gio: tuan?.quy_tac.han_gio ?? '17:00',
    n3: nh.truoc_3_ngay !== false, n1: nh.truoc_1_ngay !== false, nqh: nh.qua_han_hang_ngay !== false, nld: nh.bao_lanh_dao_sau_ngay ?? 2, email: kenh.includes('email'),
    nk_cd: nk.chuc_danh, nk_ht: nk.ho_ten,
    tb_cd: tt.truong_ban?.chuc_danh ?? 'TRƯỞNG BAN', tb_ht: tt.truong_ban?.ho_ten ?? '', cqt: tt.co_quan_cap_tren ?? '', cq: tt.co_quan ?? '', kh: tt.ky_hieu ?? 'BCĐ',
  };
  const v = g ?? macDinh;
  const dat = (k: string, x: unknown) => setG({ ...v, [k]: x });
  const so_ = (k: string, min: number, max: number) => (
    <input type="number" min={min} max={max} className={cx(lopO, 'w-20 text-center')} value={String(v[k])} onChange={(e) => dat(k, Number(e.target.value))} />
  );

  const luu = async () => {
    setDangLuu(true); setTb(null);
    const viec: PromiseLike<{ error: unknown }>[] = [
      supabase.from('cau_hinh').upsert([
        { khoa: 'nhac_han', gia_tri: { ...nh, truoc_3_ngay: v.n3, truoc_1_ngay: v.n1, qua_han_hang_ngay: v.nqh, bao_lanh_dao_sau_ngay: Number(v.nld) }, mo_ta: 'Quy tắc nhắc hạn' },
        { khoa: 'kenh_nhac', gia_tri: v.email ? ['web', 'email'] : ['web'], mo_ta: 'Kênh nhắc hạn' },
        { khoa: 'nguoi_ky_bao_cao', gia_tri: { chuc_danh: v.nk_cd, ho_ten: v.nk_ht }, mo_ta: 'Người ký báo cáo gửi Công an tỉnh' },
        { khoa: 'the_thuc_bcd', gia_tri: { ...tt, co_quan_cap_tren: v.cqt, co_quan: v.cq, ky_hieu: v.kh, truong_ban: { chuc_danh: v.tb_cd, ho_ten: v.tb_ht } }, mo_ta: 'Thể thức văn bản Ban Chỉ đạo' },
      ]),
    ];
    if (thang) viec.push(supabase.from('lich_ky').update({ quy_tac: { ...thang.quy_tac, mo_ngay: Number(v.t_mo), han_ngay: Number(v.t_han), han_gio: v.t_gio, han_gui_tinh_ngay: Number(v.t_tinh) } }).eq('id', thang.id));
    if (tuan) viec.push(supabase.from('lich_ky').update({ quy_tac: { ...tuan.quy_tac, mo_thu: Number(v.w_thu), han_gio: v.w_gio } }).eq('id', tuan.id));
    const kqs = await Promise.all(viec);
    setDangLuu(false);
    const e = kqs.find((r) => r.error)?.error;
    if (e) setTb({ loi: loiDe(e) }); else { setTb({ ok: 'Đã lưu.' }); setG(null); void taiLai(); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <The className="flex flex-col px-5 py-3">
          <TieuDeThe>Lịch báo cáo</TieuDeThe>
          <Hang nhan="Báo cáo tháng">Mở ngày {so_('t_mo', 1, 28)} · hạn ngày {so_('t_han', 1, 28)} tháng sau, lúc <input type="time" className={lopO} value={String(v.t_gio)} onChange={(e) => dat('t_gio', e.target.value)} /></Hang>
          <Hang nhan="Gửi Công an tỉnh">Trước ngày {so_('t_tinh', 1, 28)}</Hang>
          <Hang nhan="Số Đề án 06 hằng tuần">Mở <select className={lopO} value={String(v.w_thu)} onChange={(e) => dat('w_thu', Number(e.target.value))}>{THU.slice(1).map((t, i) => <option key={t} value={i + 1}>{t}</option>)}</select> · hạn cùng ngày tuần sau, lúc <input type="time" className={lopO} value={String(v.w_gio)} onChange={(e) => dat('w_gio', e.target.value)} /></Hang>
        </The>
        <The className="flex flex-col px-5 py-3">
          <TieuDeThe>Nhắc hạn</TieuDeThe>
          <Hang nhan="Nhắc đơn vị">
            {([['n3', 'Trước 3 ngày'], ['n1', 'Trước 1 ngày'], ['nqh', 'Quá hạn: hằng ngày']] as const).map(([k, t]) => (
              <label key={k} className="flex min-h-10 items-center gap-2 rounded-lg bg-nen px-3"><input type="checkbox" className="h-5 w-5 accent-[#A4161A]" checked={!!v[k]} onChange={(e) => dat(k, e.target.checked)} />{t}</label>
            ))}
          </Hang>
          <Hang nhan="Báo lãnh đạo khi quá hạn">sau {so_('nld', 1, 30)} ngày</Hang>
          <Hang nhan="Gửi thêm qua email"><label className="flex min-h-10 items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-[#A4161A]" checked={!!v.email} onChange={(e) => dat('email', e.target.checked)} />Có</label></Hang>
        </The>
        <The className="flex flex-col px-5 py-3">
          <TieuDeThe>Người ký báo cáo gửi Công an tỉnh</TieuDeThe>
          <Hang nhan="Chức danh"><input className={cx(lopO, 'w-72')} value={String(v.nk_cd)} onChange={(e) => dat('nk_cd', e.target.value)} /></Hang>
          <Hang nhan="Cấp bậc, họ tên"><input className={cx(lopO, 'w-72')} value={String(v.nk_ht)} onChange={(e) => dat('nk_ht', e.target.value)} /></Hang>
        </The>
        <The className="flex flex-col px-5 py-3">
          <TieuDeThe>Văn bản của Ban Chỉ đạo</TieuDeThe>
          <Hang nhan="Cơ quan cấp trên"><input className={cx(lopO, 'w-72')} value={String(v.cqt)} onChange={(e) => dat('cqt', e.target.value)} /></Hang>
          <Hang nhan="Tên cơ quan ban hành"><input className={cx(lopO, 'w-72')} value={String(v.cq)} onChange={(e) => dat('cq', e.target.value)} /></Hang>
          <Hang nhan="Ký hiệu"><input className={cx(lopO, 'w-32')} value={String(v.kh)} onChange={(e) => dat('kh', e.target.value)} /></Hang>
          <Hang nhan="Người ký (Trưởng ban)"><input className={cx(lopO, 'w-40')} value={String(v.tb_cd)} onChange={(e) => dat('tb_cd', e.target.value)} /><input className={cx(lopO, 'w-56')} placeholder="Họ tên" value={String(v.tb_ht)} onChange={(e) => dat('tb_ht', e.target.value)} /></Hang>
        </The>
      </div>
      {tb?.loi && <HopLoi loi={tb.loi} />}
      <div className="sticky bottom-20 flex items-center justify-end gap-3 lg:bottom-4">
        {tb?.ok && <span className="text-sm font-semibold text-[#166534]">{tb.ok}</span>}
        {g && <Nut onClick={() => setG(null)}>Huỷ thay đổi</Nut>}
        <Nut kieu="chinh" disabled={!g} dangChay={dangLuu} onClick={luu}>Lưu cài đặt</Nut>
      </div>
    </div>
  );
}

type Nk = { id: number; bang: string; hanh_dong: string; boi: string | null; luc: string; du_lieu_moi: Record<string, unknown> | null; du_lieu_cu: Record<string, unknown> | null };
const BANG: Record<string, string> = { nop_bao_cao: 'Nộp báo cáo', ky_bao_cao: 'Kỳ báo cáo', da06_so_lieu_don_vi: 'Số ĐA06 đơn vị', da06_phan_cong: 'Phân công', nguoi_dung: 'Tài khoản', don_vi: 'Đơn vị', da06_ky_danh_gia: 'Nhập file tỉnh', cau_hinh: 'Cấu hình', nhiem_vu: 'Nhiệm vụ', van_ban: 'Văn bản', tep: 'Tệp', da06_diem_tinh: 'Điểm tỉnh', phien_hop: 'Phiên họp', ket_luan: 'Kết luận' };
// Tên cột, giá trị dễ đọc cho nhật ký (cột không có trong danh sách thì không hiện)
const COT: Record<string, string> = {
  trang_thai: 'Trạng thái', trang_thai_giao: 'Giao', phan_tram: 'Tiến độ %', han: 'Hạn', han_nop: 'Hạn nộp', ten: 'Tên', y_kien_duyet: 'Ý kiến',
  vai_tro: 'Vai trò', hoat_dong: 'Hoạt động', phai_bao_cao: 'Phải báo cáo', vai: 'Vai', tu_so: 'Số đã làm', mau_so: 'Tổng số', trich_yeu: 'Trích yếu', so_ky_hieu: 'Số ký hiệu',
};
const GIA_TRI: Record<string, string> = {
  chua_nop: 'Chưa nộp', nhap: 'Đang soạn', da_nop: 'Chờ duyệt', can_bo_sung: 'Cần bổ sung', da_duyet: 'Đã duyệt', de_xuat: 'Đề xuất', mo: 'Mở', khoa: 'Khoá',
  chua_trien_khai: 'Chưa triển khai', dang_thuc_hien: 'Đang thực hiện', trinh_ky: 'Trình ký', hoan_thanh: 'Hoàn thành', tam_dung: 'Tạm dừng',
  da_gui: 'Đã gửi', quan_tri: 'Quản trị', lanh_dao: 'Lãnh đạo', don_vi: 'Đơn vị', chu_tri: 'Chủ trì', phoi_hop: 'Phối hợp', true: 'Có', false: 'Không',
};
const giaTri = (x: unknown) => (x == null ? '∅' : GIA_TRI[String(x)] ?? String(x).slice(0, 40));

function NhatKy() {
  const { data, dangTai } = useDuLieu(async () => {
    const [a, b] = await Promise.all([supabase.from('nhat_ky').select('id, bang, hanh_dong, boi, luc, du_lieu_moi, du_lieu_cu').order('luc', { ascending: false }).limit(100), supabase.from('nguoi_dung').select('id, ho_ten')]);
    return { nk: (kq(a) ?? []) as Nk[], nd: new Map(((kq(b) ?? []) as { id: string; ho_ten: string }[]).map((x) => [x.id, x.ho_ten])) };
  });
  if (dangTai && !data) return <DangTai />;
  const tomTat = (n: Nk) => {
    if (n.hanh_dong !== 'UPDATE' || !n.du_lieu_cu || !n.du_lieu_moi) return String(n.du_lieu_moi?.ten ?? n.du_lieu_cu?.ten ?? n.du_lieu_moi?.trich_yeu ?? '');
    return Object.keys(n.du_lieu_moi).filter((k) => COT[k] && JSON.stringify(n.du_lieu_moi![k]) !== JSON.stringify(n.du_lieu_cu![k]))
      .map((k) => `${COT[k]}: ${giaTri(n.du_lieu_cu![k])} → ${giaTri(n.du_lieu_moi![k])}`).join('; ');
  };
  return (
    <The className="overflow-hidden"><div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[12.5px]">
        <thead className="bg-nen-2 text-left text-[11px] text-mo"><tr><th className="px-4 py-3">THỜI ĐIỂM</th><th className="px-2">NGƯỜI THỰC HIỆN</th><th className="px-2">DỮ LIỆU</th><th className="px-2">THAO TÁC</th><th className="px-4">THAY ĐỔI</th></tr></thead>
        <tbody>{data?.nk.map((n) => (
          <tr key={n.id} className="border-t border-[#F1EEE7] align-top">
            <td className="so whitespace-nowrap px-4 py-2 text-xs">{ngayGio(n.luc)}</td>
            <td className="px-2">{n.boi ? data.nd.get(n.boi) ?? 'Người dùng' : 'Hệ thống'}</td>
            <td className="px-2">{BANG[n.bang] ?? n.bang}</td>
            <td className="px-2">{({ INSERT: 'Thêm', UPDATE: 'Sửa', DELETE: 'Xoá' } as Record<string, string>)[n.hanh_dong]}</td>
            <td className="px-4 text-xs text-mo-2">{tomTat(n)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div></The>
  );
}

function SaoLuu() {
  const [dangChay, setDangChay] = useState(false);
  const [tb, setTb] = useState<string | null>(null);
  const { data, taiLai } = useDuLieu(async () => (kq(await supabase.from('sao_luu').select('*').order('luc', { ascending: false }).limit(20)) ?? []) as { id: number; luc: string; drive_file_id: string | null; kich_thuoc: number | null; ket_qua: string }[]);
  const chay = async () => {
    setDangChay(true); setTb(null);
    try { await goiChucNang('sao-luu', {}); setTb('Đã sao lưu lên Google Drive.'); void taiLai(); } catch (e) { setTb(loiDe(e)); } finally { setDangChay(false); }
  };
  return (
    <The className="flex flex-col gap-3 p-5">
      <TieuDeThe phai={<Nut kieu="chinh" dangChay={dangChay} onClick={chay}>Sao lưu ngay</Nut>}>Sao lưu lên Google Drive (tự động Chủ nhật)</TieuDeThe>
      {tb && <div className="rounded-xl bg-xanh-nhat p-3 text-sm text-xanh">{tb}</div>}
      {data?.map((s) => (
        <div key={s.id} className="flex items-center gap-3 border-t border-[#F1EEE7] pt-2 text-[13px]">
          <span className="so text-xs">{ngayGio(s.luc)}</span><span className="flex-1">{s.ket_qua}</span>
          {s.drive_file_id && <a className="text-[#A4161A]" href={`https://drive.google.com/file/d/${s.drive_file_id}/view`} target="_blank" rel="noreferrer">Mở</a>}
        </div>
      ))}
      {data?.length === 0 && <span className="text-sm text-mo">Chưa có bản sao lưu nào.</span>}
    </The>
  );
}
