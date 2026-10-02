/**
 * HỌC TẬP & THI — hàm dùng chung phía trình duyệt:
 * đọc Excel ngân hàng câu hỏi, nhận dạng link video, mã thiết bị, phân tích kết quả & nghi vấn.
 */
import { Exam, ResultRow, User } from '../types';

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ------------------------------------------------------------------
// ĐỌC EXCEL NGÂN HÀNG CÂU HỎI
// Cột (không phân biệt thứ tự, hoa thường, dấu): STT | Chủ đề | Mức độ | Câu hỏi | Đáp án A … F | Đáp án đúng | Giải thích | Nguồn
// ------------------------------------------------------------------
const key = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export interface ParsedQuestion {
  row: number; stt?: number | null; topic?: string; level?: string; text: string;
  options: string[]; correct: number; explanation?: string; source?: string;
}
export interface ParseResult { items: ParsedQuestion[]; errors: { row: number; message: string }[]; sheet?: string; }

const findCol = (head: string[], ...names: string[]) => head.findIndex(h => names.some(n => h === n || h.startsWith(n + ' ')));

export const parseQuestionRows = (aoa: unknown[][]): ParseResult => {
  const res: ParseResult = { items: [], errors: [] };
  // Dòng tiêu đề: dòng đầu tiên có chữ "cau hoi"
  const hIdx = aoa.findIndex(r => Array.isArray(r) && r.some(c => key(c) === 'cau hoi' || key(c) === 'noi dung cau hoi'));
  if (hIdx < 0) { res.errors.push({ row: 0, message: 'Không tìm thấy dòng tiêu đề có cột "Câu hỏi".' }); return res; }
  const head = (aoa[hIdx] as unknown[]).map(key);
  const cText = head.findIndex(h => h === 'cau hoi' || h === 'noi dung cau hoi');
  const cStt = findCol(head, 'stt', 'so tt');
  const cTopic = findCol(head, 'chu de', 'linh vuc');
  const cLevel = findCol(head, 'muc do', 'do kho');
  const cRight = findCol(head, 'dap an dung', 'dap an chinh xac');
  const cExpl = findCol(head, 'giai thich', 'giai dap');
  const cSrc = findCol(head, 'nguon', 'can cu');
  const cOpt = LETTERS.map(L => head.findIndex(h => h === `dap an ${L.toLowerCase()}` || h === `phuong an ${L.toLowerCase()}` || h === L.toLowerCase()));

  for (let r = hIdx + 1; r < aoa.length; r++) {
    const row = (aoa[r] || []) as unknown[];
    const cell = (c: number) => (c >= 0 ? String(row[c] ?? '').replace(/ /g, ' ').trim() : '');
    const text = cell(cText);
    const rawOpts = cOpt.map(c => cell(c));
    if (!text && rawOpts.every(o => !o)) continue;          // dòng trống
    const rowNo = r + 1;
    if (!text) { res.errors.push({ row: rowNo, message: 'thiếu nội dung câu hỏi' }); continue; }

    // Bỏ đáp án trống, giữ thứ tự; ghi nhớ vị trí gốc để đổi "Đáp án đúng"
    const kept: { L: string; t: string }[] = [];
    rawOpts.forEach((t, i) => { if (t) kept.push({ L: LETTERS[i], t }); });
    if (kept.length < 2) { res.errors.push({ row: rowNo, message: 'cần ít nhất 2 đáp án' }); continue; }

    const ans = cell(cRight);
    let correct = -1;
    const up = ans.toUpperCase().replace(/^(DAP AN|ĐÁP ÁN|PHƯƠNG ÁN)\s*/i, '').trim();
    if (/^[A-F]$/.test(up)) correct = kept.findIndex(k => k.L === up);
    else if (/^[1-6]$/.test(up)) correct = kept.findIndex(k => k.L === LETTERS[Number(up) - 1]);
    else if (ans) correct = kept.findIndex(k => key(k.t) === key(ans));
    if (correct < 0) { res.errors.push({ row: rowNo, message: ans ? `đáp án đúng "${ans}" không khớp đáp án nào` : 'thiếu đáp án đúng' }); continue; }

    const sttRaw = cell(cStt);
    res.items.push({
      row: rowNo, stt: /^\d+$/.test(sttRaw) ? Number(sttRaw) : null,
      topic: cell(cTopic) || undefined, level: cell(cLevel) || undefined, text,
      options: kept.map(k => k.t), correct, explanation: cell(cExpl) || undefined, source: cell(cSrc) || undefined
    });
  }
  return res;
};

