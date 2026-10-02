import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, ChevronLeft, ChevronRight, Copy, Loader2, Printer, QrCode, Save } from 'lucide-react';
import { DailyAssignItem, DailyUnit, User, UserRole } from '../../types';
import { addDays, Daily, dayShort, mondayOf, UNITS, weekdayShort, weekdayText } from '../../services/dailyReportService';
import { btnPrimary, btnSecondary, card, Chip, inputCls, labelCls, Sheet } from '../learning/common';

interface Props {
  me: User;
  users: User[];
  currentDay: string;
  deadline: string;
  canManage: boolean;
  leaderOf: DailyUnit[];
  onDeadlineChanged: () => void;
}

export const dailyLink = (unit?: DailyUnit) =>
  `${typeof window !== 'undefined' ? window.location.origin : ''}/?bao-cao-ngay=${unit || '1'}`;

/** Ô chọn cán bộ: người trong tổ lên trước */
const PersonSelect: React.FC<{ value: string; onChange: (v: string) => void; users: User[]; dept?: string; placeholder: string; testId?: string }> =
  ({ value, onChange, users, dept, placeholder, testId }) => {
    const inDept = dept ? users.filter(u => u.department === dept) : [];
    const rest = users.filter(u => !inDept.includes(u));
    const opt = (u: User) => <option key={u.id} value={u.id}>{u.fullName}{u.position ? ` – ${u.position}` : ''}</option>;
    return (
      <select className={inputCls} value={value} onChange={e => onChange(e.target.value)} data-testid={testId}>
        <option value="">{placeholder}</option>
        {inDept.length > 0 ? <><optgroup label={dept}>{inDept.map(opt)}</optgroup><optgroup label="Cán bộ khác">{rest.map(opt)}</optgroup></> : rest.map(opt)}
      </select>
    );
  };

