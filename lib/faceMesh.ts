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

// ---------- Khuôn mặt chuẩn (trung bình, toạ độ chuẩn hoá: u = ngang / nửa rộng mặt, w = dọc / nửa cao mặt) ----------
const TPL = Float32Array.from([-0.979,-0.043,-0.956,0.152,-0.918,0.354,-0.876,0.53,-0.779,0.732,-0.642,0.898,-0.492,1.008,-0.295,1.129,0,1.194,0.295,1.129,0.492,1.008,0.642,0.898,0.779,0.732,0.876,0.53,0.918,0.354,0.956,0.152,0.979,-0.043,-0.771,-0.202,-0.66,-0.249,-0.514,-0.272,-0.375,-0.264,-0.245,-0.227,0.245,-0.227,0.375,-0.264,0.514,-0.272,0.66,-0.249,0.771,-0.202,0,-0.003,0,0.136,0,0.26,0,0.362,-0.165,0.437,-0.094,0.454,0,0.471,0.094,0.454,0.165,0.437,-0.588,-0.034,-0.494,-0.065,-0.38,-0.063,-0.254,-0.012,-0.361,0.008,-0.498,0.008,0.254,-0.012,0.38,-0.063,0.494,-0.065,0.588,-0.034,0.498,0.008,0.361,0.008,-0.353,0.681,-0.2,0.62,-0.09,0.6,0,0.605,0.09,0.6,0.2,0.62,0.353,0.681,0.2,0.77,0.09,0.8,0,0.805,-0.09,0.8,-0.2,0.77,-0.3,0.685,-0.1,0.66,0,0.66,0.1,0.66,0.3,0.685,0.1,0.72,0,0.725,-0.1,0.72]);
const ASPECT = 1.25;                        // nửa cao / nửa rộng mặt, để đo khoảng cách theo cùng đơn vị

const g2 = (du: number, dw: number, s: number) => Math.exp(-(du * du + (dw * ASPECT) * (dw * ASPECT)) / (2 * s * s));
/** Gần đoạn thẳng a→b (chỉ số điểm chuẩn): trả [giá trị, vị trí dọc đoạn 0..1] */
const segG = (u: number, w: number, a: number, b: number, s: number): [number, number] => {
  const ax = TPL[a * 2], ay = TPL[a * 2 + 1] * ASPECT, bx = TPL[b * 2], by = TPL[b * 2 + 1] * ASPECT;
  const px = u, py = w * ASPECT, dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return [Math.exp(-(qx * qx + qy * qy) / (2 * s * s)), t];
};
const T = (i: number) => [TPL[i * 2], TPL[i * 2 + 1]];
/** Độ nhô (đơn vị = nửa rộng mặt) của khuôn mặt chuẩn: nền cầu + sống mũi, chóp mũi, hốc mắt, gờ mày, môi, cằm */
export const heightAt = (u: number, w: number): number => {
  let h = 0.6 * Math.sqrt(Math.max(0, 1 - u * u - w * w));
  const [gn, t] = segG(u, w, 27, 30, 0.085); h += gn * (0.12 + 0.42 * t);
  const tip = T(30); h += 0.3 * g2(u - tip[0], w - tip[1], 0.1);
  for (const k of [31, 35]) { const a = T(k); h += 0.1 * g2(u - a[0], w - a[1], 0.06); }
  for (const [a, b] of [[17, 21], [22, 26]]) h += 0.1 * segG(u, w, a, b, 0.07)[0];
  for (const [a, b] of [[36, 39], [42, 45]]) h -= 0.14 * segG(u, w, a, b, 0.1)[0];
  const m = T(51), mb = T(57); h += 0.12 * g2(u - (m[0] + mb[0]) / 2, w - (m[1] + mb[1]) / 2, 0.12);
  h -= 0.07 * segG(u, w, 60, 64, 0.05)[0];
  const c = T(8); h += 0.1 * g2(u - c[0], w - (c[1] - 0.12), 0.14);
  return h;
};

