import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Link2, Loader2, Pencil, Plus, Search, Trash2, Upload, Users, Video, X } from 'lucide-react';
import { Learning } from '../../services/learningService';
import { LearnCourse, LearnLesson, QuizQuestion, User, UserRole, VideoKind } from '../../types';
import { guessVideoKind, youtubeId } from '../../lib/exam';
import { ParticipantPicker } from '../ParticipantPicker';
import { btnPrimary, btnSecondary, Chip, fromLocalInput, inputCls, labelCls, LessonBody, Sheet } from './common';
import { lessonsOf } from './LearnTab';
import { isSelectingText, makeQuestionMatcher, useRangeToggle } from '../../lib/questionPick';
import { TickBox } from './QuestionBank';

interface Props {
  open: boolean;
  course: LearnCourse | null;           // null = tạo mới
  lessons: LearnLesson[];
  users: User[];
  me: User;
  questions: QuizQuestion[];
  onClose: () => void;
  onChanged: () => void;
}

const dayInput = (ms?: number | null) => {
  if (!ms) return '';
  const d = new Date(Number(ms)); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Soạn khoá học: thông tin khoá + danh sách bài (thêm/sửa/xoá/đổi thứ tự) */
export const CourseEditor: React.FC<Props> = ({ open, course, lessons, users, me, questions, onClose, onChanged }) => {
  const [c, setC] = useState<Partial<LearnCourse>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(false);
  const [editLesson, setEditLesson] = useState<Partial<LearnLesson> | null>(null);
  const people = useMemo(() => users.filter(u => u.role !== UserRole.ADMIN), [users]);

  useEffect(() => {
    if (open) {
      setC(course ? { ...course } : { title: '', description: '', assigneeIds: [], status: 'DRAFT', sequential: true, deadline: null });
      setMsg(''); setEditLesson(null);
    }
  }, [open, course?.id]);

  const ls = c.id ? lessonsOf(lessons, c.id) : [];

  const saveCourse = async (extra: Partial<LearnCourse> = {}) => {
    const body = { ...c, ...extra };
    if (!body.title?.trim()) { setMsg('Vui lòng nhập tên khoá học.'); return null; }
    setBusy(true);
    const r = await Learning.saveCourse(body);
    setBusy(false);
    if (!r.ok || !r.course) { setMsg(r.message || 'Không lưu được.'); return null; }
    setC({ ...r.course, assigneeIds: r.course.assigneeIds || [] });
    setMsg(extra.status === 'PUBLISHED' ? 'Đã giao khoá học cho cán bộ.' : 'Đã lưu.');
    onChanged();
    return r.course;
  };

  const addLesson = async () => {
    let id = c.id;
    if (!id) { const saved = await saveCourse(); if (!saved) return; id = saved.id; }
    const last = ls[ls.length - 1];
    setEditLesson({ courseId: id, chapter: last?.chapter || '', ord: (last?.ord || 0) + 1, title: '', body: '', minSeconds: 300, questionIds: [], quizCount: 3, quizPass: 2 });
  };

  const move = async (l: LearnLesson, dir: -1 | 1) => {
    const i = ls.indexOf(l); const j = i + dir;
    if (j < 0 || j >= ls.length) return;
    const other = ls[j];
    // Đổi thứ tự 2 bài (ghi lại số thứ tự liên tục)
    const order = [...ls]; order[i] = other; order[j] = l;
    setBusy(true);
    for (let k = 0; k < order.length; k++) if (order[k].ord !== k + 1) await Learning.saveLesson({ ...order[k], ord: k + 1 });
    setBusy(false); onChanged();
  };

  const remove = async (l: LearnLesson) => {
    if (!window.confirm(`Xoá bài "${l.title}"? Tiến độ học bài này của cán bộ cũng bị xoá.`)) return;
    const r = await Learning.deleteLesson(l.id);
    if (!r.ok) setMsg(r.message || 'Không xoá được.'); else onChanged();
  };

  const removeCourse = async () => {
    if (!c.id || !window.confirm(`Xoá khoá học "${c.title}" cùng toàn bộ bài và tiến độ học?`)) return;
    const r = await Learning.deleteCourse(c.id);
    if (!r.ok) { setMsg(r.message || 'Không xoá được.'); return; }
    onChanged(); onClose();
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} wide title={c.id ? 'Soạn khoá học' : 'Tạo khoá học'} testId="course-editor"
        footer={<>
          {c.id && <button className={`${btnSecondary} mr-auto text-red-700`} onClick={removeCourse}><Trash2 className="w-4 h-4" />Xoá khoá</button>}
          <button className={btnSecondary} onClick={() => saveCourse()} disabled={busy} data-testid="btn-save-course">Lưu</button>
          {c.status !== 'PUBLISHED'
            ? <button className={btnPrimary} onClick={() => saveCourse({ status: 'PUBLISHED' })} disabled={busy || !ls.length} data-testid="btn-publish-course">Giao cho cán bộ</button>
            : <button className={btnSecondary} onClick={() => saveCourse({ status: 'DRAFT' })} disabled={busy}>Thu hồi về nháp</button>}
        </>}>
        <div className="grid md:grid-cols-[1fr_300px] gap-5">
          <div className="space-y-3">
            <div><label className={labelCls}>Tên khoá học</label>
              <input className={inputCls} value={c.title || ''} onChange={e => setC({ ...c, title: e.target.value })} placeholder="VD: Kiến thức pháp luật Quý IV/2026" data-testid="course-title" /></div>
            <div><label className={labelCls}>Mô tả ngắn</label>
              <input className={inputCls} value={c.description || ''} onChange={e => setC({ ...c, description: e.target.value })} placeholder="Không bắt buộc" /></div>
            <div className="flex items-center justify-between mt-4">
              <div className="font-semibold text-stone-900">Bài học ({ls.length})</div>
              <button className={btnSecondary + ' h-9'} onClick={addLesson} disabled={busy} data-testid="btn-add-lesson"><Plus className="w-4 h-4" />Thêm bài</button>
            </div>
            {ls.length === 0 && <div className="text-sm text-stone-500 rounded-lg border border-dashed border-stone-300 p-4 text-center">Chưa có bài. Bấm "Thêm bài" — dán văn bản, tải PDF/video lên hoặc dán link YouTube/Google Drive.</div>}
            <div className="divide-y divide-stone-100 rounded-lg border border-stone-200">
              {ls.map((l, i) => (
                <div key={l.id} className="flex items-center gap-2 px-3 py-2.5" data-testid="editor-lesson-row">
                  <span className="w-6 text-center text-[12px] font-bold text-stone-400 tabular">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[14px] text-stone-900 truncate">{l.title}</div>
                    <div className="text-[12px] text-stone-500 flex gap-2 flex-wrap">
                      {l.chapter && <span>{l.chapter}</span>}
                      {l.videoUrl && <span><Video className="w-3 h-3 inline" /> {l.videoKind === 'YOUTUBE' ? 'YouTube' : l.videoKind === 'DRIVE' ? 'Drive' : 'Video'}</span>}
                      {l.pdfUrl && <span><FileText className="w-3 h-3 inline" /> PDF</span>}
                      <span>{Math.round(l.minSeconds / 60)} phút</span>
                      <span>{l.quizCount ? `ôn ${l.quizCount} câu (đạt ${l.quizPass})` : 'không có câu ôn'}</span>
                    </div>
                  </div>
                  <button className="p-1.5 rounded hover:bg-stone-100 disabled:opacity-30" disabled={i === 0 || busy} onClick={() => move(l, -1)} aria-label="Lên"><ArrowUp className="w-4 h-4" /></button>
                  <button className="p-1.5 rounded hover:bg-stone-100 disabled:opacity-30" disabled={i === ls.length - 1 || busy} onClick={() => move(l, 1)} aria-label="Xuống"><ArrowDown className="w-4 h-4" /></button>
                  <button className="p-1.5 rounded hover:bg-stone-100" onClick={() => setEditLesson({ ...l })} aria-label="Sửa"><Pencil className="w-4 h-4" /></button>
                  <button className="p-1.5 rounded hover:bg-red-50 text-red-600" onClick={() => remove(l)} aria-label="Xoá"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div><label className={labelCls}>Hạn hoàn thành</label>
              <input type="date" className={inputCls} value={dayInput(c.deadline)} onChange={e => setC({ ...c, deadline: e.target.value ? new Date(e.target.value + 'T23:59:59').getTime() : null })} /></div>
            <div><label className={labelCls}>Giao cho</label>
              <button className={`${btnSecondary} w-full justify-start`} onClick={() => setPick(true)} data-testid="course-assignees">
                <Users className="w-4 h-4" />{c.assigneeIds?.length ? `${c.assigneeIds.length} cán bộ` : 'Toàn đơn vị'}
              </button>
              {!!c.assigneeIds?.length && <button className="text-[12px] text-brand-700 font-semibold mt-1" onClick={() => setC({ ...c, assigneeIds: [] })}>Giao cho toàn đơn vị</button>}
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="mt-0.5 w-4 h-4 accent-brand-700" checked={c.sequential !== false} onChange={e => setC({ ...c, sequential: e.target.checked })} />
              <span><b>Học theo thứ tự</b><br /><span className="text-stone-500 text-[13px]">Xong bài trước mới mở bài sau</span></span>
            </label>
            <div className="text-[13px] rounded-lg bg-stone-50 border border-stone-200 p-3 text-stone-600">
              Trạng thái: {c.status === 'PUBLISHED' ? <Chip tone="green">Đã giao</Chip> : <Chip>Bản nháp</Chip>}
              <p className="mt-2">Bản nháp chỉ người soạn bài thấy (có thể học thử). Bấm <b>Giao cho cán bộ</b> khi đã soạn xong.</p>
            </div>
            {msg && <div className="text-sm text-stone-700 bg-amber-50 rounded-lg px-3 py-2" data-testid="course-msg">{msg}</div>}
          </div>
        </div>
      </Sheet>
      <ParticipantPicker open={pick} users={people} selected={c.assigneeIds || []} currentUserId={me.id}
        onClose={() => setPick(false)} onDone={ids => { setC({ ...c, assigneeIds: ids }); setPick(false); }} />
      <LessonEditor lesson={editLesson} questions={questions} onClose={() => setEditLesson(null)} onSaved={() => { setEditLesson(null); onChanged(); }} />
    </>
  );
};

/** Soạn 1 bài học */
const LessonEditor: React.FC<{ lesson: Partial<LearnLesson> | null; questions: QuizQuestion[]; onClose: () => void; onSaved: () => void }> = ({ lesson, questions, onClose, onSaved }) => {
  const [l, setL] = useState<Partial<LearnLesson>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [upl, setUpl] = useState<'' | 'video' | 'pdf'>('');
  const [preview, setPreview] = useState(false);
  const [qSearch, setQSearch] = useState('');
  const [topic, setTopic] = useState('');
  const [onlyChosen, setOnlyChosen] = useState(false);
  const [qLimit, setQLimit] = useState(100);
  const vRef = useRef<HTMLInputElement>(null);
  const pRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (lesson) { setL({ ...lesson }); setMsg(''); setPreview(false); setQSearch(''); setTopic(''); setOnlyChosen(false); setQLimit(100); } }, [lesson]);

  const topics = useMemo(() => [...new Set(questions.map(q => q.topic || '').filter(Boolean))].sort(), [questions]);
  const chosen = useMemo(() => new Set(l.questionIds || []), [l.questionIds]);
  const shown = useMemo(() => {
    const match = makeQuestionMatcher(qSearch);
    return questions.filter(q => (!topic || q.topic === topic) && (!onlyChosen || chosen.has(q.id)) && match(q));
  }, [questions, topic, onlyChosen, chosen, qSearch]);
  const shownIds = useMemo(() => shown.map(q => q.id), [shown]);
  const shownChosen = shownIds.filter(id => chosen.has(id)).length;
  const allState: 'on' | 'off' | 'some' = !shownChosen ? 'off' : shownChosen === shownIds.length ? 'on' : 'some';

  const upload = async (f: File, kind: 'video' | 'pdf') => {
    setUpl(kind); setMsg('');
    const r = await Learning.uploadFile(f);
    setUpl('');
    if (!r.ok || !r.url) { setMsg(r.message || 'Không tải lên được.'); return; }
    if (kind === 'video') setL(x => ({ ...x, videoUrl: r.url, videoKind: 'FILE' }));
    else setL(x => ({ ...x, pdfUrl: r.url }));
  };

  const save = async () => {
    if (!l.title?.trim()) { setMsg('Vui lòng nhập tên bài.'); return; }
    const vk: VideoKind | null = l.videoUrl ? (l.videoKind === 'FILE' && !youtubeId(l.videoUrl) && !/drive\.google/.test(l.videoUrl) ? 'FILE' : guessVideoKind(l.videoUrl)) : null;
    setBusy(true);
    const r = await Learning.saveLesson({ ...l, videoKind: vk });
    setBusy(false);
    if (!r.ok) { setMsg(r.message || 'Không lưu được.'); return; }
    onSaved();
  };

  /** Chọn/bỏ nhiều câu; giữ số câu mỗi lượt hợp lệ (mặc định 3, cần đúng 2/3) */
  const applyQ = useCallback((ids: string[], on: boolean) => setL(prev => {
    const s = new Set(prev.questionIds || []);
    ids.forEach(id => on ? s.add(id) : s.delete(id));
    const all = [...s];
    const n = Math.min(Math.max(prev.quizCount || 0, 3), all.length);
    const pass = prev.quizCount === n && prev.quizPass != null && prev.quizPass <= n ? prev.quizPass : Math.ceil(n * 2 / 3);
    return { ...prev, questionIds: all, quizCount: n, quizPass: pass };
  }), []);
  const toggleQ = useRangeToggle(shownIds, chosen, applyQ);

  const vkind = l.videoUrl ? (youtubeId(l.videoUrl) ? 'YouTube' : /drive\.google/.test(l.videoUrl) ? 'Google Drive (không đo được % đã xem)' : 'Tệp video') : '';

  return (
    <Sheet open={!!lesson} onClose={onClose} wide title={l.id ? 'Sửa bài học' : 'Thêm bài học'} testId="lesson-editor"
      footer={<><button className={btnSecondary} onClick={() => setPreview(p => !p)}>{preview ? 'Soạn tiếp' : 'Xem trước'}</button>
        <button className={btnPrimary} onClick={save} disabled={busy || !!upl} data-testid="btn-save-lesson">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Lưu bài</button></>}>
      {preview ? (
        <div className="max-w-2xl"><div className="text-lg font-bold mb-2">{l.title}</div><LessonBody text={l.body} /></div>
      ) : (
        <div className="grid md:grid-cols-[1fr_340px] gap-5">
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_140px] gap-2">
              <div><label className={labelCls}>Tên bài</label><input className={inputCls} value={l.title || ''} onChange={e => setL({ ...l, title: e.target.value })} data-testid="lesson-title" placeholder="VD: 1.1 Phạm vi, đối tượng áp dụng" /></div>
              <div><label className={labelCls}>Chương</label><input className={inputCls} value={l.chapter || ''} onChange={e => setL({ ...l, chapter: e.target.value })} placeholder="VD: Chương 1" /></div>
            </div>
            <div>
              <label className={labelCls}>Nội dung bài (dán văn bản)</label>
              <textarea className={`${inputCls} h-64 py-2 leading-relaxed`} value={l.body || ''} onChange={e => setL({ ...l, body: e.target.value })} data-testid="lesson-body"
                placeholder={'Dán nội dung bài học vào đây.\n\n# Tiêu đề lớn   ## Tiêu đề nhỏ\n- gạch đầu dòng   **in đậm**\nGhi nhớ: ... (hiện khung vàng, nên đưa vào câu hỏi ôn)'} />
            </div>
            <div>
              <label className={labelCls}>Video (không bắt buộc)</label>
              <div className="flex gap-2">
                <div className="relative flex-1"><Link2 className="w-4 h-4 absolute left-3 top-3.5 text-stone-400" />
                  <input className={`${inputCls} pl-9`} value={l.videoUrl || ''} onChange={e => setL({ ...l, videoUrl: e.target.value, videoKind: guessVideoKind(e.target.value) })}
                    placeholder="Dán link YouTube / Google Drive" data-testid="lesson-video-url" /></div>
                <button className={btnSecondary} onClick={() => vRef.current?.click()} disabled={!!upl}>{upl === 'video' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Tải lên</button>
                <input ref={vRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, 'video'); e.target.value = ''; }} />
              </div>
              {vkind && <div className="text-[12px] text-stone-500 mt-1">Loại: {vkind}{l.videoUrl && <button className="ml-2 text-red-600 font-semibold" onClick={() => setL({ ...l, videoUrl: null, videoKind: null })}>Bỏ video</button>}</div>}
              <p className="text-[12px] text-stone-500 mt-1">YouTube: đặt chế độ <b>Không công khai</b>. Nội dung nội bộ: tải tệp lên kho của app (tối đa 200 MB, nên nén 720p).</p>
            </div>
            <div>
              <label className={labelCls}>Tài liệu PDF (không bắt buộc)</label>
              <div className="flex gap-2">
                <input className={inputCls} value={l.pdfUrl || ''} onChange={e => setL({ ...l, pdfUrl: e.target.value })} placeholder="Dán link PDF hoặc tải lên" />
                <button className={btnSecondary} onClick={() => pRef.current?.click()} disabled={!!upl}>{upl === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Tải lên</button>
                <input ref={pRef} type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, 'pdf'); e.target.value = ''; }} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div><label className={labelCls}>Thời gian học tối thiểu (phút)</label>
              <input type="number" min={0} max={240} className={inputCls} value={Math.round((l.minSeconds || 0) / 60)} onChange={e => setL({ ...l, minSeconds: Math.max(0, Number(e.target.value) || 0) * 60 })} data-testid="lesson-min" />
              <p className="text-[12px] text-stone-500 mt-1">Chỉ tính khi đang mở bài và có thao tác; để máy treo không tính.</p></div>
            <div className="rounded-lg border border-stone-200 p-3">
              <div className="font-semibold text-sm">Câu hỏi ôn cuối bài <span className="text-stone-500 font-normal">({chosen.size} câu đã chọn)</span></div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div><label className="text-[12px] text-stone-600">Mỗi lượt hỏi</label><input type="number" min={0} max={chosen.size} className={inputCls + ' h-9'} value={l.quizCount ?? 0} onChange={e => { const n = Math.max(0, Math.min(chosen.size, Number(e.target.value) || 0)); setL({ ...l, quizCount: n, quizPass: Math.ceil(n * 2 / 3) }); }} data-testid="lesson-quiz-count" /></div>
                <div><label className="text-[12px] text-stone-600">Cần đúng</label><input type="number" min={0} max={l.quizCount ?? 0} className={inputCls + ' h-9'} value={l.quizPass ?? 0} onChange={e => setL({ ...l, quizPass: Math.max(0, Math.min(l.quizCount ?? 0, Number(e.target.value) || 0)) })} /></div>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2 mt-2">
                <select className={inputCls + ' h-10'} value={topic} onChange={e => { setTopic(e.target.value); setQLimit(100); }}><option value="">Mọi chủ đề ({questions.length})</option>{topics.map(t => <option key={t}>{t}</option>)}</select>
                <button className={`h-10 px-3 rounded-lg border text-[13px] font-semibold ${onlyChosen ? 'border-brand-700 bg-brand-50 text-brand-700' : 'border-stone-300 bg-white text-stone-700'}`} onClick={() => setOnlyChosen(v => !v)} disabled={!chosen.size && !onlyChosen}>Đã chọn</button>
              </div>
              <div className="relative mt-2"><Search className="w-4 h-4 absolute left-2.5 top-3 text-stone-400" />
                <input className={inputCls + ' h-10 pl-8 pr-8'} value={qSearch} onChange={e => { setQSearch(e.target.value); setQLimit(100); }} placeholder="Tìm câu hỏi (không cần dấu)" data-testid="lesson-q-search" />
                {qSearch && <button className="absolute right-1.5 top-1.5 p-1.5 rounded hover:bg-stone-100" onClick={() => setQSearch('')} aria-label="Xoá tìm kiếm"><X className="w-4 h-4 text-stone-500" /></button>}
              </div>
              {questions.length > 0 && (
                <div className="flex items-center gap-1 mt-2 flex-wrap">
                  <button className="inline-flex items-center gap-2 h-9 pl-1 pr-2.5 rounded-lg hover:bg-stone-100 text-[13px] font-semibold text-stone-800 disabled:opacity-40" onClick={() => applyQ(shownIds, allState !== 'on')} disabled={!shownIds.length} data-testid="lesson-q-all">
                    <TickBox state={allState} className="w-5 h-5" />{allState === 'on' ? `Bỏ chọn ${shownIds.length} câu` : `Chọn tất cả ${shownIds.length} câu`}
                  </button>
                  {chosen.size > 0 && <button className="ml-auto h-9 px-2.5 rounded-lg text-[13px] font-semibold text-red-700 hover:bg-red-50" onClick={() => { applyQ([...chosen], false); setOnlyChosen(false); }}>Bỏ chọn hết</button>}
                </div>
              )}
              <div className="mt-1 max-h-80 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded-lg">
                {questions.length === 0 && <div className="p-3 text-[13px] text-stone-500">Ngân hàng chưa có câu hỏi. Vào tab "Ngân hàng câu hỏi" để nhập từ Excel.</div>}
                {questions.length > 0 && !shown.length && <div className="p-3 text-[13px] text-stone-500">Không có câu nào khớp.</div>}
                {shown.slice(0, qLimit).map(q => {
                  const on = chosen.has(q.id);
                  return (
                    <div key={q.id} role="checkbox" aria-checked={on} tabIndex={0} data-testid="lesson-q-option"
                      onMouseDown={e => { if (e.shiftKey) e.preventDefault(); }}
                      onClick={e => { if (!isSelectingText()) toggleQ(q.id, e); }}
                      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleQ(q.id, e); } }}
                      className={`flex gap-2.5 px-2.5 py-2.5 text-[13px] cursor-pointer outline-none focus-visible:bg-stone-100 ${on ? 'bg-brand-50' : 'hover:bg-stone-50'}`}>
                      <TickBox state={on ? 'on' : 'off'} className="w-5 h-5" />
                      <span className="min-w-0"><span className="text-stone-400">{q.topic ? `[${q.topic}] ` : ''}</span>{q.text}</span>
                    </div>
                  );
                })}
                {shown.length > qLimit && <button className="w-full py-2.5 text-[13px] font-semibold text-brand-700 hover:bg-stone-50" onClick={() => setQLimit(n => n + 200)}>Xem thêm ({shown.length - qLimit} câu)</button>}
              </div>
              <p className="text-[11px] text-stone-500 mt-1.5">Bấm vào dòng để chọn. Giữ Shift khi bấm để chọn cả đoạn.</p>
            </div>
            {msg && <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{msg}</div>}
          </div>
        </div>
      )}
    </Sheet>
  );
};
