/**
 * NHẬN DIỆN KHUÔN MẶT KHI ĐIỂM DANH (chạy ngay trên điện thoại)
 * - Thư viện @vladmandic/face-api chỉ được tải khi cần (không làm chậm trang chủ).
 * - Mô hình đặt tại /models (≈ 6,7 MB, trình duyệt lưu đệm sau lần đầu).
 * - Kết quả gửi lên máy chủ: 128 số đặc trưng + ảnh khuôn mặt nhỏ (256 px, ≈ 15 KB).
 *   Máy chủ tự so với ảnh mẫu của tài khoản, điện thoại không quyết định khớp hay không.
 */

type FaceApi = typeof import('@vladmandic/face-api');

let apiPromise: Promise<FaceApi> | null = null;

export const MODEL_URL = '/models';

/** Tải thư viện + mô hình (gọi nhiều lần vẫn chỉ tải 1 lần) */
export const loadFaceApi = (): Promise<FaceApi> => {
  if (!apiPromise) {
    apiPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      const tf: any = faceapi.tf;
      try {
        if (!(await tf.setBackend('webgl'))) await tf.setBackend('cpu');
      } catch {
        await tf.setBackend('cpu');
      }
      await tf.ready();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      return faceapi;
    })();
    apiPromise.catch(() => { apiPromise = null; });   // lỗi mạng → lần sau thử lại
  }
  return apiPromise;
};

export interface FaceFrame {
  score: number;
  box: { x: number; y: number; width: number; height: number };
  /** Tỉ lệ vị trí mũi giữa 2 mắt: ≈ 0,5 nhìn thẳng, lệch xa 0,5 là đang quay đầu */
  yaw: number;
  /** Khuôn mặt chiếm bao nhiêu phần chiều rộng khung hình */
  size: number;
  /** 68 điểm đặc trưng, toạ độ theo điểm ảnh của video gốc */
  pts: { x: number; y: number }[];
}

const detectorOpts = (api: FaceApi, inputSize = 224) =>
  new api.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.4 });

/** Vẽ ảnh vào khung rộng hơn (viền xám) — giúp bắt mặt khi để máy quá sát */
const padded = (src: CanvasImageSource, sw: number, sh: number, k = 0.35): { c: HTMLCanvasElement; ox: number; oy: number; scale: number } => {
  const scale = Math.min(1, 480 / Math.max(sw, sh));
  const w = sw * scale, h = sh * scale;
  const c = document.createElement('canvas');
  c.width = Math.round(w * (1 + 2 * k)); c.height = Math.round(h * (1 + 2 * k));
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080'; g.fillRect(0, 0, c.width, c.height);
  const ox = Math.round(w * k), oy = Math.round(h * k);
  g.drawImage(src, ox, oy, w, h);
  return { c, ox, oy, scale };
};

/** Dò nhanh 1 khung hình (dùng cho bước hướng dẫn quay đầu). pad = thử thêm khung rộng khi để máy quá sát */
export const detectFrame = async (api: FaceApi, src: HTMLVideoElement, pad = false): Promise<FaceFrame | null> => {
  const W = src.videoWidth || 1, H = src.videoHeight || 1;
  let input: HTMLVideoElement | HTMLCanvasElement = src;
  let k = 1, ox = 0, oy = 0;
  if (pad) { const p = padded(src, W, H); input = p.c; k = p.scale; ox = p.ox; oy = p.oy; }
  const r = await api.detectSingleFace(input, detectorOpts(api)).withFaceLandmarks(true);
  if (!r) return null;
  const pts = r.landmarks.positions;
  const lx = pts[36].x, rx = pts[45].x, nx = pts[30].x;     // khoé mắt ngoài trái/phải, đỉnh mũi
  const span = rx - lx;
  return {
    score: r.detection.score,
    box: r.detection.box,
    yaw: span > 0 ? (nx - lx) / span : 0.5,
    size: r.detection.box.width / k / W,
    pts: pts.map(q => ({ x: (q.x - ox) / k, y: (q.y - oy) / k }))
  };
};

export interface FaceResult {
  descriptor: number[];
  photo: string;          // data:image/jpeg;base64,...
  live: boolean;          // đã qua bước quay đầu
  method: 'camera' | 'file';
  at: number;
}

/** Cắt khuôn mặt (nới rộng 40%) thành ảnh vuông 256 px */
const cropPhoto = (src: CanvasImageSource, sw: number, sh: number, box: FaceFrame['box']): string => {
  const side = Math.min(Math.max(box.width, box.height) * 1.4, sw, sh);
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const sx = Math.max(0, Math.min(sw - side, cx - side / 2));
  const sy = Math.max(0, Math.min(sh - side, cy - side / 2));
  const out = document.createElement('canvas');
  out.width = out.height = 256;
  out.getContext('2d')!.drawImage(src, sx, sy, side, side, 0, 0, 256, 256);
  return out.toDataURL('image/jpeg', 0.75);
};

/** Chụp từ khung hình đang có: tính đặc trưng + ảnh nhỏ */
export const captureFace = async (
  api: FaceApi, src: HTMLVideoElement | HTMLImageElement, live: boolean, method: 'camera' | 'file'
): Promise<FaceResult | null> => {
  const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth;
  const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight;
  if (!sw || !sh) return null;
  // Thu về tối đa 640 px cho nhanh trên máy yếu
  const k = Math.min(1, 640 / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);

  // Thử vài cỡ đầu vào; nếu mặt chiếm gần hết ảnh (máy quá sát) thì thử thêm khung rộng có viền
  const tryOn = async (img: HTMLCanvasElement) => {
    for (const size of [320, 416, 224]) {
      const r = await api.detectSingleFace(img, detectorOpts(api, size)).withFaceLandmarks(true).withFaceDescriptor();
      if (r) return r;
    }
    return null;
  };
  let target = c;
  let r = await tryOn(c);
  if (!r) { target = padded(c, c.width, c.height).c; r = await tryOn(target); }
  if (!r) return null;
  return {
    descriptor: Array.from(r.descriptor).map(v => Math.round(v * 1e5) / 1e5),
    photo: cropPhoto(target, target.width, target.height, r.detection.box),
    live, method, at: Date.now()
  };
};

/** Khoảng cách giữa 2 bộ đặc trưng */
export const descDist = (a: number[], b: number[]): number =>
  Math.sqrt(a.reduce((t, v, i) => t + (v - b[i]) * (v - b[i]), 0));

/** Gộp nhiều lần chụp (đa điểm): phải cùng 1 người (lệch ≤ maxGap) → lấy trung bình đặc trưng, ảnh lấy lần cuối. Không nhất quán → null */
export const mergeFaces = (rs: FaceResult[], maxGap = 0.45): FaceResult | null => {
  if (!rs.length) return null;
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++)
    if (descDist(rs[i].descriptor, rs[j].descriptor) > maxGap) return null;
  const n = rs.length;
  const descriptor = rs[0].descriptor.map((_, k) => Math.round(rs.reduce((t, r) => t + r.descriptor[k], 0) / n * 1e5) / 1e5);
  const last = rs[n - 1];
  return { ...last, descriptor };
};

/** Ảnh từ ứng dụng camera của máy (phương án dự phòng) */
export const faceFromFile = async (api: FaceApi, file: File): Promise<FaceResult | null> => {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await captureFace(api, img, false, 'file');
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Kết quả chụp còn dùng được trong 3 phút (đủ thời gian quét mã QR) */
export const FACE_RESULT_TTL = 3 * 60 * 1000;
