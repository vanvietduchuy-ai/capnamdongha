/**
 * BÁO CÁO NGÀY — gọi hàm máy chủ (09_bao_cao_ngay.sql), tổng hợp số liệu, xuất Word/Excel.
 * Mọi dữ liệu báo cáo ngày chỉ đọc/ghi qua hàm máy chủ có kiểm tra quyền.
 */
import { callRpc, getSessionToken } from '../lib/supabase';
import { MockDB } from './mockDatabase';
import {
  DailyIncident, DailyMine, DailyOtherIncident, DailyReport, DailyStatus, DailyUnit, DailyUnitInfo
} from '../types';

const tok = () => getSessionToken();
type R<T = {}> = Promise<T & { ok: boolean; message?: string; code?: string }>;
const arr = <T,>(v: any): T[] => (Array.isArray(v) ? v : []);

/* ============================ DANH MỤC ============================ */

export const UNITS: { id: DailyUnit; name: string; short: string; dept?: string }[] = [
  { id: 'AN_NINH', name: 'Tổ An ninh', short: 'An ninh', dept: 'Tổ An ninh' },
  { id: 'CSKV', name: 'Tổ CSKV', short: 'CSKV', dept: 'Tổ CSKV' },
  { id: 'CSTT', name: 'Tổ CSTT', short: 'CSTT', dept: 'Tổ CSTT' },
  { id: 'PCTP', name: 'Tổ PCTP', short: 'PCTP', dept: 'Tổ PCTP' },
  { id: 'TBHS', name: 'Trực ban hình sự', short: 'TB hình sự' },
  { id: 'TBDV', name: 'Trực ban đơn vị', short: 'TB đơn vị' }
];
export const unitName = (u?: string | null) => UNITS.find(x => x.id === u)?.name || u || '';
export const isUnit = (u: any): u is DailyUnit => UNITS.some(x => x.id === u);

/** Lĩnh vực — danh mục cố định để thống kê chuẩn */
export const FIELDS = [
  'Hình sự',
  'Ma tuý',
  'Trật tự xã hội, tệ nạn xã hội',
  'Kinh tế, chức vụ, môi trường',
  'An ninh, chính trị nội bộ, tôn giáo',
  'Khiếu kiện, tập trung đông người',
  'Trật tự an toàn giao thông',
  'Cháy, nổ, cứu nạn, cứu hộ',
  'Tai nạn, sự cố, chết người bất thường',
  'Tin báo, tố giác tội phạm',
  'Khác'
];
export const SEVERITIES = ['Ít nghiêm trọng', 'Nghiêm trọng', 'Rất nghiêm trọng', 'Đặc biệt nghiêm trọng'];
export const HANDLINGS = ['Đang xác minh, giải quyết', 'Đã giải quyết xong', 'Đã chuyển cơ quan có thẩm quyền', 'Đã báo cáo cấp trên', 'Khác'];
export const ROLE_TEXT: Record<string, string> = { LEADER: 'Lãnh đạo tổ', DUTY: 'Cán bộ báo cáo', MAIN: 'Người báo cáo chính', BACKUP: 'Người dự phòng' };

/** Link chung duy nhất mở mục Báo cáo ngày (dùng chung cho mọi tổ, trực ban) */
export const dailyLink = () => `${typeof window !== 'undefined' ? window.location.origin : ''}/?bao-cao-ngay=1`;

/** Dãy số giống CCCD/CMND/điện thoại (bắt đầu bằng 0, 9–12 chữ số) — máy chủ cũng chặn */
export const looksLikeId = (s?: string | null) => !!s && /(^|\D)0\d{8,11}(\D|$)/.test(s);

export const newKey = () => 'ik_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
export const blankIncident = (): DailyIncident => ({
  key: newKey(), field: '', severity: '', occurredAt: '', location: '', summary: '',
  cases: 1, suspects: 0, victims: 0, damage: '', handling: '', handlingNote: '', dupOf: null
});

