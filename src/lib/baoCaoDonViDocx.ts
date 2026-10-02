// Xuất văn bản trang A4 ra .docx đúng thể thức NĐ 30/2020 (văn bản Đảng theo HD 36) — cùng mô hình với màn hình.
import { AlignmentType, Document, Paragraph, Table, TextRun, UnderlineType } from 'docx';
import { bang2Cot, bangVien, center, FONT, run, SPACING, SZ, taiXuongDocx, TRANG_A4 } from './baoCaoDocx';
import { coVua, dong, dongNgay, dongSo, doanVan, kieuDong, type MoHinhA4 } from './baoCaoA4';

const dongHoa = (s: string, size: number, bold: boolean) => dong(s).map((x) => center([run(x.toUpperCase(), { size, bold })]));
const doan = (children: TextRun[]) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: SPACING, indent: { firstLine: 567 }, children });

function doanTuDo(p: string, tuDo?: boolean): Paragraph {
  const k = tuDo ? kieuDong(p) : 'thuong';
  if (k === 'nhan') { const i = p.indexOf(':') + 1; return doan([run(p.slice(0, i), { bold: true }), run(p.slice(i))]); }
  return doan([run(p, { bold: k === 'dam', italics: k === 'nghieng' })]);
}

export function taoDocxA4(m: MoHinhA4): Document {
  const co = m.dang ? 28 : 26;                            // 13 pt nhà nước, 14 pt Đảng (hạ 12 pt nếu dài)
  const trai = [
    ...dongHoa(m.cq, Math.min(co, coVua(m.cq, co / 2) * 2), false),
    ...dongHoa(m.bh, Math.min(co, coVua(m.bh, co / 2) * 2), true),
    m.dang ? center([run('*', { size: 28 })]) : center([run('__________', { size: 20, bold: true })]),
    center([run(dongSo(m).replace(/ /g, '    '), { size: m.dang ? 28 : SZ.soKh })], { before: 120 }),
  ];
  const ngayChu = dongNgay(m).replace(/ +/g, '     ');
  const phai = m.dang
    ? [center([run('ĐẢNG CỘNG SẢN VIỆT NAM', { size: 30, bold: true, underline: { type: UnderlineType.SINGLE } })]),
       center([run(ngayChu, { size: 28, italics: true })], { before: 360 })]
    : [center([run('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { size: 26, bold: true })]),
       center([run('Độc lập - Tự do - Hạnh phúc', { size: SZ.tieuNgu, bold: true, underline: { type: UnderlineType.SINGLE } })]),
       center([run(ngayChu, { size: SZ.ngayThang, italics: true })], { before: 200 })];

  const tieuDe = [
    ...(m.tenLoai ? [center([run(m.tenLoai, { bold: true, size: m.dang ? 30 : 28 })], { before: 360 })] : []),
    ...dong(m.trichYeu).map((t) => center([run(t, { bold: true })])),
    ...(m.dongPhu ? [center([run(m.dongPhu, { italics: true })])] : []),
    center([run('________', { bold: true, size: 20 })], { after: 120 }),
    ...(m.kinhGui ? dong(m.kinhGui).map((t) => center([run(t)], { before: 120, after: 120 })) : []),
  ];

  const noi: (Paragraph | Table)[] = [];
  for (const x of m.khoi) {
    if (x.loai === 'tieu_de') noi.push(doan([run(x.text, { bold: true })]));
    else if (x.loai === 'bang') {
      if (x.tieuDe) noi.push(doan([run(x.tieuDe, { italics: true })]));
      noi.push(bangVien(x.cot, x.dong, x.rong, x.cotTrai ?? [1]));
    } else if (x.loai === 'so') noi.push(doan([run(`${x.noiDung || '…'}${x.donViTinh ? ` ${x.donViTinh}` : ''}`)]));
    else {
      const ds = doanVan(x.noiDung);
      (ds.length ? ds : ['…']).forEach((p) => noi.push(doanTuDo(p, x.tuDo)));
    }
  }

  const kyTrai = [
    new Paragraph({ spacing: { before: 240, after: 0 }, children: [m.dang
      ? run('Nơi nhận:', { size: 28, underline: { type: UnderlineType.SINGLE } })
      : run('Nơi nhận:', { size: SZ.noiNhanLabel, bold: true, italics: true })] }),
    ...dong(m.noiNhan).map((t) => new Paragraph({ spacing: { before: 0, after: 0 }, children: [run(t, { size: m.dang ? 24 : SZ.noiNhan })] })),
  ];
  const kyPhai = [
    ...dong(m.chucDanh).map((x, i) => center([run(x.toUpperCase(), { size: m.dang ? 28 : SZ.chucDanh, bold: true })], i === 0 ? { before: 240 } : {})),
    ...Array.from({ length: 5 }, () => center([run('')])),
    center([run(m.hoTen, { size: SZ.hoTen, bold: true })]),
  ];

  return new Document({
    creator: 'Hệ thống điều hành BCĐ 57 phường Nam Đông Hà',
    styles: { default: { document: { run: { font: FONT, size: SZ.body } } } },
    sections: [{ properties: TRANG_A4, children: [bang2Cot(trai, phai), ...tieuDe, ...noi, bang2Cot(kyTrai, kyPhai)] }],
  });
}

export const taiDocxA4 = (m: MoHinhA4, tenFile: string) =>
  taiXuongDocx(taoDocxA4(m), `${tenFile.replace(/[\\/:*?"<>|]/g, '-')}.docx`);
export const taiBaoCaoDonVi = taiDocxA4;
