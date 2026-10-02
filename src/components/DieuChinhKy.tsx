// Chỉnh sửa kỳ báo cáo (CQTT): sửa kỳ, thêm đơn vị, điều chỉnh từng đơn vị (gia hạn, ghi nhận nộp ngoài hệ thống, trả lại, bỏ khỏi kỳ)
import { useEffect, useState } from 'react';
import { loiDe, supabase } from '../lib/supabase';
import { ngayGioDu, sangONhapGio, tuONhapGio } from '../lib/dinhDang';
import { HopLoi, HopThoai, lopO, Nut, O, cx } from './ui';

export type KySua = { id: string; ten: string; loai: string; han_nop: string; han_gui_tinh: string | null; yeu_cau: string | null };
export type NopSua = { id: string; don_vi_id: string; trang_thai: string; nop_luc: string | null; han_rieng: string | null; nop_ngoai: boolean; y_kien_duyet: string | null; don_vi: { ten: string } };

function useChay(xong: () => void) {
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const chay = async (f: () => PromiseLike<{ error: unknown }>) => {
    setDangChay(true); setLoi(null);
    const { error } = await f();
    setDangChay(false);
    if (error) setLoi(loiDe(error)); else xong();
  };
  return { dangChay, loi, setLoi, chay };
}

export function SuaKy({ ky, mo, dong, xong }: { ky: KySua; mo: boolean; dong: () => void; xong: () => void }) {
  const [g, setG] = useState({ ten: '', han: '', tinh: '', yeu_cau: '' });
  const { dangChay, loi, setLoi, chay } = useChay(xong);
  useEffect(() => { if (mo) setG({ ten: ky.ten, han: sangONhapGio(ky.han_nop), tinh: ky.han_gui_tinh ? sangONhapGio(ky.han_gui_tinh).slice(0, 10) : '', yeu_cau: ky.yeu_cau ?? '' }); }, [mo]); // eslint-disable-line react-hooks/exhaustive-deps
  const luu = () => {
    if (!g.ten.trim() || !g.han) { setLoi('Nhập tên và hạn nộp'); return; }
    void chay(() => supabase.from('ky_bao_cao').update({
      ten: g.ten.trim(), han_nop: tuONhapGio(g.han), han_gui_tinh: g.tinh ? tuONhapGio(`${g.tinh}T00:00`) : null, yeu_cau: g.yeu_cau.trim() || null,
    }).eq('id', ky.id));
  };
  return (
    <HopThoai mo={mo} dong={dong} tieuDe="Sửa kỳ báo cáo">
      <div className="flex flex-col gap-3.5">
        <O nhan="Tên"><input className={lopO} value={g.ten} onChange={(e) => setG({ ...g, ten: e.target.value })} /></O>
        <div className="grid gap-3 sm:grid-cols-2">
          <O nhan="Hạn đơn vị nộp" goiY="Đổi hạn: đơn vị chưa nộp được báo"><input type="datetime-local" className={lopO} value={g.han} onChange={(e) => setG({ ...g, han: e.target.value })} /></O>
          {ky.loai !== 'da06_tuan' && <O nhan="Gửi Công an tỉnh trước"><input type="date" className={lopO} value={g.tinh} onChange={(e) => setG({ ...g, tinh: e.target.value })} /></O>}
        </div>
        <O nhan="Nội dung yêu cầu"><textarea className={cx(lopO, 'min-h-20 py-2')} value={g.yeu_cau} onChange={(e) => setG({ ...g, yeu_cau: e.target.value })} /></O>
        {loi && <HopLoi loi={loi} />}
        <div className="flex justify-end gap-2"><Nut onClick={dong}>Huỷ</Nut><Nut kieu="chinh" dangChay={dangChay} onClick={luu}>Lưu</Nut></div>
      </div>
    </HopThoai>
  );
}

export function ThemDonVi({ kyId, daCo, mo, dong, xong }: { kyId: string; daCo: string[]; mo: boolean; dong: () => void; xong: () => void }) {
  const [ds, setDs] = useState<{ id: string; ten: string }[]>([]);
  const [chon, setChon] = useState<string[]>([]);
  const { dangChay, loi, chay } = useChay(xong);
  useEffect(() => {
    if (!mo) return;
    setChon([]);
    void supabase.from('don_vi').select('id, ten, loai').eq('hoat_dong', true).order('thu_tu')
      .then(({ data }) => setDs(((data ?? []) as { id: string; ten: string; loai: string }[]).filter((d) => !['lanh_dao_bcd', 'co_quan_thuong_truc'].includes(d.loai) && !daCo.includes(d.id))));
  }, [mo]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <HopThoai mo={mo} dong={dong} tieuDe="Thêm đơn vị phải nộp">
      <div className="flex flex-col gap-3">
        {ds.length === 0 ? <span className="text-sm text-mo">Tất cả đơn vị đã có trong kỳ.</span> : ds.map((d) => (
          <label key={d.id} className="flex min-h-10 items-center gap-2.5 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[#A4161A]" checked={chon.includes(d.id)} onChange={(e) => setChon(e.target.checked ? [...chon, d.id] : chon.filter((x) => x !== d.id))} />{d.ten}
          </label>
        ))}
        {loi && <HopLoi loi={loi} />}
        <div className="flex justify-end gap-2"><Nut onClick={dong}>Huỷ</Nut>
          <Nut kieu="chinh" disabled={!chon.length} dangChay={dangChay} onClick={() => chay(() => supabase.from('nop_bao_cao').insert(chon.map((d) => ({ ky_id: kyId, don_vi_id: d }))))}>Thêm {chon.length || ''}</Nut></div>
      </div>
    </HopThoai>
  );
}