/* ============================ NGÀY THÁNG ============================ */
const pad = (n: number) => String(n).padStart(2, '0');
/** 'YYYY-MM-DD' → Date (UTC, chỉ dùng để cộng trừ ngày) */
const parseDay = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)); };
const fmtDayIso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (d: string, n: number) => { const x = parseDay(d); x.setUTCDate(x.getUTCDate() + n); return fmtDayIso(x); };
export const dayText = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
export const dayShort = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}`; };
export const weekdayShort = (d: string) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][parseDay(d).getUTCDay()];
export const weekdayText = (d: string) => ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][parseDay(d).getUTCDay()];
export const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
export const mondayOf = (d: string) => { const x = parseDay(d); const w = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - w); return fmtDayIso(x); };
export const monthStart = (d: string) => d.slice(0, 8) + '01';
export const monthEnd = (d: string) => { const x = parseDay(monthStart(d)); x.setUTCMonth(x.getUTCMonth() + 1); x.setUTCDate(0); return fmtDayIso(x); };
export const quarterStart = (d: string) => { const m = Number(d.slice(5, 7)); return `${d.slice(0, 4)}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`; };

/** Giờ:phút theo giờ Việt Nam */
export const vnTime = (ms: number) => {
  const t = new Date(ms + 7 * 3600000);
  return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
};
export const vnDateTime = (ms: number) => {
  const t = new Date(ms + 7 * 3600000);
  return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} ${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}`;
};
/** "từ 07 giờ 30 ngày 02/10 đến 07 giờ 30 ngày 03/10/2026" */
export const periodText = (day: string, deadline: string) => {
  const [h, m] = deadline.split(':');
  return `từ ${h} giờ ${m} ngày ${dayShort(addDays(day, -1))} đến ${h} giờ ${m} ngày ${dayText(day)}`;
};

/* ============================ GỌI MÁY CHỦ ============================ */
export interface DailyMe {
  currentDay: string; deadline: string; deadlineAt: number; serverNow: number; lateDays: number;
  canManage: boolean; leaderOf: DailyUnit[]; mine: DailyMine[];
}
export interface DailyGet {
  role: string | null; canSubmit: boolean; day: string; currentDay: string; deadlineAt: number; periodFrom: number;
  unitInfo: DailyUnitInfo; others: DailyOtherIncident[];
}
export interface DailyBoard {
  day: string; currentDay: string; canManage: boolean; deadlineAt: number; periodFrom: number;
  units: DailyUnitInfo[]; dups: Record<string, string>;
}
export interface DailyRangeReport {
  id: string; day: string; unit: DailyUnit; status: DailyStatus; note?: string | null;
  reporterName: string; submittedAt: number; late: boolean; version: number;
}
export interface DailyRange {
  from: string; to: string; currentDay: string; startDay?: string | null;
  reports: DailyRangeReport[]; incidents: DailyIncident[]; dups: Record<string, string>; firstLate: Record<string, boolean>;
}

const normInc = (i: any): DailyIncident => ({
  ...i, cases: Number(i.cases ?? 1) || 0, suspects: Number(i.suspects) || 0, victims: Number(i.victims) || 0
});
const normReport = (r: any): DailyReport | null => r ? ({
  ...r, version: Number(r.version) || 1, submittedAt: Number(r.submittedAt) || 0, deadlineAt: Number(r.deadlineAt) || 0,
  incidents: arr<any>(r.incidents).map(normInc)
}) : null;
const normUnit = (u: any): DailyUnitInfo => ({
  ...u, report: normReport(u.report), versions: Number(u.versions) || 0,
  flash: arr<any>(u.flash).map(f => ({ ...f, createdAt: Number(f.createdAt) || 0, data: normInc(f.data || {}) }))
});