let relief: Float32Array | null = null;
let grx: Float32Array | null = null, gry: Float32Array | null = null;   // độ dốc bề mặt tại từng đỉnh (để đổ bóng)
let lmH: Float32Array | null = null;
const prepare = () => {
  const m = (mesh ??= build());
  if (!relief) {
    relief = new Float32Array(m.n); grx = new Float32Array(m.n); gry = new Float32Array(m.n);
    const e = 0.03;
    for (let i = 0; i < m.n; i++) {
      const u = m.u[i], w = m.w[i];
      relief[i] = heightAt(u, w);
      grx[i] = (heightAt(u + e, w) - heightAt(u - e, w)) / (2 * e);
      gry[i] = (heightAt(u, w + e) - heightAt(u, w - e)) / (2 * e) / ASPECT;
    }
  }
  if (!lmH) { lmH = new Float32Array(68); for (let i = 0; i < 68; i++) lmH[i] = heightAt(TPL[i * 2], TPL[i * 2 + 1]); }
  return m;
};


/**
 * Lưới 3D: mỗi đỉnh có độ nhô theo khuôn mặt chuẩn (mũi cao, hốc mắt lõm, môi, cằm), xoay theo góc quay đầu ước lượng,
 * chiếu phối cảnh, rồi "hút" khớp với 68 điểm thật (mắt, mũi, miệng, viền hàm) để lưới nằm đúng trên mặt.
 */
