import React, { useMemo, useState } from 'react';
import { BarChart3, BookOpen, CalendarClock, ChevronLeft, ChevronRight, Eye, FileText, GraduationCap, Pencil, Plus, Video } from 'lucide-react';
import { Exam, LearnCourse, LearnLesson, LearnProgress, User } from '../../types';
import { fmtDay, fmtDur } from '../../lib/exam';
import { btnPrimary, btnSecondary, card, Chip, Empty, ProgressBar } from './common';
import { LessonReader, LessonStatusIcon } from './LessonReader';

interface Props {
  me: User;
  canManage: boolean;
  courses: LearnCourse[];
  lessons: LearnLesson[];
  myProgress: LearnProgress[];
  exams: Exam[];
  onProgress: (p: LearnProgress) => void;
  onNewCourse: () => void;
  onEditCourse: (c: LearnCourse) => void;
  onTrack: (c: LearnCourse) => void;
}

export const lessonsOf = (lessons: LearnLesson[], courseId: string) =>
  lessons.filter(l => l.courseId === courseId).sort((a, b) => a.ord - b.ord || a.id.localeCompare(b.id));

/** Trạng thái từng bài của 1 người: xong / đang học / chưa / khoá (học theo thứ tự) */
export const lessonStates = (course: LearnCourse, ls: LearnLesson[], prog: Map<string, LearnProgress>) => {
  let blocked = false;
  return ls.map(l => {
    const p = prog.get(l.id);
    const state: 'done' | 'doing' | 'todo' | 'locked' = p?.completed ? 'done' : blocked ? 'locked' : (p && (p.seconds > 0 || p.videoPct > 0)) ? 'doing' : 'todo';
    if (course.sequential && !p?.completed) blocked = true;
    return { lesson: l, p, state };
  });
};

const isMine = (c: LearnCourse, me: User) => c.status === 'PUBLISHED' && (!c.assigneeIds.length || c.assigneeIds.includes(me.id));

