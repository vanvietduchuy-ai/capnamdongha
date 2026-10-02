// Xuất báo cáo tổng hợp gửi Công an tỉnh (PV01) — thể thức NĐ 30/2020 theo bộ thông số của Công an phường:
// A4, lề 2-2-3-2 cm, Times New Roman 14, căn đều, lùi đầu dòng 1 cm, giãn dòng 1,2, cách đoạn 6/6 pt.
import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';

export const FONT = 'Times New Roman';
export const SZ = { body: 28, coQuan: 24, tieuNgu: 28, soKh: 26, ngayThang: 28, bang: 26, noiNhanLabel: 24, noiNhan: 22, chucDanh: 26, hoTen: 28 };
export const SPACING = { line: 288, lineRule: 'auto' as const, before: 120, after: 120 };

export const run = (text: string, o: Record<string, unknown> = {}) => new TextRun({ text, font: FONT, size: SZ.body, ...o });
export const body = (text: string, o: { run?: Record<string, unknown> } = {}) =>
  new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: SPACING, indent: { firstLine: 567 }, children: [run(text, o.run)] });
export const dash = (text: string) => body('- ' + text);
export const H = (text: string) => body(text, { run: { bold: true } });
export const Hsub = (text: string) => body(text, { run: { bold: true, italics: true } });
export const center = (children: TextRun[], spacing: Record<string, number> = {}) =>
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 288, lineRule: 'auto', before: 0, after: 0, ...spacing }, children });

export const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
export const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
export const cell = (children: Paragraph[], width: number) =>
  new TableCell({ borders: noBorders, verticalAlign: VerticalAlign.TOP, width: { size: width, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children });
// Bảng hai cột không viền cho phần đầu và phần ký: nhô ra lề trái 1 cm để quốc hiệu 13 pt nằm gọn một dòng
export const bang2Cot = (trai: Paragraph[], phai: Paragraph[]) => new Table({
  width: { size: 10200, type: WidthType.DXA }, columnWidths: [4300, 5900], layout: TableLayoutType.FIXED,
  indent: { size: -567, type: WidthType.DXA },
  borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
  rows: [new TableRow({ children: [cell(trai, 4300), cell(phai, 5900)] })],
});

export function bangVien(headers: string[], rows: string[][], doRong: number[], cotTrai: number[] = [1]) {
  const thin = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const borders = { top: thin, bottom: thin, left: thin, right: thin };
  const mk = (t: string, bold: boolean, w: number, trai = false) => new TableCell({
    borders, width: { size: w, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ alignment: trai ? AlignmentType.LEFT : AlignmentType.CENTER, children: [run(t, { size: SZ.bang, bold })] })],
  });
  return new Table({
    width: { size: doRong.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: doRong, layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => mk(h, true, doRong[i])) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => mk(c, false, doRong[i], cotTrai.includes(i))) })),
    ],
  });
}

export type DauVaoBaoCao = {
  tenLoai?: string;                 // 'BÁO CÁO'
  trichYeu: string;                 // 'Kết quả thực hiện Nghị quyết 57-NQ/TW và Đề án 06 tháng 10/2026'
  kyTu?: string | null; kyDen?: string | null;   // 'dd/mm/yyyy'
  nam: number;
  donVi: { ten: string; ket_qua?: string; kho_khan?: string; nhiem_vu_toi?: string; de_xuat?: string }[];
  da06?: { ngayChot: string; dong: { ten: string; ketQua: string; tyLe: string; mucGiao: string; danhGia: string }[] } | null;
  nguoiKy?: { chucDanh: string; hoTen: string };
  noiNhan?: string[];
};

export const tachDoan = (s?: string) => (s ?? '').split(/\n+/).map((x) => x.trim()).filter(Boolean);

