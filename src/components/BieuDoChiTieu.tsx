// Biểu đồ xu hướng một chỉ tiêu: số tỉnh chốt (liền, đỏ) và số đơn vị báo (đứt, xanh) theo thời gian; vạch mức giao, TB tỉnh
import { useEffect, useRef, useState } from 'react';
import { ngay, phanTram } from '../lib/dinhDang';

type Diem = { ngay: string; ty_le: number };
const MAU_TINH = '#A4161A', MAU_DV = '#2F5BB7';

export default function BieuDoChiTieu({ tinh, donVi, giao, tb, cao }: { tinh: Diem[]; donVi: Diem[]; giao: number | null; tb: number | null; cao: boolean }) {
  const [hover, setHover] = useState<{ x: number; y: number; d: Diem; loai: string } | null>(null);
  const khung = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = khung.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const tatCa = [...tinh, ...donVi];
  if (tatCa.length === 0) return null;
  const H = 220, L = 44, R = 16, T = 14, B = 26;
  const ts = tatCa.map((d) => Date.parse(d.ngay));
  let t0 = Math.min(...ts), t1 = Math.max(...ts);
  if (t0 === t1) { t0 -= 7 * 864e5; t1 += 7 * 864e5; }
  // Trục dọc theo dữ liệu (+ TB tỉnh); mức giao nằm xa thì ghi nhãn thay vì kéo giãn trục
  const vals = [...tatCa.map((d) => Number(d.ty_le)), ...(tb != null ? [tb] : [])];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const giaoTrong = cao && giao != null && giao <= hi + 0.15;
  if (giaoTrong) vals.push(giao!);
  let v0 = Math.max(0, Math.min(...vals) - 0.04), v1 = Math.max(...vals) + 0.04;
  if (v1 - v0 < 0.1) { const g = (v0 + v1) / 2; v0 = Math.max(0, g - 0.05); v1 = g + 0.05; }
  void lo;
  const X = (s: string) => L + ((Date.parse(s) - t0) / (t1 - t0)) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - v0) / (v1 - v0)) * (H - T - B);
  const duong = (ds: Diem[]) => ds.map((d, i) => `${i ? 'L' : 'M'}${X(d.ngay).toFixed(1)},${Y(Number(d.ty_le)).toFixed(1)}`).join(' ');
  const luoi = [0, 0.25, 0.5, 0.75, 1].map((k) => v0 + k * (v1 - v0));
  const nhanTruc = (v: number) => `${(v * 100).toFixed(v1 - v0 < 0.2 ? 1 : 0).replace('.', ',')}%`;
  const moc = [...new Set(tatCa.map((d) => d.ngay))].sort();
  const mocHien = moc.filter((_, i) => i % Math.ceil(moc.length / 6) === 0);
  const tinhSx = [...tinh].sort((a, b) => a.ngay.localeCompare(b.ngay));
  const dvSx = [...donVi].sort((a, b) => a.ngay.localeCompare(b.ngay));

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-mo-2">
        <span className="flex items-center gap-1.5"><svg width="22" height="8" aria-hidden><line x1="0" y1="4" x2="22" y2="4" stroke={MAU_TINH} strokeWidth="2" /></svg>Tỉnh chốt</span>
        {dvSx.length > 0 && <span className="flex items-center gap-1.5"><svg width="22" height="8" aria-hidden><line x1="0" y1="4" x2="22" y2="4" stroke={MAU_DV} strokeWidth="2" strokeDasharray="5 3" /></svg>Đơn vị báo</span>}
        {giaoTrong && <span className="flex items-center gap-1.5"><svg width="22" height="8" aria-hidden><line x1="0" y1="4" x2="22" y2="4" stroke="#1F1A17" strokeWidth="1.5" /></svg>Mức giao</span>}
        {tb != null && <span className="flex items-center gap-1.5"><svg width="22" height="8" aria-hidden><line x1="0" y1="4" x2="22" y2="4" stroke="#8A8378" strokeWidth="1.5" strokeDasharray="2 3" /></svg>TB tỉnh</span>}
      </div>
      <div className="relative" ref={khung}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label="Biểu đồ tỷ lệ theo thời gian" onMouseLeave={() => setHover(null)}>
        {luoi.map((v) => (
          <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="#EEEBE3" /><text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize="10.5" fill="#5B6170">{nhanTruc(v)}</text></g>
        ))}
        {mocHien.map((d) => <text key={d} x={X(d)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="#5B6170">{ngay(d).slice(0, 5)}</text>)}
        {giaoTrong && <line x1={L} x2={W - R} y1={Y(giao!)} y2={Y(giao!)} stroke="#1F1A17" strokeWidth="1.5" />}
        {cao && giao != null && !giaoTrong && <text x={W - R} y={T + 4} textAnchor="end" fontSize="11" fontWeight="600" fill="#1F1A17">Mức giao {Math.round(giao * 100)}% ↑</text>}
        {tb != null && <line x1={L} x2={W - R} y1={Y(tb)} y2={Y(tb)} stroke="#8A8378" strokeWidth="1.5" strokeDasharray="2 3" />}
        {dvSx.length > 1 && <path d={duong(dvSx)} fill="none" stroke={MAU_DV} strokeWidth="2" strokeDasharray="5 3" strokeLinejoin="round" />}
        {tinhSx.length > 1 && <path d={duong(tinhSx)} fill="none" stroke={MAU_TINH} strokeWidth="2" strokeLinejoin="round" />}
        {[...dvSx.map((d) => ({ d, loai: 'Đơn vị báo', mau: MAU_DV })), ...tinhSx.map((d) => ({ d, loai: 'Tỉnh chốt', mau: MAU_TINH }))].map(({ d, loai, mau }, i) => (
          <g key={i} onMouseEnter={() => setHover({ x: X(d.ngay), y: Y(Number(d.ty_le)), d, loai })}>
            <circle cx={X(d.ngay)} cy={Y(Number(d.ty_le))} r="4.5" fill={mau} stroke="#fff" strokeWidth="2" />
            <circle cx={X(d.ngay)} cy={Y(Number(d.ty_le))} r="12" fill="transparent" />
          </g>
        ))}
        {tinhSx.length > 0 && (() => { const d = tinhSx.at(-1)!; return <text x={Math.min(X(d.ngay) + 8, W - R - 40)} y={Y(Number(d.ty_le)) - 8} fontSize="11" fontWeight="700" fill="#1F1A17">{phanTram(d.ty_le)}</text>; })()}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-den px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{ left: `${(hover.x / W) * 100}%`, top: `calc(${(hover.y / H) * 100}% - 8px)` }}>
          <b>{phanTram(hover.d.ty_le, 2)}</b> · {hover.loai} · {ngay(hover.d.ngay)}
        </div>
      )}
      </div>
    </div>
  );
}