export const drawMesh = (
  g: CanvasRenderingContext2D, cw: number, ch: number, st: MeshState, pts: Pt[] | null,
  color: string, alpha: number, time: number
) => {
  g.clearRect(0, 0, cw, ch);
  if (!pts || pts.length < 68 || alpha <= 0.02 || !st.vw) return;
  const m = prepare();
  const sc = Math.max(cw / st.vw, ch / st.vh);
  const offx = (cw - st.vw * sc) / 2, offy = (ch - st.vh * sc) / 2;

  const jawL = pts[0], jawR = pts[16], chin = pts[8];
  const brow = (pts[19].y + pts[24].y) / 2;
  const faceH = (chin.y - brow) * 1.6;
  const cx = (jawL.x + jawR.x) / 2, cy = chin.y - faceH / 2;
  const rx = Math.hypot(jawR.x - jawL.x, jawR.y - jawL.y) / 2 * 1.02, ry = faceH / 2;
  const roll = Math.atan2(pts[45].y - pts[36].y, pts[45].x - pts[36].x);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const au = new Float32Array(68), aw = new Float32Array(68);
  for (let i = 0; i < 68; i++) {
    const dx = pts[i].x - cx, dy = pts[i].y - cy;
    au[i] = (dx * cr + dy * sr) / rx; aw[i] = (-dx * sr + dy * cr) / ry;
  }
  const hTip = lmH![30];
  const sinA = Math.max(-0.9, Math.min(0.9, (au[30] - TPL[60]) / hTip));
  const cosA = Math.sqrt(1 - sinA * sinA);
  const persp = (z: number) => 1 / (1 - z * 0.15);

  const ru = new Float32Array(68), rw = new Float32Array(68), lu = new Float32Array(68), lw = new Float32Array(68);
  for (let i = 0; i < 68; i++) {
    const u = TPL[i * 2], w = TPL[i * 2 + 1], h = lmH![i];
    const x = u * cosA + h * sinA, z = h * cosA - u * sinA, f = persp(z);
    lu[i] = x * f; lw[i] = w * f;
    ru[i] = au[i] - lu[i]; rw[i] = aw[i] - lw[i];
  }

  const n = m.n;
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  const sig2 = 2 * 0.26 * 0.26;
  const swayK = 0.16 * Math.sin(time / 650);   // lắc nhẹ: phần nhô (mũi) dịch nhiều hơn phần thấp → thấy rõ khối 3D
  for (let i = 0; i < n; i++) {
    const u = m.u[i], w = m.w[i], h = relief![i];
    const x = u * cosA + h * sinA, z = h * cosA - u * sinA, f = persp(z);
    const px = x * f, py = w * f;
    let sw = 0, sx = 0, sy = 0;
    for (let j = 0; j < 68; j++) {
      const dx = px - lu[j], dy = (py - lw[j]) * ASPECT;
      const k = Math.exp(-(dx * dx + dy * dy) / sig2);
      sw += k; sx += k * ru[j]; sy += k * rw[j];
    }
    const d = sw + 0.5;
    const lx = (px + sx / d + z * swayK) * rx, ly = (py + sy / d) * ry;
    X[i] = cw - ((cx + lx * cr - ly * sr) * sc + offx);
    Y[i] = (cy + lx * sr + ly * cr) * sc + offy;
    Z[i] = z;
  }

  // ánh sáng (đổ bóng theo độ dốc bề mặt) + độ sâu → độ sáng từng đỉnh
  const lx0 = -0.4 - sinA * 0.8, ly0 = -0.5, lz0 = 0.77, ln = Math.hypot(lx0, ly0, lz0);
  const B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const nx = -grx![i], ny = -gry![i], nl = Math.hypot(nx, ny, 1);
    const shade = Math.max(0, (nx * lx0 + ny * ly0 + lz0) / (nl * ln));
    const depth = Math.max(0, Math.min(1, (Z[i] + 0.1) / 1.0));
    B[i] = Math.max(0, Math.min(1, 0.65 * depth + 0.5 * (shade - 0.5) + 0.2));
  }
  const rgb = hex(color), far = mixc(rgb, [0, 0, 0], 0.62), near = mixc(rgb, [255, 255, 255], 0.65);
  const col = (b: number) => b < 0.5 ? mixc(far, rgb, b / 0.5) : mixc(rgb, near, (b - 0.5) / 0.5);
  g.save();
  const NB = 5, bucket = Array.from({ length: NB }, () => new Path2D());
  for (let k = 0; k < m.edges.length; k += 2) {
    const a = m.edges[k], b2 = m.edges[k + 1];
    const b = (B[a] + B[b2]) / 2, bi = Math.min(NB - 1, Math.floor(b * NB));
    if (bi === 0 && ((k >> 1) & 1)) continue;          // vùng xa/tối: bỏ bớt đường → thưa rõ
    bucket[bi].moveTo(X[a], Y[a]); bucket[bi].lineTo(X[b2], Y[b2]);
  }
  for (let bi = 0; bi < NB; bi++) {
    const b = (bi + 0.5) / NB;
    g.strokeStyle = rgbs(col(b)); g.globalAlpha = alpha * (0.18 + 0.82 * b); g.lineWidth = 0.5 + 1.3 * b;
    g.stroke(bucket[bi]);
  }

  let top = Infinity, bot = -Infinity;
  for (let i = 0; i < n; i++) { if (Y[i] < top) top = Y[i]; if (Y[i] > bot) bot = Y[i]; }
  const band = top + ((time % 1800) / 1800) * (bot - top), bw = (bot - top) * 0.12;
  for (let i = 0; i < n; i++) {
    const b = B[i];
    if (b < 0.3 && (i & 1)) continue;                  // vùng xa: ít điểm hơn
    const near2 = Math.max(0, 1 - Math.abs(Y[i] - band) / bw);
    g.fillStyle = rgbs(col(Math.min(1, b + near2 * 0.3)));
    g.globalAlpha = alpha * Math.min(1, 0.25 + 0.75 * b + 0.2 * near2);
    const r = 0.4 + 3.2 * b * b + near2 * 1.2;         // gần/sáng: to; xa/tối: li ti
    g.fillRect(X[i] - r / 2, Y[i] - r / 2, r, r);
  }
  const mx = cw - (cx * sc + offx);
  g.globalAlpha = alpha * 0.9; g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.shadowColor = color; g.shadowBlur = 8;
  g.beginPath(); g.moveTo(mx - rx * sc * 1.05, band); g.lineTo(mx + rx * sc * 1.05, band); g.stroke();
  g.shadowBlur = 0;
  g.restore();
};

const hex = (c: string): [number, number, number] => {
  const v = c.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};
const mixc = (a: number[], b: number[], t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgbs = (c: number[]) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
