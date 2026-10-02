// Phân loại Đề án 06 — cùng quy tắc với hàm SQL da06_phan_loai (công thức IFS của tỉnh)
export type PhanLoai = 'hoan_thanh' | 'chua_ht_cao_hon_tb' | 'chua_ht' | 'chua_ht_thap_hon_tb' | 'chua_ht_duoi_nguong';
export type Chieu = 'cao_hon_tot' | 'thap_hon_tot';

export function phanLoai(tyLe: number | null, nguong: number, nguongDuoi: number | null, tb: number | null, chieu: Chieu, nhanCaoHonTb: boolean): PhanLoai | null {
  if (tyLe == null) return null;
  if (chieu === 'cao_hon_tot') {
    if (tyLe >= nguong) return 'hoan_thanh';
    if (nguongDuoi != null && tyLe < nguongDuoi) return 'chua_ht_duoi_nguong';
    if (tb != null && tyLe >= tb) return nhanCaoHonTb ? 'chua_ht_cao_hon_tb' : 'chua_ht';
    return 'chua_ht_thap_hon_tb';
  }
  if (tyLe <= nguong) return 'hoan_thanh';
  if (nguongDuoi != null && tyLe > nguongDuoi) return 'chua_ht_duoi_nguong';
  if (tb != null && tyLe <= tb) return 'chua_ht';
  return 'chua_ht_thap_hon_tb';
}

// Nhãn đúng cách ghi của tỉnh
export function nhanPhanLoai(p: PhanLoai | null, chieu: Chieu, nguongDuoi: number | null): string {
  switch (p) {
    case 'hoan_thanh': return 'Hoàn thành';
    case 'chua_ht_cao_hon_tb': return 'Chưa hoàn thành, cao hơn mức trung bình';
    case 'chua_ht': return 'Chưa hoàn thành';
    case 'chua_ht_thap_hon_tb': return chieu === 'thap_hon_tot' ? 'Chưa hoàn thành, hiện còn cao trên mức trung bình của tỉnh' : 'Chưa hoàn thành, thấp hơn mức trung bình';
    case 'chua_ht_duoi_nguong': return chieu === 'thap_hon_tot' ? `Chưa hoàn thành, hiện còn cao hơn ${Math.round((nguongDuoi ?? 0) * 100)}%` : `Chưa hoàn thành, dưới ${Math.round((nguongDuoi ?? 0) * 100)}%`;
    default: return '—';
  }
}

/** Quy chữ đánh giá trong file tỉnh về 1 loại (tỉnh ghi nhiều cách khác nhau cho cùng 1 loại) */
export function phanLoaiTuChu(chu: string | null | undefined): PhanLoai | null {
  if (!chu) return null;
  const t = chu.toLowerCase().normalize('NFC');
  if (!t.includes('chưa')) return t.includes('hoàn thành') ? 'hoan_thanh' : null;
  if (/dưới \d|cao hơn \d/.test(t)) return 'chua_ht_duoi_nguong';
  if (t.includes('cao hơn mức trung bình')) return 'chua_ht_cao_hon_tb';
  if (t.includes('trung bình')) return 'chua_ht_thap_hon_tb';
  return 'chua_ht';
}

export const MAU_PHAN_LOAI: Record<PhanLoai, { nen: string; chu: string; thanh: string }> = {
  hoan_thanh: { nen: 'bg-xanh-nhat', chu: 'text-xanh', thanh: 'bg-xanh' },
  chua_ht_cao_hon_tb: { nen: 'bg-cam-nhat', chu: 'text-cam-dam', thanh: 'bg-cam' },
  chua_ht: { nen: 'bg-cam-nhat', chu: 'text-cam-dam', thanh: 'bg-cam' },
  chua_ht_thap_hon_tb: { nen: 'bg-nguy-nhat', chu: 'text-nguy', thanh: 'bg-nguy' },
  chua_ht_duoi_nguong: { nen: 'bg-nguy', chu: 'text-white', thanh: 'bg-nguy' },
};

export type KetQuaDa06 = {
  ky_id: string; ngay_file: string; chi_tieu_id: string; ma: string; chi_tieu: string; tinh_diem: boolean; chieu: Chieu; thu_tu: number;
  dia_phuong_id: string; dia_phuong: string; loai_dia_phuong: string; la_don_vi_minh: boolean;
  tu_so: number; mau_so: number; ty_le: number; nguong: number; nguong_duoi: number | null; tb_tinh: number; tb_tinh_file: number | null;
  phan_loai: PhanLoai; danh_gia_file: string | null; hang: number; so_dia_phuong: number; hang_cung_loai: number; so_cung_loai: number;
  con_thieu_dat: number; con_thieu_vuot_tb: number;
};

// Số còn phải làm để đạt một tỷ lệ mục tiêu (giữ nguyên mẫu số)
export function conThieu(tu: number, mau: number, muc: number, chieu: Chieu): number {
  return chieu === 'cao_hon_tot' ? Math.max(0, Math.ceil(muc * mau - tu)) : Math.max(0, Math.ceil(tu - muc * mau));
}
