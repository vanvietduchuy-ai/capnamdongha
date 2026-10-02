// Mô hình văn bản trình bày trên trang A4 (NĐ 30/2020; văn bản Đảng theo HD 36).
// Dùng chung cho: báo cáo đơn vị, báo cáo tổng hợp lĩnh vực (đầu mối), báo cáo gửi PV01, 4 hồ sơ họp BCĐ.
// Màn hình soạn/xem: components/TrangA4 · Xuất Word: lib/baoCaoDonViDocx
import { ngay } from './dinhDang';
import type { BangDa06 } from './duLieuBaoCao';

export type TruongMau = { ma: string; nhan: string; kieu: string; bat_buoc?: boolean; don_vi_tinh?: string; linh_vuc?: string };
export type DonViA4 = {
  ten: string; the_thuc?: 'nha_nuoc' | 'dang' | null;
  co_quan_chu_quan?: string | null; ten_ban_hanh?: string | null; ky_hieu?: string | null;
  nguoi_ky_chuc_danh?: string | null; nguoi_ky_ho_ten?: string | null;
};
export type KyA4 = { ten: string; loai: string; tu_ngay: string | null; den_ngay: string | null; han_nop: string; cap?: string | null };

// Khoá phần thể thức lưu trong so_lieu (bắt đầu bằng "_" để không lẫn với trường của mẫu biểu)
export type KhoaMeta = '_cq' | '_bh' | '_so' | '_kh' | '_ngay' | '_trich_yeu' | '_noi_nhan' | '_chuc_danh' | '_ho_ten' | '_kinh_gui';

// Khối nội dung
//  tieu_de: đề mục cố định (in đậm, không sửa) · van: đoạn văn soạn được · so: ô số · bang: bảng số liệu (chỉ xem)
//  van.tuDo = soạn tự do: dòng "I. …", "1. Tiêu đề" tự in đậm; "1. Nhãn: nội dung" in đậm phần nhãn; "(…)" in nghiêng
export type KhoiA4 =
  | { loai: 'tieu_de'; text: string; batBuoc?: boolean }
  | { loai: 'van'; ma: string; nhan: string; noiDung: string; goiY?: string; tuDo?: boolean }
  | { loai: 'so'; ma: string; nhan: string; noiDung: string; donViTinh?: string }
  | { loai: 'bang'; ma: string; tieuDe?: string; cot: string[]; rong: number[]; dong: string[][]; cotTrai?: number[] };

export type MoHinhA4 = {
  dang: boolean; cq: string; bh: string; so: string; kh: string; ngay: string; nam: number;
  tenLoai: string; trichYeu: string; trichYeuNhieuDong?: boolean; dongPhu: string; kinhGui?: string | null;
  khoi: KhoiA4[];
  noiNhan: string; chucDanh: string; hoTen: string;
};

export const NOI_NHAN_DON_VI = '- Thường trực BCĐ 57 phường;\n- Đầu mối lĩnh vực (Phòng VH-XH, Tổ CSKV);\n- Lưu: VT.';
export const NOI_NHAN_LINH_VUC = '- Thường trực BCĐ 57 phường;\n- Lưu: VT.';
export const LA_MA = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const LV_CDS = ['nq57', 'khcn_dmst', 'chuyen_doi_so'];
const GOI_Y: Record<string, string> = {
  ket_qua: 'Kết quả nổi bật, số liệu cụ thể trong kỳ…',
  ket_qua_da06: 'Kết quả Đề án 06: VNeID, làm sạch dữ liệu, dịch vụ công…',
  chi_dao: 'Việc đã đôn đốc, hướng dẫn các đơn vị…',
  kho_khan: 'Tồn tại, vướng mắc và nguyên nhân (nếu có)…',
  nhiem_vu_toi: 'Nhiệm vụ trọng tâm kỳ tới…',
  de_xuat: 'Đề xuất, kiến nghị (nếu có)…',
};

export const thangCuaKy = (ky: KyA4) => ky.ten.match(/tháng\s*(\d{1,2}\/\d{4})/i)?.[1]
  ?? (ky.loai === 'thang' && ky.den_ngay ? `${Number(ky.den_ngay.slice(5, 7))}/${ky.den_ngay.slice(0, 4)}` : null);

