import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Download, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Portal } from '../Portal';
import { Learning } from '../../services/learningService';
import { Exam, ResultRow, User } from '../../types';
import { analyzeResults, assigneesOf, fmtDate, fmtDur, fmtScore, grade } from '../../lib/exam';
import { btnSecondary, Chip } from './common';

interface Props { exam: Exam; users: User[]; onClose: () => void; onChanged: () => void; }

/** Kết quả & phân tích: phân bố điểm, câu sai nhiều, xếp hạng, danh sách nghi vấn cho hội đồng */
export const ExamResults: React.FC<Props> = ({ exam, users, onClose, onChanged }) => {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [qmap, setQmap] = useState<Record<string, { text: string; topic?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [byTeam, setByTeam] = useState(false);
  const [published, setPublished] = useState(exam.published);
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  const load = async () => {
    setLoading(true);
    const r = await Learning.results(exam.id);
    setLoading(false);
    if (!r.ok) { setMsg(r.message || 'Không tải được kết quả.'); return; }
    setRows(r.attempts); setQmap(r.questions);
  };
  useEffect(() => { load(); }, [exam.id]);

  const A = useMemo(() => analyzeResults(exam, rows, qmap), [exam, rows, qmap]);
  const people = assigneesOf(exam.assigneeIds, users);
  const name = (id: string) => userMap.get(id)?.fullName || id;
  const dept = (id: string) => userMap.get(id)?.department || '';
  const ranked = [...A.done].sort((a, b) => Number(b.score) - Number(a.score) || (Number(a.submittedAt) - Number(a.startedAt)) - (Number(b.submittedAt) - Number(b.startedAt)));
  const notTaken = people.filter(p => !rows.some(r => r.userId === p.id));
  const maxBin = Math.max(1, ...A.bins);

  const teams = useMemo(() => {
    const m = new Map<string, number[]>();
    A.done.forEach(r => { const d = dept(r.userId) || 'Khác'; m.set(d, [...(m.get(d) || []), Number(r.score)]); });
    return [...m.entries()].map(([d, s]) => ({ d, n: s.length, avg: s.reduce((a, b) => a + b, 0) / s.length, pass: s.filter(x => x >= exam.passScore).length })).sort((a, b) => b.avg - a.avg);
  }, [A.done]);

  const act = async (userId: string, action: 'VOID' | 'RESET', ask: string) => {
    if (!window.confirm(ask)) return;
    const r = await Learning.action(exam.id, userId, action);
    if (!r.ok) setMsg(r.message || 'Không thực hiện được.'); else load();
  };
  const togglePublish = async () => {
    const v = !published;
    if (v && !window.confirm('Công bố kết quả? Cán bộ sẽ xem được điểm' + (exam.settings.showReview !== false ? ' và đáp án từng câu.' : '.'))) return;
    const r = await Learning.publish(exam.id, v);
    if (r.ok) { setPublished(v); onChanged(); } else setMsg(r.message || 'Không thực hiện được.');
  };

  const exportXlsx = async () => {
    const XLSX = await import('xlsx');
    const data = ranked.map((r, i) => ({
      'Hạng': i + 1, 'Họ tên': name(r.userId), 'Tổ': dept(r.userId), 'Điểm': Number(r.score), 'Số câu đúng': `${r.correct}/${r.total}`,
      'Thời gian làm': fmtDur((Number(r.submittedAt) - Number(r.startedAt)) / 1000), 'Xếp loại': grade(r.score, exam.passScore).label,
      'Rời màn hình': r.leaveCount, 'Ghi chú': r.submitReason && r.submitReason !== 'Thí sinh nộp bài' ? r.submitReason : ''
    }));
    A.voided.forEach(r => data.push({ 'Hạng': '' as any, 'Họ tên': name(r.userId), 'Tổ': dept(r.userId), 'Điểm': '' as any, 'Số câu đúng': '', 'Thời gian làm': '', 'Xếp loại': 'Huỷ bài', 'Rời màn hình': r.leaveCount, 'Ghi chú': 'Giám thị huỷ bài' }));
    notTaken.forEach(u => data.push({ 'Hạng': '' as any, 'Họ tên': u.fullName, 'Tổ': u.department || '', 'Điểm': '' as any, 'Số câu đúng': '', 'Thời gian làm': '', 'Xếp loại': 'Không dự thi', 'Rời màn hình': 0, 'Ghi chú': '' }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Kết quả');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(A.hardest.map(h => ({ 'Câu hỏi': h.text, 'Chủ đề': h.topic || '', 'Tỉ lệ sai (%)': Math.round(h.rate * 100), 'Số người làm': h.n }))), 'Câu sai nhiều');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(A.suspects.map(s => ({ 'Cán bộ': s.userIds.map(name).join(' & '), 'Dấu hiệu': s.text }))), 'Nghi vấn');
    XLSX.writeFile(wb, `ket_qua_${exam.title.replace(/[^\p{L}\d]+/gu, '_').slice(0, 40)}.xlsx`);
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[115] bg-[#eef0f4] flex flex-col" data-testid="exam-results" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="bg-white border-b border-stone-200 px-3 md:px-6 py-2 md:h-16 flex flex-wrap items-center gap-2 relative shrink-0">
          <div className="absolute inset-x-0 top-0 h-1 bg-brand-700" />
          <button onClick={onClose} className="p-2 -ml-1 rounded-lg hover:bg-stone-100" aria-label="Đóng"><ChevronLeft className="w-5 h-5" /></button>
          <div className="min-w-0 flex-1"><div className="text-[11px] font-bold text-stone-500">KẾT QUẢ &amp; PHÂN TÍCH</div><div className="font-bold truncate">{exam.title}</div></div>
          <div className="flex gap-2">
            <button className={btnSecondary + ' h-10'} onClick={exportXlsx} disabled={!rows.length}><Download className="w-4 h-4" />Xuất Excel</button>
            <button className={btnSecondary + ' h-10'} onClick={togglePublish} data-testid="btn-publish">{published ? <><EyeOff className="w-4 h-4" />Thu hồi công bố</> : <><Eye className="w-4 h-4" />Công bố kết quả</>}</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 md:p-5">
          {msg && <div className="mb-3 text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2">{msg}</div>}
          {loading && !rows.length ? <div className="flex items-center gap-2 text-stone-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Đang tải...</div> : (
            <div className="grid xl:grid-cols-[1fr_440px] gap-4">
              <div className="space-y-4 min-w-0">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
                  {[[`${A.done.length}/${people.length}`, 'Dự thi', ''], [A.done.length ? fmtScore(Math.round(A.avg * 100) / 100) : '–', 'Điểm trung bình', ''],
                    [A.done.length ? `${Math.round(A.passN * 100 / A.done.length)}%` : '–', `Đạt (≥ ${fmtScore(exam.passScore)} điểm)`, 'text-emerald-700'],
                    [String(A.done.length - A.passN), 'Không đạt', 'text-red-700'], [String(new Set(A.suspects.flatMap(s => s.userIds)).size), 'Nghi vấn cần xem xét', 'text-orange-600']].map(([v, l, c]) => (
                    <div key={l} className="bg-white rounded-xl border border-stone-200 px-3 py-2.5" data-testid="res-stat"><div className={`text-2xl md:text-3xl font-extrabold tabular ${c}`}>{v}</div><div className="text-[12px] text-stone-500 font-medium">{l}</div></div>
                  ))}
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-stone-200 p-4">
                    <b>Phân bố điểm</b>
                    <div className="flex items-end gap-2 h-44 mt-6 border-b border-stone-200">
                      {A.bins.map((b, i) => (
                        <div key={i} className="flex-1 rounded-t-md relative" style={{ height: `${Math.max(2, b * 100 / maxBin)}%`, background: i < 2 ? '#fca5a5' : ['#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'][i - 2] }}>
                          <span className="absolute -top-5 inset-x-0 text-center text-[12px] font-bold">{b || ''}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 text-[11px] text-stone-500 mt-1">{['<4', '4–5', '5–6', '6–7', '7–8', '8–9', '9–10'].map(l => <span key={l} className="flex-1 text-center">{l}</span>)}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-stone-200 p-4" data-testid="res-hardest">
                    <b>Câu sai nhiều nhất</b>
                    {A.hardest.slice(0, 5).map(h => (
                      <div key={h.id} className="py-2 border-b border-stone-100 last:border-0 text-[13.5px]"><b className="text-red-700">{Math.round(h.rate * 100)}%</b> sai · {h.text}{h.topic && <span className="text-stone-400"> ({h.topic})</span>}</div>
                    ))}
                    {!A.hardest.length && <div className="text-[13px] text-stone-500 mt-2">Chưa đủ dữ liệu.</div>}
                    {A.hardest.length > 0 && <div className="text-[12px] text-stone-500 mt-2">→ Nên giao bài học ôn lại các nội dung này.</div>}
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b border-stone-100"><b>Xếp hạng</b>
                    <button onClick={() => setByTeam(false)} className={`h-7 px-2.5 rounded-full text-[12px] font-semibold ${!byTeam ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>Toàn đơn vị</button>
                    <button onClick={() => setByTeam(true)} className={`h-7 px-2.5 rounded-full text-[12px] font-semibold ${byTeam ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>Theo tổ</button>
                  </div>
                  <div className="overflow-x-auto">
                    {byTeam ? (
                      <table className="w-full text-[13.5px]"><thead><tr className="bg-stone-50 text-[12px] text-stone-500 text-left"><th className="px-3 py-2">Tổ</th><th className="px-2 py-2">Dự thi</th><th className="px-2 py-2">Điểm TB</th><th className="px-2 py-2">Đạt</th></tr></thead>
                        <tbody>{teams.map(t => <tr key={t.d} className="border-t border-stone-100"><td className="px-3 py-2 font-semibold">{t.d}</td><td className="px-2 py-2">{t.n}</td><td className="px-2 py-2 font-bold">{fmtScore(Math.round(t.avg * 100) / 100)}</td><td className="px-2 py-2">{t.pass}/{t.n}</td></tr>)}</tbody></table>
                    ) : (
                      <table className="w-full text-[13.5px]" data-testid="res-rank"><thead><tr className="bg-stone-50 text-[12px] text-stone-500 text-left"><th className="px-3 py-2">Hạng</th><th className="px-2 py-2">Cán bộ</th><th className="px-2 py-2">Tổ</th><th className="px-2 py-2">Điểm</th><th className="px-2 py-2">Đúng</th><th className="px-2 py-2">Thời gian</th><th className="px-2 py-2">Xếp loại</th></tr></thead>
                        <tbody>
                          {ranked.map((r, i) => { const g = grade(r.score, exam.passScore); return (
                            <tr key={r.userId} className="border-t border-stone-100"><td className="px-3 py-2">{i + 1}</td><td className="px-2 py-2 font-semibold">{name(r.userId)}</td><td className="px-2 py-2 text-stone-600">{dept(r.userId).replace(/^Tổ /, '')}</td>
                              <td className="px-2 py-2 font-bold">{fmtScore(r.score)}</td><td className="px-2 py-2">{r.correct}/{r.total}</td><td className="px-2 py-2 whitespace-nowrap">{fmtDur((Number(r.submittedAt) - Number(r.startedAt)) / 1000)}</td>
                              <td className="px-2 py-2"><Chip tone={g.tone}>{g.label}</Chip></td></tr>); })}
                          {A.voided.map(r => <tr key={r.userId} className="border-t border-stone-100 text-stone-400"><td className="px-3 py-2">–</td><td className="px-2 py-2">{name(r.userId)}</td><td className="px-2 py-2">{dept(r.userId).replace(/^Tổ /, '')}</td><td colSpan={4} className="px-2 py-2"><Chip tone="red">Đã huỷ bài</Chip></td></tr>)}
                          {notTaken.map(u => <tr key={u.id} className="border-t border-stone-100 text-stone-400"><td className="px-3 py-2">–</td><td className="px-2 py-2">{u.fullName}</td><td className="px-2 py-2">{(u.department || '').replace(/^Tổ /, '')}</td><td colSpan={4} className="px-2 py-2">Không dự thi</td></tr>)}
                        </tbody></table>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-stone-200 p-4 h-max" data-testid="res-suspects">
                <b className="text-orange-700">Nghi vấn cần hội đồng xem xét ({A.suspects.length})</b>
                <div className="text-[12px] text-stone-500 mt-0.5">Phần mềm chỉ phát hiện dấu hiệu, kết luận do hội đồng.</div>
                {A.suspects.map((s, i) => (
                  <div key={i} className="py-3 border-b border-stone-100 last:border-0 text-[14px]" data-testid="suspect" data-kind={s.kind}>
                    <b>{s.userIds.map(name).join(' & ')}</b> <span className="text-stone-500 text-[12px]">· {s.userIds.map(id => dept(id).replace(/^Tổ /, '')).filter(Boolean).join(', ')}</span>
                    <div className="text-orange-700">{s.text}</div>
                    {s.userIds.length === 1 && (
                      <div className="flex gap-3 mt-1 text-[12px] font-semibold">
                        <button className="text-red-700" onClick={() => act(s.userIds[0], 'VOID', `Huỷ kết quả bài thi của ${name(s.userIds[0])}?`)}>Huỷ kết quả</button>
                        <button className="text-stone-600" onClick={() => act(s.userIds[0], 'RESET', `Cho ${name(s.userIds[0])} thi lại từ đầu?`)}>Cho thi lại</button>
                      </div>
                    )}
                  </div>
                ))}
                {!A.suspects.length && <div className="text-[13px] text-stone-500 mt-3">Không phát hiện dấu hiệu bất thường.</div>}
                <div className="text-[12px] text-stone-400 mt-3">Dấu hiệu được xét: nộp quá nhanh mà điểm cao, nhiều câu sai giống hệt nhau, rời màn hình, đổi máy giữa chừng, dùng chung thiết bị.</div>
                {exam.closedAt && <div className="text-[12px] text-stone-400 mt-1">Kết thúc: {fmtDate(exam.closedAt)}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
};
