// Đọc PDF văn bản đã ký, đóng dấu: lấy số, ký hiệu, ngày ban hành, loại, trích yếu, cơ quan ban hành, người ký.
//  · PDF có lớp chữ (xuất từ Word, ký số): đọc bằng pdf.js, có toạ độ để tách cột phần đầu / phần ký.
//  · Bản scan (ảnh): nhận dạng chữ tiếng Việt bằng tesseract.js (tải từ /ocr, chỉ trang đầu và trang cuối).
// Kết quả là gợi ý — người dùng kiểm tra, sửa trước khi lưu.
import type { LoaiVb } from './vanBan';

export type Dong = { text: string; x: number; y: number; w: number; co: number; dam?: boolean };      // 1 đoạn chữ trên 1 dòng (y tính từ trên); dam = in đậm (không rõ nếu undefined)
export type Trang = { rong: number; cao: number; dong: Dong[] };
export type MetaVb = {
  so_van_ban: string; ky_hieu: string; ngay_ban_hanh: string; loai: LoaiVb; trich_yeu: string;
  nguoi_ky: string; chuc_vu_nguoi_ky: string; co_quan_ban_hanh: string; noi_dung: string;
  mat: boolean; ocr: boolean; so_trang: number;
};
export const META_TRONG: MetaVb = {
  so_van_ban: '', ky_hieu: '', ngay_ban_hanh: '', loai: 'bao_cao', trich_yeu: '', nguoi_ky: '', chuc_vu_nguoi_ky: '',
  co_quan_ban_hanh: '', noi_dung: '', mat: false, ocr: false, so_trang: 0,
};

const nfc = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

// ---------- 1. Lấy chữ + toạ độ ----------
async function moPdf(file: File) {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}

type Muc = { str: string; x: number; y: number; w: number; co: number; dam?: boolean };
function ghepDong(muc: Muc[], rong: number): Dong[] {
  const ds = muc.filter((m) => m.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const dong: { y: number; co: number; muc: Muc[] }[] = [];
  for (const m of ds) {
    const d = dong.find((x) => Math.abs(x.y - m.y) <= Math.max(2, 0.45 * Math.min(x.co, m.co)));
    if (d) d.muc.push(m); else dong.push({ y: m.y, co: m.co, muc: [m] });
  }
  const kq: Dong[] = [];
  for (const d of dong) {
    const mm = d.muc.sort((a, b) => a.x - b.x);
    let cur: Dong | null = null;
    for (const m of mm) {
      const khoang = cur ? m.x - (cur.x + cur.w) : 0;
      // cách xa, hoặc vượt qua giữa trang = cột khác (phần đầu 2 cột, phần ký)
      if (cur && (khoang > 3 * d.co || (khoang > 1.2 * d.co && cur.x < rong * 0.45 && m.x > rong * 0.45))) { kq.push(cur); cur = null; }
      if (!cur) cur = { text: m.str, x: m.x, y: d.y, w: m.w, co: d.co, dam: m.dam };
      else {
        const can = khoang > 0.18 * d.co && !cur.text.endsWith(' ') && !m.str.startsWith(' ');
        cur.text += (can ? ' ' : '') + m.str; cur.w = m.x + m.w - cur.x;
        if (m.str.trim()) cur.dam = cur.dam === undefined || m.dam === undefined ? undefined : cur.dam && m.dam;
      }
    }
    if (cur) kq.push(cur);
  }
  return kq.map((x) => ({ ...x, text: nfc(x.text) })).filter((x) => x.text).sort((a, b) => a.y - b.y || a.x - b.x);
}

async function nhanDangAnh(canvas: HTMLCanvasElement, heSo: number, baoTienDo?: (s: string) => void): Promise<Dong[]> {
  const { createWorker } = await import('tesseract.js');
  const w = await createWorker('vie', 1, {
    workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr', gzip: true,
    logger: (m: { status: string; progress: number }) => baoTienDo?.(`Nhận dạng chữ: ${Math.round((m.progress ?? 0) * 100)}%`),
  });
  try {
    const { data } = await w.recognize(canvas, {}, { blocks: true });
    // Ghép lại từng từ theo toạ độ (tách được 2 cột phần đầu, phần ký như PDF có lớp chữ)
    const muc: Muc[] = [];
    for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) {
      const co = (l.bbox.y1 - l.bbox.y0) / heSo;
      for (const t of l.words) if (t.text.trim()) muc.push({ str: `${t.text} `, x: t.bbox.x0 / heSo, y: l.bbox.y0 / heSo, w: (t.bbox.x1 - t.bbox.x0) / heSo, co });
    }
    return ghepDong(muc, canvas.width / heSo);
  } finally { await w.terminate(); }
}