export const Daily = {
  available: () => MockDB.isCloudEnabled(),

  me: async (): R<Partial<DailyMe>> => {
    const r = await callRpc<any>('app_daily_me', { p_token: tok() });
    return { ...r, mine: arr<DailyMine>(r.mine), leaderOf: arr<DailyUnit>(r.leaderOf),
      deadlineAt: Number(r.deadlineAt) || 0, serverNow: Number(r.serverNow) || Date.now() };
  },
  get: async (day: string, unit: DailyUnit): R<Partial<DailyGet>> => {
    const r = await callRpc<any>('app_daily_get', { p_token: tok(), p_day: day, p_unit: unit });
    return { ...r, unitInfo: r.unitInfo ? normUnit(r.unitInfo) : undefined, others: arr<DailyOtherIncident>(r.others),
      deadlineAt: Number(r.deadlineAt) || 0, periodFrom: Number(r.periodFrom) || 0 };
  },
  submit: async (p: { day: string; unit: DailyUnit; status: DailyStatus; note: string; incidents: DailyIncident[]; reason: string; confirm: boolean }) => {
    const r = await callRpc<any>('app_daily_submit', {
      p_token: tok(), p_day: p.day, p_unit: p.unit, p_status: p.status, p_note: p.note,
      p_incidents: p.incidents.map(cleanIncident), p_reason: p.reason, p_confirm: p.confirm,
      p_device: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : ''
    });
    return { ...r, report: normReport(r.report) } as { ok: boolean; message?: string; report: DailyReport | null; version?: number; late?: boolean };
  },
  flash: (unit: DailyUnit, inc: DailyIncident) =>
    callRpc<{ key: string; day: string }>('app_daily_flash', { p_token: tok(), p_unit: unit, p_incident: cleanIncident(inc) }),
  board: async (day: string): R<Partial<DailyBoard>> => {
    const r = await callRpc<any>('app_daily_board', { p_token: tok(), p_day: day });
    return { ...r, units: arr<any>(r.units).map(normUnit), dups: r.dups || {},
      deadlineAt: Number(r.deadlineAt) || 0, periodFrom: Number(r.periodFrom) || 0 };
  },
  history: async (day: string, unit: DailyUnit): R<{ versions: DailyReport[] }> => {
    const r = await callRpc<any>('app_daily_history', { p_token: tok(), p_day: day, p_unit: unit });
    return { ...r, versions: arr<any>(r.versions).map(v => normReport(v)!) };
  },
  range: async (from: string, to: string): R<Partial<DailyRange>> => {
    const r = await callRpc<any>('app_daily_range', { p_token: tok(), p_from: from, p_to: to });
    return { ...r, reports: arr<any>(r.reports).map(x => ({ ...x, submittedAt: Number(x.submittedAt) || 0 })),
      incidents: arr<any>(r.incidents).map(normInc), dups: r.dups || {}, firstLate: r.firstLate || {} };
  },
  markDup: (day: string, key: string, dupOf: string | null, clear = false) =>
    callRpc('app_daily_mark_dup', { p_token: tok(), p_day: day, p_key: key, p_dup_of: dupOf || '', p_clear: clear }),
  remind: (day: string) => callRpc<{ sent: number }>('app_daily_remind', { p_token: tok(), p_day: day }),
  setDeadline: (hhmm: string) => callRpc('app_daily_settings', { p_token: tok(), p_deadline: hhmm })
};

const cleanIncident = (i: DailyIncident) => ({
  key: i.key, field: i.field, severity: i.severity || '', occurredAt: (i.occurredAt || '').trim(), location: (i.location || '').trim(),
  summary: (i.summary || '').trim(), cases: Math.max(1, Number(i.cases) || 1), suspects: Math.max(0, Number(i.suspects) || 0),
  victims: Math.max(0, Number(i.victims) || 0), damage: (i.damage || '').trim(), handling: i.handling || '',
  handlingNote: (i.handlingNote || '').trim(), dupOf: i.dupOf || ''
});

/** Kiểm tra trên máy trước khi gửi (máy chủ kiểm tra lại) */
export const incidentError = (i: DailyIncident): string | null => {
  if (!i.field) return 'Chưa chọn lĩnh vực.';
  if ((i.summary || '').trim().length < 5) return 'Chưa nhập nội dung vụ việc.';
  if (!(Number(i.cases) >= 1)) return 'Số vụ việc phải từ 1 trở lên.';
  if ([i.summary, i.location, i.damage, i.handlingNote, i.occurredAt].some(looksLikeId))
    return 'Có dãy số giống số định danh/điện thoại. Không nhập thông tin định danh.';
  return null;
};

/* ============================ TỔNG HỢP ============================ */

