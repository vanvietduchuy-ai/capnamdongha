import React, { useState } from 'react';
import { BarChart3, Building2, ClipboardCheck, Home, MonitorPlay, Pencil, Plus, Trash2 } from 'lucide-react';
import { Learning } from '../../services/learningService';
import { Exam, LearnCourse, LearnLesson, LearnProgress, MyAttempt, User } from '../../types';
import { assigneesOf, fmtDate, fmtScore, LETTERS } from '../../lib/exam';
import { btnPrimary, btnSecondary, card, Chip, Empty, Sheet } from './common';
import { lessonsOf } from './LearnTab';

interface Props {
  me: User; users: User[]; canManage: boolean;
  exams: Exam[]; my: MyAttempt[]; courses: LearnCourse[]; lessons: LearnLesson[]; myProgress: LearnProgress[];
  onTake: (e: Exam) => void; onNew: () => void; onEdit: (e: Exam) => void; onMonitor: (e: Exam) => void; onResults: (e: Exam) => void; onChanged: () => void;
}

const window_ = (e: Exam) => e.startAt || e.endAt ? `${e.startAt ? fmtDate(e.startAt) : '…'} → ${e.endAt ? fmtDate(e.endAt) : '…'}` : '';

export const ExamTab: React.FC<Props> = ({ me, users, canManage, exams, my, courses, lessons, myProgress, onTake, onNew, onEdit, onMonitor, onResults, onChanged }) => {
  const [review, setReview] = useState<Exam | null>(null);
  const mineAtt = new Map(my.map(a => [a.examId, a]));
  const assigned = exams.filter(e => e.status !== 'DRAFT' && (!e.assigneeIds.length || e.assigneeIds.includes(me.id)));
  const doneSet = new Set(myProgress.filter(p => p.completed).map(p => p.lessonId));

  const myCard = (e: Exam) => {
    const a = mineAtt.get(e.id);
    const submitted = a && (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED');
    const now = Date.now();
    const before = e.startAt && now < e.startAt; const after = e.endAt && now > e.endAt;
    const req = e.requireCourseId ? courses.find(c => c.id === e.requireCourseId) : null;
    const reqLeft = req ? lessonsOf(lessons, req.id).filter(l => !doneSet.has(l.id)).length : 0;
    const canEnter = e.status === 'OPEN' && !submitted && a?.status !== 'VOID' && !before && (!after || a?.status === 'IN_PROGRESS') && reqLeft === 0;
    return (
      <div key={e.id} className={`${card} p-4`} data-testid="my-exam" data-exam={e.id}>
        <div className="flex items-start gap-3">
          <span className="icon-3d w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ ['--c' as any]: '#a50f1a' }}>{e.mode === 'HALL' ? <Building2 className="w-5 h-5" /> : <Home className="w-5 h-5" />}</span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-stone-900">{e.title}</div>
            <div className="text-[12px] text-stone-500 mt-0.5">{e.mode === 'HALL' ? `Thi tập trung${e.location ? ` · ${e.location}` : ''}` : 'Thi tại nhà'} · {e.questionCount} câu · {e.durationMin} phút</div>
            {window_(e) && <div className="text-[12px] text-stone-500">{window_(e)}</div>}
          </div>
          {e.status === 'OPEN' ? <Chip tone="green">Đang mở</Chip> : <Chip>Đã kết thúc</Chip>}
        </div>
        {req && reqLeft > 0 && <div className="mt-3 text-[13px] rounded-lg bg-amber-50 text-amber-800 px-3 py-2">Cần học xong khoá "{req.title}" (còn {reqLeft} bài) mới được dự thi.</div>}
        <div className="mt-3 flex items-center gap-2">
          {submitted ? (
            <>
              <div className="text-sm" data-testid="my-exam-score">{a!.score !== null && a!.score !== undefined ? <>Điểm: <b className="text-lg">{fmtScore(a!.score)}</b> <span className="text-stone-500">({a!.correct}/{a!.total} câu)</span></> : <span className="text-stone-600">Đã nộp · chờ công bố kết quả</span>}</div>
              {e.published && e.settings.showReview !== false && <button className={`${btnSecondary} ml-auto h-9`} onClick={() => setReview(e)} data-testid="btn-review">Xem lại bài</button>}
            </>
          ) : a?.status === 'VOID' ? <Chip tone="red">Bài thi đã bị huỷ</Chip>
            : <button className={`${btnPrimary} ${canEnter ? '' : 'opacity-50'}`} disabled={!canEnter} onClick={() => onTake(e)} data-testid="btn-take-exam">
              {a?.status === 'IN_PROGRESS' || a?.status === 'LOCKED' ? 'Tiếp tục làm bài' : e.mode === 'HALL' ? 'Vào phòng thi' : 'Vào thi'}
            </button>}
          {!submitted && before && <span className="text-[12px] text-stone-500">Chưa đến giờ thi</span>}
          {!submitted && e.status !== 'OPEN' && !a && <span className="text-[12px] text-stone-500">Không dự thi</span>}
        </div>
      </div>
    );
  };

  const remove = async (e: Exam) => {
    if (!window.confirm(`Xoá kỳ thi "${e.title}" cùng toàn bộ bài làm?`)) return;
    const r = await Learning.deleteExam(e.id);
    if (!r.ok) window.alert(r.message || 'Không xoá được.'); else onChanged();
  };

  return (
    <div>
      {canManage && (
        <>
          <div className="flex items-center gap-2 mb-3"><button className={btnPrimary} onClick={onNew} data-testid="btn-new-exam"><Plus className="w-4 h-4" />Tạo kỳ thi</button></div>
          {exams.length > 0 && (
            <div className={`${card} divide-y divide-stone-100 mb-6 overflow-hidden`}>
              {exams.map(e => {
                const n = assigneesOf(e.assigneeIds, users).length;
                return (
                  <div key={e.id} className="p-3 md:px-4 flex flex-wrap items-center gap-2" data-testid="manage-exam" data-exam={e.id}>
                    <div className="min-w-0 flex-1 basis-60">
                      <div className="font-semibold text-stone-900 flex items-center gap-2 flex-wrap">{e.title}
                        {e.status === 'OPEN' ? <Chip tone="green">Đang thi</Chip> : e.status === 'CLOSED' ? <Chip>Đã kết thúc</Chip> : <Chip tone="amber">Nháp</Chip>}
                        {e.published && <Chip tone="blue">Đã công bố</Chip>}</div>
                      <div className="text-[12px] text-stone-500">{e.mode === 'HALL' ? 'Tập trung' : 'Tại nhà'} · {e.questionCount} câu · {e.durationMin} phút · {n} thí sinh{window_(e) ? ` · ${window_(e)}` : ''}</div>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      <button className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[13px] font-semibold bg-stone-900 text-white" onClick={() => onMonitor(e)} data-testid="btn-monitor"><MonitorPlay className="w-4 h-4" />Giám thị</button>
                      <button className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[13px] font-semibold text-stone-700 hover:bg-stone-100" onClick={() => onResults(e)} data-testid="btn-results"><BarChart3 className="w-4 h-4" />Kết quả</button>
                      <button className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[13px] font-semibold text-stone-700 hover:bg-stone-100" onClick={() => onEdit(e)} data-testid="btn-edit-exam"><Pencil className="w-4 h-4" />Sửa</button>
                      {e.status !== 'OPEN' && <button className="inline-flex items-center h-9 px-2 rounded-lg text-red-600 hover:bg-red-50" onClick={() => remove(e)} aria-label="Xoá"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      <div className="text-[12px] font-bold uppercase tracking-wide text-stone-500 mb-2 px-1">Kỳ thi của tôi</div>
      {assigned.length === 0 ? <Empty icon={ClipboardCheck} title="Chưa có kỳ thi nào" text="Khi có kỳ thi được mở cho bạn, kỳ thi sẽ hiện ở đây." />
        : <div className="grid gap-3 md:grid-cols-2 stagger">{assigned.map(myCard)}</div>}
      <ReviewSheet exam={review} onClose={() => setReview(null)} />
    </div>
  );
};

/** Xem lại bài đã làm (khi kỳ thi đã công bố và cho phép) */
const ReviewSheet: React.FC<{ exam: Exam | null; onClose: () => void }> = ({ exam, onClose }) => {
  const [data, setData] = useState<Awaited<ReturnType<typeof Learning.review>> | null>(null);
  React.useEffect(() => { setData(null); if (exam) Learning.review(exam.id).then(setData); }, [exam?.id]);
  return (
    <Sheet open={!!exam} onClose={onClose} title={`Xem lại bài · ${exam?.title || ''}`} testId="review-sheet">
      {!data ? <div className="text-sm text-stone-500">Đang tải...</div> : !data.ok ? <div className="text-sm text-red-700">{data.message}</div> : (
        <div className="space-y-4">
          <div className="text-center"><div className="text-4xl font-extrabold">{fmtScore(data.score)}</div><div className="text-stone-500">đúng {data.correct}/{data.total} câu</div></div>
          {data.questions.map((q, n) => {
            const pick = data.answers[q.id]; const key = data.keys[q.id];
            return (
              <div key={q.id} className="border-t border-stone-100 pt-3">
                <div className="font-semibold text-[14px]">{n + 1}. {q.text}</div>
                <div className="mt-1.5 space-y-1 text-[13.5px]">
                  {q.options.map((o, k) => (
                    <div key={o.i} className={`rounded-lg px-2.5 py-1.5 ${o.i === key ? 'bg-emerald-50 text-emerald-800 font-semibold' : o.i === pick ? 'bg-red-50 text-red-700 line-through' : 'text-stone-600'}`}>{LETTERS[k]}. {o.t}</div>
                  ))}
                  {pick === undefined && <div className="text-[12px] text-red-600">Bạn không trả lời câu này.</div>}
                </div>
                {data.explanations[q.id] && <div className="text-[12.5px] text-stone-600 mt-1.5">Giải thích: {data.explanations[q.id]}</div>}
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
};
