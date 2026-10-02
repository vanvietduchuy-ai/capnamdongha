import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Grid3x3, Loader2, Lock, QrCode, ShieldCheck, WifiOff } from 'lucide-react';
import { Portal } from '../Portal';
import { Learning } from '../../services/learningService';
import { Exam, ExamPaperQuestion, User } from '../../types';
import { fmtClock, fmtScore, getDeviceId, getDeviceLabel, grade, LETTERS } from '../../lib/exam';
import { btnPrimary, btnSecondary, QrScanBox } from './common';
import { haptic, ResultMark } from '../UI';
import { LOGO_URL } from '../../lib/brand';
import { backdropClose } from '../../lib/backdrop';

interface Props { exam: Exam; me: User; onClose: () => void; }

type Phase = 'intro' | 'scan' | 'loading' | 'locked' | 'exam' | 'result';
const AWAY_MIN_MS = 1000;   // rời dưới 1 giây (kéo thanh thông báo…) không tính

/**
 * Làm bài thi trên điện thoại/máy tính.
 * Chống gian lận phía máy: chữ chìm họ tên, chặn sao chép/chuột phải, đếm số lần rời màn hình
 * (chuyển ứng dụng, tắt màn hình, sang tab khác) và báo máy chủ; quá số lần quy định máy chủ tự nộp bài.
 * Đồng hồ theo giờ máy chủ; mất mạng vẫn làm tiếp, câu trả lời gửi lại khi có mạng.
 */
