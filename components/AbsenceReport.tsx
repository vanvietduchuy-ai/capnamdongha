import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MockDB } from '../services/mockDatabase';
import { AttendanceAbsence, AttendanceRecord, AttendanceSession, User, UserDepartment, sessionState, sessionTime } from '../types';
import {
  AbsenceRow, buildAbsenceReport, exportAbsenceExcel, exportAbsenceWord, fmtDateTime
} from '../services/absenceReportService';
import { Portal } from './Portal';
import { ChevronDown, CalendarClock, FileDown, Sheet as SheetIcon, Info } from 'lucide-react';

interface Props {
  currentUser: User;
  canEdit: boolean;
}

type Preset = 'TODAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';

const pad = (n: number) => String(n).padStart(2, '0');
const toInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 0, 0, 0, 0).getTime(); };
const endOfDay = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999).getTime(); };

const presetRange = (p: Preset): [string, string] => {
  const now = new Date();
  const today = toInput(now);
  if (p === 'TODAY') return [today, today];
  if (p === 'WEEK') {
    const d = new Date(now);
    const diff = (d.getDay() + 6) % 7; // thứ Hai đầu tuần
    d.setDate(d.getDate() - diff);
    return [toInput(d), today];
  }
  if (p === 'MONTH') return [toInput(new Date(now.getFullYear(), now.getMonth(), 1)), today];
  if (p === 'QUARTER') return [toInput(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), today];
  return [toInput(new Date(now.getFullYear(), 0, 1)), today];
};

const SIGNER_KEY = 'absence_report_signer';

