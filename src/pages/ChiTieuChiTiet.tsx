import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { laCQTTHoacLanhDao, useAuth } from '../lib/auth';
import { ngay, phanTram, so } from '../lib/dinhDang';
import { MAU_PHAN_LOAI, nhanPhanLoai, type KetQuaDa06 } from '../lib/da06';
import { Chip, DangTai, HopLoi, lopO, Rong, The, TheSo, TieuDeThe, TieuDeTrang, cx } from '../components/ui';
import BieuDoChiTieu from '../components/BieuDoChiTieu';
import { kiemTraSoBao } from '../lib/kiemTraSoLieu';
import { AlertTriangle } from 'lucide-react';

type ChiTieu = { id: string; ma: string; ten: string; ten_sheet: string; nhan_tu_so: string; nhan_mau_so: string; nguon: string | null; han_dat: string | null; chieu: 'cao_hon_tot' | 'thap_hon_tot' };
type SoDv = { id: string; ngay_so_lieu: string; tu_so: number; mau_so: number; ty_le: number; trang_thai: string; don_vi: { ten: string } };

export default function ChiTieuChiTiet() {
  const { ma } = useParams();
  const { hoSo } = useAuth();
  const xemToanTinh = laCQTTHoacLanhDao(hoSo);
  const [tim, setTim] = useState('');

  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    const ct = kq(await supabase.from('da06_chi_tieu').select('id, ma, ten, ten_sheet, nhan_tu_so, nhan_mau_so, nguon, han_dat, chieu').eq('ma', ma!).single()) as ChiTieu;
    const lichSu = (kq(await supabase.from('v_da06_ket_qua').select('*').eq('ma', ma!).eq('la_don_vi_minh', true).order('ngay_file')) ?? []) as KetQuaDa06[];
    const moiNhat = lichSu.at(-1);
    const [tatCa, tu] = await Promise.all([
      moiNhat && xemToanTinh ? supabase.from('v_da06_ket_qua').select('dia_phuong, loai_dia_phuong, la_don_vi_minh, tu_so, mau_so, ty_le, phan_loai, hang').eq('ky_id', moiNhat.ky_id).eq('ma', ma!).order('hang') : Promise.resolve({ data: [], error: null }),
      supabase.from('da06_so_lieu_don_vi').select('id, ngay_so_lieu, tu_so, mau_so, ty_le, trang_thai, don_vi(ten)').eq('chi_tieu_id', ct.id).order('ngay_so_lieu', { ascending: false }).limit(20),
    ]);
    return { ct, lichSu, moiNhat, tatCa: (kq(tatCa) ?? []) as KetQuaDa06[], tu: (kq(tu) ?? []) as unknown as SoDv[] };
  }, [ma]);

  const loc = useMemo(() => (data?.tatCa ?? []).filter((x) => x.dia_phuong.toLowerCase().includes(tim.toLowerCase())), [data, tim]);

  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if (dangTai && !data) return <DangTai />;
  if (!data) return null;
  const { ct, moiNhat: r, lichSu } = data;
  if (!r) return <><TieuDeTrang ten={ct.ten} /><Rong>Chưa có số liệu.</Rong></>;
  const m = MAU_PHAN_LOAI[r.phan_loai];
  const cao = ct.chieu === 'cao_hon_tot';

  // Dải phân bố 78 địa phương
  const tyLes = data.tatCa.map((x) => Number(x.ty_le));
  const min = Math.min(...tyLes, Number(r.ty_le)), max = Math.max(...tyLes, Number(r.ty_le), cao ? Number(r.nguong) : 0);
  const X = (v: number) => (max === min ? 50 : ((v - min) / (max - min)) * 100);
  const bin: Record<number, number> = {};
  const cham = data.tatCa.filter((x) => !x.la_don_vi_minh).map((x) => { const b = Math.round(X(Number(x.ty_le)) / 2); bin[b] = (bin[b] ?? 0) + 1; return { x: X(Number(x.ty_le)), y: (bin[b] - 1) * 11 }; });
  const phuong = data.tatCa.filter((x) => x.loai_dia_phuong === 'phuong');
  const canhBao = kiemTraSoBao(data.tu, lichSu.map((h) => ({ ngay_file: h.ngay_file, tu_so: h.tu_so, mau_so: h.mau_so, ty_le: h.ty_le })), cao);
  const soCanhBao = Object.keys(canhBao).length;

  return (
    <>
      <TieuDeTrang tren={<>{xemToanTinh ? <Link to="/de-an-06" className="text-mo">Đề án 06</Link> : <Link to="/chi-tieu" className="text-mo">Chỉ tiêu của tôi</Link>} / {ct.nguon}</>}
        ten={ct.ten} phai={<Chip nen={m.nen} chu={m.chu} className="px-3 py-1.5 text-xs">{nhanPhanLoai(r.phan_loai, r.chieu, r.nguong_duoi)}</Chip>} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <TheSo nhan={`Tỷ lệ (tỉnh chốt ${ngay(r.ngay_file)})`} giaTri={phanTram(r.ty_le)} mau={m.chu === 'text-white' ? 'text-nguy' : m.chu} phu={`${so(r.tu_so)} / ${so(r.mau_so)}`} />
        <TheSo nhan="Mức giao · Trung bình tỉnh" giaTri={`${cao ? phanTram(r.nguong, 0) : 'tồn 0%'} · ${phanTram(r.tb_tinh)}`} phu={ct.han_dat ? `Hạn ${ngay(ct.han_dat)}` : undefined} />
        <TheSo nhan="Xếp hạng" giaTri={`${r.hang} / ${r.so_dia_phuong}`} phu={r.loai_dia_phuong === 'phuong' ? `Thứ ${r.hang_cung_loai}/${r.so_cung_loai} trong các phường` : undefined} />
        <section className="flex flex-col gap-1 rounded-2xl bg-ink p-4 text-white">
          <span className="text-[13px] text-[#E9CBC7]">Còn thiếu (giữ nguyên tổng số)</span>
          <span className="so text-[26px] font-bold leading-tight">{r.phan_loai === 'hoan_thanh' ? 'Đã đạt' : so(r.con_thieu_dat)}</span>
          {r.phan_loai !== 'hoan_thanh' && <span className="text-xs text-[#F6E3E0]">để đạt mức giao{r.con_thieu_vuot_tb > 0 && ` · ${so(r.con_thieu_vuot_tb)} để vượt TB tỉnh`}</span>}
        </section>
      </div>

      <The className="flex flex-col gap-2 p-5">
        <TieuDeThe>Diễn biến tỷ lệ</TieuDeThe>
        <BieuDoChiTieu cao={cao} giao={cao ? Number(r.nguong) : null} tb={Number(r.tb_tinh)}
          tinh={lichSu.map((h) => ({ ngay: h.ngay_file, ty_le: Number(h.ty_le) }))}
          donVi={data.tu.filter((t) => t.trang_thai === 'da_gui').map((t) => ({ ngay: t.ngay_so_lieu, ty_le: Number(t.ty_le) }))} />
      </The>

      {xemToanTinh && data.tatCa.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <The className="flex flex-col gap-3 p-5">
            <TieuDeThe>Vị trí trong {data.tatCa.length} xã, phường, đặc khu</TieuDeThe>
            <div className="relative mx-2 mt-6 h-36">
              <div className="absolute inset-x-0 bottom-5 h-px bg-vien-2" />
              <div className="absolute bottom-5 h-28 border-l-2 border-dashed border-cam" style={{ left: `${X(Number(r.tb_tinh))}%` }} />
              <div className="absolute -top-5 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-cam" style={{ left: `${X(Number(r.tb_tinh))}%` }}>TB {phanTram(r.tb_tinh)}</div>
              {cham.map((c, i) => <div key={i} className="absolute h-[9px] w-[9px] -translate-x-1/2 rounded-full bg-[#E9CBC7]" style={{ left: `${c.x}%`, bottom: 24 + c.y }} />)}
              <div className="absolute bottom-6 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white bg-nguy ring-1 ring-nguy" style={{ left: `${X(Number(r.ty_le))}%` }} />
              <div className="absolute bottom-12 -translate-x-1/2 whitespace-nowrap rounded-md bg-nguy px-2 py-0.5 text-[11px] font-bold text-white" style={{ left: `${X(Number(r.ty_le))}%` }}>Nam Đông Hà {phanTram(r.ty_le)}</div>
              <div className="so absolute bottom-0 left-0 text-[10px] text-mo">{phanTram(min, 0)}</div>
              <div className="so absolute bottom-0 right-0 text-[10px] text-mo">{phanTram(max, 0)}</div>
            </div>
          </The>
          <The className="flex flex-col gap-2 p-5">
            <TieuDeThe>So với các phường</TieuDeThe>
            {phuong.map((p) => (
              <div key={p.dia_phuong} className={cx('grid grid-cols-[110px_minmax(0,1fr)_48px] items-center gap-2 text-xs', p.la_don_vi_minh && 'font-bold')}>
                <span className="truncate">{p.dia_phuong.replace('Phường ', '')}</span>
                <div className="h-2 rounded-full bg-[#EEEBE3]"><div className={cx('h-2 rounded-full', p.la_don_vi_minh ? 'bg-nguy' : 'bg-[#7FA2E0]')} style={{ width: `${Math.min(100, Number(p.ty_le) * (cao ? 100 : 400))}%` }} /></div>
                <span className={cx('so text-right', p.la_don_vi_minh && 'text-nguy')}>{phanTram(p.ty_le)}</span>
              </div>
            ))}
          </The>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <The className="overflow-hidden">
          <div className="px-5 pb-2 pt-4"><TieuDeThe>Các kỳ tỉnh chấm</TieuDeThe></div>
          <table className="w-full text-[13px]">
            <thead className="bg-nen-2 text-left text-[11px] text-mo"><tr><th className="px-5 py-2">Kỳ</th><th className="px-2 text-right">{cao ? 'Đã / Tổng' : 'Tồn / Tổng'}</th><th className="px-2 text-right">Tỷ lệ</th><th className="px-2 text-right">TB tỉnh</th><th className="px-5 text-right">Hạng</th></tr></thead>
            <tbody>{lichSu.slice().reverse().map((h) => (
              <tr key={h.ky_id} className="border-t border-[#F1EEE7]"><td className="px-5 py-2.5">{ngay(h.ngay_file)}</td><td className="so px-2 text-right">{so(h.tu_so)}/{so(h.mau_so)}</td><td className="so px-2 text-right font-bold">{phanTram(h.ty_le)}</td><td className="so px-2 text-right text-mo">{phanTram(h.tb_tinh)}</td><td className="so px-5 text-right">{h.hang}/{h.so_dia_phuong}</td></tr>
            ))}</tbody>
          </table>
        </The>
        <The className="overflow-hidden">
          <div className="px-5 pb-2 pt-4"><TieuDeThe phai={soCanhBao > 0 && <span className="flex items-center gap-1 text-xs font-semibold text-cam-dam"><AlertTriangle className="h-4 w-4" />{soCanhBao} lần cần kiểm tra</span>}>Số đơn vị báo hằng tuần</TieuDeThe></div>
          {data.tu.length === 0 ? <div className="p-5 pt-2"><Rong>Chưa có số đơn vị báo.</Rong></div> : (
            <table className="w-full text-[13px]">
              <thead className="bg-nen-2 text-left text-[11px] text-mo"><tr><th className="px-5 py-2">Ngày số liệu</th><th className="px-2">Đơn vị</th><th className="px-2 text-right">Số liệu</th><th className="px-5 text-right">Tỷ lệ</th></tr></thead>
              <tbody>{data.tu.map((t) => (
                <tr key={t.id} className={cx('border-t border-[#F1EEE7] align-top', canhBao[t.id] && 'bg-cam-nhat/40')}><td className="px-5 py-2.5">{ngay(t.ngay_so_lieu)}{t.trang_thai === 'nhap' && <span className="text-xs text-mo"> (nháp)</span>}{canhBao[t.id] && <div className="mt-1 flex flex-col gap-0.5 text-[11px] font-semibold text-cam-dam">{canhBao[t.id].map((c) => <span key={c}>⚠ {c}</span>)}</div>}</td><td className="px-2 py-2.5 text-xs">{t.don_vi.ten}</td><td className="so px-2 py-2.5 text-right text-xs">{so(t.tu_so)}/{so(t.mau_so)}</td><td className="so px-5 py-2.5 text-right font-bold">{phanTram(t.ty_le, 2)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </The>
      </div>

      {xemToanTinh && data.tatCa.length > 0 && (
        <The className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-5 pb-3 pt-4">
            <h2 className="m-0 flex-1 text-[15px] font-bold">Bảng {data.tatCa.length} địa phương</h2>
            <input aria-label="Tìm địa phương" placeholder="Tìm xã, phường…" className={cx(lopO, 'w-60')} value={tim} onChange={(e) => setTim(e.target.value)} />
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-nen-2 text-left text-[11px] text-mo"><tr><th className="px-5 py-2">Hạng</th><th className="px-2">Địa phương</th><th className="px-2 text-right">Số liệu</th><th className="px-2 text-right">Tỷ lệ</th><th className="px-5">Đánh giá</th></tr></thead>
              <tbody>{loc.map((x) => {
                const mm = MAU_PHAN_LOAI[x.phan_loai];
                return (
                  <tr key={x.dia_phuong} className={cx('border-t border-[#F1EEE7]', x.la_don_vi_minh && 'bg-xanh-nhat/50 font-bold')}>
                    <td className="so px-5 py-2">{x.hang}</td><td className="px-2">{x.dia_phuong}</td><td className="so px-2 text-right text-xs">{so(x.tu_so)}/{so(x.mau_so)}</td>
                    <td className="so px-2 text-right">{phanTram(x.ty_le)}</td><td className="px-5"><Chip nen={mm.nen} chu={mm.chu}>{nhanPhanLoai(x.phan_loai, ct.chieu, r.nguong_duoi)}</Chip></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </The>
      )}
    </>
  );
}
