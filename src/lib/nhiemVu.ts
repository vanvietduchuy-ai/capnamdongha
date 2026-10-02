// Nhiệm vụ Ban Chỉ đạo ("6 rõ"): nhãn, màu, kiểu dữ liệu dùng chung
export type TrangThaiNv = 'chua_trien_khai' | 'dang_thuc_hien' | 'trinh_ky' | 'hoan_thanh' | 'tam_dung';
export type NhomNv = 'chuong_trinh_cong_tac' | 'viec_co_quan_thuong_truc' | 'ket_luan_hop' | 'chi_tieu_da06' | 'khac';
export type LinhVuc = 'nq57' | 'khcn_dmst' | 'chuyen_doi_so' | 'de_an_06' | 'chung';

export const TT_NV: Record<TrangThaiNv, { nhan: string; nen: string; chu: string; thanh: string }> = {
  chua_trien_khai: { nhan: 'Chưa triển khai', nen: 'bg-nen-3', chu: 'text-mo-2', thanh: 'bg-mo' },
  dang_thuc_hien: { nhan: 'Đang thực hiện', nen: 'bg-xanh-nhat', chu: 'text-xanh', thanh: 'bg-xanh' },
  trinh_ky: { nhan: 'Đang trình ký', nen: 'bg-cam-nhat', chu: 'text-cam-dam', thanh: 'bg-cam' },
  hoan_thanh: { nhan: 'Hoàn thành', nen: 'bg-[#DCFCE7]', chu: 'text-[#166534]', thanh: 'bg-[#16A34A]' },
  tam_dung: { nhan: 'Tạm dừng', nen: 'bg-nen-3', chu: 'text-mo', thanh: 'bg-mo' },
};

export const NHOM_NV: Record<NhomNv, string> = {
  chuong_trinh_cong_tac: 'Chương trình công tác',
  viec_co_quan_thuong_truc: 'Việc của Cơ quan Thường trực',
  ket_luan_hop: 'Kết luận phiên họp',
  chi_tieu_da06: 'Chỉ tiêu Đề án 06',
  khac: 'Khác',
};

export const LINH_VUC: Record<LinhVuc, string> = {
  nq57: 'Nghị quyết 57',
  khcn_dmst: 'KHCN, đổi mới sáng tạo',
  chuyen_doi_so: 'Chuyển đổi số',
  de_an_06: 'Đề án 06',
  chung: 'Chung',
};

export type NhiemVu = {
  id: string; ma: string | null; nhom: NhomNv; linh_vuc: LinhVuc; ten: string; mo_ta: string | null;
  chu_tri_don_vi_id: string | null; chu_tri_ten: string | null; lanh_dao_phu_trach: string | null;
  han: string | null; san_pham: string | null; tham_quyen: string | null;
  can_cu_van_ban_id: string | null; can_cu_so_ky_hieu: string | null; chi_tieu_id: string | null; ket_luan_id: string | null; phien_hop_id: string | null;
  trang_thai: TrangThaiNv; phan_tram: number; trang_thai_giao: 'de_xuat' | 'da_duyet'; duyet_luc: string | null;
  da_cap_nhat_theodoinq: boolean; qua_han: boolean; con_ngay: number | null;
  phoi_hop_ids: string[] | null; cap_nhat_cuoi: string | null; so_tep: number; tao_luc: string;
};

export const COT_NV = 'id, ma, nhom, linh_vuc, ten, mo_ta, chu_tri_don_vi_id, chu_tri_ten, lanh_dao_phu_trach, han, san_pham, tham_quyen, can_cu_van_ban_id, can_cu_so_ky_hieu, chi_tieu_id, ket_luan_id, phien_hop_id, trang_thai, phan_tram, trang_thai_giao, duyet_luc, da_cap_nhat_theodoinq, qua_han, con_ngay, phoi_hop_ids, cap_nhat_cuoi, so_tep, tao_luc';

// Hạn nhiệm vụ là ngày: tính đến 17:00 ngày đó (giờ VN)
export const hanNv = (han: string) => `${han}T17:00:00+07:00`;

// "6 rõ" còn thiếu -> nhắc CQTT hoàn thiện trước khi trình duyệt
export function thieu6Ro(n: Pick<NhiemVu, 'ten' | 'chu_tri_don_vi_id' | 'lanh_dao_phu_trach' | 'han' | 'san_pham' | 'tham_quyen'>): string[] {
  const t: string[] = [];
  if (!n.chu_tri_don_vi_id) t.push('rõ người (đơn vị chủ trì)');
  if (!n.lanh_dao_phu_trach) t.push('rõ trách nhiệm (lãnh đạo phụ trách)');
  if (!n.han) t.push('rõ thời gian (hạn)');
  if (!n.san_pham) t.push('rõ sản phẩm');
  if (!n.tham_quyen) t.push('rõ thẩm quyền');
  return t;
}

// Bỏ dấu tiếng Việt để tìm kiếm
export const khongDau = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
