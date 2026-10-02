import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, Clock, Lock, MoreVertical, PlayCircle, QrCode, Square, Timer, X } from 'lucide-react';
import { Portal } from '../Portal';
import { Learning } from '../../services/learningService';
import { MockDB } from '../../services/mockDatabase';
import { Exam, ExamEvent, MonitorRow, SeatLayout, User } from '../../types';
import { assigneesOf, fmtClock, fmtDur, fmtScore } from '../../lib/exam';
import { LOGO_URL, ORG_NAME } from '../../lib/brand';
import { btnPrimary, btnSecondary, Chip, QrBox, useSignedQr } from './common';

interface Props { exam: Exam; users: User[]; layouts: SeatLayout[]; onClose: () => void; onChanged: () => void; }

const OFFLINE_MS = 45000;
const EV_LABEL: Record<string, { icon: string; color: string; text: string }> = {
  START: { icon: '▶', color: '#2563eb', text: 'vào thi' }, RESUME: { icon: '↻', color: '#6b7280', text: 'vào lại bài' },
  LEAVE: { icon: '!', color: '#ea580c', text: 'rời màn hình' }, DEVICE_CHANGE: { icon: '⇄', color: '#b91c1c', text: 'đăng nhập máy khác → khoá bài' },
  SHARED_DEVICE: { icon: '⚠', color: '#b91c1c', text: 'dùng thiết bị của người khác' }, UNLOCK: { icon: '🔓', color: '#047857', text: 'được mở khoá' },
  SUBMIT: { icon: '✓', color: '#047857', text: 'nộp bài' }, AUTO_SUBMIT: { icon: '⏱', color: '#c2410c', text: 'bài tự nộp' },
  VOID: { icon: '✕', color: '#b91c1c', text: 'bị huỷ bài' }, RESET: { icon: '↺', color: '#6b7280', text: 'được thi lại' },
  EXTRA: { icon: '+', color: '#2563eb', text: 'cộng giờ' }, OPEN: { icon: '●', color: '#047857', text: 'Mở kỳ thi' }, CLOSE: { icon: '■', color: '#111827', text: 'Thu bài, đóng kỳ thi' }
};

