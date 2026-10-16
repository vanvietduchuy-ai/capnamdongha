import React, { useState, useEffect, useRef } from 'react';
import { MockDB } from '../services/mockDatabase';
import { parseOfficerQr } from '../lib/qrCode';
import { QrScanEngine, EngineInfo, listCameras } from '../lib/qrScanEngine';
import { ScanLine, Camera, SwitchCamera, AlertCircle, Loader2, ZoomIn, UserCheck, RotateCcw } from 'lucide-react';
import { User, CheckInFace } from '../types';
import { Button, ResultMark, haptic } from './UI';
import { FaceCapture, FaceOutcome } from './FaceCapture';
import { getDeviceId, getFingerprint } from '../lib/deviceFingerprint';
import { FACE_RESULT_TTL } from '../lib/faceCheck';

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
  const [isSystemReady, setIsSystemReady] = useState(false);
  // Dùng ref để hàm xử lý quét luôn đọc giá trị mới nhất và chặn xử lý trùng lặp
  const systemReadyRef = useRef(false);
  const processingRef = useRef(false);
  useEffect(() => { systemReadyRef.current = isSystemReady; }, [isSystemReady]);

  // Chụm hai ngón để phóng to
  const initialPinchDistance = useRef<number | null>(null);
  const initialZoomOnPinchStart = useRef<number>(1);

  // Chụp khuôn mặt trước khi quét mã (file SQL 11). 'off' = máy chủ tắt hoặc chưa cập nhật
  const [faceMode, setFaceMode] = useState<'flag' | 'strict' | 'off'>('off');
  const [face, setFace] = useState<FaceOutcome | null>(null);
  const faceRef = useRef<FaceOutcome | null>(null);
  useEffect(() => { faceRef.current = face; }, [face]);
  const [showFace, setShowFace] = useState(false);
  const [faceAgain, setFaceAgain] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const faceFresh = (f: FaceOutcome | null) => !!f && ('none' in f || Date.now() - f.at < FACE_RESULT_TTL);

  useEffect(() => {
    setDeviceId(getDeviceId());
    (async () => {
      try {
        const cfg = await MockDB.getCheckinConfig();
        setFaceMode(cfg.faceMode);
        // Tải sẵn bộ nhận diện ngay khi mở màn hình điểm danh (máy yếu/mạng chậm đỡ phải chờ)
        if (cfg.faceMode !== 'off') {
          const idle = (window as any).requestIdleCallback || ((f: () => void) => window.setTimeout(f, 300));
          idle(() => { import('../lib/faceCheck').then(m => m.loadFaceApi()).catch(() => { /* lỗi thì lúc chụp tải lại */ }); });
        }
      } catch { /* mặc định không chụp mặt */ }
      finally { setIsSystemReady(true); }
    })();
    return () => { engineRef.current?.stop(); engineRef.current = null; };
  }, []);

  /** Bấm "Bắt đầu": chụp mặt trước (nếu cần) rồi mới mở camera sau để quét mã */
  const begin = () => {
    setError(null); setFaceAgain(false);
    if (faceMode !== 'off' && !faceFresh(face)) { setFace(null); setShowFace(true); return; }
    startScanning();
  };

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

      if (parsed.sessionId.startsWith('exm_')) {
          setError("Đây là mã QR phòng thi. Vào mục \"Học tập & Thi\" → Thi, chọn kỳ thi rồi quét mã để vào làm bài.");
          return;
      }

      // Tìm đúng phiên theo mã đã quét (hỗ trợ nhiều hội nghị diễn ra cùng lúc)
      const session = await MockDB.getSessionById(parsed.sessionId);
      if (!session) {
          setError("Không tìm thấy hội nghị. Vui lòng kiểm tra kết nối mạng.");
          return;
      }

      const currentDeviceId = deviceId || getDeviceId();
      const currentFingerprint = getFingerprint();

      // Kết quả chụp mặt
      let facePayload: CheckInFace | null = null;
      const f = faceRef.current;
      if (faceMode !== 'off') {
          if (!faceFresh(f)) {
              setFace(null); setFaceAgain(true);
              setError('Ảnh chụp khuôn mặt đã quá 3 phút. Bấm "Chụp lại khuôn mặt" rồi quét mã.');
              return;
          }
          facePayload = f && 'none' in f
              ? { method: 'none', reason: f.reason }
              : f ? { descriptor: f.descriptor, photo: f.photo, live: f.live, method: f.method } : null;
      }

      const result = await MockDB.checkIn(currentUser.id, currentDeviceId, session.id, undefined, currentFingerprint, decodedText.trim(), facePayload);
      if (result.success) {
          haptic(60);
          setScanResult(`Điểm danh thành công: ${session.title}`);
          setNote(result.enrolled ? 'Ảnh khuôn mặt lần này được lưu làm ảnh mẫu của tài khoản, Ban tổ chức sẽ xác nhận.' : null);
          setFace(null);
          setTimeout(onSuccess, result.enrolled ? 5000 : 3000);
      } else {
          if (result.faceRejected) { setFace(null); setFaceAgain(true); }
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
      {showFace && (
        <FaceCapture mode={faceMode === 'strict' ? 'strict' : 'flag'}
          onCancel={() => setShowFace(false)}
          onDone={(r) => { setFace(r); faceRef.current = r; setShowFace(false); window.setTimeout(() => startScanning(), 60); }} />
      )}

      {!showFace && !isScanning && !scanResult && (
        <div className="bg-white rounded-xl border border-stone-200 p-5 md:p-6">
          <div className="icon-3d w-12 h-12 rounded-[14px] flex items-center justify-center mb-4" style={{ ['--c' as any]: '#0f766e' }}><ScanLine className="w-6 h-6" /></div>
          <h2 className="text-lg font-semibold text-stone-900">Quét mã điểm danh</h2>
          <ol className="mt-2 space-y-1.5 text-sm text-stone-600">
            <li className="flex gap-2"><span className="w-5 h-5 mt-px rounded-full bg-stone-100 text-stone-600 text-xs font-semibold flex items-center justify-center shrink-0">1</span><span>Bấm <b className="font-semibold text-stone-800">Bắt đầu quét</b> và cho phép dùng camera.</span></li>
            <li className="flex gap-2"><span className="w-5 h-5 mt-px rounded-full bg-stone-100 text-stone-600 text-xs font-semibold flex items-center justify-center shrink-0">2</span><span>Hướng camera vào mã QR trên màn hình hội nghị.</span></li>
            <li className="flex gap-2"><span className="w-5 h-5 mt-px rounded-full bg-stone-100 text-stone-600 text-xs font-semibold flex items-center justify-center shrink-0">3</span><span>Ngồi xa thì bấm <b className="font-semibold text-stone-800">2×</b> hoặc <b className="font-semibold text-stone-800">4×</b> để phóng to.</span></li>
          </ol>
          <div className="mt-5 space-y-2">
            {faceMode !== 'off' && (
              <div className={`flex items-center gap-2 text-[13px] px-3 py-2 rounded-lg ${faceFresh(face) ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-50 text-stone-600'}`}>
                <UserCheck className="w-4 h-4 shrink-0" />
                {faceFresh(face)
                  ? (face && 'none' in face ? 'Gửi không có ảnh khuôn mặt — Ban tổ chức sẽ kiểm tra.' : 'Đã chụp khuôn mặt. Quét mã QR để hoàn tất.')
                  : 'Trước khi quét mã, phần mềm sẽ chụp khuôn mặt bằng camera trước.'}
              </div>
            )}
            <Button onClick={begin} disabled={!isSystemReady} size="lg" className="w-full" icon={isSystemReady ? <Camera className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}>
              {!isSystemReady ? 'Đang chuẩn bị...' : faceMode !== 'off' && !faceFresh(face) ? 'Bắt đầu (chụp mặt → quét mã)' : 'Bắt đầu quét'}
            </Button>
            {faceAgain && faceMode !== 'off' && (
              <Button onClick={() => { setError(null); setFace(null); setFaceAgain(false); setShowFace(true); }} variant="secondary" size="lg" className="w-full" icon={<RotateCcw className="w-5 h-5" />}>Chụp lại khuôn mặt</Button>
            )}
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
            {note && <p className="text-xs text-stone-600 mt-2 px-2">{note}</p>}
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

    </div>
  );
};