export async function docTrang(file: File, baoTienDo?: (s: string) => void): Promise<{ trang: Trang[]; ocr: boolean; soTrang: number }> {
  baoTienDo?.('Đang đọc PDF…');
  const pdf = await moPdf(file);
  const trang: Trang[] = [];
  const toiDa = Math.min(pdf.numPages, 30);
  for (let i = 1; i <= toiDa; i++) {
    const p = await pdf.getPage(i);
    const vp = p.getViewport({ scale: 1 });
    const tc = await p.getTextContent();
    // Nhận biết chữ đậm qua tên phông (chỉ trang đầu, trang cuối: phần đầu, trích yếu, phần ký)
    const canDam = i === 1 || i === pdf.numPages;
    if (canDam) await p.getOperatorList();
    const dam = (fn: string): boolean | undefined => {
      if (!canDam) return undefined;
      try { const f = p.commonObjs.get(fn) as { name?: string; bold?: boolean } | null; return f ? (!!f.bold || /bold|black|heavy|,b\b|-b\b/i.test(f.name ?? '')) : undefined; } catch { return undefined; }
    };
    const muc: Muc[] = [];
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const t = it.transform as number[];
      const co = Math.max(it.height || 0, Math.hypot(t[2], t[3])) || 12;
      muc.push({ str: it.str, x: t[4], y: vp.height - t[5] - co * 0.8, w: it.width, co, dam: dam(it.fontName) });
    }
    trang.push({ rong: vp.width, cao: vp.height, dong: ghepDong(muc, vp.width) });
  }
  const soChu = trang[0]?.dong.reduce((a, d) => a + d.text.length, 0) ?? 0;
  if (soChu >= 60) return { trang, ocr: false, soTrang: pdf.numPages };

  // Bản scan: nhận dạng trang đầu và trang cuối
  const can = [1, ...(pdf.numPages > 1 ? [pdf.numPages] : [])];
  const ocr: Trang[] = [];
  for (const [k, so] of can.entries()) {
    baoTienDo?.(`Bản scan — đang nhận dạng chữ trang ${so}…`);
    const p = await pdf.getPage(so);
    const heSo = 2.2;
    const vp = p.getViewport({ scale: heSo });
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    await p.render({ canvasContext: cv.getContext('2d')!, viewport: vp }).promise;
    const dong = await nhanDangAnh(cv, heSo, (s) => baoTienDo?.(`Trang ${so}/${pdf.numPages} · ${s}`));
    ocr.push({ rong: vp.width / heSo, cao: vp.height / heSo, dong });
    void k;
  }
  return { trang: ocr, ocr: true, soTrang: pdf.numPages };
}

// ---------- 2. Phân tích thể thức ----------
const TEN_LOAI: [RegExp, LoaiVb][] = [
  [/^BÁO CÁO$/, 'bao_cao'], [/^KẾ HOẠCH$/, 'ke_hoach'], [/^TỜ TRÌNH$/, 'to_trinh'], [/^THÔNG BÁO$/, 'thong_bao'],
  [/^QUYẾT ĐỊNH$/, 'quyet_dinh'], [/^GIẤY MỜI$/, 'giay_moi'], [/^BIÊN BẢN$/, 'bien_ban'], [/^CHƯƠNG TRÌNH$/, 'chuong_trinh'],
  [/^NGHỊ QUYẾT$/, 'nghi_quyet'], [/^CHỈ THỊ$/, 'chi_thi'], [/^KẾT LUẬN$/, 'ket_luan'], [/^QUY CHẾ$/, 'quy_che'],
  [/^(HƯỚNG DẪN|ĐỀ ÁN|PHƯƠNG ÁN|CÔNG ĐIỆN)$/, 'khac'],
];
const LOAI_THEO_KY_HIEU: Record<string, LoaiVb> = {
  BC: 'bao_cao', KH: 'ke_hoach', TTR: 'to_trinh', TB: 'thong_bao', QĐ: 'quyet_dinh', GM: 'giay_moi', BB: 'bien_ban',
  CTR: 'chuong_trinh', NQ: 'nghi_quyet', CT: 'chi_thi', KL: 'ket_luan', QC: 'quy_che', CV: 'cong_van',
};
const laVach = (t: string) => /^[_\-–—*.·\s]+$/.test(t);
const laHoa = (t: string) => /\p{L}/u.test(t) && t === t.toUpperCase();
const hoaChuDau = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const cauThuong = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t);
const TEN_NGUOI = /^(?:(?:Đại|Thượng|Trung|Thiếu)\s+(?:tướng|tá|úy|uý)\s+)?\p{Lu}\p{Ll}*(?:\s+\p{Lu}\p{Ll}*){1,5}$/u;

