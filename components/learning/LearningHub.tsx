import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { Learning } from '../../services/learningService';
import { MockDB } from '../../services/mockDatabase';
import { Exam, LearnCourse, LearnLesson, LearnProgress, MyAttempt, QuizQuestion, SeatLayout, User } from '../../types';
import { SkeletonList } from '../UI';
import { Empty } from './common';
import { LearnTab } from './LearnTab';
import { CourseEditor } from './CourseEditor';
import { CourseTracking } from './CourseTracking';
import { QuestionBank } from './QuestionBank';
import { ExamTab } from './ExamTab';
import { ExamEditor } from './ExamEditor';
import { ExamTaker } from './ExamTaker';
import { ExamMonitor } from './ExamMonitor';
import { ExamResults } from './ExamResults';

interface Props { currentUser: User; canManage: boolean; }
type Tab = 'LEARN' | 'EXAM' | 'BANK';

/** Học tập & Thi: khoá học → bài học → câu hỏi ôn; kỳ thi tập trung / tại nhà có chống gian lận */
export const LearningHub: React.FC<Props> = ({ currentUser, canManage }) => {
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem('learn_tab') as Tab) || 'LEARN'; } catch { return 'LEARN'; } });
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<LearnCourse[]>([]);
  const [lessons, setLessons] = useState<LearnLesson[]>([]);
  const [myProgress, setMyProgress] = useState<LearnProgress[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [my, setMy] = useState<MyAttempt[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [layouts, setLayouts] = useState<SeatLayout[]>([]);

  const [editCourse, setEditCourse] = useState<LearnCourse | null | 'new'>(null);
  const [track, setTrack] = useState<LearnCourse | null>(null);
  const [editExam, setEditExam] = useState<Exam | null | 'new'>(null);
  const [taking, setTaking] = useState<Exam | null>(null);
  const [monitor, setMonitor] = useState<Exam | null>(null);
  const [results, setResults] = useState<Exam | null>(null);

  const cloud = Learning.available();

  const loadAll = useCallback(async () => {
    if (!cloud) { setLoading(false); return; }
    const [us, cs, ls, ps, es, m] = await Promise.all([
      MockDB.getUsers(), Learning.getCourses(), Learning.getLessons(), Learning.getProgress({ userId: currentUser.id }), Learning.getExams(), Learning.my()
    ]);
    setUsers(us.filter(u => u.isApproved !== false)); setCourses(cs); setLessons(ls); setMyProgress(ps); setExams(es); setMy(m.attempts || []);
    if (canManage) {
      const [qs, lay] = await Promise.all([Learning.listQuestions(), MockDB.getSeatLayouts()]);
      setQuestions(qs.questions || []); setLayouts(lay);
    }
    setLoading(false);
  }, [cloud, currentUser.id, canManage]);

  useEffect(() => { loadAll(); }, [loadAll]);
  const deb = useRef<number | undefined>(undefined);
  useEffect(() => {
    const unsub = MockDB.subscribe(t => {
      if (t && ['learn_courses', 'learn_lessons', 'exams'].includes(t)) { window.clearTimeout(deb.current); deb.current = window.setTimeout(loadAll, 500); }
    });
    return () => { unsub(); };
  }, [loadAll]);
  useEffect(() => { try { localStorage.setItem('learn_tab', tab); } catch { /* bỏ qua */ } }, [tab]);

  const refreshMy = async () => { const m = await Learning.my(); setMy(m.attempts || []); };
  const refreshQuestions = async () => { const qs = await Learning.listQuestions(); setQuestions(qs.questions || []); };
  const onProgress = (p: LearnProgress) => setMyProgress(list => [...list.filter(x => x.id !== p.id), p]);

  if (!cloud) {
    return <Empty icon={CloudOff} title="Cần kết nối máy chủ" text="Học tập & Thi chỉ chạy khi đã kết nối Supabase: đáp án, chấm điểm, đồng hồ và chống gian lận đều nằm trên máy chủ. Quản trị viên vào Cài đặt → Kết nối dữ liệu và chạy file 08_hoc_tap_thi.sql." />;
  }

  const tabs: [Tab, string][] = [['LEARN', 'Học tập'], ['EXAM', 'Thi'], ...(canManage ? [['BANK', 'Ngân hàng câu hỏi'] as [Tab, string]] : [])];
  const openCount = exams.filter(e => e.status === 'OPEN' && (!e.assigneeIds.length || e.assigneeIds.includes(currentUser.id)) && !my.some(a => a.examId === e.id && (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED'))).length;

  return (
    <div data-testid="learning-hub">
      <div className={`mb-4 md:mb-6 grid ${canManage ? 'grid-cols-3' : 'grid-cols-2'} md:inline-grid bg-stone-200/60 p-1 rounded-lg w-full md:w-auto`} role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`learn-tab-${t.toLowerCase()}`}
            className={`h-9 md:px-5 text-sm rounded-md transition-colors whitespace-nowrap ${tab === t ? 'bg-white text-stone-900 font-semibold shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}>
            {label}{t === 'EXAM' && openCount > 0 && <span className="ml-1.5 inline-flex min-w-5 h-5 px-1 rounded-full bg-brand-700 text-white text-[11px] font-bold items-center justify-center">{openCount}</span>}
          </button>
        ))}
      </div>

      {loading ? <SkeletonList rows={4} /> : (
        <div key={tab} className="view-enter">
          {tab === 'LEARN' && <LearnTab me={currentUser} canManage={canManage} courses={courses} lessons={lessons} myProgress={myProgress} exams={exams}
            onProgress={onProgress} onNewCourse={() => setEditCourse('new')} onEditCourse={c => setEditCourse(c)} onTrack={c => setTrack(c)} />}
          {tab === 'EXAM' && <ExamTab me={currentUser} users={users} canManage={canManage} exams={exams} my={my} courses={courses} lessons={lessons} myProgress={myProgress}
            onTake={e => setTaking(e)} onNew={() => setEditExam('new')} onEdit={e => setEditExam(e)} onMonitor={e => setMonitor(e)} onResults={e => setResults(e)} onChanged={loadAll} />}
          {tab === 'BANK' && canManage && <QuestionBank questions={questions} onChanged={refreshQuestions} />}
        </div>
      )}

      {canManage && <>
        <CourseEditor open={!!editCourse} course={editCourse === 'new' ? null : editCourse} lessons={lessons} users={users} me={currentUser} questions={questions}
          onClose={() => setEditCourse(null)} onChanged={loadAll} />
        <CourseTracking course={track} lessons={lessons} users={users} onClose={() => setTrack(null)} />
        <ExamEditor open={!!editExam} exam={editExam === 'new' ? null : editExam} users={users} me={currentUser} questions={questions} courses={courses} layouts={layouts}
          onClose={() => setEditExam(null)} onSaved={() => { setEditExam(null); loadAll(); }} />
        {monitor && <ExamMonitor exam={exams.find(e => e.id === monitor.id) || monitor} users={users} layouts={layouts} onClose={() => setMonitor(null)} onChanged={loadAll} />}
        {results && <ExamResults exam={exams.find(e => e.id === results.id) || results} users={users} onClose={() => setResults(null)} onChanged={loadAll} />}
      </>}
      {taking && <ExamTaker exam={taking} me={currentUser} onClose={() => { setTaking(null); refreshMy(); }} />}
    </div>
  );
};

export default LearningHub;
