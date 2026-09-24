/**
 * BỘ QUÉT MÃ QR TỪ XA (thay cho html5-qrcode ở màn hình cán bộ quét mã)
 *
 * Vì sao phải thay: html5-qrcode 2.3.8
 *  - không xin độ phân giải camera → trình duyệt trả 640×480;
 *  - chụp khung hình vào canvas bằng KÍCH THƯỚC HIỂN THỊ (~360px trên điện thoại) rồi mới giải mã;
 *  - "phóng to số" chỉ phóng ảnh trên màn hình, không phóng ảnh đem đi giải mã.
 *  → mã ở xa chỉ còn vài chục điểm ảnh, không đọc được.
 *
 * Bộ quét này:
 *  1. Xin camera 1920×1080 (máy mạnh) hoặc 1280×720 (máy yếu).
 *  2. Mỗi lượt quét luân phiên toàn khung và các vùng giữa khung ở ĐỘ PHÂN GIẢI GỐC
 *     (tự "phóng to" để bắt mã nhỏ ở xa, người dùng không cần làm gì).
 *  3. Phóng to: dùng zoom quang học/phần cứng nếu máy hỗ trợ, phần còn lại cắt vùng giữa ở độ phân giải gốc
 *     (phóng to thật cho bộ giải mã, không chỉ phóng ảnh xem).
 *  4. Giải mã: Android Chrome dùng bộ đọc có sẵn của máy (BarcodeDetector, nhanh);
 *     iPhone và máy không có thì dùng ZXing.
 *  5. Tự điều chỉnh: đo thời gian giải mã, máy chậm thì giảm kích thước ảnh và nhịp quét để không giật, không nóng máy.
 */
// ZXing đi kèm html5-qrcode (không thêm thư viện mới)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as ZXingNs from 'html5-qrcode/third_party/zxing-js.umd';

const ZX: any = (ZXingNs as any).default || ZXingNs;

export type Tier = 'strong' | 'weak';

export interface EngineInfo {
  tier: Tier;
  width: number;               // độ phân giải camera thực nhận được
  height: number;
  decoder: 'native' | 'zxing';
  hwZoom: { min: number; max: number; step: number } | null;
  maxZoom: number;             // tổng mức phóng tối đa cho phép (phần cứng × số)
}

export interface EngineStats { frames: number; lastMs: number; avgMs: number; side: number; }

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Phân loại máy: ít nhân CPU hoặc ít RAM → máy yếu */
export const detectTier = (): Tier => {
  if (isIOS()) return 'strong';
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as any).deviceMemory || 4;
  return cores <= 4 || mem <= 3 ? 'weak' : 'strong';
};

type Detect = (src: HTMLCanvasElement) => Promise<string | null>;

const makeNativeDetector = async (): Promise<Detect | null> => {
  try {
    const BD = (window as any).BarcodeDetector;
    if (!BD) return null;
    const fmts: string[] = await BD.getSupportedFormats?.() ?? [];
    if (!fmts.includes('qr_code')) return null;
    const det = new BD({ formats: ['qr_code'] });
    return async (c) => {
      const r = await det.detect(c);
      if (!r || !r.length) return null;
      r.sort((a: any, b: any) => b.boundingBox.width * b.boundingBox.height - a.boundingBox.width * a.boundingBox.height);
      return r[0].rawValue || null;
    };
  } catch { return null; }
};

const makeZxingDetector = (): Detect => {
  const hints = new Map();
  hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.QR_CODE]);
  hints.set(ZX.DecodeHintType.TRY_HARDER, true);
  const reader = new ZX.QRCodeReader();
  return async (c) => {
    try {
      const bmp = new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.HTMLCanvasElementLuminanceSource(c)));
      const r = reader.decode(bmp, hints);
      return r?.text ?? r?.getText?.() ?? null;
    } catch { return null; } finally { try { reader.reset?.(); } catch { /* bỏ qua */ } }
  };
};

export class QrScanEngine {
  private video: HTMLVideoElement;
  private onResult: (text: string) => void;
  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private detect: Detect | null = null;
  private timer: number | undefined;
  private running = false;
  private busy = false;
  private cycle = 0;
  private digital = 1;
  private hwZoomValue = 1;
  private side: number;         // cạnh dài tối đa của ảnh đem giải mã (tự điều chỉnh)
  private avgMs = 0;
  private frames = 0;
  private lastMs = 0;
  info: EngineInfo | null = null;
  tier: Tier;

