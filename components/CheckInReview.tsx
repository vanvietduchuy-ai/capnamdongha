import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert, Check, X, Image as ImageIcon, Loader2, Globe, RotateCcw, UserX, Smartphone } from 'lucide-react';
import { MockDB } from '../services/mockDatabase';
import { AttendanceRecord, CheckInAttempt, User } from '../types';
import { flagLabel, toneClass, attemptLabel } from '../lib/checkFlags';

/**
 * BAN TỔ CHỨC KIỂM TRA ĐIỂM DANH
 * - Lượt "Chờ kiểm tra": vẫn tính có mặt; xem ảnh, bấm Đúng người hoặc Loại.
 * - Lượt "Bị từ chối" (VPN, mặt không khớp): xem ảnh, bấm Cho điểm danh nếu chặn nhầm.
 */
interface Props {
  sessionId: string;
  records: AttendanceRecord[];
  userMap: Map<string, User>;
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

type PhotoState = { loading: boolean; photo?: string | null; enrollPhoto?: string | null; enrollStatus?: string | null; err?: string };

export const CheckInReview: React.FC<Props> = ({ sessionId, records, userMap }) => {
  const [attempts, setAttempts] = useState<CheckInAttempt[]>([]);
  const [faces, setFaces] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, 'OK' | 'REJECT'>>({});
  const [photos, setPhotos] = useState<Record<string, PhotoState>>({});
  const [showAll, setShowAll] = useState(false);
  const [msg, setMsg] = useState('');
  const [ipInfo, setIpInfo] = useState<string>('');

  const loadReview = useCallback(async () => {
    const r = await MockDB.getCheckinReview(sessionId);
    if (!r.ok) { setErr(r.message || 'Không tải được dữ liệu kiểm tra.'); return; }
    setErr(''); setAttempts(r.attempts); setFaces(r.faces);
  }, [sessionId]);

  useEffect(() => { loadReview(); const t = window.setInterval(loadReview, 20000); return () => window.clearInterval(t); }, [loadReview]);

  const flagged = useMemo(() => records
    .filter(r => !r.guestName && (r.checkFlags?.length || 0) > 0 && !done[r.id])
    .filter(r => showAll || r.reviewStatus === 'PENDING')
    .sort((a, b) => (a.reviewStatus === 'PENDING' ? 0 : 1) - (b.reviewStatus === 'PENDING' ? 0 : 1) || b.timestamp - a.timestamp),
  [records, done, showAll]);
  const pendingCount = records.filter(r => r.reviewStatus === 'PENDING' && !done[r.id]).length;
  const openAttempts = attempts.filter(a => !a.resolved && a.reason !== 'REJECTED_BY_REVIEW');
  const closedAttempts = attempts.filter(a => a.resolved || a.reason === 'REJECTED_BY_REVIEW');

  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 3000); };

  const loadPhoto = async (kind: 'record' | 'attempt', id: string) => {
    if (photos[id]?.photo !== undefined) { setPhotos(p => { const n = { ...p }; delete n[id]; return n; }); return; }   // bấm lần 2 = ẩn
    setPhotos(p => ({ ...p, [id]: { loading: true } }));
    const r = await MockDB.getCheckinPhoto(kind, id);
    setPhotos(p => ({ ...p, [id]: r.ok ? { loading: false, photo: r.photo || null, enrollPhoto: r.enrollPhoto || null, enrollStatus: r.enrollStatus || null } : { loading: false, err: r.message } }));
  };

  const decide = async (r: AttendanceRecord, d: 'OK' | 'REJECT') => {
    const name = userMap.get(r.userId)?.fullName || r.userId;
    if (d === 'REJECT' && !window.confirm(`Loại lượt điểm danh của ${name}? Người này sẽ bị tính là chưa điểm danh.`)) return;
    setBusy(r.id);
    const res = await MockDB.decideCheckin(r.id, d);
    setBusy(null);
    if (!res.ok) { flash(res.message || 'Không thực hiện được.'); return; }
    setDone(x => ({ ...x, [r.id]: d }));
    flash(d === 'OK' ? `Đã xác nhận ${name}.` : `Đã loại lượt điểm danh của ${name}.`);
    loadReview();
  };

  const resolve = async (a: CheckInAttempt, d: 'ACCEPT' | 'DISMISS') => {
    setBusy(a.id);
    const res = await MockDB.resolveAttempt(a.id, d);
    setBusy(null);
    if (!res.ok) { flash(res.message || 'Không thực hiện được.'); return; }
    flash(d === 'ACCEPT' ? 'Đã cho điểm danh.' : 'Đã giữ nguyên từ chối.');
    loadReview();
  };

  const allowIp = async (ip: string) => {
    if (!window.confirm(`Cho phép IP ${ip}? Các lượt điểm danh sau từ IP này sẽ không bị chặn.`)) return;
    const res = await MockDB.allowIp(ip);
    flash(res.ok ? `Đã cho phép IP ${ip}.` : (res.message || 'Không thực hiện được.'));
  };

  const reset = async (userId: string, what: 'FACE' | 'DEVICE') => {
    const name = userMap.get(userId)?.fullName || userId;
    const q = what === 'FACE'
      ? `Xoá ảnh mẫu khuôn mặt của ${name}? Lần điểm danh sau sẽ chụp lại ảnh mẫu.`
      : `Gỡ các máy đã gắn với tài khoản ${name}? Lần điểm danh sau sẽ gắn máy mới.`;
    if (!window.confirm(q)) return;
    const res = await MockDB.resetUserCheck(userId, what);
    flash(res.ok ? 'Đã thực hiện.' : (res.message || 'Không thực hiện được.'));
    loadReview();
  };

  const checkIp = async () => {
    setIpInfo('Đang kiểm tra...');
    const r = await MockDB.ipDebug();
    if (!r.ok) { setIpInfo(r.message || 'Không kiểm tra được.'); return; }
    const rep = r.rep;
    setIpInfo(!rep?.checked
      ? `IP ${r.ip || '?'} — chưa tra cứu được (${rep?.error || 'dịch vụ không phản hồi'}). Điểm danh vẫn được, có gắn cờ.`
      : rep.bad ? `IP ${r.ip} — ${rep.kind} (${rep.org}) → sẽ BỊ CHẶN. Nếu đây là mạng hội trường, bấm "Cho phép IP này" ở lượt bị chặn.`
        : `IP ${r.ip} — bình thường${rep.org ? ` (${rep.org})` : ''}${rep.kind === 'ALLOWED' ? ', đã được cho phép' : ''}.`);
  };

  const photoBox = (id: string) => {
    const p = photos[id];
    if (!p) return null;
    if (p.loading) return <div className="mt-2 text-xs text-stone-500 inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Đang tải ảnh...</div>;
    if (p.err) return <div className="mt-2 text-xs text-red-700">{p.err}</div>;
    return (
      <div className="mt-2 grid grid-cols-2 gap-2">
        <figure className="text-center">
          {p.photo ? <img src={p.photo} alt="Ảnh lúc điểm danh" className="w-full aspect-square object-cover rounded-lg border border-stone-200" /> : <div className="w-full aspect-square rounded-lg border border-dashed border-stone-300 flex items-center justify-center text-xs text-stone-400">Không có ảnh</div>}
          <figcaption className="text-[11px] text-stone-500 mt-1">Lúc điểm danh</figcaption>
        </figure>
        <figure className="text-center">
          {p.enrollPhoto ? <img src={p.enrollPhoto} alt="Ảnh mẫu" className="w-full aspect-square object-cover rounded-lg border border-stone-200" /> : <div className="w-full aspect-square rounded-lg border border-dashed border-stone-300 flex items-center justify-center text-xs text-stone-400">Chưa có ảnh mẫu</div>}
          <figcaption className="text-[11px] text-stone-500 mt-1">Ảnh mẫu{p.enrollStatus === 'PENDING' ? ' (chưa xác nhận)' : ''}</figcaption>
        </figure>
      </div>
    );
  };

  const btn = 'inline-flex items-center justify-center gap-1 h-9 px-3 rounded-lg text-[13px] font-semibold disabled:opacity-40';

  return (
    <div className="space-y-4" data-testid="checkin-review">
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{err}</div>}
      {msg && <div className="p-2.5 rounded-lg bg-stone-900 text-white text-sm" role="status">{msg}</div>}

      <section>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-[13px] font-semibold text-stone-900 inline-flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-amber-600" />Chờ kiểm tra ({pendingCount})</h4>
          <label className="ml-auto text-xs text-stone-500 inline-flex items-center gap-1.5"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />Hiện cả lượt đã duyệt</label>
        </div>
        {flagged.length === 0 ? (
          <p className="text-sm text-emerald-700 inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />Không có lượt nào cần kiểm tra.</p>
        ) : (
          <div className="rounded-lg border border-stone-200 divide-y divide-stone-100 bg-white">
            {flagged.map(r => {
              const u = userMap.get(r.userId);
              const pending = r.reviewStatus === 'PENDING';
              return (
                <div key={r.id} className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-stone-900">{u?.fullName || r.userId}
                        {!pending && r.reviewStatus === 'OK' && <span className="ml-1.5 text-[10px] font-medium text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded">đã xác nhận</span>}
                      </div>
                      <div className="text-[11px] text-stone-500">{u?.department || ''} · {hhmm(r.timestamp)}{r.faceDist != null ? ` · độ lệch mặt ${Number(r.faceDist).toFixed(2)}` : ''}{r.serverIp ? ` · IP ${r.serverIp}` : ''}</div>
                    </div>
                    <button onClick={() => loadPhoto('record', r.id)} className="shrink-0 p-2 -m-1 text-stone-500 hover:text-stone-900" aria-label="Xem ảnh"><ImageIcon className="w-[18px] h-[18px]" /></button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(r.checkFlags || []).map((f, i) => { const l = flagLabel(f); return <span key={i} className={`text-[11px] px-1.5 py-0.5 rounded border ${toneClass[l.tone]}`}>{l.text}</span>; })}
                  </div>
                  {photoBox(r.id)}
                  {pending && (
                    <div className="flex gap-2 mt-2">
                      <button disabled={busy === r.id} onClick={() => decide(r, 'OK')} className={`${btn} flex-1 bg-emerald-600 hover:bg-emerald-700 text-white`}><Check className="w-4 h-4" />Đúng người</button>
                      <button disabled={busy === r.id} onClick={() => decide(r, 'REJECT')} className={`${btn} flex-1 border border-red-300 text-red-700 bg-white hover:bg-red-50`}><X className="w-4 h-4" />Loại</button>
                    </div>
                  )}
                  <div className="flex gap-3 mt-1.5">
                    {faces[r.userId] && <button onClick={() => reset(r.userId, 'FACE')} className="text-[11px] text-stone-500 hover:text-stone-800 inline-flex items-center gap-1"><UserX className="w-3 h-3" />Xoá ảnh mẫu</button>}
                    <button onClick={() => reset(r.userId, 'DEVICE')} className="text-[11px] text-stone-500 hover:text-stone-800 inline-flex items-center gap-1"><Smartphone className="w-3 h-3" />Gỡ máy đã gắn</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h4 className="text-[13px] font-semibold text-stone-900 mb-2 inline-flex items-center gap-1.5"><X className="w-4 h-4 text-red-600" />Bị từ chối ({openAttempts.length})</h4>
        {openAttempts.length === 0 ? <p className="text-sm text-stone-500">Không có.</p> : (
          <div className="rounded-lg border border-red-200 divide-y divide-red-100 bg-red-50/30">
            {openAttempts.map(a => {
              const u = userMap.get(a.userId);
              return (
                <div key={a.id} className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-stone-900">{u?.fullName || a.userId}</div>
                      <div className="text-[11px] text-stone-600">{attemptLabel(a)} · {hhmm(a.createdAt)}{a.serverIp ? ` · IP ${a.serverIp}` : ''}</div>
                    </div>
                    {a.hasPhoto && <button onClick={() => loadPhoto('attempt', a.id)} className="shrink-0 p-2 -m-1 text-stone-500 hover:text-stone-900" aria-label="Xem ảnh"><ImageIcon className="w-[18px] h-[18px]" /></button>}
                  </div>
                  {photoBox(a.id)}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button disabled={busy === a.id} onClick={() => resolve(a, 'ACCEPT')} className={`${btn} bg-emerald-600 hover:bg-emerald-700 text-white`}><Check className="w-4 h-4" />Cho điểm danh</button>
                    <button disabled={busy === a.id} onClick={() => resolve(a, 'DISMISS')} className={`${btn} border border-stone-300 bg-white text-stone-700 hover:bg-stone-50`}>Giữ từ chối</button>
                    {a.reason === 'IP_BLOCKED' && a.serverIp && <button onClick={() => allowIp(a.serverIp!)} className={`${btn} border border-stone-300 bg-white text-stone-700 hover:bg-stone-50`}><Globe className="w-4 h-4" />Cho phép IP này</button>}
                    {a.reason === 'FACE_MISMATCH' && faces[a.userId] && <button onClick={() => reset(a.userId, 'FACE')} className={`${btn} border border-stone-300 bg-white text-stone-700 hover:bg-stone-50`}><RotateCcw className="w-4 h-4" />Xoá ảnh mẫu</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {closedAttempts.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-stone-500 cursor-pointer">Đã xử lý ({closedAttempts.length})</summary>
            <ul className="mt-1.5 space-y-1">
              {closedAttempts.map(a => (
                <li key={a.id} className="text-xs text-stone-600">{userMap.get(a.userId)?.fullName || a.userId} — {attemptLabel(a)} · {hhmm(a.createdAt)} · {a.resolved === 'ACCEPTED' ? 'đã cho điểm danh' : 'giữ từ chối'}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="pt-3 border-t border-stone-200">
        <button onClick={checkIp} className="text-[13px] font-medium text-stone-700 hover:text-stone-900 inline-flex items-center gap-1.5"><Globe className="w-4 h-4" />Kiểm tra IP mạng máy này</button>
        {ipInfo && <p className="text-xs text-stone-600 mt-1">{ipInfo}</p>}
      </section>
    </div>
  );
};
