import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { MockDB } from '../services/mockDatabase';
import {
  AttendanceRecord, AttendanceSession, AttendanceAbsence, Seat, SeatFlag, SeatLayout, User, UserPermission, UserRole,
  sessionState, sessionTime, SessionState
} from '../types';
import { ParticipantPicker } from './ParticipantPicker';
import { Portal } from './Portal';
import { SkeletonList, BumpNumber } from './UI';
import { SeatMap, SeatLegend, PersonIcon } from './SeatMap';
import { SeatingManager } from './SeatingManager';
import { seatStateFactory, seatingStats } from '../lib/seating';
import { guestUrl, officerPayload, signSlot } from '../lib/qrCode';
import { LOGO_URL, ORG_NAME } from '../lib/brand';
import {
  Plus, CalendarPlus, CalendarClock, Timer, MapPin, Users as UsersIcon, Play, Pencil, Trash2, QrCode, UserPlus, Square,
  FileText, RotateCcw, X, ChevronLeft, ChevronRight, Maximize2, FileDown, Sheet as SheetIcon, CheckCircle2, LayoutGrid, AlertTriangle
} from 'lucide-react';

interface Props { currentUser: User; }

type Filter = 'ALL' | SessionState;

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDT = (ms?: number | null) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const fmtTime = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toLocalInput = (ms?: number | null) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtRemain = (ms: number) => {
  if (ms <= 0) return '00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const ss = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
};