/** Phân công người báo cáo, lịch trực theo tuần, link/mã QR, giờ chốt */
export const DailyAssign: React.FC<Props> = ({ me, users, currentDay, deadline, canManage, leaderOf, onDeadlineChanged }) => {
  const people = useMemo(() => users.filter(u => u.isApproved !== false && u.role !== UserRole.ADMIN)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi')), [users]);
  const nameOf = (id?: string | null) => (id ? people.find(u => u.id === id)?.fullName || users.find(u => u.id === id)?.fullName || '(đã xoá)' : '');
  const myUnits = UNITS.filter(u => canManage || leaderOf.includes(u.id));
  const [week, setWeek] = useState(mondayOf(currentDay));
  const days = useMemo(() => Array.from({ length: 7 }, (_, k) => addDays(week, k)), [week]);
  const [items, setItems] = useState<DailyAssignItem[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [cell, setCell] = useState<{ unit: DailyUnit; day: string } | null>(null);
  const [qr, setQr] = useState<DailyUnit | null>(null);

  const load = useCallback(async () => {
    const r = await Daily.assignments(days[0], days[6]);
    if (!r.ok) { setErr(r.message || 'Không tải được phân công.'); return; }
    setItems(r.items);
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const def = (unit: DailyUnit) => items?.find(a => a.unit === unit && !a.day);
  const over = (unit: DailyUnit, day: string) => items?.find(a => a.unit === unit && a.day === day);

  const save = async (unit: DailyUnit, day: string | null, main: string, backup: string) => {
    setMsg('');
    const r = await Daily.assign(unit, day, main || null, backup || null);
    if (!r.ok) { setMsg(r.message || 'Không lưu được.'); return false; }
    setMsg('Đã lưu phân công. Người được phân công nhận thông báo trong app.');
    await load();
    return true;
  };

  if (err) return <div className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm">{err}</div>;
  if (!items) return <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;

  return (
    <div className="space-y-5" data-testid="daily-assign">
      {msg && <div className="text-sm rounded-lg bg-stone-100 text-stone-800 px-3 py-2">{msg}</div>}

      {/* 1. Phân công thường xuyên */}
      <section>
        <h3 className="font-bold text-stone-900 mb-1">Phân công thường xuyên</h3>
        <p className="text-[13px] text-stone-500 mb-2">Áp dụng mọi ngày, trừ những ngày có phân công riêng ở lịch tuần bên dưới. Người dự phòng báo thay khi người chính vắng. Tổ trưởng, Tổ phó luôn báo được cho tổ mình.</p>
        <div className="space-y-2">
          {myUnits.map(u => <DefaultRow key={u.id + (def(u.id)?.updatedAt || '')} unit={u.id} name={u.name} dept={u.dept} people={people}
            main={def(u.id)?.userId || ''} backup={def(u.id)?.backupId || ''} onSave={(m, b) => save(u.id, null, m, b)} />)}
        </div>
      </section>

      {/* 2. Lịch tuần (trực ban thay đổi theo ngày) */}
      <section>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h3 className="font-bold text-stone-900 flex-1">Lịch theo ngày</h3>
          <button className={`${btnSecondary} h-9 px-2.5`} onClick={() => setWeek(w => addDays(w, -7))} aria-label="Tuần trước"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-semibold tabular">{dayShort(days[0])} – {dayShort(days[6])}</span>
          <button className={`${btnSecondary} h-9 px-2.5`} onClick={() => setWeek(w => addDays(w, 7))} aria-label="Tuần sau"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <p className="text-[13px] text-stone-500 mb-2">Bấm vào ô để phân công riêng cho ngày đó (VD: lịch trực ban). Chữ <b>đậm</b> = phân công riêng, chữ xám = theo phân công thường xuyên.</p>
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-[13px] min-w-[760px]">
            <thead><tr className="border-b border-stone-200 text-stone-500">
              <th className="text-left p-2 w-36">Đầu mối</th>
              {days.map(d => <th key={d} className={`p-2 text-center ${d === currentDay ? 'text-brand-700' : ''}`}>{weekdayShort(d)}<br />{dayShort(d)}</th>)}
            </tr></thead>
            <tbody>{myUnits.map(u => (
              <tr key={u.id} className="border-b border-stone-100">
                <td className="p-2 font-semibold">{u.name}</td>
                {days.map(d => {
                  const o = over(u.id, d), dd = def(u.id);
                  const main = o ? o.userId : dd?.userId;
                  return (
                    <td key={d} className="p-1">
                      <button onClick={() => setCell({ unit: u.id, day: d })} data-testid="assign-cell"
                        className={`w-full min-h-12 rounded-md px-1.5 py-1 text-left hover:bg-stone-100 ${d === currentDay ? 'ring-1 ring-brand-700/40' : ''} ${o ? 'font-semibold text-stone-900' : 'text-stone-400'}`}>
                        {main ? nameOf(main) : <span className="text-red-600">Chưa có</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      {/* 3. Link và mã QR */}
      <section>
        <h3 className="font-bold text-stone-900 mb-1">Link và mã QR mở biểu mẫu</h3>
        <p className="text-[13px] text-stone-500 mb-2">Gửi link hoặc dán mã QR để cán bộ mở thẳng biểu mẫu báo cáo. Người mở vẫn phải đăng nhập bằng tài khoản của mình. App chỉ cho nộp nếu người đó được phân công, nên biết chính xác ai báo cáo.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {myUnits.map(u => <LinkRow key={u.id} unit={u.id} name={u.name} onQr={() => setQr(u.id)} />)}
        </div>
      </section>

      {/* 4. Giờ chốt */}
      {(me.role === UserRole.ADMIN || me.role === UserRole.CHIEF) && <DeadlineBox deadline={deadline} onSaved={onDeadlineChanged} />}

      <DayCellSheet cell={cell} people={people} over={cell ? over(cell.unit, cell.day) : undefined} def={cell ? def(cell.unit) : undefined}
        onClose={() => setCell(null)} onSave={async (m, b, clear) => {
          if (!cell) return;
          const ok = clear ? await save(cell.unit, cell.day, '', '') : await save(cell.unit, cell.day, m, b);
          if (ok) setCell(null);
        }} />
      <Sheet open={!!qr} onClose={() => setQr(null)} title={`Mã QR báo cáo ngày · ${UNITS.find(u => u.id === qr)?.name || ''}`}
        footer={<button className={btnPrimary} onClick={() => printQr(qr!)}><Printer className="w-4 h-4" />In mã QR</button>}>
        {qr && <div id="daily-qr-box" className="flex flex-col items-center gap-3 py-2">
          <QRCodeSVG value={dailyLink(qr)} size={240} level="M" />
          <div className="text-[13px] text-stone-600 break-all text-center">{dailyLink(qr)}</div>
          <p className="text-[12px] text-stone-500 text-center">Quét bằng camera điện thoại (không quét bằng Zalo).</p>
        </div>}
      </Sheet>
    </div>
  );
};

const DefaultRow: React.FC<{ unit: DailyUnit; name: string; dept?: string; people: User[]; main: string; backup: string; onSave: (m: string, b: string) => Promise<boolean> }> =
  ({ unit, name, dept, people, main, backup, onSave }) => {
    const [m, setM] = useState(main);
    const [b, setB] = useState(backup);
    const [busy, setBusy] = useState(false);
    const dirty = m !== main || b !== backup;
    return (
      <div className={`${card} p-3`} data-testid="assign-default" data-unit={unit}>
        <div className="flex items-center gap-2 mb-2"><b className="text-stone-900">{name}</b>{!main && <Chip tone="red">Chưa phân công</Chip>}</div>
        <div className="grid md:grid-cols-[1fr_1fr_auto] gap-2">
          <PersonSelect value={m} onChange={setM} users={people} dept={dept} placeholder="— Người báo cáo chính —" testId="assign-main" />
          <PersonSelect value={b} onChange={setB} users={people} dept={dept} placeholder="— Người dự phòng (không bắt buộc) —" testId="assign-backup" />
          <button className={btnPrimary} disabled={!dirty || busy || (!!m && m === b)} data-testid="assign-save"
            onClick={async () => { setBusy(true); await onSave(m, b); setBusy(false); }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Lưu</button>
        </div>
        {!!m && m === b && <div className="text-[12px] text-red-700 mt-1">Người dự phòng phải khác người chính.</div>}
      </div>
    );
  };

const DayCellSheet: React.FC<{
  cell: { unit: DailyUnit; day: string } | null; people: User[]; over?: DailyAssignItem; def?: DailyAssignItem;
  onClose: () => void; onSave: (m: string, b: string, clear: boolean) => Promise<void>;
}> = ({ cell, people, over, def, onClose, onSave }) => {
  const [m, setM] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (cell) { setM(over?.userId || def?.userId || ''); setB(over?.backupId || def?.backupId || ''); } }, [cell, over, def]);
  const u = UNITS.find(x => x.id === cell?.unit);
  const run = async (clear: boolean) => { setBusy(true); await onSave(m, b, clear); setBusy(false); };
  return (
    <Sheet open={!!cell} onClose={onClose} title={cell ? `${u?.name} · ${weekdayText(cell.day)} ${dayShort(cell.day)}` : ''} testId="assign-day"
      footer={<>
        {over && <button className={btnSecondary} disabled={busy} onClick={() => run(true)}>Dùng phân công thường xuyên</button>}
        <button className={btnPrimary} disabled={busy || !m || m === b} onClick={() => run(false)} data-testid="assign-day-save">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Lưu cho ngày này</button>
      </>}>
      <div className="space-y-3">
        <div><label className={labelCls}>Người báo cáo chính</label><PersonSelect value={m} onChange={setM} users={people} dept={u?.dept} placeholder="— Chọn cán bộ —" testId="assign-day-main" /></div>
        <div><label className={labelCls}>Người dự phòng</label><PersonSelect value={b} onChange={setB} users={people} dept={u?.dept} placeholder="— Không có —" /></div>
        {!over && def?.userId && <p className="text-[12px] text-stone-500">Ngày này đang theo phân công thường xuyên.</p>}
      </div>
    </Sheet>
  );
};

const LinkRow: React.FC<{ unit: DailyUnit; name: string; onQr: () => void }> = ({ unit, name, onQr }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(dailyLink(unit)); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* bỏ qua */ }
  };
  return (
    <div className={`${card} p-3 flex items-center gap-2`}>
      <div className="min-w-0 flex-1"><div className="font-semibold text-sm">{name}</div><div className="text-[12px] text-stone-500 truncate">{dailyLink(unit)}</div></div>
      <button className={`${btnSecondary} h-9 px-2.5`} onClick={copy} aria-label="Sao chép link">{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}</button>
      <button className={`${btnSecondary} h-9 px-2.5`} onClick={onQr} aria-label="Mã QR"><QrCode className="w-4 h-4" /></button>
    </div>
  );
};

const printQr = (unit: DailyUnit) => {
  const name = UNITS.find(u => u.id === unit)?.name || '';
  const svg = document.querySelector('#daily-qr-box svg')?.outerHTML || '';
  const w = window.open('', '_blank', 'width=700,height=900');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Mã QR báo cáo ngày</title>
    <style>body{font-family:'Times New Roman',serif;text-align:center;padding:40px}svg{width:12cm;height:12cm}h1{font-size:26pt;margin:0 0 8px}h2{font-size:20pt;margin:0 0 24px;font-weight:normal}p{font-size:14pt}</style></head>
    <body><h1>BÁO CÁO NGÀY</h1><h2>${name}</h2>${svg}<p>Quét bằng camera điện thoại, đăng nhập tài khoản cá nhân để báo cáo.</p>
    <p style="font-size:11pt;color:#555">${dailyLink(unit)}</p><script>window.onload=()=>{window.print();}</script></body></html>`);
  w.document.close();
};

const DeadlineBox: React.FC<{ deadline: string; onSaved: () => void }> = ({ deadline, onSaved }) => {
  const [v, setV] = useState(deadline);
  const [msg, setMsg] = useState('');
  return (
    <section className={`${card} p-3`}>
      <h3 className="font-bold text-stone-900 mb-1">Giờ chốt kỳ báo cáo và hạn nộp</h3>
      <p className="text-[13px] text-stone-500 mb-2">Kỳ báo cáo ngày D tính từ giờ chốt ngày D-1 đến giờ chốt ngày D. Nộp sau giờ chốt bị ghi "nộp muộn".</p>
      <div className="flex gap-2 items-center">
        <input type="time" className={`${inputCls} w-32`} value={v} onChange={e => setV(e.target.value)} data-testid="deadline-input" />
        <button className={btnPrimary} disabled={v === deadline} onClick={async () => {
          const r = await Daily.setDeadline(v); setMsg(r.ok ? 'Đã lưu.' : r.message || 'Không lưu được.'); if (r.ok) onSaved();
        }}>Lưu</button>
        {msg && <span className="text-sm text-stone-600">{msg}</span>}
      </div>
    </section>
  );
};