export const ExamTaker: React.FC<Props> = ({ exam, me, onClose }) => {
  const [phase, setPhase] = useState<Phase>('intro');
  const [err, setErr] = useState('');
  const [qs, setQs] = useState<ExamPaperQuestion[]>([]);
  const [ans, setAns] = useState<Record<string, number>>({});
  const [idx, setIdx] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [offset, setOffset] = useState(0);        // giờ máy chủ − giờ máy
  const [now, setNow] = useState(Date.now());
  const [leave, setLeave] = useState({ n: 0, max: exam.maxLeave });
  const [warn, setWarn] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<{ score: number | null; correct: number | null; total: number; answered: number; passed: boolean | null; reason?: string } | null>(null);
  const [offline, setOffline] = useState(false);
  const pendingRef = useRef<Map<string, number | null>>(new Map());
  const [pendingN, setPendingN] = useState(0);
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const submitting = useRef(false);
  const leaveRef = useRef(0);

  const deviceId = useMemo(getDeviceId, []);
  const deviceLabel = useMemo(getDeviceLabel, []);
  const s = exam.settings || {};

  // ---------- Vào thi ----------
  const start = async (qr: string | null) => {
    setPhase('loading'); setErr('');
    const r = await Learning.start(exam.id, qr, deviceId, deviceLabel);
    if (!r.ok) {
      if (r.code === 'NEED_QR') { setErr(r.message || 'Quét mã QR phòng thi.'); setPhase('scan'); return; }
      if (r.code === 'LOCKED') { setErr(r.message || 'Bài thi đang tạm khoá.'); setPhase('locked'); return; }
      if (r.code === 'SUBMITTED') { setResult({ score: null, correct: null, total: 0, answered: 0, passed: null, reason: r.message }); setPhase('result'); return; }
      setErr(r.message || 'Không vào được bài thi.'); setPhase('intro'); return;
    }
    setQs(r.questions || []);
    setAns(r.answers || {});
    setDeadline(Number(r.attempt.deadline));
    setOffset(Number(r.attempt.serverNow) - Date.now());
    const prevLeave = leaveRef.current;
    leaveRef.current = r.attempt.leaveCount || 0;
    setLeave({ n: r.attempt.leaveCount || 0, max: r.attempt.maxLeave ?? exam.maxLeave });
    const firstEmpty = (r.questions || []).findIndex(q => (r.answers || {})[q.id] === undefined);
    setIdx(firstEmpty < 0 ? 0 : firstEmpty);
    setPhase('exam');
    if ((r.attempt.leaveCount || 0) > prevLeave) setWarn(`Bạn đã thoát ra rồi vào lại. Số lần rời bài thi: ${r.attempt.leaveCount}${r.attempt.maxLeave ? `/${r.attempt.maxLeave}` : ''}.`);
    if (window.matchMedia('(pointer: fine)').matches) document.documentElement.requestFullscreen?.().catch(() => { /* bỏ qua */ });
  };

  // ---------- Nộp bài ----------
  const submit = useCallback(async (reason?: string) => {
    if (submitting.current) return;
    submitting.current = true;
    await flush();
    const r = await Learning.submit(exam.id);
    submitting.current = false;
    if (!r.ok && r.code !== 'SUBMITTED') { setErr(r.message || 'Chưa nộp được, kiểm tra mạng rồi bấm nộp lại.'); setConfirm(false); return; }
    setResult({ score: r.score ?? null, correct: r.correct ?? null, total: r.total || qs.length, answered: r.answered ?? Object.keys(ans).length, passed: r.passed ?? null, reason });
    setPhase('result'); setConfirm(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { /* bỏ qua */ });
  }, [exam.id, qs.length, ans]);
  const submitRef = useRef(submit); submitRef.current = submit;

  // ---------- Lưu câu trả lời (gửi lại khi mất mạng) ----------
  const flush = async () => {
    const m = pendingRef.current;
    for (const [qid, choice] of [...m.entries()]) {
      const r = await Learning.answer(exam.id, qid, choice);
      if (r.ok) { if (m.get(qid) === choice) m.delete(qid); setOffline(false); if (r.deadline) setDeadline(Number(r.deadline)); }
      else if (r.code === 'SUBMITTED' || r.code === 'LOCKED' || r.code === 'OTHER_DEVICE') { m.clear(); handleServerState(r.code, r.message); break; }
      else { setOffline(true); break; }
    }
    setPendingN(m.size);
  };
  const handleServerState = (code?: string, message?: string) => {
    if (code === 'SUBMITTED') { setResult(x => x || { score: null, correct: null, total: qs.length, answered: Object.keys(ans).length, passed: null, reason: message }); setPhase('result'); }
    if (code === 'LOCKED' || code === 'OTHER_DEVICE') { setErr(message || 'Bài thi đang tạm khoá, chờ giám thị.'); setPhase('locked'); }
  };
  const choose = (qid: string, i: number) => {
    const cur = ans[qid];
    const v = cur === i ? null : i;              // bấm lại để bỏ chọn
    setAns(a => { const n = { ...a }; if (v === null) delete n[qid]; else n[qid] = v; return n; });
    pendingRef.current.set(qid, v); setPendingN(pendingRef.current.size);
    haptic(15);
    flush();
  };

  // ---------- Đồng hồ, giữ kết nối ----------
  useEffect(() => {
    if (phase !== 'exam') return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    const ping = window.setInterval(async () => {
      if (pendingRef.current.size) await flush();
      const r = await Learning.event(exam.id, 'PING');
      if (r.ok) { setOffline(false); if (r.deadline) setDeadline(Number(r.deadline)); if (r.serverNow) setOffset(Number(r.serverNow) - Date.now()); }
      else if (r.code === 'SUBMITTED' || r.code === 'LOCKED' || r.code === 'OTHER_DEVICE') handleServerState(r.code, r.message);
      else setOffline(true);
    }, 20000);
    return () => { window.clearInterval(t); window.clearInterval(ping); };
  }, [phase, exam.id]);
  const remain = deadline - (now + offset);
  useEffect(() => { if (phase === 'exam' && deadline && remain <= 0) submitRef.current('Hết giờ làm bài'); }, [phase, remain <= 0]);

  // ---------- Phát hiện rời màn hình ----------
  useEffect(() => {
    if (phase !== 'exam') return;
    let awayAt = 0;
    const isAway = () => document.visibilityState === 'hidden' || !document.hasFocus();
    const goAway = () => { if (!awayAt && isAway()) awayAt = Date.now(); };
    const comeBack = async () => {
      if (!awayAt || isAway()) return;
      const ms = Date.now() - awayAt; awayAt = 0;
      if (ms < AWAY_MIN_MS || phaseRef.current !== 'exam') return;
      haptic([60, 80, 60]);
      const r = await Learning.event(exam.id, 'LEAVE', ms);
      if (r.ok && r.submitted) { setWarn(null); submitRef.current(`Rời màn hình ${r.leaveCount} lần — bài đã tự nộp`); return; }
      if (r.ok) {
        leaveRef.current = r.leaveCount || 0;
        setLeave({ n: r.leaveCount || 0, max: r.maxLeave ?? exam.maxLeave });
        const left = (r.maxLeave || 0) - (r.leaveCount || 0);
        setWarn(`Bạn vừa rời màn hình bài thi ${Math.round(ms / 1000)} giây. Đã ghi nhận lần ${r.leaveCount}${r.maxLeave ? `/${r.maxLeave}` : ''}.${r.maxLeave ? left === 1 ? ' Rời thêm 1 lần nữa bài sẽ tự nộp.' : '' : ''}`);
      } else if (r.code === 'SUBMITTED' || r.code === 'LOCKED' || r.code === 'OTHER_DEVICE') handleServerState(r.code, r.message);
    };
    const onVis = () => (document.visibilityState === 'hidden' ? goAway() : comeBack());
    const onBlur = () => window.setTimeout(goAway, 0);
    const onFocus = () => window.setTimeout(comeBack, 0);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus);
    const block = (e: Event) => e.preventDefault();
    document.addEventListener('copy', block); document.addEventListener('cut', block); document.addEventListener('contextmenu', block);
    const before = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', before);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus);
      document.removeEventListener('copy', block); document.removeEventListener('cut', block); document.removeEventListener('contextmenu', block);
      window.removeEventListener('beforeunload', before);
    };
  }, [phase, exam.id]);

  const answeredN = qs.filter(q => ans[q.id] !== undefined).length;
  const q = qs[idx];

  // Chữ chìm: họ tên + tài khoản lặp chéo toàn màn hình (ảnh chụp màn hình lộ ngay người gửi)
  const watermark = useMemo(() => {
    const text = `${me.fullName} · ${me.username}`;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><text x='0' y='100' transform='rotate(-24 160 90)' font-family='sans-serif' font-size='15' font-weight='600' fill='rgba(17,24,39,0.07)'>${text.replace(/[<&>'"]/g, '')}</text></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [me.fullName, me.username]);

  const close = () => {
    if (phase === 'exam' && !window.confirm('Thoát ra khi đang thi sẽ bị tính là rời bài thi. Vẫn thoát?')) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { /* bỏ qua */ });
    onClose();
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[140] bg-[#eef0f4] flex flex-col select-none" data-testid="exam-taker" data-phase={phase}
        style={{ paddingTop: 'env(safe-area-inset-top)', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}>
        {/* Thanh trên */}
        <div className="bg-white border-b border-stone-200 h-14 px-3 flex items-center gap-2 shrink-0 relative">
          <div className="absolute inset-x-0 top-0 h-1 bg-brand-700" />
          {phase !== 'exam' ? <button onClick={close} className="p-2 -ml-1 rounded-lg hover:bg-stone-100" aria-label="Đóng"><ChevronLeft className="w-5 h-5" /></button>
            : <img src={LOGO_URL} alt="" className="w-8 h-8 object-contain" />}
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[15px] truncate">{exam.title}</div>
            {phase === 'exam' && <div className="text-[12px] text-stone-500">Đã làm <b className="text-stone-800" data-testid="exam-answered">{answeredN}/{qs.length}</b>{leave.n > 0 && <span className="text-orange-600 font-semibold"> · rời màn hình {leave.n}{leave.max ? `/${leave.max}` : ''}</span>}{s.watermark !== false ? ` · ${me.fullName}` : ''}</div>}
          </div>
          {phase === 'exam' && (
            <div className={`flex items-center gap-1.5 rounded-xl px-3 h-10 font-extrabold tabular text-lg ${remain < 60000 ? 'bg-red-600 text-white' : remain < 300000 ? 'bg-amber-100 text-amber-900' : 'bg-stone-900 text-white'}`} data-testid="exam-timer">
              <Clock className="w-4 h-4" />{fmtClock(remain)}
            </div>
          )}
        </div>
        {phase === 'exam' && (offline || pendingN > 0) && (
          <div className={`text-[12px] text-center py-1 ${offline ? 'bg-amber-100 text-amber-900' : 'bg-stone-100 text-stone-600'}`}>
            {offline ? <><WifiOff className="w-3.5 h-3.5 inline -mt-0.5" /> Mất kết nối — cứ làm tiếp, bài sẽ tự gửi khi có mạng ({pendingN} câu chờ gửi)</> : 'Đang lưu...'}
          </div>
        )}

        <div className="flex-1 overflow-y-auto" style={phase === 'exam' && s.watermark !== false ? { backgroundImage: watermark } : undefined}>
          {/* GIỚI THIỆU */}
          {(phase === 'intro' || phase === 'loading') && (
            <div className="max-w-lg mx-auto p-4 md:p-8">
              <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 text-brand-700 font-bold"><ShieldCheck className="w-5 h-5" />Quy định làm bài</div>
                <ul className="mt-3 space-y-2 text-[14px] text-stone-700">
                  <li>• <b>{exam.questionCount} câu</b> trắc nghiệm, <b>{exam.durationMin} phút</b>. Đồng hồ tính theo giờ máy chủ, hết giờ tự nộp.</li>
                  {s.shuffle !== false && <li>• Mỗi người một đề: câu hỏi và đáp án được đảo khác nhau.</li>}
                  {exam.maxLeave > 0
                    ? <li>• <b>Không rời màn hình bài thi</b> (chuyển ứng dụng, tắt màn hình, mở tab khác). Rời <b>{exam.maxLeave} lần</b> bài tự nộp.</li>
                    : <li>• Mọi lần rời màn hình bài thi đều được ghi lại và báo giám thị.</li>}
                  {s.oneDevice !== false && <li>• Mỗi bài thi chỉ làm trên <b>một thiết bị</b>. Đăng nhập máy khác giữa chừng bài sẽ bị khoá.</li>}
                  {s.watermark !== false && <li>• Đề có chữ chìm họ tên của bạn; không sao chép được nội dung.</li>}
                  <li>• Mất mạng vẫn làm tiếp; bài tự gửi khi có mạng lại.</li>
                </ul>
                {err && <div className="mt-4 rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2" data-testid="exam-error">{err}</div>}
                <div className="mt-5">
                  {exam.mode === 'HALL'
                    ? <button className={`${btnPrimary} w-full h-12 text-base`} onClick={() => { setErr(''); setPhase('scan'); }} disabled={phase === 'loading'} data-testid="btn-scan-room"><QrCode className="w-5 h-5" />Quét mã QR phòng thi</button>
                    : <button className={`${btnPrimary} w-full h-12 text-base`} onClick={() => start(null)} disabled={phase === 'loading'} data-testid="btn-start-exam">{phase === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" /> : null}Bắt đầu làm bài</button>}
                  {exam.mode === 'HALL' && <p className="text-[12px] text-stone-500 text-center mt-2">Quét mã đang chiếu trên màn hình hội trường để vào bài.</p>}
                </div>
              </div>
            </div>
          )}

          {/* QUÉT MÃ PHÒNG THI */}
          {phase === 'scan' && (
            <div className="max-w-lg mx-auto p-4">
              {err && <div className="mb-3 rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2" data-testid="exam-error">{err}</div>}
              <QrScanBox hint="Ngồi xa thì bấm 2× hoặc 4×" onClose={() => setPhase('intro')} onText={t => start(t.trim())} />
              <p className="text-center text-sm text-stone-600 mt-3">Hướng camera vào mã QR phòng thi trên màn hình chiếu.</p>
            </div>
          )}

          {/* BỊ KHOÁ */}
          {phase === 'locked' && (
            <div className="max-w-lg mx-auto p-6 text-center" data-testid="exam-locked">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 text-red-600 flex items-center justify-center"><Lock className="w-7 h-7" /></div>
              <div className="text-lg font-bold mt-3">Bài thi đang tạm khoá</div>
              <p className="text-stone-600 mt-1">{err}</p>
              <button className={`${btnPrimary} mt-5`} onClick={() => start(null)}>Thử vào lại</button>
            </div>
          )}

          {/* LÀM BÀI */}
          {phase === 'exam' && q && (
            <div className="max-w-2xl mx-auto p-4 pb-40" onCopy={e => e.preventDefault()}>
              <div className="text-[13px] font-bold text-stone-500 mb-1.5">Câu {idx + 1}/{qs.length}</div>
              <div className="text-[17px] font-semibold text-stone-900 leading-snug mb-4" data-testid="exam-question" data-qid={q.id}>{q.text}</div>
              <div className="space-y-2.5">
                {q.options.map((o, k) => {
                  const on = ans[q.id] === o.i;
                  return (
                    <button key={o.i} onClick={() => choose(q.id, o.i)} data-testid="exam-option" data-i={o.i} aria-pressed={on}
                      className={`w-full text-left flex items-start gap-3 rounded-xl border-2 px-3.5 py-3.5 bg-white/95 transition-colors ${on ? 'border-brand-700 bg-brand-50' : 'border-stone-200 hover:border-stone-400'}`}>
                      <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold ${on ? 'bg-brand-700 text-white' : 'bg-stone-100 text-stone-700'}`}>{LETTERS[k]}</span>
                      <span className="pt-1 text-[15px] text-stone-800">{o.t}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* KẾT QUẢ */}
          {phase === 'result' && result && (
            <div className="max-w-md mx-auto p-6 text-center" data-testid="exam-result">
              <div className="flex justify-center"><ResultMark ok={result.passed !== false} /></div>
              <div className="text-xl font-bold mt-3">Đã nộp bài</div>
              {result.reason && <p className="text-sm text-stone-500 mt-1">{result.reason}</p>}
              {result.score !== null && result.score !== undefined ? (
                <div className="mt-4 bg-white rounded-2xl border border-stone-200 p-5">
                  <div className="text-5xl font-extrabold tabular" data-testid="exam-score">{fmtScore(result.score)}</div>
                  <div className="text-stone-500 mt-1">điểm · đúng {result.correct}/{result.total} câu</div>
                  <div className={`inline-block mt-3 text-sm font-bold rounded-full px-3 py-1 ${result.passed ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{grade(result.score, exam.passScore).label}</div>
                </div>
              ) : <p className="text-stone-600 mt-3">Kết quả sẽ có khi hội đồng công bố.</p>}
              <button className={`${btnSecondary} mt-6`} onClick={onClose} data-testid="exam-done">Xong</button>
            </div>
          )}
        </div>

        {/* Thanh dưới khi làm bài */}
        {phase === 'exam' && (
          <div className="bg-white border-t border-stone-200 px-3 pt-2.5 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <div className="max-w-2xl mx-auto">
              <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1" aria-label="Danh sách câu">
                {qs.map((x, i) => (
                  <button key={x.id} onClick={() => setIdx(i)} className={`shrink-0 w-8 h-8 rounded-lg text-[12px] font-bold ${i === idx ? 'ring-2 ring-stone-900' : ''} ${ans[x.id] !== undefined ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600'}`}>{i + 1}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <button className={btnSecondary} onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0} aria-label="Câu trước"><ChevronLeft className="w-4 h-4" /></button>
                <button className={btnSecondary} onClick={() => setPalette(true)} aria-label="Xem tất cả câu"><Grid3x3 className="w-4 h-4" /></button>
                {idx < qs.length - 1
                  ? <button className={`${btnPrimary} flex-1`} onClick={() => setIdx(i => i + 1)} data-testid="exam-next">Câu tiếp <ChevronRight className="w-4 h-4" /></button>
                  : <button className={`${btnPrimary} flex-1`} onClick={() => setConfirm(true)} data-testid="exam-submit">Nộp bài</button>}
              </div>
              {idx < qs.length - 1 && <button className="w-full text-center text-[13px] font-semibold text-stone-500 mt-1.5" onClick={() => setConfirm(true)} data-testid="exam-submit-early">Nộp bài</button>}
            </div>
          </div>
        )}

        {/* Bảng câu */}
        {palette && (
          <div className="fixed inset-0 z-[150] bg-stone-900/50 flex items-end md:items-center justify-center" {...backdropClose(() => setPalette(false))}>
            <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-4" onClick={e => e.stopPropagation()} style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <div className="font-bold mb-3">Đã làm {answeredN}/{qs.length} câu</div>
              <div className="grid grid-cols-6 gap-2">
                {qs.map((x, i) => <button key={x.id} onClick={() => { setIdx(i); setPalette(false); }} className={`h-10 rounded-lg font-bold text-sm ${ans[x.id] !== undefined ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-700'} ${i === idx ? 'ring-2 ring-stone-900' : ''}`}>{i + 1}</button>)}
              </div>
            </div>
          </div>
        )}

        {/* Xác nhận nộp */}
        {confirm && (
          <div className="fixed inset-0 z-[150] bg-stone-900/50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl p-5 text-center" data-testid="exam-confirm">
              <div className="text-lg font-bold">Nộp bài?</div>
              <p className="text-stone-600 mt-1">Đã làm {answeredN}/{qs.length} câu.{answeredN < qs.length && <b className="text-red-700"> Còn {qs.length - answeredN} câu chưa làm.</b>}</p>
              {err && <p className="text-sm text-red-700 mt-2">{err}</p>}
              <div className="flex gap-2 mt-5">
                <button className={`${btnSecondary} flex-1`} onClick={() => setConfirm(false)}>Làm tiếp</button>
                <button className={`${btnPrimary} flex-1`} onClick={() => submit()} data-testid="exam-confirm-submit">Nộp bài</button>
              </div>
            </div>
          </div>
        )}

        {/* Cảnh báo rời màn hình */}
        {warn && phase === 'exam' && (
          <div className="fixed inset-0 z-[150] bg-stone-900/60 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl p-5 text-center anim-shake" data-testid="exam-warning">
              <div className="w-12 h-12 mx-auto rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center"><AlertTriangle className="w-6 h-6" /></div>
              <div className="text-lg font-bold mt-2">Cảnh báo</div>
              <p className="text-stone-700 mt-1">{warn}</p>
              <p className="text-[12px] text-stone-500 mt-2">Giám thị đã nhận được thông tin này.</p>
              <button className={`${btnPrimary} w-full mt-4`} onClick={() => setWarn(null)} data-testid="exam-warning-ok"><CheckCircle2 className="w-4 h-4" />Tôi đã hiểu, làm tiếp</button>
            </div>
          </div>
        )}
      </div>
    </Portal>
  );
};
