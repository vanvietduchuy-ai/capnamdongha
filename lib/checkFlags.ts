import { CheckFlag, CheckInAttempt } from '../types';

/** Nhãn dễ hiểu cho các cờ chống điểm danh hộ. tone: 'red' = nghi vấn cao, 'amber' = cần xem, 'gray' = thông tin */
export const flagLabel = (f: CheckFlag): { text: string; tone: 'red' | 'amber' | 'gray' } => {
  const who = f.refName ? ` ${f.refName}` : '';
  switch (f.code) {
    case 'FACE_LIKE_OTHER': return { text: `Trùng khuôn mặt với${who}`, tone: 'red' };
    case 'FACE_DUP_ENROLL': return { text: `Ảnh mẫu trùng mặt tài khoản${who}`, tone: 'red' };
    case 'SAME_DEVICE': return { text: `Cùng 1 máy với${who} (khác trình duyệt)`, tone: 'red' };
    case 'DEVICE_OF_OTHER': return { text: `Máy đang gắn với tài khoản${who}`, tone: 'red' };
    case 'IP_BAD': return { text: `IP VPN/proxy:${who}`, tone: 'red' };
    case 'FACE_WEAK': return { text: `Khuôn mặt khớp thấp${f.refName ? ` (${f.refName})` : ''}`, tone: 'amber' };
    case 'FACE_NONE': return { text: `Không có ảnh khuôn mặt${f.refName ? `: ${f.refName}` : ''}`, tone: 'amber' };
    case 'FACE_FILE': return { text: 'Ảnh chụp bằng ứng dụng camera', tone: 'amber' };
    case 'FACE_NOLIVE': return { text: 'Chưa qua bước quay đầu', tone: 'amber' };
    case 'FACE_ENROLL': return { text: 'Lần đầu: ảnh mẫu chờ xác nhận', tone: 'amber' };
    case 'DEVICE_CHANGE_LIMIT': return { text: `Đổi máy nhiều lần (${f.refName || '2'} máy/30 ngày)`, tone: 'amber' };
    case 'DEVICE_NEW': return { text: 'Máy mới', tone: 'gray' };
    case 'IP_UNCHECKED': return { text: 'Chưa kiểm tra được IP', tone: 'gray' };
    case 'MANUAL_OK': return { text: `Ban tổ chức cho điểm danh${f.refName ? ` (${f.refName})` : ''}`, tone: 'gray' };
    default: return { text: String((f as any).code || ''), tone: 'gray' };
  }
};

export const toneClass = { red: 'bg-red-50 text-red-800 border-red-200', amber: 'bg-amber-50 text-amber-900 border-amber-200', gray: 'bg-stone-100 text-stone-600 border-stone-200' };

export const attemptLabel = (a: CheckInAttempt): string => {
  switch (a.reason) {
    case 'IP_BLOCKED': return `Chặn do VPN/proxy${a.detail ? `: ${a.detail}` : ''}`;
    case 'FACE_MISMATCH': return `Khuôn mặt không khớp ảnh mẫu${a.faceDist != null ? ` (${a.faceDist.toFixed(2)})` : ''}`;
    case 'FACE_REQUIRED': return 'Không chụp được khuôn mặt';
    case 'REJECTED_BY_REVIEW': return a.detail || 'Ban tổ chức đã loại';
    default: return a.reason;
  }
};
