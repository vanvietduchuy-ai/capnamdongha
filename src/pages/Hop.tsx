import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, MapPin, Plus } from 'lucide-react';
import { loiDe, supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { ngayGioDu } from '../lib/dinhDang';
import { Chip, ChipHan, DangTai, HopLoi, HopThoai, lopO, Nut, O, Rong, The, TieuDeTrang, cx } from '../components/ui';

export type TtPhienHop = 'du_kien' | 'chuan_bi' | 'da_hop' | 'da_ket_luan';
export const TT_HOP: Record<TtPhienHop, { nhan: string; nen: string; chu: string }> = {
  du_kien: { nhan: 'Dự kiến', nen: 'bg-nen-3', chu: 'text-mo-2' },
  chuan_bi: { nhan: 'Đang chuẩn bị', nen: 'bg-cam-nhat', chu: 'text-cam-dam' },
  da_hop: { nhan: 'Đã họp', nen: 'bg-xanh-nhat', chu: 'text-xanh' },
  da_ket_luan: { nhan: 'Đã có kết luận', nen: 'bg-[#DCFCE7]', chu: 'text-[#166534]' },
};
export const LOAI_HOP: Record<string, string> = { dinh_ky: 'Định kỳ', dot_xuat: 'Đột xuất', long_ghep: 'Lồng ghép' };

export type PhienHop = {
  id: string; ten: string; loai: string; thoi_gian: string | null; dia_diem: string | null; chu_tri: string | null; thanh_phan: string | null;
  noi_dung: string | null; ky_tu: string | null; ky_den: string | null; trang_thai: TtPhienHop;
  ho_so_xong: number; so_ket_luan: number; so_nhiem_vu: number; so_nhiem_vu_xong: number;
};

// datetime-local <-> timestamptz theo giờ VN
const sangO = (t: string | null) => {
  if (!t) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
};
const tuO = (s: string) => (s ? `${s}:00+07:00` : null);

export function FormPhienHop({ mo, dong, ph, xong }: { mo: boolean; dong: () => void; ph?: PhienHop; xong: (id: string) => void }) {
  const moi = () => ({
    ten: ph?.ten ?? '', loai: ph?.loai ?? 'dinh_ky', thoi_gian: sangO(ph?.thoi_gian ?? null), dia_diem: ph?.dia_diem ?? 'Hội trường Đảng ủy phường Nam Đông Hà',
    chu_tri: ph?.chu_tri ?? 'Đồng chí Trưởng Ban Chỉ đạo', thanh_phan: ph?.thanh_phan ?? '', noi_dung: ph?.noi_dung ?? '', ky_tu: ph?.ky_tu ?? '', ky_den: ph?.ky_den ?? '',
  });
  const [g, setG] = useState(moi);
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  useEffect(() => { if (mo) { setG(moi()); setLoi(null); } }, [mo]); // eslint-disable-line react-hooks/exhaustive-deps
  const dat = (k: keyof ReturnType<typeof moi>, v: string) => setG((x) => ({ ...x, [k]: v }));

  const luu = async () => {
    if (!g.ten.trim()) { setLoi('Nhập tên phiên họp'); return; }
    setDangChay(true); setLoi(null);
    const d = { ...g, ten: g.ten.trim(), thoi_gian: tuO(g.thoi_gian), ky_tu: g.ky_tu || null, ky_den: g.ky_den || null, thanh_phan: g.thanh_phan || null, noi_dung: g.noi_dung || null };
    const r = ph ? await supabase.from('phien_hop').update(d).eq('id', ph.id).select('id').single() : await supabase.from('phien_hop').insert(d).select('id').single();
    setDangChay(false);
    if (r.error) setLoi(loiDe(r.error)); else xong(r.data.id as string);
  };

  return (
    <HopThoai mo={mo} dong={dong} tieuDe={ph ? 'Sửa phiên họp' : 'Tạo phiên họp'} rong="max-w-2xl">
      <div className="flex flex-col gap-3.5">
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <O nhan="Tên phiên họp"><input className={lopO} placeholder="VD: Phiên họp định kỳ quý IV/2026" value={g.ten} onChange={(e) => dat('ten', e.target.value)} /></O>
          <O nhan="Loại"><select className={lopO} value={g.loai} onChange={(e) => dat('loai', e.target.value)}>{Object.entries(LOAI_HOP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></O>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <O nhan="Thời gian"><input type="datetime-local" className={lopO} value={g.thoi_gian} onChange={(e) => dat('thoi_gian', e.target.value)} /></O>
          <O nhan="Địa điểm"><input className={lopO} value={g.dia_diem} onChange={(e) => dat('dia_diem', e.target.value)} /></O>
          <O nhan="Chủ trì"><input className={lopO} value={g.chu_tri} onChange={(e) => dat('chu_tri', e.target.value)} /></O>
          <div className="grid grid-cols-2 gap-2">
            <O nhan="Đánh giá từ ngày"><input type="date" className={lopO} value={g.ky_tu} onChange={(e) => dat('ky_tu', e.target.value)} /></O>
            <O nhan="đến ngày"><input type="date" className={lopO} value={g.ky_den} onChange={(e) => dat('ky_den', e.target.value)} /></O>
          </div>
        </div>
        <O nhan="Thành phần (mỗi dòng một nhóm)"><textarea className={cx(lopO, 'min-h-20 py-2')} placeholder={'Các đồng chí thành viên Ban Chỉ đạo\nCác đồng chí thành viên Tổ Giúp việc'} value={g.thanh_phan} onChange={(e) => dat('thanh_phan', e.target.value)} /></O>
        <O nhan="Nội dung, chương trình (mỗi dòng một nội dung)"><textarea className={cx(lopO, 'min-h-20 py-2')} value={g.noi_dung} onChange={(e) => dat('noi_dung', e.target.value)} /></O>
        {loi && <HopLoi loi={loi} />}
        <div className="flex justify-end gap-2"><Nut onClick={dong}>Huỷ</Nut><Nut kieu="chinh" dangChay={dangChay} onClick={luu}>Lưu</Nut></div>
      </div>
    </HopThoai>
  );
}

export default function Hop() {
  const { hoSo } = useAuth();
  const nav = useNavigate();
  const quanTri = hoSo?.vai_tro === 'quan_tri';
  const [moForm, setMoForm] = useState(false);
  const { data, loi, dangTai, taiLai } = useDuLieu(async () =>
    kq(await supabase.from('v_phien_hop').select('*').order('thoi_gian', { ascending: false, nullsFirst: true })) as PhienHop[], []);

  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if (dangTai && !data) return <DangTai />;
  const bayGio = Date.now();
  const sapToi = (data ?? []).filter((p) => p.thoi_gian && new Date(p.thoi_gian).getTime() > bayGio).sort((a, b) => a.thoi_gian!.localeCompare(b.thoi_gian!))[0];

  return (
    <>
      <TieuDeTrang ten="Họp Ban Chỉ đạo"
        phai={quanTri && <Nut kieu="chinh" icon={<Plus className="h-4 w-4" />} onClick={() => setMoForm(true)}>Tạo phiên họp</Nut>} />

      {sapToi && (
        <Link to={`/hop/${sapToi.id}`} className="flex flex-wrap items-center gap-4 rounded-2xl bg-ink px-5 py-4 text-white">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-wider text-[#E9CBC7]">PHIÊN HỌP SẮP TỚI</span>
            <span className="text-lg font-bold">{sapToi.ten}</span>
            <span className="text-[13px] text-[#F6E3E0]">{ngayGioDu(sapToi.thoi_gian)} · {sapToi.dia_diem ?? '—'} · hồ sơ {sapToi.ho_so_xong}/4</span>
          </div>
          <ChipHan han={sapToi.thoi_gian!} />
        </Link>
      )}

      {(data ?? []).length === 0 ? <Rong>Chưa có phiên họp.</Rong> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(data ?? []).map((p) => {
            const tt = TT_HOP[p.trang_thai];
            return (
              <Link key={p.id} to={`/hop/${p.id}`}>
                <The className="flex h-full flex-col gap-3 p-4 hover:border-vien-2">
                  <div className="flex items-start gap-2">
                    <span className="flex-1 text-[15px] font-bold leading-snug">{p.ten}</span>
                    <Chip nen={tt.nen} chu={tt.chu}>{tt.nhan}</Chip>
                  </div>
                  <div className="flex flex-col gap-1 text-[13px] text-mo">
                    <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{p.thoi_gian ? ngayGioDu(p.thoi_gian) : 'Chưa chốt thời gian'} · {LOAI_HOP[p.loai]}</span>
                    <span className="flex items-center gap-2"><MapPin className="h-4 w-4" />{p.dia_diem ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-1.5" aria-label={`Hồ sơ ${p.ho_so_xong}/4`}>
                    {[1, 2, 3, 4].map((i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full', i <= p.ho_so_xong ? 'bg-xanh' : 'bg-[#EEEBE3]')} />)}
                    <span className="so ml-1 text-xs text-mo">{p.ho_so_xong}/4 hồ sơ</span>
                  </div>
                  <div className="mt-auto flex gap-4 border-t border-[#F1EEE7] pt-3 text-[13px]">
                    <span><b className="so">{p.so_ket_luan}</b> <span className="text-mo">kết luận</span></span>
                    <span><b className="so">{p.so_nhiem_vu_xong}/{p.so_nhiem_vu}</b> <span className="text-mo">nhiệm vụ hoàn thành</span></span>
                  </div>
                </The>
              </Link>
            );
          })}
        </div>
      )}
      <FormPhienHop mo={moForm} dong={() => setMoForm(false)} xong={(id) => { setMoForm(false); nav(`/hop/${id}`); }} />
    </>
  );
}
