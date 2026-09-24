import React, { useEffect, useMemo, useState } from 'react';
import { MockDB } from '../services/mockDatabase';
import { User, UserDepartment, UserGroup, UserRole } from '../types';
import { Portal } from './Portal';
import { X, Search } from 'lucide-react';

interface Props {
  open: boolean;
  users: User[];                 // cán bộ có thể chọn (đã loại Quản trị viên)
  selected: string[];
  locked?: string[];             // đã có trong hội nghị đang điểm danh: không bỏ chọn được
  currentUserId: string;
  onClose: () => void;
  onDone: (ids: string[]) => void;
}

const ROLE_LABEL: Record<string, string> = {
  [UserRole.CHIEF]: 'Trưởng CAP',
  [UserRole.DEPUTY_CHIEF]: 'Phó Trưởng CAP',
  [UserRole.MANAGER]: 'Tổ trưởng',
  [UserRole.DEPUTY]: 'Tổ phó',
  [UserRole.OFFICER]: 'Cán bộ'
};
const ROLE_ORDER = [UserRole.CHIEF, UserRole.DEPUTY_CHIEF, UserRole.MANAGER, UserRole.DEPUTY, UserRole.OFFICER];
const DEPT_ORDER: string[] = [
  UserDepartment.PHU_TRACH_CHUNG, UserDepartment.TONG_HOP, UserDepartment.AN_NINH,
  UserDepartment.CSKV, UserDepartment.CSTT, UserDepartment.PCTP
];
const LEADERS = [UserRole.CHIEF, UserRole.DEPUTY_CHIEF, UserRole.MANAGER, UserRole.DEPUTY];

