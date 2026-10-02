import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { supabase, loiDe } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { ngay, ngayGioDu } from '../lib/dinhDang';
import TheoDoiDonVi from '../components/TheoDoiDonVi';
import { ChipHan, Chip, DangTai, HopLoi, HopThoai, lopO, Nut, O, Rong, The, TieuDeTrang, cx } from '../components/ui';

type Dong = { ky_id: string; ten: string; loai: string; han_nop: string; han_gui_tinh: string | null; trang_thai_ky: string; so_don_vi: number; da_nop: number; da_duyet: number; can_bo_sung: number; chua_nop: number; nop_tre: number };
type MauBieu = { id: string; ten: string; mo_ta: string | null; hinh_thuc: string; truong: { ma: string; nhan: string; kieu: string; bat_buoc?: boolean; tong_hop?: string }[] };
const LOAI: Record<string, string> = { thang: 'THÁNG', quy: 'QUÝ', sau_thang: '6 THÁNG', nam: 'NĂM', dot_xuat: 'ĐỘT XUẤT', da06_tuan: 'SỐ ĐA06 · TUẦN' };

export default function KyBaoCao() {
  const { hoSo } = useAuth();
  const [tab, setTab] = useState<'mo' | 'khoa' | 'mau' | 'theo_doi'>(() => (new URLSearchParams(window.location.search).get('tab') === 'theo_doi' ? 'theo_doi' : 'mo'));
  const [params, setParams] = useSearchParams();
  const [taoMo, setTaoMo] = useState(params.get('tao') === '1');
  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    const [a, b] = await Promise.all([
      supabase.from('v_tinh_hinh_nop').select('*').eq('cap', 'don_vi').order('han_nop', { ascending: false }).limit(200),
      supabase.from('mau_bieu').select('id, ten, mo_ta, truong, hinh_thuc').eq('hoat_dong', true),
    ]);
    return { ky: (kq(a) ?? []) as Dong[], mau: (kq(b) ?? []) as MauBieu[] };
  });

  const ds = (data?.ky ?? []).filter((k) => (tab === 'mo' ? k.trang_thai_ky === 'mo' : k.trang_thai_ky === 'khoa'));
  if (tab === 'mo') ds.sort((a, b) => a.han_nop.localeCompare(b.han_nop));

  return (
    <>
      <TieuDeTrang ten="Kỳ báo cáo"
        phai={hoSo?.vai_tro === 'quan_tri' && <Nut kieu="chinh" icon={<Plus className="h-4 w-4" />} onClick={() => setTaoMo(true)}>Tạo kỳ báo cáo đột xuất</Nut>} />
      <div role="tablist" className="flex gap-1.5 overflow-x-auto border-b border-vien">
        {([['mo', `Đang mở · ${(data?.ky ?? []).filter((k) => k.trang_thai_ky === 'mo').length}`], ['theo_doi', 'Theo dõi đơn vị'], ['khoa', 'Đã khoá sổ'], ['mau', 'Mẫu biểu']] as const).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cx('h-11 whitespace-nowrap px-4 text-sm', tab === k ? 'border-b-[2.5px] border-ink font-bold' : 'font-medium text-mo')}>{t}</button>
        ))}
      </div>
      {loi && <HopLoi loi={loi} taiLai={taiLai} />}
      {dangTai && !data && <DangTai />}

      {tab === 'theo_doi' && <TheoDoiDonVi />}
      {(tab === 'mo' || tab === 'khoa') && data && (ds.length === 0 ? <Rong>Không có kỳ báo cáo.</Rong> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ds.map((k) => (
            <Link key={k.ky_id} to={`/ky-bao-cao/${k.ky_id}`} className="flex flex-col gap-2.5 rounded-2xl border border-vien bg-white p-4 text-den hover:border-ink">
              <div className="flex items-center gap-2">
                <span className={cx('text-[11px] font-bold tracking-wider', k.loai === 'dot_xuat' ? 'text-cam' : k.loai === 'da06_tuan' ? 'text-nguy' : 'text-xanh')}>{LOAI[k.loai] ?? k.loai}</span>
                <span className="flex-1" />
                {k.trang_thai_ky === 'mo' ? <ChipHan han={k.han_nop} /> : <Chip>Đã khoá</Chip>}
              </div>
              <span className="text-[15px] font-bold">{k.ten}</span>
              <span className="text-xs text-mo">Hạn {ngayGioDu(k.han_nop)}{k.han_gui_tinh ? ` · gửi tỉnh trước ${ngay(k.han_gui_tinh)}` : ''}</span>
              <div className="h-1.5 rounded-full bg-[#EEEBE3]"><div className="h-1.5 rounded-full bg-xanh" style={{ width: `${(k.da_nop / Math.max(1, k.so_don_vi)) * 100}%` }} /></div>
              <span className="text-xs text-mo">{k.da_nop}/{k.so_don_vi} đã nộp · {k.can_bo_sung} cần bổ sung · {k.nop_tre} nộp trễ</span>
            </Link>
          ))}
        </div>
      ))}

      {tab === 'mau' && data && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.mau.map((m) => (
            <The key={m.id} className="flex flex-col gap-2.5 p-4">
              <span className="text-[15px] font-bold">{m.ten}</span>
              {m.mo_ta && <span className="text-[13px] text-mo">{m.mo_ta}</span>}
              {m.truong.length > 0 && (
                <label className="flex items-center gap-2 text-[13px]">
                  <span className="font-semibold text-mo-2">Hình thức nộp</span>
                  <select aria-label={`Hình thức nộp ${m.ten}`} className={cx(lopO, 'min-h-9 text-[13px]')} value={m.hinh_thuc}
                    onChange={async (e) => { const { error } = await supabase.from('mau_bieu').update({ hinh_thuc: e.target.value }).eq('id', m.id); if (!error) void taiLai(); }}>
                    <option value="van_ban">Văn bản (PDF đã ký, đóng dấu)</option><option value="phieu">Số liệu (nhập số)</option>
                  </select>
                </label>
              )}
              {m.truong.length === 0 ? <span className="text-[13px] text-mo">Nhập số theo bảng tỉnh.</span> : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {m.truong.map((t) => (
                    <li key={t.ma} className="flex items-center gap-2 rounded-lg bg-nen-2 px-3 py-2 text-[13px]">
                      <span className="flex-1">{t.nhan}{t.bat_buoc && <span className="text-nguy"> *</span>}</span>
                      <Chip>{({ so: 'Số', ty_le: 'Tỷ lệ', van_ban: 'Văn bản', tep: 'Tệp', bang_da06: 'Bảng ĐA06 tự điền' } as Record<string, string>)[t.kieu] ?? t.kieu}</Chip>
                    </li>
                  ))}
                </ul>
              )}
            </The>
          ))}
        </div>
      )}

      <TaoKyDotXuat mo={taoMo} dong={() => { setTaoMo(false); if (params.get('tao')) setParams({}); }} mauBieu={data?.mau ?? []} />
    </>
  );
}

