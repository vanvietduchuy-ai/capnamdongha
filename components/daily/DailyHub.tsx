import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, CloudOff, Loader2 } from 'lucide-react';
import { DailyUnit, User } from '../../types';
import { Daily, DailyMe, dayText, isUnit, periodText, ROLE_TEXT, vnDateTime, vnTime, weekdayText } from '../../services/dailyReportService';
import { card, Chip, Empty } from '../learning/common';
import { DailyForm } from './DailyForm';
import { DailyBoardView } from './DailyBoard';
import { DailyStats } from './DailyStats';
import { DailyAssign } from './DailyAssign';

interface Props {
  currentUser: User;
  users: User[];
  openUnit?: string | null;     // mở thẳng biểu mẫu từ link / mã QR
  onOpened?: () => void;
}
type Tab = 'MINE' | 'BOARD' | 'STATS' | 'ASSIGN';

/** Báo cáo ngày: cán bộ được phân công báo cáo tình hình ANTT hằng ngày; chỉ huy, Tổ Tổng hợp theo dõi, tổng hợp */
export const DailyHub: React.FC<Props> = ({ currentUser, users, openUnit, onOpened }) => {
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

  // Mở từ link / mã QR: ?bao-cao-ngay=CSKV
  useEffect(() => {
    if (!me?.currentDay || !openUnit) return;
    if (isUnit(openUnit)) { setTab('MINE'); setForm({ unit: openUnit, day: me.currentDay }); }
    else {
      const mine = (me.mine || []).filter(m => !m.overdue);
      if (mine.length === 1) setForm({ unit: mine[0].unit, day: mine[0].day });
    }
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

  const tabs: [Tab, string][] = [['MINE', 'Báo cáo của tôi'],
    ...(canBoard ? [['BOARD', 'Theo dõi'] as [Tab, string]] : []),
    ...(canManage ? [['STATS', 'Tổng hợp'] as [Tab, string]] : []),
    ...(canBoard ? [['ASSIGN', 'Phân công'] as [Tab, string]] : [])];
  const active = tabs.some(t => t[0] === tab) ? tab : 'MINE';
  const mine = me.mine || [];
  const pending = mine.filter(m => !m.reported).length;

  return (
    <div data-testid="daily-hub">
      {tabs.length > 1 && (
        <div className={`mb-4 md:mb-6 grid grid-cols-${tabs.length} md:inline-grid md:grid-flow-col bg-stone-200/60 p-1 rounded-lg w-full md:w-auto`} role="tablist"
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
          <div>
            <div className="text-[13px] text-stone-500 mb-3">
              Kỳ đang mở: <b className="text-stone-800">{weekdayText(me.currentDay!)}, {dayText(me.currentDay!)}</b> ({periodText(me.currentDay!, deadline)}). Hạn nộp <b className="text-stone-800">{deadline}</b> hằng ngày.
            </div>
            {mine.length === 0 ? (
              <Empty icon={ClipboardCheck} title="Đồng chí chưa được phân công báo cáo ngày"
                text={canManage ? 'Vào thẻ "Phân công" để phân công người báo cáo cho từng đầu mối, hoặc thẻ "Theo dõi" để xem tình hình báo cáo.'
                  : 'Khi được Tổ trưởng hoặc Tổ Tổng hợp phân công, nhiệm vụ báo cáo sẽ hiện ở đây và đồng chí nhận thông báo trong app.'} />
            ) : (
              <div className="space-y-2.5">
                {mine.map(m => (
                  <button key={m.unit + m.day} onClick={() => setForm({ unit: m.unit, day: m.day })} data-testid="daily-mine-item" data-unit={m.unit}
                    className={`${card} w-full text-left p-4 flex items-center gap-3 ${m.overdue ? 'border-red-300 bg-red-50/60' : ''}`}>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${m.reported ? 'bg-emerald-50 text-emerald-700' : m.overdue ? 'bg-red-100 text-red-700' : 'bg-brand-50 text-brand-700'}`}>
                      {m.reported ? <CheckCircle2 className="w-6 h-6" /> : m.overdue ? <AlertTriangle className="w-6 h-6" /> : <ClipboardCheck className="w-6 h-6" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-stone-900">{m.unitName} <span className="font-normal text-stone-500">· ngày {dayText(m.day)}</span></div>
                      <div className="text-[13px] text-stone-600 mt-0.5 flex flex-wrap items-center gap-1.5">
                        {m.reported
                          ? <>{m.status === 'NORMAL' ? <Chip tone="green">Bình thường</Chip> : <Chip tone="orange">Có vụ việc</Chip>} Đ/c {m.reporterName} đã báo lúc {m.submittedAt ? vnTime(m.submittedAt) : ''}</>
                          : m.overdue ? <span className="text-red-700 font-semibold">Chưa báo cáo — đã quá hạn, bấm để nộp bù</span>
                            : <span className="text-brand-700 font-semibold">Chưa báo cáo — hạn {me.deadlineAt ? vnDateTime(me.deadlineAt) : deadline}</span>}
                      </div>
                      <div className="text-[12px] text-stone-400 mt-0.5">{ROLE_TEXT[m.role]}</div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-stone-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {active === 'BOARD' && <DailyBoardView initialDay={me.currentDay!} deadline={deadline} />}
        {active === 'STATS' && <DailyStats currentDay={me.currentDay!} />}
        {active === 'ASSIGN' && <DailyAssign me={currentUser} users={users} currentDay={me.currentDay!} deadline={deadline}
          canManage={canManage} leaderOf={leaderOf} onDeadlineChanged={load} />}
      </div>
    </div>
  );
};