/** Vụ việc có bị coi là trùng (không cộng vào tổng) — đánh dấu của Tổ Tổng hợp ưu tiên hơn của người báo */
export const dupTarget = (i: DailyIncident, dups: Record<string, string>): string | null => {
  if (Object.prototype.hasOwnProperty.call(dups, i.key)) return dups[i.key] || null;
  return i.dupOf || null;
};

export interface FieldTotal { field: string; cases: number; suspects: number; victims: number; items: number; }
export const totalsByField = (incs: DailyIncident[], dups: Record<string, string>) => {
  const counted = incs.filter(i => !dupTarget(i, dups));
  const map = new Map<string, FieldTotal>();
  counted.forEach(i => {
    const t = map.get(i.field) || { field: i.field, cases: 0, suspects: 0, victims: 0, items: 0 };
    t.cases += i.cases; t.suspects += i.suspects; t.victims += i.victims; t.items += 1;
    map.set(i.field, t);
  });
  const rows = [...map.values()].sort((a, b) => FIELDS.indexOf(a.field) - FIELDS.indexOf(b.field));
  return {
    rows,
    cases: rows.reduce((s, r) => s + r.cases, 0),
    suspects: rows.reduce((s, r) => s + r.suspects, 0),
    victims: rows.reduce((s, r) => s + r.victims, 0),
    dupCount: incs.length - counted.length
  };
};

/* ============================ XUẤT FILE ============================ */
export interface Signer { chucDanh: string; hoTen: string; }

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

/** Đoạn văn: mảng phần chữ, số liệu (number) tự in đậm */
type Seg = string | number | { b: string };

interface DocInput {
  title: string;              // dòng trích yếu
  subtitle?: string;          // dòng thời gian
  sections: { heading: string; paras: Seg[][] }[];
  closing: string;
  signer: Signer;
  fileName: string;
}