  constructor(video: HTMLVideoElement, onResult: (text: string) => void, tier: Tier = detectTier()) {
    this.video = video;
    this.onResult = onResult;
    this.tier = tier;
    this.side = tier === 'weak' ? 720 : 1080;
  }

  async start(deviceId?: string | null): Promise<EngineInfo> {
    await this.stop();
    const [w, h] = this.tier === 'weak' ? [1280, 720] : [1920, 1080];
    const base: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } };
    const tries: MediaStreamConstraints[] = [
      { audio: false, video: { ...base, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: 30, max: 30 } } },
      { audio: false, video: { ...base, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { audio: false, video: base },
      { audio: false, video: true }
    ];
    let lastErr: any;
    for (const c of tries) {
      try { this.stream = await navigator.mediaDevices.getUserMedia(c); break; } catch (e) { lastErr = e; }
    }
    if (!this.stream) throw lastErr || new Error('Không mở được camera');
    this.track = this.stream.getVideoTracks()[0];
    const v = this.video;
    v.setAttribute('playsinline', 'true');
    v.setAttribute('webkit-playsinline', 'true');
    v.muted = true;
    v.srcObject = this.stream;
    await v.play().catch(() => { /* iOS có thể cần chạm; video vẫn chạy khi đã cho quyền */ });
    await new Promise<void>(res => {
      if (v.videoWidth) return res();
      const t = window.setTimeout(res, 3000);
      v.onloadedmetadata = () => { window.clearTimeout(t); res(); };
    });

    let hw: EngineInfo['hwZoom'] = null;
    try {
      const cap: any = this.track.getCapabilities?.();
      if (cap?.zoom && cap.zoom.max > (cap.zoom.min || 1)) hw = { min: cap.zoom.min || 1, max: cap.zoom.max, step: cap.zoom.step || 0.1 };
      const st: any = this.track.getSettings?.();
      if (st?.zoom) this.hwZoomValue = st.zoom;
    } catch { /* bỏ qua */ }

    const nativeDet = await makeNativeDetector();
    const native = !!nativeDet;
    this.detect = nativeDet || makeZxingDetector();
    const vw = v.videoWidth || w, vh = v.videoHeight || h;
    // Phóng số tối đa: giữ vùng giải mã ≥ ~260 điểm ảnh gốc
    const maxDigital = Math.max(1, Math.min(6, Math.min(vw, vh) / 260));
    this.info = {
      tier: this.tier, width: vw, height: vh, decoder: native ? 'native' : 'zxing', hwZoom: hw,
      maxZoom: Math.round(((hw ? hw.max / hw.min : 1) * maxDigital) * 10) / 10
    };
    if (native) this.side = Math.max(this.side, 1920); // bộ đọc của máy nhanh, dùng nguyên độ phân giải
    this.running = true;
    document.addEventListener('visibilitychange', this.onVis);
    this.loop();
    return this.info;
  }

  private onVis = () => {
    if (document.hidden) { window.clearTimeout(this.timer); }
    else if (this.running) { this.loop(); }
  };

  /** Tổng mức phóng hiện tại (1 = không phóng) */
  get zoom() { return (this.info?.hwZoom ? this.hwZoomValue / this.info.hwZoom.min : 1) * this.digital; }
  get digitalZoom() { return this.digital; }

  /** Đặt mức phóng: dùng phần cứng trước, thiếu thì cắt vùng giữa (phóng số thật cho bộ giải mã) */
  async setZoom(total: number) {
    if (!this.info) return;
    const z = Math.max(1, Math.min(total, this.info.maxZoom));
    const hw = this.info.hwZoom;
    if (hw && this.track) {
      const want = Math.min(hw.max, hw.min * z);
      const snapped = Math.round(want / hw.step) * hw.step;
      if (Math.abs(snapped - this.hwZoomValue) > 1e-3) {
        try { await this.track.applyConstraints({ advanced: [{ zoom: snapped } as any] }); this.hwZoomValue = snapped; } catch { /* máy từ chối: dùng phóng số */ }
      }
      this.digital = Math.max(1, z / (this.hwZoomValue / hw.min));
    } else {
      this.digital = z;
    }
  }

  /** Chạm để lấy nét (chỉ khi máy hỗ trợ) */
  async focusOnce() {
    try {
      const cap: any = this.track?.getCapabilities?.();
      if (cap?.focusMode?.includes('single-shot')) {
        await this.track!.applyConstraints({ advanced: [{ focusMode: 'single-shot' } as any] });
        if (cap.focusMode.includes('continuous')) window.setTimeout(() => this.track?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {}), 2000);
      }
    } catch { /* bỏ qua */ }
  }

  stats(): EngineStats { return { frames: this.frames, lastMs: this.lastMs, avgMs: Math.round(this.avgMs), side: this.side }; }

  /** Các vùng quét luân phiên (tỷ lệ so với khung nhìn): toàn khung → vùng giữa → vùng giữa hẹp hơn */
  private scales(): number[] {
    if (this.info?.decoder === 'native') return [1, 0.5];
    return this.tier === 'weak' ? [1, 0.5, 0.33] : [1, 0.55, 0.33];
  }

  private loop = () => {
    window.clearTimeout(this.timer);
    if (!this.running || document.hidden) return;
    const interval = Math.max(this.tier === 'weak' ? 110 : 70, this.avgMs * 1.3);
    this.timer = window.setTimeout(async () => {
      await this.tick();
      this.loop();
    }, interval);
  };

  private async tick() {
    const v = this.video;
    if (this.busy || !this.detect || !v.videoWidth || v.readyState < 2) return;
    this.busy = true;
    try {
      const sc = this.scales();
      const s = sc[this.cycle++ % sc.length];
      const vw = v.videoWidth, vh = v.videoHeight;
      const cw = vw * s / this.digital, ch = vh * s / this.digital;
      const sx = (vw - cw) / 2, sy = (vh - ch) / 2;
      // Vùng giữa nhỏ (mã ở xa): phóng ảnh lên tối đa 2 lần để bộ giải mã tách được từng ô của mã
      const up = s < 1 || this.digital > 1 ? 2 : 1;
      const k = Math.min(up, this.side / Math.max(cw, ch));
      this.ctx.imageSmoothingEnabled = true;
      (this.ctx as any).imageSmoothingQuality = 'high';
      const dw = Math.max(1, Math.round(cw * k)), dh = Math.max(1, Math.round(ch * k));
      if (this.canvas.width !== dw || this.canvas.height !== dh) { this.canvas.width = dw; this.canvas.height = dh; }
      this.ctx.drawImage(v, sx, sy, cw, ch, 0, 0, dw, dh);
      const t0 = performance.now();
      const text = await this.detect(this.canvas);
      const ms = performance.now() - t0;
      this.lastMs = ms; this.frames++;
      this.avgMs = this.avgMs ? this.avgMs * 0.8 + ms * 0.2 : ms;
      // Máy chậm: giảm kích thước ảnh giải mã (không dưới 480); máy nhanh: tăng lại
      if (this.info?.decoder === 'zxing') {
        if (this.avgMs > 160 && this.side > 480) this.side = Math.max(480, Math.round(this.side * 0.85));
        else if (this.avgMs < 60 && this.side < (this.tier === 'weak' ? 900 : 1280)) this.side = Math.round(this.side * 1.1);
      }
      if (text && this.running) {
        this.running = false;
        this.onResult(text);
      }
    } catch { /* khung hình lỗi: bỏ qua */ } finally { this.busy = false; }
  }

  async stop() {
    this.running = false;
    window.clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.onVis);
    try { this.stream?.getTracks().forEach(t => t.stop()); } catch { /* bỏ qua */ }
    this.stream = null; this.track = null;
    try { this.video.srcObject = null; } catch { /* bỏ qua */ }
    this.digital = 1; this.hwZoomValue = 1;
  }
}

/** Danh sách camera (có tên sau khi đã cho quyền) */
export const listCameras = async (): Promise<{ id: string; label: string }[]> => {
  try {
    const ds = await navigator.mediaDevices.enumerateDevices();
    return ds.filter(d => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  } catch { return []; }
};
