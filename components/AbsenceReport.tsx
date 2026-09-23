import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MockDB } from '../services/mockDatabase';
import { AttendanceAbsence, AttendanceRecord, AttendanceSession, User, UserDepartment } from '../types';
import {
  AbsenceRow, buildAbsenceReport, exportAbsenceExcel, exportAbsenceWord, fmtDateTime
} from '../services/absenceReportService';

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
    const running = new Set(sess.filter(s => s.isActive !== false && s.expiresAt > now).map(s => s.id));
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

  const visibleRows = report.rows.filter(r => {
    if (deptFilter !== 'ALL' && r.department !== deptFilter) return false;
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

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Bộ lọc thời gian */}
      <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-stone-100">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="grid grid-cols-2 gap-3 flex-1">
            <label className="text-xs font-bold text-stone-500 uppercase">
              Từ ngày
              <input type="date" value={from} max={to}
                onChange={e => e.target.value && setRange([e.target.value, to])}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-stone-200 text-sm text-stone-800 font-medium normal-case" />
            </label>
            <label className="text-xs font-bold text-stone-500 uppercase">
              Đến ngày
              <input type="date" value={to} min={from}
                onChange={e => e.target.value && setRange([from, e.target.value])}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-stone-200 text-sm text-stone-800 font-medium normal-case" />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([['TODAY', 'Hôm nay'], ['WEEK', 'Tuần này'], ['MONTH', 'Tháng này'], ['QUARTER', 'Quý này'], ['YEAR', 'Năm nay']] as [Preset, string][])
              .map(([p, label]) => (
                <button key={p} onClick={() => setRange(presetRange(p))}
                  className="px-3 py-2 text-xs font-bold rounded-lg border border-stone-200 bg-stone-50 text-stone-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200">
                  {label}
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Số liệu tổng */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ['Phiên điểm danh', t.sessions, 'text-stone-800'],
          ['Lượt triệu tập', t.expected, 'text-stone-800'],
          ['Có mặt', `${t.present} (${t.rate}%)`, 'text-green-600'],
          ['Vắng có lý do', t.excused, 'text-amber-600'],
          ['Vắng không lý do', t.unexcused, 'text-red-600']
        ].map(([label, value, color]) => (
          <div key={label as string} className="bg-white p-3 rounded-2xl border border-stone-100 shadow-sm">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">{label}</div>
            <div className={`text-xl md:text-2xl font-extrabold mt-1 ${color}`}>{value}</div>
          </div>
        ))}
      </div>
      {t.pending > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded-xl px-4 py-2.5">
          Còn <b>{t.pending}</b> lượt vắng <b>chưa xác minh lý do</b>. {canEdit ? 'Cập nhật ở cột "Tình trạng" bên dưới trước khi xuất báo cáo.' : ''}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-5">
        {/* Danh sách phiên */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm flex flex-col max-h-[560px]">
          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-700 uppercase">Phiên điểm danh ({sessions.length})</h3>
            {sessions.length > 0 && (
              <button
                onClick={() => setSelected(selected.size === sessions.length ? new Set() : new Set(sessions.map(s => s.id)))}
                className="text-[11px] font-bold text-red-600 hover:underline">
                {selected.size === sessions.length ? 'Bỏ chọn' : 'Chọn tất cả'}
              </button>
            )}
          </div>
          <div className="overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
            {loading ? (
              <p className="text-center text-sm text-stone-400 py-8">Đang tải...</p>
            ) : allSessionStats.length === 0 ? (
              <p className="text-center text-sm text-stone-400 py-8">Không có phiên điểm danh nào trong khoảng thời gian này.</p>
            ) : (
              [...allSessionStats].reverse().map(s => (
                <label key={s.session.id}
                  className={`flex gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${selected.has(s.session.id) ? 'bg-red-50/60 border-red-200' : 'border-stone-100 hover:border-stone-300'}`}>
                  <input type="checkbox" checked={selected.has(s.session.id)} onChange={() => toggle(s.session.id)}
                    className="mt-1 w-4 h-4 rounded text-red-600 border-stone-300" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-stone-800 truncate">{s.session.title}</div>
                    <div className="text-[11px] text-stone-400">{fmtDateTime(s.session.createdAt)}
                      {s.session.isActive !== false && s.session.expiresAt > Date.now() && <span className="ml-1 text-green-600 font-bold">• Đang mở (chưa kết thúc)</span>}
                    </div>
                    <div className="text-[11px] mt-0.5">
                      <span className="text-green-700 font-bold">{s.present}</span>
                      <span className="text-stone-400">/{s.expected} có mặt · </span>
                      <span className={s.absent ? 'text-red-600 font-bold' : 'text-stone-400'}>{s.absent} vắng</span>
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Danh sách vắng mặt */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-stone-100 shadow-sm flex flex-col max-h-[560px]">
          <div className="px-4 py-3 border-b border-stone-100 flex flex-wrap items-center gap-2 justify-between">
            <h3 className="text-sm font-bold text-stone-700 uppercase">Cán bộ vắng mặt ({visibleRows.length})</h3>
            <div className="flex gap-2">
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                className="text-xs border border-stone-200 rounded-lg px-2 py-1.5 bg-white">
                <option value="ALL">Tất cả các tổ</option>
                {Object.values(UserDepartment).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                className="text-xs border border-stone-200 rounded-lg px-2 py-1.5 bg-white">
                <option value="ALL">Mọi tình trạng</option>
                <option value="PENDING">Chưa xác minh</option>
                <option value="EXCUSED">Có lý do</option>
                <option value="UNEXCUSED">Không lý do</option>
              </select>
            </div>
          </div>
          <div className="overflow-auto custom-scrollbar">
            {visibleRows.length === 0 ? (
              <p className="text-center text-sm text-stone-400 py-10">
                {report.sessions.length === 0 ? 'Chọn ít nhất một phiên điểm danh.' : 'Không có cán bộ vắng mặt phù hợp bộ lọc.'}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-[11px] uppercase text-stone-500 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-8">#</th>
                    <th className="px-3 py-2 text-left">Cán bộ</th>
                    <th className="px-3 py-2 text-left">Hội nghị</th>
                    <th className="px-3 py-2 text-left w-36">Tình trạng</th>
                    <th className="px-3 py-2 text-left">Lý do / ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r, i) => {
                    const key = `${r.session.id}__${r.userId}`;
                    const ex = r.absence?.excused;
                    const val = ex === true ? 'EXCUSED' : ex === false ? 'UNEXCUSED' : 'PENDING';
                    return (
                      <tr key={key} className="border-t border-stone-100 align-top">
                        <td className="px-3 py-2 text-stone-400">{i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="font-bold text-stone-800">{r.fullName}</div>
                          <div className="text-[11px] text-stone-400">{r.department || '—'}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-stone-700 line-clamp-2">{r.session.title}</div>
                          <div className="text-[11px] text-stone-400">{fmtDateTime(r.session.createdAt)}</div>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={val}
                            disabled={!canEdit}
                            onChange={e => {
                              const v = e.target.value;
                              saveAbsence(r, { excused: v === 'EXCUSED' ? true : v === 'UNEXCUSED' ? false : null });
                            }}
                            className={`w-full text-xs font-bold rounded-lg px-2 py-1.5 border ${
                              val === 'EXCUSED' ? 'bg-amber-50 border-amber-200 text-amber-800'
                                : val === 'UNEXCUSED' ? 'bg-red-50 border-red-200 text-red-700'
                                  : 'bg-stone-50 border-stone-200 text-stone-500'}`}>
                            <option value="PENDING">Chưa xác minh</option>
                            <option value="EXCUSED">Có lý do</option>
                            <option value="UNEXCUSED">Không lý do</option>
                          </select>
                          {savingId === key && <div className="text-[10px] text-stone-400 mt-1">Đang lưu...</div>}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            key={`${key}_${r.absence?.updatedAt || 0}`}
                            defaultValue={r.absence?.reason || ''}
                            disabled={!canEdit}
                            placeholder={canEdit ? 'VD: Đi công tác, nghỉ phép...' : ''}
                            onBlur={e => {
                              const v = e.target.value.trim();
                              if (v !== (r.absence?.reason || '')) saveAbsence(r, { reason: v });
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            className="w-full text-xs rounded-lg px-2 py-1.5 border border-stone-200 disabled:bg-stone-50"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Xuất báo cáo */}
      <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-stone-100">
        <h3 className="text-sm font-bold text-stone-700 uppercase mb-3">Xuất báo cáo</h3>
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <label className="text-xs font-bold text-stone-500 uppercase">
            Chức danh người ký
            <input value={signer.chucDanh} onChange={e => setSigner({ ...signer, chucDanh: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-stone-200 text-sm text-stone-800 font-medium" />
          </label>
          <label className="text-xs font-bold text-stone-500 uppercase">
            Họ tên người ký
            <input value={signer.hoTen} onChange={e => setSigner({ ...signer, hoTen: e.target.value })}
              placeholder="Để trống nếu ký tay"
              className="mt-1 w-full px-3 py-2 rounded-xl border border-stone-200 text-sm text-stone-800 font-medium normal-case" />
          </label>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={() => doExport('DOCX')} disabled={!!busy}
            className="flex-1 py-3 rounded-xl bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white font-bold text-sm shadow-sm">
            {busy === 'DOCX' ? 'Đang tạo file...' : 'Xuất báo cáo Word (thể thức NĐ30)'}
          </button>
          <button onClick={() => doExport('XLSX')} disabled={!!busy}
            className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold text-sm shadow-sm">
            {busy === 'XLSX' ? 'Đang tạo file...' : 'Xuất bảng tổng hợp Excel'}
          </button>
        </div>
        <p className="text-[11px] text-stone-400 mt-2">
          Báo cáo gồm {report.sessions.length} phiên đã chọn. Word: báo cáo có số liệu, danh sách vắng và tổng hợp theo cán bộ.
          Excel: 3 trang tính (danh sách vắng, theo phiên, theo cán bộ).
        </p>
      </div>
    </div>
  );
};
