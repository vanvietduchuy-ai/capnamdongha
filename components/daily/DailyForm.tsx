import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, Clock, History, Loader2, Plus, ShieldAlert, Siren, Trash2, X, Zap } from 'lucide-react';
import { DailyIncident, DailyOtherIncident, DailyReport, DailyStatus, DailyUnit, User } from '../../types';
import {
  blankIncident, Daily, DailyGet, dayText, FIELDS, HANDLINGS, incidentError, periodText, ROLE_TEXT, SEVERITIES, unitName, vnDateTime, weekdayText
} from '../../services/dailyReportService';
import { btnPrimary, btnSecondary, card, Chip, inputCls, labelCls, Sheet } from '../learning/common';
import { HistorySheet } from './DailyBoard';

interface Props {
  me: User;
  day: string;
  unit: DailyUnit;
  deadline: string;         // HH:MM
  clockOffset: number;      // serverNow - Date.now()
  onBack: () => void;
  onSubmitted: () => void;
}

const draftKey = (day: string, unit: string) => `daily_draft:${day}:${unit}`;
type Draft = { status: DailyStatus | null; note: string; incidents: DailyIncident[] };
const loadDraft = (day: string, unit: string): Draft | null => {
  try { const s = localStorage.getItem(draftKey(day, unit)); return s ? JSON.parse(s) : null; } catch { return null; }
};
const saveDraft = (day: string, unit: string, d: Draft | null) => {
  try { if (d) localStorage.setItem(draftKey(day, unit), JSON.stringify(d)); else localStorage.removeItem(draftKey(day, unit)); } catch { /* bỏ qua */ }
};

const fmtLeft = (ms: number) => {
  if (ms <= 0) return '';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  return h ? `${h} giờ ${m % 60} phút` : `${m} phút`;
};