/** Màn hình giám thị: cập nhật tức thời ai đang làm, ai rời màn hình, ai đổi máy; mở khoá, cộng giờ, thu bài */
export const ExamMonitor: React.FC<Props> = ({ exam, users, layouts, onClose, onChanged }) => {
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [events, setEvents] = useState<ExamEvent[]>([]);
  const [serverOff, setServerOff] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState<'ALL' | 'WARN' | 'NONE' | 'DONE'>('ALL');
  const [menu, setMenu] = useState<string | null>(null);
  const [projector, setProjector] = useState(false);
  const [msg, setMsg] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const layout = layouts.find(l => l.id === exam.seatLayoutId);
  const seatOf = useMemo(() => { const m = new Map<string, string>(); layout?.seats.forEach(s => { if (s.userId) m.set(s.userId, `H${s.r + 1}·G${s.c + 1}`); }); return m; }, [layout]);

  const load = async () => {
    const [m, ev] = await Promise.all([Learning.monitor(exam.id), Learning.getEvents(exam.id)]);
    if (m.ok) { setRows(m.attempts); setServerOff(Number(m.serverNow) - Date.now()); setMsg(''); } else setMsg(m.message || 'Không tải được.');
    setEvents(ev);
  };
  useEffect(() => {
    load();
    const poll = window.setInterval(load, 8000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const unsub = MockDB.subscribe(t => { if (t === 'exam_events' || t === 'exams') { window.clearTimeout(timer.current); timer.current = window.setTimeout(load, 400); } });
    return () => { window.clearInterval(poll); window.clearInterval(tick); unsub(); };
  }, [exam.id]);

  const sNow = now + serverOff;
  const people = assigneesOf(exam.assigneeIds, users);
  const byUser = new Map(rows.map(r => [r.userId, r]));
  // Người làm bài nhưng không thuộc danh sách (giám thị cho thi lại sau khi đổi thành phần…)
  const extra = rows.filter(r => !people.some(p => p.id === r.userId)).map(r => userMap.get(r.userId)).filter(Boolean) as User[];
  const all = [...people, ...extra];

  type Row = { u: User; a?: MonitorRow; offline: boolean; warn: boolean; state: string };
  const list: Row[] = all.map(u => {
    const a = byUser.get(u.id);
    const offline = !!a && a.status === 'IN_PROGRESS' && !!a.lastSeenAt && sNow - Number(a.lastSeenAt) > OFFLINE_MS;
    const warn = !!a && (a.leaveCount > 0 || a.deviceChanges > 0 || a.status === 'LOCKED' || /Rời màn hình/.test(a.submitReason || ''));
    const state = !a ? 'NONE' : a.status === 'IN_PROGRESS' ? 'DOING' : a.status === 'LOCKED' ? 'LOCKED' : a.status === 'VOID' ? 'VOID' : 'DONE';
    return { u, a, offline, warn, state };
  }).sort((x, y) => Number(y.warn) - Number(x.warn) || Number(y.offline) - Number(x.offline) || (x.u.department || '').localeCompare(y.u.department || '', 'vi') || x.u.fullName.localeCompare(y.u.fullName, 'vi'));

  const n = (f: (r: Row) => boolean) => list.filter(f).length;
  const stats = [
    { k: 'DOING', label: 'Đang làm bài', v: n(r => r.state === 'DOING'), c: 'text-blue-600' },
    { k: 'DONE', label: 'Đã nộp', v: n(r => r.state === 'DONE'), c: 'text-emerald-700' },
    { k: 'NONE', label: 'Chưa vào thi', v: n(r => r.state === 'NONE'), c: 'text-stone-500' },
    { k: 'WARN', label: 'Có cảnh báo', v: n(r => r.warn), c: 'text-orange-600' },
    { k: 'OFF', label: 'Mất kết nối', v: n(r => r.offline), c: 'text-red-700' }
  ];
  const shown = list.filter(r => filter === 'ALL' || (filter === 'WARN' ? r.warn : filter === 'NONE' ? r.state === 'NONE' : r.state === 'DONE'));

  const act = async (userId: string | null, action: 'UNLOCK' | 'VOID' | 'RESET' | 'EXTRA' | 'SUBMIT', minutes = 0, ask?: string) => {
    setMenu(null);
    if (ask && !window.confirm(ask)) return;
    const r = await Learning.action(exam.id, userId, action, minutes);
    if (!r.ok) { setMsg(r.message || 'Không thực hiện được.'); return; }
    load();
  };
  const setStatus = async (s: 'OPEN' | 'CLOSED') => {
    if (s === 'CLOSED' && !window.confirm('Thu bài tất cả và kết thúc kỳ thi? Bài đang làm sẽ được chấm theo các câu đã trả lời.')) return;
    const r = await Learning.setStatus(exam.id, s);
    if (!r.ok) { setMsg(r.message || 'Không thực hiện được.'); return; }
    onChanged(); load();
  };

  const statusChip = (r: Row) => {
    const a = r.a;
    if (!a) return <Chip>Chưa vào</Chip>;
    if (r.offline) return <Chip tone="gray">Mất kết nối {fmtDur((sNow - Number(a.lastSeenAt)) / 1000)}</Chip>;
    if (a.status === 'LOCKED') return <Chip tone="red">Đã khoá · chờ giám thị</Chip>;
    if (a.status === 'IN_PROGRESS') return <Chip tone="blue">Đang làm · còn {fmtClock(Number(a.deadline) - sNow)}</Chip>;
    if (a.status === 'VOID') return <Chip tone="red">Đã huỷ bài</Chip>;
    const t = new Date(Number(a.submittedAt)); const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    return a.status === 'AUTO_SUBMITTED' ? <Chip tone="orange">{a.submitReason || 'Tự nộp'} {hm}</Chip> : <Chip tone="green">Đã nộp {hm}{a.score !== null && a.score !== undefined ? ` · ${fmtScore(a.score)}đ` : ''}</Chip>;
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[115] bg-[#eef0f4] flex flex-col" data-testid="exam-monitor" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="bg-white border-b border-stone-200 px-3 md:px-6 py-2 md:h-16 flex flex-wrap items-center gap-2 relative shrink-0">
          <div className="absolute inset-x-0 top-0 h-1 bg-brand-700" />
          <button onClick={onClose} className="p-2 -ml-1 rounded-lg hover:bg-stone-100" aria-label="Đóng"><ChevronLeft className="w-5 h-5" /></button>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-stone-500">MÀN HÌNH GIÁM THỊ</div>
            <div className="font-bold truncate">{exam.title}{exam.location ? ` · ${exam.location}` : ''}</div>
          </div>
          {exam.status === 'OPEN' ? <Chip tone="green" className="text-sm">● Đang thi</Chip> : exam.status === 'CLOSED' ? <Chip className="text-sm">Đã kết thúc</Chip> : <Chip tone="amber" className="text-sm">Chưa mở</Chip>}
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
            {exam.status === 'OPEN' && exam.mode === 'HALL' && <button className={btnSecondary + ' h-10'} onClick={() => setProjector(true)} data-testid="btn-room-qr"><QrCode className="w-4 h-4" />Mã QR phòng thi</button>}
            {exam.status === 'OPEN' && <button className={btnSecondary + ' h-10'} onClick={() => act(null, 'EXTRA', 5, 'Cộng thêm 5 phút cho tất cả bài đang làm?')} data-testid="btn-extra-all"><Timer className="w-4 h-4" />+5 phút</button>}
            {exam.status !== 'OPEN' && <button className={btnPrimary + ' h-10'} onClick={() => setStatus('OPEN')} data-testid="btn-open-exam"><PlayCircle className="w-4 h-4" />{exam.status === 'CLOSED' ? 'Mở lại' : 'Mở thi'}</button>}
            {exam.status === 'OPEN' && <button className={btnPrimary + ' h-10'} onClick={() => setStatus('CLOSED')} data-testid="btn-close-exam"><Square className="w-4 h-4" />Thu bài tất cả</button>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 md:p-5">
          {msg && <div className="mb-3 text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2">{msg}</div>}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
            {stats.map(s => (
              <button key={s.k} onClick={() => setFilter(s.k === 'DOING' || s.k === 'OFF' ? 'ALL' : (filter === s.k ? 'ALL' : s.k as any))}
                className={`text-left bg-white rounded-xl border px-3 py-2.5 ${filter === s.k ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-200'}`} data-testid={`mon-${s.k.toLowerCase()}`}>
                <div className={`text-2xl md:text-3xl font-extrabold tabular ${s.c}`}>{s.v}</div>
                <div className="text-[12px] text-stone-500 font-medium">{s.label}</div>
              </button>
            ))}
          </div>

          <div className="grid lg:grid-cols-[1fr_380px] gap-4 mt-4">
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-stone-100">
                <b>Thí sinh</b>
                {(['ALL', 'WARN', 'NONE', 'DONE'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)} className={`h-7 px-2.5 rounded-full text-[12px] font-semibold ${filter === f ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>
                    {f === 'ALL' ? `Tất cả ${list.length}` : f === 'WARN' ? `Cảnh báo ${stats[3].v}` : f === 'NONE' ? `Chưa vào ${stats[2].v}` : `Đã nộp ${stats[1].v}`}
                  </button>
                ))}
                <span className="ml-auto text-[11px] text-stone-400 hidden md:inline">cảnh báo xếp trước · cập nhật tức thời</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]" data-testid="monitor-table">
                  <thead><tr className="bg-stone-50 text-stone-500 text-[12px] text-left">
                    <th className="px-3 py-2 font-semibold">Cán bộ</th>{layout && <th className="px-2 py-2 font-semibold">Ghế</th>}<th className="px-2 py-2 font-semibold">Tiến độ</th>
                    <th className="px-2 py-2 font-semibold whitespace-nowrap">Rời màn hình</th><th className="px-2 py-2 font-semibold">Thiết bị</th><th className="px-2 py-2 font-semibold">Trạng thái</th><th />
                  </tr></thead>
                  <tbody>
                    {shown.map(r => (
                      <tr key={r.u.id} className={`border-t border-stone-100 ${r.warn ? 'bg-orange-50/70' : ''}`} data-testid="monitor-row" data-user={r.u.id} data-state={r.state}>
                        <td className="px-3 py-2"><b className="text-stone-900">{r.u.fullName}</b><div className="text-[11px] text-stone-500">{r.u.department || ''}</div></td>
                        {layout && <td className="px-2 py-2 text-stone-600 whitespace-nowrap">{seatOf.get(r.u.id) || '–'}</td>}
                        <td className="px-2 py-2">{r.a ? <div className="flex items-center gap-2"><div className="h-2 w-20 md:w-28 rounded-full bg-stone-200 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${r.a.total ? r.a.answered * 100 / r.a.total : 0}%` }} /></div><span className="tabular text-stone-600">{r.a.answered}/{r.a.total}</span></div> : '–'}</td>
                        <td className="px-2 py-2">{r.a?.leaveCount ? <Chip tone={exam.maxLeave && r.a.leaveCount >= exam.maxLeave ? 'red' : 'orange'}>{r.a.leaveCount} lần</Chip> : <span className="text-stone-400">0</span>}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.a?.deviceChanges ? <span className="text-red-700 font-semibold">Đổi máy {r.a.deviceChanges} lần</span> : <span className="text-stone-600">{r.a?.deviceLabel || '–'}</span>}</td>
                        <td className="px-2 py-2">{statusChip(r)}</td>
                        <td className="px-1 py-2 relative">
                          {r.a && <button className="p-1.5 rounded hover:bg-stone-100" onClick={() => setMenu(menu === r.u.id ? null : r.u.id)} aria-label="Xử lý" data-testid="monitor-menu"><MoreVertical className="w-4 h-4" /></button>}
                          {menu === r.u.id && r.a && (
                            <div className="absolute right-2 top-10 z-20 w-56 bg-white rounded-xl shadow-xl border border-stone-200 py-1 text-sm">
                              {r.a.status === 'LOCKED' && <button className="w-full text-left px-3 py-2 hover:bg-stone-50 font-semibold text-emerald-700" onClick={() => act(r.u.id, 'UNLOCK')} data-testid="act-unlock">Mở khoá, cho làm tiếp</button>}
                              {(r.a.status === 'IN_PROGRESS' || r.a.status === 'LOCKED') && <>
                                <button className="w-full text-left px-3 py-2 hover:bg-stone-50" onClick={() => act(r.u.id, 'EXTRA', 5)}>Cộng 5 phút cho người này</button>
                                <button className="w-full text-left px-3 py-2 hover:bg-stone-50" onClick={() => act(r.u.id, 'SUBMIT', 0, `Thu bài của ${r.u.fullName}?`)} data-testid="act-submit">Thu bài</button>
                              </>}
                              {r.a.status !== 'VOID' && <button className="w-full text-left px-3 py-2 hover:bg-stone-50 text-red-700" onClick={() => act(r.u.id, 'VOID', 0, `Huỷ kết quả bài thi của ${r.u.fullName}?`)} data-testid="act-void">Huỷ bài (vi phạm)</button>}
                              <button className="w-full text-left px-3 py-2 hover:bg-stone-50" onClick={() => act(r.u.id, 'RESET', 0, `Xoá bài làm và cho ${r.u.fullName} thi lại từ đầu?`)} data-testid="act-reset">Cho thi lại từ đầu</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!shown.length && <tr><td colSpan={7} className="text-center text-stone-500 py-6">Không có thí sinh.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-stone-200 p-4" data-testid="monitor-events">
                <b>Nhật ký bất thường</b>
                <div className="mt-1 max-h-[55vh] overflow-y-auto">
                  {events.filter(e => !['START', 'SUBMIT', 'OPEN'].includes(e.kind)).slice(0, 80).map(e => {
                    const L = EV_LABEL[e.kind] || { icon: '•', color: '#6b7280', text: e.kind };
                    const t = new Date(e.at); const hms = t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    return (
                      <div key={e.id} className="flex gap-2.5 py-2.5 border-b border-stone-100 last:border-0 text-[13.5px]">
                        <span className="w-7 h-7 rounded-lg grid place-items-center text-white font-bold shrink-0 text-[13px]" style={{ background: L.color }}>{L.icon}</span>
                        <div className="min-w-0"><b>{e.userId ? userMap.get(e.userId)?.fullName || e.userId : ''}</b> {L.text}{e.detail ? <span className="text-stone-600"> · {e.detail}</span> : null}<div className="text-[11px] text-stone-400">{hms}</div></div>
                      </div>
                    );
                  })}
                  {!events.length && <div className="text-[13px] text-stone-500 py-3">Chưa có sự kiện.</div>}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-stone-200 p-4 text-[13.5px] leading-7">
                <b>Cài đặt chống gian lận</b><br />
                {exam.mode === 'HALL' && <>✓ Quét mã QR phòng thi (đổi 3 giây/lần)<br /></>}
                {exam.settings.shuffle !== false ? '✓' : '○'} Mỗi người một đề, đảo câu và đáp án<br />
                ✓ {exam.maxLeave ? <>Rời màn hình tối đa <b>{exam.maxLeave} lần</b> rồi tự nộp</> : 'Ghi nhận mọi lần rời màn hình'}<br />
                {exam.settings.oneDevice !== false ? '✓' : '○'} Một bài thi chỉ trên một máy<br />
                {exam.settings.watermark !== false ? '✓' : '○'} Chữ chìm họ tên, chặn sao chép<br />
                <span className="text-stone-500 inline-flex gap-1 items-center"><Clock className="w-3.5 h-3.5" />{exam.questionCount} câu · {exam.durationMin} phút</span>
              </div>
            </div>
          </div>
        </div>

        {projector && <RoomQr exam={exam} onClose={() => setProjector(false)} done={stats[1].v} doing={stats[0].v} total={list.length} />}
        {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />}
      </div>
    </Portal>
  );
};

/** Mã QR phòng thi trên màn chiếu: to hết chiều cao, đổi 3 giây/lần */
const RoomQr: React.FC<{ exam: Exam; onClose: () => void; done: number; doing: number; total: number }> = ({ exam, onClose, done, doing, total }) => {
  const { qr, err, left, secLeft } = useSignedQr(exam.id, Learning.examKey);
  return (
    <div className="fixed inset-0 z-[130] bg-[#eef0f4] flex gap-4 p-4" data-testid="exam-projector">
      <div className="relative shrink-0 bg-white rounded-2xl shadow-md flex items-center justify-center" style={{ height: 'calc(100dvh - 2rem)', width: 'min(calc(100dvh - 2rem), 62vw)', padding: 'clamp(16px, 3vh, 34px)' }}>
        <QrBox qr={qr} err={err} left={left} />
      </div>
      <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-md p-5 flex flex-col">
        <div className="flex items-start gap-3">
          <img src={LOGO_URL} alt="" className="w-12 h-12 object-contain" />
          <div className="min-w-0 flex-1"><div className="text-[11px] font-bold tracking-wide text-stone-500">{ORG_NAME.toUpperCase()}</div><div className="text-xl xl:text-2xl font-extrabold leading-tight">{exam.title}</div>{exam.location && <div className="text-stone-500">{exam.location}</div>}</div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-stone-100" aria-label="Đóng"><X className="w-6 h-6" /></button>
        </div>
        <div className="mt-5 rounded-xl bg-red-50 border border-red-200 text-red-900 font-semibold p-4 text-[15px] xl:text-lg leading-relaxed">
          Mở phần mềm → <b className="text-brand-700">Học tập &amp; Thi</b> → <b className="text-brand-700">Thi</b> → chọn kỳ thi → <b className="text-brand-700">Quét mã QR phòng thi</b>.<br />
          Mã đổi sau <b className="text-brand-700">{secLeft}</b> giây · ngồi xa bấm <b className="text-brand-700">2×</b> / <b className="text-brand-700">4×</b>.
        </div>
        <div className="flex-1 flex items-center">
          <div className="grid grid-cols-3 gap-3 w-full text-center">
            {[['Đang làm bài', doing, 'text-blue-600'], ['Đã nộp', done, 'text-emerald-700'], ['Thí sinh', total, 'text-stone-800']].map(([l, v, c]) => (
              <div key={l as string} className="rounded-2xl border border-stone-200 py-6"><div className={`text-5xl xl:text-7xl font-extrabold tabular ${c}`}>{v as number}</div><div className="text-sm xl:text-base font-semibold text-stone-500 mt-1">{l}</div></div>
            ))}
          </div>
        </div>
        <div className="text-stone-500 text-sm flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />Không chụp gửi mã cho người khác: mã đổi 3 giây/lần và chỉ dùng được tại phòng thi. Mỗi bài thi chỉ làm trên một máy.</div>
        <div className="text-stone-400 text-xs mt-2 flex items-center gap-1"><Lock className="w-3 h-3" />{exam.questionCount} câu · {exam.durationMin} phút</div>
      </div>
    </div>
  );
};
