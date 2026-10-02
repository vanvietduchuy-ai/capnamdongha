import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, X, ZoomIn } from 'lucide-react';
import { Portal } from '../Portal';
import { QrScanEngine, EngineInfo } from '../../lib/qrScanEngine';
import { officerPayload, signSlot } from '../../lib/qrCode';
import { backdropClose } from '../../lib/backdrop';

export const btnPrimary = 'inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none';
export const btnSecondary = 'inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none';
export const btnGhost = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-stone-600 hover:bg-stone-100 text-sm font-semibold disabled:opacity-40';
export const card = 'bg-white border border-stone-200 rounded-xl card-3d';
export const inputCls = 'w-full h-11 px-3 rounded-lg border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700';
export const labelCls = 'block text-[13px] font-semibold text-stone-700 mb-1';

export const Chip: React.FC<{ tone?: 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'orange' | 'dark'; children: React.ReactNode; className?: string }> = ({ tone = 'gray', children, className = '' }) => {
  const t = {
    green: 'bg-emerald-50 text-emerald-800 ring-emerald-200', amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200', blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    gray: 'bg-stone-100 text-stone-600 ring-stone-200', orange: 'bg-orange-50 text-orange-700 ring-orange-200',
    dark: 'bg-stone-900 text-white ring-stone-900'
  }[tone];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold ring-1 ring-inset whitespace-nowrap ${t} ${className}`}>{children}</span>;
};

export const ProgressBar: React.FC<{ value: number; tone?: string; className?: string }> = ({ value, tone, className = '' }) => (
  <div className={`h-2 rounded-full bg-stone-200 overflow-hidden ${className}`}>
    <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone || (value >= 100 ? '#16a34a' : '#f59e0b'), transition: 'width .4s' }} />
  </div>
);

/** Khung trượt lên (điện thoại) / hộp giữa màn hình (máy tính) */
export const Sheet: React.FC<{ open: boolean; onClose: () => void; title: React.ReactNode; wide?: boolean; children: React.ReactNode; footer?: React.ReactNode; testId?: string }> =
  ({ open, onClose, title, wide, children, footer, testId }) => {
    if (!open) return null;
    return (
      <Portal>
        <div className="fixed inset-0 z-[110] bg-stone-900/50 flex items-end md:items-center justify-center md:p-6" {...backdropClose(onClose)}>
          <div data-testid={testId} onClick={e => e.stopPropagation()}
            className={`bg-white w-full ${wide ? 'md:max-w-5xl' : 'md:max-w-xl'} rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col`}
            style={{ maxHeight: 'min(94dvh, 100%)' }}>
            <div className="flex items-center gap-2 px-4 md:px-5 h-14 border-b border-stone-200 shrink-0">
              <div className="font-semibold text-stone-900 truncate flex-1">{title}</div>
              <button onClick={onClose} aria-label="Đóng" className="p-2 -mr-2 rounded-lg text-stone-500 hover:bg-stone-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4">{children}</div>
            {footer && <div className="border-t border-stone-200 px-4 md:px-5 py-3 flex gap-2 justify-end shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>{footer}</div>}
          </div>
        </div>
      </Portal>
    );
  };

/**
 * Nội dung bài học dạng chữ (soạn trong app, quy ước đơn giản):
 *  # Tiêu đề lớn · ## Tiêu đề nhỏ · - gạch đầu dòng · **in đậm** · dòng bắt đầu "Ghi nhớ:" hoặc "!" → khung vàng
 */
const inline = (s: string, k: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
  p.startsWith('**') && p.endsWith('**') ? <b key={k + i}>{p.slice(2, -2)}</b> : <React.Fragment key={k + i}>{p}</React.Fragment>);

export const LessonBody: React.FC<{ text?: string | null }> = ({ text }) => {
  const lines = (text || '').replace(/\r/g, '').split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(<ul key={'u' + out.length} className="list-disc pl-5 space-y-1 my-2">{list.map((l, i) => <li key={i}>{inline(l, 'l' + i)}</li>)}</ul>); list = []; } };
  lines.forEach((raw, i) => {
    const l = raw.trim();
    if (/^[-•*]\s+/.test(l)) { list.push(l.replace(/^[-•*]\s+/, '')); return; }
    flush();
    if (!l) return;
    if (l.startsWith('## ')) out.push(<h4 key={i} className="text-[15px] font-bold text-stone-900 mt-4 mb-1">{inline(l.slice(3), 'h' + i)}</h4>);
    else if (l.startsWith('# ')) out.push(<h3 key={i} className="text-lg font-bold text-stone-900 mt-4 mb-1.5">{inline(l.slice(2), 'h' + i)}</h3>);
    else if (/^(!|ghi nhớ:)/i.test(l)) out.push(
      <div key={i} className="my-3 rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2.5 text-stone-800">
        {/^ghi nhớ:/i.test(l) ? <><b>Ghi nhớ:</b>{inline(l.replace(/^ghi nhớ:/i, ''), 'g' + i)}</> : inline(l.replace(/^!\s*/, ''), 'g' + i)}
      </div>);
    else out.push(<p key={i} className="my-2">{inline(l, 'p' + i)}</p>);
  });
  flush();
  return <div className="text-[15px] leading-relaxed text-stone-700">{out}</div>;
};

/** Mã QR có chữ ký đổi 3 giây/lần (dùng khoá do máy chủ cấp, cùng cơ chế điểm danh hội nghị) */
export const useSignedQr = (id: string | null, fetchKey: (id: string) => Promise<{ ok: boolean; message?: string; secret?: string; serverNow?: number; stepMs?: number }>) => {
  const [key, setKey] = useState<{ secret: string; offset: number; step: number } | null>(null);
  const [err, setErr] = useState('');
  const [qr, setQr] = useState('');
  const [left, setLeft] = useState(1);
  useEffect(() => {
    if (!id) return;
    let alive = true; let retry: number | undefined;
    const go = async () => {
      const r = await fetchKey(id);
      if (!alive) return;
      if (r.ok && r.secret) { setKey({ secret: r.secret, offset: Number(r.serverNow || Date.now()) - Date.now(), step: r.stepMs || 3000 }); setErr(''); }
      else { setErr(r.message || 'Không lấy được mã.'); retry = window.setTimeout(go, 5000); }
    };
    setKey(null); setQr(''); go();
    return () => { alive = false; window.clearTimeout(retry); };
  }, [id]);
  useEffect(() => {
    if (!key || !id) return;
    let last = -1; let alive = true;
    const tick = async () => {
      const t = Date.now() + key.offset;
      const slot = Math.floor(t / key.step);
      setLeft(1 - (t % key.step) / key.step);
      if (slot === last) return;
      last = slot;
      try { const code = await signSlot(key.secret, id, slot); if (alive) setQr(officerPayload(id, slot, code)); }
      catch { if (alive) setErr('Trình duyệt không hỗ trợ tạo mã (cần mở bằng đường dẫn https).'); }
    };
    tick();
    const t = window.setInterval(tick, 200);
    return () => { alive = false; window.clearInterval(t); };
  }, [key, id]);
  return { qr, err, left, secLeft: key ? Math.max(1, Math.ceil(left * key.step / 1000)) : 0 };
};

export const QrBox: React.FC<{ qr: string; err: string; left: number; size?: string }> = ({ qr, err, left, size = '100%' }) => (
  <div className="relative w-full h-full" style={{ maxWidth: size }}>
    {qr && (
      <svg className="absolute pointer-events-none" style={{ inset: -4, width: 'calc(100% + 8px)', height: 'calc(100% + 8px)', overflow: 'visible' }} aria-hidden="true">
        <rect x="0" y="0" width="100%" height="100%" rx="16" ry="16" fill="none" stroke="#e5e7eb" strokeWidth="6" />
        <rect x="0" y="0" width="100%" height="100%" rx="16" ry="16" fill="none" stroke="#b91c1c" strokeWidth="6" strokeLinecap="round" pathLength={100}
          strokeDasharray="100" strokeDashoffset={100 - left * 100} style={{ transition: 'stroke-dashoffset .2s linear' }} />
      </svg>
    )}
    {qr
      ? <div key={qr} className="qr-swap w-full h-full p-[4%] bg-white rounded-2xl" data-testid="exam-room-qr" data-qr={qr}><QRCodeSVG value={qr} style={{ width: '100%', height: '100%', display: 'block' }} size={1024} level="L" /></div>
      : <div className="w-full aspect-square flex items-center justify-center text-center text-sm text-stone-500 px-4">{err ? <span className="text-red-600">{err}</span> : 'Đang tạo mã...'}</div>}
  </div>
);

/** Ô quét mã QR (dùng máy quét độ phân giải cao, có phóng to 2×/4×) */
export const QrScanBox: React.FC<{ onText: (t: string) => void; onClose: () => void; hint?: string }> = ({ onText, onClose, hint }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const engRef = useRef<QrScanEngine | null>(null);
  const cb = useRef(onText); cb.current = onText;
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [zoom, setZoom] = useState(1);
  const [err, setErr] = useState('');
  useEffect(() => {
    let done = false;
    (async () => {
      const v = videoRef.current; if (!v) return;
      try {
        const eng = new QrScanEngine(v, t => { if (!done) { done = true; cb.current(t); } });
        engRef.current = eng;
        setInfo(await eng.start(null));
      } catch (e: any) {
        setErr(e?.name === 'NotAllowedError' ? 'Chưa cho phép dùng camera. Vào cài đặt trình duyệt, cho phép camera rồi thử lại.' : 'Không mở được camera.');
      }
    })();
    return () => { done = true; engRef.current?.stop(); engRef.current = null; };
  }, []);
  const z = async (n: number) => { const e = engRef.current; if (!e || !info) return; const v = Math.min(n, info.maxZoom || n); setZoom(v); await e.setZoom(v); };
  return (
    <div className="relative rounded-2xl overflow-hidden bg-black aspect-square w-full max-w-sm mx-auto" data-testid="exam-scan-box">
      <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
      {!info && !err && <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm gap-2"><Loader2 className="w-4 h-4 animate-spin" />Đang mở camera...</div>}
      {err && <div className="absolute inset-0 flex items-center justify-center text-center text-white text-sm p-6">{err}</div>}
      <div className="absolute inset-[18%] border-2 border-white/80 rounded-2xl pointer-events-none"><div className="scan-line" /></div>
      <button onClick={onClose} className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center" aria-label="Đóng camera"><X className="w-5 h-5" /></button>
      <div className="absolute bottom-3 inset-x-0 flex justify-center gap-2">
        {[1, 2, 4].map(n => (
          <button key={n} onClick={() => z(n)} className={`h-9 min-w-11 px-2 rounded-full text-sm font-bold ${Math.round(zoom) === n ? 'bg-white text-stone-900' : 'bg-black/50 text-white'}`}>{n}×</button>
        ))}
      </div>
      {hint && <div className="absolute top-2 left-2 right-12 text-[12px] text-white/90 bg-black/40 rounded-lg px-2 py-1 flex gap-1"><ZoomIn className="w-3.5 h-3.5 shrink-0 mt-px" />{hint}</div>}
    </div>
  );
};

export const Empty: React.FC<{ icon: React.ElementType; title: string; text?: string; action?: React.ReactNode }> = ({ icon: Icon, title, text, action }) => (
  <div className={`${card} p-8 text-center`}>
    <div className="w-12 h-12 mx-auto rounded-xl bg-stone-100 text-stone-500 flex items-center justify-center"><Icon className="w-6 h-6" /></div>
    <div className="mt-3 font-semibold text-stone-900">{title}</div>
    {text && <p className="mt-1 text-sm text-stone-500 max-w-md mx-auto">{text}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const toLocalInput = (ms?: number | null) => {
  if (!ms) return '';
  const d = new Date(Number(ms));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (s: string) => (s ? new Date(s).getTime() : null);
