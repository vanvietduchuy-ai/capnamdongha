import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Download, Loader2 } from 'lucide-react';
import { Learning } from '../../services/learningService';
import { MockDB } from '../../services/mockDatabase';
import { LearnCourse, LearnLesson, LearnProgress, User } from '../../types';
import { assigneesOf, fmtDay, fmtDur } from '../../lib/exam';
import { teamOf } from '../../lib/seating';
import { btnPrimary, btnSecondary, Chip, ProgressBar, Sheet } from './common';
import { lessonsOf } from './LearnTab';

interface Props { course: LearnCourse | null; lessons: LearnLesson[]; users: User[]; onClose: () => void; }

/** Theo dõi học tập: ai xong, ai đang học, ai chưa bắt đầu — theo từng bài, từng tổ */
export const CourseTracking: React.FC<Props> = ({ course, lessons, users, onClose }) => {
  const [progress, setProgress] = useState<LearnProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'NONE' | 'DOING' | 'DONE'>('ALL');
  const [msg, setMsg] = useState('');

  const load = async () => { if (!course) return; setLoading(true); setProgress(await Learning.getProgress({ courseId: course.id })); setLoading(false); };
  useEffect(() => { setMsg(''); setFilter('ALL'); load(); }, [course?.id]);
  useEffect(() => {
    if (!course) return;
    const unsub = MockDB.subscribe(t => { if (t === 'learn_progress') load(); });
    return () => { unsub(); };
  }, [course?.id]);

  const ls = course ? lessonsOf(lessons, course.id) : [];
  const people = useMemo(() => course ? assigneesOf(course.assigneeIds, users).sort((a, b) => (a.department || '').localeCompare(b.department || '', 'vi') || a.fullName.localeCompare(b.fullName, 'vi')) : [], [course, users]);
  const pm = useMemo(() => { const m = new Map<string, LearnProgress>(); progress.forEach(p => m.set(`${p.userId}|${p.lessonId}`, p)); return m; }, [progress]);

  const rows = people.map(u => {
    const cells = ls.map(l => pm.get(`${u.id}|${l.id}`));
    const done = cells.filter(p => p?.completed).length;
    const secs = cells.reduce((s, p) => s + (p?.seconds || 0), 0);
    const quiz = cells.filter(p => p?.completed && p.quizBest).map(p => p!.quizBest);
    const status: 'DONE' | 'DOING' | 'NONE' = ls.length && done === ls.length ? 'DONE' : secs > 0 || done > 0 ? 'DOING' : 'NONE';
    return { u, cells, done, secs, quizAvg: quiz.length ? Math.round(quiz.reduce((a, b) => a + b, 0) / quiz.length) : null, status };
  });
  const count = (s: string) => rows.filter(r => r.status === s).length;
  const teams = useMemo(() => {
    const m = new Map<string, { n: number; done: number }>();
    rows.forEach(r => { const k = r.u.department || 'Khác'; const t = m.get(k) || { n: 0, done: 0 }; t.n++; t.done += ls.length ? r.done / ls.length : 0; m.set(k, t); });
    return [...m.entries()].map(([k, v]) => ({ name: k.replace(/^Tổ /, ''), pct: Math.round(v.done * 100 / v.n) })).sort((a, b) => b.pct - a.pct);
  }, [rows, ls.length]);
  const shown = rows.filter(r => filter === 'ALL' || r.status === filter);

  const exportXlsx = async () => {
    if (!course) return;
    const XLSX = await import('xlsx');
    const data = rows.map((r, i) => {
      const o: Record<string, any> = { 'STT': i + 1, 'Họ tên': r.u.fullName, 'Tổ': r.u.department || '' };
      ls.forEach((l, k) => { const p = r.cells[k]; o[`Bài ${k + 1}`] = p?.completed ? 'Xong' : p && p.seconds > 0 ? 'Đang học' : ''; });
      o['Số bài xong'] = `${r.done}/${ls.length}`; o['Thời gian học (phút)'] = Math.round(r.secs / 60);
      o['Điểm ôn TB (%)'] = r.quizAvg ?? ''; o['Trạng thái'] = r.status === 'DONE' ? 'Hoàn thành' : r.status === 'DOING' ? 'Đang học' : 'Chưa học';
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tiến độ');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ls.map((l, k) => ({ 'Bài': k + 1, 'Tên bài': l.title, 'Chương': l.chapter || '' }))), 'Danh sách bài');
    XLSX.writeFile(wb, `tien_do_hoc_${course.title.replace(/[^\p{L}\d]+/gu, '_').slice(0, 40)}.xlsx`);
  };

  const remind = async () => {
    if (!course) return;
    const targets = rows.filter(r => r.status !== 'DONE');
    if (!targets.length || !window.confirm(`Gửi thông báo nhắc ${targets.length} cán bộ chưa học xong khoá "${course.title}"?`)) return;
    const now = Date.now();
    await Promise.all(targets.map((r, i) => MockDB.createNotification({
      id: `learn_${now}_${i}`, userId: r.u.id, title: 'Nhắc học tập',
      message: `Khoá "${course.title}": bạn đã học ${r.done}/${ls.length} bài${course.deadline ? `, hạn ${fmtDay(course.deadline)}` : ''}. Vào mục Học tập & Thi để học tiếp.`,
      isRead: false, createdAt: now, type: 'SYSTEM'
    })));
    setMsg(`Đã gửi nhắc ${targets.length} cán bộ.`);
  };

  const cell = (p?: LearnProgress) => p?.completed
    ? <span className="inline-grid place-items-center w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-extrabold" title={`Xong · ${fmtDur(p.seconds)}`}>✓</span>
    : p && (p.seconds > 0 || p.videoPct > 0)
      ? <span className="inline-grid place-items-center w-7 h-7 rounded-lg bg-amber-100 text-amber-800 text-xs font-extrabold" title={`Đang học · ${fmtDur(p.seconds)}`}>•</span>
      : <span className="inline-grid place-items-center w-7 h-7 rounded-lg bg-stone-100 text-stone-400 text-xs">–</span>;

  return (
    <Sheet open={!!course} onClose={onClose} wide title={<>Theo dõi học tập · {course?.title}</>} testId="course-tracking"
      footer={<>
        <button className={btnSecondary} onClick={exportXlsx}><Download className="w-4 h-4" />Xuất Excel</button>
        <button className={btnPrimary} onClick={remind} disabled={!rows.some(r => r.status !== 'DONE')} data-testid="btn-remind"><Bell className="w-4 h-4" />Nhắc người chưa học ({rows.length - count('DONE')})</button>
      </>}>
      {loading && !progress.length ? <div className="flex items-center gap-2 text-sm text-stone-500"><Loader2 className="w-4 h-4 animate-spin" />Đang tải...</div> : (
        <>
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {[['Đã học xong', count('DONE'), 'text-emerald-700', 'DONE'], ['Đang học dở', count('DOING'), 'text-amber-700', 'DOING'], ['Chưa bắt đầu', count('NONE'), 'text-stone-500', 'NONE']].map(([l, n, c, k]) => (
              <button key={k as string} onClick={() => setFilter(filter === k ? 'ALL' : k as any)} className={`text-left rounded-xl border px-3 py-2.5 ${filter === k ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-200'}`} data-testid={`track-${(k as string).toLowerCase()}`}>
                <div className={`text-2xl md:text-3xl font-extrabold tabular ${c}`}>{n as number}{k === 'DONE' && <span className="text-base text-stone-400 font-semibold">/{rows.length}</span>}</div>
                <div className="text-[12px] text-stone-500 font-medium">{l}</div>
              </button>
            ))}
          </div>
          {teams.length > 1 && (
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
              {teams.map(t => (
                <div key={t.name} className="flex items-center gap-2 text-[13px]"><span className="w-24 truncate text-stone-700">{t.name}</span><ProgressBar value={t.pct} className="flex-1" tone={t.pct >= 70 ? '#16a34a' : '#f59e0b'} /><span className="w-9 text-right tabular font-semibold">{t.pct}%</span></div>
              ))}
            </div>
          )}
          {msg && <div className="mt-3 text-sm rounded-lg bg-emerald-50 text-emerald-800 px-3 py-2" data-testid="track-msg">{msg}</div>}
          <div className="mt-4 overflow-x-auto border border-stone-200 rounded-lg">
            <table className="w-full text-[13px] border-collapse" data-testid="track-table">
              <thead><tr className="bg-stone-50 text-stone-500 text-[12px]">
                <th className="text-left font-semibold px-3 py-2 sticky left-0 bg-stone-50 min-w-40">Cán bộ</th>
                {ls.map((l, k) => <th key={l.id} className="font-semibold px-1 py-2 text-center" title={l.title}>{k + 1}</th>)}
                <th className="font-semibold px-2 py-2 min-w-32">Tiến độ</th><th className="font-semibold px-2 py-2 whitespace-nowrap">Thời gian</th><th className="font-semibold px-2 py-2 whitespace-nowrap">Ôn TB</th>
              </tr></thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.u.id} className="border-t border-stone-100">
                    <td className="px-3 py-1.5 sticky left-0 bg-white"><b className="text-stone-900">{r.u.fullName}</b> <span className="text-stone-400">{teamOf(r.u.department) || ''}</span></td>
                    {r.cells.map((p, k) => <td key={k} className="px-1 py-1.5 text-center">{cell(p)}</td>)}
                    <td className="px-2 py-1.5"><div className="flex items-center gap-2"><ProgressBar value={ls.length ? r.done * 100 / ls.length : 0} className="flex-1 min-w-16" /><span className="tabular text-stone-600">{r.done}/{ls.length}</span></div></td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap">{r.secs ? fmtDur(r.secs) : '–'}</td>
                    <td className="px-2 py-1.5 text-center">{r.quizAvg !== null ? `${r.quizAvg}%` : '–'}</td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={ls.length + 4} className="px-3 py-6 text-center text-stone-500">Không có cán bộ nào.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-stone-500 mt-2">Thời gian học chỉ tính khi màn hình bài học đang mở và có thao tác (cuộn, chạm, xem video); để máy treo không được tính. <Chip tone="green">✓ xong</Chip> <Chip tone="amber">• đang học</Chip></p>
        </>
      )}
    </Sheet>
  );
};
