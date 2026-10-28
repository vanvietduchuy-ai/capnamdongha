/**
 * LƯỚI KHUÔN MẶT ~1000 ĐIỂM (hiệu ứng hiển thị khi chụp mặt)
 * Mô hình thật chỉ cho 68 điểm đặc trưng. Lưới 1000 điểm là lưới tổ ong dựng trên khuôn mặt, bám theo
 * 68 điểm thật (vị trí, kích thước, độ nghiêng, độ quay đầu) — để người dùng thấy máy đang "quét" kỹ khuôn mặt.
 * Không ảnh hưởng đến kết quả nhận diện.
 */
export type Pt = { x: number; y: number };

interface Mesh { u: Float32Array; w: Float32Array; z: Float32Array; edges: Uint16Array; n: number }
let mesh: Mesh | null = null;

const build = (): Mesh => {
  // Lưới tổ ong trong hình elip (u ∈ [-1,1], w ∈ [-1,1]); chỉnh bước để ra ≈ 1000 điểm
  let d = 0.0674, us: number[] = [], ws: number[] = [];
  for (let it = 0; it < 12; it++) {
    us = []; ws = [];
    const dy = d * Math.sqrt(3) / 2;
    for (let j = 0, y = -1; y <= 1; y += dy, j++) {
      for (let x = -1 + (j % 2 ? d / 2 : 0); x <= 1; x += d) {
        if (x * x + y * y <= 1) { us.push(x); ws.push(y); }
      }
    }
    const k = us.length / 1000;
    if (Math.abs(k - 1) < 0.01) break;
    d *= Math.sqrt(k);
  }
  const n = us.length;
  const u = Float32Array.from(us), w = Float32Array.from(ws);
  const z = new Float32Array(n);
  for (let i = 0; i < n; i++) z[i] = Math.sqrt(Math.max(0, 1 - u[i] * u[i] - w[i] * w[i]));
  const e: number[] = [], lim = d * 1.15, l2 = lim * lim;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const dx = u[i] - u[j], dy = w[i] - w[j];
    if (dx * dx + dy * dy <= l2) e.push(i, j);
  }
  return { u, w, z, edges: Uint16Array.from(e), n };
};

export const meshPointCount = () => (mesh ??= build()).n;

export interface MeshState { pts: Pt[] | null; seen: number; vw: number; vh: number }

/** Làm mượt 68 điểm giữa các lần dò */
export const smooth = (cur: Pt[] | null, target: Pt[], a = 0.4): Pt[] =>
  !cur || cur.length !== target.length ? target.map(p => ({ ...p })) : cur.map((p, i) => ({ x: p.x + (target[i].x - p.x) * a, y: p.y + (target[i].y - p.y) * a }));

/** Vẽ lưới lên canvas (toạ độ CSS px của khung hiển thị; video hiển thị kiểu cover và lật gương) */
export const drawMesh = (
  g: CanvasRenderingContext2D, cw: number, ch: number, st: MeshState, pts: Pt[] | null,
  color: string, alpha: number, time: number
) => {
  g.clearRect(0, 0, cw, ch);
  if (!pts || pts.length < 68 || alpha <= 0.02 || !st.vw) return;
  const m = (mesh ??= build());
  const sc = Math.max(cw / st.vw, ch / st.vh);
  const offx = (cw - st.vw * sc) / 2, offy = (ch - st.vh * sc) / 2;
  const S = (p: Pt): Pt => ({ x: cw - (p.x * sc + offx), y: p.y * sc + offy });   // lật gương như video

  // Khung mặt từ các điểm thật (trong toạ độ video)
  const jawL = pts[0], jawR = pts[16], chin = pts[8], nose = pts[30];
  const brow = (pts[19].y + pts[24].y) / 2;
  const faceH = (chin.y - brow) * 1.6;
  const cx = (jawL.x + jawR.x) / 2, cy = chin.y - faceH / 2;
  const rx = Math.hypot(jawR.x - jawL.x, jawR.y - jawL.y) / 2 * 1.02, ry = faceH / 2;
  const roll = Math.atan2(pts[45].y - pts[36].y, pts[45].x - pts[36].x);
  const sinA = Math.max(-0.95, Math.min(0.95, (nose.x - cx) / (rx * 0.9)));
  const cosA = Math.sqrt(1 - sinA * sinA), cr = Math.cos(roll), sr = Math.sin(roll);

  const X = new Float32Array(m.n), Y = new Float32Array(m.n);
  for (let i = 0; i < m.n; i++) {
    const lx = (m.u[i] * cosA + m.z[i] * sinA * 0.55) * rx;     // phình ra phía mũi khi quay đầu
    const ly = m.w[i] * ry;
    const vx = cx + lx * cr - ly * sr, vy = cy + lx * sr + ly * cr;
    X[i] = cw - (vx * sc + offx); Y[i] = vy * sc + offy;
  }

  g.save();
  g.globalAlpha = alpha;
  // đường nối
  g.strokeStyle = color; g.globalAlpha = alpha * 0.28; g.lineWidth = 0.7;
  g.beginPath();
  for (let k = 0; k < m.edges.length; k += 2) { const a = m.edges[k], b = m.edges[k + 1]; g.moveTo(X[a], Y[a]); g.lineTo(X[b], Y[b]); }
  g.stroke();
  // điểm + vệt quét chạy từ trên xuống
  const top = Math.min(...Array.from(Y)), bot = Math.max(...Array.from(Y));
  const band = top + ((time % 1800) / 1800) * (bot - top), bw = (bot - top) * 0.12;
  g.fillStyle = color;
  for (let i = 0; i < m.n; i++) {
    const near = Math.max(0, 1 - Math.abs(Y[i] - band) / bw);
    g.globalAlpha = alpha * (0.5 + 0.5 * near);
    const r = 0.9 + near * 1.3;
    g.fillRect(X[i] - r / 2, Y[i] - r / 2, r, r);
  }
  // vạch quét
  g.globalAlpha = alpha * 0.55; g.strokeStyle = '#ffffff'; g.lineWidth = 1.2;
  const mx = cw - (cx * sc + offx);
  g.beginPath(); g.moveTo(mx - rx * sc * 1.05, band); g.lineTo(mx + rx * sc * 1.05, band); g.stroke();
  // 68 điểm thật nổi bật
  g.globalAlpha = alpha; g.fillStyle = '#ffffff';
  for (const p of pts) { const q = S(p); g.beginPath(); g.arc(q.x, q.y, 1.8, 0, Math.PI * 2); g.fill(); }
  g.restore();
};
