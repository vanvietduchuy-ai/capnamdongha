import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, History, Loader2, Minus, Plus, Search, Siren, Trash2, X, Zap } from 'lucide-react';
import { DailyIncident, DailyOtherIncident, DailyReport, DailyStatus, DailyUnit, User } from '../../types';
import {
  blankIncident, Daily, DailyGet, dayShort, FIELDS, HANDLINGS, incidentError, KINDS, noAccent, parseIncidentText, SEVERITIES, unitName, vnDateTime, vnTime
} from '../../services/dailyReportService';
import { btnPrimary, btnSecondary, card, Chip, Sheet } from '../learning/common';
import { HistorySheet } from './DailyBoard';

interface Props {
  me: User;
  day: string;
  unit: DailyUnit;
  deadline: string;         // HH:MM
  clockOffset: number;      // serverNow - Date.now()
  reported?: boolean;       // đã biết trước đầu mối đã có báo cáo (từ màn chọn vai trò)
  onBack: () => void;
  onSubmitted: () => void;
}

/* Ô nhập cỡ chữ 16px: iPhone không tự phóng to khi chạm vào ô */
export const inBig = 'w-full h-12 px-3 rounded-xl border border-stone-300 bg-white text-[16px] focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700 disabled:bg-stone-50';
const lbl = 'block text-[13px] font-semibold text-stone-700 mb-1';

const draftKey = (day: string, unit: string) => `daily_draft:${day}:${unit}`;
type Draft = { status: DailyStatus | null; note: string; incidents: DailyIncident[] };
const loadDraft = (day: string, unit: string): Draft | null => {
  try { const s = localStorage.getItem(draftKey(day, unit)); return s ? JSON.parse(s) : null; } catch { return null; }
};
const saveDraft = (day: string, unit: string, d: Draft | null) => {
  try { if (d) localStorage.setItem(draftKey(day, unit), JSON.stringify(d)); else localStorage.removeItem(draftKey(day, unit)); } catch { /* bỏ qua */ }
};
const hasDraft = (d: Draft | null) => !!d && !!(d.status || d.incidents?.length || d.note);

const fmtLeft = (ms: number) => {
  if (ms <= 0) return '';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  return h ? `còn ${h} giờ ${m % 60} phút` : `còn ${m} phút`;
};