const STATE_BADGE: Record<SessionState, { label: string; cls: string }> = {
  OPEN:   { label: 'Đang điểm danh', cls: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200' },
  DRAFT:  { label: 'Chưa bắt đầu',   cls: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200' },
  CLOSED: { label: 'Đã kết thúc',    cls: 'bg-stone-100 text-stone-600 ring-1 ring-inset ring-stone-200' }
};
const DURATIONS = [
  { m: 30, label: '30 phút' }, { m: 60, label: '1 giờ' }, { m: 120, label: '2 giờ' },
  { m: 240, label: '4 giờ' }, { m: 480, label: '8 giờ' }
];

/** Quản lý hội nghị: tạo trước → chọn thành phần → Bắt đầu (mã QR) → Kết thúc */
export const MeetingManager: React.FC<Props> = ({ currentUser }) => {
  const [meetings, setMeetings] = useState<AttendanceSession[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Soạn / sửa hội nghị
  const [editing, setEditing] = useState<null | { id?: string; title: string; when: string; location: string; ids: string[]; state: SessionState | 'NEW'; locked: string[]; seatCompare: boolean; layoutId: string }>(null);
  // Sơ đồ chỗ ngồi & đối sánh
  const [layouts, setLayouts] = useState<SeatLayout[]>([]);
  const [flags, setFlags] = useState<SeatFlag[]>([]);
  const [absences, setAbsences] = useState<AttendanceAbsence[]>([]);
  const [seatMgr, setSeatMgr] = useState<{ open: boolean; id?: string | null }>({ open: false });
  const [pickerOpen, setPickerOpen] = useState(false);
  // Bắt đầu
  const [starting, setStarting] = useState<AttendanceSession | null>(null);
  const [duration, setDuration] = useState(120);
  // Màn hình mã QR / kết quả
  const [liveId, setLiveId] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);

  const canSeeAll = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CHIEF ||
    currentUser.role === UserRole.DEPUTY_CHIEF ||
    !!currentUser.permissions?.includes(UserPermission.MANAGE_ATTENDANCE);

  const showToast = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    try {
      const [list, us] = await Promise.all([MockDB.getMeetings(), MockDB.getUsers()]);
      setMeetings(list);
      setAllUsers(us);
      setUsers(us.filter(u => u.role !== UserRole.ADMIN && (canSeeAll || u.department === currentUser.department)));
      const ids = list.filter(s => s.status !== 'DRAFT').map(s => s.id);
      const seatIds = list.filter(s => s.seatCompare && s.status !== 'DRAFT').map(s => s.id);
      const [recs, lays, fl, ab] = await Promise.all([
        ids.length ? MockDB.getAttendanceRecordsForSessions(ids) : Promise.resolve([]),
        MockDB.getSeatLayouts(),
        MockDB.getSeatFlags(seatIds),
        MockDB.getAbsences(seatIds)
      ]);
      setRecords(recs); setLayouts(lays); setFlags(fl); setAbsences(ab);
    } catch (e) {
      console.error('Lỗi tải danh sách hội nghị', e);
    } finally {
      setLoading(false);
    }
  }, [canSeeAll, currentUser.department]);

  // Tải lần đầu + đồng bộ tức thời (gom nhiều sự kiện) + dự phòng thăm dò
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    load();
    const unsub = MockDB.subscribe((table?: string) => {
      if (table && !/attendance|users/.test(table)) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(load, 400);
    });
    const poll = window.setInterval(load, 15000);
    return () => { unsub(); window.clearInterval(poll); window.clearTimeout(timer.current); };
  }, [load]);

  // Đồng hồ: 1 giây khi đang mở mã QR, 20 giây khi ở danh sách
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), liveId ? 1000 : 20000);
    return () => window.clearInterval(t);
  }, [liveId]);

  const userMap = useMemo(() => new Map(allUsers.map(u => [u.id, u])), [allUsers]);
  const recBySession = useMemo(() => {
    const m = new Map<string, AttendanceRecord[]>();
    for (const r of records) { if (!m.has(r.sessionId)) m.set(r.sessionId, []); m.get(r.sessionId)!.push(r); }
    return m;
  }, [records]);

  const withState = useMemo(() => meetings.map(s => ({ s, st: sessionState(s, now) })), [meetings, now]);
  const counts = useMemo(() => ({
    ALL: withState.length,
    OPEN: withState.filter(x => x.st === 'OPEN').length,
    DRAFT: withState.filter(x => x.st === 'DRAFT').length,
    CLOSED: withState.filter(x => x.st === 'CLOSED').length
  }), [withState]);
  const visible = useMemo(() => {
    const rank: Record<SessionState, number> = { OPEN: 0, DRAFT: 1, CLOSED: 2 };
    return withState
      .filter(x => filter === 'ALL' || x.st === filter)
      .sort((a, b) => {
        if (rank[a.st] !== rank[b.st]) return rank[a.st] - rank[b.st];
        if (a.st === 'DRAFT') return (a.s.scheduledAt || a.s.createdAt) - (b.s.scheduledAt || b.s.createdAt);
        return (b.s.endedAt || sessionTime(b.s)) - (a.s.endedAt || sessionTime(a.s));
      });
  }, [withState, filter]);

  const stats = (s: AttendanceSession) => {
    const expected = s.expectedUserIds || [];
    const recs = recBySession.get(s.id) || [];
    const checked = new Set(recs.filter(r => !r.guestName).map(r => r.userId));
    const present = expected.filter(id => checked.has(id));
    const absent = expected.filter(id => !checked.has(id));
    const extra = recs.filter(r => r.guestName || !expected.includes(r.userId));
    return { expected, recs, present, absent, extra };
  };

  // ---------------- Hành động ----------------
  const openNew = () => setEditing({ title: '', when: '', location: '', ids: [], state: 'NEW', locked: [], seatCompare: false, layoutId: layouts[0]?.id || '' });
  const openEdit = (s: AttendanceSession, pick = false) => {
    const st = sessionState(s, Date.now());
    setEditing({
      id: s.id, title: s.title, when: toLocalInput(s.scheduledAt), location: s.location || '',
      ids: [...(s.expectedUserIds || [])], state: st, locked: st === 'OPEN' ? [...(s.expectedUserIds || [])] : [],
      seatCompare: !!s.seatCompare, layoutId: s.seatLayoutId || layouts[0]?.id || ''
    });
    if (pick) setPickerOpen(true);
  };

  const saveEditing = async (thenStart = false) => {
    if (!editing) return;
    if (!editing.title.trim()) { showToast('Vui lòng nhập tên hội nghị.'); return; }
    if (editing.seatCompare && !layouts.some(l => l.id === editing.layoutId)) { showToast('Chọn sơ đồ chỗ ngồi hoặc tắt "Đối sánh sơ đồ chỗ ngồi".'); return; }
    setBusy('save');
    const res = await MockDB.saveMeeting({
      id: editing.id, title: editing.title.trim(),
      scheduledAt: editing.when ? new Date(editing.when).getTime() : null,
      location: editing.location.trim(), expectedUserIds: editing.ids
    });
    if (res.ok && res.session) {
      const prev = meetings.find(m => m.id === res.session!.id);
      if (!!prev?.seatCompare !== editing.seatCompare || (editing.seatCompare && prev?.seatLayoutId !== editing.layoutId) || (!prev && editing.seatCompare)) {
        const r2 = await MockDB.setMeetingSeating(res.session.id, editing.layoutId || null, editing.seatCompare);
        if (!r2.ok) { setBusy(null); showToast(r2.message || 'Không lưu được tuỳ chọn đối sánh sơ đồ.'); await load(); return; }
        res.session = { ...res.session, seatCompare: editing.seatCompare, seatLayoutId: editing.layoutId || res.session.seatLayoutId };
      }
    }
    setBusy(null);
    if (!res.ok) { showToast(res.message || 'Không lưu được hội nghị.'); return; }
    setEditing(null);
    if (res.note) showToast(res.note); else if (!thenStart) showToast('Đã lưu hội nghị.');
    await load();
    if (thenStart && res.session) askStart(res.session);
  };

  const askStart = (s: AttendanceSession) => {
    if (!(s.expectedUserIds || []).length) { showToast('Chưa chọn thành phần tham dự.'); openEdit(s, true); return; }
    setDuration(120);
    setStarting(s);
  };
  const doStart = async () => {
    if (!starting) return;
    setBusy('start');
    const res = await MockDB.startMeeting(starting.id, duration);
    setBusy(null);
    if (!res.ok) { showToast(res.message || 'Không bắt đầu được.'); return; }
    const id = starting.id;
    setStarting(null);
    await load();
    setResultId(null);
    setLiveId(id);
  };

  const doEnd = async (s: AttendanceSession) => {
    const st = stats(s);
    if (!window.confirm(`Kết thúc điểm danh "${s.title}"?\nCó mặt ${st.present.length}/${st.expected.length}, vắng ${st.absent.length}.`)) return;
    setBusy('end');
    await MockDB.endSession(s.id);
    setBusy(null);
    setLiveId(null);
    await load();
    setResultId(s.id);
  };

  const doExtend = async (s: AttendanceSession, minutes: number) => {
    try {
      await MockDB.updateAttendanceSession({ ...s, expiresAt: Math.max(s.expiresAt, Date.now()) + minutes * 60000, isActive: true });
      await load();
      showToast(`Đã gia hạn thêm ${minutes} phút.`);
    } catch (e: any) { showToast(e?.message || 'Không gia hạn được.'); }
  };

  const doDelete = async (s: AttendanceSession) => {
    if (!window.confirm(`Xoá hội nghị "${s.title}"?`)) return;
    const res = await MockDB.deleteMeeting(s.id);
    if (!res.ok) showToast(res.message || 'Không xoá được.');
    await load();
  };

  const exportReport = async (s: AttendanceSession, kind: 'DOCX' | 'XLSX') => {
    setBusy(kind);
    try {
      const svc = await import('../services/absenceReportService');
      const [recs, abs, us] = await Promise.all([MockDB.getAttendanceRecords(s.id), MockDB.getAbsences([s.id]), MockDB.getUsers()]);
      const from = sessionTime(s);
      const rep = svc.buildAbsenceReport([s], recs, abs, us, from, s.endedAt || s.expiresAt || from);
      if (kind === 'DOCX') {
        let signer = { chucDanh: 'TRƯỞNG CÔNG AN PHƯỜNG', hoTen: '' };
        try { const raw = localStorage.getItem('absence_report_signer'); if (raw) signer = JSON.parse(raw); } catch { /* bỏ qua */ }
        await svc.exportAbsenceWord(rep, signer);
      } else await svc.exportAbsenceExcel(rep);
    } catch (e) {
      console.error(e); showToast('Có lỗi khi xuất báo cáo.');
    } finally { setBusy(null); }
  };

  const liveSession = liveId ? meetings.find(m => m.id === liveId) || null : null;
  const resultSession = resultId ? meetings.find(m => m.id === resultId) || null : null;

  // Hội nghị hết giờ tự động khi đang mở mã QR → chuyển sang kết quả
  useEffect(() => {
    if (liveSession && sessionState(liveSession, now) === 'CLOSED') {
      setLiveId(null); setResultId(liveSession.id);
      showToast('Hội nghị đã hết thời gian điểm danh.');
    }
  }, [liveSession, now]);

  // ---------------- Giao diện ----------------
  const chip = (f: Filter, label: string) => (
    <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
      className={`shrink-0 h-8 px-3 rounded-md text-[13px] border transition-colors ${filter === f ? 'bg-stone-900 text-white border-stone-900 font-medium' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'}`}>
      {label} <span className={`tabular ${filter === f ? 'text-stone-300' : 'text-stone-400'}`}>{counts[f]}</span>
    </button>
  );
  const btnPrimary = 'inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-50';
  const btnDanger = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-stone-300 bg-white hover:bg-red-50 hover:border-red-300 text-red-700 text-[13px] font-medium disabled:opacity-50';
  const btnSecondary = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-[13px] font-medium disabled:opacity-50';

  return (
    <div className="max-w-5xl pb-24 md:pb-6" data-testid="meeting-manager">
      <div className="flex items-center justify-between gap-3 mb-3 md:mb-4">
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 py-0.5">
          {chip('ALL', 'Tất cả')}{chip('OPEN', 'Đang điểm danh')}{chip('DRAFT', 'Chưa bắt đầu')}{chip('CLOSED', 'Đã kết thúc')}
        </div>
        <div className="hidden md:block shrink-0"><button onClick={openNew} className={btnPrimary}><Plus className="w-4 h-4" />Tạo hội nghị</button></div>
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : visible.length === 0 ? (
        <div className="py-14 px-6 text-center bg-white rounded-xl border border-dashed border-stone-300">
          <CalendarPlus className="w-8 h-8 mx-auto text-stone-300 mb-3" />
          <p className="text-sm text-stone-500">{filter === 'ALL' ? 'Chưa có hội nghị nào.' : 'Không có hội nghị ở mục này.'}</p>
          <p className="text-xs text-stone-400 mt-1">Tạo trước, chọn thành phần; đến giờ bấm Bắt đầu để hiện mã QR.</p>
          <button onClick={openNew} className={`mt-4 ${btnPrimary}`}><Plus className="w-4 h-4" />Tạo hội nghị</button>
        </div>
      ) : (
        <div className="stagger space-y-2.5 md:space-y-3">
          {visible.map(({ s, st }) => {
            const k = stats(s);
            const badge = STATE_BADGE[st];
            const pct = k.expected.length ? Math.round(k.present.length * 100 / k.expected.length) : 0;
            return (
              <div key={s.id} data-testid="meeting-card"
                className={`relative bg-white rounded-xl border p-4 md:p-5 overflow-hidden ${st === 'OPEN' ? 'border-emerald-300' : 'border-stone-200'}`}>
                {st === 'OPEN' && <span className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />}
                <div className="md:flex md:items-start md:gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-[15px] md:text-base font-semibold text-stone-900 leading-snug">{s.title}</h3>
                      <span className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-md ${badge.cls}`}>
                        {st === 'OPEN' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />}
                        {badge.label}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-stone-500">
                      {st === 'DRAFT' && <span className="inline-flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" />{s.scheduledAt ? `Dự kiến ${fmtDT(s.scheduledAt)}` : 'Chưa đặt giờ'}</span>}
                      {st === 'OPEN' && <span className="inline-flex items-center gap-1.5 tabular"><Timer className="w-3.5 h-3.5" />Bắt đầu {fmtTime(sessionTime(s))} · còn {fmtRemain(s.expiresAt - now)}</span>}
                      {st === 'CLOSED' && <span className="inline-flex items-center gap-1.5 tabular"><CalendarClock className="w-3.5 h-3.5" />{fmtDT(sessionTime(s))}{s.endedAt ? ` → ${fmtTime(s.endedAt)}` : ''}</span>}
                      {s.location && <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{s.location}</span>}
                      <span className="inline-flex items-center gap-1.5"><UsersIcon className="w-3.5 h-3.5" />{k.expected.length} thành phần</span>
                    </div>
                    {st !== 'DRAFT' && (
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden max-w-xs">
                          <div className={`h-full ${st === 'OPEN' ? 'bg-emerald-500' : 'bg-stone-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[13px] tabular text-stone-600"><b className="text-stone-900 font-semibold">{k.present.length}</b>/{k.expected.length} có mặt</span>
                        {k.absent.length > 0 && <span className="text-[13px] tabular text-red-700">{k.absent.length} vắng</span>}
                        {k.extra.length > 0 && <span className="text-[13px] tabular text-stone-500">+{k.extra.length} khách</span>}
                      </div>
                    )}
                  </div>

                  <div className="mt-3.5 md:mt-0 flex flex-wrap gap-2 md:justify-end md:shrink-0">
                    {st === 'DRAFT' && <>
                      <button data-testid="btn-start" onClick={() => askStart(s)} className={`w-full md:w-auto ${btnPrimary}`}><Play className="w-4 h-4" />Bắt đầu điểm danh</button>
                      <button onClick={() => openEdit(s, true)} className={btnSecondary}><UsersIcon className="w-4 h-4" />Thành phần</button>
                      <button onClick={() => openEdit(s)} className={btnSecondary}><Pencil className="w-4 h-4" />Sửa</button>
                      <button onClick={() => doDelete(s)} className={btnDanger} aria-label="Xoá hội nghị"><Trash2 className="w-4 h-4" /><span className="md:hidden">Xoá</span></button>
                    </>}
                    {st === 'OPEN' && <>
                      <button data-testid="btn-qr" onClick={() => setLiveId(s.id)} className={`w-full md:w-auto ${btnPrimary}`}><QrCode className="w-4 h-4" />Mở mã QR</button>
                      <button onClick={() => openEdit(s, true)} className={btnSecondary}><UserPlus className="w-4 h-4" />Bổ sung</button>
                      <button data-testid="btn-end" disabled={busy === 'end'} onClick={() => doEnd(s)} className={btnDanger}><Square className="w-3.5 h-3.5" />Kết thúc</button>
                    </>}
                    {st === 'CLOSED' && <>
                      <button data-testid="btn-result" onClick={() => setResultId(s.id)} className={`${btnSecondary} h-10 flex-1 md:flex-none`}><FileText className="w-4 h-4" />Kết quả &amp; báo cáo</button>
                      <button onClick={() => askStart(s)} className={`${btnSecondary} h-10`}><RotateCcw className="w-4 h-4" />Mở lại</button>
                    </>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nút tạo nổi trên điện thoại (nằm trên thanh tab) */}
      <Portal><button onClick={openNew} aria-label="Tạo hội nghị" data-testid="fab-new"
        className="md:hidden fixed right-4 z-40 h-12 pl-4 pr-5 rounded-full bg-brand-700 active:bg-brand-800 text-white text-sm font-semibold shadow-lg inline-flex items-center gap-2"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        <Plus className="w-5 h-5" />Tạo hội nghị
      </button></Portal>

      {/* ============ Soạn hội nghị ============ */}
      {editing && (
        <Sheet title={editing.state === 'NEW' ? 'Tạo hội nghị' : 'Sửa hội nghị'} onClose={() => setEditing(null)}
          footer={<>
            <button onClick={() => saveEditing(false)} disabled={busy === 'save'}
              className={`flex-1 ${editing.state === 'NEW' || editing.state === 'DRAFT' ? 'inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-sm font-semibold disabled:opacity-40' : 'inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-40'}`}>
              {busy === 'save' ? 'Đang lưu...' : 'Lưu'}
            </button>
            {(editing.state === 'NEW' || editing.state === 'DRAFT') && (
              <button data-testid="btn-save-start" onClick={() => saveEditing(true)} disabled={busy === 'save' || editing.ids.length === 0}
                className={`flex-[1.4] ${'inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-40'}`}><Play className="w-4 h-4" />Lưu &amp; bắt đầu</button>
            )}
          </>}>
          <label className="block text-[13px] font-medium text-stone-700 mb-1.5">Tên hội nghị *</label>
          <input data-testid="meeting-title" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })}
            placeholder="VD: Giao ban công tác tuần" className="w-full h-11 px-3 rounded-lg border border-stone-300 text-base md:text-sm focus:outline-none focus:ring-3 focus:ring-brand-600/15 focus:border-brand-600" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-[13px] font-medium text-stone-700 mb-1.5">Thời gian dự kiến</label>
              <input type="datetime-local" value={editing.when} disabled={editing.state === 'OPEN' || editing.state === 'CLOSED'}
                onChange={e => setEditing({ ...editing, when: e.target.value })}
                className="w-full h-11 px-3 rounded-lg border border-stone-300 text-base md:text-sm disabled:bg-stone-50 disabled:text-stone-400 focus:outline-none focus:ring-3 focus:ring-brand-600/15 focus:border-brand-600" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-stone-700 mb-1.5">Địa điểm</label>
              <input value={editing.location} onChange={e => setEditing({ ...editing, location: e.target.value })}
                placeholder="VD: Hội trường tầng 2" className="w-full h-11 px-3 rounded-lg border border-stone-300 text-base md:text-sm focus:outline-none focus:ring-3 focus:ring-brand-600/15 focus:border-brand-600" />
            </div>
          </div>

          <label className="block text-[13px] font-medium text-stone-700 mt-4 mb-1.5">Thành phần tham dự *</label>
          {editing.state === 'CLOSED' ? (
            <p className="text-[13px] text-stone-500 bg-stone-50 rounded-lg px-3 py-2.5">Hội nghị đã kết thúc: {editing.ids.length} cán bộ (không thay đổi được).</p>
          ) : (
            <button data-testid="btn-pick" onClick={() => setPickerOpen(true)}
              className="w-full flex items-center justify-between h-11 px-3 rounded-lg border border-stone-300 bg-white hover:bg-stone-50">
              <span className="text-sm text-left">
                {editing.ids.length
                  ? <><b className="text-stone-900 font-semibold">{editing.ids.length}</b> cán bộ đã chọn</>
                  : <span className="text-stone-500">Chưa chọn — bấm để chọn cán bộ</span>}
              </span>
              <span className="inline-flex items-center text-brand-700 font-medium text-sm">Chọn<ChevronRight className="w-4 h-4" /></span>
            </button>
          )}
          {editing.ids.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {editing.ids.slice(0, 40).map(id => (
                <span key={id} className="text-xs px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">{userMap.get(id)?.fullName || id}</span>
              ))}
              {editing.ids.length > 40 && <span className="text-[11px] px-2 py-1 text-stone-400">+{editing.ids.length - 40}</span>}
            </div>
          )}
          {editing.state === 'OPEN' && <p className="mt-2 text-xs text-amber-800">Đang điểm danh: chỉ bổ sung thêm người, không bỏ bớt được.</p>}

          {/* Đối sánh sơ đồ chỗ ngồi */}
          {(() => {
            const lay = layouts.find(l => l.id === editing.layoutId) || null;
            const seated = new Set((lay?.seats || []).map(x => x.userId).filter(Boolean) as string[]);
            const inSeat = editing.ids.filter(id => seated.has(id)).length;
            const outside = (lay?.seats || []).filter(x => x.label && (!x.userId || !editing.ids.includes(x.userId))).length;
            return (
              <div className={`mt-4 rounded-xl border p-3.5 ${editing.seatCompare ? 'border-emerald-300 bg-emerald-50/40' : 'border-stone-200 bg-white'}`} data-testid="seat-compare-box">
                <label className="flex items-start gap-3 cursor-pointer">
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-stone-900">Đối sánh sơ đồ chỗ ngồi</span>
                    <span className="block text-xs text-stone-500 mt-0.5">Màn chiếu hiện sơ đồ bên phải mã QR, ghế đổi màu khi cán bộ quét. Chỉ huy chạm ghế để đánh dấu nghi vấn.</span>
                  </span>
                  <input type="checkbox" role="switch" data-testid="seat-compare-toggle" checked={editing.seatCompare}
                    onChange={e => setEditing({ ...editing, seatCompare: e.target.checked, layoutId: editing.layoutId || layouts[0]?.id || '' })}
                    className="sr-only peer" />
                  <span aria-hidden="true" className={`mt-0.5 w-11 h-6 rounded-full relative shrink-0 transition-colors ${editing.seatCompare ? 'bg-emerald-600' : 'bg-stone-300'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${editing.seatCompare ? 'left-[22px]' : 'left-0.5'}`} />
                  </span>
                </label>
                {editing.seatCompare && (
                  <div className="mt-3 space-y-2.5">
                    {layouts.length === 0 ? (
                      <p className="text-[13px] text-amber-800">Chưa có sơ đồ nào. Bấm <b>Quản lý sơ đồ</b> để nhập từ tệp Excel.</p>
                    ) : (
                      <select value={editing.layoutId} onChange={e => setEditing({ ...editing, layoutId: e.target.value })} data-testid="seat-layout-select"
                        className="w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-base md:text-sm">
                        {layouts.map(l => <option key={l.id} value={l.id}>{l.name} · {l.seats.filter(x => x.label).length} ghế</option>)}
                      </select>
                    )}
                    {lay && (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          <span className={`text-[11.5px] font-semibold rounded-full px-2.5 py-0.5 ${inSeat === editing.ids.length ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`} data-testid="seat-match-chip">
                            {inSeat === editing.ids.length ? '✓ ' : ''}Có chỗ ngồi {inSeat}/{editing.ids.length} thành phần
                          </span>
                          {outside > 0 && <span className="text-[11.5px] font-semibold rounded-full px-2.5 py-0.5 bg-stone-100 text-stone-600">{outside} ghế không thuộc thành phần</span>}
                        </div>
                        <div className="bg-white rounded-lg border border-stone-200 p-2">
                          <SeatMap layout={lay} size="mini" stateOf={x => (!x.label ? 'empty' : x.userId && editing.ids.includes(x.userId) ? 'present' : 'outside')} />
                        </div>
                        {inSeat < editing.ids.length && <p className="text-[11.5px] text-amber-800">{editing.ids.length - inSeat} người trong thành phần chưa có ghế trên sơ đồ: vẫn điểm danh bình thường, hiện ở danh sách "Chưa có chỗ".</p>}
                      </>
                    )}
                    <button type="button" onClick={() => setSeatMgr({ open: true, id: lay?.id })} data-testid="btn-seat-manager"
                      className="w-full h-10 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-[13px] font-semibold text-stone-700 inline-flex items-center justify-center gap-1.5">
                      <LayoutGrid className="w-4 h-4" />{lay ? 'Xem, sửa chỗ ngồi' : 'Quản lý sơ đồ'}
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </Sheet>
      )}

      <SeatingManager open={seatMgr.open} initialId={seatMgr.id} users={allUsers}
        onClose={() => setSeatMgr({ open: false })}
        onChanged={(ls, id) => { setLayouts(ls); if (editing && id) setEditing(e => (e ? { ...e, layoutId: id, seatCompare: true } : e)); }} />

      <ParticipantPicker
        open={pickerOpen}
        users={users}
        selected={editing?.ids || []}
        locked={editing?.locked || []}
        currentUserId={currentUser.id}
        onClose={() => setPickerOpen(false)}
        onDone={ids => { setPickerOpen(false); if (editing) setEditing({ ...editing, ids }); }}
      />

      {/* ============ Bắt đầu ============ */}
      {starting && (
        <Sheet title={sessionState(starting, now) === 'CLOSED' ? 'Mở lại điểm danh' : 'Bắt đầu điểm danh'} onClose={() => setStarting(null)}
          footer={<>
            <button onClick={() => setStarting(null)} className={'inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-sm font-semibold disabled:opacity-40'}>Huỷ</button>
            <button data-testid="btn-confirm-start" onClick={doStart} disabled={busy === 'start'}
              className={`flex-1 ${'inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-40'}`}>{busy === 'start' ? 'Đang bắt đầu...' : <><Play className="w-4 h-4" />Bắt đầu &amp; hiện mã QR</>}</button>
          </>}>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3.5">
            <div className="font-semibold text-stone-900">{starting.title}</div>
            <div className="text-[13px] text-stone-500 mt-1">{(starting.expectedUserIds || []).length} cán bộ{starting.location ? ` · ${starting.location}` : ''}</div>
          </div>
          <label className="block text-[13px] font-medium text-stone-700 mt-4 mb-2">Tự động kết thúc sau (nếu quên bấm Kết thúc)</label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {DURATIONS.map(d => (
              <button key={d.m} onClick={() => setDuration(d.m)}
                className={`h-10 rounded-lg text-sm border ${duration === d.m ? 'bg-stone-900 text-white border-stone-900 font-semibold' : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'}`}>{d.label}</button>
            ))}
          </div>
          <p className="mt-3 text-xs text-stone-500">Có thể bấm <b>Kết thúc</b> bất cứ lúc nào hoặc gia hạn thêm khi đang điểm danh.</p>
        </Sheet>
      )}

      {/* ============ Mã QR trực tiếp ============ */}
      {liveSession && (
        <LivePanel
          session={liveSession} now={now} st={stats(liveSession)} userMap={userMap}
          layout={liveSession.seatCompare ? layouts.find(l => l.id === liveSession.seatLayoutId) || null : null}
          flags={flags.filter(f => f.sessionId === liveSession.id)}
          absences={absences.filter(a => a.sessionId === liveSession.id)}
          onFlag={async (uid, status) => {
            const r = await MockDB.flagSeat(liveSession.id, uid, status);
            if (!r.ok) { showToast(r.message || 'Không lưu được.'); return; }
            setFlags(fs => {
              const rest = fs.filter(f => !(f.sessionId === liveSession.id && f.userId === uid));
              return status ? [...rest, { id: `${liveSession.id}__${uid}`, sessionId: liveSession.id, userId: uid, status, flaggedBy: currentUser.id, flaggedAt: Date.now() }] : rest;
            });
          }}
          onClose={() => setLiveId(null)} onEnd={() => doEnd(liveSession)} onExtend={m => doExtend(liveSession, m)}
          onAdd={() => { setLiveId(null); openEdit(liveSession, true); }} ending={busy === 'end'}
        />
      )}

      {/* ============ Kết quả ============ */}
      {resultSession && (() => {
        const k = stats(resultSession);
        const rate = k.expected.length ? Math.round(k.present.length * 100 / k.expected.length) : 0;
        return (
          <Sheet title="Kết quả điểm danh" onClose={() => setResultId(null)}
            footer={<>
              <button data-testid="btn-export-docx" onClick={() => exportReport(resultSession, 'DOCX')} disabled={!!busy}
                className={`flex-1 ${'inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-sm font-semibold disabled:opacity-40'}`}><FileDown className="w-4 h-4" />{busy === 'DOCX' ? 'Đang xuất...' : 'Word'}</button>
              <button onClick={() => exportReport(resultSession, 'XLSX')} disabled={!!busy}
                className={`flex-1 ${'inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-sm font-semibold disabled:opacity-40'}`}><SheetIcon className="w-4 h-4" />{busy === 'XLSX' ? 'Đang xuất...' : 'Excel'}</button>
            </>}>
            <div className="font-semibold text-stone-900">{resultSession.title}</div>
            <div className="text-xs text-stone-500 mt-0.5">{fmtDT(sessionTime(resultSession))}{resultSession.endedAt ? ` → ${fmtTime(resultSession.endedAt)}` : ''}{resultSession.location ? ` · ${resultSession.location}` : ''}</div>
            <div className="grid grid-cols-4 gap-2 mt-3 text-center">
              <Stat n={k.expected.length} label="Triệu tập" cls="text-stone-900" />
              <Stat n={k.present.length} label="Có mặt" cls="text-emerald-700" />
              <Stat n={k.absent.length} label="Vắng" cls="text-red-700" />
              <Stat n={`${rate}%`} label="Tỷ lệ" cls="text-stone-900" />
            </div>
            <h4 className="mt-5 mb-2 text-[13px] font-semibold text-stone-900">Vắng mặt ({k.absent.length})</h4>
            {k.absent.length === 0 ? <p className="text-sm text-emerald-700">Có mặt đầy đủ.</p> : (
              <div className="rounded-lg border border-stone-200 divide-y divide-stone-100">
                {k.absent.map((id, i) => {
                  const u = userMap.get(id);
                  return (
                    <div key={id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="w-6 text-xs text-stone-400">{i + 1}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-stone-900 truncate">{u?.fullName || `(Tài khoản đã xoá)`}</div>
                        <div className="text-[11px] text-stone-400">{u?.department || ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {(() => {
              const sus = flags.filter(f => f.sessionId === resultSession.id && f.status === 'SUSPECT');
              if (!sus.length) return null;
              return (<>
                <h4 className="mt-5 mb-2 text-[13px] font-semibold text-orange-700 inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Nghi vấn: đã quét nhưng không thấy tại chỗ ({sus.length})</h4>
                <div className="rounded-lg border border-orange-200 divide-y divide-orange-100 bg-orange-50/40" data-testid="result-suspects">
                  {sus.map(f => { const u = userMap.get(f.userId); const by = f.flaggedBy ? userMap.get(f.flaggedBy)?.fullName : '';
                    return <div key={f.id} className="px-3 py-2.5"><div className="text-sm font-medium text-stone-900">{u?.fullName || f.userId}</div>
                      <div className="text-[11px] text-stone-500">{u?.department || ''}{by ? ` · đánh dấu bởi ${by}` : ''}{f.flaggedAt ? ` lúc ${fmtTime(f.flaggedAt)}` : ''}</div></div>; })}
                </div>
              </>);
            })()}
            <p className="mt-3 text-xs text-stone-500">Ghi lý do vắng (có lý do / không lý do) ở thẻ <b>Báo cáo vắng</b> trước khi xuất báo cáo chính thức.</p>
            <button onClick={() => { setResultId(null); askStart(resultSession); }} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-stone-600 hover:text-stone-900"><RotateCcw className="w-3.5 h-3.5" />Mở lại điểm danh</button>
          </Sheet>
        );
      })()}

      {toast && (
        <Portal><div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-[200] max-w-[90vw] px-4 py-2.5 rounded-lg bg-stone-900 text-white text-sm shadow-xl" role="status">{toast}</div></Portal>
      )}
    </div>
  );
};

// ---------------- Thành phần phụ ----------------
const Stat: React.FC<{ n: number | string; label: string; cls: string }> = ({ n, label, cls }) => (
  <div className={`rounded-lg border border-stone-200 bg-white py-2.5 px-2 ${cls}`}>
    <div className="text-xl font-semibold leading-none tabular"><BumpNumber value={n} /></div>
    <div className="text-[11px] font-medium mt-1 text-stone-500">{label}</div>
  </div>
);

/** Hộp thoại: trượt từ dưới lên trên điện thoại, giữa màn hình trên máy tính */
const Sheet: React.FC<{ title: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode }> = ({ title, onClose, footer, children }) => (
  <Portal><div className="fixed inset-0 z-[110] bg-stone-900/50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
    <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-xl border border-stone-200 shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="text-base font-semibold text-stone-900">{title}</h3>
        <button onClick={onClose} aria-label="Đóng" className="p-2 -mr-2 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X className="w-5 h-5" /></button>
      </div>
      <div className="px-4 pb-4 overflow-y-auto">{children}</div>
      {footer && <div className="p-3 border-t border-stone-200 flex gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>{footer}</div>}
    </div>
  </div></Portal>
);

const LivePanel: React.FC<{
  session: AttendanceSession; now: number;
  st: { expected: string[]; recs: AttendanceRecord[]; present: string[]; absent: string[]; extra: AttendanceRecord[] };
  userMap: Map<string, User>;
  layout: SeatLayout | null; flags: SeatFlag[]; absences: AttendanceAbsence[];
  onFlag: (userId: string, status: 'SUSPECT' | 'CONFIRMED' | null) => Promise<void>;
  onClose: () => void; onEnd: () => void; onExtend: (m: number) => void; onAdd: () => void; ending: boolean;
}> = ({ session, now, st, userMap, layout, flags, absences, onFlag, onClose, onEnd, onExtend, onAdd, ending }) => {
  const [mode, setMode] = useState<'OFFICER' | 'GUEST'>('OFFICER');
  const [qr, setQr] = useState('');
  const [tab, setTab] = useState<'ABSENT' | 'PRESENT' | 'SEATS'>(layout ? 'SEATS' : 'ABSENT');
  const [pickSeat, setPickSeat] = useState<Seat | null>(null);
  const seatState = useMemo(() => seatStateFactory(session, st.recs, absences, flags), [session, st.recs, absences, flags]);
  const sStats = useMemo(() => seatingStats(session, layout, st.recs, absences, flags), [session, layout, st.recs, absences, flags]);
  const [big, setBig] = useState(false);

  // Mã QR có chữ ký máy chủ, đổi mỗi 3 giây (chống chụp ảnh gửi cho người vắng, chống tự tạo mã)
  const [key, setKey] = useState<{ secret: string; offset: number; step: number } | null>(null);
  const [keyErr, setKeyErr] = useState('');
  const [slotInfo, setSlotInfo] = useState<{ slot: number; left: number }>({ slot: 0, left: 1 });
  useEffect(() => {
    let alive = true; let retry: number | undefined;
    const fetchKey = async () => {
      const r = await MockDB.getQrKey(session.id);
      if (!alive) return;
      if (r.ok && r.secret) { setKey({ secret: r.secret, offset: r.offset || 0, step: r.stepMs || 3000 }); setKeyErr(''); }
      else { setKeyErr(r.message || 'Không lấy được mã điểm danh.'); retry = window.setTimeout(fetchKey, 5000); }
    };
    setKey(null); fetchKey();
    return () => { alive = false; window.clearTimeout(retry); };
  }, [session.id, session.startedAt]);

  useEffect(() => {
    if (!key) return;
    let last = -1; let alive = true;
    const tick = async () => {
      const t = Date.now() + key.offset;
      const slot = Math.floor(t / key.step);
      setSlotInfo({ slot, left: 1 - (t % key.step) / key.step });
      if (slot === last) return;
      last = slot;
      try {
        const code = await signSlot(key.secret, session.id, slot);
        if (alive) setQr(mode === 'GUEST' ? guestUrl(session.id, slot, code) : officerPayload(session.id, slot, code));
      } catch {
        if (alive) setKeyErr('Trình duyệt không hỗ trợ tạo mã (cần mở bằng đường dẫn https).');
      }
    };
    tick();
    const t = window.setInterval(tick, 200);
    return () => { alive = false; window.clearInterval(t); };
  }, [key, session.id, mode]);

  const remain = session.expiresAt - now;
  const presentList = [...st.recs].sort((a, b) => b.timestamp - a.timestamp);
  const rate = st.expected.length ? Math.round(st.present.length * 100 / st.expected.length) : 0;
  // 3 người điểm danh gần nhất trong 2 phút qua
  const recent = presentList.filter(r => now - r.timestamp < 120000).slice(0, 3);

  const ready = !!key && !!qr;
  const secLeft = key ? Math.max(1, Math.ceil(slotInfo.left * key.step / 1000)) : 0;
  const qrBox = (
    <div className="relative bg-white p-3 rounded-xl border border-stone-200 mx-auto" style={{ width: 'min(78vw, 340px)' }}>
      {ready && (
        /* Viền đỏ quanh mã ngắn dần, hết vòng thì mã đổi */
        <svg className="absolute pointer-events-none" style={{ inset: -3, width: 'calc(100% + 6px)', height: 'calc(100% + 6px)', overflow: 'visible' }} aria-hidden="true">
          <rect x="0" y="0" width="100%" height="100%" rx="15" ry="15" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <rect x="0" y="0" width="100%" height="100%" rx="15" ry="15" fill="none" stroke="#b91c1c" strokeWidth="3" strokeLinecap="round" pathLength={100}
            strokeDasharray="100" strokeDashoffset={100 - slotInfo.left * 100} style={{ transition: 'stroke-dashoffset .2s linear' }} />
        </svg>
      )}
      {ready ? (
        <div key={qr} className="qr-swap"><QRCodeSVG value={qr} style={{ width: '100%', height: 'auto', display: 'block' }} size={320} level={mode === 'GUEST' ? 'M' : 'L'} /></div>
      ) : (
        <div className="aspect-square flex items-center justify-center text-center text-sm px-4 text-stone-500">
          {keyErr ? <span className="text-red-600">{keyErr}</span> : 'Đang tạo mã điểm danh...'}
        </div>
      )}
      <div className="mt-2 text-center text-[11px] text-stone-500 tabular">{ready ? <>Mã đổi sau <b className="text-stone-800">{secLeft}</b> giây</> : '\u00a0'}</div>
    </div>
  );

  const ring = (w: number) => (
    <svg className="absolute pointer-events-none" style={{ inset: -w / 2, width: `calc(100% + ${w}px)`, height: `calc(100% + ${w}px)`, overflow: 'visible' }} aria-hidden="true">
      <rect x="0" y="0" width="100%" height="100%" rx="18" ry="18" fill="none" stroke="#e5e7eb" strokeWidth={w} />
      <rect x="0" y="0" width="100%" height="100%" rx="18" ry="18" fill="none" stroke="#b91c1c" strokeWidth={w} strokeLinecap="round" pathLength={100}
        strokeDasharray="100" strokeDashoffset={100 - slotInfo.left * 100} style={{ transition: 'stroke-dashoffset .2s linear' }} />
    </svg>
  );
  const bigQr = ready
    ? <div key={qr} className="qr-swap w-full h-full"><QRCodeSVG value={qr} style={{ width: '100%', height: '100%', display: 'block' }} size={1024} level={mode === 'GUEST' ? 'M' : 'L'} /></div>
    : <div className="w-full h-full flex items-center justify-center text-stone-500 text-center">{keyErr || 'Đang tạo mã...'}</div>;

  if (big && layout && mode === 'OFFICER') {
    // Màn chiếu có đối sánh: mã QR to hết chiều cao bên trái, sơ đồ chỗ ngồi bên phải
    return (
      <Portal><div className="fixed inset-0 z-[130] bg-[#eef0f4] flex gap-4 p-4" data-testid="projector-seat">
        <button onClick={() => setBig(false)} aria-label="Thu nhỏ" className="relative shrink-0 bg-white rounded-2xl shadow-md"
          style={{ height: 'calc(100vh - 2rem)', width: 'min(calc(100vh - 2rem), 58vw)', padding: 'clamp(16px, 3vh, 34px)' }} data-testid="projector-qr">
          <div className="relative w-full h-full">{ready && ring(8)}{bigQr}</div>
        </button>
        <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-md p-4 flex flex-col">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="" className="w-11 h-11 object-contain" />
            <div className="min-w-0 flex-1"><div className="text-[11px] font-bold tracking-wide text-stone-500 truncate">{ORG_NAME.toUpperCase()}</div>
              <div className="text-lg xl:text-xl font-extrabold text-stone-900 truncate">{session.title}</div></div>
            <div className="text-right shrink-0"><div className="text-2xl font-extrabold tabular leading-none">{fmtTime(now)}</div>
              <div className="text-xs font-semibold text-emerald-700 mt-1">● Đang điểm danh · còn {fmtRemain(remain)}</div></div>
          </div>
          <div className="mt-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-[13px] xl:text-[15px] font-semibold px-3 py-2">
            Phần mềm → <b className="text-brand-700">Điểm danh</b> → <b className="text-brand-700">Bắt đầu quét</b>. Mã đổi sau <b className="text-brand-700">{Math.max(1, Math.ceil(slotInfo.left * (key?.step || 3000) / 1000))}</b> giây. Ngồi xa bấm <b className="text-brand-700">2×</b> / <b className="text-brand-700">4×</b>.
          </div>
          <div className="grid grid-cols-4 gap-2 mt-2.5 text-center">
            {[['Có mặt', sStats.present + sStats.suspect, 'text-emerald-700'], ['Chưa điểm danh', sStats.absent, 'text-red-700'], ['Vắng có lý do', sStats.excused, 'text-amber-700'], ['Nghi vấn', sStats.suspect, 'text-orange-600']].map(([l, n, c]) => (
              <div key={l as string} className="rounded-xl border border-stone-200 py-1.5"><div className={`text-2xl xl:text-3xl font-extrabold tabular leading-tight ${c}`}><BumpNumber value={n as number} /></div><div className="text-[11px] xl:text-xs font-semibold text-stone-500">{l}</div></div>
            ))}
          </div>
          <div className="h-2 rounded-full bg-stone-200 overflow-hidden mt-2"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${st.expected.length ? (st.present.length * 100 / st.expected.length) : 0}%`, transition: 'width .5s' }} /></div>
          <div className="flex items-center gap-2 mt-3 mb-1.5">
            <span className="text-sm xl:text-base font-extrabold">SƠ ĐỒ CHỖ NGỒI</span>
            <span className="text-[10px] font-extrabold text-white bg-brand-700 rounded-full px-2 py-0.5">ĐỐI SÁNH</span>
            <span className="ml-auto text-[10px] font-extrabold tracking-[.18em] text-stone-500 bg-stone-100 rounded px-2 py-0.5">BỤC CHỦ TOẠ ▲</span>
          </div>
          <div className="flex-1 min-h-0"><SeatMap layout={layout} size="big" stateOf={seatState} /></div>
          <div className="flex items-center gap-3 mt-2">
            <SeatLegend compact className="flex-1" />
            {sStats.unseated.length > 0 && <span className="text-[11px] text-stone-500 shrink-0">{sStats.unseated.length} người chưa có chỗ</span>}
          </div>
        </div>
      </div></Portal>
    );
  }

  if (big) {
    return (
      <Portal><div className="fixed inset-0 z-[130] bg-white flex flex-col items-center justify-center p-3" onClick={() => setBig(false)}>
        <div className="text-center mb-2 shrink-0">
          <div className="text-lg md:text-2xl font-semibold text-stone-900">{session.title}</div>
          <div className="text-sm md:text-base text-stone-500">{mode === 'GUEST' ? 'Khách mời: quét bằng camera điện thoại' : 'Cán bộ: quét bằng ứng dụng'} · còn {fmtRemain(remain)} · <b className="text-emerald-700 tabular">{st.present.length}/{st.expected.length}</b></div>
        </div>
        <div className="relative bg-white rounded-xl" style={{ width: 'min(96vw, calc(100vh - 6rem))', height: 'min(96vw, calc(100vh - 6rem))', padding: 'clamp(10px, 2vh, 24px)' }}>
          {ready && ring(8)}{bigQr}
        </div>
        <div className="text-xs text-stone-400 mt-1.5">Chạm để thu nhỏ</div>
      </div></Portal>
    );
  }

  return (
    <Portal><div className="fixed inset-0 z-[105] bg-orange-50 flex flex-col anim-rise" data-testid="live-panel">
      <div className="bg-white border-b border-stone-200 h-14 md:h-16 px-3 md:px-6 flex items-center gap-2">
        <button onClick={onClose} aria-label="Quay lại" className="p-2 rounded-lg text-stone-600 hover:bg-stone-100 shrink-0"><ChevronLeft className="w-5 h-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-stone-900 truncate leading-tight">{session.title}</div>
          <div className="text-xs text-stone-500 tabular"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1.5 animate-pulse align-middle" />Đang điểm danh · còn <b className={remain < 5 * 60000 ? 'text-red-600' : ''}>{fmtRemain(remain)}</b></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto md:grid md:grid-cols-2 md:gap-6 p-4">
          <div>
            <div className="flex bg-stone-200/60 rounded-lg p-1 mb-3">
              <button onClick={() => setMode('OFFICER')} className={`flex-1 h-8 text-[13px] rounded-md ${mode === 'OFFICER' ? 'bg-white text-stone-900 font-semibold shadow-sm' : 'text-stone-600'}`}>Mã cho cán bộ</button>
              <button onClick={() => setMode('GUEST')} className={`flex-1 h-8 text-[13px] rounded-md ${mode === 'GUEST' ? 'bg-white text-stone-900 font-semibold shadow-sm' : 'text-stone-600'}`}>Mã cho khách mời</button>
            </div>
            <button onClick={() => setBig(true)} className="block w-full" aria-label="Phóng to mã QR" data-testid="live-qr" data-qr={qr}>{qrBox}</button>
            <p className="text-center text-[11px] text-stone-500 mt-2">
              {mode === 'GUEST' ? 'Khách mời mở camera điện thoại quét mã, nhập họ tên và đơn vị.' : 'Cán bộ vào mục Điểm danh → Quét mã. Mã tự đổi sau 3 giây, máy chủ chỉ nhận mã vừa hiển thị.'} Chạm vào mã để phóng to trình chiếu.
            </p>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <Stat n={st.present.length} label="Có mặt" cls="text-emerald-700" />
              <Stat n={st.absent.length} label="Chưa điểm danh" cls="text-red-700" />
              {layout ? <Stat n={sStats.suspect} label="Nghi vấn" cls="text-orange-600" /> : <Stat n={`${rate}%`} label="Tỷ lệ" cls="text-stone-900" />}
            </div>
            <div className="h-2 rounded-full bg-stone-200 overflow-hidden mt-2.5" role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%`, transition: 'width .5s cubic-bezier(.2,.8,.2,1)' }} />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <button onClick={() => onExtend(15)} className="h-9 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-[13px] font-medium text-stone-700">+15 phút</button>
              <button onClick={() => onExtend(30)} className="h-9 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-[13px] font-medium text-stone-700">+30 phút</button>
              <button onClick={onAdd} className="h-9 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-[13px] font-medium text-stone-700">+ Thành phần</button>
            </div>
          </div>

          <div className="mt-5 md:mt-0">
            {recent.length > 0 && (
              <div className="mb-4" data-testid="live-recent">
                <div className="text-xs font-semibold text-stone-500 mb-1.5 px-1">Vừa điểm danh</div>
                <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100 overflow-hidden">
                  {recent.map(r => {
                    const u = userMap.get(r.userId);
                    const name = r.guestName || u?.fullName || r.userId;
                    return (
                      <div key={r.id} className={`px-4 py-2.5 flex items-center gap-3 ${now - r.timestamp < 15000 ? 'row-new' : ''}`}>
                        <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"><CheckCircle2 className="w-[18px] h-[18px]" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-stone-900 truncate">{name}</div>
                          <div className="text-[11px] text-stone-400 truncate">{r.guestName ? (r.guestUnit || 'Khách mời') : (u?.department || '')}</div>
                        </div>
                        <span className="text-xs tabular text-stone-500 shrink-0">{fmtTime(r.timestamp)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex bg-stone-200/60 rounded-lg p-1 mb-2">
              {layout && <button onClick={() => setTab('SEATS')} data-testid="tab-seats" className={`flex-1 h-8 text-[13px] rounded-md ${tab === 'SEATS' ? 'bg-white text-stone-900 font-semibold shadow-sm' : 'text-stone-600'}`}>Sơ đồ</button>}
              <button onClick={() => setTab('ABSENT')} className={`flex-1 h-8 text-[13px] rounded-md ${tab === 'ABSENT' ? 'bg-white text-stone-900 font-semibold shadow-sm' : 'text-stone-600'}`}>Chưa điểm danh ({st.absent.length})</button>
              <button onClick={() => setTab('PRESENT')} className={`flex-1 h-8 text-[13px] rounded-md ${tab === 'PRESENT' ? 'bg-white text-stone-900 font-semibold shadow-sm' : 'text-stone-600'}`}>Đã điểm danh ({st.recs.length})</button>
            </div>
            {tab === 'SEATS' && layout ? (
              <div className="bg-white rounded-xl border border-stone-200 p-2.5" data-testid="live-seats">
                <div className="flex items-center justify-between mb-2 px-0.5">
                  <span className="text-xs text-stone-500">Chạm ghế để đối sánh tại chỗ</span>
                  <span className="text-[10px] font-bold tracking-[.18em] text-stone-500 bg-stone-100 rounded px-2 py-0.5">BỤC CHỦ TOẠ ▲</span>
                </div>
                <div className="overflow-x-auto -mx-1 px-1"><div style={{ minWidth: (layout.leftCols + layout.rightCols) * 30 }}>
                  <div className="md:hidden"><SeatMap layout={layout} size="mini" stateOf={seatState} onSeat={x => x.userId && setPickSeat(x)} selected={pickSeat} /></div>
                  <div className="hidden md:block"><SeatMap layout={layout} size="normal" stateOf={seatState} onSeat={x => x.userId && setPickSeat(x)} selected={pickSeat} /></div>
                </div></div>
                <SeatLegend compact className="mt-2.5" />
                {sStats.unseated.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-stone-100">
                    <div className="text-xs font-semibold text-stone-600 mb-1.5">Chưa có chỗ trên sơ đồ ({sStats.unseated.length})</div>
                    <div className="flex flex-wrap gap-1.5">{sStats.unseated.map(id => (
                      <span key={id} className={`text-xs px-2 py-0.5 rounded-md ${st.present.includes(id) ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{userMap.get(id)?.fullName || id}</span>))}</div>
                  </div>
                )}
              </div>
            ) : (
            <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
              {tab === 'ABSENT' && (st.absent.length === 0
                ? <p className="text-center text-sm text-emerald-700 py-8">Đã đủ thành phần.</p>
                : st.absent.map(id => {
                  const u = userMap.get(id);
                  return (
                    <div key={id} className="px-4 py-2.5">
                      <div className="text-sm font-medium text-stone-900">{u?.fullName || '(Tài khoản đã xoá)'}</div>
                      <div className="text-[11px] text-stone-400">{u?.department || ''}</div>
                    </div>
                  );
                }))}
              {tab === 'PRESENT' && (presentList.length === 0
                ? <p className="text-center text-sm text-stone-400 py-8">Chưa có ai điểm danh.</p>
                : presentList.map(r => {
                  const u = userMap.get(r.userId);
                  const guest = !!r.guestName;
                  const outside = !guest && !st.expected.includes(r.userId);
                  return (
                    <div key={r.id} className={`px-4 py-2.5 flex items-center justify-between gap-2 ${now - r.timestamp < 15000 ? 'row-new' : ''}`}>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-stone-900 truncate">{guest ? r.guestName : (u?.fullName || r.userId)}
                          {guest && <span className="ml-1 text-[10px] font-medium text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded">khách</span>}
                          {outside && <span className="ml-1 text-[10px] font-medium text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">ngoài DS</span>}
                        </div>
                        <div className="text-[11px] text-stone-400 truncate">{guest ? (r.guestUnit || 'Khách mời') : (u?.department || '')}</div>
                      </div>
                      <span className="text-xs tabular text-stone-500 shrink-0">{fmtTime(r.timestamp)}</span>
                    </div>
                  );
                }))}
            </div>)}
          </div>
        </div>
      </div>

      {pickSeat && pickSeat.userId && (() => {
        const uid = pickSeat.userId;
        const u = userMap.get(uid);
        const rec = st.recs.find(r => r.userId === uid && !r.guestName);
        const flag = flags.find(f => f.userId === uid);
        const stt = seatState(pickSeat);
        const label: Record<string, string> = { present: 'Đã điểm danh', absent: 'Chưa điểm danh', excused: 'Vắng có lý do', outside: 'Không thuộc thành phần', suspect: 'Nghi vấn', empty: '' };
        const tone: Record<string, string> = { present: 'bg-emerald-50 text-emerald-800', absent: 'bg-red-50 text-red-800', excused: 'bg-amber-50 text-amber-800', outside: 'bg-stone-100 text-stone-600', suspect: 'bg-orange-100 text-orange-800', empty: '' };
        const act = async (status: 'SUSPECT' | 'CONFIRMED' | null) => { await onFlag(uid, status); setPickSeat(null); };
        return (
          <Sheet title={`Hàng ${pickSeat.r + 1} · ghế ${pickSeat.c + 1}`} onClose={() => setPickSeat(null)}>
            <div className="flex items-center gap-3" data-testid="seat-sheet">
              <PersonIcon className="w-10 h-10 shrink-0" fill={stt === 'absent' ? '#dc2626' : stt === 'excused' ? '#f59e0b' : stt === 'outside' ? '#9ca3af' : '#16a34a'} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-stone-900 truncate">{u?.fullName || pickSeat.label}</div>
                <div className="text-xs text-stone-500 truncate">{u?.department || pickSeat.team || ''}{u?.position ? ` · ${u.position}` : ''}</div>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${tone[stt]}`}>{label[stt]}</span>
            </div>
            <div className="mt-3 rounded-lg bg-stone-50 px-3 py-2.5 text-[13px] text-stone-700 leading-relaxed">
              {rec ? <>Đã quét lúc <b>{fmtTime(rec.timestamp)}</b>. Nhìn ghế thực tế để đối sánh:</> : stt === 'outside' ? 'Người này không thuộc thành phần hội nghị.' : 'Chưa quét mã điểm danh.'}
              {flag && <div className="mt-1 text-xs text-stone-500">{flag.status === 'SUSPECT' ? 'Đã đánh dấu nghi vấn' : 'Đã xác nhận có mặt đúng chỗ'}{flag.flaggedBy ? ` bởi ${userMap.get(flag.flaggedBy)?.fullName || ''}` : ''}{flag.flaggedAt ? ` lúc ${fmtTime(flag.flaggedAt)}` : ''}.</div>}
            </div>
            {rec && (
              <div className="mt-3 space-y-2">
                <button onClick={() => act('CONFIRMED')} data-testid="btn-seat-ok" className="w-full h-11 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"><CheckCircle2 className="w-4 h-4" />Có mặt đúng chỗ</button>
                <button onClick={() => act('SUSPECT')} data-testid="btn-seat-suspect" className="w-full h-11 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"><AlertTriangle className="w-4 h-4" />Không thấy tại chỗ → Nghi vấn</button>
                {flag && <button onClick={() => act(null)} className="w-full h-10 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-100">Bỏ đánh dấu</button>}
                <p className="text-[11px] text-stone-500 text-center">Phần mềm ghi lại người đánh dấu. Người nghi vấn được tách riêng ở kết quả hội nghị.</p>
              </div>
            )}
          </Sheet>
        );
      })()}

      <div className="bg-white border-t border-stone-200 p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-4xl mx-auto">
          <button data-testid="live-end" onClick={onEnd} disabled={ending}
            className="w-full h-12 rounded-lg bg-brand-700 hover:bg-brand-800 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"><Square className="w-4 h-4" />Kết thúc điểm danh</button>
        </div>
      </div>
    </div></Portal>
  );
};

export default MeetingManager;