export function phanTich(trang: Trang[], ocr = false, soTrang = trang.length): MetaVb {
  const m: MetaVb = { ...META_TRONG, ocr, so_trang: soTrang };
  const p1 = trang[0];
  if (!p1) return m;
  const W = p1.rong;
  const d1 = p1.dong;
  const chu1 = d1.map((d) => d.text).join('\n');
  m.noi_dung = trang.map((t) => t.dong.map((d) => d.text).join('\n')).join('\n\n').slice(0, 200000);

  // Độ mật (không lưu văn bản mật)
  const dau = d1.filter((d) => d.y < p1.cao * 0.35).map((d) => d.text).join('\n');
  m.mat = /(^|\s)(TUYỆT MẬT|TỐI MẬT)(\s|$)/m.test(dau) || d1.some((d) => d.y < p1.cao * 0.3 && /^MẬT$/.test(d.text));

  // Số, ký hiệu: "Số: 15/BC-VHXH" (NĐ 30) · "Số 12-BC/VPĐU" (Đảng)
  const dang = /ĐẢNG CỘNG SẢN VIỆT NAM/.test(chu1);
  const reDang = /Số\s*[:.]?\s*(\d+)\s*-\s*(\p{Lu}[\p{Lu}\p{Ll}\d]*\s*\/\s*[\p{Lu}\p{Ll}\d.\-/()]+)/u;
  const reNN = /Số\s*[:.]?\s*(\d+)\s*\/\s*(\p{Lu}[\p{Lu}\p{Ll}\d.\-/()]*)/u;
  const so = (dang ? chu1.match(reDang) ?? chu1.match(reNN) : chu1.match(reNN) ?? chu1.match(reDang));
  if (so) { m.so_van_ban = so[1]; m.ky_hieu = so[2].replace(/\s+/g, ''); }

  // Ngày ban hành
  const ng = chu1.match(/ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm[\s\S]{0,12}?(\d{4})/i);
  if (ng) m.ngay_ban_hanh = `${ng[3]}-${ng[2].padStart(2, '0')}-${ng[1].padStart(2, '0')}`;

  // Tên loại + trích yếu; yThan = nơi bắt đầu phần nội dung
  let yThan = -1;
  const iLoai = d1.findIndex((d) => TEN_LOAI.some(([re]) => re.test(d.text.toUpperCase().replace(/\s+/g, ' '))));
  if (iLoai >= 0) {
    m.loai = TEN_LOAI.find(([re]) => re.test(d1[iLoai].text.toUpperCase()))![1];
    const ty: string[] = [];
    let yTruoc = d1[iLoai].y, co = d1[iLoai].co;
    const leTrai = Math.min(...d1.map((d) => d.x));
    const coDam = d1.some((d) => d.dam !== undefined);
    for (let j = iLoai + 1; j < d1.length && ty.length < 4; j++) {
      const d = d1[j];
      if (laVach(d.text) || d.y - yTruoc > 2.6 * co) break;
      if (coDam ? d.dam === false : (d.x < leTrai + W * 0.08 || Math.abs(d.x + d.w / 2 - W * 0.54) > W * 0.1)) break;   // trích yếu: in đậm, căn giữa
      if (/^(Căn cứ|Kính gửi|Thực hiện|Theo |Trên cơ sở|Phần |I\.|1\.|\(Từ ngày|\(Kỳ)/i.test(d.text)) break;
      ty.push(d.text.replace(/[_\-–—]{3,}$/, '').trim()); yTruoc = d.y; co = d.co;
    }
    m.trich_yeu = hoaChuDau(ty.join(' ').trim());
    yThan = yTruoc + 0.5 * co;
  } else {
    // Công văn: "V/v …" dưới số, ký hiệu (cột trái)
    const iVv = d1.findIndex((d) => /^V\/v\b/i.test(d.text));
    if (iVv >= 0) {
      m.loai = 'cong_van';
      const ty = [d1[iVv].text.replace(/^V\/v\s*/i, '')];
      let yTruoc = d1[iVv].y;
      for (const d of d1.slice(iVv + 1).filter((x) => x.x + x.w / 2 < W * 0.5)) {      // chỉ cột trái (dưới số, ký hiệu)
        if (ty.length >= 4 || d.y - yTruoc > 2.6 * d.co || laVach(d.text) || /^Kính gửi/i.test(d.text)) break;
        ty.push(d.text); yTruoc = d.y;
      }
      m.trich_yeu = hoaChuDau(ty.join(' ').trim());
    }
    const kg = d1.filter((d) => /^Kính gửi/i.test(d.text));
    yThan = kg.length ? kg[kg.length - 1].y + 0.5 * kg[kg.length - 1].co : (d1.find((d) => /ngày\s*\d/.test(d.text))?.y ?? 0);
  }
  if (m.ky_hieu && (iLoai < 0 || m.loai === 'khac')) {
    const tien = m.ky_hieu.split(/[-/]/)[0].toUpperCase();
    if (LOAI_THEO_KY_HIEU[tien]) m.loai = LOAI_THEO_KY_HIEU[tien];
  }

  // Cơ quan ban hành: cột trái phần đầu, trên dòng "Số"
  const ySo = d1.find((d) => /^Số\b/.test(d.text))?.y ?? p1.cao * 0.2;
  const trai = d1.filter((d) => d.y < ySo - 1 && d.x + d.w / 2 < W * 0.5 && laHoa(d.text) && !laVach(d.text) && d.text.replace(/[^\p{L}]/gu, '').length >= 3 && !/CỘNG HÒA|ĐẢNG CỘNG SẢN/.test(d.text));
  const dam = trai.filter((d) => d.dam);                                         // tên cơ quan ban hành in đậm
  if (dam.length) m.co_quan_ban_hanh = dam.map((d) => d.text).join(' ');
  else if (trai.length) m.co_quan_ban_hanh = trai[trai.length - 1].text;

  // Phần nội dung (giữa trích yếu và "Nơi nhận"): dùng để tìm kiếm, tổng hợp báo cáo chung
  if (yThan >= 0) {
    const than: string[] = [];
    trang.forEach((t, i) => {
      const iNN = t.dong.findIndex((d) => /^Nơi nhận/i.test(d.text));
      const ds = (iNN >= 0 ? t.dong.slice(0, iNN) : t.dong).filter((d) => i > 0 || d.y > yThan);
      than.push(...ds.filter((d) => !laVach(d.text) && !/^Kính gửi/i.test(d.text) && !/^-?\s*\d{1,3}\s*-?$/.test(d.text)).map((d) => d.text));
    });
    if (than.length) m.noi_dung = than.join('\n').slice(0, 200000);
  }

  // Người ký, chức vụ: cột phải phần cuối (ngang dòng "Nơi nhận" trở xuống) của trang cuối
  const pc = trang[trang.length - 1];
  const yNN = pc.dong.find((d) => /^Nơi nhận/i.test(d.text))?.y ?? pc.cao * 0.45;
  const phai = pc.dong.filter((d) => d.y >= yNN - 30 && d.x + d.w / 2 > pc.rong * 0.5);
  const ten = [...phai].reverse().find((d) => TEN_NGUOI.test(d.text) && !laHoa(d.text));
  if (ten) {
    m.nguoi_ky = ten.text;
    const cv = phai.filter((d) => d.y < ten.y && laHoa(d.text) && !laVach(d.text));
    const cuoi = cv[cv.length - 1]?.text.replace(/^(KT|TM|TL|TUQ|Q|T\/M|K\/T)[.\s]+/i, '').trim();
    if (cuoi) m.chuc_vu_nguoi_ky = cauThuong(cuoi);
  }
  return m;
}

export async function docVanBanPdf(file: File, baoTienDo?: (s: string) => void): Promise<MetaVb> {
  const { trang, ocr, soTrang } = await docTrang(file, baoTienDo);
  return phanTich(trang, ocr, soTrang);
}

// '15' + 'BC-VHXH' -> '15/BC-VHXH' · '12' + 'BC/VPĐU' -> '12-BC/VPĐU' (khớp hàm so_ky_hieu_ghep trong CSDL)
export function soKyHieu(so: string, kh: string) {
  if (!so) return kh; if (!kh) return so;
  const g = kh.indexOf('/'), n = kh.indexOf('-');
  return g > 0 && (n < 0 || g < n) ? `${so}-${kh}` : `${so}/${kh}`;
}
