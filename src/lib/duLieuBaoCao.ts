// Số liệu Đề án 06 (kỳ tỉnh chốt mới nhất) dùng chung cho các báo cáo .docx
import { supabase } from './supabase';
import { kq } from './useDuLieu';
import { ngay, phanTram, so } from './dinhDang';
import { nhanPhanLoai, type KetQuaDa06 } from './da06';

export type BangDa06 = { ngayChot: string; dong: { ten: string; ketQua: string; tyLe: string; mucGiao: string; danhGia: string }[] };

// chiTieuIds: chỉ lấy các chỉ tiêu này (bảng của một đơn vị); bỏ trống = toàn bộ chỉ tiêu tính điểm
export async function layBangDa06(chiTieuIds?: string[]): Promise<BangDa06 | null> {
  if (chiTieuIds && !chiTieuIds.length) return null;
  const ky = await supabase.from('da06_ky_danh_gia').select('id, ngay_file').order('ngay_file', { ascending: false }).limit(1).maybeSingle();
  if (!ky.data) return null;
  const r = (kq(await supabase.from('v_da06_ket_qua').select('*').eq('ky_id', ky.data.id).eq('la_don_vi_minh', true).eq('tinh_diem', true).order('thu_tu')) ?? []) as KetQuaDa06[];
  const loc = chiTieuIds ? r.filter((x) => chiTieuIds.includes(x.chi_tieu_id)) : r;
  if (!loc.length) return null;
  return {
    ngayChot: ngay(ky.data.ngay_file),
    dong: loc.map((x) => ({
      ten: x.chi_tieu, ketQua: `${so(x.tu_so)}/${so(x.mau_so)}`, tyLe: phanTram(x.ty_le), mucGiao: phanTram(x.nguong, 0),
      danhGia: nhanPhanLoai(x.phan_loai, x.chieu, x.nguong_duoi),
    })),
  };
}
