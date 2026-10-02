import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import {
  addDays, complianceOf, Daily, DailyRange, dayText, dupTarget, exportRangeExcel, exportRangeWord, FIELDS, monthEnd, monthStart,
  mondayOf, quarterStart, totalsByField, UNITS
} from '../../services/dailyReportService';
import { btnPrimary, btnSecondary, card, Chip, inputCls } from '../learning/common';
import { IncidentView } from './DailyForm';
import { SignerSheet } from './DailyBoard';

type Preset = 'WEEK' | 'LASTWEEK' | 'MONTH' | 'LASTMONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';

/** Tổng hợp nhiều ngày: tuần, tháng, quý, năm */
export const DailyStats: React.FC<{ currentDay: string }> = ({ currentDay }) => {
  const today = currentDay;
  const [preset, setPreset] = useState<Preset>('WEEK');
  const [from, setFrom] = useState(mondayOf(today));
  const [to, setTo] = useState(today);
  const [rg, setRg] = useState<DailyRange | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [showList, setShowList] = useState(false);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'WEEK') { setFrom(mondayOf(today)); setTo(today); }
    if (p === 'LASTWEEK') { const m = addDays(mondayOf(today), -7); setFrom(m); setTo(addDays(m, 6)); }
    if (p === 'MONTH') { setFrom(monthStart(today)); setTo(today); }
    if (p === 'LASTMONTH') { const e = addDays(monthStart(today), -1); setFrom(monthStart(e)); setTo(monthEnd(e)); }
    if (p === 'QUARTER') { setFrom(quarterStart(today)); setTo(today); }
    if (p === 'YEAR') { setFrom(today.slice(0, 4) + '-01-01'); setTo(today); }
  };

  useEffect(() => {
    if (!from || !to || to < from) return;
    let alive = true;
    setLoading(true); setErr('');
    Daily.range(from, to).then(r => {
      if (!alive) return;
      setLoading(false);
      if (!r.ok) { setErr(r.message || 'Không tải được số liệu.'); setRg(null); return; }
      setRg(r as DailyRange);
    });
    return () => { alive = false; };
  }, [from, to]);

  const label = useMemo(() => {
    if (preset === 'MONTH' || preset === 'LASTMONTH') return `tháng ${Number(from.slice(5, 7))}/${from.slice(0, 4)}${to < monthEnd(from) ? ` (đến ngày ${dayText(to)})` : ''}`;
    if (preset === 'QUARTER') return `quý ${Math.floor((Number(from.slice(5, 7)) - 1) / 3) + 1}/${from.slice(0, 4)} (đến ngày ${dayText(to)})`;
    if (preset === 'YEAR') return `năm ${from.slice(0, 4)} (đến ngày ${dayText(to)})`;
    return from === to ? `ngày ${dayText(from)}` : `từ ngày ${dayText(from)} đến ngày ${dayText(to)}`;
  }, [preset, from, to]);

  const tot = rg ? totalsByField(rg.incidents, rg.dups) : null;
  const comp = rg ? complianceOf(rg) : [];
  const counted = rg ? rg.incidents.filter(i => !dupTarget(i, rg.dups)) : [];

  const presets: [Preset, string][] = [['WEEK', 'Tuần này'], ['LASTWEEK', 'Tuần trước'], ['MONTH', 'Tháng này'], ['LASTMONTH', 'Tháng trước'], ['QUARTER', 'Quý này'], ['YEAR', 'Năm nay'], ['CUSTOM', 'Tự chọn']];

  return (
    <div data-testid="daily-stats">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {presets.map(([p, l]) => (
          <button key={p} onClick={() => applyPreset(p)} className={`h-9 px-3 rounded-full text-sm font-semibold border ${preset === p ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-300 text-stone-700'}`}>{l}</button>
        ))}
      </div>
      {preset === 'CUSTOM' && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input type="date" className={`${inputCls} w-auto`} value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} />
          <span className="text-stone-500">đến</span>
          <input type="date" className={`${inputCls} w-auto`} value={to} min={from} max={today} onChange={e => e.target.value && setTo(e.target.value)} />
        </div>
      )}
      <div className="text-sm text-stone-600 mb-3">Số liệu <b>{label}</b>. Vụ việc được đánh dấu trùng không cộng vào tổng.</div>

      {err && <div className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm">{err}</div>}
      {loading && <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>}
      {rg && tot && !loading && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <button className={btnPrimary} onClick={() => setSignOpen(true)} data-testid="stats-word"><FileText className="w-4 h-4" />Xuất Word tổng hợp</button>
            <button className={btnSecondary} onClick={() => exportRangeExcel(rg, label)} data-testid="stats-excel"><Download className="w-4 h-4" />Xuất Excel</button>
          </div>

          <div className="grid grid-cols-3 gap-2.5 mb-4">
            <div className={`${card} p-3`}><div className="text-[12px] text-stone-500">Vụ việc</div><div className="text-2xl font-bold tabular">{tot.cases}</div></div>
            <div className={`${card} p-3`}><div className="text-[12px] text-stone-500">Đối tượng</div><div className="text-2xl font-bold tabular">{tot.suspects}</div></div>
            <div className={`${card} p-3`}><div className="text-[12px] text-stone-500">Bị hại, thương vong</div><div className="text-2xl font-bold tabular">{tot.victims}</div></div>
          </div>

          <div className={`${card} p-3 md:p-4 mb-4 overflow-x-auto`}>
            <div className="font-bold text-stone-900 mb-2">Chấp hành chế độ báo cáo</div>
            <table className="w-full text-sm min-w-[520px]">
              <thead><tr className="text-left text-[12px] text-stone-500 border-b border-stone-200">
                <th className="py-1.5 pr-2">Đầu mối</th><th className="py-1.5 px-2 text-center">Phải báo</th><th className="py-1.5 px-2 text-center">Đã báo</th>
                <th className="py-1.5 px-2 text-center">Không báo</th><th className="py-1.5 px-2 text-center">Nộp muộn</th><th className="py-1.5 pl-2 text-center">Ngày có vụ việc</th></tr></thead>
              <tbody>{comp.map(c => (
                <tr key={c.unit} className="border-b border-stone-100" data-testid="stats-comp-row">
                  <td className="py-1.5 pr-2 font-semibold">{c.name}</td>
                  <td className="py-1.5 px-2 text-center tabular">{c.days}</td>
                  <td className="py-1.5 px-2 text-center tabular">{c.reported}</td>
                  <td className={`py-1.5 px-2 text-center tabular ${c.missing ? 'text-red-700 font-bold' : ''}`}>{c.missing}</td>
                  <td className={`py-1.5 px-2 text-center tabular ${c.late ? 'text-amber-700 font-bold' : ''}`}>{c.late}</td>
                  <td className="py-1.5 pl-2 text-center tabular">{c.incidentDays}</td>
                </tr>))}</tbody>
            </table>
            <p className="text-[12px] text-stone-500 mt-2">Kỳ đang mở (chưa đến hạn) không tính là "không báo".</p>
          </div>

          <div className={`${card} p-3 md:p-4 mb-4 overflow-x-auto`}>
            <div className="font-bold text-stone-900 mb-2">Số vụ việc theo lĩnh vực và đầu mối</div>
            {tot.rows.length === 0 ? <div className="text-sm text-stone-500">Không có vụ việc.</div> : (
              <table className="w-full text-sm min-w-[640px]">
                <thead><tr className="text-[12px] text-stone-500 border-b border-stone-200">
                  <th className="py-1.5 pr-2 text-left">Lĩnh vực</th>{UNITS.map(u => <th key={u.id} className="py-1.5 px-1 text-center">{u.short}</th>)}
                  <th className="py-1.5 px-1 text-center">Số vụ</th><th className="py-1.5 pl-1 text-center">Đối tượng</th></tr></thead>
                <tbody>
                  {FIELDS.filter(f => tot.rows.some(r => r.field === f)).map(f => (
                    <tr key={f} className="border-b border-stone-100">
                      <td className="py-1.5 pr-2">{f}</td>
                      {UNITS.map(u => { const n = counted.filter(i => i.field === f && i.unit === u.id).reduce((s, i) => s + i.cases, 0); return <td key={u.id} className="py-1.5 px-1 text-center tabular text-stone-600">{n || ''}</td>; })}
                      <td className="py-1.5 px-1 text-center tabular font-bold">{tot.rows.find(r => r.field === f)!.cases}</td>
                      <td className="py-1.5 pl-1 text-center tabular">{tot.rows.find(r => r.field === f)!.suspects}</td>
                    </tr>
                  ))}
                  <tr className="font-bold"><td className="py-1.5 pr-2">Cộng</td>
                    {UNITS.map(u => <td key={u.id} className="py-1.5 px-1 text-center tabular">{counted.filter(i => i.unit === u.id).reduce((s, i) => s + i.cases, 0) || ''}</td>)}
                    <td className="py-1.5 px-1 text-center tabular">{tot.cases}</td><td className="py-1.5 pl-1 text-center tabular">{tot.suspects}</td></tr>
                </tbody>
              </table>
            )}
          </div>

          {rg.incidents.length > 0 && (
            <div className={`${card} p-3 md:p-4`}>
              <button className="font-bold text-stone-900 w-full text-left flex items-center gap-2" onClick={() => setShowList(v => !v)}>
                Danh sách vụ việc ({rg.incidents.length}) <span className="ml-auto text-sm text-brand-700">{showList ? 'Thu gọn' : 'Xem'}</span></button>
              {showList && rg.incidents.map((i, k) => (
                <div key={(i.id || i.key) + k}>
                  <div className="text-[12px] font-semibold text-stone-500 mt-3 -mb-1.5">{dayText(i.day || '')} · {UNITS.find(u => u.id === i.unit)?.name}</div>
                  <IncidentView i={i} n={k + 1} dupLabel={dupTarget(i, rg.dups) ? 'đã gộp' : null} />
                </div>
              ))}
            </div>
          )}
          {tot.dupCount > 0 && <div className="mt-2"><Chip>Đã gộp {tot.dupCount} vụ việc trùng</Chip></div>}
        </>
      )}
      <SignerSheet open={signOpen} onClose={() => setSignOpen(false)} onExport={async s => { if (rg) await exportRangeWord(rg, label, s); setSignOpen(false); }} />
    </div>
  );
};
