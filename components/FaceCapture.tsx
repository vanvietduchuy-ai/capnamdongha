import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, AlertCircle, RotateCcw, ImageUp, Copy, CheckCircle2, X } from 'lucide-react';
import { loadFaceApi, detectFrame, captureFace, faceFromFile, mergeFaces, FaceResult } from '../lib/faceCheck';
import { detectInstallEnv } from '../lib/install';
import { Button, haptic } from './UI';
import { drawMesh, smooth, MeshState, Pt } from '../lib/faceMesh';

export type FaceOutcome = FaceResult | { none: true; reason: string };

interface Props {
  /** 'strict': bắt buộc có ảnh mặt; 'flag': cho phép gửi không ảnh (chờ Ban tổ chức kiểm tra) */
  mode: 'flag' | 'strict';
  onDone: (r: FaceOutcome) => void;
  onCancel: () => void;
}

type Phase = 'loading' | 'center1' | 'turn' | 'center2' | 'capturing' | 'done' | 'error';

const STEP_TEXT: Record<Phase, string> = {
  loading: 'Đang mở camera trước...',
  center1: 'Nhìn thẳng vào camera',
  turn: 'Quay nhẹ mặt sang trái hoặc phải',
  center2: 'Nhìn thẳng lại',
  capturing: 'Đang chụp...',
  done: 'Đã chụp xong',
  error: ''
};

