// Định dạng số, ngày, thời gian theo kiểu Việt Nam (giờ Asia/Ho_Chi_Minh)
const TZ = 'Asia/Ho_Chi_Minh';

export const so = (n: number | null | undefined, le = 0) =>
  n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: le, minimumFractionDigits: le });

export const phanTram = (tyLe: number | null | undefined, le = 1) =>
  tyLe == null ? '—' : `${(Number(tyLe) * 100).toLocaleString('vi-VN', { maximumFractionDigits: le, minimumFractionDigits: le })}%`;

export function ngay(d: string | Date | null | undefined): string {
  if (!d) return '…';
  const x = typeof d === 'string' ? new Date(d.length === 10 ? d + 'T00:00:00+07:00' : d) : d;
  return x.toLocaleDateString('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}

function phan(x: Date) {
  const o = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false })
    .formatToParts(x).map((p) => [p.type, p.value]));
  return { gio: `${o.hour === '24' ? '00' : o.hour}:${o.minute}`, dm: `${o.day}/${o.month}`, nam: o.year };
}
/** "HH:mm · dd/MM" */
export function ngayGio(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const p = phan(typeof d === 'string' ? new Date(d) : d);
  return `${p.gio} · ${p.dm}`;
}
/** "HH:mm · dd/MM/yyyy" */
export function ngayGioDu(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const p = phan(typeof d === 'string' ? new Date(d) : d);
  return `${p.gio} · ${p.dm}/${p.nam}`;
}

export function homNayVN(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());   // YYYY-MM-DD
}

export function thuNgay(d = new Date()): string {
  return d.toLocaleDateString('vi-VN', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
}

// Đếm ngược
export type ConLai = { ms: number; ngay: number; gio: number; phut: number; giay: number };
export function conLai(han: string | Date, bayGio = Date.now()): ConLai {
  const ms = new Date(han).getTime() - bayGio;
  const s = Math.max(0, Math.floor(ms / 1000));
  return { ms, ngay: Math.floor(s / 86400), gio: Math.floor((s % 86400) / 3600), phut: Math.floor((s % 3600) / 60), giay: s % 60 };
}
export type MucGap = 'binh_thuong' | 'sap_han' | 'gap' | 'qua_han';
export function mucGap(ms: number): MucGap {
  if (ms <= 0) return 'qua_han';
  if (ms <= 86400000) return 'gap';
  if (ms <= 3 * 86400000) return 'sap_han';
  return 'binh_thuong';
}
export const MAU_GAP: Record<MucGap, { nen: string; chu: string; nhan: string }> = {
  binh_thuong: { nen: 'bg-xanh-nhat', chu: 'text-xanh', nhan: 'Đang mở' },
  sap_han: { nen: 'bg-cam-nhat', chu: 'text-cam-dam', nhan: 'Sắp đến hạn' },
  gap: { nen: 'bg-nguy-nhat', chu: 'text-nguy', nhan: 'Còn dưới 24 giờ' },
  qua_han: { nen: 'bg-nguy', chu: 'text-white', nhan: 'Quá hạn' },
};
export const hai = (n: number) => String(n).padStart(2, '0');
export function conLaiNgan(han: string | Date, bayGio = Date.now()): string {
  const c = conLai(han, bayGio);
  if (c.ms <= 0) {
    const qua = Math.floor(-c.ms / 86400000);
    return qua >= 1 ? `Quá hạn ${qua} ngày` : 'Quá hạn';
  }
  return c.ngay > 0 ? `${c.ngay} ngày ${hai(c.gio)} giờ` : `${hai(c.gio)}:${hai(c.phut)}:${hai(c.giay)}`;
}

// <input type="datetime-local"> <-> thời điểm (giờ VN)
export function sangONhapGio(t: string | null | undefined): string {
  if (!t) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}
export const tuONhapGio = (s: string) => (s ? new Date(`${s}:00+07:00`).toISOString() : null);
