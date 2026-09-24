/**
 * SƠ ĐỒ CHỖ NGỒI: đọc tệp Excel, ghép ghế với cán bộ, tính màu ghế khi điểm danh.
 *
 * Mẫu Excel được hỗ trợ (như "Sơ đồ chỗ ngồi hội họp tại hội trường tầng 6"):
 *  - Mỗi ô là 1 ghế: "Minh Quốc AN", "CSKV Viết Hiền", "Đ/c Hồng" (tổ có thể đứng trước hoặc sau tên, cách bằng
 *    xuống dòng hoặc dấu cách).
 *  - Một cột ghi số hàng 1, 2, 3… ở giữa (lối đi) chia sơ đồ thành 2 khối trái/phải. Không có cột số thì coi là 1 khối.
 *  - Hàng 1 là hàng sát bục chủ toạ. Dòng tiêu đề, ô trống, mũi tên… tự bỏ qua.
 */
import { AttendanceAbsence, AttendanceRecord, AttendanceSession, Seat, SeatFlag, SeatLayout, User, UserDepartment, UserRole } from '../types';

/** Mã tổ ghi tắt trên sơ đồ → tổ trong phần mềm */
export const TEAM_CODES: Record<string, UserDepartment> = {
  AN: UserDepartment.AN_NINH,
  CSKV: UserDepartment.CSKV,
  CSTT: UserDepartment.CSTT,
  PCTP: UserDepartment.PCTP,
  TH: UserDepartment.TONG_HOP
};
export const teamOf = (dep?: string) => {
  const hit = Object.entries(TEAM_CODES).find(([, d]) => d === dep);
  return hit ? hit[0] : '';
};

const norm = (s: string) => (s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
const strip = (s: string) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/** Tách ô Excel thành tên + tổ */
export const parseCell = (raw: unknown): { label: string; team: string } | null => {
  const text = String(raw ?? '').replace(/ /g, ' ').trim();
  if (!text) return null;
  const tokens = text.split(/[\s\n\r]+/).filter(Boolean);
  let team = '';
  // Mã tổ viết HOA đứng riêng (để "Hà An" không bị hiểu nhầm là tổ AN)
  const isTeam = (t: string) => /^[A-Z]+$/.test(t) && Object.prototype.hasOwnProperty.call(TEAM_CODES, t);
  if (tokens.length > 1 && isTeam(tokens[0])) { team = tokens.shift()!.toUpperCase(); }
  else if (tokens.length > 1 && isTeam(tokens[tokens.length - 1])) { team = tokens.pop()!.toUpperCase(); }
  const label = tokens.join(' ').replace(/\s+/g, ' ').trim();
  if (!label || /^[↑↓←→▲▼^|\-–—]+$/.test(label)) return null;
  return { label, team };
};

export interface ParsedGrid { rows: number; leftCols: number; rightCols: number; seats: Seat[]; }

/** Đọc sơ đồ từ mảng các dòng Excel (sheet_to_json header:1) */
export const parseGrid = (aoa: unknown[][]): ParsedGrid => {
  const rowsArr = aoa.map(r => (Array.isArray(r) ? r : []));
  const width = Math.max(0, ...rowsArr.map(r => r.length));
  // Tìm cột ghi số hàng (1, 2, 3…) có nhiều dòng nhất
  let numCol = -1, best = 0;
  for (let c = 0; c < width; c++) {
    let n = 0;
    for (const r of rowsArr) if (/^\s*\d{1,2}\s*$/.test(String(r[c] ?? ''))) n++;
    if (n > best) { best = n; numCol = c; }
  }
  const seatRows: { rowNo: number; cells: unknown[] }[] = [];
  if (numCol >= 0 && best >= 2) {
    rowsArr.forEach(r => {
      const v = String(r[numCol] ?? '').trim();
      if (/^\d{1,2}$/.test(v)) seatRows.push({ rowNo: Number(v), cells: r });
    });
    seatRows.sort((a, b) => a.rowNo - b.rowNo);
  } else {
    // Không có cột số hàng: mọi dòng có từ 3 ô có tên trở lên là 1 hàng ghế
    rowsArr.forEach(r => { if (r.filter(x => parseCell(x)).length >= 3) seatRows.push({ rowNo: seatRows.length + 1, cells: r }); });
    numCol = -1;
  }
  if (!seatRows.length) return { rows: 0, leftCols: 0, rightCols: 0, seats: [] };

  // Phạm vi cột có ghế ở mỗi khối
  let minL = Infinity, maxR = -1;
  for (const { cells } of seatRows) cells.forEach((x, c) => {
    if (c === numCol || !parseCell(x)) return;
    if (numCol < 0 || c < numCol) minL = Math.min(minL, c);
    if (numCol < 0 || c > numCol) maxR = Math.max(maxR, c);
  });
  let leftCols: number, rightCols: number, colOf: (c: number) => number;
  if (numCol >= 0) {
    leftCols = minL === Infinity ? 0 : numCol - minL;
    rightCols = maxR < 0 ? 0 : maxR - numCol;
    colOf = c => (c < numCol ? c - minL : leftCols + (c - numCol - 1));
  } else {
    leftCols = maxR - minL + 1; rightCols = 0; colOf = c => c - minL;
  }
  const seats: Seat[] = [];
  seatRows.forEach(({ cells }, r) => cells.forEach((x, c) => {
    if (c === numCol) return;
    const p = parseCell(x);
    if (!p) return;
    const col = colOf(c);
    if (col < 0 || col >= leftCols + rightCols) return;
    seats.push({ r, c: col, label: p.label, team: p.team, userId: null });
  }));
  return { rows: seatRows.length, leftCols, rightCols, seats };
};

/** Đọc tệp Excel/CSV (thư viện xlsx chỉ tải khi cần) */
export const readLayoutFile = async (file: File): Promise<ParsedGrid> => {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false }) as unknown[][];
    const g = parseGrid(aoa);
    if (g.seats.length) return g;
  }
  return { rows: 0, leftCols: 0, rightCols: 0, seats: [] };
};

