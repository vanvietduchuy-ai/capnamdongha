// Đọc file "Đánh giá các chỉ tiêu ĐA06" của Công an tỉnh -> dữ liệu nạp vào hàm da06_nhap_ky.
// Không phụ thuộc giao diện: chạy được trong trình duyệt và trong Node (để kiểm thử).
import * as XLSX from 'xlsx';

const MAU_DIA_PHUONG = /^(Xã|Phường|Đặc khu) /;
const DONG_TONG = /^(Tỉnh Quảng Trị|Tổng cộng|Tổng|Cộng)$/i;

type CauHinhSheet = {
  ma: string;
  sheet: string;
  tu: string[];          // cột tử số (nhiều cột = cộng lại)
  mau: string[];         // cột mẫu số
  danhGia: string;       // cột đánh giá
  tyLe: string;          // cột tỷ lệ (dòng tổng = trung bình tỉnh)
  nguong: number;        // mặc định theo danh mục; đọc lại từ tiêu đề nếu tỉnh đổi
  nguongDuoi: number | null;
  nhanCaoHonTb: boolean;
  tieuDeTu: string;      // từ khoá phải có ở tiêu đề cột tử số -> cảnh báo nếu tỉnh đổi bố cục
};

export const CAU_HINH_SHEET: CauHinhSheet[] = [
  { ma: 'DDDT', sheet: 'ĐDĐT8T', tu: ['D', 'F'], mau: ['C', 'E'], danhGia: 'J', tyLe: 'I', nguong: 1, nguongDuoi: 0.3, nhanCaoHonTb: true, tieuDeTu: 'kích hoạt' },
  { ma: 'SSK', sheet: 'SSKĐT-VNeID', tu: ['D'], mau: ['C'], danhGia: 'F', tyLe: 'E', nguong: 0.8, nguongDuoi: null, nhanCaoHonTb: false, tieuDeTu: 'tích hợp' },
  { ma: 'ASXH', sheet: 'ASXH-VNeID', tu: ['D'], mau: ['C'], danhGia: 'F', tyLe: 'E', nguong: 1, nguongDuoi: 0.3, nhanCaoHonTb: false, tieuDeTu: 'tích hợp' },
  { ma: 'BHXH', sheet: 'BHXH', tu: ['D'], mau: ['C'], danhGia: 'F', tyLe: 'E', nguong: 0.91, nguongDuoi: 0.3, nhanCaoHonTb: false, tieuDeTu: 'tài khoản' },
  { ma: 'BTXH', sheet: 'BTXH', tu: ['D'], mau: ['C'], danhGia: 'F', tyLe: 'E', nguong: 0.4, nguongDuoi: 0.3, nhanCaoHonTb: false, tieuDeTu: 'tài khoản' },
  { ma: 'NCC', sheet: 'NCC', tu: ['D'], mau: ['C'], danhGia: 'F', tyLe: 'E', nguong: 0.7, nguongDuoi: 0.3, nhanCaoHonTb: false, tieuDeTu: 'tài khoản' },
  { ma: 'DD_N1', sheet: 'Đất đai N1', tu: ['D'], mau: ['C'], danhGia: 'F', tyLe: 'E', nguong: 1, nguongDuoi: 0.5, nhanCaoHonTb: false, tieuDeTu: 'nhóm 1' },
  { ma: 'DD_N2', sheet: 'Đất đai N2', tu: ['D'], mau: ['C'], danhGia: 'F', tyLe: 'E', nguong: 0, nguongDuoi: 0.05, nhanCaoHonTb: false, tieuDeTu: 'nhóm 2' },
  { ma: 'DD_N23', sheet: 'Đất đai N2+N3', tu: ['D'], mau: ['C'], danhGia: 'F', tyLe: 'E', nguong: 0, nguongDuoi: 0.3, nhanCaoHonTb: false, tieuDeTu: 'nhóm 2+3' },
  { ma: 'DD_CHU_SD', sheet: 'Làm sạch Chủ SD', tu: ['D'], mau: ['C'], danhGia: 'G', tyLe: 'E', nguong: 1, nguongDuoi: 0.3, nhanCaoHonTb: false, tieuDeTu: 'kết quả' },
  { ma: 'DD_DON_DK', sheet: 'Lập đơn đăng ký', tu: ['D'], mau: ['C'], danhGia: 'G', tyLe: 'E', nguong: 1, nguongDuoi: 0.3, nhanCaoHonTb: false, tieuDeTu: 'kết quả' },
];

