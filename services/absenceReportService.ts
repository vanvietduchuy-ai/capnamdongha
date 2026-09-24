/**
 * BÁO CÁO CÁN BỘ VẮNG MẶT
 * - Tổng hợp số liệu từ các phiên điểm danh hội nghị
 * - Xuất Excel (.xlsx) và Word (.docx) đúng thể thức NĐ 30/2020/NĐ-CP
 *   theo bộ thông số đã chốt của Công an phường Nam Đông Hà.
 *
 * Các thư viện nặng (xlsx, docx) chỉ được tải khi bấm xuất file.
 */
import { AttendanceAbsence, AttendanceRecord, AttendanceSession, User, UserDepartment, UserRole, sessionTime } from '../types';

/* ============================ MÔ HÌNH SỐ LIỆU ============================ */

export interface SessionSummary {
  session: AttendanceSession;
  expected: number;
  present: number;
  absent: number;
  guests: number;
  rate: number; // % có mặt
}

export interface AbsenceRow {
  session: AttendanceSession;
  userId: string;
  fullName: string;
  position: string;
  department: string;
  absence?: AttendanceAbsence;
}

export interface OfficerSummary {
  userId: string;
  fullName: string;
  position: string;
  department: string;
  times: number;
  excused: number;
  unexcused: number;
  pending: number;
}

export interface AbsenceReport {
  fromMs: number;
  toMs: number;
  sessions: SessionSummary[];
  rows: AbsenceRow[];
  byOfficer: OfficerSummary[];
  totals: {
    sessions: number;
    expected: number;
    present: number;
    absent: number;
    excused: number;
    unexcused: number;
    pending: number;
    rate: number;
  };
}

export interface SignerInfo {
  chucDanh: string; // VD: TRƯỞNG CÔNG AN PHƯỜNG
  hoTen: string;
}

const ROLE_LABEL: Record<string, string> = {
  [UserRole.ADMIN]: 'Quản trị viên',
  [UserRole.CHIEF]: 'Trưởng Công an phường',
  [UserRole.DEPUTY_CHIEF]: 'Phó Trưởng Công an phường',
  [UserRole.MANAGER]: 'Tổ trưởng',
  [UserRole.DEPUTY]: 'Tổ phó',
  [UserRole.OFFICER]: 'Cán bộ'
};

const DEPT_ORDER: string[] = [
  UserDepartment.PHU_TRACH_CHUNG,
  UserDepartment.TONG_HOP,
  UserDepartment.AN_NINH,
  UserDepartment.CSKV,
  UserDepartment.CSTT,
  UserDepartment.PCTP
];

const ROLE_ORDER: string[] = [
  UserRole.CHIEF, UserRole.DEPUTY_CHIEF, UserRole.MANAGER, UserRole.DEPUTY, UserRole.OFFICER, UserRole.ADMIN
];

