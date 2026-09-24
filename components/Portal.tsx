import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Đưa lớp phủ (hộp thoại, nút nổi) ra thẳng <body> để không bị khung cha che/cắt */
export const Portal = ({ children }: { children: ReactNode }) =>
  typeof document === 'undefined' ? null : createPortal(children, document.body);
