import { Link } from 'react-router-dom';
import { ArrowUp, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { ngayGio, phanTram, so } from '../lib/dinhDang';
import { MAU_PHAN_LOAI, nhanPhanLoai, type KetQuaDa06 } from '../lib/da06';
import { hanNv, type TrangThaiNv } from '../lib/nhiemVu';
import { ChipHan, DangTai, DongHo, HopLoi, NhanGap, Rong, The, ThanhTyLe, TieuDeThe, cx } from '../components/ui';

export type Viec = { nop_id: string; don_vi_id: string; trang_thai: string; ky_id: string; ten: string; loai: string; han_nop: string; qua_han: boolean; cap?: string };
// Nhãn loại việc; kỳ tổng hợp lĩnh vực (đầu mối gửi Thường trực) có nhãn riêng
export const nhanViec = (v: Pick<Viec, 'loai' | 'cap'>): [string, string] => (v.cap === 'linh_vuc' ? ['TỔNG HỢP GỬI THƯỜNG TRỰC', 'text-[#A4161A]'] : [NHAN_LOAI[v.loai]?.[0] ?? v.loai, NHAN_LOAI[v.loai]?.[1] ?? '']);
export const NHAN_LOAI: Record<string, [string, string]> = {
  da06_tuan: ['SỐ ĐỀ ÁN 06 · TUẦN', 'text-nguy'], dot_xuat: ['ĐỘT XUẤT', 'text-cam'], thang: ['ĐỊNH KỲ · THÁNG', 'text-xanh'],
  quy: ['ĐỊNH KỲ · QUÝ', 'text-xanh'], sau_thang: ['ĐỊNH KỲ · 6 THÁNG', 'text-xanh'], nam: ['ĐỊNH KỲ · NĂM', 'text-xanh'],
};

type NvDv = { id: string; ma: string | null; ten: string; han: string | null; trang_thai: TrangThaiNv; phan_tram: number; qua_han: boolean; con_ngay: number | null; chu_tri_don_vi_id: string | null };

export function moiNhatTheoMa(ds: KetQuaDa06[]) {
  const m = new Map<string, KetQuaDa06>();
  for (const r of ds) { const c = m.get(r.ma); if (!c || c.ngay_file < r.ngay_file) m.set(r.ma, r); }
  return [...m.values()].sort((a, b) => a.thu_tu - b.thu_tu);
}

// Chỉ tiêu ĐA06 đơn vị được phân công (đã duyệt) — không lẫn với số đầu mối ĐA06 được xem
export async function chiTieuCuaDonVi(dv: string): Promise<string[]> {
  const r = await supabase.from('da06_phan_cong').select('chi_tieu_id').eq('don_vi_id', dv).eq('trang_thai', 'da_duyet');
  return [...new Set(((r.data ?? []) as { chi_tieu_id: string }[]).map((x) => x.chi_tieu_id))];
}

export default function TrangChuDonVi() {
  const { hoSo } = useAuth();
  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    const dv = hoSo!.don_vi_id!;
    const [a, b, c, pc] = await Promise.all([
      supabase.from('v_viec_can_nop').select('*').eq('don_vi_id', dv).order('han_nop'),
      supabase.from('v_da06_ket_qua').select('*').eq('la_don_vi_minh', true),
      supabase.from('v_nhiem_vu').select('id, ma, ten, han, trang_thai, phan_tram, qua_han, con_ngay, chu_tri_don_vi_id, phoi_hop_ids').neq('trang_thai', 'hoan_thanh').neq('trang_thai', 'tam_dung').order('han', { nullsFirst: false }),
      chiTieuCuaDonVi(dv),
    ]);
    const nv = ((kq(c) ?? []) as (NvDv & { phoi_hop_ids: string[] | null })[]).filter((n) => n.chu_tri_don_vi_id === dv || (n.phoi_hop_ids ?? []).includes(dv));
    return { viec: (kq(a) ?? []) as Viec[], chiTieu: moiNhatTheoMa(((kq(b) ?? []) as KetQuaDa06[]).filter((x) => pc.includes(x.chi_tieu_id))), nv };
  });
  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if (dangTai && !data) return <DangTai />;
  if (!data) return null;
  const gan = data.viec[0];

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-mo">Xin chào, {hoSo?.ho_ten}</span>
        <h1 className="m-0 text-[22px] font-extrabold">{hoSo?.don_vi?.ten}</h1>
      </div>

      {gan ? (
        <section className="flex flex-col gap-4 rounded-3xl bg-ink p-5 text-white">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-ink-2 px-3 py-1 text-[11px] font-bold tracking-wider text-[#FDE68A]">{nhanViec(gan)[0]}</span>
            <span className="flex-1" /><NhanGap han={gan.han_nop} />
          </div>
          <div className="flex flex-col gap-1"><span className="text-lg font-bold">{gan.ten}</span><span className="text-xs text-[#E9CBC7]">Hạn {ngayGio(gan.han_nop)}{gan.trang_thai === 'can_bo_sung' && ' · cần bổ sung'}</span></div>
          <DongHo han={gan.han_nop} />
          <Link to={`/viec-can-nop/${gan.nop_id}`} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-bold text-den"><ArrowUp className="h-4 w-4" />{gan.loai === 'da06_tuan' ? 'Nhập số ngay' : 'Nộp báo cáo ngay'}</Link>
        </section>
      ) : <Rong>Đã nộp đủ.</Rong>}

      {data.viec.length > 1 && (
        <The className="flex flex-col gap-1 p-4">
          <TieuDeThe phai={<Link to="/viec-can-nop" className="text-[13px] font-semibold text-[#A4161A]">Tất cả</Link>}>Việc cần nộp khác</TieuDeThe>
          {data.viec.slice(1, 5).map((v) => (
            <Link key={v.nop_id} to={`/viec-can-nop/${v.nop_id}`} className="flex items-center gap-3 border-t border-[#F1EEE7] py-3 text-den first:border-0">
              <div className="flex min-w-0 flex-1 flex-col"><span className={cx('text-[10.5px] font-bold tracking-wider', nhanViec(v)[1])}>{nhanViec(v)[0]}</span><span className="truncate text-sm font-semibold">{v.ten}</span></div>
              <ChipHan han={v.han_nop} /><ChevronRight className="h-4 w-4 text-mo" />
            </Link>
          ))}
        </The>
      )}

      <The className="flex flex-col gap-1 p-4">
        <TieuDeThe phai={<Link to="/nhiem-vu" className="text-[13px] font-semibold text-[#A4161A]">Tất cả</Link>}>Nhiệm vụ đang thực hiện</TieuDeThe>
        {data.nv.length === 0 && <span className="py-2 text-sm text-mo">Không có nhiệm vụ.</span>}
        {data.nv.slice(0, 5).map((n) => (
          <Link key={n.id} to={`/nhiem-vu/${n.id}`} className="flex items-center gap-3 border-t border-[#F1EEE7] py-3 text-den first:border-0">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[10.5px] font-bold tracking-wider text-mo">{n.chu_tri_don_vi_id === hoSo?.don_vi_id ? 'CHỦ TRÌ' : 'PHỐI HỢP'} · <span className="so">{n.phan_tram}%</span></span>
              <span className="line-clamp-2 text-sm font-semibold">{n.ten}</span>
            </div>
            {n.han ? <ChipHan han={hanNv(n.han)} /> : <span className="text-xs text-mo">Chưa chốt hạn</span>}<ChevronRight className="h-4 w-4 shrink-0 text-mo" />
          </Link>
        ))}
      </The>

      <The className="flex flex-col gap-3.5 p-4">
        <TieuDeThe phai={<Link to="/chi-tieu" className="text-[13px] font-semibold text-[#A4161A]">Chi tiết</Link>}>Chỉ tiêu Đề án 06 của đơn vị</TieuDeThe>
        {data.chiTieu.length === 0 && <span className="text-sm text-mo">Chưa được giao chỉ tiêu.</span>}
        {data.chiTieu.map((r) => {
          const m = MAU_PHAN_LOAI[r.phan_loai];
          return (
            <Link key={r.ma} to={`/de-an-06/${r.ma}`} className="flex flex-col gap-1.5 text-den">
              <div className="flex items-baseline gap-2"><span className="flex-1 text-sm font-semibold">{r.chi_tieu}</span><span className={cx('so font-bold', m.chu === 'text-white' ? 'text-nguy' : m.chu)}>{phanTram(r.ty_le)}</span></div>
              <ThanhTyLe tyLe={Number(r.ty_le)} mauThanh={m.thanh} vachGiao={r.chieu === 'cao_hon_tot' ? Number(r.nguong) : null} vachTb={r.chieu === 'cao_hon_tot' ? Number(r.tb_tinh) : null} />
              <span className="text-xs text-mo">{nhanPhanLoai(r.phan_loai, r.chieu, r.nguong_duoi)} · hạng {r.hang}/{r.so_dia_phuong}{r.phan_loai !== 'hoan_thanh' && r.con_thieu_vuot_tb > 0 ? ` · còn ${so(r.con_thieu_vuot_tb)} để vượt TB` : ''}</span>
            </Link>
          );
        })}
      </The>
    </>
  );
}
