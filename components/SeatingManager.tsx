import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, FileSpreadsheet, LayoutGrid, Trash2, Users as UsersIcon, X, AlertTriangle, Check } from 'lucide-react';
import { MockDB } from '../services/mockDatabase';
import { Seat, SeatLayout, User, UserRole } from '../types';
import { Portal } from './Portal';
import { SeatMap } from './SeatMap';
import { autoMatch, candidatesFor, layoutByTeam, readLayoutFile, SeatState, teamOf } from '../lib/seating';

interface Props {
  open: boolean;
  users: User[];
  initialId?: string | null;
  onClose: () => void;
  onChanged: (layouts: SeatLayout[], selectedId?: string) => void;
}

const btnPrimary = 'inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-40';
const btnSecondary = 'inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-sm font-semibold disabled:opacity-40';

/** Quản lý sơ đồ chỗ ngồi: nhập Excel → tự ghép cán bộ → chọn tay các ô chưa khớp → lưu */
export const SeatingManager: React.FC<Props> = ({ open, users, initialId, onClose, onChanged }) => {
  const [layouts, setLayouts] = useState<SeatLayout[]>([]);
  const [edit, setEdit] = useState<SeatLayout | null>(null);
  const [sel, setSel] = useState<Seat | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const people = useMemo(() => users.filter(u => u.role !== UserRole.ADMIN).sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi')), [users]);
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  const reload = async (openId?: string | null) => {
    const ls = await MockDB.getSeatLayouts();
    setLayouts(ls);
    if (openId) { const l = ls.find(x => x.id === openId); if (l) setEdit(JSON.parse(JSON.stringify(l))); }
    return ls;
  };
  useEffect(() => { if (open) { setEdit(null); setSel(null); setMsg(''); reload(initialId); } }, [open, initialId]);

  if (!open) return null;

  const importFile = async (f: File) => {
    setBusy(true); setMsg('');
    try {
      const g = await readLayoutFile(f);
      if (!g.seats.length) { setMsg('Không đọc được ghế nào trong tệp. Mỗi ô là 1 ghế, có cột số hàng 1, 2, 3… ở giữa.'); return; }
      const name = f.name.replace(/\.(xlsx|xls|csv)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Sơ đồ mới';
      setEdit({ id: '', name, rows: g.rows, leftCols: g.leftCols, rightCols: g.rightCols, seats: autoMatch(g.seats, users) });
      setSel(null);
    } catch (e) {
      console.error(e); setMsg('Tệp không đúng định dạng Excel (.xlsx, .xls) hoặc .csv.');
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const byTeam = () => {
    const g = layoutByTeam(users);
    setEdit({ id: '', name: 'Sơ đồ theo tổ', rows: g.rows, leftCols: g.leftCols, rightCols: g.rightCols, seats: g.seats });
    setSel(null);
  };

  const save = async () => {
    if (!edit) return;
    if (!edit.name.trim()) { setMsg('Vui lòng đặt tên sơ đồ.'); return; }
    setBusy(true);
    const res = await MockDB.saveSeatLayout({ ...edit, name: edit.name.trim() });
    setBusy(false);
    if (!res.ok) { setMsg(res.message || 'Không lưu được sơ đồ.'); return; }
    const ls = await reload();
    onChanged(ls, res.layout?.id);
    setEdit(null); setSel(null); setMsg('Đã lưu sơ đồ.');
  };

  const remove = async (l: SeatLayout) => {
    if (!window.confirm(`Xoá sơ đồ "${l.name}"?`)) return;
    const res = await MockDB.deleteSeatLayout(l.id);
    if (!res.ok) { setMsg(res.message || 'Không xoá được.'); return; }
    const ls = await reload();
    onChanged(ls);
    setEdit(null);
  };

  const setSeat = (s: Seat, patch: Partial<Seat>) => {
    if (!edit) return;
    const seats = edit.seats.map(x => (x.r === s.r && x.c === s.c ? { ...x, ...patch } : x));
    setEdit({ ...edit, seats });
    setSel(seats.find(x => x.r === s.r && x.c === s.c) || null);
  };

  // ---------------- Danh sách sơ đồ ----------------
  const listView = (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => fileRef.current?.click()} disabled={busy} className={btnPrimary} data-testid="btn-import-layout">
          <FileSpreadsheet className="w-4 h-4" />{busy ? 'Đang đọc...' : 'Nhập từ Excel'}
        </button>
        <button onClick={byTeam} className={btnSecondary}><LayoutGrid className="w-4 h-4" />Tạo theo tổ</button>
      </div>
      <p className="text-xs text-stone-500 leading-relaxed">Tệp Excel: mỗi ô là 1 ghế, ghi tên và tổ (VD "Minh Quốc AN", "CSKV Viết Hiền"); cột giữa ghi số hàng 1, 2, 3…; hàng 1 là hàng sát bục chủ toạ.</p>
      {layouts.length === 0 ? (
        <div className="py-10 text-center text-sm text-stone-500 bg-white rounded-xl border border-dashed border-stone-300">Chưa có sơ đồ nào.</div>
      ) : layouts.map(l => {
        const n = l.seats.filter(s => s.label).length, m = l.seats.filter(s => s.userId).length;
        return (
          <div key={l.id} className="bg-white rounded-xl border border-stone-200 p-3.5 flex items-center gap-3" data-testid="layout-item">
            <span className="icon-3d w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ ['--c' as any]: '#0f766e' }}><LayoutGrid className="w-5 h-5" /></span>
            <button onClick={() => { setEdit(JSON.parse(JSON.stringify(l))); setSel(null); }} className="min-w-0 flex-1 text-left">
              <div className="font-semibold text-stone-900 truncate">{l.name}</div>
              <div className="text-xs text-stone-500">{l.rows} hàng × {l.leftCols + l.rightCols} ghế · đã gắn {m}/{n} cán bộ</div>
            </button>
            <button onClick={() => remove(l)} aria-label="Xoá sơ đồ" className="p-2 rounded-lg text-stone-400 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
          </div>
        );
      })}
    </div>
  );

  // ---------------- Sửa sơ đồ ----------------
  const editView = edit && (() => {
    const named = edit.seats.filter(s => s.label);
    const pending = named.filter(s => !s.userId);
    const count = new Map<string, number>();
    edit.seats.forEach(s => { if (s.userId) count.set(s.userId, (count.get(s.userId) || 0) + 1); });
    const dup = [...count.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    const stateOf = (s: Seat): SeatState => (!s.label ? 'empty' : !s.userId ? 'excused' : dup.includes(s.userId) ? 'absent' : 'present');
    const userSelect = (s: Seat, testid?: string) => {
      const cands = candidatesFor(s, users);
      const candIds = new Set(cands.map(u => u.id));
      return (
        <select value={s.userId || ''} onChange={e => setSeat(s, { userId: e.target.value || null })} data-testid={testid}
          className={`h-10 w-full rounded-lg border px-2 text-sm bg-white ${s.userId ? 'border-emerald-400' : 'border-stone-300'}`}>
          <option value="">— Chưa gắn cán bộ —</option>
          {cands.length > 0 && <optgroup label="Phù hợp với tên trên sơ đồ">
            {cands.map(u => <option key={u.id} value={u.id}>{u.fullName}{u.department ? ` · ${u.department.replace('Tổ ', '')}` : ''}</option>)}
          </optgroup>}
          <optgroup label="Tất cả cán bộ">
            {people.filter(u => !candIds.has(u.id)).map(u => <option key={u.id} value={u.id}>{u.fullName}{u.department ? ` · ${u.department.replace('Tổ ', '')}` : ''}</option>)}
          </optgroup>
        </select>
      );
    };
    return (
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-[13px] font-medium text-stone-700 mb-1.5">Tên sơ đồ</label>
          <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} data-testid="layout-name"
            className="w-full h-11 px-3 rounded-lg border border-stone-300 text-base md:text-sm focus:outline-none focus:ring-3 focus:ring-brand-600/15 focus:border-brand-600" />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-white rounded-xl border border-stone-200 py-2"><b className="text-xl tabular">{named.length}</b><div className="text-[11px] text-stone-500">ghế có tên</div></div>
          <div className="bg-white rounded-xl border border-stone-200 py-2"><b className="text-xl tabular text-emerald-700" data-testid="layout-matched">{named.length - pending.length}</b><div className="text-[11px] text-stone-500">đã gắn cán bộ</div></div>
          <div className="bg-white rounded-xl border border-stone-200 py-2"><b className="text-xl tabular text-amber-700" data-testid="layout-pending">{pending.length}</b><div className="text-[11px] text-stone-500">cần chọn tay</div></div>
        </div>
        {dup.length > 0 && (
          <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{dup.map(id => userMap.get(id)?.fullName || id).join(', ')} đang được gắn ở nhiều ghế (ô đỏ). Chọn lại cho đúng.</span>
          </div>
        )}

        {pending.length > 0 && (
          <div>
            <div className="text-[13px] font-semibold text-stone-900 mb-1.5">Cần chọn đúng cán bộ</div>
            <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-100">
              {pending.slice(0, 30).map(s => (
                <div key={`${s.r}:${s.c}`} className="p-3 grid grid-cols-[1fr_1.3fr] gap-2 items-center">
                  <div className="min-w-0"><div className="font-semibold text-sm truncate">{s.label}{s.team ? ` · ${s.team}` : ''}</div>
                    <div className="text-[11px] text-stone-500">Hàng {s.r + 1} · ghế {s.c + 1} · {candidatesFor(s, users).length > 1 ? 'trùng tên' : 'không tìm thấy'}</div></div>
                  {userSelect(s, 'pending-select')}
                </div>
              ))}
              {pending.length > 30 && <div className="p-2 text-center text-xs text-stone-500">Còn {pending.length - 30} ô, chạm vào ô vàng trên sơ đồ để chọn.</div>}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-stone-200 p-2.5">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[13px] font-semibold text-stone-900">Sơ đồ</span>
            <span className="text-[10px] font-bold tracking-[.18em] text-stone-500 bg-stone-100 rounded px-2 py-0.5">BỤC CHỦ TOẠ ▲</span>
          </div>
          <div className="overflow-x-auto"><div style={{ minWidth: (edit.leftCols + edit.rightCols) * 52 }}>
            <SeatMap layout={edit} size="normal" stateOf={stateOf} onSeat={s => setSel(s)} selected={sel}
              labelOf={s => (s.userId ? (userMap.get(s.userId)?.fullName.split(' ').slice(-2).join(' ') || s.label) : s.label)} />
          </div></div>
          <div className="flex flex-wrap gap-3 text-[11px] text-stone-500 mt-2 px-1">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />Đã gắn</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />Cần chọn</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-300" />Trùng người</span>
            <span>Chạm vào ghế để sửa.</span>
          </div>
        </div>

        {sel && (
          <div className="bg-white rounded-xl border-2 border-stone-900 p-3 space-y-2" data-testid="seat-editor">
            <div className="flex items-center justify-between"><b className="text-sm">Hàng {sel.r + 1} · ghế {sel.c + 1}</b>
              <button onClick={() => setSel(null)} aria-label="Đóng" className="p-1 text-stone-400"><X className="w-4 h-4" /></button></div>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <input value={sel.label} onChange={e => setSeat(sel, { label: e.target.value })} placeholder="Tên ghi trên ghế (để trống = ghế trống)"
                className="h-10 px-2 rounded-lg border border-stone-300 text-sm" />
              <input value={sel.team || ''} onChange={e => setSeat(sel, { team: e.target.value.toUpperCase() })} placeholder="Tổ" className="h-10 px-2 rounded-lg border border-stone-300 text-sm" />
            </div>
            {userSelect(sel)}
            {sel.userId && <button onClick={() => { const u = userMap.get(sel.userId!); if (u) setSeat(sel, { label: u.fullName.split(' ').slice(-2).join(' '), team: teamOf(u.department) }); }}
              className="text-xs font-medium text-brand-700">Lấy tên theo cán bộ đã chọn</button>}
          </div>
        )}
        {edit.id && <button onClick={() => remove(edit)} className="w-full h-10 text-sm font-medium text-red-700 rounded-lg hover:bg-red-50 inline-flex items-center justify-center gap-1.5"><Trash2 className="w-4 h-4" />Xoá sơ đồ này</button>}
      </div>
    );
  })();

  return (
    <Portal><div className="fixed inset-0 z-[125] bg-stone-900/50 flex md:items-center md:justify-center md:p-4" onClick={onClose}>
      <div className="bg-orange-50 w-full md:max-w-2xl h-full md:h-auto md:max-h-[92vh] md:rounded-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} data-testid="seating-manager">
        <div className="bg-white border-b border-stone-200 h-14 px-2 flex items-center gap-1 shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box' }}>
          {edit ? <button onClick={() => { setEdit(null); setSel(null); }} aria-label="Quay lại" className="p-2 rounded-lg text-stone-600"><ChevronLeft className="w-5 h-5" /></button>
                : <span className="p-2 text-stone-600"><UsersIcon className="w-5 h-5" /></span>}
          <h3 className="flex-1 font-semibold text-stone-900 truncate">{edit ? (edit.id ? 'Sửa sơ đồ' : 'Sơ đồ mới') : 'Sơ đồ chỗ ngồi'}</h3>
          <button onClick={onClose} aria-label="Đóng" className="p-2 rounded-lg text-stone-400 hover:bg-stone-100"><X className="w-5 h-5" /></button>
        </div>
        {msg && <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-white border border-stone-200 text-[13px] text-stone-700 flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" />{msg}</div>}
        <div className="flex-1 overflow-y-auto">{edit ? editView : listView}</div>
        {edit && (
          <div className="bg-white border-t border-stone-200 p-3 flex gap-2 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <button onClick={() => { setEdit(null); setSel(null); }} className={btnSecondary}>Huỷ</button>
            <button onClick={save} disabled={busy} className={`flex-1 ${btnPrimary}`} data-testid="btn-save-layout">{busy ? 'Đang lưu...' : 'Lưu sơ đồ'}</button>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" data-testid="layout-file"
          onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); }} />
      </div>
    </div></Portal>
  );
};

export default SeatingManager;