export type DongSoLieu = { ten: string; tu: number; mau: number; danh_gia: string | null; cot_phu: Record<string, [number, number]> | null };
export type ChiTieuKy = {
  ma: string; sheet: string; nguong: number; nguong_duoi: number | null; nhan_cao_hon_tb: boolean;
  so_lieu_tu: string | null; so_lieu_den: string | null; ngay_chot: string | null;
  co_so_lieu_moi: boolean; tb_tinh_file: number | null; dong: DongSoLieu[];
};
export type KetQuaDocFile = {
  ten: string; ngay_file: string; ten_file: string; drive_file_id: string | null;
  dia_phuong: { ten: string; loai: 'xa' | 'phuong' | 'dac_khu' }[];
  chi_tieu: ChiTieuKy[];
  diem: { ten: string; adn: number; lam_sach: number; diem_file: number | null; dvc: boolean }[];
  loi: { sheet: string; o: string; mo_ta: string; anh_huong: boolean }[];
  canh_bao: string[];   // không chặn nhập, chỉ hiện để người nhập xem lại
};

const so = (c?: XLSX.CellObject): number | null => (c && c.t === 'n' && typeof c.v === 'number' ? c.v : null);
const chu = (c?: XLSX.CellObject): string => (c && c.v != null ? String(c.v).trim() : '');
const o = (ws: XLSX.WorkSheet, cot: string, dong: number) => ws[`${cot}${dong}`] as XLSX.CellObject | undefined;

