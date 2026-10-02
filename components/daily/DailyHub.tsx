import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, CloudOff, Loader2, Shield, Siren, Users } from 'lucide-react';
import { DailyMine, DailyUnit, User, UserRole } from '../../types';
import { Daily, DailyMe, dayShort, UNITS, vnTime } from '../../services/dailyReportService';
import { card, Empty } from '../learning/common';
import { DailyForm } from './DailyForm';
import { DailyBoardView } from './DailyBoard';
import { DailyStats } from './DailyStats';
import { DailySettings } from './DailySettings';

interface Props {
  currentUser: User;
  users: User[];
  openUnit?: string | null;     // mở từ link / mã QR chung
  onOpened?: () => void;
}
type Tab = 'MINE' | 'BOARD' | 'STATS' | 'SETUP';

const ME_CACHE = 'daily_me_cache';
const LAST_UNIT = 'daily_last_unit';
const readCache = (uid: string): Partial<DailyMe> | null => {
  try { const c = JSON.parse(localStorage.getItem(ME_CACHE) || 'null'); return c && c.uid === uid ? c.me : null; } catch { return null; }
};

/** Báo cáo ngày: cán bộ tự chọn vai trò (tổ / trực ban) để báo cáo; chỉ huy, Tổ Tổng hợp, người được cấp quyền theo dõi, tổng hợp */
export const DailyHub: React.FC<Props> = ({ currentUser, openUnit, onOpened }) => {
  // Hiện ngay dữ liệu lần trước (nếu có), cập nhật máy chủ ở nền
  const [me, setMe] = useState<Partial<DailyMe> | null>(() => readCache(currentUser.id));
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem('daily_tab') as Tab) || 'MINE'; } catch { return 'MINE'; } });
  const [form, setForm] = useState<{ unit: DailyUnit; day: string; reported: boolean } | null>(null);
  const [offset, setOffset] = useState(0);
  const [fresh, setFresh] = useState(false);
  const lastUnit = (() => { try { return localStorage.getItem(LAST_UNIT); } catch { return null; } })();
  const cloud = Daily.available();

  const load = useCallback(async () => {
    const r = await Daily.me();
    if (!r.ok) { setErr(r.message || 'Không tải được.'); return; }
    setErr(''); setMe(r); setFresh(true); setOffset((r.serverNow || Date.now()) - Date.now());
    try { localStorage.setItem(ME_CACHE, JSON.stringify({ uid: currentUser.id, me: r })); } catch { /* bỏ qua */ }
  }, [currentUser.id]);
  useEffect(() => { if (cloud) load(); }, [cloud, load]);
  useEffect(() => { try { localStorage.setItem('daily_tab', tab); } catch { /* bỏ qua */ } }, [tab]);

  // Mở từ link / mã QR chung: luôn về màn hình chọn vai trò
  useEffect(() => {
    if (!openUnit) return;
    setTab('MINE'); setForm(null);
    onOpened?.();
  }, [openUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cloud) return <Empty icon={CloudOff} title="Cần kết nối máy chủ" text="Báo cáo ngày chỉ chạy khi đã kết nối Supabase." />;
  if (err && !me) return <div className="rounded-xl bg-red-50 text-red-800 px-4 py-3 text-[15px]" data-testid="daily-error">{err}
    <button className="block mt-2 font-semibold underline" onClick={load}>Thử lại</button></div>;
  if (!me) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;

  const deadline = me.deadline || '07:30';
  const canManage = !!me.canManage;
  const leaderOf = me.leaderOf || [];
  const canBoard = canManage || leaderOf.length > 0;
  // Máy chủ còn chạy bản SQL cũ (phân công cố định) → cán bộ không báo cáo được
  const oldServer = fresh && !(Number((me as any).v) >= 4);

  if (form) {
    return <DailyForm me={currentUser} day={form.day} unit={form.unit} reported={form.reported} deadline={deadline} clockOffset={offset}
      onBack={() => { setForm(null); load(); }} onSubmitted={load} />;
  }

  const tabs: [Tab, string][] = [['MINE', 'Báo cáo'],
    ...(canBoard ? [['BOARD', 'Theo dõi'] as [Tab, string]] : []),
    ...(canManage ? [['STATS', 'Tổng hợp'] as [Tab, string], ['SETUP', 'Mã QR'] as [Tab, string]] : [])];
  const active = tabs.some(t => t[0] === tab) ? tab : 'MINE';
  const mine = me.mine || [];
  const current = mine.filter(m => !m.overdue);
  const overdue = mine.filter(m => m.overdue);
  const pending = current.filter(m => m.own && !m.reported).length;
  const open = (m: DailyMine) => {
    try { localStorage.setItem(LAST_UNIT, m.unit); } catch { /* bỏ qua */ }
    setForm({ unit: m.unit, day: m.day, reported: !!m.reported });
  };
  const past = (me.deadlineAt || 0) > 0 && Date.now() + offset > (me.deadlineAt || 0);

  return (
    <div data-testid="daily-hub">
      {tabs.length > 1 && (
        <div className="mb-3 md:mb-6 grid md:inline-grid md:grid-flow-col bg-stone-200/60 p-1 rounded-xl w-full md:w-auto" role="tablist"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map(([t, label]) => (
            <button key={t} role="tab" aria-selected={active === t} onClick={() => setTab(t)} data-testid={`daily-tab-${t.toLowerCase()}`}
              className={`h-9 md:px-5 text-[14px] rounded-lg transition-colors whitespace-nowrap ${active === t ? 'bg-white text-stone-900 font-semibold shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}>
              {label}{t === 'MINE' && pending > 0 && <span className="ml-1.5 inline-flex min-w-5 h-5 px-1 rounded-full bg-brand-700 text-white text-[11px] font-bold items-center justify-center">{pending}</span>}
            </button>
          ))}
        </div>
      )}

      <div key={active} className="view-enter">
        {active === 'MINE' && (
          <div data-testid="daily-role-picker">
            {oldServer && (
              <div className="mb-3 rounded-xl bg-red-50 text-red-800 px-4 py-3 text-[14px]" data-testid="daily-old-server">
                <b>Máy chủ chưa cập nhật báo cáo ngày.</b> {canManage || currentUser.role === UserRole.ADMIN
                  ? 'Quản trị viên mở Supabase → SQL Editor, chạy lại toàn bộ file supabase/09_bao_cao_ngay.sql.'
                  : 'Đồng chí báo Tổ Tổng hợp cập nhật máy chủ.'}
              </div>
            )}
            <div className="flex items-baseline justify-between gap-2 mb-2.5">
              <div className="font-bold text-[17px] text-stone-900">Chọn đầu mối báo cáo</div>
              <div className={`text-[13px] whitespace-nowrap ${past ? 'text-red-700 font-semibold' : 'text-stone-500'}`}>Ngày {dayShort(me.currentDay!)} · hạn {deadline}</div>
            </div>
            {current.length === 0 ? (
              <Empty icon={ClipboardCheck} title="Tài khoản này không báo cáo ngày" text={currentUser.role === UserRole.ADMIN ? 'Tài khoản quản trị chỉ theo dõi.' : 'Liên hệ Tổ Tổng hợp để được kiểm tra tài khoản.'} />
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                {current.map(m => <RoleCard key={m.unit} m={m} last={m.unit === lastUnit} onClick={() => open(m)} />)}
              </div>
            )}
            {overdue.length > 0 && (
              <div className="mt-5">
                <div className="font-bold text-[15px] text-stone-900 mb-2">Nộp bù kỳ trước</div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {overdue.map(m => (
                    <button key={m.unit + m.day} onClick={() => open(m)} data-testid="daily-overdue-item" data-unit={m.unit}
                      className={`${card} w-full text-left p-3 border-red-300 bg-red-50/60`}>
                      <div className="font-semibold text-[15px] text-stone-900 leading-tight">{m.unitName}</div>
                      <div className="text-[12px] text-red-700 mt-0.5 inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Ngày {dayShort(m.day)} chưa báo</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {active === 'BOARD' && <DailyBoardView initialDay={me.currentDay!} deadline={deadline} />}
        {active === 'STATS' && <DailyStats currentDay={me.currentDay!} />}
        {active === 'SETUP' && <DailySettings me={currentUser} deadline={deadline} onDeadlineChanged={load} />}
      </div>
    </div>
  );
};

const isTo = (u: DailyUnit) => !!UNITS.find(x => x.id === u)?.dept;

/** Thẻ chọn vai trò (2 cột trên điện thoại): tên đầu mối + đã có ai báo chưa */
const RoleCard: React.FC<{ m: DailyMine; last: boolean; onClick: () => void }> = ({ m, last, onClick }) => {
  const Icon = isTo(m.unit) ? Users : m.unit === 'TBHS' ? Siren : Shield;
  return (
    <button onClick={onClick} data-testid="daily-role" data-unit={m.unit}
      className={`${card} w-full text-left p-3 min-h-[96px] flex flex-col gap-2 ${(m.own || last) && !m.reported ? 'ring-2 ring-brand-700/50' : ''} ${m.reported ? 'bg-emerald-50/40' : ''}`}>
      <div className="flex items-center gap-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${m.reported ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-50 text-brand-700'}`}>
          {m.reported ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
        </div>
        <div className="font-bold text-[15px] text-stone-900 leading-tight">{m.unitName}</div>
      </div>
      <div className="text-[12px] leading-snug">
        {m.reported
          ? <span className={m.status === 'NORMAL' ? 'text-emerald-700 font-semibold' : 'text-orange-700 font-semibold'}>
              {m.status === 'NORMAL' ? 'Bình thường' : 'Có vụ việc'} · {m.submittedAt ? vnTime(m.submittedAt) : ''}<span className="block font-normal text-stone-500 truncate">Đ/c {m.reporterName}</span></span>
          : <span className="text-brand-700 font-semibold">Chưa báo cáo</span>}
        {!!m.flash && <span className="block text-red-700 font-semibold">{m.flash} báo nhanh</span>}
      </div>
    </button>
  );
};