export const positionOf = (u?: User) => (u?.position && u.position.trim()) || (u ? ROLE_LABEL[u.role] || '' : '');

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
export const fmtDateTime = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${fmtDate(ms)}`;
};
const fileStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
};

export const absenceStatusText = (a?: AttendanceAbsence): string => {
  const reason = (a?.reason || '').trim();
  if (!a || a.excused === null || a.excused === undefined) return reason ? `Chưa xác minh (${reason})` : 'Chưa xác minh';
  if (a.excused) return reason ? `Có lý do: ${reason}` : 'Có lý do';
  return reason ? `Không lý do (${reason})` : 'Không lý do';
};

/** Dựng số liệu báo cáo từ dữ liệu thô */
export const buildAbsenceReport = (
  sessions: AttendanceSession[],
  records: AttendanceRecord[],
  absences: AttendanceAbsence[],
  users: User[],
  fromMs: number,
  toMs: number
): AbsenceReport => {
  const userMap = new Map(users.map(u => [u.id, u]));
  const absMap = new Map(absences.map(a => [`${a.sessionId}__${a.userId}`, a]));
  const sorted = [...sessions].sort((a, b) => sessionTime(a) - sessionTime(b));

  const summaries: SessionSummary[] = [];
  const rows: AbsenceRow[] = [];

  for (const s of sorted) {
    const expectedIds = Array.isArray(s.expectedUserIds) ? s.expectedUserIds : [];
    const checked = new Set(records.filter(r => r.sessionId === s.id).map(r => r.userId));
    const present = expectedIds.filter(id => checked.has(id)).length;
    const guests = Array.from(checked).filter(id => !expectedIds.includes(id)).length;
    const absentIds = expectedIds.filter(id => !checked.has(id));

    summaries.push({
      session: s,
      expected: expectedIds.length,
      present,
      absent: absentIds.length,
      guests,
      rate: expectedIds.length ? Math.round((present / expectedIds.length) * 1000) / 10 : 0
    });

    for (const id of absentIds) {
      const u = userMap.get(id);
      rows.push({
        session: s,
        userId: id,
        fullName: u?.fullName || `(Tài khoản đã xoá: ${id})`,
        position: positionOf(u),
        department: u?.department || '',
        absence: absMap.get(`${s.id}__${id}`)
      });
    }
  }

  const rank = (r: { department: string; userId: string }) => {
    const u = userMap.get(r.userId);
    const d = DEPT_ORDER.indexOf(r.department);
    const ro = ROLE_ORDER.indexOf(u?.role || UserRole.OFFICER);
    return (d < 0 ? 99 : d) * 100 + (ro < 0 ? 99 : ro);
  };

  rows.sort((a, b) =>
    sessionTime(a.session) - sessionTime(b.session) ||
    rank(a) - rank(b) ||
    a.fullName.localeCompare(b.fullName, 'vi')
  );

  const officerMap = new Map<string, OfficerSummary>();
  for (const r of rows) {
    const o = officerMap.get(r.userId) || {
      userId: r.userId, fullName: r.fullName, position: r.position, department: r.department,
      times: 0, excused: 0, unexcused: 0, pending: 0
    };
    o.times++;
    if (r.absence?.excused === true) o.excused++;
    else if (r.absence?.excused === false) o.unexcused++;
    else o.pending++;
    officerMap.set(r.userId, o);
  }
  const byOfficer = Array.from(officerMap.values()).sort((a, b) =>
    b.times - a.times || rank(a) - rank(b) || a.fullName.localeCompare(b.fullName, 'vi')
  );

  const expected = summaries.reduce((n, s) => n + s.expected, 0);
  const present = summaries.reduce((n, s) => n + s.present, 0);
  const absent = summaries.reduce((n, s) => n + s.absent, 0);

  return {
    fromMs, toMs,
    sessions: summaries,
    rows,
    byOfficer,
    totals: {
      sessions: summaries.length,
      expected, present, absent,
      excused: rows.filter(r => r.absence?.excused === true).length,
      unexcused: rows.filter(r => r.absence?.excused === false).length,
      pending: rows.filter(r => r.absence?.excused !== true && r.absence?.excused !== false).length,
      rate: expected ? Math.round((present / expected) * 1000) / 10 : 0
    }
  };
};

const isSingle = (rep: AbsenceReport) => rep.sessions.length === 1;

const periodText = (rep: AbsenceReport) => {
  if (isSingle(rep)) return `tại ${rep.sessions[0].session.title}`;
  const from = fmtDate(rep.fromMs);
  const to = fmtDate(rep.toMs);
  return from === to
    ? `tại các hội nghị, cuộc họp ngày ${from}`
    : `tại các hội nghị, cuộc họp từ ngày ${from} đến ngày ${to}`;
};

const pctText = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

/* ================================ EXCEL ================================ */

export const exportAbsenceExcel = async (rep: AbsenceReport) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const title = `KẾT QUẢ ĐIỂM DANH VÀ DANH SÁCH CÁN BỘ VẮNG MẶT ${periodText(rep).toUpperCase()}`;
  const header = [
    ['CÔNG AN TỈNH QUẢNG TRỊ'],
    ['CÔNG AN PHƯỜNG NAM ĐÔNG HÀ'],
    [],
  ];

  // --- Sheet 1: Danh sách vắng mặt ---
  const s1: any[][] = [
    ...header,
    [title],
    [`Xuất lúc: ${fmtDateTime(Date.now())}`],
    [],
    ['STT', 'Họ và tên', 'Chức vụ', 'Tổ công tác', 'Hội nghị, cuộc họp', 'Thời gian', 'Tình trạng', 'Lý do / Ghi chú']
  ];
  rep.rows.forEach((r, i) => {
    const st = r.absence?.excused === true ? 'Có lý do' : r.absence?.excused === false ? 'Không lý do' : 'Chưa xác minh';
    s1.push([i + 1, r.fullName, r.position, r.department, r.session.title, fmtDateTime(sessionTime(r.session)), st, r.absence?.reason || '']);
  });
  if (rep.rows.length === 0) s1.push(['', 'Không có cán bộ vắng mặt.']);
  s1.push([]);
  s1.push(['', `Tổng số lượt vắng: ${rep.totals.absent} (có lý do: ${rep.totals.excused}; không lý do: ${rep.totals.unexcused}; chưa xác minh: ${rep.totals.pending})`]);
  const ws1 = XLSX.utils.aoa_to_sheet(s1);
  ws1['!cols'] = [{ wch: 5 }, { wch: 26 }, { wch: 22 }, { wch: 16 }, { wch: 36 }, { wch: 17 }, { wch: 14 }, { wch: 36 }];
  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 7 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 7 } }
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Danh sách vắng mặt');

  // --- Sheet 2: Tổng hợp theo phiên ---
  const s2: any[][] = [
    ...header,
    ['TỔNG HỢP KẾT QUẢ ĐIỂM DANH THEO HỘI NGHỊ, CUỘC HỌP'],
    [],
    ['STT', 'Hội nghị, cuộc họp', 'Thời gian', 'Triệu tập', 'Có mặt', 'Vắng mặt', 'Tỷ lệ có mặt (%)', 'Khách mời']
  ];
  rep.sessions.forEach((s, i) => {
    s2.push([i + 1, s.session.title, fmtDateTime(sessionTime(s.session)), s.expected, s.present, s.absent, s.rate, s.guests]);
  });
  s2.push(['', 'CỘNG', '', rep.totals.expected, rep.totals.present, rep.totals.absent, rep.totals.rate,
    rep.sessions.reduce((n, s) => n + s.guests, 0)]);
  const ws2 = XLSX.utils.aoa_to_sheet(s2);
  ws2['!cols'] = [{ wch: 5 }, { wch: 40 }, { wch: 17 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 10 }];
  ws2['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 7 } }
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Tổng hợp theo phiên');

  // --- Sheet 3: Tổng hợp theo cán bộ ---
  const s3: any[][] = [
    ...header,
    ['TỔNG HỢP SỐ LẦN VẮNG MẶT THEO CÁN BỘ'],
    [],
    ['STT', 'Họ và tên', 'Chức vụ', 'Tổ công tác', 'Số lần vắng', 'Có lý do', 'Không lý do', 'Chưa xác minh']
  ];
  rep.byOfficer.forEach((o, i) => {
    s3.push([i + 1, o.fullName, o.position, o.department, o.times, o.excused, o.unexcused, o.pending]);
  });
  if (rep.byOfficer.length === 0) s3.push(['', 'Không có cán bộ vắng mặt.']);
  const ws3 = XLSX.utils.aoa_to_sheet(s3);
  ws3['!cols'] = [{ wch: 5 }, { wch: 26 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
  ws3['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 7 } }
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'Tổng hợp theo cán bộ');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `BaoCao_CanBoVangMat_${fileStamp()}.xlsx`
  );
};

/* ================================ WORD ================================= */
/* Thông số theo skill trinh-bay-vbhc-cap (NĐ30): TNR 14, căn đều, thụt 1cm,
   giãn dòng 1,2, cách đoạn 6/6pt, lề 2-2-3-2 cm, A4.                      */

export const buildAbsenceDocx = async (rep: AbsenceReport, signer: SignerInfo): Promise<Blob> => {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, VerticalAlign
  } = await import('docx');

  const FONT = 'Times New Roman';
  const SZ = { body: 28, coQuan: 26, coQuanDai: 24, tieuNgu: 28, soKh: 26, ngayThang: 28, bang: 26, noiNhanLabel: 24, noiNhan: 22, chucDanh: 26, hoTen: 28 };
  const SPACING = { line: 288, lineRule: 'auto' as const, before: 120, after: 120 };
  const TEXT_W = 9071; // 11906 - 1701 - 1134

  const run = (text: string, opts: any = {}) => new TextRun({ text, font: FONT, size: SZ.body, ...opts });
  const body = (text: string, opts: any = {}) => new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { ...SPACING },
    indent: { firstLine: 567 },
    children: [run(text, opts.run)],
    ...opts.para
  });
  const H = (text: string) => body(text, { run: { bold: true } });
  const center = (children: any[], opts: any = {}) => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: 288, lineRule: 'auto', before: 0, after: 0 },
    children, ...opts
  });

  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  const cell = (children: any[], width: number) => new TableCell({
    borders: noBorders, verticalAlign: VerticalAlign.TOP,
    width: { size: width, type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    children
  });

  // ---------- Masthead ----------
  const masthead = new Table({
    width: { size: 9355, type: WidthType.DXA },
    columnWidths: [4150, 5205],
    borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({
      children: [
        cell([
          center([run('CÔNG AN TỈNH QUẢNG TRỊ', { size: SZ.coQuan })]),
          center([run('CÔNG AN PHƯỜNG NAM ĐÔNG HÀ', { size: SZ.coQuanDai, bold: true })]),
          center([run('_______', { bold: true })]),
          center([run('Số:        /BC-CAP-TH', { size: SZ.soKh })], { spacing: { before: 120 } })
        ], 4150),
        cell([
          center([run('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { size: SZ.coQuanDai, bold: true })]),
          center([run('Độc lập - Tự do - Hạnh phúc', { size: SZ.tieuNgu, bold: true })]),
          center([run('________________________', { bold: true })]),
          center([run(`Nam Đông Hà, ngày      tháng      năm ${new Date().getFullYear()}`, { size: SZ.ngayThang, italics: true })],
            { spacing: { before: 120 } })
        ], 5205)
      ]
    })]
  });

  // ---------- Tên loại + trích yếu ----------
  const titleBlock = [
    center([run('BÁO CÁO', { bold: true })], { spacing: { before: 240 } }),
    center([run('Kết quả điểm danh và danh sách cán bộ vắng mặt', { bold: true })]),
    center([run(periodText(rep), { bold: true })]),
    center([run('_______', { bold: true })], { spacing: { after: 120 } })
  ];

  // ---------- Bảng số liệu (viền mảnh, 13pt) ----------
  const thin = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const borders = { top: thin, bottom: thin, left: thin, right: thin };
  type Align = 'C' | 'L';
  const dataTable = (headers: string[], rows: string[][], widths: number[], aligns: Align[]) => {
    const mk = (t: string, bold: boolean, w: number, a: Align) => new TableCell({
      borders,
      width: { size: w, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [new Paragraph({
        alignment: bold || a === 'C' ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [run(t, { size: SZ.bang, bold })]
      })]
    });
    return new Table({
      width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
      columnWidths: widths,
      rows: [
        new TableRow({ tableHeader: true, children: headers.map((h, i) => mk(h, true, widths[i], 'C')) }),
        ...rows.map(r => new TableRow({ cantSplit: true, children: r.map((c, i) => mk(c, false, widths[i], aligns[i])) }))
      ]
    });
  };
  const spacer = () => new Paragraph({ spacing: { before: 0, after: 0 }, children: [run('', { size: 12 })] });

  const t = rep.totals;
  const single = isSingle(rep);
  const children: any[] = [masthead, ...titleBlock];

  // I. KẾT QUẢ ĐIỂM DANH
  children.push(H('I. KẾT QUẢ ĐIỂM DANH'));
  if (single) {
    const s = rep.sessions[0];
    children.push(body(
      `Thời gian mở điểm danh: ${fmtDateTime(sessionTime(s.session)).replace(' ', ' ngày ')}. ` +
      `Tổng số cán bộ được triệu tập: ${s.expected} đồng chí; có mặt: ${s.present} đồng chí (đạt ${pctText(s.rate)}%); ` +
      `vắng mặt: ${s.absent} đồng chí, trong đó có lý do: ${t.excused}, không có lý do: ${t.unexcused}` +
      (t.pending ? `, chưa xác minh lý do: ${t.pending}` : '') + '.' +
      (s.guests ? ` Ngoài ra có ${s.guests} lượt khách mời điểm danh.` : '')
    ));
  } else {
    children.push(body(
      `${periodText(rep).replace(/^tại các/, 'Tại các')}, Công an phường tổ chức điểm danh ${t.sessions} hội nghị, cuộc họp ` +
      `với tổng số ${t.expected} lượt cán bộ được triệu tập; có mặt ${t.present} lượt (đạt ${pctText(t.rate)}%); ` +
      `vắng mặt ${t.absent} lượt, trong đó có lý do: ${t.excused}, không có lý do: ${t.unexcused}` +
      (t.pending ? `, chưa xác minh lý do: ${t.pending}` : '') + '. Cụ thể:'
    ));
    children.push(dataTable(
      ['STT', 'Hội nghị, cuộc họp', 'Thời gian', 'Triệu tập', 'Có mặt', 'Vắng', 'Tỷ lệ (%)'],
      [
        ...rep.sessions.map((s, i) => [
          String(i + 1), s.session.title, fmtDateTime(sessionTime(s.session)),
          String(s.expected), String(s.present), String(s.absent), pctText(s.rate)
        ]),
        ['', 'Cộng', '', String(t.expected), String(t.present), String(t.absent), pctText(t.rate)]
      ],
      [700, 3071, 1700, 1000, 900, 800, 900],
      ['C', 'L', 'C', 'C', 'C', 'C', 'C']
    ));
    children.push(spacer());
  }

  // II. DANH SÁCH CÁN BỘ VẮNG MẶT
  children.push(H('II. DANH SÁCH CÁN BỘ VẮNG MẶT'));
  if (rep.rows.length === 0) {
    children.push(body('Không có cán bộ vắng mặt.'));
  } else if (single) {
    children.push(dataTable(
      ['STT', 'Họ và tên', 'Chức vụ', 'Tổ công tác', 'Lý do vắng'],
      rep.rows.map((r, i) => [String(i + 1), r.fullName, r.position, r.department, absenceStatusText(r.absence)]),
      [700, 2500, 2000, 1600, 2271],
      ['C', 'L', 'L', 'L', 'L']
    ));
    children.push(spacer());
  } else {
    children.push(dataTable(
      ['STT', 'Họ và tên', 'Tổ công tác', 'Hội nghị, cuộc họp', 'Ngày', 'Lý do vắng'],
      rep.rows.map((r, i) => [
        String(i + 1), r.fullName, r.department, r.session.title, fmtDate(sessionTime(r.session)), absenceStatusText(r.absence)
      ]),
      [700, 1900, 1400, 2000, 1371, 1700],
      ['C', 'L', 'L', 'L', 'C', 'L']
    ));
    children.push(spacer());

    // III. TỔNG HỢP THEO CÁN BỘ
    children.push(H('III. TỔNG HỢP SỐ LẦN VẮNG MẶT THEO CÁN BỘ'));
    children.push(dataTable(
      ['STT', 'Họ và tên', 'Tổ công tác', 'Số lần vắng', 'Có lý do', 'Không lý do', 'Chưa xác minh'],
      rep.byOfficer.map((o, i) => [
        String(i + 1), o.fullName, o.department, String(o.times), String(o.excused), String(o.unexcused), String(o.pending)
      ]),
      [700, 2400, 1600, 1100, 1000, 1100, 1171],
      ['C', 'L', 'L', 'C', 'C', 'C', 'C']
    ));
    children.push(spacer());
  }

  children.push(body(
    `Trên đây là kết quả điểm danh và danh sách cán bộ vắng mặt ${periodText(rep)} của Công an phường Nam Đông Hà./.`
  ));

  // ---------- Nơi nhận + ký ----------
  const signBlock = new Table({
    width: { size: 9355, type: WidthType.DXA },
    columnWidths: [4150, 5205],
    borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({
      children: [
        cell([
          new Paragraph({ spacing: { before: 240 }, children: [run('Nơi nhận:', { size: SZ.noiNhanLabel, bold: true, italics: true })] }),
          new Paragraph({ children: [run('- Lãnh đạo Công an phường;', { size: SZ.noiNhan })] }),
          new Paragraph({ children: [run('- Các Tổ công tác;', { size: SZ.noiNhan })] }),
          new Paragraph({ children: [run('- Lưu: VT, TH.', { size: SZ.noiNhan })] })
        ], 4150),
        cell([
          center([run((signer.chucDanh || 'TRƯỞNG CÔNG AN PHƯỜNG').toUpperCase(), { size: SZ.chucDanh, bold: true })], { spacing: { before: 240 } }),
          ...Array.from({ length: 5 }, () => center([run('')])),
          center([run(signer.hoTen || '', { size: SZ.hoTen, bold: true })])
        ], 5205)
      ]
    })]
  });
  children.push(signBlock);

  const doc = new Document({
    creator: 'Công an phường Nam Đông Hà',
    title: 'Báo cáo cán bộ vắng mặt',
    styles: { default: { document: { run: { font: FONT, size: SZ.body } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 }
        }
      },
      children
    }]
  });

  return Packer.toBlob(doc);
};

export const exportAbsenceWord = async (rep: AbsenceReport, signer: SignerInfo) => {
  const blob = await buildAbsenceDocx(rep, signer);
  downloadBlob(blob, `BaoCao_CanBoVangMat_${fileStamp()}.docx`);
};
