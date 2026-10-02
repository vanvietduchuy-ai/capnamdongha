import { useCallback, useRef } from 'react';
import type React from 'react';
import { QuizQuestion } from '../types';

/** Bỏ dấu tiếng Việt, chữ thường — để tìm "can cuoc" vẫn ra "Căn cước" */
export const fold = (s: string | null | undefined): string =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();

const haystack = new WeakMap<QuizQuestion, string>();
const hay = (q: QuizQuestion) => {
  let h = haystack.get(q);
  if (h === undefined) {
    h = fold([q.text, q.options.join(' '), q.topic, q.level, q.explanation, q.source].filter(Boolean).join(' \n '));
    haystack.set(q, h);
  }
  return h;
};

/**
 * Tìm câu hỏi: không phân biệt dấu, hoa thường; nhiều từ thì câu phải chứa đủ các từ.
 * "#12" tìm theo số thứ tự; cụm trong ngoặc kép "..." tìm nguyên cụm.
 */
export const makeQuestionMatcher = (query: string) => {
  const raw = query.trim();
  if (!raw) return () => true;
  const stt = raw.match(/^#\s*(\d+)$/);
  if (stt) { const n = Number(stt[1]); return (q: QuizQuestion) => q.stt === n; }
  const terms: string[] = [];
  fold(raw).replace(/"([^"]+)"|(\S+)/g, (_, p, w) => { terms.push((p || w).trim()); return ''; });
  return (q: QuizQuestion) => { const h = hay(q); return terms.every(t => h.includes(t)); };
};

/**
 * Chọn nhiều bằng Shift: bấm 1 câu, giữ Shift bấm câu khác → chọn/bỏ cả đoạn ở giữa
 * (theo trạng thái của câu vừa bấm). Trả về hàm xử lý bấm.
 */
export const useRangeToggle = (orderedIds: string[], selected: Set<string>, apply: (ids: string[], on: boolean) => void) => {
  const last = useRef<string | null>(null);
  return useCallback((id: string, e?: React.MouseEvent | React.KeyboardEvent) => {
    const on = !selected.has(id);
    if (e?.shiftKey && last.current && last.current !== id) {
      const a = orderedIds.indexOf(last.current), b = orderedIds.indexOf(id);
      if (a >= 0 && b >= 0) {
        apply(orderedIds.slice(Math.min(a, b), Math.max(a, b) + 1), on);
        last.current = id;
        return;
      }
    }
    apply([id], on);
    last.current = id;
  }, [orderedIds, selected, apply]);
};

/** Đang bôi đen chữ thì không coi cú bấm là chọn/bỏ chọn */
export const isSelectingText = () => !!window.getSelection()?.toString();
