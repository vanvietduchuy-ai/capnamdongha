import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { Learning } from '../../services/learningService';
import { QuizQuestion } from '../../types';
import { exportQuestions, LETTERS, ParseResult, readQuestionFile } from '../../lib/exam';
import { btnPrimary, btnSecondary, card, Chip, Empty, inputCls, labelCls, Sheet } from './common';

interface Props { questions: QuizQuestion[]; onChanged: () => void; }

/** Ngân hàng câu hỏi: nhập từ Excel theo mẫu, sửa từng câu, xuất Excel */
export const QuestionBank: React.FC<Props> = ({ questions, onChanged }) => {
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState('');
  const [edit, setEdit] = useState<Partial<QuizQuestion> | null>(null);
  const [limit, setLimit] = useState(50);
  const fileRef = useRef<HTMLInputElement>(null);

  const topics = useMemo(() => {
    const m = new Map<string, number>();
    questions.forEach(x => m.set(x.topic || '(Chưa phân chủ đề)', (m.get(x.topic || '(Chưa phân chủ đề)') || 0) + 1));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  }, [questions]);
  const shown = questions.filter(x => (!topic || (x.topic || '(Chưa phân chủ đề)') === topic) && (!q || (x.text + ' ' + x.options.join(' ')).toLowerCase().includes(q.toLowerCase())));

  const pickFile = async (f: File) => {
    setReport('');
    try { setParsed(await readQuestionFile(f)); }
    catch { setParsed({ items: [], errors: [{ row: 0, message: 'Tệp không đúng định dạng Excel.' }] }); }
  };
  const doImport = async () => {
    if (!parsed?.items.length) return;
    setImporting(true);
    let ins = 0, upd = 0; const errs: string[] = [];
    for (let i = 0; i < parsed.items.length; i += 500) {
      const r = await Learning.importQuestions(parsed.items.slice(i, i + 500));
      if (!r.ok) { errs.push(r.message || 'Lỗi máy chủ'); break; }
      ins += r.inserted; upd += r.updated; r.errors?.forEach(e => errs.push(`Dòng ${e.row}: ${e.message}`));
    }
    setImporting(false); setParsed(null);
    setReport(`Đã nhập ${ins} câu mới${upd ? `, cập nhật ${upd} câu trùng nội dung` : ''}.${errs.length ? ' Lỗi: ' + errs.slice(0, 5).join('; ') : ''}`);
    onChanged();
  };
  const removeSel = async () => {
    if (!sel.size || !window.confirm(`Xoá ${sel.size} câu hỏi đã chọn?`)) return;
    const r = await Learning.deleteQuestions([...sel]);
    if (r.ok) { setSel(new Set()); onChanged(); setReport(`Đã xoá ${r.deleted} câu.`); } else setReport(r.message || 'Không xoá được.');
  };

  return (
    <div data-testid="question-bank">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button className={btnPrimary} onClick={() => fileRef.current?.click()} data-testid="btn-import-q"><Upload className="w-4 h-4" />Nhập từ Excel</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" data-testid="q-file" onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ''; }} />
        <a href="/mau_ngan_hang_cau_hoi.xlsx" download className={btnSecondary}><FileSpreadsheet className="w-4 h-4" />Tải mẫu Excel</a>
        <button className={btnSecondary} onClick={() => setEdit({ text: '', options: ['', '', '', ''], correct: 0, topic: topic && topic !== '(Chưa phân chủ đề)' ? topic : '' })} data-testid="btn-add-q"><Plus className="w-4 h-4" />Thêm câu</button>
        {questions.length > 0 && <button className={btnSecondary} onClick={() => exportQuestions(shown)}><Download className="w-4 h-4" />Xuất Excel</button>}
        {sel.size > 0 && <button className={`${btnSecondary} text-red-700`} onClick={removeSel}><Trash2 className="w-4 h-4" />Xoá {sel.size} câu</button>}
      </div>
      {report && <div className="mb-3 text-sm rounded-lg bg-emerald-50 text-emerald-800 px-3 py-2" data-testid="q-report">{report}</div>}

      {questions.length === 0 ? (
        <Empty icon={FileSpreadsheet} title="Ngân hàng câu hỏi trống"
          text='Tải mẫu Excel, điền câu hỏi (mỗi dòng 1 câu: Chủ đề, Câu hỏi, Đáp án A–D, Đáp án đúng, Giải thích) rồi bấm "Nhập từ Excel".' />
      ) : (
        <div className="grid md:grid-cols-[220px_1fr] gap-4">
          <div className={`${card} p-2 h-max`}>
            <button onClick={() => setTopic('')} className={`w-full text-left flex justify-between px-2.5 py-2 rounded-lg text-sm ${!topic ? 'bg-stone-900 text-white font-semibold' : 'hover:bg-stone-50'}`}><span>Tất cả</span><span className="tabular">{questions.length}</span></button>
            {topics.map(([t, n]) => (
              <button key={t} onClick={() => setTopic(t)} className={`w-full text-left flex justify-between gap-2 px-2.5 py-2 rounded-lg text-sm ${topic === t ? 'bg-stone-900 text-white font-semibold' : 'hover:bg-stone-50'}`}><span className="truncate">{t}</span><span className="tabular">{n}</span></button>
            ))}
          </div>
          <div>
            <div className="relative mb-3"><Search className="w-4 h-4 absolute left-3 top-3.5 text-stone-400" /><input className={`${inputCls} pl-9`} value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm trong câu hỏi, đáp án" /></div>
            <div className="space-y-2">
              {shown.slice(0, limit).map((x, n) => (
                <div key={x.id} className={`${card} p-3 flex gap-3`} data-testid="q-row">
                  <input type="checkbox" className="mt-1 w-4 h-4 accent-brand-700 shrink-0" checked={sel.has(x.id)} onChange={() => { const s = new Set(sel); s.has(x.id) ? s.delete(x.id) : s.add(x.id); setSel(s); }} aria-label="Chọn câu" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-stone-500 flex gap-1.5 flex-wrap">{x.topic && <Chip>{x.topic}</Chip>}{x.level && <Chip tone="blue">{x.level}</Chip>}<span>#{x.stt ?? n + 1}</span></div>
                    <div className="font-semibold text-stone-900 mt-1">{x.text}</div>
                    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 mt-1.5 text-[13px]">
                      {x.options.map((o, i) => <div key={i} className={i === x.correct ? 'text-emerald-700 font-semibold' : 'text-stone-600'}>{LETTERS[i]}. {o}{i === x.correct && ' ✓'}</div>)}
                    </div>
                    {x.explanation && <div className="text-[12px] text-stone-500 mt-1.5">Giải thích: {x.explanation}</div>}
                  </div>
                  <button className="p-1.5 h-max rounded hover:bg-stone-100" onClick={() => setEdit({ ...x, options: [...x.options] })} aria-label="Sửa"><Pencil className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            {shown.length > limit && <button className={`${btnSecondary} w-full mt-3`} onClick={() => setLimit(l => l + 100)}>Xem thêm ({shown.length - limit} câu)</button>}
            {!shown.length && <div className="text-sm text-stone-500 text-center py-6">Không có câu nào khớp.</div>}
          </div>
        </div>
      )}

      {/* Xem trước khi nhập */}
      <Sheet open={!!parsed} onClose={() => setParsed(null)} wide title="Nhập câu hỏi từ Excel" testId="q-import-preview"
        footer={<><button className={btnSecondary} onClick={() => setParsed(null)}>Huỷ</button>
          <button className={btnPrimary} onClick={doImport} disabled={importing || !parsed?.items.length} data-testid="btn-confirm-import">{importing ? 'Đang nhập...' : `Nhập ${parsed?.items.length || 0} câu`}</button></>}>
        {parsed && (
          <>
            <div className="flex gap-2 flex-wrap mb-3">
              <Chip tone="green" className="text-sm">{parsed.items.length} câu hợp lệ</Chip>
              {parsed.errors.length > 0 && <Chip tone="red" className="text-sm">{parsed.errors.length} dòng lỗi (bỏ qua)</Chip>}
              {parsed.sheet && <span className="text-[13px] text-stone-500">Trang tính: {parsed.sheet}</span>}
            </div>
            {parsed.errors.length > 0 && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-3 text-[13px] text-red-800 max-h-40 overflow-y-auto" data-testid="q-parse-errors">
                <div className="font-semibold flex items-center gap-1 mb-1"><AlertTriangle className="w-4 h-4" />Các dòng không nhập được</div>
                {parsed.errors.slice(0, 50).map((e, i) => <div key={i}>{e.row ? `Dòng ${e.row}: ` : ''}{e.message}</div>)}
              </div>
            )}
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {parsed.items.slice(0, 100).map(it => (
                <div key={it.row} className="text-[13px] border-b border-stone-100 pb-1.5">
                  <span className="text-stone-400">Dòng {it.row}{it.topic ? ` · ${it.topic}` : ''} · </span><b>{it.text}</b>
                  <span className="text-emerald-700"> → {LETTERS[it.correct]}. {it.options[it.correct]}</span>
                </div>
              ))}
              {parsed.items.length > 100 && <div className="text-[13px] text-stone-500">… và {parsed.items.length - 100} câu nữa</div>}
            </div>
            <p className="text-[12px] text-stone-500 mt-3">Câu trùng nội dung với câu đã có sẽ được cập nhật (không nhân đôi).</p>
          </>
        )}
      </Sheet>

      <QuestionEditor q={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged(); }} />
    </div>
  );
};

const QuestionEditor: React.FC<{ q: Partial<QuizQuestion> | null; onClose: () => void; onSaved: () => void }> = ({ q, onClose, onSaved }) => {
  const [x, setX] = useState<Partial<QuizQuestion>>({});
  const [msg, setMsg] = useState('');
  React.useEffect(() => { if (q) { setX({ ...q, options: [...(q.options || ['', '', '', ''])] }); setMsg(''); } }, [q]);
  const opts = x.options || [];
  const save = async () => {
    const kept = opts.map((t, i) => ({ t: t.trim(), i })).filter(o => o.t);
    const correct = kept.findIndex(o => o.i === x.correct);
    if (!x.text?.trim()) { setMsg('Nhập nội dung câu hỏi.'); return; }
    if (kept.length < 2) { setMsg('Cần ít nhất 2 đáp án.'); return; }
    if (correct < 0) { setMsg('Đáp án đúng đang để trống.'); return; }
    const r = await Learning.saveQuestion({ ...x, options: kept.map(o => o.t), correct });
    if (!r.ok) { setMsg(r.message || 'Không lưu được.'); return; }
    onSaved();
  };
  return (
    <Sheet open={!!q} onClose={onClose} title={x.id ? 'Sửa câu hỏi' : 'Thêm câu hỏi'} testId="q-editor"
      footer={<><button className={btnSecondary} onClick={onClose}>Huỷ</button><button className={btnPrimary} onClick={save} data-testid="btn-save-q">Lưu câu hỏi</button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelCls}>Chủ đề</label><input className={inputCls} value={x.topic || ''} onChange={e => setX({ ...x, topic: e.target.value })} /></div>
          <div><label className={labelCls}>Mức độ</label><select className={inputCls} value={x.level || ''} onChange={e => setX({ ...x, level: e.target.value })}><option value="">—</option><option>Nhận biết</option><option>Thông hiểu</option><option>Vận dụng</option></select></div>
        </div>
        <div><label className={labelCls}>Câu hỏi</label><textarea className={`${inputCls} h-24 py-2`} value={x.text || ''} onChange={e => setX({ ...x, text: e.target.value })} data-testid="q-text" /></div>
        {opts.map((o, i) => (
          <div key={i} className="flex gap-2 items-center">
            <button onClick={() => setX({ ...x, correct: i })} className={`w-9 h-9 rounded-lg font-bold shrink-0 ${x.correct === i ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600'}`} title="Chọn làm đáp án đúng">{LETTERS[i]}</button>
            <input className={inputCls} value={o} onChange={e => { const n = [...opts]; n[i] = e.target.value; setX({ ...x, options: n }); }} placeholder={`Đáp án ${LETTERS[i]}`} data-testid="q-opt" />
          </div>
        ))}
        {opts.length < 6 && <button className="text-sm font-semibold text-brand-700" onClick={() => setX({ ...x, options: [...opts, ''] })}>+ Thêm đáp án</button>}
        <p className="text-[12px] text-stone-500">Bấm chữ cái để chọn đáp án đúng (đang chọn: <b>{LETTERS[x.correct ?? 0]}</b>).</p>
        <div><label className={labelCls}>Giải thích (hiện sau khi trả lời câu ôn)</label><textarea className={`${inputCls} h-20 py-2`} value={x.explanation || ''} onChange={e => setX({ ...x, explanation: e.target.value })} /></div>
        <div><label className={labelCls}>Nguồn / căn cứ</label><input className={inputCls} value={x.source || ''} onChange={e => setX({ ...x, source: e.target.value })} /></div>
        {msg && <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{msg}</div>}
      </div>
    </Sheet>
  );
};
