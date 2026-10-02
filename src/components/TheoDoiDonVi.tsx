// Theo dõi nộp báo cáo theo đơn vị: tỷ lệ đúng hạn, trễ, không nộp qua nhiều kỳ + dải ô màu từng kỳ
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { ngay, ngayGio } from '../lib/dinhDang';
import { DangTai, HopLoi, lopO, Nut, Rong, The, cx } from './ui';

type Dong = {
  nop_id: string; ky_id: string; don_vi_id: string; don_vi: string; thu_tu: number; ky: string; loai: string; han: string; gia_han: boolean;
  trang_thai: string; nop_luc: string | null; nop_ngoai: boolean; dung_han: boolean | null; tre_ngay: number;
};
const LOAI: [string, string][] = [['thang', 'Báo cáo tháng'], ['dot_xuat', 'Đột xuất'], ['da06_tuan', 'Số ĐA06 tuần'], ['', 'Tất cả']];

function trangThaiO(d: Dong, bayGio: number): { mau: string; nhan: string } {
  const quaHan = new Date(d.han).getTime() < bayGio;
  if (d.nop_luc) return d.dung_han ? { mau: 'bg-xanh', nhan: 'Đúng hạn' } : { mau: 'bg-[#F59E0B]', nhan: `Trễ ${d.tre_ngay} ngày` };
  if (quaHan) return { mau: 'bg-nguy', nhan: `Chưa nộp, quá ${d.tre_ngay} ngày` };
  return { mau: 'border-[1.5px] border-dashed border-[#9AA1AE] bg-white', nhan: 'Chưa đến hạn' };
}

export default function TheoDoiDonVi() {
  const [loai, setLoai] = useState('thang');
  const [thang, setThang] = useState(6);
  const tu = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() - thang); return d.toISOString(); }, [thang]);
  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    let q = supabase.from('v_theo_doi_nop').select('*').gte('han', tu).order('han');
    if (loai) q = q.eq('loai', loai);
    return (kq(await q) ?? []) as Dong[];
  }, [loai, tu]);

  const bayGio = Date.now();
  const bang = useMemo(() => {
    const m = new Map<string, { ten: string; thu_tu: number; dong: Dong[] }>();
    for (const d of data ?? []) {
      if (!m.has(d.don_vi_id)) m.set(d.don_vi_id, { ten: d.don_vi, thu_tu: d.thu_tu, dong: [] });
      m.get(d.don_vi_id)!.dong.push(d);
    }
    return [...m.entries()].map(([id, v]) => {
      const denHan = v.dong.filter((d) => d.nop_luc || new Date(d.han).getTime() < bayGio);
      const dung = denHan.filter((d) => d.dung_han).length;
      const tre = denHan.filter((d) => d.dung_han === false);
      const khong = denHan.filter((d) => !d.nop_luc).length;
      return { id, ...v, soKy: denHan.length, dung, tre: tre.length, treTb: tre.length ? Math.round(tre.reduce((s, d) => s + d.tre_ngay, 0) / tre.length) : 0, khong, tyLe: denHan.length ? dung / denHan.length : null };
    }).sort((a, b) => (a.tyLe ?? 2) - (b.tyLe ?? 2) || a.thu_tu - b.thu_tu);
  }, [data, bayGio]);

  const xuat = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bang.map((b, i) => ({
      'TT': i + 1, 'Đơn vị': b.ten, 'Số kỳ đã đến hạn': b.soKy, 'Đúng hạn': b.dung, 'Trễ': b.tre, 'Trễ TB (ngày)': b.treTb, 'Không nộp': b.khong,
      'Tỷ lệ đúng hạn (%)': b.tyLe == null ? '' : Math.round(b.tyLe * 100),
    }))), 'Tổng hợp');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((data ?? []).map((d) => ({
      'Đơn vị': d.don_vi, 'Kỳ': d.ky, 'Hạn': ngayGio(d.han), 'Gia hạn': d.gia_han ? 'x' : '', 'Nộp lúc': d.nop_luc ? ngayGio(d.nop_luc) : '',
      'Nộp ngoài hệ thống': d.nop_ngoai ? 'x' : '', 'Kết quả': trangThaiO(d, bayGio).nhan,
    }))), 'Chi tiết');
    XLSX.writeFile(wb, `theo-doi-nop-bao-cao-${thang}-thang.xlsx`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Loại báo cáo" className={lopO} value={loai} onChange={(e) => setLoai(e.target.value)}>{LOAI.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <select aria-label="Khoảng thời gian" className={lopO} value={thang} onChange={(e) => setThang(Number(e.target.value))}>{[3, 6, 12].map((t) => <option key={t} value={t}>{t} tháng gần nhất</option>)}</select>
        <span className="flex-1" />
        <Nut icon={<Download className="h-4 w-4" />} disabled={!bang.length} onClick={xuat}>Xuất Excel</Nut>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-mo">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-xanh" />Đúng hạn</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-[#F59E0B]" />Trễ</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-nguy" />Không nộp</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded border-[1.5px] border-dashed border-[#9AA1AE]" />Chưa đến hạn</span>
      </div>
      {loi && <HopLoi loi={loi} taiLai={taiLai} />}
      {dangTai && !data && <DangTai />}
      {data && (bang.length === 0 ? <Rong>Không có kỳ báo cáo trong khoảng này.</Rong> : (
        <The className="overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="bg-nen-2 text-left text-[11px] text-mo">
              <tr><th className="px-4 py-3">ĐƠN VỊ</th><th className="w-40 px-2">ĐÚNG HẠN</th><th className="px-2 text-right">TRỄ</th><th className="px-2 text-right">KHÔNG NỘP</th><th className="px-4">TỪNG KỲ (cũ → mới)</th></tr>
            </thead>
            <tbody>
              {bang.map((b) => (
                <tr key={b.id} className="border-t border-[#F1EEE7] align-middle">
                  <td className="px-4 py-3 font-semibold">{b.ten}</td>
                  <td className="px-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-[#EEEBE3]"><div className={cx('h-1.5 rounded-full', (b.tyLe ?? 1) >= 0.9 ? 'bg-xanh' : (b.tyLe ?? 1) >= 0.7 ? 'bg-[#F59E0B]' : 'bg-nguy')} style={{ width: `${(b.tyLe ?? 0) * 100}%` }} /></div>
                      <span className="so w-16 text-right text-xs font-bold">{b.tyLe == null ? '—' : `${Math.round(b.tyLe * 100)}%`}</span>
                    </div>
                    <div className="text-[11px] text-mo">{b.dung}/{b.soKy} kỳ</div>
                  </td>
                  <td className="so px-2 text-right">{b.tre ? <span className="font-semibold text-cam-dam">{b.tre}<span className="font-sans text-[11px] font-normal text-mo"> (TB {b.treTb} ngày)</span></span> : '—'}</td>
                  <td className="so px-2 text-right">{b.khong ? <span className="font-bold text-nguy">{b.khong}</span> : '—'}</td>
                  <td className="px-4">
                    <div className="flex flex-wrap gap-1">
                      {b.dong.map((d) => { const o = trangThaiO(d, bayGio); return (
                        <Link key={d.nop_id} to={`/ky-bao-cao/${d.ky_id}`} title={`${d.ky} · hạn ${ngay(d.han)} · ${o.nhan}${d.nop_ngoai ? ' · nộp ngoài hệ thống' : ''}`} aria-label={`${d.ky}: ${o.nhan}`}
                          className={cx('h-6 w-6 rounded-md', o.mau)} />
                      ); })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></The>
      ))}
    </div>
  );
}
