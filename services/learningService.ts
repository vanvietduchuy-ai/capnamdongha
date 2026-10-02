/**
 * HỌC TẬP & THI — gọi hàm máy chủ (08_hoc_tap_thi.sql).
 * Chức năng này chỉ chạy khi đã kết nối Supabase: đáp án, chấm điểm, đồng hồ và chống gian lận
 * đều nằm trên máy chủ, chạy trên máy cá nhân sẽ không có giá trị.
 */
import { callRpc, getClient, getSessionToken } from '../lib/supabase';
import { MockDB } from './mockDatabase';
import { getDeviceId } from '../lib/exam';
import {
  Exam, ExamEvent, ExamPaperQuestion, LearnCourse, LearnLesson, LearnProgress, MonitorRow, MyAttempt, QuizQuestion, ResultRow
} from '../types';

const tok = () => getSessionToken();
type R<T = {}> = Promise<T & { ok: boolean; message?: string; code?: string }>;

const arr = <T,>(v: any): T[] => (Array.isArray(v) ? v : []);
const normCourse = (c: any): LearnCourse => ({ ...c, assigneeIds: arr(c.assigneeIds), sequential: c.sequential !== false });
const normLesson = (l: any): LearnLesson => ({
  ...l, ord: Number(l.ord) || 0, minSeconds: Number(l.minSeconds) || 0, questionIds: arr(l.questionIds),
  quizCount: Number(l.quizCount) || 0, quizPass: Number(l.quizPass) || 0
});
const normExam = (e: any): Exam => ({
  ...e, topics: arr(e.topics), questionIds: arr(e.questionIds), assigneeIds: arr(e.assigneeIds),
  settings: e.settings || {}, passScore: Number(e.passScore ?? 5), maxLeave: Number(e.maxLeave ?? 3),
  durationMin: Number(e.durationMin) || 30, questionCount: Number(e.questionCount) || 30,
  startAt: e.startAt ? Number(e.startAt) : null, endAt: e.endAt ? Number(e.endAt) : null
});

const select = async <T,>(table: string, build?: (q: any) => any): Promise<T[]> => {
  let q: any = getClient().from(table).select('*');
  if (build) q = build(q);
  const { data, error } = await q;
  if (error) { console.warn(`Chưa đọc được ${table} (chạy 08_hoc_tap_thi.sql):`, error.message); return []; }
  return (data as T[]) || [];
};

