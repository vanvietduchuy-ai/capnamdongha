import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';
import { conLai, conLaiNgan, hai, MAU_GAP, mucGap } from '../lib/dinhDang';
import { useBayGio } from '../lib/useDuLieu';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export function The({ children, className, as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' }) {
  return <Tag className={cx('rounded-2xl border border-vien bg-white', className)}>{children}</Tag>;
}

export function TieuDeThe({ children, phai }: { children: ReactNode; phai?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="m-0 flex-1 text-[15px] font-bold">{children}</h2>
      {phai}
    </div>
  );
}

type NutProps = ButtonHTMLAttributes<HTMLButtonElement> & { kieu?: 'chinh' | 'phu' | 'nguy' | 'nhe' | 'do'; dangChay?: boolean; icon?: ReactNode };
export function Nut({ kieu = 'phu', dangChay, icon, children, className, disabled, ...p }: NutProps) {
  const k = {
    chinh: 'bg-do text-white hover:bg-do-2 border-transparent shadow-sm shadow-do/25',
    phu: 'bg-white text-den border-vien-2 hover:bg-nen-2',
    nguy: 'bg-white text-nguy border-nguy/40 hover:bg-nguy-nhat',
    nhe: 'bg-transparent text-do border-transparent hover:bg-do/5',
    do: 'bg-do text-white border-transparent hover:bg-do-2 shadow-sm shadow-do/25',
  }[kieu];
  return (
    <button {...p} disabled={disabled || dangChay}
      className={cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50', k, className)}>
      {dangChay ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Chip({ children, nen = 'bg-nen-3', chu = 'text-mo-2', className }: { children: ReactNode; nen?: string; chu?: string; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11.5px] font-bold leading-5', nen, chu, className)}>{children}</span>;
}

export function TheSo({ nhan, giaTri, phu, mau = 'text-den' }: { nhan: string; giaTri: ReactNode; phu?: ReactNode; mau?: string }) {
  return (
    <The as="div" className="flex flex-col gap-1 p-4">
      <span className="text-[13px] text-mo">{nhan}</span>
      <span className={cx('so text-[26px] font-bold leading-tight', mau)}>{giaTri}</span>
      {phu && <span className="text-xs text-mo">{phu}</span>}
    </The>
  );
}

export function DangTai({ chu = 'Đang tải…' }: { chu?: string }) {
  return <div className="flex items-center gap-2 p-6 text-sm text-mo"><Loader2 className="h-4 w-4 animate-spin" />{chu}</div>;
}

export function HopLoi({ loi, taiLai }: { loi: string; taiLai?: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-nguy/30 bg-nguy-nhat p-4 text-sm text-nguy">
      <span className="flex-1">{loi}</span>
      {taiLai && <Nut kieu="nguy" onClick={taiLai}>Thử lại</Nut>}
    </div>
  );
}

export function Rong({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-vien-2 p-6 text-center text-sm text-mo">{children}</div>;
}

export function TieuDeTrang({ tren, ten, phai }: { tren?: ReactNode; ten: ReactNode; phai?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-[min(100%,260px)] flex-1 flex-col gap-1">
        {tren && <div className="text-[13px] text-mo">{tren}</div>}
        <h1 className="m-0 text-[22px] font-extrabold tracking-tight md:text-[26px]">{ten}</h1>
      </div>
      {phai && <div className="flex flex-wrap gap-2">{phai}</div>}
    </header>
  );
}

// Đồng hồ đếm ngược lớn (ngày – giờ – phút – giây)
export function DongHo({ han, toi = true }: { han: string; toi?: boolean }) {
  const t = useBayGio();
  const c = conLai(han, t);
  const o = [[c.ngay, 'NGÀY'], [c.gio, 'GIỜ'], [c.phut, 'PHÚT'], [c.giay, 'GIÂY']] as const;
  return (
    <div className="flex gap-2 sm:gap-3" aria-label={`Còn ${c.ngay} ngày ${c.gio} giờ ${c.phut} phút`}>
      {o.map(([v, l]) => (
        <div key={l} className={cx('flex h-20 w-[72px] flex-col items-center justify-center gap-1 rounded-2xl sm:h-[92px] sm:w-24', toi ? 'bg-ink-3' : 'bg-nen')}>
          <span className="so text-[30px] font-bold leading-none sm:text-[38px]">{hai(v)}</span>
          <span className={cx('text-[10.5px] tracking-widest', toi ? 'text-[#E9CBC7]' : 'text-mo')}>{l}</span>
        </div>
      ))}
    </div>
  );
}

export function ChipHan({ han, className }: { han: string; className?: string }) {
  const t = useBayGio();
  const m = MAU_GAP[mucGap(new Date(han).getTime() - t)];
  return <span className={cx('so inline-flex rounded-full px-2.5 py-1 text-xs font-bold', m.nen, m.chu, className)}>{conLaiNgan(han, t)}</span>;
}

export function NhanGap({ han }: { han: string }) {
  const t = useBayGio(30000);
  const m = MAU_GAP[mucGap(new Date(han).getTime() - t)];
  return <span className={cx('rounded-full px-3 py-1 text-xs font-bold', m.nen, m.chu)}>{m.nhan}</span>;
}

// Thanh tiến độ có vạch mức giao và vạch TB
export function ThanhTyLe({ tyLe, mauThanh, vachGiao, vachTb, cao = 'h-2' }: { tyLe: number; mauThanh: string; vachGiao?: number | null; vachTb?: number | null; cao?: string }) {
  const pct = (v: number) => `${Math.max(0, Math.min(99.5, v * 100))}%`;
  return (
    <div className={cx('relative rounded-full bg-[#EEEBE3]', cao)}>
      <div className={cx('rounded-full', cao, mauThanh)} style={{ width: pct(Math.min(1, tyLe)) }} />
      {vachGiao != null && <div className="absolute -top-1 h-[calc(100%+8px)] w-0.5 bg-ink" style={{ left: pct(vachGiao) }} title="Mức giao" />}
      {vachTb != null && <div className="absolute -top-1 h-[calc(100%+8px)] border-l-2 border-dotted border-mo" style={{ left: pct(vachTb) }} title="Trung bình tỉnh" />}
    </div>
  );
}

export function HopThoai({ mo, dong, tieuDe, children, rong = 'max-w-lg' }: { mo: boolean; dong: () => void; tieuDe: string; children: ReactNode; rong?: string }) {
  useEffect(() => {
    if (!mo) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') dong(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [mo, dong]);
  if (!mo) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onClick={dong}>
      <div role="dialog" aria-modal="true" aria-label={tieuDe} onClick={(e) => e.stopPropagation()}
        className={cx('max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl', rong)}>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="m-0 flex-1 text-lg font-bold">{tieuDe}</h2>
          <button onClick={dong} aria-label="Đóng" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-nen"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function O({ nhan, children, goiY }: { nhan: string; children: ReactNode; goiY?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-mo-2">
      {nhan}
      {children}
      {goiY && <span className="text-xs font-normal text-mo">{goiY}</span>}
    </label>
  );
}
export const lopO = 'min-h-11 rounded-xl border border-vien-2 bg-nen-2 px-3 text-[15px] font-normal text-den outline-none focus:border-do focus:bg-white disabled:opacity-60';

// Biểu trưng dùng chung (ảnh cờ Đảng — public/logo.jpg)
export function LogoBcd({ className = 'h-11 w-11' }: { className?: string }) {
  return <img src="/logo.jpg" alt="Biểu trưng Ban Chỉ đạo 57" width={96} height={96} className={cx('shrink-0 rounded-xl object-cover ring-1 ring-black/10', className)} />;
}
