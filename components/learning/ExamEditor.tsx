import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Home, Users } from 'lucide-react';
import { Learning } from '../../services/learningService';
import { Exam, LearnCourse, QuizQuestion, SeatLayout, User, UserRole } from '../../types';
import { ParticipantPicker } from '../ParticipantPicker';
import { btnPrimary, btnSecondary, fromLocalInput, inputCls, labelCls, Sheet, toLocalInput } from './common';

interface Props {
  open: boolean;
  exam: Exam | null;
  users: User[];
  me: User;
  questions: QuizQuestion[];
  courses: LearnCourse[];
  layouts: SeatLayout[];
  onClose: () => void;
  onSaved: () => void;
}

const DEFAULT: Partial<Exam> = {
  title: '', mode: 'HALL', location: '', durationMin: 30, questionCount: 30, topics: [], questionIds: [], passScore: 5, maxLeave: 3,
  requireCourseId: null, assigneeIds: [], seatLayoutId: null,
  settings: { shuffle: true, oneDevice: true, watermark: true, showScore: true, showReview: true }
};

export const ExamEditor: React.FC<Props> = ({ open, exam, users, me, questions, courses, layouts, onClose, onSaved }) => {
  const [e, setE] = useState<Partial<Exam>>(DEFAULT);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(false);
  useEffect(() => { if (open) { setE(exam ? JSON.parse(JSON.stringify(exam)) : JSON.parse(JSON.stringify(DEFAULT))); setMsg(''); } }, [open, exam?.id]);

  const topics = useMemo(() => {
    const m = new Map<string, number>();
    questions.filter(q => q.active !== false).forEach(q => { if (q.topic) m.set(q.topic, (m.get(q.topic) || 0) + 1); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  }, [questions]);
  const sel = new Set(e.topics || []);
  const pool = questions.filter(q => q.active !== false && (!sel.size || sel.has(q.topic || ''))).length;
  const locked = !!exam && exam.status !== 'DRAFT';
  const st = e.settings || {};
  const set = (k: keyof NonNullable<Exam['settings']>, v: boolean) => setE({ ...e, settings: { ...st, [k]: v } });

  const save = async () => {
    if (!e.title?.trim()) { setMsg('Vui lòng nhập tên kỳ thi.'); return; }
    if (e.mode === 'HOME' && (!e.startAt || !e.endAt)) { setMsg('Thi tại nhà cần đặt khung giờ được vào thi (từ – đến).'); return; }
    if (e.startAt && e.endAt && e.endAt <= e.startAt) { setMsg('Giờ kết thúc phải sau giờ bắt đầu.'); return; }
    setBusy(true);
    const r = await Learning.saveExam(e);
    setBusy(false);
    if (!r.ok) { setMsg(r.message || 'Không lưu được.'); return; }
    if (r.message) window.alert(r.message);
    onSaved();
  };

  const Toggle: React.FC<{ k: keyof NonNullable<Exam['settings']>; title: string; sub: string }> = ({ k, title, sub }) => (
    <label className="flex items-start gap-2.5 py-2 cursor-pointer">
      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-brand-700" disabled={locked && k !== 'showScore' && k !== 'showReview'} checked={st[k] !== false} onChange={x => set(k, x.target.checked)} />
      <span className="text-sm"><b className="text-stone-900">{title}</b><br /><span className="text-stone-500 text-[13px]">{sub}</span></span>
    </label>
  );

  return (
    <>
      <Sheet open={open} onClose={onClose} wide title={exam ? 'Sửa kỳ thi' : 'Tạo kỳ thi'} testId="exam-editor"
        footer={<><button className={btnSecondary} onClick={onClose}>Huỷ</button><button className={btnPrimary} onClick={save} disabled={busy} data-testid="btn-save-exam">Lưu kỳ thi</button></>}>
        {locked && <div className="mb-3 text-sm rounded-lg bg-amber-50 text-amber-800 px-3 py-2">Kỳ thi đã mở: chỉ sửa được tên, địa điểm, khung giờ và thành phần.</div>}
        <div className="grid md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div><label className={labelCls}>Tên kỳ thi</label><input className={inputCls} value={e.title || ''} onChange={x => setE({ ...e, title: x.target.value })} placeholder="VD: Kiểm tra pháp luật Quý IV/2026" data-testid="exam-title" /></div>
            <div>
              <label className={labelCls}>Hình thức</label>
              <div className="grid grid-cols-2 gap-2">
                {([['HALL', 'Thi tập trung', 'Tại hội trường, quét mã QR phòng thi', Building2], ['HOME', 'Thi tại nhà', 'Trong khung giờ, làm trên máy cá nhân', Home]] as const).map(([m, t, sub, Icon]) => (
                  <button key={m} disabled={locked} onClick={() => setE({ ...e, mode: m })} data-testid={`exam-mode-${m.toLowerCase()}`}
                    className={`text-left rounded-xl border-2 p-3 ${e.mode === m ? 'border-brand-700 bg-brand-50' : 'border-stone-200'} disabled:opacity-60`}>
                    <Icon className="w-5 h-5 text-brand-700" /><div className="font-semibold text-sm mt-1">{t}</div><div className="text-[12px] text-stone-500">{sub}</div>
                  </button>
                ))}
              </div>
            </div>
            {e.mode === 'HALL' && <div><label className={labelCls}>Địa điểm</label><input className={inputCls} value={e.location || ''} onChange={x => setE({ ...e, location: x.target.value })} placeholder="VD: Hội trường tầng 6" /></div>}
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>{e.mode === 'HOME' ? 'Được vào thi từ' : 'Giờ thi (tuỳ chọn)'}</label><input type="datetime-local" className={inputCls} value={toLocalInput(e.startAt)} onChange={x => setE({ ...e, startAt: fromLocalInput(x.target.value) })} data-testid="exam-start" /></div>
              <div><label className={labelCls}>Đến</label><input type="datetime-local" className={inputCls} value={toLocalInput(e.endAt)} onChange={x => setE({ ...e, endAt: fromLocalInput(x.target.value) })} data-testid="exam-end" /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className={labelCls}>Số câu/đề</label><input type="number" min={1} max={200} disabled={locked} className={inputCls} value={e.questionCount} onChange={x => setE({ ...e, questionCount: Number(x.target.value) || 1 })} data-testid="exam-count" /></div>
              <div><label className={labelCls}>Thời gian (phút)</label><input type="number" min={1} max={300} disabled={locked} className={inputCls} value={e.durationMin} onChange={x => setE({ ...e, durationMin: Number(x.target.value) || 1 })} data-testid="exam-duration" /></div>
              <div><label className={labelCls}>Điểm đạt</label><input type="number" min={0} max={10} step={0.5} disabled={locked} className={inputCls} value={e.passScore} onChange={x => setE({ ...e, passScore: Number(x.target.value) })} /></div>
            </div>
            <div>
              <label className={labelCls}>Rút câu hỏi từ chủ đề <span className="font-normal text-stone-500">(không chọn = tất cả)</span></label>
              <div className="flex flex-wrap gap-1.5">
                {topics.map(([t, n]) => (
                  <button key={t} disabled={locked} onClick={() => { const s = new Set(sel); s.has(t) ? s.delete(t) : s.add(t); setE({ ...e, topics: [...s] }); }}
                    className={`h-8 px-3 rounded-full text-[13px] font-semibold border ${sel.has(t) ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-300'}`}>{t} · {n}</button>
                ))}
                {!topics.length && <span className="text-[13px] text-stone-500">Ngân hàng chưa có câu hỏi.</span>}
              </div>
              <div className={`text-[13px] mt-1.5 ${pool < (e.questionCount || 0) ? 'text-red-600 font-semibold' : 'text-stone-500'}`} data-testid="exam-pool">
                Ngân hàng có {pool} câu phù hợp{pool < (e.questionCount || 0) ? ` — ít hơn ${e.questionCount} câu mỗi đề, mỗi người chỉ nhận ${pool} câu` : pool > (e.questionCount || 0) ? ` → mỗi người rút ngẫu nhiên ${e.questionCount} câu` : ''}.
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div><label className={labelCls}>Thành phần dự thi</label>
              <button className={`${btnSecondary} w-full justify-start`} onClick={() => setPick(true)} data-testid="exam-assignees"><Users className="w-4 h-4" />{e.assigneeIds?.length ? `${e.assigneeIds.length} cán bộ` : 'Toàn đơn vị'}</button>
              {!!e.assigneeIds?.length && <button className="text-[12px] text-brand-700 font-semibold mt-1" onClick={() => setE({ ...e, assigneeIds: [] })}>Toàn đơn vị</button>}
            </div>
            <div><label className={labelCls}>Điều kiện dự thi</label>
              <select className={inputCls} disabled={locked} value={e.requireCourseId || ''} onChange={x => setE({ ...e, requireCourseId: x.target.value || null })} data-testid="exam-require">
                <option value="">Không bắt buộc học trước</option>
                {courses.map(c => <option key={c.id} value={c.id}>Học xong khoá: {c.title}</option>)}
              </select></div>
            {e.mode === 'HALL' && layouts.length > 0 && (
              <div><label className={labelCls}>Sơ đồ chỗ ngồi (hiện số ghế trên màn giám thị)</label>
                <select className={inputCls} value={e.seatLayoutId || ''} onChange={x => setE({ ...e, seatLayoutId: x.target.value || null })}>
                  <option value="">Không dùng</option>{layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select></div>
            )}
            <div className="rounded-xl border border-stone-200 px-3 py-1 divide-y divide-stone-100">
              <div className="py-2 font-semibold text-sm">Chống gian lận</div>
              <Toggle k="shuffle" title="Mỗi người một đề" sub="Rút câu ngẫu nhiên, đảo thứ tự câu và đáp án" />
              <Toggle k="oneDevice" title="Một bài thi chỉ trên một máy" sub="Đăng nhập máy khác giữa chừng → khoá bài, chờ giám thị" />
              <Toggle k="watermark" title="Chữ chìm họ tên, chặn sao chép" sub="Ảnh chụp đề lộ ngay người gửi" />
              <label className="flex items-start gap-2.5 py-2">
                <span className="text-sm flex-1"><b className="text-stone-900">Rời màn hình tối đa</b><br /><span className="text-stone-500 text-[13px]">Chuyển ứng dụng, tắt màn hình, mở tab khác. 0 = chỉ ghi nhận</span></span>
                <input type="number" min={0} max={20} disabled={locked} className={inputCls + ' w-20 h-9'} value={e.maxLeave} onChange={x => setE({ ...e, maxLeave: Math.max(0, Number(x.target.value) || 0) })} data-testid="exam-maxleave" />
              </label>
              <Toggle k="showScore" title="Hiện điểm ngay khi nộp" sub="Tắt nếu muốn hội đồng xem xét trước khi công bố" />
              <Toggle k="showReview" title="Cho xem lại đáp án khi công bố" sub="Cán bộ xem câu đúng/sai và giải thích" />
            </div>
            {msg && <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2" data-testid="exam-editor-msg">{msg}</div>}
          </div>
        </div>
      </Sheet>
      <ParticipantPicker open={pick} users={users.filter(u => u.role !== UserRole.ADMIN)} selected={e.assigneeIds || []} currentUserId={me.id}
        onClose={() => setPick(false)} onDone={ids => { setE({ ...e, assigneeIds: ids }); setPick(false); }} />
    </>
  );
};
