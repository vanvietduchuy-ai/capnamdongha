import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, CloudOff, Loader2, Shield, Siren, Users } from 'lucide-react';
import { DailyMine, DailyUnit, User } from '../../types';
import { Daily, DailyMe, dayText, periodText, UNITS, vnDateTime, vnTime, weekdayText } from '../../services/dailyReportService';
import { card, Chip, Empty } from '../learning/common';
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

/** Báo cáo ngày: cán bộ tự chọn vai trò (tổ / trực ban) để báo cáo; chỉ huy, Tổ Tổng hợp, người được cấp quyền theo dõi, tổng hợp */
export const DailyHub: React.FC<Props> = ({ currentUser, openUnit, onOpened }) => {
  const [me, setMe] = useState<Partial<DailyMe> | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem('daily_tab') as Tab) || 'MINE'; } catch { return 'MINE'; } });
  const [form, setForm] = useState<{ unit: DailyUnit; day: string } | null>(null);
  const [offset, setOffset] = useState(0);
  const cloud = Daily.available();

  const load = useCallback(async () => {
    const r = await Daily.me();
    if (!r.ok) { setErr(r.message || 'Không tải được.'); return; }
    setErr(''); setMe(r); setOffset((r.serverNow || Date.now()) - Date.now());
  }, []);
  useEffect(() => { if (cloud) load(); }, [cloud, load]);
  useEffect(() => { try { localStorage.setItem('daily_tab', tab); } catch { /* bỏ qua */ } }, [tab]);

  // Mở từ link / mã QR chung: luôn về màn hình chọn vai trò
  useEffect(() => {
    if (!me?.currentDay || !openUnit) return;
    setTab('MINE'); setForm(null);
    onOpened?.();
  }, [me?.currentDay, openUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cloud) return <Empty icon={CloudOff} title="Cần kết nối máy chủ" text="Báo cáo ngày chỉ chạy khi đã kết nối Supabase. Quản trị viên chạy file 09_bao_cao_ngay.sql." />;
  if (err) return <div className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm" data-testid="daily-error">{err}</div>;
  if (!me) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;

  const deadline = me.deadline || '07:30';
  const canManage = !!me.canManage;
  const leaderOf = me.leaderOf || [];
  const canBoard = canManage || leaderOf.length > 0;

  if (form) {
    return <DailyForm me={currentUser} day={form.day} unit={form.unit} deadline={deadline} clockOffset={offset}
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
  const open = (m: DailyMine) => setForm({ unit: m.unit, day: m.day });

  return (
    <div data-testid="daily-hub">
      {tabs.length > 1 && (
        <div className="mb-4 md:mb-6 grid md:inline-grid md:grid-flow-col bg-stone-200/60 p-1 rounded-lg w-full md:w-auto" role="tablist"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map(([t, label]) => (
            <button key={t} role="tab" aria-selected={active === t} onClick={() => setTab(t)} data-testid={`daily-tab-${t.toLowerCase()}`}
              className={`h-9 md:px-5 text-[13px] md:text-sm rounded-md transition-colors whitespace-nowrap ${active === t ? 'bg-white text-stone-900 font-semibold shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}>
              {label}{t === 'MINE' && pending > 0 && <span className="ml-1.5 inline-flex min-w-5 h-5 px-1 rounded-full bg-brand-700 text-white text-[11px] font-bold items-center justify-center">{pending}</span>}
            </button>
          ))}
        </div>
      )}

      <div key={active} className="view-enter">
        {active === 'MINE' && (
          <div data-testid="daily-role-picker">
            <div className="text-[13px] text-stone-500 mb-1">
              Kỳ đang mở: <b className="text-stone-800">{weekdayText(me.currentDay!)}, {dayText(me.currentDay!)}</b> ({periodText(me.currentDay!, deadline)}). Hạn nộp <b className="text-stone-800">{deadline}</b> hằng ngày.
            </div>
            <div className="font-bold text-stone-900 mt-3 mb-2">Đồng chí báo cáo với vai trò nào?</div>
            {current.length === 0 ? (
              <Empty icon={ClipboardCheck} title="Tài khoản này không dùng để báo cáo ngày" text="Tài khoản quản trị kỹ thuật chỉ theo dõi, không báo cáo." />
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {current.map(m => <RoleCard key={m.unit} m={m} deadlineText={me.deadlineAt ? vnDateTime(me.deadlineAt) : deadline} onClick={() => open(m)} />)}
              </div>
            )}
            <p className="text-[12px] text-stone-500 mt-3">Không phân công cố định: ai đang trực ban hoặc được tổ giao báo cáo hôm nay thì chọn đúng vai trò đó. Họ tên người báo cáo được ghi lại; đầu mối đã có người báo thì vẫn bổ sung, đính chính được (lưu đủ lịch sử).</p>
            {overdue.length > 0 && (
              <div className="mt-5">
                <div className="font-bold text-stone-900 mb-2">Kỳ trước chưa có ai báo cáo · nộp bù</div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {overdue.map(m => (
                    <button key={m.unit + m.day} onClick={() => open(m)} data-testid="daily-overdue-item" data-unit={m.unit}
                      className={`${card} w-full text-left p-3 flex items-center gap-3 border-red-300 bg-red-50/60`}>
                      <AlertTriangle className="w-5 h-5 text-red-700 shrink-0" />
                      <div className="min-w-0 flex-1"><div className="font-semibold text-stone-900">{m.unitName} <span className="font-normal text-stone-500">· ngày {dayText(m.day)}</span></div>
                        <div className="text-[12px] text-red-700">Đã quá hạn — bấm để nộp bù</div></div>
                      <ChevronRight className="w-5 h-5 text-stone-400 shrink-0" />
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

/** Thẻ chọn vai trò: hiện luôn tình trạng đầu mối đã có ai báo chưa */
const RoleCard: React.FC<{ m: DailyMine; deadlineText: string; onClick: () => void }> = ({ m, deadlineText, onClick }) => {
  const Icon = isTo(m.unit) ? Users : m.unit === 'TBHS' ? Siren : Shield;
  return (
    <button onClick={onClick} data-testid="daily-role" data-unit={m.unit}
      className={`${card} w-full text-left p-4 flex items-center gap-3 ${m.own && !m.reported ? 'ring-2 ring-brand-700/40' : ''}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${m.reported ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700'}`}>
        {m.reported ? <CheckCircle2 className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-stone-900 flex items-center gap-1.5">{m.unitName}{m.own && <Chip tone="amber">Tổ của tôi</Chip>}</div>
        <div className="text-[13px] text-stone-600 mt-0.5 flex flex-wrap items-center gap-1.5">
          {m.reported
            ? <>{m.status === 'NORMAL' ? <Chip tone="green">Bình thường</Chip> : <Chip tone="orange">Có vụ việc</Chip>} Đ/c {m.reporterName} · {m.submittedAt ? vnTime(m.submittedAt) : ''}</>
            : <span className="text-brand-700 font-semibold">Chưa báo cáo · hạn {deadlineText}</span>}
          {!!m.flash && <Chip tone="red">{m.flash} báo cáo nhanh</Chip>}
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-stone-400 shrink-0" />
    </button>
  );
};
