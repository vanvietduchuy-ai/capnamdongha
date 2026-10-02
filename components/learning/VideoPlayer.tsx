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

export const VideoPlayer: React.FC<Props> = ({ url, kind, initialPct, onProgress, onPlaying }) => {
  const watched = useRef<Set<number>>(new Set());
  const maxOk = useRef(0);            // được tua tới đây
  const dur = useRef(0);
  const lastPct = useRef(initialPct);
  const cbs = useRef({ onProgress, onPlaying }); cbs.current = { onProgress, onPlaying };
  const [warn, setWarn] = useState('');
  const [err, setErr] = useState('');

  const mark = (t: number, d: number) => {
    if (!d || !isFinite(d)) return;
    if (!dur.current) { dur.current = d; maxOk.current = Math.max(maxOk.current, (initialPct / 100) * d); }
    watched.current.add(Math.floor(t));
    maxOk.current = Math.max(maxOk.current, t);
    const pct = Math.min(100, Math.max(initialPct, Math.round((watched.current.size / Math.max(1, Math.floor(d))) * 100 + (initialPct >= 100 ? 0 : 0))));
    // Xem trọn đến cuối thì tính 100%
    const p = t >= d - 1.5 && watched.current.size / Math.max(1, Math.floor(d)) > 0.85 ? 100 : pct;
    if (p > lastPct.current) { lastPct.current = p; cbs.current.onProgress(p); }
  };
  const tooFar = (t: number) => t > maxOk.current + 3;
  const showWarn = () => { setWarn('Chưa xem đến đoạn này — không tua qua phần chưa xem.'); window.setTimeout(() => setWarn(''), 2500); };

  // ---------- YouTube ----------
  const ytBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (kind !== 'YOUTUBE') return;
    const id = youtubeId(url);
    if (!id) { setErr('Link YouTube không hợp lệ.'); return; }
    let player: any; let timer: number | undefined; let alive = true;
    loadYT().then(YT => {
      if (!alive || !ytBox.current) return;
      player = new YT.Player(ytBox.current, {
        videoId: id, width: '100%', height: '100%',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1 },
        events: {
          onStateChange: (e: any) => {
            const playing = e.data === 1;
            cbs.current.onPlaying(playing);
            window.clearInterval(timer);
            if (playing) {
              timer = window.setInterval(() => {
                const t = player.getCurrentTime?.() || 0, d = player.getDuration?.() || 0;
                if (dur.current && tooFar(t)) { player.seekTo(maxOk.current, true); showWarn(); return; }
                mark(t, d);
              }, 1000);
            }
          }
        }
      });
    }).catch(() => setErr('Không tải được YouTube. Kiểm tra mạng.'));
    return () => { alive = false; window.clearInterval(timer); try { player?.destroy?.(); } catch { /* bỏ qua */ } cbs.current.onPlaying(false); };
  }, [url, kind]);

  // ---------- Tệp video ----------
  const vRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (kind !== 'FILE') return;
    const v = vRef.current; if (!v) return;
    const onTime = () => { if (!v.seeking) mark(v.currentTime, v.duration); };
    const onSeek = () => { if (dur.current && tooFar(v.currentTime)) { v.currentTime = maxOk.current; showWarn(); } };
    const onPlay = () => cbs.current.onPlaying(true);
    const onPause = () => cbs.current.onPlaying(false);
    const onMeta = () => { dur.current = v.duration; maxOk.current = Math.max(maxOk.current, (initialPct / 100) * v.duration); };
    v.addEventListener('timeupdate', onTime); v.addEventListener('seeking', onSeek);
    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause); v.addEventListener('ended', onPause);
    v.addEventListener('loadedmetadata', onMeta);
    return () => {
      v.removeEventListener('timeupdate', onTime); v.removeEventListener('seeking', onSeek);
      v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); v.removeEventListener('ended', onPause);
      v.removeEventListener('loadedmetadata', onMeta); cbs.current.onPlaying(false);
    };
  }, [url, kind]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-stone-900 aspect-video" data-testid="lesson-video" data-kind={kind}>
      {kind === 'YOUTUBE' && <div className="absolute inset-0"><div ref={ytBox} className="w-full h-full" /></div>}
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