export const AbsenceReport: React.FC<Props> = ({ currentUser, canEdit }) => {
  const [[from, to], setRange] = useState<[string, string]>(presetRange('MONTH'));
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [absences, setAbsences] = useState<AttendanceAbsence[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'EXCUSED' | 'UNEXCUSED'>('ALL');
  const [busy, setBusy] = useState<'' | 'XLSX' | 'DOCX'>('');
  const [savingId, setSavingId] = useState('');
  const [showRange, setShowRange] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showSigner, setShowSigner] = useState(false);
  const [preset, setPreset] = useState<Preset | 'CUSTOM'>('MONTH');
  const [signer, setSigner] = useState(() => {
    try {
      const raw = localStorage.getItem(SIGNER_KEY);
      if (raw) return JSON.parse(raw) as { chucDanh: string; hoTen: string };
    } catch { /* bỏ qua */ }
    return { chucDanh: 'TRƯỞNG CÔNG AN PHƯỜNG', hoTen: '' };
  });
  const knownIds = useRef<Set<string>>(new Set());

  const load = async (keepSelection = true) => {
    const fromMs = startOfDay(from);
    const toMs = endOfDay(to);
    const [sess, allUsers] = await Promise.all([
      MockDB.getAttendanceSessions(fromMs, toMs),
      MockDB.getUsers()
    ]);
    const ids = sess.map(s => s.id);
    const [recs, abs] = await Promise.all([
      MockDB.getAttendanceRecordsForSessions(ids),
      MockDB.getAbsences(ids)
    ]);
    setSessions(sess);
    setRecords(recs);
    setAbsences(abs);
    setUsers(allUsers);
    const now = Date.now();
    const running = new Set(sess.filter(s => sessionState(s, now) === 'OPEN').map(s => s.id));
    setSelected(prev => {
      // Phiên đã kết thúc được chọn sẵn; phiên đang mở không chọn sẵn (chưa đủ căn cứ tính vắng)
      const next = new Set<string>();
      for (const id of ids) {
        const isNew = !keepSelection || !knownIds.current.has(id);
        if (isNew ? !running.has(id) : prev.has(id)) next.add(id);
      }
      return next;
    });
    knownIds.current = new Set(ids);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load(false);
    let timer: any = null;
    const unsub = MockDB.subscribe((table?: string) => {
      // Chỉ tải lại khi dữ liệu điểm danh / cán bộ thay đổi; gộp nhiều sự kiện liền nhau
      if (table && !table.startsWith('attendance_') && table !== 'users') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => load(true), 1000);
    });
    return () => { unsub(); if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    try { localStorage.setItem(SIGNER_KEY, JSON.stringify(signer)); } catch { /* bỏ qua */ }
  }, [signer]);

  const report = useMemo(() => buildAbsenceReport(
    sessions.filter(s => selected.has(s.id)),
    records, absences, users, startOfDay(from), endOfDay(to)
  ), [sessions, selected, records, absences, users, from, to]);

  const allSessionStats = useMemo(
    () => buildAbsenceReport(sessions, records, absences, users, startOfDay(from), endOfDay(to)).sessions,
    [sessions, records, absences, users, from, to]
  );

  const deptRows = report.rows.filter(r => deptFilter === 'ALL' || r.department === deptFilter);
  const statusCount = {
    ALL: deptRows.length,
    PENDING: deptRows.filter(r => r.absence?.excused !== true && r.absence?.excused !== false).length,
    EXCUSED: deptRows.filter(r => r.absence?.excused === true).length,
    UNEXCUSED: deptRows.filter(r => r.absence?.excused === false).length
  };
  const visibleRows = deptRows.filter(r => {
    const ex = r.absence?.excused;
    if (statusFilter === 'EXCUSED' && ex !== true) return false;
    if (statusFilter === 'UNEXCUSED' && ex !== false) return false;
    if (statusFilter === 'PENDING' && (ex === true || ex === false)) return false;
    return true;
  });

  const saveAbsence = async (row: AbsenceRow, patch: Partial<AttendanceAbsence>) => {
    const key = `${row.session.id}__${row.userId}`;
    const base: AttendanceAbsence = row.absence || {
      id: key, sessionId: row.session.id, userId: row.userId, excused: null, reason: ''
    };
    const next: AttendanceAbsence = { ...base, ...patch, id: key, updatedBy: currentUser.id };
    // Cập nhật giao diện ngay, ghi xuống máy chủ phía sau
    setAbsences(prev => [...prev.filter(a => `${a.sessionId}__${a.userId}` !== key), next]);
    setSavingId(key);
    const res = await MockDB.saveAbsence(next);
    setSavingId('');
    if (!res.ok) {
      alert(res.message || 'Không lưu được lý do vắng mặt.');
      load(true);
    }
  };

  const doExport = async (kind: 'XLSX' | 'DOCX') => {
    if (report.sessions.length === 0) {
      alert('Chưa chọn phiên điểm danh nào để báo cáo.');
      return;
    }
    if (kind === 'DOCX' && report.totals.pending > 0) {
      const ok = window.confirm(
        `Còn ${report.totals.pending} lượt vắng chưa xác minh lý do. Vẫn xuất báo cáo?`
      );
      if (!ok) return;
    }
    setBusy(kind);
    try {
      if (kind === 'XLSX') await exportAbsenceExcel(report);
      else await exportAbsenceWord(report, signer);
    } catch (e) {
      console.error(e);
      alert('Có lỗi khi xuất file. Vui lòng thử lại.');
    } finally {
      setBusy('');
    }
  };

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const t = report.totals;
  const PRESETS: [Preset, string][] = [['TODAY', 'Hôm nay'], ['WEEK', 'Tuần này'], ['MONTH', 'Tháng này'], ['QUARTER', 'Quý này'], ['YEAR', 'Năm nay']];
  const fmtD = (s: string) => s.split('-').reverse().join('/');
  const STATUS: { v: 'PENDING' | 'EXCUSED' | 'UNEXCUSED'; label: string; on: string }[] = [
    { v: 'PENDING', label: 'Chưa xác minh', on: 'bg-stone-100 text-stone-900 border-stone-400 font-semibold' },
    { v: 'EXCUSED', label: 'Có lý do', on: 'bg-amber-50 text-amber-900 border-amber-400 font-semibold' },
    { v: 'UNEXCUSED', label: 'Không lý do', on: 'bg-red-50 text-red-800 border-red-400 font-semibold' }
  ];
  const chipCls = (on: boolean) => `shrink-0 h-8 px-3 rounded-md text-[13px] border transition-colors ${on ? 'bg-stone-900 text-white border-stone-900 font-medium' : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300 active:bg-stone-100'}`;
  const card = 'bg-white rounded-xl border border-stone-200';

  return (
    <div className="max-w-6xl space-y-3 md:space-y-4 pb-24 md:pb-6" data-testid="absence-report">
      {/* Khoảng thời gian */}
      <div className={`${card} p-3 md:p-4`}>
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 py-0.5">
          {PRESETS.map(([p, label]) => (
            <button key={p} className={chipCls(preset === p)} onClick={() => { setPreset(p); setRange(presetRange(p)); setShowRange(false); }}>{label}</button>
          ))}
          <button className={chipCls(preset === 'CUSTOM')} onClick={() => { setPreset('CUSTOM'); setShowRange(v => !v); }}>Tuỳ chọn…</button>
        </div>
        <div className="mt-2 text-[13px] text-stone-500 tabular inline-flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" />Từ <b className="text-stone-900 font-medium">{fmtD(from)}</b> đến <b className="text-stone-900 font-medium">{fmtD(to)}</b></div>
        {showRange && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <label className="text-[13px] font-medium text-stone-700">Từ ngày
              <input type="date" value={from} max={to} onChange={e => e.target.value && setRange([e.target.value, to])}
                className="mt-1.5 w-full h-10 px-3 rounded-lg border border-stone-300 text-base md:text-sm text-stone-900" />
            </label>
            <label className="text-[13px] font-medium text-stone-700">Đến ngày
              <input type="date" value={to} min={from} onChange={e => e.target.value && setRange([from, e.target.value])}
                className="mt-1.5 w-full h-10 px-3 rounded-lg border border-stone-300 text-base md:text-sm text-stone-900" />
            </label>
          </div>
        )}
      </div>

      {/* Số liệu tổng */}
      <div className="grid grid-cols-4 gap-2 md:gap-3">
        {[
          ['Triệu tập', t.expected, 'text-stone-900'],
          ['Có mặt', t.present, 'text-emerald-700'],
          ['Có lý do', t.excused, 'text-amber-700'],
          ['Không lý do', t.unexcused, 'text-red-700']
        ].map(([label, value, cls]) => (
          <div key={label as string} className={`${card} px-3 py-2.5 md:px-4 md:py-3`}>
            <div className="text-[11px] md:text-[13px] font-medium text-stone-500 truncate">{label}</div>
            <div className={`mt-1 text-xl md:text-2xl font-semibold leading-none tabular ${cls}`}>{value}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-1">
        <div className="flex-1 h-1.5 rounded-full bg-stone-200 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${t.rate}%` }} /></div>
        <span className="text-[13px] text-stone-600 tabular">Tỷ lệ có mặt <b className="text-stone-900 font-semibold">{t.rate}%</b></span>
      </div>
      {t.pending > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-[13px] rounded-lg px-3 py-2.5 flex gap-2"><Info className="w-4 h-4 shrink-0 mt-0.5" /><span>
          Còn <b>{t.pending}</b> lượt vắng <b>chưa xác minh</b>.{canEdit ? ' Chọn "Có lý do" / "Không lý do" ở từng người bên dưới.' : ''}</span>
        </div>
      )}

      <div className="md:grid md:grid-cols-3 md:gap-4 space-y-3 md:space-y-0">
        {/* Hội nghị đưa vào báo cáo */}
        <div className={`${card} md:max-h-[680px] md:flex md:flex-col`}>
          <button onClick={() => setShowSessions(v => !v)} className="w-full px-4 py-3 flex items-center justify-between text-left md:cursor-default" data-testid="toggle-sessions">
            <div>
              <div className="text-sm font-semibold text-stone-900">Hội nghị đưa vào báo cáo</div>
              <div className="text-[13px] text-stone-500 tabular">Đã chọn <b className="text-stone-900 font-semibold">{selected.size}</b>/{sessions.length} hội nghị</div>
            </div>
            <ChevronDown className={`md:hidden w-5 h-5 text-stone-400 transition-transform ${showSessions ? 'rotate-180' : ''}`} />
          </button>
          <div className={`${showSessions ? 'block' : 'hidden'} md:flex md:flex-col md:min-h-0 border-t border-stone-200`}>
            {sessions.length > 0 && (
              <div className="px-3 pt-2 flex justify-end">
                <button onClick={() => setSelected(selected.size === sessions.length ? new Set() : new Set(sessions.map(s => s.id)))}
                  className="text-[13px] font-medium text-brand-700 px-2 py-1 hover:underline">{selected.size === sessions.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</button>
              </div>
            )}
            <div className="overflow-y-auto p-2 space-y-1.5 max-h-[50vh] md:max-h-none custom-scrollbar">
              {loading ? (
                <p className="text-center text-sm text-stone-400 py-8">Đang tải...</p>
              ) : allSessionStats.length === 0 ? (
                <p className="text-center text-sm text-stone-400 py-8">Không có hội nghị nào trong khoảng thời gian này.</p>
              ) : (
                [...allSessionStats].reverse().map(s => {
                  const on = selected.has(s.session.id);
                  const open = sessionState(s.session) === 'OPEN';
                  return (
                    <label key={s.session.id}
                      className={`flex gap-3 p-3 rounded-lg border cursor-pointer ${on ? 'bg-stone-50 border-stone-300' : 'border-stone-200 hover:bg-stone-50'}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle(s.session.id)} className="mt-0.5 w-5 h-5 rounded accent-red-700 border-stone-300 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-stone-900 leading-snug">{s.session.title}</div>
                        <div className="text-xs text-stone-500 tabular">{fmtDateTime(sessionTime(s.session))}
                          {open && <span className="ml-1 text-emerald-700 font-medium">· Đang điểm danh</span>}
                        </div>
                        <div className="text-xs mt-0.5 tabular">
                          <span className="text-stone-900 font-semibold">{s.present}</span><span className="text-stone-500">/{s.expected} có mặt · </span>
                          <span className={s.absent ? 'text-red-700 font-medium' : 'text-stone-500'}>{s.absent} vắng</span>
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Danh sách vắng mặt */}
        <div className={`md:col-span-2 ${card} md:max-h-[680px] md:flex md:flex-col`}>
          <div className="px-3 md:px-4 pt-3 pb-2.5 border-b border-stone-200 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-stone-900">Cán bộ vắng mặt ({visibleRows.length})</h3>
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                className="text-[13px] border border-stone-300 rounded-lg h-8 px-2 bg-white max-w-[48%]">
                <option value="ALL">Tất cả các tổ</option>
                {Object.values(UserDepartment).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {([['ALL', 'Tất cả'], ['PENDING', 'Chưa xác minh'], ['EXCUSED', 'Có lý do'], ['UNEXCUSED', 'Không lý do']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setStatusFilter(v)} className={chipCls(statusFilter === v)}>
                  {label} <span className={`tabular ${statusFilter === v ? 'text-stone-300' : 'text-stone-400'}`}>{statusCount[v]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="md:overflow-y-auto custom-scrollbar p-2 md:p-3">
            {visibleRows.length === 0 ? (
              <p className="text-center text-sm text-stone-400 py-10">
                {report.sessions.length === 0 ? 'Chọn ít nhất một hội nghị.' : 'Không có cán bộ vắng mặt phù hợp bộ lọc.'}
              </p>
            ) : (
              <div className="grid xl:grid-cols-2 gap-2">
                {visibleRows.map((r, i) => {
                  const key = `${r.session.id}__${r.userId}`;
                  const ex = r.absence?.excused;
                  const val = ex === true ? 'EXCUSED' : ex === false ? 'UNEXCUSED' : 'PENDING';
                  return (
                    <div key={key} data-testid="absence-card"
                      className={`relative rounded-lg border border-stone-200 p-3 pl-3.5 overflow-hidden`}>
                      <span className={`absolute left-0 top-0 bottom-0 w-1 ${val === 'UNEXCUSED' ? 'bg-red-500' : val === 'EXCUSED' ? 'bg-amber-400' : 'bg-stone-200'}`} />
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-stone-400 w-5 shrink-0 pt-0.5 tabular">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="font-semibold text-stone-900 text-sm">{r.fullName}</div>
                            {savingId === key && <span className="text-[10px] text-stone-400 shrink-0">Đang lưu…</span>}
                          </div>
                          <div className="text-xs text-stone-500">{r.department || '—'}</div>
                          <div className="text-xs text-stone-500 mt-1 line-clamp-2">{r.session.title} · <span className="tabular">{fmtDateTime(sessionTime(r.session))}</span></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mt-2.5">
                        {STATUS.map(o => (
                          <button key={o.v} disabled={!canEdit}
                            onClick={() => val !== o.v && saveAbsence(r, { excused: o.v === 'EXCUSED' ? true : o.v === 'UNEXCUSED' ? false : null })}
                            className={`h-8 px-1 rounded-md text-xs whitespace-nowrap overflow-hidden text-ellipsis border ${val === o.v ? o.on : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'} disabled:opacity-70`}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                      <input
                        key={`${key}_${r.absence?.updatedAt || 0}`}
                        defaultValue={r.absence?.reason || ''}
                        disabled={!canEdit}
                        placeholder={canEdit ? 'Lý do: đi công tác, nghỉ phép...' : 'Không có ghi chú'}
                        onBlur={e => {
                          const v = e.target.value.trim();
                          if (v !== (r.absence?.reason || '')) saveAbsence(r, { reason: v });
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className="mt-2 w-full h-9 text-base md:text-sm rounded-md px-3 border border-stone-300 bg-white disabled:bg-stone-50 focus:outline-none focus:ring-3 focus:ring-brand-600/15 focus:border-brand-600"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Người ký */}
      <div className={card}>
        <button onClick={() => setShowSigner(v => !v)} className="w-full px-4 py-3 flex items-center justify-between text-left">
          <div>
            <div className="text-sm font-semibold text-stone-900">Người ký báo cáo (Word)</div>
            <div className="text-[13px] text-stone-500">{signer.chucDanh}{signer.hoTen ? ` · ${signer.hoTen}` : ' · ký tay'}</div>
          </div>
          <ChevronDown className={`w-5 h-5 text-stone-400 transition-transform ${showSigner ? 'rotate-180' : ''}`} />
        </button>
        {showSigner && (
          <div className="grid md:grid-cols-2 gap-3 px-4 pb-4">
            <label className="text-[13px] font-medium text-stone-700">Chức danh người ký
              <input value={signer.chucDanh} onChange={e => setSigner({ ...signer, chucDanh: e.target.value })}
                className="mt-1.5 w-full h-10 px-3 rounded-lg border border-stone-300 text-base md:text-sm text-stone-900" />
            </label>
            <label className="text-[13px] font-medium text-stone-700">Họ tên người ký
              <input value={signer.hoTen} onChange={e => setSigner({ ...signer, hoTen: e.target.value })} placeholder="Để trống nếu ký tay"
                className="mt-1.5 w-full h-10 px-3 rounded-lg border border-stone-300 text-base md:text-sm text-stone-900" />
            </label>
          </div>
        )}
      </div>

      {/* Xuất báo cáo: máy tính hiển thị trong trang, điện thoại cố định dưới màn hình */}
      <div className={`hidden md:block ${card} p-4`}>
        <div className="flex gap-2 max-w-6xl mx-auto">
          <button onClick={() => doExport('DOCX')} disabled={!!busy} data-testid="export-docx"
            className="flex-1 h-11 rounded-lg bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white font-semibold text-sm inline-flex items-center justify-center gap-2"><FileDown className="w-4 h-4" />
            {busy === 'DOCX' ? 'Đang tạo...' : <>Xuất Word<span className="hidden sm:inline"> (thể thức NĐ30)</span></>}
          </button>
          <button onClick={() => doExport('XLSX')} disabled={!!busy} data-testid="export-xlsx"
            className="flex-1 h-11 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-60 text-stone-800 font-semibold text-sm inline-flex items-center justify-center gap-2"><SheetIcon className="w-4 h-4" />
            {busy === 'XLSX' ? 'Đang tạo...' : <>Xuất Excel<span className="hidden sm:inline"> tổng hợp</span></>}
          </button>
        </div>
        <p className="text-xs text-stone-500 mt-2">
          Báo cáo gồm {report.sessions.length} hội nghị đã chọn. Word: số liệu, danh sách vắng và tổng hợp theo cán bộ. Excel: 3 trang tính.
        </p>
      </div>
      <Portal>
        <div className="md:hidden fixed inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-stone-200 px-3 py-2.5"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
        <div className="flex gap-2 max-w-6xl mx-auto">
          <button onClick={() => doExport('DOCX')} disabled={!!busy} data-testid="export-docx-m"
            className="flex-1 h-11 rounded-lg bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white font-semibold text-sm inline-flex items-center justify-center gap-2"><FileDown className="w-4 h-4" />
            {busy === 'DOCX' ? 'Đang tạo...' : <>Xuất Word<span className="hidden sm:inline"> (thể thức NĐ30)</span></>}
          </button>
          <button onClick={() => doExport('XLSX')} disabled={!!busy} data-testid="export-xlsx-m"
            className="flex-1 h-11 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-60 text-stone-800 font-semibold text-sm inline-flex items-center justify-center gap-2"><SheetIcon className="w-4 h-4" />
            {busy === 'XLSX' ? 'Đang tạo...' : <>Xuất Excel<span className="hidden sm:inline"> tổng hợp</span></>}
          </button>
        </div>
        </div>
      </Portal>
    </div>
  );
};
