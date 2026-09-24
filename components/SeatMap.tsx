import React from 'react';
import { Seat, SeatLayout } from '../types';
import { SeatState } from '../lib/seating';

/** Hình người (đầu + vai) — đặc hoặc viền */
export const PersonIcon: React.FC<{ fill?: string; stroke?: string; className?: string }> = ({ fill = 'currentColor', stroke, className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <circle cx="12" cy="7.4" r="4.6" fill={stroke ? 'none' : fill} stroke={stroke} strokeWidth={stroke ? 1.6 : 0} />
    <path d="M3.2 21.2c0-4.9 3.9-8 8.8-8s8.8 3.1 8.8 8c0 .6-.4 1-1 1H4.2c-.6 0-1-.4-1-1z" fill={stroke ? 'none' : fill} stroke={stroke} strokeWidth={stroke ? 1.6 : 0} />
  </svg>
);

export const SEAT_STYLE: Record<SeatState, { cell: string; icon: string; outline?: boolean; label: string }> = {
  present: { cell: 'bg-emerald-50 border-emerald-200 text-emerald-900', icon: '#16a34a', label: 'Đã điểm danh' },
  absent:  { cell: 'bg-red-50 border-red-200 text-red-900', icon: '#dc2626', label: 'Chưa điểm danh' },
  excused: { cell: 'bg-amber-50 border-amber-200 text-amber-900', icon: '#f59e0b', label: 'Vắng có lý do' },
  outside: { cell: 'bg-white border-stone-200 text-stone-400', icon: '#b6bcc6', outline: true, label: 'Không thuộc thành phần' },
  suspect: { cell: 'bg-emerald-50 border-orange-500 border-dashed border-2 text-emerald-900', icon: '#16a34a', label: 'Nghi vấn' },
  empty:   { cell: 'bg-transparent border-stone-200 border-dashed text-stone-300', icon: '#d6d9df', outline: true, label: 'Ghế trống' }
};

export const SeatLegend: React.FC<{ className?: string; compact?: boolean }> = ({ className = '', compact }) => (
  <div className={`flex flex-wrap gap-x-3 gap-y-1 ${compact ? 'text-[11px]' : 'text-[12.5px]'} font-medium text-stone-600 ${className}`}>
    {(['present', 'absent', 'excused', 'outside'] as SeatState[]).map(k => (
      <span key={k} className="inline-flex items-center gap-1">
        <PersonIcon className="w-3.5 h-3.5" fill={SEAT_STYLE[k].icon} stroke={SEAT_STYLE[k].outline ? SEAT_STYLE[k].icon : undefined} />{SEAT_STYLE[k].label}
      </span>
    ))}
    <span className="inline-flex items-center gap-1"><span className="w-3.5 h-3.5 rounded-[3px] border-2 border-dashed border-orange-500" />Nghi vấn</span>
  </div>
);

interface Props {
  layout: SeatLayout;
  stateOf: (s: Seat) => SeatState;
  /** mini: chỉ hình người (điện thoại, xem trước); normal: có tên; big: màn chiếu */
  size?: 'mini' | 'normal' | 'big';
  onSeat?: (s: Seat) => void;
  selected?: Seat | null;
  className?: string;
  /** Ghi đè nhãn hiển thị (VD tên đầy đủ khi xem trước) */
  labelOf?: (s: Seat) => string;
}

/** Sơ đồ chỗ ngồi 2 khối, cột số hàng ở lối đi giữa, hàng 1 sát bục chủ toạ */
export const SeatMap: React.FC<Props> = ({ layout, stateOf, size = 'normal', onSeat, selected, className = '', labelOf }) => {
  const L = layout.leftCols, R = layout.rightCols;
  const at = new Map(layout.seats.map(s => [`${s.r}:${s.c}`, s]));
  const cols = R > 0 ? `repeat(${L}, minmax(0,1fr)) ${size === 'mini' ? '12px' : size === 'big' ? '22px' : '18px'} repeat(${R}, minmax(0,1fr))` : `repeat(${L}, minmax(0,1fr))`;
  const gap = size === 'mini' ? 'gap-[3px]' : 'gap-1';
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < L + R; c++) {
      if (R > 0 && c === L) cells.push(<div key={`n${r}`} className={`flex items-center justify-center font-extrabold text-brand-700 tabular ${size === 'mini' ? 'text-[8px]' : size === 'big' ? 'text-sm' : 'text-[11px]'}`}>{r + 1}</div>);
      const s = at.get(`${r}:${c}`);
      if (!s) { cells.push(<div key={`${r}:${c}`} />); continue; }
      const st = stateOf(s);
      const sty = SEAT_STYLE[st];
      const isSel = !!selected && selected.r === s.r && selected.c === s.c;
      const label = labelOf ? labelOf(s) : s.label;
      const common = `relative border rounded-md flex flex-col items-center justify-center min-w-0 ${sty.cell} ${isSel ? 'ring-2 ring-stone-900 ring-offset-1' : ''} ${onSeat ? 'cursor-pointer active:scale-95 transition-transform' : ''}`;
      const icon = <PersonIcon className={size === 'mini' ? 'w-3 h-3' : size === 'big' ? 'w-[22px] h-[22px] shrink-0' : 'w-4 h-4 shrink-0'} fill={sty.icon} stroke={sty.outline ? sty.icon : undefined} />;
      const badge = st === 'suspect' && size !== 'mini'
        ? <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-orange-500 text-white text-[10px] font-extrabold flex items-center justify-center">!</span> : null;
      const body = size === 'mini'
        ? icon
        : <>{icon}<span className={`max-w-full text-center font-bold leading-[1.08] tracking-tight ${size === 'big' ? 'text-[11px]' : 'text-[10px]'}`}>{label}</span>
            {s.team && size === 'big' && <span className="text-[9px] font-bold opacity-70 leading-none mt-px">{s.team}</span>}</>;
      const cls = `${common} ${size === 'mini' ? 'h-[18px] rounded-[4px]' : size === 'big' ? 'px-px py-0.5' : 'min-h-[46px] px-px py-1'}`;
      cells.push(onSeat
        ? <button key={`${r}:${c}`} type="button" onClick={() => onSeat(s)} className={cls} title={label} data-seat={`${r + 1}-${c + 1}`} data-state={st}>{body}{badge}</button>
        : <div key={`${r}:${c}`} className={cls} title={label} data-seat={`${r + 1}-${c + 1}`} data-state={st}>{body}{badge}</div>);
    }
  }
  return (
    <div className={`grid ${gap} ${size === 'big' ? 'h-full' : ''} ${className}`}
      style={{ gridTemplateColumns: cols, gridTemplateRows: size === 'big' ? `repeat(${layout.rows}, minmax(0,1fr))` : undefined }}
      data-testid={`seatmap-${size}`}>
      {cells}
    </div>
  );
};

export default SeatMap;