/** Biểu mẫu báo cáo ngày của 1 đầu mối — hiện ngay, dữ liệu máy chủ tải song song */
export const DailyForm: React.FC<Props> = ({ day, unit, deadline, clockOffset, reported, onBack, onSubmitted }) => {
  const initDraft = useMemo(() => loadDraft(day, unit), [day, unit]);
  const [info, setInfo] = useState<Partial<DailyGet> | null>(null);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState<DailyStatus | null>(initDraft?.status || null);
  const [note, setNote] = useState(initDraft?.note || '');
  const [noteOpen, setNoteOpen] = useState(!!initDraft?.note);
  const [incidents, setIncidents] = useState<DailyIncident[]>(initDraft?.incidents || []);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState<DailyReport | null>(null);
  const [editing, setEditing] = useState(!reported);
  const [flashOpen, setFlashOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [now, setNow] = useState(Date.now() + clockOffset);
  const touched = useRef(hasDraft(initDraft));

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now() + clockOffset), 30000); return () => window.clearInterval(t); }, [clockOffset]);

  const load = async () => {
    setErr('');
    const r = await Daily.get(day, unit);
    if (!r.ok) { setErr(r.message || 'Không tải được biểu mẫu.'); return; }
    setInfo(r);
    const rep = r.unitInfo?.report || null;
    const fl = r.unitInfo?.flash || [];
    if (rep && !touched.current) {
      // Đã có bản nộp: xem bản nộp; bấm "Bổ sung / đính chính" mới soạn tiếp
      setStatus(rep.status); setNote(rep.note || ''); setIncidents(rep.incidents.map(i => ({ ...i })));
      saveDraft(day, unit, null); setEditing(false);
    } else {
      // Đang soạn: thêm báo cáo nhanh chưa có trong danh sách
      setIncidents(list => {
        const keys = new Set(list.map(i => i.key));
        const extra = fl.filter(f => !keys.has(f.key)).map(f => ({ ...f.data, key: f.key, flash: true }));
        if (extra.length) setStatus('INCIDENT');
        return extra.length ? [...list.filter(i => (i.summary || i.field)), ...extra] : list;
      });
      setEditing(true);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [day, unit]);

  // Lưu nháp trên máy khi đang soạn
  useEffect(() => {
    if (!editing) return;
    saveDraft(day, unit, status || incidents.length || note ? { status, note, incidents } : null);
  }, [status, note, incidents, editing, day, unit]);

  const rep = info?.unitInfo?.report || null;
  const flashKeys = useMemo(() => new Set((info?.unitInfo?.flash || []).map(f => f.key)), [info]);
  const deadlineAt = info?.deadlineAt || 0;
  const past = deadlineAt > 0 && now > deadlineAt;
  const needReason = !!rep && past;
  const canSubmit = info ? !!info.canSubmit : true;
  const isCurrent = info?.currentDay === day;

  const touch = () => { touched.current = true; setMsg(''); };
  const setInc = (k: number, patch: Partial<DailyIncident>) => { touch(); setIncidents(list => list.map((x, i) => (i === k ? { ...x, ...patch } : x))); };
  const removeInc = (k: number) => { touch(); setIncidents(list => list.filter((_, i) => i !== k)); };
  const pick = (s: DailyStatus) => {
    touch(); setStatus(s);
    if (s === 'INCIDENT' && !incidents.length) setIncidents([blankIncident()]);
  };

  const submit = async () => {
    setMsg('');
    if (!info) { setMsg('Đang tải dữ liệu, bấm lại sau giây lát.'); return; }
    if (!status) { setMsg('Chọn "Bình thường" hoặc "Có vụ việc".'); return; }
    if (status === 'INCIDENT') {
      if (!incidents.length) { setMsg('Thêm ít nhất 1 vụ việc.'); return; }
      for (let k = 0; k < incidents.length; k++) {
        const e = incidentError(incidents[k]);
        if (e) { setMsg(`Vụ việc ${k + 1}: ${e}`); document.getElementById(`inc-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      }
    }
    if (needReason && reason.trim().length < 5) { setMsg('Đã qua hạn: ghi lý do đính chính.'); return; }
    setBusy(true);
    const r = await Daily.submit({ day, unit, status, note, incidents: status === 'INCIDENT' ? incidents : [], reason, confirm: true });
    setBusy(false);
    if (!r.ok || !r.report) { setMsg(r.message || 'Không nộp được báo cáo.'); return; }
    saveDraft(day, unit, null); touched.current = false;
    setDone(r.report); setEditing(false); setReason('');
    onSubmitted();
  };

  const left = deadlineAt - now;
  const header = (
    <div className="flex items-center gap-1 mb-3">
      <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-stone-100" aria-label="Quay lại"><ChevronLeft className="w-6 h-6" /></button>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-stone-900 text-[19px] leading-tight truncate">{unitName(unit)}</div>
        <div className={`text-[13px] ${past ? 'text-red-700 font-semibold' : 'text-stone-500'}`}>
          Báo cáo ngày {dayShort(day)} · {past ? 'đã quá hạn' : `hạn ${deadline}${left > 0 ? ` (${fmtLeft(left)})` : ''}`}
        </div>
      </div>
    </div>
  );

  if (err) return <div>{header}<div className="rounded-xl bg-red-50 text-red-800 px-4 py-3 text-[15px]" data-testid="daily-form-error">{err}</div>
    <button className={`${btnSecondary} mt-3`} onClick={load}>Thử lại</button></div>;

  // ---------- Đã nộp / vừa nộp xong ----------
  const shown = done || (!editing ? rep : null);
  if (!editing && !shown) return <div>{header}<div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div></div>;
  if (shown && !editing) {
    const totalCases = shown.incidents.reduce((s, i) => s + i.cases, 0);
    return (
      <div className="max-w-2xl" data-testid="daily-form">
        {header}
        {done && <div className="mb-3 rounded-xl bg-emerald-50 text-emerald-800 px-4 py-3 text-[15px] font-semibold flex gap-2" data-testid="daily-done">
          <CheckCircle2 className="w-5 h-5 shrink-0" />Đã nộp báo cáo{done.late ? ' (muộn)' : ''}.</div>}
        <div className={`${card} p-4`}>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {shown.status === 'NORMAL' ? <Chip tone="green">Bình thường</Chip> : <Chip tone="orange">Có vụ việc · {totalCases} vụ</Chip>}
            {shown.late && <Chip tone="red">Nộp muộn</Chip>}
          </div>
          <div className="text-[13px] text-stone-500">Đ/c {shown.reporterName} · {vnTime(shown.submittedAt)}{shown.version > 1 ? ` · bản ${shown.version}` : ''}</div>
          {shown.reason && <div className="text-[13px] text-stone-600 mt-1">Lý do đính chính: {shown.reason}</div>}
          {shown.note && <div className="text-[15px] text-stone-700 mt-2 whitespace-pre-line">{shown.note}</div>}
          {shown.incidents.map((i, k) => <IncidentView key={i.key} i={i} n={k + 1} others={info?.others || []} />)}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {canSubmit && <button className={btnSecondary} data-testid="daily-revise"
            onClick={() => { touched.current = true; setStatus(shown.status); setNote(shown.note || ''); setNoteOpen(!!shown.note); setIncidents(shown.incidents.map(i => ({ ...i }))); setEditing(true); setDone(null); }}>
            Bổ sung / đính chính</button>}
          <button className={btnPrimary} onClick={onBack}>Xong</button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
          {canSubmit && isCurrent && <button className="text-[14px] font-semibold text-red-700 inline-flex items-center gap-1.5 h-9" onClick={() => setFlashOpen(true)}><Siren className="w-4 h-4" />Báo cáo nhanh vụ việc</button>}
          {(info?.unitInfo?.versions || 0) > 1 && <button className="text-[14px] font-semibold text-stone-600 inline-flex items-center gap-1.5 h-9" onClick={() => setHistoryOpen(true)}><History className="w-4 h-4" />Lịch sử ({info?.unitInfo?.versions})</button>}
        </div>
        <FlashSheet open={flashOpen} unit={unit} onClose={() => setFlashOpen(false)} onDone={() => { setFlashOpen(false); touched.current = false; load(); }} />
        <HistorySheet open={historyOpen} day={day} unit={unit} onClose={() => setHistoryOpen(false)} />
      </div>
    );
  }

  // ---------- Soạn báo cáo ----------
  return (
    <div className="max-w-2xl" data-testid="daily-form">
      {header}
      {!canSubmit && <div className="mb-3 rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-[14px]">Tài khoản này chỉ xem, không báo cáo ngày.</div>}
      {rep && <div className="mb-3 rounded-xl bg-blue-50 text-blue-900 px-4 py-2.5 text-[14px]">Đính chính bản nộp lúc {vnDateTime(rep.submittedAt)} (đ/c {rep.reporterName}).</div>}

      {/* Tình hình trong kỳ */}
      <div className="grid grid-cols-2 gap-2.5 mb-3" role="radiogroup" aria-label="Tình hình trong kỳ">
        <button role="radio" aria-checked={status === 'NORMAL'} disabled={!canSubmit} onClick={() => pick('NORMAL')} data-testid="daily-normal"
          className={`rounded-2xl border-2 h-24 flex flex-col items-center justify-center gap-1 transition-colors ${status === 'NORMAL' ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 bg-white'}`}>
          <CheckCircle2 className={`w-8 h-8 ${status === 'NORMAL' ? 'text-emerald-600' : 'text-stone-300'}`} />
          <span className="font-bold text-[16px] text-stone-900">Bình thường</span>
        </button>
        <button role="radio" aria-checked={status === 'INCIDENT'} disabled={!canSubmit} onClick={() => pick('INCIDENT')} data-testid="daily-incident"
          className={`rounded-2xl border-2 h-24 flex flex-col items-center justify-center gap-1 transition-colors ${status === 'INCIDENT' ? 'border-orange-600 bg-orange-50' : 'border-stone-200 bg-white'}`}>
          <AlertTriangle className={`w-8 h-8 ${status === 'INCIDENT' ? 'text-orange-600' : 'text-stone-300'}`} />
          <span className="font-bold text-[16px] text-stone-900">Có vụ việc</span>
        </button>
      </div>
      {status === 'NORMAL' && flashKeys.size > 0 && <div className="mb-3 rounded-xl bg-red-50 text-red-800 px-4 py-2.5 text-[14px]">Đã báo cáo nhanh {flashKeys.size} vụ việc nên phải chọn "Có vụ việc".</div>}

      {status === 'INCIDENT' && (
        <>
          <div className="space-y-3">
            {incidents.map((i, k) => (
              <IncidentEdit key={i.key} id={`inc-${k}`} n={k + 1} i={i} others={info?.others || []} isFlash={flashKeys.has(i.key)} disabled={!canSubmit}
                onChange={p => setInc(k, p)} onRemove={incidents.length > 1 && !flashKeys.has(i.key) ? () => removeInc(k) : undefined} />
            ))}
          </div>
          {canSubmit && <button className="mt-3 w-full h-12 rounded-xl border-2 border-dashed border-stone-300 text-stone-700 font-semibold text-[15px] inline-flex items-center justify-center gap-1.5"
            onClick={() => { touch(); setIncidents(l => [...l, blankIncident()]); }} data-testid="daily-add-incident"><Plus className="w-5 h-5" />Thêm vụ việc</button>}
        </>
      )}

      {status && (
        <div className="mt-3 space-y-3">
          {noteOpen ? (
            <div>
              <label className={lbl}>Ghi chú, kiến nghị</label>
              <textarea className={`${inBig} h-24 py-2.5`} value={note} onChange={e => { touch(); setNote(e.target.value); }} disabled={!canSubmit} maxLength={3000} data-testid="daily-note" />
            </div>
          ) : canSubmit && (
            <button className="text-[14px] font-semibold text-stone-600 inline-flex items-center gap-1 h-9" onClick={() => setNoteOpen(true)}><Plus className="w-4 h-4" />Ghi chú, kiến nghị</button>
          )}
          {needReason && (
            <div>
              <label className={lbl}>Lý do đính chính *</label>
              <input className={inBig} value={reason} onChange={e => setReason(e.target.value)} data-testid="daily-reason" />
            </div>
          )}
        </div>
      )}

      {canSubmit && isCurrent && !rep && (
        <button className="mt-2 text-[14px] font-semibold text-red-700 inline-flex items-center gap-1.5 h-9" onClick={() => setFlashOpen(true)} data-testid="daily-flash-open">
          <Zap className="w-4 h-4" />Báo cáo nhanh vụ việc nghiêm trọng</button>
      )}

      {/* Thanh nộp: nằm trên thanh điều hướng dưới cùng của điện thoại */}
      {canSubmit && status && (
        <div className="sticky z-20 -mx-3 md:mx-0 mt-3 px-3 md:px-0 pt-2 pb-2 bg-stone-50/95 backdrop-blur md:bg-transparent md:backdrop-blur-none md:static"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
          {msg && <div className="mb-2 text-[14px] text-red-700 bg-red-50 rounded-xl px-3 py-2" data-testid="daily-msg">{msg}</div>}
          <div className="flex gap-2">
            {rep && <button className={`${btnSecondary} h-12`} onClick={() => { touched.current = false; setEditing(false); saveDraft(day, unit, null); load(); }}>Huỷ</button>}
            <button className={`${btnPrimary} flex-1 h-12 text-[16px] rounded-xl`} onClick={submit} disabled={busy} data-testid="daily-submit">
              {(busy || !info) && <Loader2 className="w-5 h-5 animate-spin" />}{rep ? 'Nộp bản đính chính' : 'Nộp báo cáo'}
            </button>
          </div>
          <p className="text-[12px] text-stone-500 mt-1.5 text-center">Bấm nộp là xác nhận nội dung đúng, đầy đủ và chịu trách nhiệm trước Ban Chỉ huy.</p>
        </div>
      )}
      <FlashSheet open={flashOpen} unit={unit} onClose={() => setFlashOpen(false)} onDone={() => { setFlashOpen(false); load(); }} />
    </div>
  );
};

/** Ô số có nút − / + (bấm nhanh trên điện thoại) */
const Stepper: React.FC<{ label: string; value: number; min?: number; disabled?: boolean; onChange: (v: number) => void; testId?: string }> =
  ({ label, value, min = 0, disabled, onChange, testId }) => (
    <div>
      <label className={lbl}>{label}</label>
      <div className="flex items-center h-12 rounded-xl border border-stone-300 bg-white overflow-hidden">
        <button type="button" className="w-11 h-full flex items-center justify-center text-stone-600 active:bg-stone-100 disabled:opacity-30" disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Giảm ${label}`}><Minus className="w-4 h-4" /></button>
        <input inputMode="numeric" className="flex-1 min-w-0 h-full text-center text-[17px] font-bold tabular bg-transparent focus:outline-none" value={value} disabled={disabled} data-testid={testId}
          onChange={e => onChange(Math.max(min, Math.min(9999, Number(e.target.value.replace(/\D/g, '')) || 0)))} onFocus={e => e.target.select()} />
        <button type="button" className="w-11 h-full flex items-center justify-center text-stone-600 active:bg-stone-100 disabled:opacity-30" disabled={disabled}
          onClick={() => onChange(Math.min(9999, value + 1))} aria-label={`Tăng ${label}`}><Plus className="w-4 h-4" /></button>
      </div>
    </div>
  );

/** Nhập 1 vụ việc: loại, lĩnh vực (có tìm kiếm), nội dung; hệ thống tự đọc số đối tượng, thông tin đối tượng, thời gian, địa điểm */
export const IncidentEdit: React.FC<{
  id?: string; n: number; i: DailyIncident; others: DailyOtherIncident[]; isFlash?: boolean; disabled?: boolean;
  onChange: (p: Partial<DailyIncident>) => void; onRemove?: () => void;
}> = ({ id, n, i, others, isFlash, disabled, onChange, onRemove }) => {
  const filled = !!(i.severity || i.damage || i.handling || i.handlingNote || i.victims || i.dupOf);
  const [more, setMore] = useState(filled);
  const [q, setQ] = useState('');
  const [pickField, setPickField] = useState(!i.field);
  // Trường người dùng đã tự sửa thì không tự điền đè nữa
  const manual = useRef<{ suspects: boolean; info: boolean; time: boolean; place: boolean }>({
    suspects: false, info: !!i.suspectInfo, time: !!i.occurredAt, place: !!i.location
  });
  const [auto, setAuto] = useState(false);
  const idWarn = incidentError(i)?.startsWith('Có dãy số');

  // Tự đọc nội dung (0,5 giây sau khi ngừng gõ)
  useEffect(() => {
    if (disabled || (i.summary || '').trim().length < 10) return;
    const t = window.setTimeout(() => {
      const p = parseIncidentText(i.summary);
      const patch: Partial<DailyIncident> = {};
      if (!manual.current.suspects && p.suspects > 0 && p.suspects !== i.suspects) patch.suspects = p.suspects;
      if (!manual.current.info && p.suspectInfo && p.suspectInfo !== (i.suspectInfo || '')) patch.suspectInfo = p.suspectInfo;
      if (!manual.current.time && p.occurredAt && p.occurredAt !== (i.occurredAt || '')) patch.occurredAt = p.occurredAt;
      if (!manual.current.place && p.location && p.location !== (i.location || '')) patch.location = p.location;
      if (Object.keys(patch).length) { onChange(patch); setAuto(true); }
    }, 500);
    return () => window.clearTimeout(t);
  }, [i.summary]); // eslint-disable-line react-hooks/exhaustive-deps

  const fields = q.trim() ? FIELDS.filter(f => noAccent(f).includes(noAccent(q.trim()))) : FIELDS;
  const autoTag = auto ? <span className="ml-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 rounded px-1.5 py-0.5">tự điền</span> : null;

  return (
    <div id={id} className={`${card} p-3.5`} data-testid="daily-incident-card">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="font-bold text-[16px] text-stone-900">Vụ việc {n}</div>
        {isFlash && <Chip tone="red">Đã báo nhanh</Chip>}
        {onRemove && !disabled && <button className="ml-auto p-2 -mr-1 rounded-lg text-stone-400 hover:text-red-700 hover:bg-red-50" onClick={onRemove} aria-label="Xoá vụ việc"><Trash2 className="w-5 h-5" /></button>}
      </div>

      <label className={lbl}>Loại *</label>
      <div className="grid grid-cols-2 gap-2 mb-3" role="radiogroup" aria-label="Loại vụ việc" data-testid="inc-kind">
        {KINDS.map(k => (
          <button key={k} type="button" role="radio" aria-checked={i.kind === k} disabled={disabled} onClick={() => onChange({ kind: k })}
            className={`h-12 rounded-xl border-2 font-bold text-[15px] ${i.kind === k ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-stone-200 bg-white text-stone-700'}`}>{k}</button>
        ))}
      </div>

      <label className={lbl}>Lĩnh vực *</label>
      {i.field && !pickField ? (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 min-h-12 px-3 py-2 rounded-xl border-2 border-brand-700 bg-brand-50 text-brand-800 font-semibold text-[15px] flex items-center">{i.field}</div>
          {!disabled && <button type="button" className={`${btnSecondary} h-12`} onClick={() => { setPickField(true); setQ(''); }}>Đổi</button>}
        </div>
      ) : (
        <div className="mb-3">
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input className={`${inBig} pl-9`} value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm lĩnh vực" disabled={disabled} data-testid="inc-field-search" />
          </div>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Lĩnh vực" data-testid="inc-field">
            {fields.map(f => (
              <button key={f} type="button" role="radio" aria-checked={i.field === f} disabled={disabled} onClick={() => { onChange({ field: f }); setPickField(false); setQ(''); }}
                className={`min-h-11 px-2.5 py-1.5 rounded-xl border text-left text-[14px] leading-snug ${i.field === f ? 'border-brand-700 bg-brand-50 text-brand-800 font-semibold' : 'border-stone-200 bg-white text-stone-700'}`}>{f}</button>
            ))}
            {fields.length === 0 && <div className="col-span-2 text-[14px] text-stone-500 py-2">Không thấy — chọn "Khác".</div>}
          </div>
        </div>
      )}

      <label className={lbl}>Nội dung vụ việc *</label>
      <textarea className={`${inBig} h-36 py-2.5 leading-relaxed`} value={i.summary} onChange={e => onChange({ summary: e.target.value })} disabled={disabled} data-testid="inc-summary" />

      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <Stepper label="Số vụ việc *" value={i.cases} min={1} disabled={disabled} onChange={v => onChange({ cases: v })} testId="inc-cases" />
        <Stepper label="Số đối tượng" value={i.suspects} disabled={disabled} onChange={v => { manual.current.suspects = true; onChange({ suspects: v }); }} testId="inc-suspects" />
      </div>

      <div className="mt-3">
        <label className={lbl}>Thông tin đối tượng{i.suspectInfo ? autoTag : null}</label>
        <textarea className={`${inBig} h-24 py-2.5 leading-relaxed`} value={i.suspectInfo || ''} disabled={disabled} data-testid="inc-suspect-info"
          onChange={e => { manual.current.info = true; onChange({ suspectInfo: e.target.value }); }} />
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <div><label className={lbl}>Thời gian</label><input className={inBig} value={i.occurredAt || ''} disabled={disabled}
          onChange={e => { manual.current.time = true; onChange({ occurredAt: e.target.value }); }} /></div>
        <div><label className={lbl}>Địa điểm</label><input className={inBig} value={i.location || ''} disabled={disabled}
          onChange={e => { manual.current.place = true; onChange({ location: e.target.value }); }} /></div>
      </div>

      {!more ? (
        <button type="button" className="mt-3 text-[14px] font-semibold text-stone-600 inline-flex items-center gap-1 h-9" onClick={() => setMore(true)}>
          <ChevronDown className="w-4 h-4" />Thêm chi tiết</button>
      ) : (
        <div className="mt-3 pt-3 border-t border-stone-100 space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div><label className={lbl}>Mức độ</label>
              <select className={inBig} value={i.severity || ''} onChange={e => onChange({ severity: e.target.value })} disabled={disabled}>
                <option value="">—</option>{SEVERITIES.map(f => <option key={f}>{f}</option>)}</select></div>
            <Stepper label="Bị hại, thương vong" value={i.victims} disabled={disabled} onChange={v => onChange({ victims: v })} />
          </div>
          <div><label className={lbl}>Thiệt hại</label><input className={inBig} value={i.damage || ''} onChange={e => onChange({ damage: e.target.value })} disabled={disabled} /></div>
          <div><label className={lbl}>Tình trạng xử lý</label>
            <select className={inBig} value={i.handling || ''} onChange={e => onChange({ handling: e.target.value })} disabled={disabled}>
              <option value="">—</option>{HANDLINGS.map(f => <option key={f}>{f}</option>)}</select></div>
          <div><label className={lbl}>Kết quả xử lý, kiến nghị</label><input className={inBig} value={i.handlingNote || ''} onChange={e => onChange({ handlingNote: e.target.value })} disabled={disabled} /></div>
          {others.length > 0 && (
            <div>
              <label className={lbl}>Trùng vụ việc đầu mối khác đã báo?</label>
              <select className={inBig} value={i.dupOf || ''} onChange={e => onChange({ dupOf: e.target.value || null })} disabled={disabled} data-testid="inc-dup">
                <option value="">Không trùng</option>
                {others.map(o => <option key={o.key} value={o.key}>{o.unitName}: {o.field} – {o.summary.slice(0, 50)}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
      {idWarn && <div className="mt-2 text-[14px] text-red-700">Có dãy số giống số CCCD/điện thoại — xoá trước khi nộp.</div>}
    </div>
  );
};

export const IncidentView: React.FC<{ i: DailyIncident; n: number; others?: DailyOtherIncident[]; dupLabel?: string | null }> = ({ i, n, others, dupLabel }) => {
  const dup = dupLabel !== undefined ? dupLabel : (i.dupOf ? (others || []).find(o => o.key === i.dupOf) : null);
  return (
    <div className={`border-t border-stone-100 pt-2.5 mt-2.5 text-[15px] ${dup ? 'opacity-60' : ''}`} data-testid="daily-incident-view">
      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
        <b className="text-stone-900">{n}. {i.kind ? `${i.kind} – ` : ''}{i.field}</b>
        {i.severity && <Chip tone={/Rất|Đặc biệt/.test(i.severity) ? 'red' : 'amber'}>{i.severity}</Chip>}
        {i.flash && <Chip tone="red">Báo nhanh</Chip>}
        {dup && <Chip>Trùng: {typeof dup === 'string' ? dup : `${dup.unitName}`}</Chip>}
      </div>
      {(i.occurredAt || i.location) && <div className="text-[13px] text-stone-500">{[i.occurredAt, i.location].filter(Boolean).join(' · ')}</div>}
      <div className="text-stone-800 whitespace-pre-line">{i.summary}</div>
      {i.suspectInfo && <div className="text-[13px] text-stone-700 mt-0.5 whitespace-pre-line"><b>Đối tượng:</b> {i.suspectInfo}</div>}
      <div className="text-[13px] text-stone-600 mt-0.5">
        <b>{i.cases}</b> vụ · <b>{i.suspects}</b> đối tượng{i.victims ? <> · <b>{i.victims}</b> bị hại</> : null}
        {i.damage ? ` · Thiệt hại: ${i.damage}` : ''}{i.handling ? ` · ${i.handling}` : ''}{i.handlingNote ? ` – ${i.handlingNote}` : ''}
      </div>
    </div>
  );
};

/** Báo cáo nhanh 1 vụ việc nghiêm trọng (gửi thông báo ngay cho chỉ huy) */
const FlashSheet: React.FC<{ open: boolean; unit: DailyUnit; onClose: () => void; onDone: () => void }> = ({ open, unit, onClose, onDone }) => {
  const [i, setI] = useState<DailyIncident>(blankIncident());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (open) { setI({ ...blankIncident(), severity: 'Nghiêm trọng' }); setMsg(''); } }, [open]);
  const send = async () => {
    const e = incidentError(i); if (e) { setMsg(e); return; }
    setBusy(true);
    const r = await Daily.flash(unit, i);
    setBusy(false);
    if (!r.ok) { setMsg(r.message || 'Không gửi được.'); return; }
    onDone();
  };
  return (
    <Sheet open={open} onClose={onClose} title={<span className="inline-flex items-center gap-2"><Siren className="w-5 h-5 text-red-700" />Báo cáo nhanh · {unitName(unit)}</span>} testId="daily-flash"
      footer={<><button className={btnSecondary} onClick={onClose}><X className="w-4 h-4" />Huỷ</button>
        <button className={`${btnPrimary} bg-red-700 flex-1 md:flex-none`} onClick={send} disabled={busy} data-testid="daily-flash-send">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Gửi ngay cho chỉ huy</button></>}>
      <IncidentEdit n={1} i={i} others={[]} onChange={p => setI(x => ({ ...x, ...p }))} />
      {msg && <div className="mt-3 text-[14px] text-red-700 bg-red-50 rounded-xl px-3 py-2">{msg}</div>}
    </Sheet>
  );
};

