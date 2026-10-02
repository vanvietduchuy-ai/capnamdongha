import { useCallback, useEffect, useRef, useState } from 'react';
import { loiDe } from './supabase';

// Tải dữ liệu bất đồng bộ + tự tải lại khi quay lại tab
export function useDuLieu<T>(tai: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const taiRef = useRef(tai);
  taiRef.current = tai;

  const taiLai = useCallback(async () => {
    setDangTai(true);
    try { setData(await taiRef.current()); setLoi(null); }
    catch (e) { setLoi(loiDe(e)); }
    finally { setDangTai(false); }
  }, []);

  useEffect(() => { void taiLai(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'visible') void taiLai(); };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [taiLai]);

  return { data, loi, dangTai, taiLai, setData };
}

// Đồng hồ: cập nhật mỗi giây
export function useBayGio(chuKy = 1000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), chuKy); return () => clearInterval(i); }, [chuKy]);
  return t;
}

// Ném lỗi Supabase thành Error để useDuLieu bắt
export function kq<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw new Error(loiDe(r.error));
  return r.data as T;
}