const buildDocx = async (d: DocInput) => {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType,
    VerticalAlign, Header, PageNumber
  } = await import('docx');
  const FONT = 'Times New Roman';
  const SZ = { body: 28, coQuan: 26, coQuanDai: 24, tieuNgu: 28, soKh: 26, ngayThang: 28, noiNhanLabel: 24, noiNhan: 22, chucDanh: 26, hoTen: 28 };
  // Bỏ toàn bộ Line and Page Breaks (widow/orphan, keep with next, keep lines together, page break before, suppress line numbers)
  const NOBREAK = { widowControl: false, keepNext: false, keepLines: false, pageBreakBefore: false, suppressLineNumbers: false } as const;
  const run = (text: string, opts: any = {}) => new TextRun({ text, font: FONT, size: SZ.body, ...opts });
  const segRuns = (segs: Seg[]) => segs.map(s => typeof s === 'number'
    ? run(s.toLocaleString('vi-VN'), { bold: true })
    : typeof s === 'string' ? run(s) : run(s.b, { bold: true }));
  const body = (segs: Seg[], bold = false) => new Paragraph({
    ...NOBREAK, alignment: AlignmentType.JUSTIFIED, spacing: { line: 288, lineRule: 'auto', before: 120, after: 120 },
    indent: { firstLine: 567 },
    children: bold ? segs.map(s => run(String(s), { bold: true })) : segRuns(segs)
  });
  const center = (children: any[], opts: any = {}) => new Paragraph({
    ...NOBREAK, alignment: AlignmentType.CENTER, spacing: { line: 288, lineRule: 'auto', before: 0, after: 0 }, children, ...opts
  });
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  const cell = (children: any[], width: number) => new TableCell({
    borders: noBorders, verticalAlign: VerticalAlign.TOP, width: { size: width, type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 0, right: 0 }, children
  });
  const twoCol = (left: any[], right: any[]) => new Table({
    width: { size: 9355, type: WidthType.DXA }, columnWidths: [4150, 5205],
    borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({ cantSplit: true, children: [cell(left, 4150), cell(right, 5205)] })]
  });

  const children: any[] = [
    twoCol([
      center([run('CÔNG AN TỈNH QUẢNG TRỊ', { size: SZ.coQuan })]),
      center([run('CÔNG AN PHƯỜNG NAM ĐÔNG HÀ', { size: SZ.coQuanDai, bold: true })]),
      center([run('_______', { bold: true })]),
      center([run('Số:        /BC-CAP-TH', { size: SZ.soKh })], { spacing: { before: 120 } })
    ], [
      center([run('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { size: SZ.coQuanDai, bold: true })]),
      center([run('Độc lập - Tự do - Hạnh phúc', { size: SZ.tieuNgu, bold: true })]),
      center([run('________________________', { bold: true })]),
      center([run(`Nam Đông Hà, ngày      tháng      năm ${new Date().getFullYear()}`, { size: SZ.ngayThang, italics: true })], { spacing: { before: 120 } })
    ]),
    center([run('BÁO CÁO', { bold: true })], { spacing: { before: 240 } }),
    center([run(d.title, { bold: true })]),
    ...(d.subtitle ? [center([run(d.subtitle, { italics: true })])] : []),
    center([run('_______', { bold: true })], { spacing: { after: 120 } })
  ];
  d.sections.forEach(sec => {
    children.push(body([sec.heading], true));
    sec.paras.forEach(p => children.push(body(p)));
  });
  children.push(body([d.closing]));
  children.push(twoCol([
    new Paragraph({ ...NOBREAK, spacing: { before: 240 }, children: [run('Nơi nhận:', { size: SZ.noiNhanLabel, bold: true, italics: true })] }),
    new Paragraph({ ...NOBREAK, children: [run('- Lãnh đạo Công an phường;', { size: SZ.noiNhan })] }),
    new Paragraph({ ...NOBREAK, children: [run('- Các Tổ công tác;', { size: SZ.noiNhan })] }),
    new Paragraph({ ...NOBREAK, children: [run('- Lưu: VT, TH.', { size: SZ.noiNhan })] })
  ], [
    center([run((d.signer.chucDanh || 'TRƯỞNG CÔNG AN PHƯỜNG').toUpperCase(), { size: SZ.chucDanh, bold: true })], { spacing: { before: 240 } }),
    ...Array.from({ length: 5 }, () => center([run('')])),
    center([run(d.signer.hoTen || '', { size: SZ.hoTen, bold: true })])
  ]));

  const doc = new Document({
    creator: 'Công an phường Nam Đông Hà',
    title: d.title,
    styles: { default: { document: { run: { font: FONT, size: SZ.body } } } },
    sections: [{
      properties: {
        titlePage: true, // trang đầu không đánh số (NĐ30)
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 1134, header: 567 } }
      },
      headers: {
        first: new Header({ children: [new Paragraph({ children: [] })] }),
        default: new Header({ children: [new Paragraph({ ...NOBREAK, alignment: AlignmentType.CENTER, children: [new TextRun({ font: FONT, size: 26, children: [PageNumber.CURRENT] })] })] })
      },
      children
    }]
  });
  downloadBlob(await Packer.toBlob(doc), d.fileName);
};

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const endDot = (t: string) => t.replace(/[\s.;,]+$/, '') + '.';
const incidentSentence = (i: DailyIncident, idx: number, withUnit = true): Seg[] => {
  const segs: Seg[] = [`${idx}. `, { b: i.field }];
  if (i.severity) segs.push(` (${i.severity})`);
  segs.push(': ');
  const where = [i.occurredAt && `thời gian ${i.occurredAt}`, i.location && `tại ${i.location}`].filter(Boolean).join(', ');
  if (where) segs.push(cap(where) + '. ');
  segs.push(endDot(cap(i.summary.trim())) + ' ');
  const nums: Seg[] = [];
  if (i.cases > 1) nums.push('số vụ việc: ', i.cases, '; ');
  nums.push('số đối tượng: ', i.suspects);
  if (i.victims) nums.push('; số bị hại, thương vong: ', i.victims);
  nums[0] = cap(String(nums[0]));
  segs.push(...nums, '.');
  if (i.damage) segs.push(' Thiệt hại: ' + endDot(i.damage));
  if (i.handling || i.handlingNote) segs.push(' Kết quả xử lý: ' + endDot([i.handling, i.handlingNote].filter(Boolean).join(' – ')));
  if (withUnit && i.unit) segs.push(` (Nguồn: ${unitName(i.unit)}${i.flash ? ', đã báo cáo nhanh' : ''}.)`);
  return segs;
};