export const FaceCapture: React.FC<Props> = ({ mode, onDone, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const aliveRef = useRef(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const meshRef = useRef<MeshState>({ pts: null, seen: 0, vw: 0, vh: 0 });
  const [showMesh, setShowMesh] = useState(true);
  const showMeshRef = useRef(true);
  const [phase, setPhase] = useState<Phase>('loading');
  const phaseRef = useRef<Phase>('loading');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [loadMsg, setLoadMsg] = useState('Đang mở camera trước...');
  const [slow, setSlow] = useState(false);           // quá lâu → hiện các phương án dự phòng
  const [busyFile, setBusyFile] = useState(false);
  const [copied, setCopied] = useState(false);
  const env = detectInstallEnv();
  const inApp = env.inApp;

  const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const start = async () => {
    setError(''); setHint(''); setSlow(false); go('loading');
    stopCamera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('nomedia'), { name: 'NoMedia' });
      setLoadMsg('Đang mở camera trước...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false
      });
      if (!aliveRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      setLoadMsg('Đang tải bộ nhận diện khuôn mặt (lần đầu mất 5–30 giây, mạng yếu có thể lâu hơn)...');
      // Máy yếu / mạng chậm: sau 30 giây vẫn chưa xong thì hiện các cách dự phòng, vẫn chờ tiếp
      const slowTimer = window.setTimeout(() => { if (aliveRef.current && phaseRef.current === 'loading') setSlow(true); }, 30000);
      const api = await loadFaceApi().finally(() => window.clearTimeout(slowTimer));
      if (!aliveRef.current) return;
      go('center1');
      loop(api);
    } catch (e: any) {
      stopCamera();
      const n = e?.name;
      setError(
        n === 'NotAllowedError' || n === 'SecurityError'
          ? 'Chưa cho phép dùng camera. Vào cài đặt trình duyệt → cho phép Camera với trang này rồi bấm Thử lại.'
          : n === 'NoMedia' || n === 'NotFoundError'
            ? 'Trình duyệt này không mở được camera trước.'
            : n === 'NotReadableError'
              ? 'Camera đang bị ứng dụng khác dùng (ví dụ cuộc gọi video). Tắt ứng dụng đó rồi thử lại.'
              : 'Không tải hoặc không chạy được bộ nhận diện khuôn mặt (mạng chậm hoặc máy yếu). Thử lại, hoặc dùng cách khác bên dưới.'
      );
      go('error');
    }
  };

  const loop = async (api: Awaited<ReturnType<typeof loadFaceApi>>) => {
    let streak = 0, misses = 0, base = 0.5;
    let last: number | null = null;
    let shots: FaceResult[] = [];      // các lần chụp ở nhiều thời điểm/tư thế
    let maxTurn = 0;
    const t0 = Date.now();
    while (aliveRef.current && ['center1', 'turn', 'center2'].includes(phaseRef.current)) {
      const v = videoRef.current;
      if (!v || v.readyState < 2) { await new Promise(r => setTimeout(r, 150)); continue; }
      if (Date.now() - t0 > 25000) setSlow(true);
      let f = null;
      try {
        f = await detectFrame(api, v);
        if (!f) { misses++; if (misses % 2 === 0) f = await detectFrame(api, v, true); }   // máy quá sát → thử khung rộng
        if (f) misses = 0;
      } catch { /* bỏ qua khung lỗi */ }
      if (!aliveRef.current) return;
      if (f) meshRef.current = { ...meshRef.current, pts: f.pts, seen: Date.now(), vw: v.videoWidth, vh: v.videoHeight };
      const p = phaseRef.current;
      if (!f) { setHint('Đưa cả khuôn mặt vào khung, cầm máy xa hơn một chút, nơi đủ sáng'); streak = 0; }
      else if (f.size < 0.16) { setHint('Đưa máy lại gần mặt hơn'); streak = 0; }
      else {
        setHint('');
        // So với tư thế ban đầu của chính người dùng (mỗi người cầm máy một kiểu)
        if (p === 'center1') {
          const steady = last != null && Math.abs(f.yaw - last) < 0.05 && Math.abs(f.yaw - 0.5) < 0.22;
          streak = steady ? streak + 1 : 0;
          if (Math.abs(f.yaw - 0.5) >= 0.22) setHint('Nhìn thẳng vào màn hình');
          if (streak >= 3) {
            base = f.yaw; shots = []; maxTurn = 0;
            const a = await captureFace(api, v, true, 'camera').catch(() => null);   // điểm 1: nhìn thẳng (trước khi quay)
            if (!aliveRef.current) return;
            if (!a) { streak = 0; continue; }
            shots.push(a); haptic(20); go('turn'); streak = 0;
          }
        } else if (p === 'turn') {
          maxTurn = Math.max(maxTurn, Math.abs(f.yaw - base));
          streak = Math.abs(f.yaw - base) > 0.15 ? streak + 1 : 0;      // phải giữ nghiêng ≥ 2 khung liên tiếp
          if (streak >= 2) { haptic(20); go('center2'); streak = 0; }
        } else if (p === 'center2') {
          streak = Math.abs(f.yaw - base) < 0.08 ? streak + 1 : 0;
          if (streak >= 2) {
            go('capturing');
            // điểm 2 và 3: nhìn thẳng lại, cách nhau ~0,3 giây
            const b = await captureFace(api, v, true, 'camera').catch(() => null);
            await new Promise(r => setTimeout(r, 300));
            const c = b ? await captureFace(api, v, true, 'camera').catch(() => null) : null;
            if (!aliveRef.current) return;
            if (b && c) {
              const merged = mergeFaces([...shots, b, c]);
              if (merged) { finish(merged); return; }
              // 3 lần chụp không cùng 1 khuôn mặt → làm lại từ đầu
              shots = []; maxTurn = 0; last = null;
              setHint('Ảnh các lần chụp không thống nhất. Chỉ một người trong khung, giữ yên máy rồi làm lại');
              go('center1'); streak = 0; continue;
            }
            setHint('Chưa chụp rõ, giữ yên máy và nhìn thẳng');
            go('center2'); streak = 0;
          }
        }
        last = f.yaw;
      }
      await new Promise(r => setTimeout(r, 90));
    }
  };

  const finish = (r: FaceOutcome) => {
    haptic(50);
    go('done');
    stopCamera();
    window.setTimeout(() => onDone(r), 350);
  };

  /** Chụp ngay, không qua bước quay đầu (Ban tổ chức sẽ kiểm tra lại) */
  const captureNow = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      const api = await loadFaceApi();
      go('capturing');
      const r = await captureFace(api, v, false, 'camera');
      if (r) finish(r);
      else { setHint('Không thấy khuôn mặt trong khung. Nhìn thẳng, đủ sáng rồi bấm lại.'); go('center1'); loop(api); }
    } catch { setHint('Chưa chụp được, thử lại.'); }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusyFile(true); setError('');
    try {
      const api = await loadFaceApi();
      const r = await faceFromFile(api, file);
      if (r) finish(r);
      else setError('Không thấy khuôn mặt trong ảnh vừa chụp. Chụp lại: nhìn thẳng, đủ sáng, mặt chiếm phần lớn ảnh.');
    } catch {
      if (mode === 'flag') {
        setError('Máy không chạy được bộ nhận diện khuôn mặt. Bấm "Gửi không có ảnh" để Ban tổ chức kiểm tra.');
      } else {
        setError('Máy không chạy được bộ nhận diện khuôn mặt. Đến bàn Ban tổ chức để được điểm danh.');
      }
      go('error');
    } finally {
      setBusyFile(false);
    }
  };

  const sendNone = () => {
    const reason = error || (slow ? 'Không chụp được sau nhiều lần thử' : 'Người dùng chọn gửi không ảnh');
    stopCamera();
    onDone({ none: true, reason: reason.slice(0, 120) });
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.origin + '/'); setCopied(true); } catch { /* bỏ qua */ }
  };

  useEffect(() => {
    aliveRef.current = true;
    start();
    // Vẽ lưới ~1000 điểm bám khuôn mặt (chạy riêng, mượt hơn nhịp dò mặt)
    let raf = 0, cur: Pt[] | null = null;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const cv = canvasRef.current; if (!cv) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = cv.clientWidth, ch = cv.clientHeight;
      if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
      const g = cv.getContext('2d'); if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const st = meshRef.current, ph = phaseRef.current;
      const age = Date.now() - st.seen;
      if (!showMeshRef.current || !st.pts) { g.clearRect(0, 0, cw, ch); return; }
      cur = smooth(cur, st.pts, 0.35);
      const alpha = ph === 'done' ? 0.9 : Math.max(0, Math.min(1, 1.4 - age / 700));
      const color = ph === 'done' ? '#34d399' : ph === 'turn' ? '#fcd34d' : '#4ade80';
      drawMesh(g, cw, ch, st, cur, color, alpha, t);
    };
    raf = requestAnimationFrame(tick);
    return () => { aliveRef.current = false; cancelAnimationFrame(raf); stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepIdx = phase === 'center1' ? 0 : phase === 'turn' ? 1 : (phase === 'center2' || phase === 'capturing' || phase === 'done') ? 2 : -1;
  const showFallback = slow || phase === 'error';

  return (
    <div className="max-w-md mx-auto space-y-3" data-testid="face-capture">
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Bước 1: Chụp khuôn mặt</h2>
            <p className="text-xs text-stone-500 mt-0.5">Xác nhận đúng người điểm danh. Xong bước này mới quét mã QR.</p>
          </div>
          <button onClick={() => { stopCamera(); onCancel(); }} className="p-1.5 -m-1 text-stone-400 hover:text-stone-700" aria-label="Đóng"><X className="w-5 h-5" /></button>
        </div>

        {inApp && (
          <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[13px]">
            Đang mở trong ứng dụng {inApp === 'zalo' ? 'Zalo' : inApp === 'facebook' ? 'Facebook' : inApp === 'messenger' ? 'Messenger' : 'khác'} — camera có thể không chạy.
            Bấm <b>⋯</b> góc trên → <b>Mở bằng trình duyệt</b> (Safari/Chrome).
            <button onClick={copyLink} className="ml-1 inline-flex items-center gap-1 font-semibold underline"><Copy className="w-3.5 h-3.5" />{copied ? 'Đã chép link' : 'Chép link'}</button>
          </div>
        )}

        <div className="relative mt-3 rounded-xl overflow-hidden bg-black aspect-[3/4]">
          <video ref={videoRef} muted playsInline autoPlay className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />
          {/* Khung bầu dục hướng dẫn */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className={`w-[62%] aspect-[3/4] rounded-[50%] border-4 transition-colors ${phase === 'done' ? 'border-emerald-400' : phase === 'turn' ? 'border-amber-300' : 'border-white/80'}`}
              style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,.35)' }} />
          </div>
          {phase !== 'loading' && phase !== 'error' && (
            <button type="button" onClick={() => { showMeshRef.current = !showMeshRef.current; setShowMesh(showMeshRef.current); }}
              className="absolute top-2 right-2 text-[11px] text-white/90 bg-black/50 rounded-md px-2 py-1">
              Lưới {showMesh ? 'bật' : 'tắt'}
            </button>
          )}
          {phase === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white text-sm px-6 text-center">
              <Loader2 className="w-8 h-8 animate-spin" /><span>{loadMsg}</span>
            </div>
          )}
          {phase === 'done' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30"><CheckCircle2 className="w-16 h-16 text-emerald-400" /></div>
          )}
          {phase !== 'loading' && phase !== 'error' && phase !== 'done' && (
            <div className="absolute left-3 right-3 bottom-3 text-center">
              <div className="inline-block bg-black/65 text-white rounded-lg px-3 py-2 backdrop-blur-sm">
                <div className="text-base font-semibold" data-testid="face-step">{STEP_TEXT[phase]}</div>
                {hint && <div className="text-xs text-white/85 mt-0.5">{hint}</div>}
              </div>
            </div>
          )}
        </div>

        {stepIdx >= 0 && (
          <div className="flex gap-1.5 mt-3" aria-hidden="true">
            {[0, 1, 2].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full ${i < stepIdx || phase === 'done' ? 'bg-emerald-500' : i === stepIdx ? 'bg-stone-800' : 'bg-stone-200'}`} />)}
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="flex gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" /><span>{error}</span>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFile} />

      {phase === 'error' && (
        <Button onClick={start} size="lg" className="w-full" icon={<RotateCcw className="w-5 h-5" />}>Thử lại</Button>
      )}

      {showFallback && (
        <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-2">
          <p className="text-[13px] text-stone-600">{phase === 'error' ? 'Hoặc dùng cách khác:' : 'Chưa chụp được? Dùng cách khác:'}</p>
          {phase !== 'error' && phase !== 'loading' && (
            <Button onClick={captureNow} variant="secondary" size="lg" className="w-full" icon={<Camera className="w-5 h-5" />}>Chụp ngay (bỏ bước quay đầu)</Button>
          )}
          <Button onClick={() => fileRef.current?.click()} variant="secondary" size="lg" className="w-full" disabled={busyFile}
            icon={busyFile ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageUp className="w-5 h-5" />}>Chụp bằng ứng dụng camera của máy</Button>
          {mode === 'flag' && (
            <button onClick={sendNone} className="w-full h-10 text-[13px] font-medium text-stone-600 hover:text-stone-900 underline">Gửi không có ảnh (Ban tổ chức sẽ kiểm tra)</button>
          )}
          {mode === 'strict' && (
            <p className="text-xs text-stone-500">Không chụp được bằng mọi cách: đến bàn Ban tổ chức để được điểm danh.</p>
          )}
        </div>
      )}
    </div>
  );
};
