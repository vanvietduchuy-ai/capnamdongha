import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, ChevronLeft, ChevronRight, FileText, History, Loader2, RefreshCw, Siren } from 'lucide-react';
import { DailyIncident, DailyReport, DailyUnit } from '../../types';
import {
  addDays, boardIncidents, Daily, DailyBoard as Board, dayText, dupTarget, exportDailyWord, periodText, ROLE_TEXT, Signer, totalsByField, unitName, vnDateTime, vnTime, weekdayText
} from '../../services/dailyReportService';
import { btnPrimary, btnSecondary, card, Chip, inputCls, labelCls, Sheet } from '../learning/common';
import { IncidentView } from './DailyForm';

interface Props { initialDay: string; deadline: string; }

const SIGNER_KEY = 'daily_signer';
export const loadSigner = (): Signer => { try { return JSON.parse(localStorage.getItem(SIGNER_KEY) || '') as Signer; } catch { return { chucDanh: 'TRƯỞNG CÔNG AN PHƯỜNG', hoTen: '' }; } };
const saveSigner = (s: Signer) => { try { localStorage.setItem(SIGNER_KEY, JSON.stringify(s)); } catch { /* bỏ qua */ } };

/** Bảng theo dõi báo cáo ngày (chỉ huy, Tổ Tổng hợp; tổ trưởng xem tổ mình) */
export const DailyBoardView: React.FC<Props> = ({ initialDay, deadline }) => {
  const [day, setDay] = useState(initialDay);
  const [b, setB] = useState<Partial<Board> | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState('');
  const [hist, setHist] = useState<DailyUnit | null>(null);
  const [signOpen, setSignOpen] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) { setB(null); setErr(''); }
    setRefreshing(true);
    const r = await Daily.board(day);
    setRefreshing(false);
    if (!r.ok) { setErr(r.message || 'Không tải được bảng theo dõi.'); return; }
    setB(r);
  }, [day]);
  useEffect(() => { load(); }, [load]);
  // Tự cập nhật 30 giây/lần
  useEffect(() => { const t = window.setInterval(() => { if (document.visibilityState === 'visible') load(true); }, 30000); return () => window.clearInterval(t); }, [load]);

  const units = b?.units || [];
  const dups = b?.dups || {};
  const incs: DailyIncident[] = useMemo(() => boardIncidents({ units }), [units]);
  const tot = useMemo(() => totalsByField(incs, dups), [incs, dups]);
  const reported = units.filter(u => u.report).length;
  const late = units.filter(u => u.report?.late).length;
  const pendingFlash = units.flatMap(u => u.flash.filter(f => !(u.report?.incidents || []).some(i => i.key === f.key)).map(f => ({ ...f, unitName: u.unitName })));
  const canManage = !!b?.canManage;
  const current = b?.currentDay || initialDay;

  const keyLabel = (key: string) => {
    const i = incs.find(x => x.key === key);
    return i ? `${unitName(i.unit)}: ${i.field}` : 'vụ việc khác';
  };
  const markDup = async (i: DailyIncident, target: string) => {
    const r = await Daily.markDup(day, i.key, target === '__none' ? null : target, target === '__reset');
    if (!r.ok) setMsg(r.message || 'Không lưu được.'); else load(true);
  };
  const remind = async () => {
    const r = await Daily.remind(day);
    setMsg(r.ok ? (r.sent ? `Đã gửi nhắc tới ${r.sent} cán bộ.` : 'Không có ai để nhắc (đã báo đủ hoặc chưa phân công).') : r.message || 'Không gửi được.');
  };

  return (
    <div data-testid="daily-board">
      {/* Chọn ngày */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1">
          <button className={`${btnSecondary} px-3`} onClick={() => setDay(d => addDays(d, -1))} aria-label="Ngày trước"><ChevronLeft className="w-4 h-4" /></button>
          <input type="date" className={`${inputCls} w-auto`} value={day} max={current} onChange={e => e.target.value && setDay(e.target.value)} data-testid="board-day" />
          <button className={`${btnSecondary} px-3`} onClick={() => setDay(d => (d < current ? addDays(d, 1) : d))} disabled={day >= current} aria-label="Ngày sau"><ChevronRight className="w-4 h-4" /></button>
        </div>
        {day !== current && <button className={btnSecondary} onClick={() => setDay(current)}>Kỳ đang mở</button>}
        <button className={`${btnSecondary} px-3 ml-auto`} onClick={() => load(true)} aria-label="Làm mới"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
      </div>
      <div className="text-[13px] text-stone-500 mb-4">{weekdayText(day)}, {dayText(day)} · Kỳ báo cáo {periodText(day, deadline)}{day === current ? ' · đang mở' : ''}</div>

      {err && <div className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm">{err}</div>}
      {!b && !err && <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>}
      {b && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
            <Stat label="Đầu mối đã báo" value={`${reported}/${units.length}`} tone={reported === units.length ? 'text-emerald-700' : 'text-red-700'} />
            <Stat label="Vụ việc" value={tot.cases} tone={tot.cases ? 'text-orange-700' : 'text-stone-900'} />
            <Stat label="Đối tượng" value={tot.suspects} />
            <Stat label="Nộp muộn" value={late} tone={late ? 'text-red-700' : 'text-stone-900'} />
          </div>

          {canManage && (
            <div className="flex flex-wrap gap-2 mb-4">
              {reported < units.length && <button className={btnSecondary} onClick={remind} data-testid="board-remind"><BellRing className="w-4 h-4" />Nhắc đầu mối chưa báo</button>}
              <button className={btnPrimary} onClick={() => setSignOpen(true)} data-testid="board-word"><FileText className="w-4 h-4" />Xuất Word báo cáo ngày</button>
            </div>
          )}
          {msg && <div className="mb-3 text-sm rounded-lg bg-stone-100 text-stone-800 px-3 py-2">{msg}</div>}

          {pendingFlash.length > 0 && (
            <div className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 p-3" data-testid="board-flash">
              <div className="font-bold text-red-800 flex items-center gap-2 mb-1"><Siren className="w-5 h-5" />Báo cáo nhanh ({pendingFlash.length})</div>
              {pendingFlash.map(f => (
                <div key={f.id} className="text-sm text-red-900 border-t border-red-200 pt-1.5 mt-1.5">
                  <b>{f.unitName}</b> · {vnDateTime(f.createdAt)} · đ/c {f.reporterName}: <b>{f.data.field}</b>{f.data.severity ? ` (${f.data.severity})` : ''} — {f.data.summary}
                </div>
              ))}
            </div>
          )}

          {/* 6 đầu mối */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-5">
            {units.map(u => {
              const r = u.report;
              const tone = !r ? 'border-l-red-500' : r.status === 'NORMAL' ? 'border-l-emerald-500' : 'border-l-orange-500';
              return (
                <div key={u.unit} className={`${card} border-l-4 ${tone} p-3`} data-testid="board-unit" data-unit={u.unit} data-status={r?.status || 'NONE'}>
                  <div className="flex items-center gap-2">
                    <div className="font-bold text-stone-900 flex-1">{u.unitName}</div>
                    {!r ? <Chip tone="red">Chưa báo</Chip> : r.status === 'NORMAL' ? <Chip tone="green">Bình thường</Chip> : <Chip tone="orange">{r.incidents.length} vụ việc</Chip>}
                  </div>
                  {r ? (
                    <div className="text-[13px] text-stone-600 mt-1">
                      Đ/c {r.reporterName} · {vnTime(r.submittedAt)}{r.late && <span className="text-red-700 font-semibold"> · muộn</span>}
                      {u.versions > 1 && <button className="ml-1 text-brand-700 font-semibold" onClick={() => setHist(u.unit)}>· {u.versions} phiên bản</button>}
                      {r.note && <div className="text-stone-500 mt-0.5 line-clamp-2">{r.note}</div>}
                    </div>
                  ) : (
                    <div className="text-[13px] text-stone-600 mt-1">
                      {u.mainName ? <>Phân công: đ/c {u.mainName}{u.backupName ? ` (dự phòng: ${u.backupName})` : ''}</> : <span className="text-red-700">Chưa phân công người báo cáo</span>}
                    </div>
                  )}
                  {u.flash.length > 0 && <div className="mt-1"><Chip tone="red">{u.flash.length} báo cáo nhanh</Chip></div>}
                  {u.versions === 1 && r && <button className="mt-1 text-[12px] text-stone-500 inline-flex items-center gap-1" onClick={() => setHist(u.unit)}><History className="w-3.5 h-3.5" />Lịch sử</button>}
                </div>
              );
            })}
          </div>

          {/* Vụ việc theo lĩnh vực */}
          <div className={`${card} p-3 md:p-4`}>
            <div className="font-bold text-stone-900 mb-1">Vụ việc trong kỳ</div>
            {tot.rows.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tot.rows.map(r => <Chip key={r.field} tone="orange">{r.field}: {r.cases} vụ · {r.suspects} đối tượng</Chip>)}
                {tot.dupCount > 0 && <Chip>Đã gộp {tot.dupCount} vụ trùng</Chip>}
              </div>
            )}
            {incs.length === 0 && <div className="text-sm text-stone-500 py-2">Không có vụ việc.</div>}
            {incs.map((i, k) => {
              const t = dupTarget(i, dups);
              return (
                <div key={i.key + k}>
                  <div className="text-[12px] font-semibold text-stone-500 mt-3 -mb-1.5">{unitName(i.unit)}</div>
                  <IncidentView i={i} n={k + 1} dupLabel={t ? keyLabel(t) : null} />
                  {canManage && incs.length > 1 && (
                    <select className="mt-1.5 h-8 rounded-md border border-stone-300 bg-white text-[12px] px-2 max-w-full" value={Object.prototype.hasOwnProperty.call(dups, i.key) ? (dups[i.key] || '__none') : (i.dupOf ? i.dupOf : '')}
                      onChange={e => markDup(i, e.target.value)} aria-label="Gộp vụ trùng" data-testid="board-dup">
                      <option value="">{i.dupOf ? `Người báo chọn: trùng ${keyLabel(i.dupOf)}` : 'Không trùng (mặc định)'}</option>
                      <option value="__none">Khẳng định không trùng</option>
                      {incs.filter(x => x.key !== i.key && x.unit !== i.unit).map(x => <option key={x.key} value={x.key}>Trùng với {unitName(x.unit)}: {x.field} – {x.summary.slice(0, 50)}</option>)}
                      {Object.prototype.hasOwnProperty.call(dups, i.key) && <option value="__reset">Bỏ đánh dấu của Tổ Tổng hợp</option>}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      <HistorySheet open={!!hist} day={day} unit={hist || 'CSKV'} onClose={() => setHist(null)} />
      <SignerSheet open={signOpen} onClose={() => setSignOpen(false)} onExport={async s => { if (b) await exportDailyWord(b as Board, deadline, s); setSignOpen(false); }} />
    </div>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone = 'text-stone-900' }) => (
  <div className={`${card} p-3`}>
    <div className="text-[12px] text-stone-500">{label}</div>
    <div className={`text-2xl font-bold tabular ${tone}`}>{value}</div>
  </div>
);

/** Lịch sử các phiên bản đã nộp */
export const HistorySheet: React.FC<{ open: boolean; day: string; unit: DailyUnit; onClose: () => void }> = ({ open, day, unit, onClose }) => {
  const [vs, setVs] = useState<DailyReport[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) return;
    setVs(null); setErr('');
    Daily.history(day, unit).then(r => (r.ok ? setVs(r.versions) : setErr(r.message || 'Không tải được.')));
  }, [open, day, unit]);
  return (
    <Sheet open={open} onClose={onClose} title={`Lịch sử báo cáo · ${unitName(unit)} · ${dayText(day)}`} wide testId="daily-history">
      {err && <div className="text-sm text-red-700">{err}</div>}
      {!vs && !err && <Loader2 className="w-5 h-5 animate-spin text-stone-400" />}
      {vs?.map(v => (
        <div key={v.id} className={`${card} p-3 mb-2.5 ${v.active ? '' : 'opacity-75'}`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <b>Phiên bản {v.version}</b>
            {v.active ? <Chip tone="dark">Đang hiệu lực</Chip> : <Chip>Đã thay thế</Chip>}
            {v.status === 'NORMAL' ? <Chip tone="green">Bình thường</Chip> : <Chip tone="orange">{v.incidents.length} vụ việc</Chip>}
            {v.late && <Chip tone="red">Muộn</Chip>}
          </div>
          <div className="text-[13px] text-stone-600 mt-1">Đ/c {v.reporterName} ({ROLE_TEXT[v.reporterRole] || v.reporterRole}) · {vnDateTime(v.submittedAt)}</div>
          {v.reason && <div className="text-[13px] text-stone-700 mt-0.5">Lý do đính chính: {v.reason}</div>}
          {v.note && <div className="text-sm mt-1 whitespace-pre-line">{v.note}</div>}
          {v.incidents.map((i, k) => <IncidentView key={i.id || i.key} i={i} n={k + 1} dupLabel={null} />)}
        </div>
      ))}
    </Sheet>
  );
};

/** Người ký báo cáo (nhớ trên máy) */
export const SignerSheet: React.FC<{ open: boolean; onClose: () => void; onExport: (s: Signer) => Promise<void> }> = ({ open, onClose, onExport }) => {
  const [s, setS] = useState<Signer>(loadSigner());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setS(loadSigner()); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Người ký báo cáo"
      footer={<><button className={btnSecondary} onClick={onClose}>Huỷ</button>
        <button className={btnPrimary} disabled={busy} data-testid="signer-export" onClick={async () => { setBusy(true); saveSigner(s); try { await onExport(s); } finally { setBusy(false); } }}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}Xuất Word</button></>}>
      <div className="space-y-3">
        <div><label className={labelCls}>Chức danh</label>
          <input className={inputCls} list="daily-signer-titles" value={s.chucDanh} onChange={e => setS({ ...s, chucDanh: e.target.value })} />
          <datalist id="daily-signer-titles">
            <option value="TRƯỞNG CÔNG AN PHƯỜNG" /><option value="KT. TRƯỞNG CÔNG AN PHƯỜNG" /><option value="PHÓ TRƯỞNG CÔNG AN PHƯỜNG" />
          </datalist></div>
        <div><label className={labelCls}>Họ tên người ký</label><input className={inputCls} value={s.hoTen} onChange={e => setS({ ...s, hoTen: e.target.value })} /></div>
        <p className="text-[12px] text-stone-500">Số, ngày tháng văn bản để trống để văn thư điền. Thể thức NĐ30, ký hiệu /BC-CAP-TH.</p>
      </div>
    </Sheet>
  );
};