export const Learning = {
  available: () => MockDB.isCloudEnabled(),

  // ---------- Ngân hàng câu hỏi ----------
  listQuestions: async (): R<{ questions: QuizQuestion[] }> => {
    const r = await callRpc<{ questions: QuizQuestion[] }>('app_list_questions', { p_token: tok() });
    return { ...r, questions: arr<QuizQuestion>(r.questions).map(q => ({ ...q, options: arr<string>(q.options) })) };
  },
  importQuestions: (items: any[]) =>
    callRpc<{ inserted: number; updated: number; errors: { row: string; message: string }[] }>('app_import_questions', { p_token: tok(), p_items: items }),
  saveQuestion: (q: Partial<QuizQuestion>) => callRpc<{ question: QuizQuestion }>('app_save_question', { p_token: tok(), p_q: q }),
  deleteQuestions: (ids: string[]) => callRpc<{ deleted: number }>('app_delete_questions', { p_token: tok(), p_ids: ids }),

  // ---------- Khoá học ----------
  getCourses: async () => (await select<any>('learn_courses', q => q.order('createdAt', { ascending: false }))).map(normCourse),
  getLessons: async (courseIds?: string[]) =>
    (await select<any>('learn_lessons', q => (courseIds ? q.in('courseId', courseIds) : q).order('ord'))).map(normLesson),
  getProgress: async (opts: { userId?: string; courseId?: string }) =>
    select<LearnProgress>('learn_progress', q => {
      if (opts.userId) q = q.eq('userId', opts.userId);
      if (opts.courseId) q = q.eq('courseId', opts.courseId);
      return q;
    }),
  saveCourse: (c: Partial<LearnCourse>) => callRpc<{ course: LearnCourse }>('app_save_course', { p_token: tok(), p_c: c }),
  deleteCourse: (id: string) => callRpc('app_delete_course', { p_token: tok(), p_id: id }),
  saveLesson: (l: Partial<LearnLesson>) => callRpc<{ lesson: LearnLesson }>('app_save_lesson', { p_token: tok(), p_l: l }),
  deleteLesson: (id: string) => callRpc('app_delete_lesson', { p_token: tok(), p_id: id }),

  /** Tải video/PDF lên kho "hoc-tap" (cần vé do máy chủ cấp) → trả đường link công khai */
  uploadFile: async (file: File, onProgress?: (pct: number) => void): R<{ url?: string }> => {
    const t = await callRpc<{ ticket: string; bucket: string }>('app_learn_upload_ticket', { p_token: tok() });
    if (!t.ok) return t;
    const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/[^\w.\-]+/g, '_').slice(-80);
    const path = `${t.ticket}/${Date.now()}_${safe}`;
    onProgress?.(5);
    const { error } = await getClient().storage.from(t.bucket).upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) {
      const m = /bucket/i.test(error.message) ? 'Chưa có kho tệp "hoc-tap" trên Supabase (chạy lại 08_hoc_tap_thi.sql trên dự án có Storage).'
        : /size|large/i.test(error.message) ? 'Tệp quá lớn (tối đa 200 MB).' : error.message;
      return { ok: false, message: m };
    }
    onProgress?.(100);
    return { ok: true, url: getClient().storage.from(t.bucket).getPublicUrl(path).data.publicUrl };
  },

  // ---------- Học bài ----------
  beat: (lessonId: string, seconds: number, videoPct: number) =>
    callRpc<{ progress: LearnProgress; ready: boolean }>('app_learn_beat', { p_token: tok(), p_lesson_id: lessonId, p_seconds: Math.round(seconds), p_video_pct: Math.round(videoPct) }),
  lessonQuiz: (lessonId: string) =>
    callRpc<{ need: number; total: number; answers: Record<string, boolean>; completed: boolean; questions: ExamPaperQuestion[] }>('app_lesson_quiz', { p_token: tok(), p_lesson_id: lessonId }),
  lessonAnswer: (lessonId: string, questionId: string, choice: number) =>
    callRpc<{ correct: boolean; correctIndex: number; explanation?: string; source?: string; finished: boolean; passed: boolean; right: number; total: number; need: number; completed: boolean }>(
      'app_lesson_answer', { p_token: tok(), p_lesson_id: lessonId, p_question_id: questionId, p_choice: choice }),

  // ---------- Kỳ thi ----------
  getExams: async () => (await select<any>('exams', q => q.order('createdAt', { ascending: false }))).map(normExam),
  getEvents: async (examId: string) =>
    (await select<ExamEvent>('exam_events', q => q.eq('examId', examId).order('at', { ascending: false }).limit(300))).map(e => ({ ...e, at: Number(e.at) })),
  saveExam: async (e: Partial<Exam>) => {
    const r = await callRpc<{ exam: any; pool?: number }>('app_save_exam', { p_token: tok(), p_e: e });
    return { ...r, exam: r.exam ? normExam(r.exam) : undefined };
  },
  deleteExam: (id: string) => callRpc('app_delete_exam', { p_token: tok(), p_id: id }),
  setStatus: (id: string, status: 'OPEN' | 'CLOSED') => callRpc('app_exam_status', { p_token: tok(), p_id: id, p_status: status }),
  examKey: (id: string) => callRpc<{ secret: string; serverNow: number; stepMs: number }>('app_exam_key', { p_token: tok(), p_id: id }),
  start: (id: string, qr: string | null, deviceId: string, deviceLabel: string) =>
    callRpc<{ attempt: { status: string; startedAt: number; deadline: number; serverNow: number; leaveCount: number; maxLeave: number; total: number }; questions: ExamPaperQuestion[]; answers: Record<string, number> }>(
      'app_exam_start', { p_token: tok(), p_id: id, p_qr: qr, p_device_id: deviceId, p_device_label: deviceLabel }),
  answer: (id: string, questionId: string, choice: number | null) =>
    callRpc<{ serverNow: number; deadline: number }>('app_exam_answer', { p_token: tok(), p_id: id, p_question_id: questionId, p_choice: choice, p_device_id: getDeviceId() }),
  event: (id: string, kind: 'LEAVE' | 'PING', ms = 0) =>
    callRpc<{ submitted?: boolean; leaveCount?: number; maxLeave?: number; serverNow?: number; deadline?: number }>('app_exam_event', { p_token: tok(), p_id: id, p_kind: kind, p_ms: Math.round(ms), p_device_id: getDeviceId() }),
  submit: (id: string) =>
    callRpc<{ status: string; total: number; answered: number; score: number | null; correct: number | null; passed: boolean | null }>('app_exam_submit', { p_token: tok(), p_id: id, p_device_id: getDeviceId() }),
  my: async () => {
    const r = await callRpc<{ attempts: MyAttempt[]; serverNow: number }>('app_exam_my', { p_token: tok() });
    return { ...r, attempts: arr<MyAttempt>(r.attempts) };
  },
  review: (id: string) =>
    callRpc<{ score: number; correct: number; total: number; questions: ExamPaperQuestion[]; answers: Record<string, number>; keys: Record<string, number>; explanations: Record<string, string> }>(
      'app_exam_review', { p_token: tok(), p_id: id }),
  monitor: async (id: string) => {
    const r = await callRpc<{ attempts: MonitorRow[]; serverNow: number }>('app_exam_monitor', { p_token: tok(), p_id: id });
    return { ...r, attempts: arr<MonitorRow>(r.attempts) };
  },
  action: (id: string, userId: string | null, action: 'UNLOCK' | 'VOID' | 'RESET' | 'EXTRA' | 'SUBMIT', minutes = 0) =>
    callRpc<{ affected: number }>('app_exam_action', { p_token: tok(), p_id: id, p_user_id: userId, p_action: action, p_minutes: minutes }),
  results: async (id: string) => {
    const r = await callRpc<{ attempts: ResultRow[]; questions: Record<string, { text: string; topic?: string }> }>('app_exam_results', { p_token: tok(), p_id: id });
    return { ...r, attempts: arr<ResultRow>(r.attempts), questions: r.questions || {} };
  },
  publish: (id: string, published: boolean) => callRpc('app_exam_publish', { p_token: tok(), p_id: id, p_published: published })
};