function Muc({ ten, children }: { ten: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-2.5 border-t border-[#F1EEE7] pt-4 first:border-0 first:pt-0"><h3 className="m-0 text-sm font-bold">{ten}</h3>{children}</section>;
}

export function DieuChinhDonVi({ nop, hanKy, mo, dong, xong }: { nop: NopSua | null; hanKy: string; mo: boolean; dong: () => void; xong: () => void }) {
  const [han, setHan] = useState('');
  const [nopLuc, setNopLuc] = useState('');
  const [yKien, setYKien] = useState('');
  const { dangChay, loi, setLoi, chay } = useChay(xong);
  useEffect(() => { if (mo && nop) { setHan(sangONhapGio(nop.han_rieng ?? hanKy)); setNopLuc(sangONhapGio(new Date().toISOString())); setYKien(''); setLoi(null); } }, [mo, nop?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!nop) return null;
  const chuaNop = ['chua_nop', 'nhap', 'can_bo_sung'].includes(nop.trang_thai);
  return (
    <HopThoai mo={mo} dong={dong} tieuDe={nop.don_vi.ten}>
      <div className="flex flex-col gap-4">
        {loi && <HopLoi loi={loi} />}
        {chuaNop && (
          <Muc ten="Gia hạn riêng">
            <div className="flex flex-wrap items-end gap-2">
              <input type="datetime-local" aria-label="Hạn mới" className={cx(lopO, 'flex-1')} value={han} onChange={(e) => setHan(e.target.value)} />
              <Nut kieu="chinh" dangChay={dangChay} onClick={() => chay(() => supabase.from('nop_bao_cao').update({ han_rieng: tuONhapGio(han) }).eq('id', nop.id))}>Gia hạn</Nut>
              {nop.han_rieng && <Nut onClick={() => chay(() => supabase.from('nop_bao_cao').update({ han_rieng: null }).eq('id', nop.id))}>Bỏ gia hạn</Nut>}
            </div>
            <span className="text-xs text-mo">Hạn kỳ: {ngayGioDu(hanKy)}</span>
          </Muc>
        )}
        {chuaNop && (
          <Muc ten="Đơn vị đã nộp ngoài hệ thống (bản giấy, email)">
            <div className="flex flex-wrap items-end gap-2">
              <input type="datetime-local" aria-label="Thời điểm nộp" className={cx(lopO, 'flex-1')} value={nopLuc} onChange={(e) => setNopLuc(e.target.value)} />
              <Nut dangChay={dangChay} onClick={() => chay(() => supabase.from('nop_bao_cao').update({ trang_thai: 'da_nop', nop_ngoai: true, nop_luc: tuONhapGio(nopLuc) }).eq('id', nop.id))}>Ghi nhận đã nộp</Nut>
            </div>
          </Muc>
        )}
        {(nop.trang_thai === 'da_nop' || nop.trang_thai === 'da_duyet') && (
          <Muc ten="Trả lại để đơn vị sửa">
            <textarea aria-label="Nội dung cần sửa" placeholder="Nội dung cần sửa, bổ sung" className={cx(lopO, 'min-h-20 py-2')} value={yKien} onChange={(e) => setYKien(e.target.value)} />
            <Nut kieu="nguy" dangChay={dangChay} onClick={() => { if (!yKien.trim()) { setLoi('Ghi nội dung cần sửa'); return; } void chay(() => supabase.from('nop_bao_cao').update({ trang_thai: 'can_bo_sung', y_kien_duyet: yKien.trim() }).eq('id', nop.id)); }}>Trả lại</Nut>
          </Muc>
        )}
        {(nop.trang_thai === 'chua_nop' || nop.trang_thai === 'nhap') && (
          <Muc ten="Bỏ khỏi kỳ">
            <Nut kieu="nguy" dangChay={dangChay} onClick={() => { if (window.confirm(`Bỏ ${nop.don_vi.ten} khỏi kỳ này?`)) void chay(() => supabase.from('nop_bao_cao').delete().eq('id', nop.id)); }}>Bỏ đơn vị khỏi kỳ</Nut>
          </Muc>
        )}
      </div>
    </HopThoai>
  );
}
