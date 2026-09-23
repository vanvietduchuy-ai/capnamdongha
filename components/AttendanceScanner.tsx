import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { MockDB } from '../services/mockDatabase';
import { User } from '../types';
import { Button } from './UI';

interface AttendanceScannerProps {
  currentUser: User;
  onSuccess: () => void;
}

export const AttendanceScanner: React.FC<AttendanceScannerProps> = ({ currentUser, onSuccess }) => {
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameras, setCameras] = useState<Array<{id: string, label: string}>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  
  // Zoom State
  const [zoom, setZoom] = useState(1);
  const [zoomCapability, setZoomCapability] = useState<{min: number, max: number, step: number} | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [ipAddress, setIpAddress] = useState<string>('');
  const [isSystemReady, setIsSystemReady] = useState(false);
  // Dùng ref để hàm xử lý quét luôn đọc giá trị mới nhất và chặn xử lý trùng lặp
  const systemReadyRef = useRef(false);
  const processingRef = useRef(false);
  useEffect(() => { systemReadyRef.current = isSystemReady; }, [isSystemReady]);
  
  // Pinch to zoom refs
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
      const initSystem = async () => {
          // Get or generate persistent unique device ID
          const id = getPersistentDeviceId();
          setDeviceId(id);
          
          // Fetch IP Address for logging (but we'll be less strict in DB)
          // We don't want this to block the UI too much
          const fetchIp = async () => {
              try {
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 3000);
                  
                  const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
                  const data = await res.json();
                  setIpAddress(data.ip);
                  clearTimeout(timeoutId);
              } catch (err) {
                  console.warn("IP fetch failed", err);
              } finally {
                  setIsSystemReady(true);
              }
          };

          fetchIp();

          // Pre-fetch cameras
          try {
              const devices = await Html5Qrcode.getCameras();
              if (devices && devices.length > 0) {
                  setCameras(devices.map(d => ({ id: d.id, label: d.label })));
                  
                  // Aggressive search for rear camera
                  // 1. Look for explicit "back", "rear", "environment"
                  // 2. If not found, look for anything NOT "front", "user", "selfie"
                  // 3. Fallback to the first device but we'll use facingMode: environment if possible
                  
                  const backCamera = devices.find(d => {
                      const label = d.label.toLowerCase();
                      return label.includes('back') || label.includes('rear') || label.includes('environment') || label.includes('ngoài') || label.includes('sau');
                  });

                  if (backCamera) {
                      setSelectedCameraId(backCamera.id);
                  } else {
                      // Look for a camera that is likely NOT the front one
                      const likelyNotFront = devices.find(d => {
                          const label = d.label.toLowerCase();
                          return !label.includes('front') && !label.includes('user') && !label.includes('selfie') && !label.includes('trước');
                      });
                      
                      if (likelyNotFront) {
                          setSelectedCameraId(likelyNotFront.id);
                      } else {
                          // If we really can't tell, don't set a specific ID yet
                          // startScanning will fallback to facingMode: environment
                          setSelectedCameraId(null);
                      }
                  }
              }
          } catch (e) {
              console.error("Error fetching cameras", e);
          }
      };

      initSystem();
  }, []);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (scannerRef.current) {
        try {
            if (scannerRef.current.isScanning) {
                scannerRef.current.stop().then(() => {
                    scannerRef.current?.clear();
                }).catch(console.error);
            } else {
                scannerRef.current.clear();
            }
        } catch (e) {
            console.error("Cleanup error", e);
        }
      }
    };
  }, []);

  const startScanning = async (preferredCameraId?: string) => {
    setIsCameraLoading(true);
    setIsScanning(true);
    setError(null);
    setZoomCapability(null);
    setZoom(1);
    
    // Wait a brief moment for the DOM to render the #reader element
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const readerElement = document.getElementById('reader');
    if (readerElement) {
        readerElement.style.transform = `scale(1)`;
    }
    
    try {
        // Ensure previous instance is cleared
        if (scannerRef.current) {
            try {
                if (scannerRef.current.isScanning) {
                    await scannerRef.current.stop();
                }
                scannerRef.current.clear();
            } catch (e) {}
        }

        const scanner = new Html5Qrcode("reader");
        scannerRef.current = scanner;

        const cameraId = preferredCameraId || selectedCameraId;
        const config = {
            fps: 10, // Slightly lower FPS for better stability on older devices
            // Removed qrbox to let it scan the full video area, maximizing compatibility
        };

        const startWithFallback = async () => {
            try {
                if (cameraId) {
                    await scanner.start(
                        cameraId,
                        config,
                        (decodedText) => onScanSuccess(decodedText),
                        () => {}
                    );
                    return;
                }
            } catch (err) {
                console.warn("Failed to start with specific camera ID, falling back to environment...", err);
            }

            try {
                // Fallback 1: Environment camera
                await scanner.start(
                    { facingMode: "environment" },
                    config,
                    (decodedText) => onScanSuccess(decodedText),
                    () => {}
                );
                return;
            } catch (err) {
                console.warn("Failed to start environment camera, falling back to any camera...", err);
            }
            
            // Fallback 2: Any available camera
            await scanner.start(
                { facingMode: "user" },
                config,
                (decodedText) => onScanSuccess(decodedText),
                () => {}
            );
        };

        await startWithFallback();

        setIsCameraLoading(false);

        // Attempt to get Capabilities (Zoom & Focus) and ensure video attributes
        setTimeout(() => {
            const videoElement = document.querySelector('#reader video') as HTMLVideoElement;
            if (videoElement) {
                // Ensure playsinline is set for iOS
                videoElement.setAttribute('playsinline', 'true');
                videoElement.setAttribute('webkit-playsinline', 'true');
                
                if (videoElement.srcObject) {
                    const stream = videoElement.srcObject as MediaStream;
                    const track = stream.getVideoTracks()[0];
                    videoTrackRef.current = track;
                    
                    try {
                        const capabilities = track.getCapabilities() as any;
                        
                        // We only read capabilities for zoom, avoid applying focus constraints 
                        // as it can cause the camera to freeze or go black on some devices.
                        if (capabilities.zoom) {
                            setZoomCapability({
                                min: capabilities.zoom.min,
                                max: capabilities.zoom.max,
                                step: capabilities.zoom.step
                            });
                            const settings = track.getSettings() as any;
                            if (settings.zoom) {
                                setZoom(settings.zoom);
                            }
                        }
                    } catch (e) {
                        console.warn("Could not get camera capabilities", e);
                    }
                }
            }
        }, 800);

    } catch (err) {
        console.error("Error starting scanner:", err);
        setError("Không thể khởi động camera. Vui lòng cấp quyền và thử lại. Đảm bảo không có ứng dụng khác đang dùng camera.");
        setIsScanning(false);
        setIsCameraLoading(false);
    }
  };

  const handleSwitchCamera = async () => {
      if (!cameras || cameras.length <= 1) return;
      
      const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
      const nextIndex = (currentIndex + 1) % cameras.length;
      const nextCamera = cameras[nextIndex];
      
      setSelectedCameraId(nextCamera.id);
      
      if (isScanning) {
          await stopScanning();
          startScanning(nextCamera.id);
      }
  };

  const stopScanning = async () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
          try {
              await scannerRef.current.stop();
              scannerRef.current.clear();
          } catch (e) {
              console.error("Stop scanning error", e);
          }
      }
      setIsScanning(false);
      setZoomCapability(null);
      setZoom(1);
      const readerElement = document.getElementById('reader');
      if (readerElement) {
          readerElement.style.transform = `scale(1)`;
      }
      videoTrackRef.current = null;
  };

  const applyZoom = (newZoom: number) => {
      setZoom(newZoom);
      
      let hardwareZoom = 1;
      let digitalZoom = newZoom;

      if (zoomCapability) {
          hardwareZoom = Math.min(newZoom, zoomCapability.max);
          digitalZoom = newZoom / hardwareZoom;
          
          if (videoTrackRef.current) {
              videoTrackRef.current.applyConstraints({
                  advanced: [{ zoom: hardwareZoom }]
              } as any).catch(err => console.error("Hardware zoom failed", err));
          }
      }

      // Apply digital zoom via CSS to the reader element
      const readerElement = document.getElementById('reader');
      if (readerElement) {
          readerElement.style.transform = `scale(${digitalZoom})`;
          readerElement.style.transformOrigin = 'center';
      }
  };

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newZoom = parseFloat(e.target.value);
      applyZoom(newZoom);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      initialPinchDistance.current = dist;
      initialZoomOnPinchStart.current = zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistance.current !== null) {
      e.preventDefault(); // Prevent page scroll
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      
      const scale = dist / initialPinchDistance.current;
      let newZoom = initialZoomOnPinchStart.current * scale;
      
      // Constrain zoom
      const minZoom = zoomCapability ? zoomCapability.min : 1;
      const maxZoom = zoomCapability ? zoomCapability.max * 3 : 5;
      newZoom = Math.max(minZoom, Math.min(newZoom, maxZoom));
      
      applyZoom(newZoom);
    }
  };

  const handleTouchEnd = () => {
    initialPinchDistance.current = null;
  };

  const handleTapToFocus = async (e: React.MouseEvent | React.TouchEvent) => {
      // Prevent triggering if it's a pinch-to-zoom action
      if (e.type === 'touchend' && (e as React.TouchEvent).touches.length > 0) return;
      
      if (videoTrackRef.current) {
          try {
              const capabilities = videoTrackRef.current.getCapabilities() as any;
              
              // If single-shot focus is supported, trigger it
              if (capabilities.focusMode && capabilities.focusMode.includes('single-shot')) {
                  await videoTrackRef.current.applyConstraints({
                      advanced: [{ focusMode: 'single-shot' }]
                  } as any);
                  
                  // Revert to continuous focus after 2 seconds
                  setTimeout(() => {
                      if (videoTrackRef.current && capabilities.focusMode.includes('continuous')) {
                          videoTrackRef.current.applyConstraints({
                              advanced: [{ focusMode: 'continuous' }]
                          } as any).catch(err => console.error("Revert to continuous focus failed", err));
                      }
                  }, 2000);
              }
          } catch (err) {
              console.error("Manual focus failed", err);
          }
      }
  };

  // Tách mã phiên + thời điểm từ nội dung QR.
  // Hỗ trợ 2 dạng: "sessionId|timestamp" (QR cán bộ) và liên kết khách mời "...?guest_session=...&t=..."
  const parseQr = (text: string): { sessionId: string; ts: number } | null => {
    const raw = (text || '').trim();
    if (/^https?:\/\//i.test(raw)) {
      try {
        const u = new URL(raw);
        const sid = u.searchParams.get('guest_session') || '';
        const ts = Number(u.searchParams.get('t'));
        return sid && Number.isFinite(ts) ? { sessionId: sid, ts } : null;
      } catch { return null; }
    }
    const parts = raw.split('|');
    if (parts.length !== 2) return null;
    const ts = Number(parts[1]);
    if (!parts[0] || !Number.isFinite(ts)) return null;
    return { sessionId: parts[0], ts };
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
      if (!parsed) {
          setError("Mã QR không phải mã điểm danh của hệ thống.");
          return;
      }

      // Mã QR đổi mỗi 5 giây: chỉ chấp nhận mã trong vòng 60 giây (cho phép lệch giờ nhẹ giữa 2 máy)
      if (Math.abs(Date.now() - parsed.ts) > 60000) {
          setError("Mã QR đã hết hạn. Vui lòng quét mã mới nhất trên màn hình. Nếu vẫn lỗi, kiểm tra giờ của điện thoại.");
          return;
      }

      // Tìm đúng phiên theo mã đã quét (hỗ trợ nhiều hội nghị diễn ra cùng lúc)
      const session = await MockDB.getSessionById(parsed.sessionId);
      if (!session) {
          setError("Không tìm thấy phiên điểm danh. Vui lòng kiểm tra kết nối mạng.");
          return;
      }
      if (session.isActive === false || session.expiresAt <= Date.now()) {
          setError("Phiên điểm danh đã kết thúc.");
          return;
      }

      const currentDeviceId = deviceId || localStorage.getItem('attendance_device_id') || `unknown_${Date.now()}`;
      const currentFingerprint = generateFingerprint();

      const result = await MockDB.checkIn(currentUser.id, currentDeviceId, session.id, ipAddress, currentFingerprint);
      if (result.success) {
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

  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-6 max-w-md mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-800">Quét Mã Điểm Danh Hội Nghị</h2>
        <p className="text-sm text-gray-500">Vui lòng cấp quyền camera để quét mã QR từ màn hình quản lý.</p>
      </div>

      {!isSystemReady && (
          <div className="w-full bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-xl text-sm flex items-center justify-center gap-2 animate-pulse">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              Đang khởi tạo hệ thống chống gian lận...
          </div>
      )}

      {error && (
        <div className="w-full p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm text-center">
            {error}
        </div>
      )}

      {scanResult && (
        <div className="w-full p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-lg font-bold text-center">
            {scanResult}
        </div>
      )}

      {!isScanning && !scanResult && (
        <div className="w-full space-y-3">
            <Button onClick={() => { setError(null); startScanning(); }} disabled={!isSystemReady} size="lg" className="w-full py-4 text-lg shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-60">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Bắt đầu quét QR
            </Button>
            
            {cameras.length > 1 && (
                <button 
                    onClick={handleSwitchCamera}
                    className="w-full py-2 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-lg border border-indigo-100 flex items-center justify-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Đổi Camera ({cameras.find(c => c.id === selectedCameraId)?.label || 'Mặc định'})
                </button>
            )}
        </div>
      )}

      <div className={`w-full relative ${!isScanning ? 'hidden' : ''}`}>
        <div 
          className="relative overflow-hidden rounded-2xl border-2 border-indigo-100 bg-black shadow-inner touch-none cursor-crosshair min-h-[300px] flex items-center justify-center"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={(e) => {
              handleTouchEnd();
              handleTapToFocus(e);
          }}
          onTouchCancel={handleTouchEnd}
          onClick={handleTapToFocus}
        >
            {isCameraLoading && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 text-white gap-3">
                    <svg className="w-10 h-10 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm font-medium">Đang khởi động camera...</span>
                </div>
            )}
            
            <div id="reader" className="w-full"></div>
            
            {/* Camera Controls Overlay */}
            {isScanning && !isCameraLoading && (
                <>
                    {/* Switch Camera Button (Inside) */}
                    {cameras.length > 1 && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleSwitchCamera(); }}
                            className="absolute top-4 right-4 z-50 p-2 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/20 hover:bg-black/60 transition-colors"
                            title="Đổi camera"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    )}

                    {/* Focus Hint */}
                    <div className="absolute top-4 left-0 right-0 text-center pointer-events-none z-30 animate-pulse">
                        <span className="bg-black/50 text-white text-[10px] px-3 py-1 rounded-full backdrop-blur-sm">
                            Chạm để lấy nét • Vuốt để phóng to
                        </span>
                    </div>
                </>
            )}
            
            {/* Zoom Overlay - Positioned inside the camera view to ensure it's never "lost" */}
            {isScanning && (
                <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-white/50 z-30 animate-fade-in-up">
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                            </svg>
                            <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Phóng to/Thu nhỏ</label>
                        </div>
                        <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">{zoom.toFixed(1)}x</span>
                    </div>
                    <input 
                        type="range" 
                        min={zoomCapability ? zoomCapability.min : 1} 
                        max={zoomCapability ? zoomCapability.max * 3 : 5} 
                        step={zoomCapability ? zoomCapability.step : 0.1} 
                        value={zoom} 
                        onChange={handleZoomChange}
                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                </div>
            )}
        </div>

        <Button 
            onClick={stopScanning} 
            variant="secondary" 
            className="w-full mt-6 py-3 rounded-xl border-stone-200 text-stone-600 font-bold"
        >
            Hủy bỏ
        </Button>
      </div>
      
      <p className="text-xs text-gray-400 text-center mt-8">
        ID Thiết bị: {deviceId || 'Đang tạo...'}
      </p>
    </div>
  );
};