/** Biểu mẫu báo cáo ngày của 1 đầu mối */
export const DailyForm: React.FC<Props> = ({ me, day, unit, deadline, clockOffset, onBack, onSubmitted }) => {
  const [info, setInfo] = useState<Partial<DailyGet> | null>(null);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [note, setNote] = useState('');
  const [incidents, setIncidents] = useState<DailyIncident[]>([]);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState<DailyReport | null>(null);
  const [editing, setEditing] = useState(false);
  const [flashOpen, setFlashOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [now, setNow] = useState(Date.now() + clockOffset);

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now() + clockOffset), 30000); return () => window.clearInterval(t); }, [clockOffset]);

  const load = async () => {
    setErr(''); setInfo(null);
    const r = await Daily.get(day, unit);
    if (!r.ok) { setErr(r.message || 'Không tải được biểu mẫu.'); return; }
    setInfo(r);
    const rep = r.unitInfo?.report || null;
    const draft = loadDraft(day, unit);
    const fl = r.unitInfo?.flash || [];
    if (rep) {
      // Đã có bản nộp: hiện bản nộp; bấm "Bổ sung / đính chính" mới soạn tiếp
      setStatus(rep.status); setNote(rep.note || ''); setIncidents(rep.incidents.map(i => ({ ...i })));
      saveDraft(day, unit, null);
    } else if (draft && (draft.status || draft.incidents?.length || draft.note)) {
      // Nháp đang soạn dở trên máy này; thêm các báo cáo nhanh chưa có trong nháp
      const keys = new Set((draft.incidents || []).map(i => i.key));
      const extra = fl.filter(f => !keys.has(f.key)).map(f => ({ ...f.data, key: f.key, flash: true }));
      setStatus(extra.length ? 'INCIDENT' : draft.status); setNote(draft.note || ''); setIncidents([...(draft.incidents || []), ...extra]);
    } else if (fl.length) {
      // Có báo cáo nhanh mà chưa có báo cáo ngày → điền sẵn
      setStatus('INCIDENT'); setIncidents(fl.map(f => ({ ...f.data, key: f.key, flash: true })));
    }
    setEditing(!rep);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [day, unit]);

  // Lưu nháp trên máy khi đang soạn
  useEffect(() => {
    if (!info || !editing) return;
    saveDraft(day, unit, status || incidents.length || note ? { status, note, incidents } : null);
  }, [status, note, incidents, editing, info, day, unit]);

  const rep = info?.unitInfo?.report || null;
  const flashKeys = useMemo(() => new Set((info?.unitInfo?.flash || []).map(f => f.key)), [info]);
  const deadlineAt = info?.deadlineAt || 0;
  const past = deadlineAt > 0 && now > deadlineAt;
  const needReason = !!rep && past;
  const canSubmit = !!info?.canSubmit;
  const isCurrent = info?.currentDay === day;

  const setInc = (k: number, patch: Partial<DailyIncident>) => { setMsg(''); setIncidents(list => list.map((x, i) => (i === k ? { ...x, ...patch } : x))); };
  const removeInc = (k: number) => setIncidents(list => list.filter((_, i) => i !== k));

  const submit = async () => {
    setMsg('');
    if (!status) { setMsg('Chọn "Bình thường" hoặc "Có vụ việc".'); return; }
    if (status === 'INCIDENT') {
      if (!incidents.length) { setMsg('Thêm ít nhất 1 vụ việc.'); return; }
      for (let k = 0; k < incidents.length; k++) {
        const e = incidentError(incidents[k]);
        if (e) { setMsg(`Vụ việc thứ ${k + 1}: ${e}`); document.getElementById(`inc-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      }
    }
    if (needReason && reason.trim().length < 5) { setMsg('Đã qua hạn nộp: ghi lý do đính chính.'); return; }
    if (!confirm) { setMsg('Đánh dấu ô xác nhận chịu trách nhiệm trước khi nộp.'); return; }
    setBusy(true);
    const r = await Daily.submit({ day, unit, status, note, incidents: status === 'INCIDENT' ? incidents : [], reason, confirm });
    setBusy(false);
    if (!r.ok || !r.report) { setMsg(r.message || 'Không nộp được báo cáo.'); return; }
    saveDraft(day, unit, null);
    setDone(r.report); setEditing(false); setConfirm(false); setReason('');
    onSubmitted();
  };

  const header = (
    <div className="flex items-start gap-2 mb-4">
      <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-stone-100" aria-label="Quay lại"><ChevronLeft className="w-5 h-5" /></button>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-stone-900 text-lg leading-tight">Báo cáo ngày · {unitName(unit)}</div>
        <div className="text-[13px] text-stone-500">{weekdayText(day)}, {dayText(day)} · Kỳ báo cáo {periodText(day, deadline)}</div>
      </div>
    </div>
  );

  if (err) return <div>{header}<div className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm" data-testid="daily-form-error">{err}</div></div>;
  if (!info) return <div>{header}<div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div></div>;

  // ---------- Đã nộp / vừa nộp xong ----------
  const shown = done || rep;
  if (shown && !editing) {
    const totalCases = shown.incidents.reduce((s, i) => s + i.cases, 0);
    return (
      <div className="max-w-3xl" data-testid="daily-form">
        {header}
        {done && <div className="mb-3 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-3 text-sm flex gap-2" data-testid="daily-done">
          <CheckCircle2 className="w-5 h-5 shrink-0" />Đã nộp báo cáo (phiên bản {done.version}){done.late ? ' — nộp muộn' : ''}. Bản đã nộp được lưu lại, không sửa được; nếu cần đính chính thì nộp bản mới.</div>}
        <div className={`${card} p-4`}>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {shown.status === 'NORMAL' ? <Chip tone="green">Bình thường</Chip> : <Chip tone="orange">Có vụ việc · {shown.incidents.length} nội dung, {totalCases} vụ</Chip>}
            {shown.late && <Chip tone="red">Nộp muộn</Chip>}
            <span className="text-[13px] text-stone-500">Đ/c {shown.reporterName} ({ROLE_TEXT[shown.reporterRole] || shown.reporterRole}) · {vnDateTime(shown.submittedAt)} · phiên bản {shown.version}</span>
          </div>
          {shown.reason && <div className="text-[13px] text-stone-600 mb-2">Lý do đính chính: {shown.reason}</div>}
          {shown.note && <div className="text-sm text-stone-700 mb-2 whitespace-pre-line">{shown.note}</div>}
          {shown.incidents.map((i, k) => <IncidentView key={i.key} i={i} n={k + 1} others={info.others || []} />)}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {canSubmit && <button className={btnPrimary} onClick={() => { setStatus(shown.status); setNote(shown.note || ''); setIncidents(shown.incidents.map(i => ({ ...i }))); setEditing(true); setDone(null); }} data-testid="daily-revise">
            Bổ sung / đính chính</button>}
          {canSubmit && isCurrent && <button className={btnSecondary} onClick={() => setFlashOpen(true)}><Siren className="w-4 h-4" />Báo cáo nhanh vụ việc</button>}
          {(info.unitInfo?.versions || 0) > 1 && <button className={btnSecondary} onClick={() => setHistoryOpen(true)}><History className="w-4 h-4" />Lịch sử ({info.unitInfo?.versions} phiên bản)</button>}
          <button className={btnSecondary} onClick={onBack}>Xong</button>
        </div>
        <FlashSheet open={flashOpen} unit={unit} onClose={() => setFlashOpen(false)} onDone={() => { setFlashOpen(false); load(); }} />
        <HistorySheet open={historyOpen} day={day} unit={unit} onClose={() => setHistoryOpen(false)} />
      </div>
    );
  }

  // ---------- Soạn báo cáo ----------
  const left = deadlineAt - now;
  return (
    <div className="max-w-3xl pb-4" data-testid="daily-form">
      {header}
      {!canSubmit && <div className="mb-3 rounded-lg bg-amber-50 text-amber-900 px-4 py-3 text-sm">Đồng chí không được phân công báo cáo cho đầu mối này nên chỉ xem được.</div>}
      <div className={`mb-3 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2 ${past ? 'bg-red-50 text-red-800' : 'bg-stone-100 text-stone-700'}`}>
        <Clock className="w-4 h-4 shrink-0" />
        {past ? <span>Đã quá hạn nộp ({vnDateTime(deadlineAt)}). Báo cáo sẽ ghi <b>nộp muộn</b>{rep ? ', đính chính phải ghi lý do' : ''}.</span>
          : <span>Hạn nộp <b>{vnDateTime(deadlineAt)}</b>{left > 0 ? ` · còn ${fmtLeft(left)}` : ''}. {info.role ? `Đồng chí báo cáo với vai trò ${ROLE_TEXT[info.role]?.toLowerCase()}.` : ''}</span>}
      </div>
      {rep && <div className="mb-3 rounded-lg bg-blue-50 text-blue-900 px-4 py-2.5 text-sm">Đang đính chính bản đã nộp lúc {vnDateTime(rep.submittedAt)} (phiên bản {rep.version}, đ/c {rep.reporterName}). Bản cũ vẫn được lưu.</div>}

      {/* Bước 1: tình hình */}
      <div className="grid grid-cols-2 gap-2 mb-4" role="radiogroup" aria-label="Tình hình trong kỳ">
        <button role="radio" aria-checked={status === 'NORMAL'} disabled={!canSubmit} onClick={() => setStatus('NORMAL')} data-testid="daily-normal"
          className={`rounded-xl border-2 p-4 text-left transition-colors ${status === 'NORMAL' ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 bg-white hover:border-stone-300'}`}>
          <CheckCircle2 className={`w-7 h-7 mb-1 ${status === 'NORMAL' ? 'text-emerald-600' : 'text-stone-300'}`} />
          <div className="font-bold text-stone-900">Bình thường</div>
          <div className="text-[12px] text-stone-500">Không phát sinh vụ việc</div>
        </button>
        <button role="radio" aria-checked={status === 'INCIDENT'} disabled={!canSubmit} onClick={() => { setStatus('INCIDENT'); if (!incidents.length) setIncidents([blankIncident()]); }} data-testid="daily-incident"
          className={`rounded-xl border-2 p-4 text-left transition-colors ${status === 'INCIDENT' ? 'border-orange-600 bg-orange-50' : 'border-stone-200 bg-white hover:border-stone-300'}`}>
          <AlertTriangle className={`w-7 h-7 mb-1 ${status === 'INCIDENT' ? 'text-orange-600' : 'text-stone-300'}`} />
          <div className="font-bold text-stone-900">Có vụ việc</div>
          <div className="text-[12px] text-stone-500">Nhập từng vụ việc</div>
        </button>
      </div>
      {status === 'NORMAL' && flashKeys.size > 0 && <div className="mb-3 rounded-lg bg-red-50 text-red-800 px-4 py-2.5 text-sm">Đầu mối đã báo cáo nhanh {flashKeys.size} vụ việc trong kỳ này nên không thể báo "Bình thường".</div>}

      {status === 'INCIDENT' && (
        <>
          <div className="mb-3 rounded-lg bg-amber-50 text-amber-900 px-4 py-2.5 text-[13px] flex gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span><b>Không nhập</b> họ tên, số CCCD, số điện thoại, địa chỉ cụ thể của đối tượng, bị hại. Chỉ ghi số lượng và tóm tắt. Không đưa nội dung mật.</span>
          </div>
          <div className="space-y-3">
            {incidents.map((i, k) => (
              <IncidentEdit key={i.key} id={`inc-${k}`} n={k + 1} i={i} others={info.others || []} isFlash={flashKeys.has(i.key)} disabled={!canSubmit}
                onChange={p => setInc(k, p)} onRemove={incidents.length > 1 && !flashKeys.has(i.key) ? () => removeInc(k) : undefined} />
            ))}
          </div>
          {canSubmit && <button className={`${btnSecondary} w-full mt-3`} onClick={() => setIncidents(l => [...l, blankIncident()])} data-testid="daily-add-incident"><Plus className="w-4 h-4" />Thêm vụ việc</button>}
        </>
      )}

      {status && (
        <div className="mt-4 space-y-3">
          <div>
            <label className={labelCls}>Tình hình chung, ghi chú, kiến nghị <span className="font-normal text-stone-500">(không bắt buộc)</span></label>
            <textarea className={`${inputCls} h-20 py-2`} value={note} onChange={e => setNote(e.target.value)} disabled={!canSubmit} maxLength={3000} data-testid="daily-note" />
          </div>
          {needReason && (
            <div>
              <label className={labelCls}>Lý do đính chính (bắt buộc vì đã qua hạn)</label>
              <input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="VD: Bổ sung vụ việc tiếp nhận sau khi đã báo cáo" data-testid="daily-reason" />
            </div>
          )}
          {canSubmit && (
            <label className={`flex gap-3 items-start rounded-xl border-2 p-3 cursor-pointer ${confirm ? 'border-brand-700 bg-brand-50' : 'border-stone-200 bg-white'}`} data-testid="daily-confirm">
              <input type="checkbox" className="mt-1 w-5 h-5 accent-brand-700 shrink-0" checked={confirm} onChange={e => { setConfirm(e.target.checked); setMsg(''); }} />
              <span className="text-sm text-stone-800">
                Tôi, <b>{me.fullName}</b>, xác nhận {status === 'NORMAL'
                  ? <>trong kỳ báo cáo, lĩnh vực, địa bàn do <b>{unitName(unit)}</b> phụ trách <b>không phát sinh vụ việc</b></>
                  : <>nội dung <b>{incidents.length} vụ việc</b> nêu trên là đầy đủ, chính xác</>} và chịu trách nhiệm trước Ban Chỉ huy Công an phường về kết quả báo cáo này.
              </span>
            </label>
          )}
          {msg && <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2" data-testid="daily-msg">{msg}</div>}
          {canSubmit && (
            <div className="sticky bottom-0 md:static -mx-3 md:mx-0 px-3 md:px-0 py-3 md:py-0 bg-stone-50/95 md:bg-transparent backdrop-blur md:backdrop-blur-none flex gap-2"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              {rep && <button className={btnSecondary} onClick={() => { setEditing(false); saveDraft(day, unit, null); }}>Huỷ</button>}
              <button className={`${btnPrimary} flex-1`} onClick={submit} disabled={busy} data-testid="daily-submit">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}{rep ? 'Nộp bản đính chính' : 'Nộp báo cáo'}
              </button>
            </div>
          )}
        </div>
      )}
      {canSubmit && isCurrent && !rep && (
        <button className="mt-5 text-sm font-semibold text-red-700 inline-flex items-center gap-1.5" onClick={() => setFlashOpen(true)} data-testid="daily-flash-open">
          <Zap className="w-4 h-4" />Có vụ việc nghiêm trọng cần báo ngay? Báo cáo nhanh</button>
      )}
      <FlashSheet open={flashOpen} unit={unit} onClose={() => setFlashOpen(false)} onDone={() => { setFlashOpen(false); load(); }} />
    </div>
  );
};

/** Nhập 1 vụ việc */
export const IncidentEdit: React.FC<{
  id?: string; n: number; i: DailyIncident; others: DailyOtherIncident[]; isFlash?: boolean; disabled?: boolean;
  onChange: (p: Partial<DailyIncident>) => void; onRemove?: () => void;
}> = ({ id, n, i, others, isFlash, disabled, onChange, onRemove }) => {
  const num = (v: string) => Math.max(0, Math.min(9999, Number(v.replace(/\D/g, '')) || 0));
  const idWarn = incidentError(i)?.startsWith('Có dãy số');
  return (
    <div id={id} className={`${card} p-3 md:p-4`} data-testid="daily-incident-card">
      <div className="flex items-center gap-2 mb-2">
        <div className="font-bold text-stone-900">Vụ việc {n}</div>
        {isFlash && <Chip tone="red">Đã báo cáo nhanh</Chip>}
        {onRemove && !disabled && <button className="ml-auto p-1.5 rounded-lg text-stone-400 hover:text-red-700 hover:bg-red-50" onClick={onRemove} aria-label="Xoá vụ việc"><Trash2 className="w-4 h-4" /></button>}
      </div>
      <div className="grid md:grid-cols-2 gap-2.5">
        <div>
          <label className={labelCls}>Lĩnh vực *</label>
          <select className={inputCls} value={i.field} onChange={e => onChange({ field: e.target.value })} disabled={disabled} data-testid="inc-field">
            <option value="">— Chọn lĩnh vực —</option>{FIELDS.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Mức độ</label>
          <select className={inputCls} value={i.severity || ''} onChange={e => onChange({ severity: e.target.value })} disabled={disabled}>
            <option value="">— Không xác định —</option>{SEVERITIES.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Thời gian xảy ra / tiếp nhận</label>
          <input className={inputCls} value={i.occurredAt || ''} onChange={e => onChange({ occurredAt: e.target.value })} disabled={disabled} placeholder="VD: 21h30 ngày 02/10" />
        </div>
        <div>
          <label className={labelCls}>Địa điểm</label>
          <input className={inputCls} value={i.location || ''} onChange={e => onChange({ location: e.target.value })} disabled={disabled} placeholder="VD: Tổ dân phố 3" />
        </div>
      </div>
      <div className="mt-2.5">
        <label className={labelCls}>Nội dung vụ việc *</label>
        <textarea className={`${inputCls} h-24 py-2`} value={i.summary} onChange={e => onChange({ summary: e.target.value })} disabled={disabled} data-testid="inc-summary"
          placeholder="Tóm tắt diễn biến, không ghi họ tên, số định danh" />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2.5">
        <div><label className={labelCls}>Số vụ việc *</label><input inputMode="numeric" className={inputCls} value={i.cases} onChange={e => onChange({ cases: Math.max(1, num(e.target.value)) })} disabled={disabled} data-testid="inc-cases" /></div>
        <div><label className={labelCls}>Số đối tượng</label><input inputMode="numeric" className={inputCls} value={i.suspects} onChange={e => onChange({ suspects: num(e.target.value) })} disabled={disabled} data-testid="inc-suspects" /></div>
        <div><label className={labelCls}>Bị hại</label><input inputMode="numeric" className={inputCls} value={i.victims} onChange={e => onChange({ victims: num(e.target.value) })} disabled={disabled} /></div>
      </div>
      <div className="grid md:grid-cols-2 gap-2.5 mt-2.5">
        <div><label className={labelCls}>Thiệt hại</label><input className={inputCls} value={i.damage || ''} onChange={e => onChange({ damage: e.target.value })} disabled={disabled} placeholder="VD: 1 xe máy, khoảng 30 triệu đồng" /></div>
        <div>
          <label className={labelCls}>Tình trạng xử lý</label>
          <select className={inputCls} value={i.handling || ''} onChange={e => onChange({ handling: e.target.value })} disabled={disabled}>
            <option value="">—</option>{HANDLINGS.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-2.5">
        <label className={labelCls}>Kết quả xử lý, đơn vị thụ lý, kiến nghị</label>
        <input className={inputCls} value={i.handlingNote || ''} onChange={e => onChange({ handlingNote: e.target.value })} disabled={disabled} />
      </div>
      {others.length > 0 && (
        <div className="mt-2.5">
          <label className={labelCls}>Trùng với vụ việc đầu mối khác đã báo? <span className="font-normal text-stone-500">(để không cộng 2 lần)</span></label>
          <select className={inputCls} value={i.dupOf || ''} onChange={e => onChange({ dupOf: e.target.value || null })} disabled={disabled} data-testid="inc-dup">
            <option value="">Không trùng — vụ việc mới</option>
            {others.map(o => <option key={o.key} value={o.key}>{o.unitName}: {o.field}{o.location ? ` – ${o.location}` : ''} – {o.summary.slice(0, 70)}</option>)}
          </select>
        </div>
      )}
      {idWarn && <div className="mt-2 text-[13px] text-red-700">Có dãy số giống số CCCD/điện thoại. Xoá thông tin định danh trước khi nộp.</div>}
    </div>
  );
};

export const IncidentView: React.FC<{ i: DailyIncident; n: number; others?: DailyOtherIncident[]; dupLabel?: string | null }> = ({ i, n, others, dupLabel }) => {
  const dup = dupLabel !== undefined ? dupLabel : (i.dupOf ? (others || []).find(o => o.key === i.dupOf) : null);
  return (
    <div className={`border-t border-stone-100 pt-2.5 mt-2.5 text-sm ${dup ? 'opacity-60' : ''}`} data-testid="daily-incident-view">
      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
        <b className="text-stone-900">{n}. {i.field}</b>
        {i.severity && <Chip tone={/Rất|Đặc biệt/.test(i.severity) ? 'red' : 'amber'}>{i.severity}</Chip>}
        {i.flash && <Chip tone="red">Báo cáo nhanh</Chip>}
        {dup && <Chip>Trùng: {typeof dup === 'string' ? dup : `${dup.unitName}`}</Chip>}
      </div>
      {(i.occurredAt || i.location) && <div className="text-[13px] text-stone-500">{[i.occurredAt, i.location].filter(Boolean).join(' · ')}</div>}
      <div className="text-stone-800 whitespace-pre-line">{i.summary}</div>
      <div className="text-[13px] text-stone-600 mt-0.5">
        <b>{i.cases}</b> vụ · <b>{i.suspects}</b> đối tượng{i.victims ? <> · <b>{i.victims}</b> bị hại/thương vong</> : null}
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
        <button className={`${btnPrimary} bg-red-700`} onClick={send} disabled={busy} data-testid="daily-flash-send">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Gửi báo cáo nhanh</button></>}>
      <p className="text-[13px] text-stone-600 mb-3">Dùng cho vụ việc nghiêm trọng cần chỉ huy biết ngay. Chỉ huy và Tổ Tổng hợp nhận thông báo trong app. Vụ việc tự đưa vào báo cáo ngày của kỳ này. Vẫn phải báo cáo trực tiếp theo quy định.</p>
      <IncidentEdit n={1} i={i} others={[]} onChange={p => setI(x => ({ ...x, ...p }))} />
      {msg && <div className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{msg}</div>}
    </Sheet>
  );
};
