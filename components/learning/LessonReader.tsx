import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, Clock, FileText, Loader2, Lock, PlayCircle, RotateCcw, XCircle } from 'lucide-react';
import { Learning } from '../../services/learningService';
import { ExamPaperQuestion, LearnLesson, LearnProgress } from '../../types';
import { fmtDur, LETTERS } from '../../lib/exam';
import { btnPrimary, btnSecondary, Chip, LessonBody, ProgressBar } from './common';
import { VideoPlayer } from './VideoPlayer';
import { haptic, ResultMark } from '../UI';

const BEAT_MS = 15000;
const IDLE_MS = 60000;

interface Props {
  lesson: LearnLesson;
  chapterLabel?: string;
  progress?: LearnProgress;
  prev?: LearnLesson | null;
  next?: LearnLesson | null;
  nextLocked?: boolean;
  onBack: () => void;
  onOpen: (l: LearnLesson) => void;
  onProgress: (p: LearnProgress) => void;
}

/** Đọc bài: tính thời gian học thật (màn hình mở + có thao tác / video đang chạy), gửi máy chủ mỗi 15 giây */
export const LessonReader: React.FC<Props> = ({ lesson, chapterLabel, progress, prev, next, nextLocked, onBack, onOpen, onProgress }) => {
  const [prog, setProg] = useState<LearnProgress | undefined>(progress);
  const [pending, setPending] = useState(0);          // giây chưa gửi (hiển thị)
  const [videoPct, setVideoPct] = useState(progress?.videoPct || 0);
  const [quiz, setQuiz] = useState(false);
  const [msg, setMsg] = useState('');
  const pendingRef = useRef(0);
  const pctRef = useRef(progress?.videoPct || 0);
  const lastAct = useRef(Date.now());
  const playing = useRef(false);
  const sending = useRef(false);
  const onProgRef = useRef(onProgress); onProgRef.current = onProgress;

  const tracked = !!lesson.videoUrl && lesson.videoKind !== 'DRIVE';
  const seconds = (prog?.seconds || 0) + pending;
  const timeOk = seconds >= lesson.minSeconds;
  const videoOk = !tracked || Math.max(videoPct, prog?.videoPct || 0) >= 90;
  const ready = timeOk && videoOk;
  const done = !!prog?.completed;

  const send = useCallback(async () => {
    if (sending.current) return;
    const secs = pendingRef.current;
    if (secs <= 0 && pctRef.current <= (prog?.videoPct || 0)) return;
    sending.current = true;
    pendingRef.current = 0; setPending(0);
    const r = await Learning.beat(lesson.id, secs, pctRef.current);
    sending.current = false;
    if (r.ok && r.progress) { setProg(r.progress); onProgRef.current(r.progress); setMsg(''); }
    else if (!r.ok) { pendingRef.current += secs; setPending(pendingRef.current); setMsg(r.message || 'Mất kết nối, thời gian học sẽ được gửi lại.'); }
  }, [lesson.id, prog?.videoPct]);
  const sendRef = useRef(send); sendRef.current = send;

  useEffect(() => {
    const act = () => { lastAct.current = Date.now(); };
    const evs = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll', 'mousemove'];
    evs.forEach(e => window.addEventListener(e, act, { passive: true, capture: true }));
    const tick = window.setInterval(() => {
      const active = document.visibilityState === 'visible' && document.hasFocus?.() !== false
        && (playing.current || Date.now() - lastAct.current < IDLE_MS);
      if (active) { pendingRef.current += 1; setPending(pendingRef.current); }
    }, 1000);
    const beat = window.setInterval(() => sendRef.current(), BEAT_MS);
    const vis = () => { if (document.visibilityState === 'hidden') sendRef.current(); };
    document.addEventListener('visibilitychange', vis);
    return () => {
      evs.forEach(e => window.removeEventListener(e, act, { capture: true } as any));
      window.clearInterval(tick); window.clearInterval(beat);
      document.removeEventListener('visibilitychange', vis);
      sendRef.current();
    };
  }, [lesson.id]);

  const onVideoPct = (p: number) => {
    const crossed = pctRef.current < 90 && p >= 90;
    pctRef.current = p; setVideoPct(p);
    if (crossed || p >= 100) sendRef.current();
  };

  if (quiz) {
    return <LessonQuiz lesson={lesson} onBack={() => setQuiz(false)} onCompleted={async () => { await send(); const r = await Learning.beat(lesson.id, 0, pctRef.current); if (r.ok && r.progress) { setProg(r.progress); onProgress(r.progress); } }}
      onNext={next && !nextLocked ? () => onOpen(next) : undefined} done={done} />;
  }

  const needLeft = Math.max(0, lesson.minSeconds - seconds);
  return (
    <div className="max-w-3xl mx-auto" data-testid="lesson-reader">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-stone-100" aria-label="Quay lại"><ChevronLeft className="w-5 h-5" /></button>
        <div className="min-w-0">
          <div className="font-bold text-stone-900 leading-tight">{lesson.title}</div>
          {chapterLabel && <div className="text-[12px] text-stone-500">{chapterLabel}</div>}
        </div>
        {done && <Chip tone="green" className="ml-auto">✓ Đã hoàn thành</Chip>}
      </div>
      <ProgressBar value={lesson.minSeconds ? (seconds * 100) / lesson.minSeconds : 100} className="h-1 mb-4" />

      {lesson.videoUrl && lesson.videoKind && (
        <div className="mb-4">
          <VideoPlayer url={lesson.videoUrl} kind={lesson.videoKind} initialPct={prog?.videoPct || 0} onProgress={onVideoPct} onPlaying={p => { playing.current = p; if (p) lastAct.current = Date.now(); }} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-stone-200 p-4 md:p-6 select-none" onCopy={e => e.preventDefault()}>
        <LessonBody text={lesson.body} />
        {lesson.pdfUrl && (
          <div className="mt-4">
            <a href={lesson.pdfUrl} target="_blank" rel="noreferrer" className={btnSecondary} data-testid="lesson-pdf"><FileText className="w-4 h-4" />Mở tài liệu PDF</a>
            <iframe title="Tài liệu" src={lesson.pdfUrl} className="hidden md:block w-full mt-3 rounded-lg border border-stone-200" style={{ height: '70vh' }} />
          </div>
        )}
        {!lesson.body && !lesson.pdfUrl && !lesson.videoUrl && <p className="text-stone-500 text-sm">Bài học chưa có nội dung.</p>}
      </div>

      {/* Thanh dưới: thời gian học + câu hỏi ôn */}
      <div className="sticky bottom-0 md:bottom-2 mt-4 -mx-3 md:mx-0 bg-white/95 backdrop-blur border-t md:border md:rounded-xl border-stone-200 px-3 md:px-4 py-3 z-10"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center gap-3 text-[13px] text-stone-600 mb-2">
          <span className="inline-flex items-center gap-1" data-testid="study-time"><Clock className="w-4 h-4" />Đã học <b className="text-stone-900 tabular">{fmtDur(seconds)}</b>{lesson.minSeconds > 0 && <> / tối thiểu {fmtDur(lesson.minSeconds)}</>}</span>
          {tracked && <span className="ml-auto" data-testid="video-pct">Đã xem <b className="text-stone-900">{Math.max(videoPct, prog?.videoPct || 0)}%</b> video</span>}
        </div>
        <div className="flex gap-2">
          <button className={btnSecondary} disabled={!prev} onClick={() => prev && onOpen(prev)}>‹ Bài trước</button>
          {lesson.quizCount > 0 ? (
            <button className={`${btnPrimary} flex-1`} disabled={!ready} onClick={async () => { await send(); setQuiz(true); }} data-testid="btn-lesson-quiz">
              {done ? 'Làm lại câu hỏi ôn' : 'Làm câu hỏi ôn'} ›
            </button>
          ) : (
            <button className={`${btnPrimary} flex-1`} disabled={!done || !next || nextLocked} onClick={() => next && onOpen(next)} data-testid="btn-next-lesson">
              {done ? (next ? 'Bài tiếp theo ›' : 'Đã học xong') : 'Học đủ để hoàn thành'}
            </button>
          )}
        </div>
        {!ready && (
          <div className="text-[12px] text-stone-500 text-center mt-1.5">
            {!timeOk && <>Còn {fmtDur(needLeft)} học tối thiểu</>}{!timeOk && !videoOk && ' · '}{!videoOk && 'cần xem hết video'}
            {' · '}để máy treo không được tính giờ
          </div>
        )}
        {msg && <div className="text-[12px] text-red-600 text-center mt-1">{msg}</div>}
        {lesson.quizCount > 0 && done && next && !nextLocked && <button className="w-full text-center text-sm font-semibold text-brand-700 mt-2" onClick={() => onOpen(next)}>Sang bài tiếp theo ›</button>}
      </div>
    </div>
  );
};

/** Câu hỏi ôn cuối bài: trả lời từng câu, biết ngay đúng/sai và giải thích */
const LessonQuiz: React.FC<{ lesson: LearnLesson; done: boolean; onBack: () => void; onCompleted: () => void; onNext?: () => void }> = ({ lesson, done, onBack, onCompleted, onNext }) => {
  const [data, setData] = useState<{ questions: ExamPaperQuestion[]; need: number; total: number } | null>(null);
  const [idx, setIdx] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [res, setRes] = useState<{ correct: boolean; correctIndex: number; explanation?: string; source?: string; finished: boolean; passed: boolean; right: number; total: number; need: number } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ passed: boolean; right: number; total: number; need: number } | null>(null);

  const load = async () => {
    setData(null); setErr(''); setRes(null); setPick(null); setSummary(null);
    const r = await Learning.lessonQuiz(lesson.id);
    if (!r.ok) { setErr(r.message || 'Không tải được câu hỏi.'); return; }
    const answered = Object.keys(r.answers || {});
    const first = r.questions.findIndex(q => !answered.includes(q.id));
    setData({ questions: r.questions, need: r.need, total: r.total });
    setIdx(first < 0 ? 0 : first);
  };
  useEffect(() => { load(); }, [lesson.id]);

  const choose = async (i: number) => {
    if (!data || res || busy) return;
    const q = data.questions[idx];
    setPick(i); setBusy(true);
    const r = await Learning.lessonAnswer(lesson.id, q.id, i);
    setBusy(false);
    if (!r.ok) { setErr(r.message || 'Không gửi được câu trả lời.'); setPick(null); return; }
    haptic(r.correct ? 30 : [40, 60, 40]);
    setRes(r);
    if (r.finished && r.passed) onCompleted();
  };
  const nextQ = () => {
    if (!data || !res) return;
    if (res.finished) { setSummary({ passed: res.passed, right: res.right, total: res.total, need: res.need }); return; }
    setIdx(i => i + 1); setPick(null); setRes(null);
  };

  return (
    <div className="max-w-2xl mx-auto" data-testid="lesson-quiz">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-stone-100" aria-label="Quay lại bài học"><ChevronLeft className="w-5 h-5" /></button>
        <div>
          <div className="font-bold text-stone-900">Ôn tập: {lesson.title}</div>
          {data && !summary && <div className="text-[12px] text-stone-500">Câu {idx + 1}/{data.total} · cần đúng {data.need}/{data.total} để hoàn thành bài</div>}
        </div>
      </div>
      {err && <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2 mb-3">{err}</div>}
      {!data && !err && <div className="flex items-center gap-2 text-stone-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Đang tải câu hỏi...</div>}

      {summary ? (
        <div className="bg-white rounded-xl border border-stone-200 p-6 text-center" data-testid="quiz-summary" data-passed={summary.passed ? '1' : '0'}>
          <div className="flex justify-center"><ResultMark ok={summary.passed} /></div>
          <div className="mt-3 text-xl font-bold">{summary.passed ? 'Hoàn thành bài học' : 'Chưa đạt'}</div>
          <p className="text-stone-600 mt-1">Đúng {summary.right}/{summary.total} câu (cần {summary.need}).</p>
          {!summary.passed && <p className="text-stone-500 text-sm mt-1">Xem lại bài rồi làm lại — mỗi lần câu hỏi được đổi khác.</p>}
          <div className="flex gap-2 justify-center mt-5">
            {summary.passed
              ? <>{onNext && <button className={btnPrimary} onClick={onNext} data-testid="quiz-next-lesson">Bài tiếp theo ›</button>}<button className={btnSecondary} onClick={onBack}>Về bài học</button></>
              : <><button className={btnSecondary} onClick={onBack}>Xem lại bài</button><button className={btnPrimary} onClick={load} data-testid="quiz-retry"><RotateCcw className="w-4 h-4" />Làm lại</button></>}
          </div>
        </div>
      ) : data && data.questions[idx] && (
        <div>
          <div className="text-lg font-semibold text-stone-900 leading-snug mb-4" data-testid="quiz-question">{data.questions[idx].text}</div>
          <div className="space-y-2.5">
            {data.questions[idx].options.map((o, k) => {
              const isPick = pick === o.i;
              const isRight = res && res.correctIndex === o.i;
              const cls = res
                ? isRight ? 'border-emerald-500 bg-emerald-50' : isPick ? 'border-red-400 bg-red-50' : 'border-stone-200 bg-white opacity-70'
                : isPick ? 'border-brand-700 bg-brand-50' : 'border-stone-200 bg-white hover:border-stone-400';
              return (
                <button key={o.i} disabled={!!res || busy} onClick={() => choose(o.i)} data-testid="quiz-option" data-i={o.i}
                  className={`w-full text-left flex items-start gap-3 rounded-xl border-2 px-3.5 py-3 transition-colors ${cls}`}>
                  <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ${res && isRight ? 'bg-emerald-600 text-white' : res && isPick ? 'bg-red-600 text-white' : 'bg-stone-100 text-stone-700'}`}>{LETTERS[k]}</span>
                  <span className="pt-0.5 text-[15px] text-stone-800">{o.t}</span>
                  {res && isRight && <CheckCircle2 className="w-5 h-5 text-emerald-600 ml-auto shrink-0 mt-0.5" />}
                  {res && isPick && !isRight && <XCircle className="w-5 h-5 text-red-600 ml-auto shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>
          {res && (
            <div className={`mt-4 rounded-xl border-l-4 px-4 py-3 ${res.correct ? 'border-emerald-500 bg-emerald-50/60' : 'border-red-400 bg-red-50/60'}`} data-testid="quiz-feedback" data-correct={res.correct ? '1' : '0'}>
              <div className={`font-bold ${res.correct ? 'text-emerald-800' : 'text-red-700'}`}>{res.correct ? 'Chính xác!' : `Chưa đúng. Đáp án đúng: ${LETTERS[data.questions[idx].options.findIndex(o => o.i === res.correctIndex)]}`}</div>
              {res.explanation && <p className="text-sm text-stone-700 mt-1">{res.explanation}</p>}
              {res.source && <p className="text-[12px] text-stone-500 mt-1">Nguồn: {res.source}</p>}
            </div>
          )}
          {res && <button className={`${btnPrimary} w-full mt-4`} onClick={nextQ} data-testid="quiz-continue">{res.finished ? 'Xem kết quả' : 'Câu tiếp theo ›'}</button>}
          {done && <p className="text-[12px] text-stone-500 text-center mt-3">Bài đã hoàn thành trước đó — làm lại để ôn, không ảnh hưởng kết quả.</p>}
        </div>
      )}
    </div>
  );
};

export const LessonStatusIcon: React.FC<{ state: 'done' | 'doing' | 'todo' | 'locked' }> = ({ state }) => (
  state === 'done' ? <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><CheckCircle2 className="w-5 h-5" /></span>
    : state === 'doing' ? <span className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0"><PlayCircle className="w-5 h-5" /></span>
      : state === 'locked' ? <span className="w-8 h-8 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center shrink-0"><Lock className="w-4 h-4" /></span>
        : <span className="w-8 h-8 rounded-full border-2 border-stone-300 shrink-0" />
);