// ------------------------------------------------------------------
// GHÉP GHẾ VỚI CÁN BỘ
// ------------------------------------------------------------------
const isLeader = (u: User) => [UserRole.CHIEF, UserRole.DEPUTY_CHIEF].includes(u.role) || u.department === UserDepartment.PHU_TRACH_CHUNG;

/** Các cán bộ có thể là người ghi ở ghế (tên cuối trùng khớp, cùng tổ nếu có ghi tổ) */
export const candidatesFor = (seat: Seat, users: User[]): User[] => {
  let label = strip(seat.label).replace(/^(d\/c|dc|đ\/c|dong chi)\s*/, '').trim();
  if (!label) return [];
  const pool = users.filter(u => u.role !== UserRole.ADMIN);
  const dep = seat.team ? TEAM_CODES[seat.team] : undefined;
  const words = label.split(' ');
  const match = (u: User) => {
    const full = strip(u.fullName).split(' ');
    if (words.length === 1) return full[full.length - 1] === words[0];
    // "N. Trung" → chữ cái đầu của tên đệm + tên
    const last = words[words.length - 1];
    if (full[full.length - 1] !== last) return false;
    const before = words.slice(0, -1);
    const fb = full.slice(0, -1);
    if (before.length > fb.length) return false;
    const tail = fb.slice(fb.length - before.length);
    return before.every((w, i) => (/^[a-z]\.?$/.test(w) ? tail[i].startsWith(w[0]) : tail[i] === w));
  };
  let found = pool.filter(match);
  if (dep) { const same = found.filter(u => u.department === dep); if (same.length) found = same; }
  else if (/^(d\/c|dc|dong chi)/.test(strip(seat.label))) { const lead = found.filter(isLeader); if (lead.length) found = lead; }
  return found;
};

