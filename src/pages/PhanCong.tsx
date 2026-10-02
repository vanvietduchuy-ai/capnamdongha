import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { loiDe, supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { ngayGio } from '../lib/dinhDang';
import { Chip, DangTai, HopLoi, lopO, Nut, The, TieuDeTrang } from '../components/ui';

type Dong = { chi_tieu_id: string; don_vi_id: string; vai: string; trang_thai: string; duyet_luc: string | null; da06_chi_tieu: { ma: string; ten: string; thu_tu: number }; don_vi: { ten: string } };

export function BangPhanCong({ nhung = false }: { nhung?: boolean }) {
  const { hoSo } = useAuth();
  const quanTri = hoSo?.vai_tro === 'quan_tri';
  const lanhDao = hoSo?.vai_tro === 'lanh_dao';
  const [loi, setLoi] = useState<string | null>(null);
  const [moi, setMoi] = useState({ chi_tieu_id: '', don_vi_id: '', vai: 'chu_tri' });
  const { data, loi: loiTai, dangTai, taiLai } = useDuLieu(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('da06_phan_cong').select('chi_tieu_id, don_vi_id, vai, trang_thai, duyet_luc, da06_chi_tieu(ma, ten, thu_tu), don_vi(ten)'),
      supabase.from('da06_chi_tieu').select('id, ma, ten, thu_tu').eq('hoat_dong', true).order('thu_tu'),
      supabase.from('don_vi').select('id, ten').eq('hoat_dong', true).order('thu_tu'),
    ]);
    return {
      pc: ((kq(a) ?? []) as unknown as Dong[]).sort((x, y) => x.da06_chi_tieu.thu_tu - y.da06_chi_tieu.thu_tu || x.vai.localeCompare(y.vai)),
      ct: (kq(b) ?? []) as { id: string; ma: string; ten: string }[], dv: (kq(c) ?? []) as { id: string; ten: string }[],
    };
  });
  const chay = async (p: PromiseLike<{ error: unknown }>) => { setLoi(null); const { error } = await p; if (error) setLoi(loiDe(error)); else void taiLai(); };
  const duyet = (d: Dong[]) => {
    const coVaiTro = lanhDao || quanTri;
    if (!coVaiTro) return;
    for (const x of d) void chay(supabase.from('da06_phan_cong').update({ trang_thai: 'da_duyet', }).eq('chi_tieu_id', x.chi_tieu_id).eq('don_vi_id', x.don_vi_id));
  };
  const deXuat = data?.pc.filter((x) => x.trang_thai === 'de_xuat') ?? [];

  return (
    <>
      {!nhung && <TieuDeTrang ten="Phân công chỉ tiêu Đề án 06"
        phai={deXuat.length > 0 && <Nut kieu="chinh" onClick={() => duyet(deXuat)}>{lanhDao ? `Duyệt ${deXuat.length} đề xuất` : `Ghi nhận đã duyệt ${deXuat.length} đề xuất`}</Nut>} />}
      {nhung && deXuat.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-cam-nhat px-4 py-3 text-[13px] text-[#3D2A06]">
          <span className="flex-1"><b>{deXuat.length}</b> phân công chờ Trưởng ban duyệt.</span>
          <Nut onClick={() => duyet(deXuat)}>Ghi nhận Trưởng ban đã duyệt</Nut>
        </div>
      )}
      {(loi || loiTai) && <HopLoi loi={(loi || loiTai)!} />}
      {dangTai && !data && <DangTai />}
      {data && (
        <The className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="bg-nen-2 text-left text-[11px] text-mo"><tr><th className="px-4 py-3">CHỈ TIÊU</th><th className="px-2">ĐƠN VỊ</th><th className="px-2">VAI</th><th className="px-2">TRẠNG THÁI</th><th className="px-4" /></tr></thead>
              <tbody>
                {data.pc.map((x) => (
                  <tr key={x.chi_tieu_id + x.don_vi_id} className="border-t border-[#F1EEE7]">
                    <td className="px-4 py-2.5"><span className="so text-xs text-mo">{x.da06_chi_tieu.ma}</span> {x.da06_chi_tieu.ten}</td>
                    <td className="px-2">{x.don_vi.ten}</td>
                    <td className="px-2">{x.vai === 'chu_tri' ? 'Chủ trì' : 'Phối hợp'}</td>
                    <td className="px-2">{x.trang_thai === 'da_duyet' ? <Chip nen="bg-xanh-nhat" chu="text-xanh">Đã duyệt {x.duyet_luc && ngayGio(x.duyet_luc)}</Chip> : <Chip nen="bg-cam-nhat" chu="text-cam-dam">Đề xuất</Chip>}</td>
                    <td className="px-4 text-right">
                      {x.trang_thai === 'de_xuat' && (lanhDao || quanTri) && <button className="mr-3 font-semibold text-[#A4161A]" onClick={() => duyet([x])}>Duyệt</button>}
                      {quanTri && <button aria-label="Xoá phân công" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-nguy hover:bg-nguy-nhat" onClick={() => chay(supabase.from('da06_phan_cong').delete().eq('chi_tieu_id', x.chi_tieu_id).eq('don_vi_id', x.don_vi_id))}><Trash2 className="h-4 w-4" /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {quanTri && (
            <div className="flex flex-wrap items-end gap-2 border-t border-vien bg-nen-2 p-4">
              <select aria-label="Chỉ tiêu" className={lopO} value={moi.chi_tieu_id} onChange={(e) => setMoi({ ...moi, chi_tieu_id: e.target.value })}><option value="">Chọn chỉ tiêu…</option>{data.ct.map((c) => <option key={c.id} value={c.id}>{c.ma} · {c.ten}</option>)}</select>
              <select aria-label="Đơn vị" className={lopO} value={moi.don_vi_id} onChange={(e) => setMoi({ ...moi, don_vi_id: e.target.value })}><option value="">Chọn đơn vị…</option>{data.dv.map((d) => <option key={d.id} value={d.id}>{d.ten}</option>)}</select>
              <select aria-label="Vai trò" className={lopO} value={moi.vai} onChange={(e) => setMoi({ ...moi, vai: e.target.value })}><option value="chu_tri">Chủ trì</option><option value="phoi_hop">Phối hợp</option></select>
              <Nut disabled={!moi.chi_tieu_id || !moi.don_vi_id} onClick={() => chay(supabase.from('da06_phan_cong').insert(moi))}>Thêm đề xuất</Nut>
            </div>
          )}
        </The>
      )}
    </>
  );
}

export default function PhanCong() { return <BangPhanCong />; }