/** Chọn thành phần tham dự — tối ưu cho điện thoại (toàn màn hình, nút lớn) */
export const ParticipantPicker: React.FC<Props> = ({ open, users, selected, locked = [], currentUserId, onClose, onDone }) => {
  const [sel, setSel] = useState<Set<string>>(new Set(selected));
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const lockedSet = useMemo(() => new Set(locked), [locked]);

  useEffect(() => {
    if (open) {
      setSel(new Set([...selected, ...locked]));
      setQ('');
      MockDB.getUserGroups().then(g => setGroups(g as UserGroup[])).catch(() => setGroups([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const byDept = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const list = users
      .filter(u => !kw || u.fullName.toLowerCase().includes(kw) || (u.username || '').toLowerCase().includes(kw))
      .sort((a, b) =>
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.fullName.localeCompare(b.fullName, 'vi'));
    const map = new Map<string, User[]>();
    for (const u of list) {
      const d = u.department || 'Chưa phân tổ';
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(u);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const ia = DEPT_ORDER.indexOf(a[0]); const ib = DEPT_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [users, q]);

  if (!open) return null;

  const toggleMany = (ids: string[]) => {
    const allOn = ids.length > 0 && ids.every(id => sel.has(id));
    const next = new Set(sel);
    ids.forEach(id => {
      if (allOn) { if (!lockedSet.has(id)) next.delete(id); }
      else next.add(id);
    });
    setSel(next);
  };
  const toggleOne = (id: string) => {
    if (lockedSet.has(id)) return;
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setSel(next);
  };

  const idsOf = (pred: (u: User) => boolean) => users.filter(pred).map(u => u.id);
  const chipCls = (on: boolean, tone = 'red') =>
    `shrink-0 h-8 px-3 rounded-md text-[13px] border transition-colors ${
      on ? 'bg-stone-900 text-white border-stone-900 font-medium'
         : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300 active:bg-stone-100'}${tone === 'purple' ? '' : ''}`;
  const allSel = (ids: string[]) => ids.length > 0 && ids.every(id => sel.has(id));

  const saveAsGroup = async () => {
    if (sel.size === 0) return;
    const name = window.prompt('Tên nhóm (VD: Chi ủy, Tổ công tác 57...):');
    if (!name || !name.trim()) return;
    const g: UserGroup = { id: `group_${Date.now()}`, name: name.trim(), userIds: Array.from(sel), creatorId: currentUserId };
    await MockDB.createUserGroup(g);
    setGroups(prev => [...prev, g]);
  };
  const removeGroup = async (g: UserGroup) => {
    if (!window.confirm(`Xoá nhóm "${g.name}"?`)) return;
    await MockDB.deleteUserGroup(g.id);
    setGroups(prev => prev.filter(x => x.id !== g.id));
  };

  return (
    <Portal><div className="fixed inset-0 z-[120] bg-stone-900/50 flex md:items-center md:justify-center md:p-4">
      <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-3xl md:rounded-xl md:border md:border-stone-200 md:shadow-2xl flex flex-col overflow-hidden">
        {/* Đầu */}
        <div className="px-4 pt-3 pb-3 border-b border-stone-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-stone-900">Thành phần tham dự</h3>
              <p className="text-[13px] text-stone-500 tabular">Đã chọn <b className="text-stone-900 font-semibold">{sel.size}</b> / {users.length} cán bộ</p>
            </div>
            <button onClick={onClose} aria-label="Đóng" className="p-2 -mr-2 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X className="w-5 h-5" /></button>
          </div>
          <div className="relative mt-3">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Tìm theo họ tên..."
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-stone-300 bg-white text-base md:text-sm focus:outline-none focus:ring-3 focus:ring-brand-600/15 focus:border-brand-600"
          />
          </div>
          {/* Chọn nhanh */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button className={chipCls(allSel(users.map(u => u.id)))} onClick={() => toggleMany(users.map(u => u.id))}>Tất cả</button>
            <button className={chipCls(false)} onClick={() => setSel(new Set(locked))}>Bỏ chọn</button>
            <button className={chipCls(allSel(idsOf(u => LEADERS.includes(u.role))))} onClick={() => toggleMany(idsOf(u => LEADERS.includes(u.role)))}>Lãnh đạo, chỉ huy</button>
            <button className={chipCls(allSel(idsOf(u => u.role === UserRole.OFFICER)))} onClick={() => toggleMany(idsOf(u => u.role === UserRole.OFFICER))}>Cán bộ</button>
            {DEPT_ORDER.map(d => {
              const ids = idsOf(u => u.department === d);
              if (!ids.length) return null;
              return <button key={d} className={chipCls(allSel(ids))} onClick={() => toggleMany(ids)}>{d} ({ids.length})</button>;
            })}
          </div>
          {/* Nhóm */}
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 items-center">
            {groups.map(g => {
              const ids = g.userIds.filter(id => users.some(u => u.id === id));
              if (!ids.length) return null;
              return (
                <span key={g.id} className="shrink-0 inline-flex items-center">
                  <button className={chipCls(allSel(ids), 'purple') + ' rounded-r-none'} onClick={() => toggleMany(ids)}>
                    {g.name} ({ids.length})
                  </button>
                  <button onClick={() => removeGroup(g)} aria-label="Xoá nhóm"
                    className="h-8 px-2 border border-l-0 border-stone-200 rounded-r-md text-stone-400 hover:text-stone-700 bg-white"><X className="w-3.5 h-3.5" /></button>
                </span>
              );
            })}
            <button onClick={saveAsGroup} disabled={sel.size === 0}
              className="shrink-0 h-8 px-3 rounded-md text-[13px] font-medium border border-dashed border-stone-300 text-stone-600 hover:border-stone-400 disabled:opacity-40">
              + Lưu lựa chọn thành nhóm
            </button>
          </div>
          {locked.length > 0 && (
            <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Hội nghị đang điểm danh: chỉ bổ sung được người mới, không bỏ được {locked.length} người đã có trong danh sách.
            </p>
          )}
        </div>

        {/* Danh sách */}
        <div className="flex-1 overflow-y-auto">
          {byDept.length === 0 && <p className="text-center text-sm text-stone-400 py-10">Không tìm thấy cán bộ.</p>}
          {byDept.map(([dept, list]) => {
            const ids = list.map(u => u.id);
            const n = ids.filter(id => sel.has(id)).length;
            return (
              <div key={dept}>
                <button onClick={() => toggleMany(ids)}
                  className="sticky top-0 z-10 w-full flex items-center justify-between px-4 h-9 bg-stone-50/95 backdrop-blur border-b border-stone-200 text-xs font-semibold text-stone-600">
                  <span>{dept}</span>
                  <span className={`font-medium tabular ${n === ids.length ? 'text-brand-700' : 'text-stone-500'}`}>{n}/{ids.length} · {n === ids.length ? 'Bỏ chọn tổ' : 'Chọn cả tổ'}</span>
                </button>
                {list.map(u => {
                  const on = sel.has(u.id);
                  const isLocked = lockedSet.has(u.id);
                  return (
                    <label key={u.id}
                      className={`flex items-center gap-3 px-4 py-2.5 border-b border-stone-100 ${isLocked ? 'opacity-60' : 'cursor-pointer hover:bg-stone-50 active:bg-stone-100'}`}>
                      <input type="checkbox" checked={on} disabled={isLocked} onChange={() => toggleOne(u.id)}
                        className="w-5 h-5 rounded accent-red-700 border-stone-300 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm truncate ${on ? 'text-stone-900 font-semibold' : 'text-stone-800 font-medium'}`}>{u.fullName}</div>
                        <div className="text-xs text-stone-500">{u.position || ROLE_LABEL[u.role] || 'Cán bộ'}{isLocked ? ' · đã có trong danh sách' : ''}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Chân */}
        <div className="p-3 border-t border-stone-200 bg-white flex gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button onClick={onClose} className="h-11 px-5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 font-semibold text-sm">Huỷ</button>
          <button onClick={() => onDone(Array.from(sel))}
            className="flex-1 h-11 rounded-lg bg-brand-700 hover:bg-brand-800 text-white font-semibold text-sm">
            Xong · {sel.size} cán bộ
          </button>
        </div>
      </div>
    </div></Portal>
  );
};
