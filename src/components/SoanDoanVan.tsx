// Ô soạn thảo "như trên giấy": mỗi đoạn văn là một ô tự giãn, lùi đầu dòng riêng từng đoạn.
// Enter tách đoạn, Backspace đầu đoạn gộp với đoạn trên, mũi tên lên/xuống đi giữa các đoạn, dán nhiều dòng tự tách đoạn.
import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';

const gian = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = '0px';
  el.style.height = `${el.scrollHeight}px`;
};

const LOP_O = 'block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none transition-colors placeholder:italic placeholder:text-[#A8A29E] hover:bg-[#FFFBEB] focus:bg-[#FEF3C7]/60 disabled:bg-transparent';

// Ô chữ một khối (tiêu đề, chức danh…): tự giãn theo nội dung; dong1 = không cho xuống dòng
export function OChu({ value, onChange, style, placeholder, dong1, nhan, rong }: {
  value: string; onChange: (v: string) => void; style?: CSSProperties; placeholder?: string; dong1?: boolean; nhan: string; rong: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => gian(ref.current), [value, rong, style?.fontSize]);
  return (
    <textarea ref={ref} rows={1} aria-label={nhan} spellCheck={false} className={LOP_O} style={style}
      placeholder={placeholder} value={value}
      onKeyDown={(e) => { if (dong1 && e.key === 'Enter') e.preventDefault(); }}
      onChange={(e) => onChange(dong1 ? e.target.value.replace(/\n+/g, ' ') : e.target.value)} />
  );
}

export default function SoanDoanVan({ value, onChange, placeholder, nhan, rong, kieuDoan, kieuTheoDong }: {
  value: string; onChange: (v: string) => void; placeholder?: string; nhan: string; rong: number; kieuDoan: CSSProperties;
  kieuTheoDong?: (dong: string) => CSSProperties;          // định dạng riêng từng đoạn (đề mục in đậm…)
}) {
  const doan = value.split('\n');
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const cho = useRef<{ i: number; vt: number } | null>(null);
  refs.current.length = doan.length;

  useLayoutEffect(() => {
    refs.current.forEach(gian);
    const c = cho.current;
    if (c) {
      const el = refs.current[c.i];
      if (el) { el.focus(); el.setSelectionRange(c.vt, c.vt); }
      cho.current = null;
    }
  });
  useLayoutEffect(() => refs.current.forEach(gian), [rong]);

  const dat = (ds: string[], i: number, vt: number) => { cho.current = { i, vt }; onChange(ds.join('\n')); };

  const phim = (e: KeyboardEvent<HTMLTextAreaElement>, i: number) => {
    const el = e.currentTarget; const a = el.selectionStart, b = el.selectionEnd;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const ds = [...doan]; const t = ds[i];
      ds.splice(i, 1, t.slice(0, a), t.slice(b));
      dat(ds, i + 1, 0);
    } else if (e.key === 'Backspace' && a === 0 && b === 0 && i > 0) {
      e.preventDefault();
      const ds = [...doan]; const vt = ds[i - 1].length;
      ds.splice(i - 1, 2, ds[i - 1] + ds[i]);
      dat(ds, i - 1, vt);
    } else if (e.key === 'Delete' && a === el.value.length && b === a && i < doan.length - 1) {
      e.preventDefault();
      const ds = [...doan];
      ds.splice(i, 2, ds[i] + ds[i + 1]);
      dat(ds, i, a);
    } else if (e.key === 'ArrowUp' && a === 0 && b === 0 && i > 0) {
      e.preventDefault(); const el2 = refs.current[i - 1]; el2?.focus(); el2?.setSelectionRange(el2.value.length, el2.value.length);
    } else if (e.key === 'ArrowDown' && a === el.value.length && i < doan.length - 1) {
      e.preventDefault(); const el2 = refs.current[i + 1]; el2?.focus(); el2?.setSelectionRange(0, 0);
    }
  };

  const doi = (i: number, v: string) => {
    const ds = [...doan];
    if (v.includes('\n')) {                                 // dán nhiều dòng
      const moi = v.replace(/\r/g, '').split('\n');
      ds.splice(i, 1, ...moi);
      dat(ds, i + moi.length - 1, moi[moi.length - 1].length);
    } else { ds[i] = v; onChange(ds.join('\n')); }
  };

  return (
    <div>
      {doan.map((t, i) => (
        <textarea key={i} ref={(el) => { refs.current[i] = el; }} rows={1} spellCheck={false}
          aria-label={i === 0 ? nhan : `${nhan}, đoạn ${i + 1}`}
          className={LOP_O} style={kieuTheoDong ? { ...kieuDoan, ...kieuTheoDong(t) } : kieuDoan}
          placeholder={i === 0 && doan.length === 1 ? placeholder : undefined}
          value={t} onKeyDown={(e) => phim(e, i)} onChange={(e) => doi(i, e.target.value)} />
      ))}
    </div>
  );
}
