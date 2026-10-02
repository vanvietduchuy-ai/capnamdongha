import React, { useEffect, useRef, useState } from 'react';
import { driveId, youtubeId } from '../../lib/exam';
import { VideoKind } from '../../types';

/**
 * Trình phát video bài học, đo phần đã xem thật:
 *  - YouTube (để chế độ "Không công khai") và tệp tải lên kho của app: đếm từng giây đã xem,
 *    không cho tua vượt quá đoạn đã xem (+3 giây).
 *  - Google Drive: chỉ phát, không đo được → bài không bắt buộc "xem hết video".
 */
interface Props {
  url: string;
  kind: VideoKind;
  initialPct: number;
  onProgress: (pct: number) => void;
  onPlaying: (playing: boolean) => void;
}

declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void; } }

let ytLoading: Promise<any> | null = null;
const loadYT = () => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytLoading) {
    ytLoading = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { ytLoading = null; reject(new Error('Không tải được trình phát YouTube')); };
      document.head.appendChild(s);
    });
  }
  return ytLoading;
};

/** Vị trí đang xem, lưu trên máy (chỉ để xem tiếp; % đã xem vẫn tính trên máy chủ) */
const posKey = (url: string) => 'vp-pos:' + url;
const loadPos = (url: string): number => { try { return Number(localStorage.getItem(posKey(url))) || 0; } catch { return 0; } };
const savePos = (url: string, t: number) => { try { if (t > 0) localStorage.setItem(posKey(url), String(Math.floor(t))); else localStorage.removeItem(posKey(url)); } catch { /* bỏ qua */ } };
export const fmtClock = (sec: number) => { const s = Math.max(0, Math.floor(sec)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0'); };

export const VideoPlayer: React.FC<Props> = ({ url, kind, initialPct, onProgress, onPlaying }) => {
  const watched = useRef<Set<number>>(new Set());
  const maxOk = useRef(0);            // được tua tới đây
  const dur = useRef(0);
  const lastPct = useRef(initialPct);
  const cbs = useRef({ onProgress, onPlaying }); cbs.current = { onProgress, onPlaying };
  const [warn, setWarn] = useState('');
  const [err, setErr] = useState('');
  // YouTube: hiện ảnh bìa + nút phát của app; chỉ tạo trình phát YouTube khi người học bấm phát
  // → không còn màn chờ của YouTube (tiêu đề, kênh, nút chia sẻ, "Xem trên YouTube").
  // Hết video: gỡ trình phát, hiện màn kết thúc của app (không hiện video đề xuất).
  const [ytOn, setYtOn] = useState(false);
  const [ytEnded, setYtEnded] = useState(false);
  const [thumb, setThumb] = useState(0);
  const fromStart = useRef(false);     // người học chọn "Xem từ đầu"
  const [saved, setSaved] = useState(() => loadPos(url));
  const [resumed, setResumed] = useState('');
  useEffect(() => { setYtOn(false); setYtEnded(false); setThumb(0); setSaved(loadPos(url)); fromStart.current = false; }, [url]);
  const flash = (msg: string) => { setResumed(msg); window.setTimeout(() => setResumed(''), 3500); };

  const mark = (t: number, d: number) => {
    if (!d || !isFinite(d)) return;
    if (!dur.current) setDur(d);
    watched.current.add(Math.floor(t));
    maxOk.current = Math.max(maxOk.current, t);
    const pct = Math.min(100, Math.max(initialPct, Math.round((watched.current.size / Math.max(1, Math.floor(d))) * 100 + (initialPct >= 100 ? 0 : 0))));
    // Xem trọn đến cuối thì tính 100%
    const p = t >= d - 1.5 && watched.current.size / Math.max(1, Math.floor(d)) > 0.85 ? 100 : pct;
    if (p > lastPct.current) { lastPct.current = p; cbs.current.onProgress(p); }
  };
  /** Biết thời lượng lần đầu: coi như đã xem liền từ đầu đến mức % máy chủ đã ghi
   *  (không tua được qua đoạn chưa xem nên phần đã xem luôn liền từ đầu) → % cộng dồn qua các lần mở */
  const setDur = (d: number) => {
    if (dur.current || !d || !isFinite(d)) return;
    dur.current = d;
    const upTo = Math.floor((Math.min(100, initialPct) / 100) * d);
    for (let i = 0; i < upTo; i++) watched.current.add(i);
    maxOk.current = Math.max(maxOk.current, upTo);
  };
  /** Chỗ xem tiếp: vị trí lưu trên máy, không vượt quá phần đã xem; máy khác thì lấy theo % máy chủ */
  const resumeAt = (d: number) => {
    const local = loadPos(url);
    const t = local > 0 ? Math.min(local, maxOk.current) : (initialPct > 0 && initialPct < 97 ? (initialPct / 100) * d : 0);
    return t > 5 && t < d - 5 ? Math.floor(t - 2) : 0;
  };
  const lastSave = useRef(0);
  const keepPos = (t: number, d: number, force = false) => {
    if (!d) return;
    if (t >= d - 3) { savePos(url, 0); return; }
    if (force || Math.abs(t - lastSave.current) >= 5) { lastSave.current = t; savePos(url, t); }
  };
  const tooFar = (t: number) => t > maxOk.current + 3;
  const showWarn = () => { setWarn('Chưa xem đến đoạn này — không tua qua phần chưa xem.'); window.setTimeout(() => setWarn(''), 2500); };

  // ---------- YouTube ----------
  const ytBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (kind !== 'YOUTUBE') return;
    const id = youtubeId(url);
    if (!id) { setErr('Link YouTube không hợp lệ.'); return; }
    if (!ytOn) return;
    let player: any; let timer: number | undefined; let alive = true;
    loadYT().then(YT => {
      if (!alive || !ytBox.current) return;
      player = new YT.Player(ytBox.current, {
        videoId: id, width: '100%', height: '100%',
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, iv_load_policy: 3, fs: 1, cc_load_policy: 0 },
        events: {
          onReady: (e: any) => {
            try {
              const d = e.target.getDuration?.() || 0;
              setDur(d);
              const at = fromStart.current ? 0 : resumeAt(d);
              if (at > 0) { e.target.seekTo(at, true); flash(`Xem tiếp từ ${fmtClock(at)}`); }
              e.target.playVideo();
            } catch { /* trình duyệt chặn tự phát: người học bấm phát lần nữa */ }
          },
          onStateChange: (e: any) => {
            if (e.data === 0) { // hết video
              const d = player.getDuration?.() || 0; if (d) mark(d, d);
              savePos(url, 0); setSaved(0);
              window.clearInterval(timer); cbs.current.onPlaying(false);
              setYtEnded(true); setYtOn(false);
              return;
            }
            const playing = e.data === 1;
            cbs.current.onPlaying(playing);
            window.clearInterval(timer);
            if (e.data === 2) keepPos(player.getCurrentTime?.() || 0, player.getDuration?.() || 0, true);
            if (playing) {
              timer = window.setInterval(() => {
                const t = player.getCurrentTime?.() || 0, d = player.getDuration?.() || 0;
                if (dur.current && tooFar(t)) { player.seekTo(maxOk.current, true); showWarn(); return; }
                mark(t, d); keepPos(t, d);
              }, 1000);
            }
          }
        }
      });
    }).catch(() => setErr('Không tải được YouTube. Kiểm tra mạng.'));
    return () => {
      alive = false; window.clearInterval(timer);
      try { const t = player?.getCurrentTime?.() || 0, d = player?.getDuration?.() || 0; keepPos(t, d, true); setSaved(loadPos(url)); } catch { /* bỏ qua */ }
      try { player?.destroy?.(); } catch { /* bỏ qua */ } cbs.current.onPlaying(false);
    };
  }, [url, kind, ytOn]);

  // ---------- Tệp video ----------
  const vRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (kind !== 'FILE') return;
    const v = vRef.current; if (!v) return;
    const onTime = () => { if (!v.seeking) { mark(v.currentTime, v.duration); keepPos(v.currentTime, v.duration); } };
    const onSeek = () => { if (dur.current && tooFar(v.currentTime)) { v.currentTime = maxOk.current; showWarn(); } };
    const onPlay = () => cbs.current.onPlaying(true);
    const onPause = () => { cbs.current.onPlaying(false); keepPos(v.currentTime, v.duration, true); };
    const onEnd = () => { cbs.current.onPlaying(false); savePos(url, 0); };
    const onMeta = () => {
      setDur(v.duration);
      const at = resumeAt(v.duration);
      if (at > 0) { v.currentTime = at; flash(`Xem tiếp từ ${fmtClock(at)}`); }
    };
    v.addEventListener('timeupdate', onTime); v.addEventListener('seeking', onSeek);
    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause); v.addEventListener('ended', onEnd);
    v.addEventListener('loadedmetadata', onMeta);
    return () => {
      v.removeEventListener('timeupdate', onTime); v.removeEventListener('seeking', onSeek);
      v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); v.removeEventListener('ended', onEnd);
      v.removeEventListener('loadedmetadata', onMeta); keepPos(v.currentTime, v.duration, true); cbs.current.onPlaying(false);
    };
  }, [url, kind]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-stone-900 aspect-video" data-testid="lesson-video" data-kind={kind}>
      {kind === 'YOUTUBE' && ytOn && <div className="absolute inset-0"><div ref={ytBox} className="w-full h-full" /></div>}
      {kind === 'YOUTUBE' && !ytOn && !err && youtubeId(url) && (
        <button type="button" onClick={() => { fromStart.current = ytEnded; setYtEnded(false); setYtOn(true); }} className="absolute inset-0 w-full h-full group" aria-label={ytEnded ? 'Xem lại video' : 'Phát video'} data-testid="yt-cover">
          {!ytEnded && thumb < 2 && <img src={`https://i.ytimg.com/vi/${youtubeId(url)}/${thumb === 0 ? 'maxresdefault' : 'hqdefault'}.jpg`} alt=""
            onLoad={e => { if ((e.currentTarget as HTMLImageElement).naturalWidth <= 120) setThumb(t => t + 1); }} onError={() => setThumb(t => t + 1)}
            className="absolute inset-0 w-full h-full object-cover" draggable={false} />}
          <span className={`absolute inset-0 ${ytEnded ? 'bg-stone-900' : 'bg-black/25 group-hover:bg-black/35'} transition-colors`} />
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <span className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-brand-700 group-hover:scale-105 transition-transform flex items-center justify-center shadow-xl">
              {ytEnded
                ? <svg viewBox="0 0 24 24" className="w-8 h-8 md:w-10 md:h-10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                : <svg viewBox="0 0 24 24" className="w-8 h-8 md:w-10 md:h-10 ml-1" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>}
            </span>
            <span className="text-sm font-semibold drop-shadow" data-testid="yt-cover-label">{ytEnded ? 'Đã xem hết video · Xem lại'
              : saved > 5 ? `Xem tiếp từ ${fmtClock(saved)}`
              : initialPct > 0 && initialPct < 97 ? `Xem tiếp (đã xem ${initialPct}%)` : 'Bấm để phát video'}</span>
          </span>
        </button>
      )}
      {kind === 'YOUTUBE' && !ytOn && !ytEnded && !err && (saved > 5 || (initialPct > 0 && initialPct < 97)) && (
        <button type="button" onClick={() => { fromStart.current = true; setYtOn(true); }} data-testid="yt-from-start"
          className="absolute bottom-3 right-3 h-9 px-3 rounded-lg bg-black/60 hover:bg-black/75 text-white text-[13px] font-semibold">Xem từ đầu</button>
      )}
      {resumed && <div className="absolute bottom-14 left-1/2 -translate-x-1/2 text-[13px] font-semibold bg-black/70 text-white rounded-lg px-3 py-1.5 pointer-events-none" data-testid="resume-toast">{resumed}</div>}
      {kind === 'FILE' && <video ref={vRef} src={url} controls playsInline controlsList="nodownload noplaybackrate" disablePictureInPicture
        onContextMenu={e => e.preventDefault()} className="absolute inset-0 w-full h-full bg-black" />}
      {kind === 'DRIVE' && (driveId(url)
        ? <iframe title="Video bài học" src={`https://drive.google.com/file/d/${driveId(url)}/preview`} allow="autoplay; fullscreen" className="absolute inset-0 w-full h-full border-0" />
        : <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">Link Google Drive không hợp lệ.</div>)}
      {err && <div className="absolute inset-0 flex items-center justify-center text-white/90 text-sm p-4 text-center">{err}</div>}
      {warn && <div className="absolute top-2 inset-x-2 text-center text-[13px] font-semibold bg-black/70 text-white rounded-lg px-3 py-1.5">{warn}</div>}
    </div>
  );
};