export const LearnTab: React.FC<Props> = ({ me, canManage, courses, lessons, myProgress, exams, onProgress, onNewCourse, onEditCourse, onTrack }) => {
  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const prog = useMemo(() => new Map(myProgress.map(p => [p.lessonId, p])), [myProgress]);

  const mine = courses.filter(c => isMine(c, me));
  const others = canManage ? courses.filter(c => !isMine(c, me)) : [];
  const course = courses.find(c => c.id === openCourse) || null;

  if (course) {
    const ls = lessonsOf(lessons, course.id);
    const states = lessonStates(course, ls, prog);
    const lesson = ls.find(l => l.id === openLesson);
    if (lesson) {
      const i = ls.indexOf(lesson);
      const nextLocked = course.sequential && !prog.get(lesson.id)?.completed;
      return (
        <LessonReader key={lesson.id} lesson={lesson} progress={prog.get(lesson.id)}
          chapterLabel={[lesson.chapter, course.title].filter(Boolean).join(' · ')}
          prev={ls[i - 1] || null} next={ls[i + 1] || null} nextLocked={nextLocked}
          onBack={() => setOpenLesson(null)} onOpen={l => setOpenLesson(l.id)} onProgress={onProgress} />
      );
    }
    const doneN = states.filter(s => s.state === 'done').length;
    const pct = ls.length ? Math.round(doneN * 100 / ls.length) : 0;
    const gate = exams.filter(e => e.requireCourseId === course.id && e.status !== 'CLOSED');
    const chapters: { name: string; items: typeof states }[] = [];
    states.forEach(s => {
      const name = s.lesson.chapter || '';
      const last = chapters[chapters.length - 1];
      if (last && last.name === name) last.items.push(s); else chapters.push({ name, items: [s] });
    });
    const overdue = course.deadline && Date.now() > course.deadline && pct < 100;
    return (
      <div className="max-w-3xl mx-auto" data-testid="course-view">
        <button onClick={() => setOpenCourse(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-stone-600 hover:text-stone-900 mb-3"><ChevronLeft className="w-4 h-4" />Tất cả khoá học</button>
        <div className="rounded-2xl p-5 text-white shadow-lg" style={{ background: 'linear-gradient(135deg,#0f766e,#115e59)' }}>
          <div className="text-[12px] font-semibold opacity-80 uppercase tracking-wide">Khoá học{course.deadline ? ` · hạn ${fmtDay(course.deadline)}` : ''}</div>
          <div className="text-xl font-bold mt-0.5">{course.title}</div>
          {course.description && <p className="text-sm opacity-90 mt-1">{course.description}</p>}
          <div className="flex justify-between text-sm font-semibold mt-3"><span data-testid="course-progress">Đã học {doneN}/{ls.length} bài</span><span>{pct}%</span></div>
          <div className="h-2 rounded-full bg-white/25 mt-1.5 overflow-hidden"><div className="h-full bg-white rounded-full" style={{ width: `${pct}%` }} /></div>
          {gate.length > 0 && <div className="text-[13px] mt-3 opacity-95">Học xong cả khoá mới được dự thi: {gate.map(e => e.title).join(', ')}</div>}
          {overdue && <div className="mt-2 inline-block text-[12px] font-bold bg-white text-red-700 rounded-full px-2 py-0.5">Đã quá hạn</div>}
        </div>
        {course.status === 'DRAFT' && <div className="mt-3 text-sm rounded-lg bg-amber-50 text-amber-800 px-3 py-2">Khoá học đang ở bản nháp — chỉ người soạn bài thấy. Bạn có thể học thử.</div>}

        {ls.length === 0 && <div className="mt-4"><Empty icon={BookOpen} title="Khoá học chưa có bài" text={canManage ? 'Bấm "Soạn bài" để thêm bài học.' : undefined} /></div>}
        {chapters.map((ch, ci) => (
          <div key={ci} className="mt-5">
            {ch.name && <div className="text-[12px] font-bold uppercase tracking-wide text-stone-500 mb-2 px-1">{ch.name}</div>}
            <div className={`${card} divide-y divide-stone-100 overflow-hidden`}>
              {ch.items.map(({ lesson: l, p, state }) => {
                const locked = state === 'locked' && !canManage;
                const tpct = l.minSeconds ? Math.min(100, ((p?.seconds || 0) * 100) / l.minSeconds) : 0;
                return (
                  <button key={l.id} disabled={locked} onClick={() => setOpenLesson(l.id)} data-testid="lesson-row" data-state={state}
                    className={`w-full text-left flex items-center gap-3 px-4 py-3 ${state === 'doing' ? 'bg-amber-50/60' : ''} ${locked ? 'opacity-60' : 'hover:bg-stone-50'}`}>
                    <LessonStatusIcon state={state} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-stone-900 text-[15px]">{l.title}</div>
                      <div className="text-[12px] text-stone-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                        {l.videoUrl ? <><Video className="w-3.5 h-3.5" />Video</> : l.pdfUrl ? <><FileText className="w-3.5 h-3.5" />PDF</> : <><BookOpen className="w-3.5 h-3.5" />Văn bản</>}
                        {l.minSeconds > 0 && <span>· {fmtDur(l.minSeconds)}</span>}
                        {l.quizCount > 0 && <span>· ôn {l.quizCount} câu{p?.completed && p.quizBest ? ` đạt ${Math.round(p.quizBest * l.quizCount / 100)}/${l.quizCount}` : ''}</span>}
                        {state === 'locked' && <span>· Mở khi xong bài trước</span>}
                      </div>
                      {state === 'doing' && l.minSeconds > 0 && <ProgressBar value={tpct} className="mt-1.5 h-1.5 max-w-xs" />}
                    </div>
                    {state === 'doing' && <Chip tone="amber">Học tiếp</Chip>}
                    {!locked && state !== 'doing' && <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {canManage && (
          <div className="flex gap-2 mt-5">
            <button className={btnSecondary} onClick={() => onEditCourse(course)}><Pencil className="w-4 h-4" />Soạn bài</button>
            <button className={btnSecondary} onClick={() => onTrack(course)}><BarChart3 className="w-4 h-4" />Theo dõi</button>
          </div>
        )}
      </div>
    );
  }

  const CourseCard: React.FC<{ c: LearnCourse }> = ({ c }) => {
    const ls = lessonsOf(lessons, c.id);
    const doneN = ls.filter(l => prog.get(l.id)?.completed).length;
    const pct = ls.length ? Math.round(doneN * 100 / ls.length) : 0;
    const daysLeft = c.deadline ? Math.ceil((c.deadline - Date.now()) / 86400000) : null;
    return (
      <div className={`${card} p-4 flex flex-col`} data-testid="course-card">
        <button className="text-left flex-1" onClick={() => setOpenCourse(c.id)}>
          <div className="flex items-start gap-3">
            <span className="icon-3d w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ ['--c' as any]: '#0f766e' }}><GraduationCap className="w-5 h-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-stone-900 leading-snug">{c.title}</div>
              <div className="text-[12px] text-stone-500 mt-0.5 flex flex-wrap gap-x-2">
                <span>{ls.length} bài</span>
                {c.deadline && <span className={daysLeft !== null && daysLeft < 0 && pct < 100 ? 'text-red-600 font-semibold' : ''}><CalendarClock className="w-3.5 h-3.5 inline -mt-0.5" /> hạn {fmtDay(c.deadline)}</span>}
                {c.status === 'DRAFT' && <Chip tone="gray">Bản nháp</Chip>}
                {canManage && <span>{c.assigneeIds.length ? `${c.assigneeIds.length} người` : 'Toàn đơn vị'}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <ProgressBar value={pct} className="flex-1" tone={pct >= 100 ? '#16a34a' : '#0f766e'} />
            <span className="text-[12px] font-semibold text-stone-600 tabular w-20 text-right">{doneN}/{ls.length} bài</span>
          </div>
        </button>
        {canManage && (
          <div className="flex gap-1 mt-3 pt-3 border-t border-stone-100">
            <button className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[13px] font-semibold text-stone-600 hover:bg-stone-100" onClick={() => onEditCourse(c)} data-testid="btn-edit-course"><Pencil className="w-3.5 h-3.5" />Soạn bài</button>
            <button className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[13px] font-semibold text-stone-600 hover:bg-stone-100" onClick={() => onTrack(c)} data-testid="btn-track-course"><BarChart3 className="w-3.5 h-3.5" />Theo dõi</button>
            <button className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[13px] font-semibold text-stone-600 hover:bg-stone-100 ml-auto" onClick={() => setOpenCourse(c.id)}><Eye className="w-3.5 h-3.5" />Học thử</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {canManage && (
        <div className="flex items-center gap-2 mb-4">
          <button className={btnPrimary} onClick={onNewCourse} data-testid="btn-new-course"><Plus className="w-4 h-4" />Tạo khoá học</button>
        </div>
      )}
      {mine.length === 0 && others.length === 0 && (
        <Empty icon={GraduationCap} title="Chưa có khoá học nào" text={canManage ? 'Tạo khoá học, soạn bài (văn bản, PDF, video) và giao cho cán bộ.' : 'Khi chỉ huy giao khoá học, bài học sẽ hiện ở đây.'} />
      )}
      {mine.length > 0 && (
        <>
          <div className="text-[12px] font-bold uppercase tracking-wide text-stone-500 mb-2 px-1">Khoá học được giao</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 stagger">{mine.map(c => <CourseCard key={c.id} c={c} />)}</div>
        </>
      )}
      {others.length > 0 && (
        <>
          <div className="text-[12px] font-bold uppercase tracking-wide text-stone-500 mb-2 mt-6 px-1">Khoá học khác (bản nháp / giao cho người khác)</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{others.map(c => <CourseCard key={c.id} c={c} />)}</div>
        </>
      )}
    </div>
  );
};