/** Vụ việc của 1 ngày: trong báo cáo đã nộp + báo cáo nhanh chưa đưa vào báo cáo ngày */
export const boardIncidents = (b: Pick<DailyBoard, 'units'>): DailyIncident[] => b.units.flatMap(u => {
  const inRep = (u.report?.incidents || []).map(i => ({ ...i, unit: u.unit }));
  const keys = new Set(inRep.map(i => i.key));
  const fl = u.flash.filter(f => !keys.has(f.key)).map(f => ({ ...f.data, key: f.key, unit: u.unit, flash: true }));
  return [...inRep, ...fl];
});

/** Word: Báo cáo tình hình ANTT 1 ngày */
export const exportDailyWord = async (b: DailyBoard, deadline: string, signer: Signer) => {
  const incs = boardIncidents(b);
  const t = totalsByField(incs, b.dups);
  const reported = b.units.filter(u => u.report);
  const sec1: Seg[][] = [];
  if (t.cases === 0) {
    sec1.push(['Trong kỳ báo cáo, tình hình an ninh, trật tự trên địa bàn phường cơ bản ổn định, không phát sinh vụ việc phức tạp.']);
  } else {
    sec1.push(['Trong kỳ báo cáo, trên địa bàn phường xảy ra ', t.cases, ' vụ việc, liên quan ', t.suspects, ' đối tượng',
      ...(t.victims ? ['; ', t.victims, ' người bị hại, thương vong'] : []), '. Cụ thể theo lĩnh vực:']);
    t.rows.forEach(r => sec1.push(['- ', r.field, ': ', r.cases, ' vụ, ', r.suspects, ' đối tượng.']));
  }
  sec1.push(['Có ', reported.length, '/', b.units.length, ' đầu mối đã báo cáo',
    ...(reported.filter(u => u.report!.late).length ? ['; ', reported.filter(u => u.report!.late).length, ' đầu mối nộp muộn'] : []), '.']);

  const counted = incs.filter(i => !dupTarget(i, b.dups));
  const sec2: Seg[][] = counted.length ? counted.map((i, k) => incidentSentence(i, k + 1)) : [['Không có vụ việc.']];
  const dupN = incs.length - counted.length;
  if (dupN) sec2.push([`(Đã gộp ${dupN} vụ việc do nhiều đầu mối cùng báo cáo.)`]);

  const sec3: Seg[][] = b.units.map(u => {
    const r = u.report;
    if (!r) return [{ b: u.unitName + ': ' }, 'chưa báo cáo.',
      ...(u.flash.length ? [' Đã có ', u.flash.length, ' báo cáo nhanh (nêu tại mục II).'] as Seg[] : [])];
    const n = r.incidents.length;
    return [{ b: u.unitName + ': ' }, `đồng chí ${r.reporterName} báo cáo lúc ${vnDateTime(r.submittedAt)}`,
      r.status === 'NORMAL' ? ' – tình hình bình thường' : ' – có vụ việc (', ...(r.status === 'NORMAL' ? [] : [n, ' nội dung)']),
      r.late ? ', nộp muộn' : '', r.version > 1 ? `, đã đính chính ${r.version - 1} lần` : '', '.',
      ...(r.note ? [' Ghi chú: ' + endDot(r.note)] : []),
      ...(u.flash.length ? [` Có `, u.flash.length, ' báo cáo nhanh.'] : [])];
  });

  await buildDocx({
    title: `Tình hình an ninh, trật tự ngày ${dayText(b.day)}`,
    subtitle: `(${periodText(b.day, deadline)})`,
    sections: [
      { heading: 'I. TÌNH HÌNH CHUNG', paras: sec1 },
      { heading: 'II. TÌNH HÌNH CỤ THỂ', paras: sec2 },
      { heading: 'III. KẾT QUẢ BÁO CÁO CỦA CÁC ĐẦU MỐI', paras: sec3 }
    ],
    closing: `Trên đây là báo cáo tình hình an ninh, trật tự ngày ${dayText(b.day)} của Công an phường Nam Đông Hà./.`,
    signer,
    fileName: `BaoCaoNgay_${b.day}.docx`
  });
};