export function taoVanBanBaoCao(d: DauVaoBaoCao): Document {
  const trai = [
    center([run('CÔNG AN TỈNH QUẢNG TRỊ', { size: SZ.coQuan })]),
    center([run('CÔNG AN PHƯỜNG NAM ĐÔNG HÀ', { size: SZ.coQuan, bold: true })]),
    center([run('_______', { bold: true })]),
    center([run('Số:        /BC-CAP-TH', { size: SZ.soKh })], { before: 120 }),
  ];
  const phai = [
    center([run('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { size: SZ.coQuan, bold: true })]),
    center([run('Độc lập - Tự do - Hạnh phúc', { size: SZ.tieuNgu, bold: true })]),
    center([run('________________________', { bold: true })]),
    center([run(`Nam Đông Hà, ngày      tháng      năm ${d.nam}`, { size: SZ.ngayThang, italics: true })], { before: 120 }),
  ];

  const noi: (Paragraph | Table)[] = [];
  noi.push(H('I. CÔNG TÁC CHỈ ĐẠO, TRIỂN KHAI'));
  noi.push(body('…'));

  noi.push(H('II. KẾT QUẢ THỰC HIỆN'));
  let muc = 1;
  const coKetQua = d.donVi.filter((x) => tachDoan(x.ket_qua).length);
  if (coKetQua.length) {
    noi.push(H(`${muc++}. Kết quả thực hiện của các đơn vị`));
    for (const dv of coKetQua) {
      noi.push(Hsub(dv.ten));
      tachDoan(dv.ket_qua).forEach((p) => noi.push(body(p)));
    }
  }
  if (d.da06 && d.da06.dong.length) {
    noi.push(H(`${muc++}. Kết quả các chỉ tiêu Đề án 06 (theo số liệu Công an tỉnh chốt ngày ${d.da06.ngayChot})`));
    noi.push(bangVien(['TT', 'Chỉ tiêu', 'Kết quả', 'Tỷ lệ', 'Mức giao', 'Đánh giá'],
      d.da06.dong.map((r, i) => [String(i + 1), r.ten, r.ketQua, r.tyLe, r.mucGiao, r.danhGia]),
      [620, 2930, 1800, 950, 950, 1821]));
  }
  noi.push(H(`${muc}. An ninh mạng, an toàn thông tin`));
  noi.push(body('…'));

  const muc3 = d.donVi.filter((x) => tachDoan(x.kho_khan).length);
  noi.push(H('III. TỒN TẠI, VƯỚNG MẮC'));
  if (muc3.length) muc3.forEach((dv) => tachDoan(dv.kho_khan).forEach((p) => noi.push(dash(`${dv.ten}: ${p}`)))); else noi.push(body('…'));

  const muc4 = d.donVi.filter((x) => tachDoan(x.nhiem_vu_toi).length);
  noi.push(H('IV. NHIỆM VỤ TRỌNG TÂM THÁNG TỚI'));
  if (muc4.length) muc4.forEach((dv) => tachDoan(dv.nhiem_vu_toi).forEach((p) => noi.push(dash(p)))); else noi.push(body('…'));

  const muc5 = d.donVi.filter((x) => tachDoan(x.de_xuat).length);
  noi.push(H('V. ĐỀ XUẤT, KIẾN NGHỊ'));
  if (muc5.length) muc5.forEach((dv) => tachDoan(dv.de_xuat).forEach((p) => noi.push(dash(`${dv.ten}: ${p}`)))); else noi.push(body('…'));

  const noiNhan = d.noiNhan ?? ['- Công an tỉnh (qua PV01);', '- Ban Chỉ huy CAP;', '- Lưu: VT, TH.'];
  const kyTrai = [
    new Paragraph({ spacing: { before: 240 }, children: [run('Nơi nhận:', { size: SZ.noiNhanLabel, bold: true, italics: true })] }),
    ...noiNhan.map((t) => new Paragraph({ children: [run(t, { size: SZ.noiNhan })] })),
  ];
  const kyPhai = [
    center([run(d.nguoiKy?.chucDanh ?? 'TRƯỞNG CÔNG AN PHƯỜNG', { size: SZ.chucDanh, bold: true })], { before: 240 }),
    ...Array.from({ length: 5 }, () => center([run('')])),
    center([run(d.nguoiKy?.hoTen ?? '', { size: SZ.hoTen, bold: true })]),
  ];

  const tieuDe = [
    center([run(d.tenLoai ?? 'BÁO CÁO', { bold: true })], { before: 240 }),
    center([run(d.trichYeu, { bold: true })]),
    ...(d.kyTu && d.kyDen ? [center([run(`(Kỳ báo cáo từ ngày ${d.kyTu} đến ngày ${d.kyDen})`, { italics: true })])] : []),
    center([run('_______', { bold: true })]),
  ];

  return new Document({
    creator: 'Web BCĐ 57 phường Nam Đông Hà',
    styles: { default: { document: { run: { font: FONT, size: SZ.body } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 } } },
      children: [bang2Cot(trai, phai), ...tieuDe, ...noi, bang2Cot(kyTrai, kyPhai)],
    }],
  });
}

export async function taiXuongDocx(doc: Document, tenFile: string) {
  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = tenFile;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export const taiXuongBaoCao = (d: DauVaoBaoCao, tenFile: string) => taiXuongDocx(taoVanBanBaoCao(d), tenFile);

export const TRANG_A4 = { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 } } };
