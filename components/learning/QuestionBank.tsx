import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Filter, Loader2, Pencil, Plus, Search, Tag, Trash2, Upload, X } from 'lucide-react';
import { Learning } from '../../services/learningService';
import { QuizQuestion } from '../../types';
import { exportQuestions, LETTERS, ParseResult, readQuestionFile } from '../../lib/exam';
import { isSelectingText, makeQuestionMatcher, useRangeToggle } from '../../lib/questionPick';
import { btnPrimary, btnSecondary, card, Chip, Empty, inputCls, labelCls, Sheet } from './common';

interface Props { questions: QuizQuestion[]; onChanged: () => void; }

const NO_TOPIC = '(Chưa phân chủ đề)';
const LEVELS = ['Nhận biết', 'Thông hiểu', 'Vận dụng'];

/** Ô tick to, dễ bấm; tri-state cho "chọn tất cả" */
export const TickBox: React.FC<{ state: 'on' | 'off' | 'some'; className?: string }> = ({ state, className = '' }) => (
  <span aria-hidden className={`inline-flex items-center justify-center w-6 h-6 rounded-md border-2 shrink-0 transition-colors ${state === 'off' ? 'border-stone-300 bg-white' : 'border-brand-700 bg-brand-700 text-white'} ${className}`}>
    {state === 'on' && <svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    {state === 'some' && <span className="w-3 h-0.5 bg-white rounded" />}
  </span>
);

/** Ngân hàng câu hỏi: nhập từ Excel theo mẫu, tìm kiếm, chọn hàng loạt, sửa từng câu, xuất Excel */
export const QuestionBank: React.FC<Props> = ({ questions, onChanged }) => {
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('');
  const [onlySel, setOnlySel] = useState(false);
  const [selRaw, setSel] = useState<Set<string>>(new Set());
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState('');
  const [edit, setEdit] = useState<Partial<QuizQuestion> | null>(null);
  const [bulk, setBulk] = useState<null | 'topic' | 'level'>(null);
  const [limit, setLimit] = useState(50);
  const fileRef = useRef<HTMLInputElement>(null);

  // Bỏ khỏi lựa chọn những câu đã bị xoá
  const sel = useMemo(() => {
    const ids = new Set(questions.map(x => x.id));
    return new Set([...selRaw].filter(id => ids.has(id)));
  }, [selRaw, questions]);

  const topics = useMemo(() => {
    const m = new Map<string, number>();
    questions.forEach(x => m.set(x.topic || NO_TOPIC, (m.get(x.topic || NO_TOPIC) || 0) + 1));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  }, [questions]);
  const levels = useMemo(() => [...new Set([...LEVELS, ...questions.map(x => x.level || '').filter(Boolean)])], [questions]);

  const shown = useMemo(() => {
    const match = makeQuestionMatcher(q);
    return questions.filter(x => (!topic || (x.topic || NO_TOPIC) === topic)
      && (!level || (level === '-' ? !x.level : x.level === level))
      && (!onlySel || sel.has(x.id)) && match(x));
  }, [questions, topic, level, onlySel, sel, q]);
  const shownIds = useMemo(() => shown.map(x => x.id), [shown]);
  const shownSel = shownIds.filter(id => sel.has(id)).length;
  const allState: 'on' | 'off' | 'some' = !shownSel ? 'off' : shownSel === shownIds.length ? 'on' : 'some';
  const filtering = !!(q.trim() || topic || level || onlySel);

  const apply = useCallback((ids: string[], on: boolean) => setSel(prev => {
    const s = new Set(prev); ids.forEach(id => on ? s.add(id) : s.delete(id)); return s;
  }), []);
  const toggle = useRangeToggle(shownIds, sel, apply);
  const toggleAllShown = () => apply(shownIds, allState !== 'on');
  const clearSel = () => { setSel(new Set()); setOnlySel(false); };
  const resetFilters = () => { setQ(''); setTopic(''); setLevel(''); setOnlySel(false); setLimit(50); };

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
    if (!sel.size || !window.confirm(`Xoá ${sel.size} câu hỏi đã chọn? Không khôi phục được.`)) return;
    const r = await Learning.deleteQuestions([...sel]);
    if (r.ok) { setSel(new Set()); setOnlySel(false); onChanged(); setReport(`Đã xoá ${r.deleted} câu.`); } else setReport(r.message || 'Không xoá được.');
  };
  const selectedQs = () => questions.filter(x => sel.has(x.id));

  return (
    <div data-testid="question-bank">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button className={btnPrimary} onClick={() => fileRef.current?.click()} data-testid="btn-import-q"><Upload className="w-4 h-4" />Nhập từ Excel</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" data-testid="q-file" onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ''; }} />
        <a href="/mau_ngan_hang_cau_hoi.xlsx" download className={btnSecondary}><FileSpreadsheet className="w-4 h-4" />Tải mẫu Excel</a>
        <button className={btnSecondary} onClick={() => setEdit({ text: '', options: ['', '', '', ''], correct: 0, topic: topic && topic !== NO_TOPIC ? topic : '', level: level && level !== '-' ? level : '' })} data-testid="btn-add-q"><Plus className="w-4 h-4" />Thêm câu</button>
        {questions.length > 0 && <button className={btnSecondary} onClick={() => exportQuestions(shown)}><Download className="w-4 h-4" />Xuất Excel{filtering ? ` (${shown.length} câu đang lọc)` : ''}</button>}
      </div>
      {report && <div className="mb-3 text-sm rounded-lg bg-emerald-50 text-emerald-800 px-3 py-2 flex gap-2" data-testid="q-report"><span className="flex-1">{report}</span><button onClick={() => setReport('')} aria-label="Ẩn"><X className="w-4 h-4" /></button></div>}

      {questions.length === 0 ? (
        <Empty icon={FileSpreadsheet} title="Ngân hàng câu hỏi trống"
          text='Tải mẫu Excel, điền câu hỏi (mỗi dòng 1 câu: Chủ đề, Câu hỏi, Đáp án A–D, Đáp án đúng, Giải thích) rồi bấm "Nhập từ Excel".' />
      ) : (
        <div className="grid md:grid-cols-[220px_1fr] gap-4">
          {/* Chủ đề: máy tính là cột trái, điện thoại là ô chọn */}
          <div className={`${card} p-2 h-max hidden md:block`}>
            <button onClick={() => { setTopic(''); setLimit(50); }} className={`w-full text-left flex justify-between px-2.5 py-2 rounded-lg text-sm ${!topic ? 'bg-stone-900 text-white font-semibold' : 'hover:bg-stone-50'}`}><span>Tất cả</span><span className="tabular">{questions.length}</span></button>
            {topics.map(([t, n]) => (
              <button key={t} onClick={() => { setTopic(t); setLimit(50); }} className={`w-full text-left flex justify-between gap-2 px-2.5 py-2 rounded-lg text-sm ${topic === t ? 'bg-stone-900 text-white font-semibold' : 'hover:bg-stone-50'}`}><span className="truncate">{t}</span><span className="tabular">{n}</span></button>
            ))}
          </div>
          <div className="min-w-0">
            <div className="grid grid-cols-2 md:grid-cols-[1fr_170px] gap-2 mb-2">
              <div className="relative col-span-2 md:col-span-1">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-stone-400" />
                <input className={`${inputCls} pl-9 pr-9`} value={q} onChange={e => { setQ(e.target.value); setLimit(50); }} placeholder='Tìm câu hỏi, đáp án… (không cần dấu; #12 = câu số 12)' title='Không cần gõ dấu. Nhiều từ: câu phải chứa đủ các từ. "cụm từ" trong ngoặc kép: tìm nguyên cụm. #12: tìm câu số 12.' data-testid="q-search" />
                {q && <button className="absolute right-2 top-2 p-1.5 rounded hover:bg-stone-100" onClick={() => setQ('')} aria-label="Xoá tìm kiếm"><X className="w-4 h-4 text-stone-500" /></button>}
              </div>
              <select className={`${inputCls} md:hidden`} value={topic} onChange={e => { setTopic(e.target.value); setLimit(50); }} aria-label="Chủ đề">
                <option value="">Mọi chủ đề ({questions.length})</option>
                {topics.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
              </select>
              <select className={inputCls} value={level} onChange={e => { setLevel(e.target.value); setLimit(50); }} aria-label="Mức độ" data-testid="q-level-filter">
                <option value="">Mọi mức độ</option>
                {levels.map(l => <option key={l} value={l}>{l}</option>)}
                <option value="-">Chưa ghi mức độ</option>
              </select>
            </div>

            {/* Thanh chọn hàng loạt: luôn bám đầu danh sách khi cuộn */}
            <div className={`sticky top-0 z-10 -mx-1 px-1 py-1.5 mb-2 ${sel.size ? 'bg-brand-50/95' : 'bg-stone-50/95'} backdrop-blur rounded-lg`} data-testid="q-selbar">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <button className="inline-flex items-center gap-2 h-10 pl-1.5 pr-3 rounded-lg hover:bg-white/70 text-sm font-semibold text-stone-800 disabled:opacity-40" onClick={toggleAllShown} disabled={!shownIds.length} data-testid="q-select-all">
                  <TickBox state={allState} />
                  {allState === 'on' ? `Bỏ chọn ${shownIds.length} câu` : `Chọn tất cả ${shownIds.length} câu${filtering ? ' đang lọc' : ''}`}
                </button>
                {sel.size > 0 && <>
                  <span className="text-sm text-stone-700"><b className="text-brand-700 tabular" data-testid="q-sel-count">{sel.size}</b> câu đã chọn{sel.size > shownSel ? <span className="text-stone-500"> ({sel.size - shownSel} ngoài bộ lọc)</span> : null}</span>
                  <div className="flex gap-1.5 w-full md:w-auto md:ml-auto overflow-x-auto md:flex-wrap -mx-1 px-1 pb-0.5 [&>button]:shrink-0">
                    <button className={`${btnSecondary} h-9 px-3 ${onlySel ? 'border-brand-700 text-brand-700' : ''}`} onClick={() => { setOnlySel(v => !v); setLimit(50); }}><Filter className="w-4 h-4" />{onlySel ? 'Hiện tất cả' : 'Chỉ xem đã chọn'}</button>
                    <button className={`${btnSecondary} h-9 px-3`} onClick={() => setBulk('topic')}><Tag className="w-4 h-4" />Đổi chủ đề</button>
                    <button className={`${btnSecondary} h-9 px-3`} onClick={() => setBulk('level')}>Đổi mức độ</button>
                    <button className={`${btnSecondary} h-9 px-3`} onClick={() => exportQuestions(selectedQs())}><Download className="w-4 h-4" />Xuất</button>
                    <button className={`${btnSecondary} h-9 px-3 text-red-700`} onClick={removeSel} data-testid="q-delete-sel"><Trash2 className="w-4 h-4" />Xoá</button>
                    <button className={`${btnSecondary} h-9 px-3`} onClick={clearSel} aria-label="Bỏ chọn tất cả"><X className="w-4 h-4" />Bỏ chọn</button>
                  </div>
                </>}
              </div>
              {sel.size === 0 && shownIds.length > 1 && <div className="text-[12px] text-stone-500 px-1.5 pt-0.5 hidden md:block">Bấm vào câu để chọn. Giữ <kbd className="px-1 rounded border border-stone-300 bg-white">Shift</kbd> khi bấm để chọn cả đoạn.</div>}
            </div>

            <div className="space-y-2">
              {shown.slice(0, limit).map((x, n) => {
                const on = sel.has(x.id);
                return (
                  <div key={x.id} role="checkbox" aria-checked={on} tabIndex={0} data-testid="q-row"
                    onMouseDown={e => { if (e.shiftKey) e.preventDefault(); }}
                      onClick={e => { if (!isSelectingText()) toggle(x.id, e); }}
                    onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(x.id, e); } }}
                    style={on ? { boxShadow: '0 0 0 2px var(--color-brand-700)', background: 'var(--color-brand-50)' } : undefined}
                    className={`${card} p-3 flex gap-3 cursor-pointer select-text outline-none focus-visible:ring-2 focus-visible:ring-brand-700/40 ${on ? '' : 'hover:border-stone-300'}`}>
                    <TickBox state={on ? 'on' : 'off'} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-stone-500 flex gap-1.5 flex-wrap items-center">{x.topic && <Chip>{x.topic}</Chip>}{x.level && <Chip tone="blue">{x.level}</Chip>}<span>#{x.stt ?? n + 1}</span></div>
                      <div className="font-semibold text-stone-900 mt-1">{x.text}</div>
                      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 mt-1.5 text-[13px]">
                        {x.options.map((o, i) => <div key={i} className={i === x.correct ? 'text-emerald-700 font-semibold' : 'text-stone-600'}>{LETTERS[i]}. {o}{i === x.correct && ' ✓'}</div>)}
                      </div>
                      {x.explanation && <div className="text-[12px] text-stone-500 mt-1.5">Giải thích: {x.explanation}</div>}
                    </div>
                    <button className="p-2 h-max rounded-lg hover:bg-stone-100 shrink-0" onClick={e => { e.stopPropagation(); setEdit({ ...x, options: [...x.options] }); }} aria-label="Sửa"><Pencil className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </div>
            {shown.length > limit && <button className={`${btnSecondary} w-full mt-3`} onClick={() => setLimit(l => l + 100)}>Xem thêm ({shown.length - limit} câu)</button>}
            {!shown.length && <div className="text-sm text-stone-500 text-center py-6">Không có câu nào khớp. {filtering && <button className="text-brand-700 font-semibold" onClick={resetFilters}>Bỏ lọc</button>}</div>}
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

      <BulkEdit mode={bulk} items={bulk ? selectedQs() : []} topics={topics.map(t => t[0]).filter(t => t !== NO_TOPIC)} levels={levels}
        onClose={() => setBulk(null)} onDone={msg => { setBulk(null); setReport(msg); onChanged(); }} />
      <QuestionEditor q={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged(); }} />
    </div>
  );
};

/** Đổi chủ đề / mức độ cho nhiều câu cùng lúc */
const BulkEdit: React.FC<{ mode: null | 'topic' | 'level'; items: QuizQuestion[]; topics: string[]; levels: string[]; onClose: () => void; onDone: (msg: string) => void }> =
  ({ mode, items, topics, levels, onClose, onDone }) => {
    const [val, setVal] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(0);
    React.useEffect(() => { if (mode) { setVal(''); setDone(0); setBusy(false); } }, [mode]);
    const run = async () => {
      setBusy(true); setDone(0);
      const v = val.trim();
      let ok = 0; const errs: string[] = []; let i = 0;
      const worker = async () => {
        while (i < items.length) {
          const x = items[i++];
          const r = await Learning.saveQuestion({ ...x, [mode === 'topic' ? 'topic' : 'level']: v || null });
          if (r.ok) ok++; else if (errs.length < 3) errs.push(r.message || 'Lỗi');
          setDone(d => d + 1);
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));
      setBusy(false);
      onDone(`Đã đổi ${mode === 'topic' ? 'chủ đề' : 'mức độ'} cho ${ok}/${items.length} câu${v ? ` thành "${v}"` : ' (để trống)'}.${errs.length ? ' Lỗi: ' + errs.join('; ') : ''}`);
    };
    return (
      <Sheet open={!!mode} onClose={() => { if (!busy) onClose(); }} title={`${mode === 'topic' ? 'Đổi chủ đề' : 'Đổi mức độ'} cho ${items.length} câu`} testId="q-bulk"
        footer={<><button className={btnSecondary} onClick={onClose} disabled={busy}>Huỷ</button>
          <button className={btnPrimary} onClick={run} disabled={busy} data-testid="q-bulk-apply">{busy ? <><Loader2 className="w-4 h-4 animate-spin" />{done}/{items.length}</> : 'Áp dụng'}</button></>}>
        {mode === 'topic' ? (
          <div>
            <label className={labelCls}>Chủ đề mới (chọn có sẵn hoặc gõ tên mới; để trống = bỏ chủ đề)</label>
            <input className={inputCls} list="q-topic-list" value={val} onChange={e => setVal(e.target.value)} autoFocus data-testid="q-bulk-value" />
            <datalist id="q-topic-list">{topics.map(t => <option key={t} value={t} />)}</datalist>
            <div className="flex flex-wrap gap-1.5 mt-2">{topics.slice(0, 20).map(t => <button key={t} onClick={() => setVal(t)} className={`px-2.5 h-8 rounded-full text-[13px] border ${val === t ? 'border-brand-700 bg-brand-50 text-brand-700 font-semibold' : 'border-stone-300 bg-white'}`}>{t}</button>)}</div>
          </div>
        ) : (
          <div className="grid gap-2">
            {[...levels, ''].map(l => (
              <button key={l || '-'} onClick={() => setVal(l)} className={`h-11 rounded-lg border text-sm font-semibold ${val === l ? 'border-brand-700 bg-brand-50 text-brand-700' : 'border-stone-300 bg-white'}`}>{l || 'Để trống'}</button>
            ))}
          </div>
        )}
      </Sheet>
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