/** Thống kê chấp hành báo cáo của từng đầu mối trong khoảng */
export const complianceOf = (rg: DailyRange) => {
  // Chỉ tính từ ngày bắt đầu dùng báo cáo ngày; kỳ đang mở chỉ tính khi đã báo (chưa đến hạn thì chưa phải "không báo")
  const first = rg.startDay && rg.startDay > rg.from ? rg.startDay : rg.from;
  const last = rg.to < rg.currentDay ? rg.to : addDays(rg.currentDay, -1);
  const closedDays = last >= first ? daysBetween(first, last) + 1 : 0;
  return UNITS.map(u => {
    const reps = rg.reports.filter(r => r.unit === u.id && r.day >= first);
    const closed = reps.filter(r => r.day <= last);
    const openReported = reps.some(r => r.day === rg.currentDay && r.day <= rg.to);
    const days = closedDays + (openReported ? 1 : 0);
    const late = reps.filter(r => rg.firstLate[`${r.day}|${r.unit}`]).length;
    return { unit: u.id, name: u.name, days, reported: reps.length, missing: Math.max(0, closedDays - closed.length), late,
      incidentDays: reps.filter(r => r.status === 'INCIDENT').length };
  });
};

/** Word: Báo cáo tổng hợp khoảng thời gian */
export const exportRangeWord = async (rg: DailyRange, label: string, signer: Signer) => {
  const incs = rg.incidents;
  const t = totalsByField(incs, rg.dups);
  const comp = complianceOf(rg);
  const sec1: Seg[][] = [t.cases === 0
    ? [`${label[0].toUpperCase()}${label.slice(1)}, tình hình an ninh, trật tự trên địa bàn phường cơ bản ổn định, các đầu mối không báo cáo phát sinh vụ việc.`]
    : [`${label[0].toUpperCase()}${label.slice(1)}, trên địa bàn phường xảy ra `, t.cases, ' vụ việc, liên quan ', t.suspects, ' đối tượng',
       ...(t.victims ? ['; ', t.victims, ' người bị hại, thương vong'] : []), '. Cụ thể theo lĩnh vực:']];
  t.rows.forEach(r => sec1.push(['- ', r.field, ': ', r.cases, ' vụ, ', r.suspects, ' đối tượng.']));
  const sec2: Seg[][] = comp.map(c => [{ b: c.name + ': ' }, 'báo cáo ', c.reported, '/', c.days, ' ngày',
    ...(c.missing ? ['; không báo cáo ', c.missing, ' ngày'] : []), ...(c.late ? ['; nộp muộn ', c.late, ' lần'] : []),
    '; số ngày có vụ việc: ', c.incidentDays, '.']);
  const counted = incs.filter(i => !dupTarget(i, rg.dups));
  const sec3: Seg[][] = counted.length
    ? counted.map((i, k) => [`Ngày ${dayShort(i.day || '')} – `, ...incidentSentence(i, k + 1)])
    : [['Không có vụ việc.']];
  await buildDocx({
    title: `Tổng hợp tình hình an ninh, trật tự ${label}`,
    sections: [
      { heading: 'I. TÌNH HÌNH CHUNG', paras: sec1 },
      { heading: 'II. KẾT QUẢ CHẤP HÀNH CHẾ ĐỘ BÁO CÁO NGÀY', paras: sec2 },
      { heading: 'III. DANH SÁCH VỤ VIỆC', paras: sec3 }
    ],
    closing: `Trên đây là báo cáo tổng hợp tình hình an ninh, trật tự ${label} của Công an phường Nam Đông Hà./.`,
    signer,
    fileName: `TongHop_BaoCaoNgay_${rg.from}_${rg.to}.docx`
  });
};