// "05/9/2026" | "05/9" -> "2026-09-05"
function ngayISO(s: string, namMacDinh: number): string | null {
  const m = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (!m) return null;
  const nam = m[3] ? Number(m[3]) : namMacDinh;
  return `${nam}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function vungDuLieu(ws: XLSX.WorkSheet) {
  const r = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:A1');
  return { dau: r.s.r + 1, cuoi: r.e.r + 1 };
}

// Toàn bộ chữ ở phần tiêu đề (trên dòng dữ liệu đầu tiên)
function tieuDe(ws: XLSX.WorkSheet, dongDau: number): string {
  const parts: string[] = [];
  for (let r = 1; r < dongDau; r++) for (const c of 'ABCDEFGHIJ') { const t = chu(o(ws, c, r)); if (t) parts.push(t); }
  return parts.join(' | ');
}

export function docFileTinh(data: ArrayBuffer | Uint8Array, tenFile: string, ngayFile: string, tenKy: string): KetQuaDocFile {
  const wb = XLSX.read(data, { type: 'array', cellFormula: true, cellNF: false });
  const nam = Number(ngayFile.slice(0, 4));
  const canhBao: string[] = [];
  const loi: KetQuaDocFile['loi'] = [];

  const th = wb.Sheets['Tổng hợp'];
  if (!th) throw new Error('Không thấy sheet "Tổng hợp" — có đúng file đánh giá Đề án 06 của tỉnh không?');

  // 1. Địa phương
  const diaPhuong: KetQuaDocFile['dia_phuong'] = [];
  const { dau: d0, cuoi: d1 } = vungDuLieu(th);
  for (let r = d0; r <= d1; r++) {
    const t = chu(o(th, 'B', r));
    if (MAU_DIA_PHUONG.test(t) && !diaPhuong.some((x) => x.ten === t)) {
      diaPhuong.push({ ten: t, loai: t.startsWith('Phường') ? 'phuong' : t.startsWith('Đặc khu') ? 'dac_khu' : 'xa' });
    }
  }
  if (!diaPhuong.some((x) => x.ten === 'Phường Nam Đông Hà')) canhBao.push('Không thấy "Phường Nam Đông Hà" trong sheet Tổng hợp.');

  // 2. Từng chỉ tiêu
  const chiTieu: ChiTieuKy[] = [];
  for (const ch of CAU_HINH_SHEET) {
    const ws = wb.Sheets[ch.sheet];
    if (!ws) { canhBao.push(`Thiếu sheet "${ch.sheet}" — bỏ qua chỉ tiêu ${ch.ma}.`); continue; }
    const { dau, cuoi } = vungDuLieu(ws);

    let dongDau = 0, dongTong = 0;
    const daGap = new Set<string>();
    const dong: DongSoLieu[] = [];
    for (let r = dau; r <= cuoi; r++) {
      const a = chu(o(ws, 'A', r)), b = chu(o(ws, 'B', r));
      if (dongDau && !dongTong && (DONG_TONG.test(a) || DONG_TONG.test(b))) { dongTong = r; continue; }
      if (!MAU_DIA_PHUONG.test(b)) continue;
      if (daGap.has(b)) continue;                       // bảng phụ phía dưới lặp tên
      if (dongTong) continue;
      if (!dongDau) dongDau = r;
      daGap.add(b);
      const tu = ch.tu.map((c) => so(o(ws, c, r)));
      const mau = ch.mau.map((c) => so(o(ws, c, r)));
      if ([...tu, ...mau].every((v) => v == null)) continue;
      const tuN = tu.map((v) => v ?? 0), mauN = mau.map((v) => v ?? 0);  // như hàm SUM của tỉnh
      const dg = o(ws, ch.danhGia, r);
      dong.push({
        ten: b,
        tu: tuN.reduce((x, y) => x + y, 0),
        mau: mauN.reduce((x, y) => x + y, 0),
        danh_gia: dg && dg.t === 's' ? String(dg.v).trim() : null,
        cot_phu: ch.tu.length > 1 ? Object.fromEntries(tuN.map((v, i) => [`cot_${i + 1}`, [v, mauN[i]] as [number, number]])) : null,
      });
    }

    const td = tieuDe(ws, dongDau || 12);
    const a1 = chu(o(ws, 'A', 1));
    if (!td.toLowerCase().includes(ch.tieuDeTu.toLowerCase())) {
      canhBao.push(`Sheet "${ch.sheet}": tiêu đề cột không còn chữ "${ch.tieuDeTu}" — tỉnh có thể đã đổi bố cục, cần kiểm tra số liệu.`);
    }

    // Mức giao: đọc lại từ tiêu đề nếu có ("Chỉ tiêu giao 91%", "đạt tỷ lệ tích hợp 80%")
    let nguong = ch.nguong;
    const mNguong = td.match(/(?:chỉ tiêu giao|đạt tỷ lệ[^|]*?)\s*(\d{2,3})\s*%/i);
    if (ch.nguong > 0 && mNguong) {
      const moi = Number(mNguong[1]) / 100;
      if (Math.abs(moi - ch.nguong) > 1e-9) { canhBao.push(`${ch.ma}: mức giao trong file là ${mNguong[1]}% (danh mục đang ${ch.nguong * 100}%) — dùng số trong file.`); nguong = moi; }
    }

    // Khoảng số liệu / ngày chốt
    const mKhoang = td.match(/từ\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+đến\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    let tuNgay: string | null = null, denNgay: string | null = null;
    if (mKhoang) { tuNgay = ngayISO(mKhoang[1], nam); denNgay = ngayISO(mKhoang[2], nam); }
    else {
      const cacNgay = [...td.matchAll(/\((?:tính đến\s*)?(\d{1,2}\/\d{1,2}(?:\/\d{4})?)\)|\s(\d{1,2}\/\d{1,2}(?:\/\d{4})?)\s*$/gim)]
        .map((m) => m[1] ?? m[2]).filter(Boolean);
      const ngayCot = [...td.matchAll(/(\d{1,2}\/\d{1,2})(?:\/(\d{4}))?/g)].map((m) => m[0]);
      const chon = cacNgay.at(-1) ?? ngayCot.at(-1);
      denNgay = chon ? ngayISO(chon, nam) : null;
    }

    const tb = dongTong ? so(o(ws, ch.tyLe, dongTong)) : null;
    if (!dongTong) canhBao.push(`Sheet "${ch.sheet}": không tìm thấy dòng tổng toàn tỉnh.`);

    // Lỗi: công thức ở cột tỷ lệ bị thiếu / ra lỗi
    let soLoi = 0;
    for (let r = dongDau; dongDau && r < (dongTong || cuoi + 1); r++) {
      const c = o(ws, ch.tyLe, r);
      if (MAU_DIA_PHUONG.test(chu(o(ws, 'B', r))) && c && c.t === 'e') soLoi++;
    }
    if (soLoi) loi.push({ sheet: ch.sheet, o: `${ch.tyLe}${dongDau}:${ch.tyLe}${dongTong - 1}`, mo_ta: `${soLoi} dòng ở cột tỷ lệ ra lỗi (#DIV/0!…) — trung bình tỉnh trong file có thể sai`, anh_huong: false });

    chiTieu.push({
      ma: ch.ma, sheet: ch.sheet, nguong, nguong_duoi: ch.nguongDuoi, nhan_cao_hon_tb: ch.nhanCaoHonTb,
      so_lieu_tu: tuNgay, so_lieu_den: denNgay, ngay_chot: denNgay,
      co_so_lieu_moi: !/chưa có số liệu mới/i.test(a1), tb_tinh_file: tb, dong,
    });
  }

  // 3. Tổng hợp: cột N (ADN), O (tồn làm sạch), P (điểm), Q (tồn tại DVC)
  const diem: KetQuaDocFile['diem'] = [];
  for (let r = d0; r <= d1; r++) {
    const t = chu(o(th, 'B', r));
    if (!MAU_DIA_PHUONG.test(t) || diem.some((x) => x.ten === t)) continue;
    diem.push({ ten: t, adn: so(o(th, 'N', r)) ?? 0, lam_sach: so(o(th, 'O', r)) ?? 0, diem_file: so(o(th, 'P', r)), dvc: chu(o(th, 'Q', r)).toUpperCase() === 'X' });
  }

  // 4. Lỗi công thức ở sheet Tổng hợp
  const c5 = o(th, 'C', 5);
  if (c5?.f && c5.f.includes('ĐDĐT8T') && /,\s*5\s*,/.test(c5.f)) {
    loi.push({ sheet: 'Tổng hợp', o: 'C5:C82', mo_ta: "Cột Kích hoạt định danh: VLOOKUP lấy cột thứ 5 (số tài khoản kích hoạt) thay vì cột Đánh giá, nên chỉ tiêu này không bị tính 'Chưa hoàn thành' cho địa phương nào", anh_huong: true });
  }
  let refLoi = 0;
  for (let r = d0; r <= d1; r++) { const c = o(th, 'I', r); if (c && c.t === 'e' && MAU_DIA_PHUONG.test(chu(o(th, 'B', r)))) refLoi++; }
  if (refLoi) loi.push({ sheet: 'Tổng hợp', o: 'I', mo_ta: `Cột Làm sạch CSDLQG đất đai ra lỗi ở ${refLoi} dòng (#REF!…), chỉ tiêu này không được tính điểm`, anh_huong: true });

  return { ten: tenKy, ngay_file: ngayFile, ten_file: tenFile, drive_file_id: null, dia_phuong: diaPhuong, chi_tieu: chiTieu, diem, loi, canh_bao: canhBao };
}

// Đoán ngày của file từ tên, vd "..._tháng 9 - 07.09.xlsx" -> 2026-09-07
export function doanNgayTuTenFile(ten: string, namHienTai: number): string | null {
  const m = ten.match(/(\d{1,2})[.\-_](\d{1,2})(?:[.\-_](\d{4}))?\.xlsx?$/i);
  if (!m) return null;
  const nam = m[3] ? Number(m[3]) : namHienTai;
  return `${nam}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