function TaoKyDotXuat({ mo, dong, mauBieu }: { mo: boolean; dong: () => void; mauBieu: MauBieu[] }) {
  const nav = useNavigate();
  const [ten, setTen] = useState('');
  const [hanNgay, setHanNgay] = useState('');
  const [hanGio, setHanGio] = useState('17:00');
  const [canCu, setCanCu] = useState('');
  const [mau, setMau] = useState('');
  const [hinhThuc, setHinhThuc] = useState<'phieu' | 'van_ban'>('phieu');
  const [chon, setChon] = useState<string[]>([]);
  const [donVi, setDonVi] = useState<{ id: string; ten: string }[]>([]);
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    if (!mo) return;
    supabase.from('don_vi').select('id, ten').eq('hoat_dong', true).eq('phai_bao_cao', true).order('thu_tu')
      .then(({ data }) => { const d = (data ?? []) as { id: string; ten: string }[]; setDonVi(d); setChon(d.map((x) => x.id)); });
  }, [mo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!mo) return;
    const coTruong = mauBieu.filter((m) => m.truong.length && !m.ten.includes('(đầu mối)'));
    const chung = coTruong.find((m) => m.ten.includes('đột xuất'));
    if (!coTruong.some((m) => m.id === mau)) { const x = chung ?? coTruong[0]; if (x) { setMau(x.id); setHinhThuc(x.hinh_thuc === 'van_ban' ? 'van_ban' : 'phieu'); } }
  }, [mo, mauBieu]); // eslint-disable-line react-hooks/exhaustive-deps

  const tao = async () => {
    setLoi(null);
    if (!ten.trim() || !hanNgay || chon.length === 0) { setLoi('Nhập tên, hạn nộp và chọn ít nhất 1 đơn vị'); return; }
    setDangChay(true);
    try {
      const han = new Date(`${hanNgay}T${hanGio}:00+07:00`).toISOString();
      const { data: ky, error } = await supabase.from('ky_bao_cao')
        .insert({ ten: ten.trim(), loai: 'dot_xuat', mau_bieu_id: mau || null, hinh_thuc: hinhThuc, han_nop: han, trang_thai: 'nhap', tu_ngay: null, den_ngay: null, yeu_cau: canCu.trim() || null })
        .select('id').single();
      if (error) throw error;
      const r1 = await supabase.rpc('mo_ky', { p_ky_id: ky.id, p_don_vi: chon });
      if (r1.error) throw r1.error;
      const r2 = await supabase.from('ky_bao_cao').update({ trang_thai: 'mo' }).eq('id', ky.id);
      if (r2.error) throw r2.error;
      dong(); nav(`/ky-bao-cao/${ky.id}`);
    } catch (e) { setLoi(loiDe(e)); } finally { setDangChay(false); }
  };

  return (
    <HopThoai mo={mo} dong={dong} tieuDe="Tạo kỳ báo cáo đột xuất">
      <div className="flex flex-col gap-3.5">
        {loi && <HopLoi loi={loi} />}
        <O nhan="Tên báo cáo"><input className={lopO} value={ten} onChange={(e) => setTen(e.target.value)} placeholder="VD: Tình hình DVC trực tuyến toàn trình" /></O>
        <div className="grid grid-cols-2 gap-3">
          <O nhan="Hạn nộp (ngày)"><input className={lopO} type="date" value={hanNgay} onChange={(e) => setHanNgay(e.target.value)} /></O>
          <O nhan="Giờ"><input className={lopO} type="time" value={hanGio} onChange={(e) => setHanGio(e.target.value)} /></O>
        </div>
        <O nhan="Mẫu biểu"><select className={lopO} value={mau} onChange={(e) => { setMau(e.target.value); setHinhThuc(mauBieu.find((m) => m.id === e.target.value)?.hinh_thuc === 'van_ban' ? 'van_ban' : 'phieu'); }}>{mauBieu.filter((m) => m.truong.length && !m.ten.includes('(đầu mối)')).map((m) => <option key={m.id} value={m.id}>{m.ten}</option>)}</select></O>
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-1.5 text-[13px] font-semibold text-mo-2">Hình thức nộp</legend>
          {([['phieu', 'Số liệu', 'Nhập số, vài dòng'], ['van_ban', 'Văn bản', 'Nộp PDF đã ký, đóng dấu']] as const).map(([k, t, g]) => (
            <label key={k} className={cx('flex cursor-pointer flex-col gap-0.5 rounded-xl border p-3 text-sm', hinhThuc === k ? 'border-ink bg-nen-2' : 'border-vien')}>
              <span className="flex items-center gap-2 font-semibold"><input type="radio" name="hinh_thuc" className="accent-ink" checked={hinhThuc === k} onChange={() => setHinhThuc(k)} />{t}</span>
              <span className="pl-6 text-xs text-mo">{g}</span>
            </label>
          ))}
        </fieldset>
        <O nhan="Nội dung yêu cầu"><textarea className={cx(lopO, 'min-h-20 py-2')} value={canCu} onChange={(e) => setCanCu(e.target.value)} placeholder="Theo văn bản số … của Công an tỉnh" /></O>
        <fieldset className="flex flex-col gap-2 rounded-xl border border-vien p-3">
          <legend className="px-1 text-[13px] font-semibold text-mo-2">Đơn vị phải nộp ({chon.length})</legend>
          {donVi.map((d) => (
            <label key={d.id} className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-ink" checked={chon.includes(d.id)} onChange={(e) => setChon(e.target.checked ? [...chon, d.id] : chon.filter((x) => x !== d.id))} />{d.ten}
            </label>
          ))}
        </fieldset>
        <Nut kieu="chinh" dangChay={dangChay} onClick={tao}>Tạo và gửi cho đơn vị</Nut>
      </div>
    </HopThoai>
  );
}