/** Excel: 3 trang tính — Vụ việc, Theo lĩnh vực × đầu mối, Chấp hành báo cáo */
export const exportRangeExcel = async (rg: DailyRange, label: string) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const head = [['CÔNG AN PHƯỜNG NAM ĐÔNG HÀ'], [`TỔNG HỢP BÁO CÁO NGÀY ${label.toUpperCase()}`], [`Xuất lúc: ${vnDateTime(Date.now())}`], []];

  const s1: any[][] = [...head, ['STT', 'Ngày', 'Đầu mối', 'Lĩnh vực', 'Mức độ', 'Thời gian', 'Địa điểm', 'Nội dung', 'Số vụ', 'Số đối tượng',
    'Bị hại/thương vong', 'Thiệt hại', 'Tình trạng xử lý', 'Kết quả xử lý', 'Báo cáo nhanh', 'Trùng với vụ khác']];
  rg.incidents.forEach((i, k) => s1.push([k + 1, dayText(i.day || ''), unitName(i.unit), i.field, i.severity || '', i.occurredAt || '', i.location || '',
    i.summary, i.cases, i.suspects, i.victims, i.damage || '', i.handling || '', i.handlingNote || '', i.flash ? 'Có' : '', dupTarget(i, rg.dups) ? 'Trùng (không cộng)' : '']));
  const ws1 = XLSX.utils.aoa_to_sheet(s1);
  ws1['!cols'] = [5, 11, 16, 26, 16, 14, 18, 50, 7, 10, 10, 18, 22, 30, 10, 16].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws1, 'Vụ việc');

  const counted = rg.incidents.filter(i => !dupTarget(i, rg.dups));
  const s2: any[][] = [...head, ['Lĩnh vực', ...UNITS.map(u => u.short), 'Tổng số vụ', 'Tổng đối tượng']];
  FIELDS.forEach(f => {
    const fi = counted.filter(i => i.field === f);
    if (!fi.length) return;
    s2.push([f, ...UNITS.map(u => fi.filter(i => i.unit === u.id).reduce((s, i) => s + i.cases, 0)),
      fi.reduce((s, i) => s + i.cases, 0), fi.reduce((s, i) => s + i.suspects, 0)]);
  });
  s2.push(['Cộng', ...UNITS.map(u => counted.filter(i => i.unit === u.id).reduce((s, i) => s + i.cases, 0)),
    counted.reduce((s, i) => s + i.cases, 0), counted.reduce((s, i) => s + i.suspects, 0)]);
  const ws2 = XLSX.utils.aoa_to_sheet(s2);
  ws2['!cols'] = [{ wch: 34 }, ...UNITS.map(() => ({ wch: 11 })), { wch: 11 }, { wch: 13 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Theo lĩnh vực');

  const s3: any[][] = [...head, ['Đầu mối', 'Số ngày phải báo', 'Đã báo', 'Không báo', 'Nộp muộn', 'Ngày có vụ việc']];
  complianceOf(rg).forEach(c => s3.push([c.name, c.days, c.reported, c.missing, c.late, c.incidentDays]));
  s3.push([]); s3.push(['Chi tiết từng ngày']);
  s3.push(['Ngày', ...UNITS.map(u => u.short)]);
  for (let d = rg.startDay && rg.startDay > rg.from ? rg.startDay : rg.from; d <= rg.to && d <= rg.currentDay; d = addDays(d, 1)) {
    s3.push([dayText(d), ...UNITS.map(u => {
      const r = rg.reports.find(x => x.day === d && x.unit === u.id);
      if (!r) return d === rg.currentDay ? '(đang mở)' : 'KHÔNG BÁO';
      return (r.status === 'NORMAL' ? 'Bình thường' : 'Có vụ việc') + (rg.firstLate[`${d}|${u.id}`] ? ' – muộn' : '');
    })]);
  }
  const ws3 = XLSX.utils.aoa_to_sheet(s3);
  ws3['!cols'] = [{ wch: 18 }, ...UNITS.map(() => ({ wch: 16 }))];
  XLSX.utils.book_append_sheet(wb, ws3, 'Chấp hành báo cáo');

  XLSX.writeFile(wb, `TongHop_BaoCaoNgay_${rg.from}_${rg.to}.xlsx`);
};
