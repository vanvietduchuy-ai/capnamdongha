import React, { useState, useEffect, useRef } from 'react';
import { MockDB } from '../services/mockDatabase';
import { parseOfficerQr } from '../lib/qrCode';
import { QrScanEngine, EngineInfo, listCameras } from '../lib/qrScanEngine';
import { ScanLine, Camera, SwitchCamera, AlertCircle, Loader2, ZoomIn } from 'lucide-react';
import { User } from '../types';
import { Button, ResultMark, haptic } from './UI';

interface AttendanceScannerProps {
  currentUser: User;
  onSuccess: () => void;
}

const fmtZoom = (z: number) => (Math.round(z * 10) / 10).toString().replace('.', ',') + '×';

export const AttendanceScanner: React.FC<AttendanceScannerProps> = ({ currentUser, onSuccess }) => {
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Báo lỗi: rung 2 nhịp ngắn để cán bộ biết cần quét lại
  useEffect(() => { if (error) haptic([40, 60, 40]); }, [error]);
  const [isScanning, setIsScanning] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<QrScanEngine | null>(null);
  const [info, setInfo] = useState<EngineInfo | null>(null);
  const [zoom, setZoom] = useState(1);
  const [digital, setDigital] = useState(1);
  const [showHint, setShowHint] = useState(false);

  const [deviceId, setDeviceId] = useState<string>('');
  const [ipAddress, setIpAddress] = useState<string>('');
  const [isSystemReady, setIsSystemReady] = useState(false);
  // Dùng ref để hàm xử lý quét luôn đọc giá trị mới nhất và chặn xử lý trùng lặp
  const systemReadyRef = useRef(false);
  const processingRef = useRef(false);
  useEffect(() => { systemReadyRef.current = isSystemReady; }, [isSystemReady]);

  // Chụm hai ngón để phóng to
  const initialPinchDistance = useRef<number | null>(null);
  const initialZoomOnPinchStart = useRef<number>(1);

  // Enhanced Fingerprinting to prevent Incognito/Multi-browser fraud
  const generateFingerprint = () => {
    try {
        // 1. Orientation-independent screen resolution
        // This ensures portrait/landscape modes on mobile produce the same fingerprint
        const width = Math.max(screen.width, screen.height);
        const height = Math.min(screen.width, screen.height);
        
        // 2. Timezone
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        
        // 3. Language (base language)
        const lang = navigator.language ? navigator.language.split('-')[0] : 'unknown';

        const components = [
            `${width}x${height}`, 
            screen.colorDepth,
            timezone,
            lang,
            navigator.platform, // OS Platform
            (navigator as any).hardwareConcurrency || 'unknown',
            (navigator as any).deviceMemory || 'unknown',
            (navigator as any).maxTouchPoints || 0
        ];

        // Simple hash function
        const str = components.join('||');
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        
        return 'fp_' + Math.abs(hash).toString(16);
    } catch (e) {
        // Fallback if fingerprinting fails
        console.error("Fingerprint error", e);
        return `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  };

  // Unique Device ID logic
  const getPersistentDeviceId = () => {
    try {
        let id = localStorage.getItem('attendance_device_id');
        if (!id) {
            // Generate a more unique ID: random + timestamp + fingerprint hint
            const random = Math.random().toString(36).substring(2, 11);
            const timestamp = Date.now().toString(36);
            id = `device_${timestamp}_${random}`;
            localStorage.setItem('attendance_device_id', id);
        }
        return id;
    } catch (e) {
        return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    }
  };

  useEffect(() => {
    setDeviceId(getPersistentDeviceId());
    // Lấy IP để ghi nhật ký (không chặn giao diện)
    (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
        const data = await res.json();
        setIpAddress(data.ip);
        clearTimeout(timeoutId);
      } catch (err) {
        console.warn('IP fetch failed', err);
      } finally {
        setIsSystemReady(true);
      }
    })();
    return () => { engineRef.current?.stop(); engineRef.current = null; };
  }, []);

  // Gợi ý phóng to nếu quét 5 giây chưa thấy mã
  useEffect(() => {
    if (!isScanning || isCameraLoading) { setShowHint(false); return; }
    const t = window.setTimeout(() => setShowHint(true), 5000);
    return () => window.clearTimeout(t);
  }, [isScanning, isCameraLoading, zoom]);

  // Luôn gọi bản mới nhất của hàm xử lý (tránh đọc giá trị cũ của deviceId, ipAddress)
  const onScanRef = useRef<(t: string) => void>(() => {});

  const startScanning = async (cameraId?: string | null) => {
    setIsCameraLoading(true);
    setIsScanning(true);
    setError(null);
    setZoom(1); setDigital(1); setInfo(null);
    await new Promise(r => setTimeout(r, 50)); // chờ khung video hiện ra
    const video = videoRef.current;
    if (!video) { setIsScanning(false); setIsCameraLoading(false); return; }
    try {
      await engineRef.current?.stop();
      const eng = new QrScanEngine(video, (text) => onScanRef.current(text));
      engineRef.current = eng;
      const inf = await eng.start(cameraId === undefined ? selectedCameraId : cameraId);
      setInfo(inf);
      setIsCameraLoading(false);
      // Sau khi đã cho quyền mới đọc được tên camera
      const cams = await listCameras();
      if (cams.length) setCameras(cams);
    } catch (err: any) {
      console.error('Error starting scanner:', err);
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      setError(denied
        ? 'Chưa được cấp quyền dùng camera. Vào cài đặt trình duyệt, cho phép camera với trang này rồi thử lại.'
        : 'Không thể khởi động camera. Đảm bảo không có ứng dụng khác đang dùng camera rồi thử lại.');
      await engineRef.current?.stop();
      setIsScanning(false);
      setIsCameraLoading(false);
    }
  };

  const stopScanning = async () => {
    await engineRef.current?.stop();
    setIsScanning(false);
    setZoom(1); setDigital(1);
  };

  const handleSwitchCamera = async () => {
    if (cameras.length <= 1) return;
    const i = cameras.findIndex(c => c.id === selectedCameraId);
    const next = cameras[(i + 1) % cameras.length];
    setSelectedCameraId(next.id);
    if (isScanning) startScanning(next.id);
  };

  const applyZoom = async (z: number) => {
    const eng = engineRef.current;
    if (!eng || !info) return;
    const v = Math.max(1, Math.min(z, info.maxZoom));
    setZoom(v);
    await eng.setZoom(v);
    setDigital(eng.digitalZoom);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      initialPinchDistance.current = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      initialZoomOnPinchStart.current = zoom;
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistance.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      applyZoom(initialZoomOnPinchStart.current * d / initialPinchDistance.current);
    }
  };
  const handleTouchEnd = () => { initialPinchDistance.current = null; };

  // Mã cán bộ: "<mã hội nghị>|<khung 3 giây>|<chữ ký>" — chữ ký và độ mới do MÁY CHỦ kiểm tra
  // theo đồng hồ máy chủ, nên giờ trên điện thoại sai cũng không ảnh hưởng.
  const parseQr = (text: string): { sessionId: string } | 'GUEST' | null => {
    const raw = (text || '').trim();
    if (/^https?:\/\//i.test(raw) && /guest_session=/.test(raw)) return 'GUEST';
    const p = parseOfficerQr(raw);
    return p ? { sessionId: p.sessionId } : null;
  };

  const onScanSuccess = async (decodedText: string) => {
    // Máy quét bắn nhiều lần/giây: chỉ xử lý lần đầu
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      await stopScanning();

      if (!systemReadyRef.current) {
          setError("Đang xác thực thiết bị. Vui lòng đợi vài giây rồi quét lại.");
          return;
      }

      const parsed = parseQr(decodedText);
      if (parsed === 'GUEST') {
          setError("Đây là mã dành cho khách mời. Cán bộ vui lòng quét \"Mã cho cán bộ\" trên màn hình.");
          return;
      }
      if (!parsed) {
          setError("Mã QR không phải mã điểm danh của hệ thống, hoặc là mã cũ. Vui lòng quét mã đang hiển thị trên màn hình.");
          return;
      }

      // Tìm đúng phiên theo mã đã quét (hỗ trợ nhiều hội nghị diễn ra cùng lúc)
      const session = await MockDB.getSessionById(parsed.sessionId);
      if (!session) {
          setError("Không tìm thấy hội nghị. Vui lòng kiểm tra kết nối mạng.");
          return;
      }

      const currentDeviceId = deviceId || localStorage.getItem('attendance_device_id') || `unknown_${Date.now()}`;
      const currentFingerprint = generateFingerprint();

      const result = await MockDB.checkIn(currentUser.id, currentDeviceId, session.id, ipAddress, currentFingerprint, decodedText.trim());
      if (result.success) {
          haptic(60);
          setScanResult(`Điểm danh thành công: ${session.title}`);
          setTimeout(onSuccess, 3000);
      } else {
          setError(result.message);
      }
    } catch (err) {
      setError("Lỗi kết nối. Vui lòng thử lại.");
    } finally {
      processingRef.current = false;
    }
  };

  onScanRef.current = onScanSuccess;

  const presets = info ? [1, 2, 4].filter(p => p <= info.maxZoom + 0.01) : [1];
  if (info && info.maxZoom >= 6) presets.push(Math.min(8, Math.floor(info.maxZoom)));

  return (
    <div className="max-w-md mx-auto space-y-3" data-testid="scanner">
      {!isScanning && !scanResult && (
        <div className="bg-white rounded-xl border border-stone-200 p-5 md:p-6">
          <div className="icon-3d w-12 h-12 rounded-[14px] flex items-center justify-center mb-4" style={{ ['--c' as any]: '#0f766e' }}><ScanLine className="w-6 h-6" /></div>
          <h2 className="text-lg font-semibold text-stone-900">Quét mã điểm danh</h2>
          <ol className="mt-2 space-y-1.5 text-sm text-stone-600">
            <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-stone-100 text-stone-600 text-xs font-semibold flex items-center justify-center shrink-0">1</span>Bấm <b className="font-semibold text-stone-800">Bắt đầu quét</b> và cho phép dùng camera.</li>
            <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-stone-100 text-stone-600 text-xs font-semibold flex items-center justify-center shrink-0">2</span>Hướng camera vào mã QR đang chiếu trên màn hình hội nghị.</li>
            <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-stone-100 text-stone-600 text-xs font-semibold flex items-center justify-center shrink-0">3</span>Ngồi xa thì bấm <b className="font-semibold text-stone-800">2×</b> hoặc <b className="font-semibold text-stone-800">4×</b> (hoặc chụm hai ngón) để phóng to. Mã đổi mỗi 3 giây — quét trực tiếp, không dùng ảnh chụp.</li>
          </ol>
          <div className="mt-5 space-y-2">
            <Button onClick={() => { setError(null); startScanning(); }} disabled={!isSystemReady} size="lg" className="w-full" icon={isSystemReady ? <Camera className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}>
              {isSystemReady ? 'Bắt đầu quét' : 'Đang chuẩn bị...'}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div key={error} role="alert" className="anim-shake flex gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {scanResult && (
        <div className="bg-white rounded-xl border border-emerald-200 p-6 text-center anim-rise" data-testid="scan-success">
          <div className="mb-4"><ResultMark ok size={76} /></div>
          <div className="result-text">
            <p className="text-lg font-semibold text-stone-900">Đã điểm danh</p>
            <p className="text-sm text-stone-700 mt-1">{scanResult}</p>
            <p className="text-xs text-stone-500 mt-2">Đang quay về trang chủ...</p>
          </div>
        </div>
      )}

      <div className={`w-full relative ${!isScanning ? 'hidden' : ''}`}>
        <div
          className="relative overflow-hidden rounded-xl bg-black touch-none min-h-[320px] aspect-[3/4] flex items-center justify-center"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => { handleTouchEnd(); engineRef.current?.focusOnce(); }}
          onTouchCancel={handleTouchEnd}
          onClick={() => engineRef.current?.focusOnce()}
          data-testid="scan-view"
        >
          {/* Phần phóng số được bộ giải mã dùng thật (cắt vùng giữa), ảnh xem phóng theo cho khớp */}
          <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: `scale(${digital})`, transformOrigin: 'center', transition: 'transform .15s ease-out' }} />

          {isCameraLoading && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 text-white gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-white/80" />
              <span className="text-sm font-medium">Đang khởi động camera...</span>
            </div>
          )}

          {isScanning && !isCameraLoading && (
            <>
              <div className="scan-line" aria-hidden="true" />
              {cameras.length > 1 && (
                <button onClick={(e) => { e.stopPropagation(); handleSwitchCamera(); }}
                  className="absolute top-3 right-3 z-50 p-2 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/20 hover:bg-black/60" title="Đổi camera" aria-label="Đổi camera">
                  <SwitchCamera className="w-5 h-5" />
                </button>
              )}
              <div className="absolute top-3 left-3 z-30 pointer-events-none">
                <span className="bg-black/50 text-white text-[11px] px-2.5 py-1 rounded-md backdrop-blur-sm tabular" data-testid="zoom-level">{fmtZoom(zoom)}</span>
              </div>
              {showHint && (
                <div className="absolute left-3 right-3 top-12 z-30 pointer-events-none text-center">
                  <span className="inline-block bg-black/60 text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm">
                    {zoom < 2 && (info?.maxZoom || 1) >= 2 ? 'Chưa thấy mã? Ngồi xa thì bấm 2× hoặc 4× để phóng to.' : 'Giữ máy chắc tay, để mã QR nằm giữa khung.'}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Thanh phóng to: nút nhanh + thanh kéo */}
          {isScanning && !isCameraLoading && info && (
            <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-md px-3 py-2.5 rounded-lg shadow-lg z-30" onClick={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
              <div className="flex items-center gap-1.5 mb-2">
                <ZoomIn className="w-4 h-4 text-stone-500 shrink-0" />
                {presets.map(p => (
                  <button key={p} type="button" onClick={() => applyZoom(p)} data-testid={`zoom-${p}`}
                    className={`h-7 min-w-[40px] px-2 rounded-md text-xs font-semibold tabular ${Math.abs(zoom - p) < 0.05 ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`}>{p}×</button>
                ))}
                <span className="ml-auto text-[10px] text-stone-500 text-right leading-tight">
                  {info.hwZoom ? 'Zoom camera' : 'Phóng số'}<br />{info.width}×{info.height}
                </span>
              </div>
              <input type="range" min={1} max={info.maxZoom} step={0.1} value={zoom} aria-label="Mức phóng to"
                onChange={e => applyZoom(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-brand-700" />
            </div>
          )}
        </div>

        <Button onClick={stopScanning} variant="secondary" size="lg" className="w-full mt-3">Hủy bỏ</Button>
      </div>

      <p className="text-xs text-stone-400 text-center pt-2">
        Mã thiết bị: {deviceId || 'Đang tạo...'}
      </p>
    </div>
  );
};