/** Tự ghép: ghế có đúng 1 người phù hợp và người đó chưa ngồi ghế khác */
export const autoMatch = (seats: Seat[], users: User[]): Seat[] => {
  const out = seats.map(s => ({ ...s }));
  const used = new Set(out.filter(s => s.userId).map(s => s.userId!));
  for (const s of out) {
    if (s.userId) continue;
    const c = candidatesFor(s, users).filter(u => !used.has(u.id));
    if (c.length === 1) { s.userId = c[0].id; used.add(c[0].id); }
  }
  return out;
};

/** Tạo nhanh sơ đồ theo tổ (khi chưa có tệp Excel) */
export const layoutByTeam = (users: User[], leftCols = 6, rightCols = 6): ParsedGrid => {
  const order = [UserDepartment.PHU_TRACH_CHUNG, UserDepartment.TONG_HOP, UserDepartment.AN_NINH, UserDepartment.CSKV, UserDepartment.CSTT, UserDepartment.PCTP];
  const rank = (u: User) => (isLeader(u) ? -1 : Math.max(0, order.indexOf(u.department as UserDepartment)));
  const list = users.filter(u => u.role !== UserRole.ADMIN).sort((a, b) => rank(a) - rank(b) || a.fullName.localeCompare(b.fullName, 'vi'));
  const per = leftCols + rightCols;
  const seats: Seat[] = list.map((u, i) => {
    const parts = u.fullName.trim().split(/\s+/);
    return { r: Math.floor(i / per), c: i % per, label: parts.slice(-2).join(' '), team: teamOf(u.department), userId: u.id };
  });
  return { rows: Math.max(1, Math.ceil(list.length / per)), leftCols, rightCols, seats };
};

// ------------------------------------------------------------------
// MÀU GHẾ KHI ĐIỂM DANH
// ------------------------------------------------------------------
export type SeatState = 'present' | 'absent' | 'excused' | 'outside' | 'suspect' | 'empty';

export interface SeatingStats { present: number; absent: number; excused: number; suspect: number; confirmed: number; unseated: string[]; }

export const seatStateFactory = (
  session: AttendanceSession, records: AttendanceRecord[], absences: AttendanceAbsence[], flags: SeatFlag[]
) => {
  const expected = new Set(session.expectedUserIds || []);
  const present = new Map(records.filter(r => !r.guestName).map(r => [r.userId, r]));
  const excused = new Set(absences.filter(a => a.excused === true).map(a => a.userId));
  const flagOf = new Map(flags.map(f => [f.userId, f]));
  return (seat: Seat): SeatState => {
    if (!seat.userId) return seat.label ? 'outside' : 'empty';
    if (!expected.has(seat.userId)) return 'outside';
    if (present.has(seat.userId)) return flagOf.get(seat.userId)?.status === 'SUSPECT' ? 'suspect' : 'present';
    if (excused.has(seat.userId)) return 'excused';
    return 'absent';
  };
};

export const seatingStats = (
  session: AttendanceSession, layout: SeatLayout | null, records: AttendanceRecord[], absences: AttendanceAbsence[], flags: SeatFlag[]
): SeatingStats => {
  const expected = session.expectedUserIds || [];
  const presentIds = new Set(records.filter(r => !r.guestName).map(r => r.userId));
  const excusedIds = new Set(absences.filter(a => a.excused === true).map(a => a.userId));
  const sus = new Set(flags.filter(f => f.status === 'SUSPECT').map(f => f.userId));
  const conf = new Set(flags.filter(f => f.status === 'CONFIRMED').map(f => f.userId));
  const seated = new Set((layout?.seats || []).map(s => s.userId).filter(Boolean) as string[]);
  let present = 0, absent = 0, excused = 0, suspect = 0, confirmed = 0;
  for (const id of expected) {
    if (presentIds.has(id)) { if (sus.has(id)) suspect++; else present++; if (conf.has(id)) confirmed++; }
    else if (excusedIds.has(id)) excused++;
    else absent++;
  }
  return { present, absent, excused, suspect, confirmed, unseated: expected.filter(id => !seated.has(id)) };
};