export function trichYeuMacDinh(ky: KyA4, linhVucDauMoi: string[] = []) {
  const thang = thangCuaKy(ky);
  if (ky.cap === 'linh_vuc') {
    const phan = [
      ...(linhVucDauMoi.some((x) => LV_CDS.includes(x)) ? ['Nghị quyết số 57-NQ/TW, chuyển đổi số'] : []),
      ...(linhVucDauMoi.includes('de_an_06') ? ['Đề án 06'] : []),
    ].join(' và ') || 'Nghị quyết số 57-NQ/TW và Đề án 06';
    return `Tổng hợp kết quả thực hiện ${phan}${thang ? ` tháng ${thang}` : ''}`;
  }
  if (thang) return `Kết quả thực hiện Nghị quyết số 57-NQ/TW và Đề án 06 tháng ${thang}`;
  const t = ky.ten.replace(/^báo cáo\s+/i, '').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const dongKyTu = (tu: string | null, den: string | null) => (tu && den ? `(Từ ngày ${ngay(tu)} đến ngày ${ngay(den)})` : '');

// Bảng Đề án 06 lưu kèm bài nộp (chốt tại thời điểm lưu)
export const docBang = (s?: string | null): BangDa06 | null => { try { return s ? JSON.parse(s) as BangDa06 : null; } catch { return null; } };
export const khoiBangDa06 = (b: BangDa06, ma = 'bang_da06'): KhoiA4 => ({
  loai: 'bang', ma, tieuDe: `Kết quả các chỉ tiêu Đề án 06 (Công an tỉnh chốt ngày ${b.ngayChot})`,
  cot: ['TT', 'Chỉ tiêu', 'Kết quả', 'Tỷ lệ', 'Mức giao', 'Đánh giá'], rong: [620, 2930, 1800, 950, 950, 1821], cotTrai: [1],
  dong: b.dong.map((r, i) => [String(i + 1), r.ten, r.ketQua, r.tyLe, r.mucGiao, r.danhGia]),
});

// ---------- Báo cáo của đơn vị / đầu mối theo mẫu biểu ----------
export function moHinhA4(ky: KyA4, dv: DonViA4, truong: TruongMau[], sl: Record<string, string> | null,
  o: { bang?: BangDa06 | null; linhVucDauMoi?: string[] } = {}): MoHinhA4 {
  const g = sl ?? {};
  const lay = (k: KhoaMeta, md: string) => (g[k] !== undefined && g[k] !== null ? String(g[k]) : md);
  const dang = dv.the_thuc === 'dang';
  const khoi: KhoiA4[] = [];
  let i = 0;
  for (const t of truong) {
    if (t.kieu === 'tep') continue;
    if (t.kieu === 'bang_da06') { if (o.bang?.dong.length) khoi.push(khoiBangDa06(o.bang, t.ma)); continue; }
    khoi.push({ loai: 'tieu_de', text: `${LA_MA[i] ?? i + 1}. ${t.nhan.toUpperCase()}`, batBuoc: t.bat_buoc });
    i++;
    if (t.kieu === 'van_ban') khoi.push({ loai: 'van', ma: t.ma, nhan: t.nhan, noiDung: String(g[t.ma] ?? ''), goiY: GOI_Y[t.ma] });
    else khoi.push({ loai: 'so', ma: t.ma, nhan: t.nhan, noiDung: String(g[t.ma] ?? ''), donViTinh: t.don_vi_tinh });
  }
  return {
    dang,
    cq: lay('_cq', dv.co_quan_chu_quan ?? ''),
    bh: lay('_bh', dv.ten_ban_hanh ?? dv.ten.toUpperCase()),
    so: lay('_so', ''),
    kh: lay('_kh', dv.ky_hieu ?? 'BC'),
    ngay: lay('_ngay', ''),
    nam: Number((g._ngay || ky.den_ngay || ky.han_nop).slice(0, 4)),
    tenLoai: 'BÁO CÁO',
    trichYeu: lay('_trich_yeu', trichYeuMacDinh(ky, o.linhVucDauMoi)),
    dongPhu: dongKyTu(ky.tu_ngay, ky.den_ngay),
    khoi,
    noiNhan: lay('_noi_nhan', ky.cap === 'linh_vuc' ? NOI_NHAN_LINH_VUC : NOI_NHAN_DON_VI),
    chucDanh: lay('_chuc_danh', dv.nguoi_ky_chuc_danh ?? 'THỦ TRƯỞNG ĐƠN VỊ'),
    hoTen: lay('_ho_ten', dv.nguoi_ky_ho_ten ?? ''),
  };
}

// Chốt phần thể thức (và bảng ĐA06) vào so_lieu khi lưu, để bản đã gửi không đổi theo cấu hình sau này
export const chotMeta = (m: MoHinhA4, gt: Record<string, string>, bang?: BangDa06 | null) => ({
  ...gt, _cq: m.cq, _bh: m.bh, _so: m.so, _kh: m.kh, _ngay: m.ngay, _trich_yeu: m.trichYeu,
  _noi_nhan: m.noiNhan, _chuc_danh: m.chucDanh, _ho_ten: m.hoTen,
  ...(bang ? { _bang_da06: JSON.stringify(bang) } : {}),
});

// Sửa một khoá của mô hình (văn bản soạn tự do: PV01, hồ sơ họp)
export function suaMoHinh(m: MoHinhA4, k: string, v: string): MoHinhA4 {
  const MAP: Record<string, keyof MoHinhA4> = {
    _cq: 'cq', _bh: 'bh', _so: 'so', _kh: 'kh', _ngay: 'ngay', _trich_yeu: 'trichYeu', _noi_nhan: 'noiNhan',
    _chuc_danh: 'chucDanh', _ho_ten: 'hoTen', _kinh_gui: 'kinhGui',
  };
  if (MAP[k]) return { ...m, [MAP[k]]: v };
  return { ...m, khoi: m.khoi.map((x) => ('ma' in x && x.ma === k && x.loai !== 'bang' ? { ...x, noiDung: v } : x)) };
}

// "Số: 12/BC-VHXH" (nhà nước) · "Số 12-BC/VPĐU" (Đảng)
export const dongSo = (m: MoHinhA4) => m.dang ? `Số ${m.so || '   '}-${m.kh}` : `Số: ${m.so || '    '}/${m.kh}`;

// NĐ 30: ngày dưới 10 và tháng 1, 2 thêm số 0
export function dongNgay(m: MoHinhA4, diaDanh = 'Nam Đông Hà') {
  if (!m.ngay) return `${diaDanh}, ngày    tháng    năm ${m.nam}`;
  const [y, mo, d] = m.ngay.split('-').map(Number);
  return `${diaDanh}, ngày ${String(d).padStart(2, '0')} tháng ${mo <= 2 ? String(mo).padStart(2, '0') : mo} năm ${y}`;
}

export const doanVan = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
export const dong = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
export const COT_DV_A4 = 'ten, the_thuc, co_quan_chu_quan, ten_ban_hanh, ky_hieu, nguoi_ky_chuc_danh, nguoi_ky_ho_ten';

// Tên cơ quan ở cột trái: dòng dài được hạ cỡ chữ (tối thiểu 12 pt) để nằm gọn một dòng
export function coVua(s: string, coGoc: number) {
  const dai = Math.max(0, ...dong(s).map((x) => x.length));
  return dai ? Math.max(12, Math.min(coGoc, Math.floor((13 * 24) / dai))) : coGoc;
}

// Kiểu dòng trong đoạn soạn tự do
export type KieuDong = 'dam' | 'nhan' | 'nghieng' | 'thuong';
export function kieuDong(t: string): KieuDong {
  const s = t.trim();
  if (/^[IVXL]+\.\s/.test(s)) return 'dam';
  if (/^\d+(\.\d+)*\.\s[^:]{1,50}:\s+\S/.test(s)) return 'nhan';
  if (/^\d+(\.\d+)*\.\s/.test(s) && s.length <= 110 && !/[.;,]$/.test(s)) return 'dam';
  if (/^\(.*\)$/.test(s)) return 'nghieng';
  return 'thuong';
}
