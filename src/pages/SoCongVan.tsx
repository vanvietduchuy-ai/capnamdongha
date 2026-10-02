// Sổ công văn đến / đi — tự vào sổ khi đơn vị gửi báo cáo văn bản, khi Cơ quan Thường trực thêm văn bản vào kho.
import { useMemo, useState } from 'react';
import { ExternalLink, FileSpreadsheet, Plus, Search } from 'lucide-react';
import { loiDe, supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { ngay } from '../lib/dinhDang';
import { khongDau } from '../lib/nhiemVu';
import { LOAI_VB, type LoaiVb } from '../lib/vanBan';
import { linkXemDrive, ThongTinVanBan, type VanBanDaNop } from '../components/VanBanPdf';
import FormVanBan from '../components/FormVanBan';
import { DangTai, HopLoi, HopThoai, lopO, Nut, O, Rong, The, TieuDeTrang, cx } from '../components/ui';

type Dong = {
  id: string; don_vi_id: string; don_vi: string; loai_so: 'den' | 'di'; nam: number; so_thu_tu: number; ngay: string;
  noi_gui: string | null; noi_nhan: string | null; ghi_chu: string | null; van_ban_id: string; so_ky_hieu: string | null;
  ngay_ban_hanh: string | null; trich_yeu: string; loai: LoaiVb; co_quan_ban_hanh: string; nguoi_ky: string | null;
  chuc_vu_nguoi_ky: string | null; drive_file_id: string | null; drive_url: string | null; ten_tep: string | null;
};

export default function SoCongVan() {
  const { hoSo } = useAuth();
  const quanTri = hoSo?.vai_tro === 'quan_tri';
  const xemMoi = hoSo?.vai_tro !== 'don_vi';
  const [so, setSo] = useState<'den' | 'di'>('den');
  const [nam, setNam] = useState(new Date().getFullYear());
  const [dv, setDv] = useState<string>('');
  const [tim, setTim] = useState('');
  const [chon, setChon] = useState<Dong | null>(null);
  const [them, setThem] = useState(false);

  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    const [dvs, tt] = await Promise.all([
      xemMoi ? supabase.from('don_vi').select('id, ten, loai').eq('hoat_dong', true).order('thu_tu') : Promise.resolve({ data: [], error: null }),
      supabase.rpc('don_vi_thuong_truc'),
    ]);
    const dsDv = (kq(dvs) ?? []) as { id: string; ten: string; loai: string }[];
    const chu = dv || (xemMoi ? (tt.data as string | null) ?? dsDv[0]?.id : hoSo?.don_vi_id) || '';
    const r = await supabase.from('v_so_van_ban').select('*').eq('don_vi_id', chu).eq('nam', nam).order('so_thu_tu', { ascending: false });
    return { dsDv, chu, dong: (kq(r) ?? []) as Dong[] };
  }, [dv, nam]);

  const ds = useMemo(() => {
    const t = khongDau(tim.trim());
    return (data?.dong ?? []).filter((d) => d.loai_so === so
      && (!t || khongDau(`${d.so_ky_hieu ?? ''} ${d.trich_yeu} ${d.noi_gui ?? ''} ${d.noi_nhan ?? ''} ${d.nguoi_ky ?? ''}`).includes(t)));
  }, [data, so, tim]);
  const dem = (l: 'den' | 'di') => (data?.dong ?? []).filter((d) => d.loai_so === l).length;

  const xuatExcel = async () => {
    const XLSX = await import('xlsx');
    const dong = [...ds].reverse().map((d) => ({
      [so === 'den' ? 'Số đến' : 'Số đi']: d.so_thu_tu, [so === 'den' ? 'Ngày đến' : 'Ngày gửi']: ngay(d.ngay),
      'Số, ký hiệu': d.so_ky_hieu ?? '', 'Ngày văn bản': d.ngay_ban_hanh ? ngay(d.ngay_ban_hanh) : '', 'Loại': LOAI_VB[d.loai],
      [so === 'den' ? 'Nơi gửi' : 'Nơi nhận']: (so === 'den' ? d.noi_gui : d.noi_nhan) ?? '', 'Trích yếu': d.trich_yeu,
      'Người ký': [d.chuc_vu_nguoi_ky, d.nguoi_ky].filter(Boolean).join(' '), 'Ghi chú': d.ghi_chu ?? '',
      'Tệp (Google Drive)': d.drive_url || linkXemDrive(d.drive_file_id) || '',
    }));
    const ws = XLSX.utils.json_to_sheet(dong);
    ws['!cols'] = [8, 12, 18, 12, 12, 30, 60, 30, 20, 45].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, so === 'den' ? 'Sổ đến' : 'Sổ đi');
    XLSX.writeFile(wb, `so-cong-van-${so === 'den' ? 'den' : 'di'}-${nam}.xlsx`);
  };

  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if (dangTai && !data) return <DangTai />;
  const tenChu = data?.dsDv.find((d) => d.id === data.chu)?.ten ?? hoSo?.don_vi?.ten;

  return (
    <>
      <TieuDeTrang tren={tenChu} ten="Sổ công văn"
        phai={<>
          <Nut icon={<FileSpreadsheet className="h-4 w-4" />} onClick={xuatExcel}>Xuất Excel</Nut>
          {quanTri && <Nut kieu="chinh" icon={<Plus className="h-4 w-4" />} onClick={() => setThem(true)}>Vào sổ văn bản</Nut>}
        </>} />
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="grid grid-cols-2 rounded-xl bg-[#E7E3D9] p-1">
          {([['den', 'Sổ đến'], ['di', 'Sổ đi']] as const).map(([k, t]) => (
            <button key={k} role="tab" aria-selected={so === k} onClick={() => setSo(k)} className={cx('h-10 rounded-lg px-4 text-[13px]', so === k ? 'bg-white font-bold' : 'font-medium text-mo-2')}>{t} · {dem(k)}</button>
          ))}
        </div>
        {xemMoi && (
          <select aria-label="Sổ của đơn vị" className={cx(lopO, 'min-h-11')} value={data?.chu ?? ''} onChange={(e) => setDv(e.target.value)}>
            {data?.dsDv.map((d) => <option key={d.id} value={d.id}>{d.ten}</option>)}
          </select>
        )}
        <select aria-label="Năm" className={cx(lopO, 'min-h-11')} value={nam} onChange={(e) => setNam(Number(e.target.value))}>
          {[0, 1, 2].map((i) => new Date().getFullYear() - i).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <label className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-mo" />
          <input className={cx(lopO, 'w-full pl-10')} placeholder="Tìm số, trích yếu, nơi gửi…" value={tim} onChange={(e) => setTim(e.target.value)} aria-label="Tìm trong sổ" />
        </label>
      </div>

      {ds.length === 0 ? <Rong>Sổ chưa có văn bản.</Rong> : (
        <The className="overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] border-collapse text-[13px]">
              <thead className="bg-nen-2 text-left text-[11px] tracking-wide text-mo">
                <tr>
                  <th className="px-4 py-3">{so === 'den' ? 'SỐ ĐẾN' : 'SỐ ĐI'}</th><th className="px-2">{so === 'den' ? 'NGÀY ĐẾN' : 'NGÀY GỬI'}</th>
                  <th className="px-2">SỐ, KÝ HIỆU · NGÀY</th><th className="px-2">TRÍCH YẾU</th>
                  <th className="px-2">{so === 'den' ? 'NƠI GỬI' : 'NƠI NHẬN'}</th><th className="px-2">NGƯỜI KÝ</th><th className="px-4">TỆP</th>
                </tr>
              </thead>
              <tbody>
                {ds.map((d) => {
                  const link = d.drive_url || linkXemDrive(d.drive_file_id);
                  return (
                    <tr key={d.id} onClick={() => setChon(d)} className="cursor-pointer border-t border-[#F1EEE7] align-top hover:bg-nen-2">
                      <td className="so px-4 py-3 text-base font-bold">{d.so_thu_tu}</td>
                      <td className="so px-2 py-3">{ngay(d.ngay)}</td>
                      <td className="px-2 py-3"><div className="so font-semibold">{d.so_ky_hieu ?? '—'}</div><div className="text-xs text-mo">{d.ngay_ban_hanh ? ngay(d.ngay_ban_hanh) : ''} · {LOAI_VB[d.loai]}</div></td>
                      <td className="max-w-md px-2 py-3">{d.trich_yeu}</td>
                      <td className="px-2 py-3">{(so === 'den' ? d.noi_gui : d.noi_nhan) ?? '—'}</td>
                      <td className="px-2 py-3">{d.nguoi_ky ?? '—'}</td>
                      <td className="px-4 py-3">{link ? <a onClick={(e) => e.stopPropagation()} href={link} target="_blank" rel="noreferrer" aria-label="Mở tệp" className="inline-flex text-[#A4161A]"><ExternalLink className="h-4 w-4" /></a> : <span className="text-mo">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="m-0 flex list-none flex-col p-0 md:hidden">
            {ds.map((d) => (
              <li key={d.id}>
                <button onClick={() => setChon(d)} className="flex w-full gap-3 border-b border-[#F1EEE7] px-4 py-3 text-left">
                  <span className="so w-10 shrink-0 text-lg font-bold">{d.so_thu_tu}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="so text-xs text-mo">{ngay(d.ngay)} · <b className="text-den">{d.so_ky_hieu ?? '—'}</b></span>
                    <span className="text-sm font-semibold leading-snug">{d.trich_yeu}</span>
                    <span className="text-xs text-mo">{so === 'den' ? `Từ: ${d.noi_gui ?? '—'}` : `Gửi: ${d.noi_nhan ?? '—'}`}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </The>
      )}

      <ChiTietSo d={chon} dong={() => setChon(null)} xong={() => { setChon(null); void taiLai(); }} />
      {quanTri && <FormVanBan mo={them} dong={() => setThem(false)} dau={{ thu_muc: so === 'den' ? 'cap_tren_cong_an_tinh' : 'bcd_phuong_ban_hanh', loai: 'cong_van' }}
        xong={() => { setThem(false); void taiLai(); }} />}
    </>
  );
}

function ChiTietSo({ d, dong, xong }: { d: Dong | null; dong: () => void; xong: () => void }) {
  const [ghiChu, setGhiChu] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [dCu, setDCu] = useState<Dong | null>(null);
  if (d !== dCu) { setDCu(d); setGhiChu(d?.ghi_chu ?? ''); setLoi(null); }
  if (!d) return null;
  const vb: VanBanDaNop = { id: d.van_ban_id, so_van_ban: null, ky_hieu: null, so_ky_hieu: d.so_ky_hieu, ngay_ban_hanh: d.ngay_ban_hanh, trich_yeu: d.trich_yeu, loai: d.loai,
    nguoi_ky: d.nguoi_ky, chuc_vu_nguoi_ky: d.chuc_vu_nguoi_ky, co_quan_ban_hanh: d.co_quan_ban_hanh, drive_file_id: d.drive_file_id, drive_url: d.drive_url, ten_tep: d.ten_tep };
  const luu = async () => {
    const { error } = await supabase.from('so_van_ban').update({ ghi_chu: ghiChu.trim() || null }).eq('id', d.id);
    if (error) setLoi(loiDe(error)); else xong();
  };
  return (
    <HopThoai mo dong={dong} tieuDe={`${d.loai_so === 'den' ? 'Số đến' : 'Số đi'} ${d.so_thu_tu}/${d.nam}`} rong="max-w-[900px]">
      <div className="flex flex-col gap-4">
        <ThongTinVanBan vb={vb} them={<>
          <dt className="text-mo">{d.loai_so === 'den' ? 'Nơi gửi' : 'Nơi nhận'}</dt><dd className="m-0">{(d.loai_so === 'den' ? d.noi_gui : d.noi_nhan) ?? '—'}</dd>
          <dt className="text-mo">{d.loai_so === 'den' ? 'Ngày đến' : 'Ngày gửi'}</dt><dd className="so m-0">{ngay(d.ngay)}</dd>
        </>} />
        <O nhan="Ghi chú (xử lý, chuyển…)"><input className={lopO} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} /></O>
        {loi && <HopLoi loi={loi} />}
        <div className="flex justify-end gap-2"><Nut onClick={dong}>Đóng</Nut><Nut kieu="chinh" onClick={luu}>Lưu ghi chú</Nut></div>
      </div>
    </HopThoai>
  );
}
