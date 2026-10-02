export type ThuMuc = 'cap_tren_trung_uong' | 'cap_tren_tinh' | 'cap_tren_cong_an_tinh' | 'bcd_phuong_ban_hanh' | 'bao_cao_gui_cap_tren' | 'bao_cao_don_vi' | 'hop_bcd' | 'kiem_tra_giam_sat' | 'mau_bieu';
export type LoaiVb = 'nghi_quyet' | 'quyet_dinh' | 'chi_thi' | 'ket_luan' | 'ke_hoach' | 'chuong_trinh' | 'quy_che' | 'cong_van' | 'bao_cao' | 'to_trinh' | 'thong_bao' | 'giay_moi' | 'bien_ban' | 'khac';
export type TtVb = 'du_thao' | 'ban_hanh' | 'het_hieu_luc';

export const THU_MUC: Record<ThuMuc, string> = {
  cap_tren_trung_uong: 'Trung ương',
  cap_tren_tinh: 'Tỉnh ủy, BCĐ tỉnh',
  cap_tren_cong_an_tinh: 'Công an tỉnh',
  bcd_phuong_ban_hanh: 'BCĐ, Đảng ủy phường ban hành',
  bao_cao_gui_cap_tren: 'Báo cáo gửi cấp trên',
  bao_cao_don_vi: 'Báo cáo của đơn vị',
  hop_bcd: 'Hồ sơ họp BCĐ',
  kiem_tra_giam_sat: 'Kiểm tra, giám sát',
  mau_bieu: 'Mẫu biểu, hướng dẫn',
};

export const LOAI_VB: Record<LoaiVb, string> = {
  nghi_quyet: 'Nghị quyết', quyet_dinh: 'Quyết định', chi_thi: 'Chỉ thị', ket_luan: 'Kết luận', ke_hoach: 'Kế hoạch',
  chuong_trinh: 'Chương trình', quy_che: 'Quy chế', cong_van: 'Công văn', bao_cao: 'Báo cáo', to_trinh: 'Tờ trình',
  thong_bao: 'Thông báo', giay_moi: 'Giấy mời', bien_ban: 'Biên bản', khac: 'Khác',
};

export const TT_VB: Record<TtVb, { nhan: string; nen: string; chu: string }> = {
  du_thao: { nhan: 'Dự thảo', nen: 'bg-cam-nhat', chu: 'text-cam-dam' },
  ban_hanh: { nhan: 'Ban hành', nen: 'bg-xanh-nhat', chu: 'text-xanh' },
  het_hieu_luc: { nhan: 'Hết hiệu lực', nen: 'bg-nen-3', chu: 'text-mo' },
};

export type VanBan = {
  id: string; so_ky_hieu: string | null; ngay_ban_hanh: string | null; trich_yeu: string; co_quan_ban_hanh: string;
  loai: LoaiVb; thu_muc: ThuMuc; trang_thai: TtVb; drive_file_id: string | null; drive_url: string | null;
  nguoi_ky: string | null; ghi_chu: string | null; ten_tep: string | null; tai_len_luc: string;
};
export const COT_VB = 'id, so_ky_hieu, ngay_ban_hanh, trich_yeu, co_quan_ban_hanh, loai, thu_muc, trang_thai, drive_file_id, drive_url, nguoi_ky, ghi_chu, ten_tep, tai_len_luc';

export const linkVb = (v: Pick<VanBan, 'drive_file_id' | 'drive_url'>) =>
  v.drive_url || (v.drive_file_id ? `https://drive.google.com/file/d/${v.drive_file_id}/view` : null);

// Lấy id tệp từ đường dẫn Google Drive dán vào
export function idTuLinkDrive(s: string): string | null {
  const m = s.match(/\/d\/([A-Za-z0-9_-]{10,})/) ?? s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

// Thư mục -> sổ công văn của Cơ quan Thường trực
export const SO_THEO_THU_MUC = (t: ThuMuc): 'den' | 'di' | null =>
  t.startsWith('cap_tren') ? 'den' : ['bcd_phuong_ban_hanh', 'hop_bcd', 'bao_cao_gui_cap_tren'].includes(t) ? 'di' : null;