export const readQuestionFile = async (file: File): Promise<ParseResult> => {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  let best: ParseResult | null = null;
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false }) as unknown[][];
    const r = parseQuestionRows(aoa);
    r.sheet = name;
    if (!best || r.items.length > best.items.length) best = r;
  }
  return best || { items: [], errors: [{ row: 0, message: 'Tệp không có trang tính nào.' }] };
};

/** Xuất ngân hàng câu hỏi ra Excel theo đúng mẫu nhập */
export const exportQuestions = async (qs: { stt?: number | null; topic?: string | null; level?: string | null; text: string; options: string[]; correct: number; explanation?: string | null; source?: string | null }[]) => {
  const XLSX = await import('xlsx');
  const rows = qs.map((q, i) => ({
    'STT': q.stt ?? i + 1, 'Chủ đề': q.topic || '', 'Mức độ': q.level || '', 'Câu hỏi': q.text,
    'Đáp án A': q.options[0] || '', 'Đáp án B': q.options[1] || '', 'Đáp án C': q.options[2] || '', 'Đáp án D': q.options[3] || '',
    'Đáp án E': q.options[4] || '', 'Đáp án F': q.options[5] || '',
    'Đáp án đúng': LETTERS[q.correct] || '', 'Giải thích': q.explanation || '', 'Nguồn': q.source || ''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [6, 18, 10, 60, 30, 30, 30, 30, 20, 20, 10, 50, 30].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Câu hỏi');
  XLSX.writeFile(wb, `ngan_hang_cau_hoi_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

// ------------------------------------------------------------------
// VIDEO
// ------------------------------------------------------------------
export const youtubeId = (url: string): string | null => {
  const m = (url || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};
export const driveId = (url: string): string | null => {
  const m = (url || '').match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{20,})/);
  return m ? m[1] : null;
};
export const guessVideoKind = (url: string): 'YOUTUBE' | 'DRIVE' | 'FILE' =>
  youtubeId(url) ? 'YOUTUBE' : driveId(url) ? 'DRIVE' : 'FILE';

// ------------------------------------------------------------------
// THIẾT BỊ
// ------------------------------------------------------------------
export const getDeviceId = (): string => {
  try {
    let id = localStorage.getItem('attendance_device_id');
    if (!id) {
      id = 'dev_' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem('attendance_device_id', id);
    }
    return id;
  } catch { return 'dev_tam_' + Date.now(); }
};

export const getDeviceLabel = (): string => {
  const ua = navigator.userAgent || '';
  const android = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/);
  if (android && android[1] && !/^K$/.test(android[1].trim())) return android[1].trim().slice(0, 40);
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Điện thoại Android';
  if (/Windows/.test(ua)) return 'Máy tính Windows';
  if (/Mac OS X/.test(ua)) return 'Máy Mac';
  return 'Thiết bị khác';
};

// ------------------------------------------------------------------
// ĐỊNH DẠNG
// ------------------------------------------------------------------
export const fmtDur = (sec: number): string => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h} giờ ${String(m).padStart(2, '0')}`;
  if (m) return `${m} phút${s && m < 10 ? ` ${s} giây` : ''}`;
  return `${s} giây`;
};
export const fmtClock = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export const fmtScore = (n?: number | null) => (n === null || n === undefined ? '–' : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 }));
export const fmtDate = (ms?: number | null) => (ms ? new Date(Number(ms)).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
export const fmtDay = (ms?: number | null) => (ms ? new Date(Number(ms)).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

export const grade = (score?: number | null, pass = 5): { label: string; tone: 'green' | 'blue' | 'amber' | 'red' } => {
  const s = Number(score ?? 0);
  if (s >= 9) return { label: 'Xuất sắc', tone: 'green' };
  if (s >= 8) return { label: 'Giỏi', tone: 'green' };
  if (s >= 6.5) return { label: 'Khá', tone: 'blue' };
  if (s >= pass) return { label: 'Đạt', tone: 'amber' };
  return { label: 'Không đạt', tone: 'red' };
};

export const assigneesOf = (list: string[], users: User[]) =>
  (list.length ? users.filter(u => list.includes(u.id)) : users.filter(u => u.role !== 'ADMIN' && u.isApproved !== false));

// ------------------------------------------------------------------
// PHÂN TÍCH KẾT QUẢ & NGHI VẤN
// Phần mềm chỉ nêu dấu hiệu; kết luận thuộc về hội đồng.
// ------------------------------------------------------------------
export interface Suspect { userIds: string[]; kind: 'FAST' | 'SAME_WRONG' | 'LEAVE' | 'DEVICE' | 'SHARED_DEVICE'; text: string; weight: number; }

const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export const analyzeResults = (exam: Exam, rows: ResultRow[], questions: Record<string, { text: string; topic?: string }>) => {
  const done = rows.filter(r => r.status === 'SUBMITTED' || r.status === 'AUTO_SUBMITTED');
  const scores = done.map(r => Number(r.score ?? 0));
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const passN = scores.filter(s => s >= exam.passScore).length;
  const bins = [0, 0, 0, 0, 0, 0, 0];                       // <4, 4–5, 5–6, 6–7, 7–8, 8–9, 9–10
  scores.forEach(s => { bins[s < 4 ? 0 : s >= 9 ? 6 : Math.floor(s) - 3]++; });

  // Tỉ lệ sai từng câu
  const stat = new Map<string, { n: number; wrong: number }>();
  done.forEach(r => Object.keys(r.keys || {}).forEach(q => {
    const st = stat.get(q) || { n: 0, wrong: 0 };
    st.n++; if (r.answers?.[q] === undefined || Number(r.answers[q]) !== Number(r.keys[q])) st.wrong++;
    stat.set(q, st);
  }));
  const hardest = [...stat.entries()].filter(([, s]) => s.n >= 2 && s.wrong > 0)
    .map(([id, s]) => ({ id, text: questions[id]?.text || '(câu đã xoá)', topic: questions[id]?.topic, rate: s.wrong / s.n, n: s.n }))
    .sort((a, b) => b.rate - a.rate).slice(0, 8);

  const suspects: Suspect[] = [];
  const dur = (r: ResultRow) => ((Number(r.submittedAt) || 0) - (Number(r.startedAt) || 0)) / 1000;
  const normal = done.filter(r => r.submitReason === 'Thí sinh nộp bài');
  const med = median(normal.map(dur));
  if (normal.length >= 3 && med > 0) {
    normal.forEach(r => {
      const d = dur(r);
      if (d < med * 0.35 && d < exam.durationMin * 60 * 0.5 && Number(r.score ?? 0) >= 8) {
        suspects.push({ userIds: [r.userId], kind: 'FAST', weight: 3,
          text: `Nộp sau ${fmtDur(d)} (trung vị ${fmtDur(med)}), đúng ${r.correct}/${r.total}` });
      }
    });
  }
  // Sai giống nhau: cùng chọn một đáp án SAI ở nhiều câu chung
  for (let i = 0; i < done.length; i++) {
    for (let j = i + 1; j < done.length; j++) {
      const a = done[i], b = done[j];
      let same = 0, wa = 0, wb = 0;
      for (const q of Object.keys(a.keys || {})) {
        if (!(q in (b.keys || {}))) continue;
        const k = Number(a.keys[q]); const x = a.answers?.[q], y = b.answers?.[q];
        const aw = x !== undefined && Number(x) !== k, bw = y !== undefined && Number(y) !== k;
        if (aw) wa++; if (bw) wb++;
        if (aw && bw && Number(x) === Number(y)) same++;
      }
      const minW = Math.min(wa, wb);
      if (same >= 4 && minW > 0 && same / minW >= 0.7) {
        suspects.push({ userIds: [a.userId, b.userId], kind: 'SAME_WRONG', weight: 3 + same / 10,
          text: `Sai giống nhau ${same}/${minW} câu sai, cùng chọn đáp án sai` });
      }
    }
  }
  rows.forEach(r => {
    if (r.leaveCount > 0) suspects.push({ userIds: [r.userId], kind: 'LEAVE', weight: r.leaveCount >= exam.maxLeave && exam.maxLeave > 0 ? 2.5 : 1 + r.leaveCount * 0.3,
      text: `Rời màn hình ${r.leaveCount} lần (tổng ${fmtDur((r.leaveMs || 0) / 1000)})${/Rời màn hình/.test(r.submitReason || '') ? ', bài tự nộp' : ''}` });
    if (r.deviceChanges > 0) suspects.push({ userIds: [r.userId], kind: 'DEVICE', weight: 2.5,
      text: `Đăng nhập máy khác khi đang thi (${r.deviceChanges} lần)` });
  });
  const byDev = new Map<string, string[]>();
  rows.forEach(r => { if (r.deviceId) byDev.set(r.deviceId, [...(byDev.get(r.deviceId) || []), r.userId]); });
  byDev.forEach(ids => { if (ids.length > 1) suspects.push({ userIds: ids, kind: 'SHARED_DEVICE', weight: 3, text: `${ids.length} tài khoản dùng chung một thiết bị` }); });
  suspects.sort((a, b) => b.weight - a.weight);

  return { done, avg, passN, bins, hardest, suspects, voided: rows.filter(r => r.status === 'VOID') };
};
