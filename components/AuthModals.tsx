import React, { useState, useEffect, useRef } from 'react';
import { X, Mail, CheckCircle2, KeyRound } from 'lucide-react';
import { Button, Input } from './UI';
import { MockDB } from '../services/mockDatabase';

/** Ô nhập mã OTP 6 số dùng chung */
const OtpInput: React.FC<{ value: string; onChange: (v: string) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="relative">
      <input
        ref={ref}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        disabled={disabled}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="––––––"
        className="w-full text-center tracking-[0.6em] text-2xl font-bold py-3 border-2 border-stone-200 rounded-xl
                   focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 bg-white text-stone-900"
      />
    </div>
  );
};

/** Đồng hồ đếm ngược cho nút gửi lại mã */
const useCountdown = () => {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, start: (s: number) => setLeft(s) };
};

const ModalShell: React.FC<{ title: string; subtitle: string; onClose: () => void; children: React.ReactNode }> =
  ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-900/70 backdrop-blur-sm p-4 animate-fade-in-up">
    <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
      <div className="px-6 py-4 border-b border-stone-100 bg-red-50 flex justify-between items-start">
        <div>
          <h2 className="text-lg font-bold text-stone-900">{title}</h2>
          <p className="text-xs text-red-700/80 mt-0.5">{subtitle}</p>
        </div>
        <button onClick={onClose} aria-label="Đóng" className="p-2 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700 shrink-0"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-6 overflow-y-auto space-y-4">{children}</div>
    </div>
  </div>
);

const Message: React.FC<{ text: string; type: 'error' | 'info' }> = ({ text, type }) => {
  if (!text) return null;
  return (
    <p className={`text-xs font-medium rounded-lg px-3 py-2 ${
      type === 'error' ? 'text-red-700 bg-red-50 border border-red-100' : 'text-stone-600 bg-stone-50 border border-stone-100'
    }`}>{text}</p>
  );
};

/* ================== ĐĂNG KÝ TÀI KHOẢN ================== */
export const RegisterModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<'FORM' | 'OTP' | 'DONE'>('FORM');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [requireApproval, setRequireApproval] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const { left, start } = useCountdown();

  useEffect(() => {
    if (isOpen) {
      setStep('FORM'); setError(''); setInfo(''); setCode('');
      setFullName(''); setUsername(''); setEmail(''); setPosition(''); setPassword(''); setConfirm('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const submitForm = async () => {
    setError('');
    if (password !== confirm) { setError('Mật khẩu xác nhận không khớp.'); return; }
    setBusy(true);
    const r = await MockDB.registerAccount({ username, fullName, email, password, position });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setMaskedEmail(r.maskedEmail || email);
    setRequireApproval(!!r.requireApproval);
    setInfo('');
    setStep('OTP');
    start(60);
  };

  const submitOtp = async () => {
    setError('');
    setBusy(true);
    const r = await MockDB.verifyOtp(username.trim().toLowerCase(), 'REGISTER', code);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setRequireApproval(!!r.requireApproval);
    setStep('DONE');
  };

  const resend = async () => {
    setError(''); setInfo('');
    const r = await MockDB.requestOtp(username.trim().toLowerCase(), 'REGISTER');
    if (!r.ok) { setError(r.message); return; }
    setInfo('Đã gửi lại mã xác thực.');
    start(60);
  };

  return (
    <ModalShell
      title="Đăng ký tài khoản"
      subtitle="Dành cho cán bộ chưa có tài khoản trên hệ thống"
      onClose={onClose}
    >
      {step === 'FORM' && (
        <>
          <Input label="Họ và tên" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nguyễn Văn A" />
          <Input label="Tên đăng nhập" value={username} onChange={e => setUsername(e.target.value.toLowerCase())} placeholder="nguyenvana" />
          <Input label="Email cơ quan" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@gmail.com" />
          <Input label="Chức danh (không bắt buộc)" value={position} onChange={e => setPosition(e.target.value)} placeholder="Cán bộ Tổ Tổng hợp" />
          <Input type="password" label="Mật khẩu" value={password} onChange={e => setPassword(e.target.value)} placeholder="Ít nhất 6 ký tự" />
          <Input type="password" label="Xác nhận mật khẩu" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Nhập lại mật khẩu" />
          <Message text={error} type="error" />
          <p className="text-[11px] text-stone-500 leading-relaxed">
            Mã xác thực sẽ được gửi tới email vừa nhập. Tài khoản chỉ sử dụng được sau khi
            quản trị viên phê duyệt.
          </p>
          <Button onClick={submitForm} isLoading={busy} className="w-full py-3">Gửi mã xác thực</Button>
        </>
      )}

      {step === 'OTP' && (
        <>
          <div className="text-center">
            <div className="w-11 h-11 mx-auto mb-3 bg-stone-100 text-stone-700 rounded-lg flex items-center justify-center"><Mail className="w-5 h-5" /></div>
            <p className="text-sm text-stone-600">
              Nhập mã 6 số vừa gửi tới <span className="font-bold text-red-800">{maskedEmail}</span>
            </p>
            <p className="text-[11px] text-stone-400 mt-1">Kiểm tra cả hộp thư Spam nếu chưa thấy.</p>
          </div>
          <OtpInput value={code} onChange={setCode} disabled={busy} />
          <Message text={error} type="error" />
          <Message text={info} type="info" />
          <Button onClick={submitOtp} isLoading={busy} className="w-full py-3" disabled={code.length < 6}>Xác thực</Button>
          <button
            onClick={resend}
            disabled={left > 0}
            className="w-full text-xs font-bold text-stone-500 hover:text-red-700 disabled:text-stone-300 py-2"
          >
            {left > 0 ? `Gửi lại mã sau ${left}s` : 'Gửi lại mã xác thực'}
          </button>
        </>
      )}

      {step === 'DONE' && (
        <div className="text-center py-4">
          <div className="w-11 h-11 mx-auto mb-4 bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-center"><CheckCircle2 className="w-6 h-6" /></div>
          <h3 className="font-bold text-green-700 text-lg">Xác thực email thành công!</h3>
          <p className="text-sm text-stone-500 mt-2 mb-6 leading-relaxed">
            {requireApproval
              ? 'Tài khoản đang chờ quản trị viên phê duyệt. Đồng chí sẽ đăng nhập được ngay sau khi được duyệt.'
              : 'Đồng chí có thể đăng nhập ngay bằng tài khoản vừa tạo.'}
          </p>
          <Button onClick={onClose} className="w-full py-3">Về trang đăng nhập</Button>
        </div>
      )}
    </ModalShell>
  );
};

/* ================== QUÊN MẬT KHẨU ================== */
export const ForgotPasswordModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<'TARGET' | 'OTP' | 'NEW_PASS' | 'DONE'>('TARGET');
  const [target, setTarget] = useState('');
  const [code, setCode] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const { left, start } = useCountdown();

  useEffect(() => {
    if (isOpen) {
      setStep('TARGET'); setTarget(''); setCode(''); setPassword(''); setConfirm('');
      setError(''); setInfo('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sendCode = async () => {
    setError('');
    if (!target.trim()) { setError('Vui lòng nhập tên đăng nhập hoặc email.'); return; }
    setBusy(true);
    const r = await MockDB.requestOtp(target.trim(), 'RESET');
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setMaskedEmail(r.maskedEmail || '');
    setStep('OTP');
    start(60);
  };

  const verify = async () => {
    setError('');
    setBusy(true);
    const r = await MockDB.verifyOtp(target.trim(), 'RESET', code);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setResetToken(r.resetToken || '');
    setStep('NEW_PASS');
  };

  const savePassword = async () => {
    setError('');
    if (password !== confirm) { setError('Mật khẩu xác nhận không khớp.'); return; }
    if (password.length < 6) { setError('Mật khẩu phải từ 6 ký tự trở lên.'); return; }
    setBusy(true);
    const r = await MockDB.resetPassword(target.trim(), resetToken, password);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setStep('DONE');
  };

  const resend = async () => {
    setError(''); setInfo('');
    const r = await MockDB.requestOtp(target.trim(), 'RESET');
    if (!r.ok) { setError(r.message); return; }
    setInfo('Đã gửi lại mã xác thực.');
    start(60);
  };

  return (
    <ModalShell
      title="Quên mật khẩu"
      subtitle="Xác thực bằng mã OTP gửi qua email"
      onClose={onClose}
    >
      {step === 'TARGET' && (
        <>
          <Input
            label="Tên đăng nhập hoặc email"
            value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder="nguyenvana hoặc email@gmail.com"
          />
          <Message text={error} type="error" />
          <p className="text-[11px] text-stone-500 leading-relaxed">
            Hệ thống sẽ gửi mã xác thực tới email đã đăng ký của tài khoản.
            Nếu tài khoản chưa khai báo email, vui lòng liên hệ quản trị viên.
          </p>
          <Button onClick={sendCode} isLoading={busy} className="w-full py-3">Gửi mã xác thực</Button>
        </>
      )}

      {step === 'OTP' && (
        <>
          <div className="text-center">
            <div className="w-11 h-11 mx-auto mb-3 bg-stone-100 text-stone-700 rounded-lg flex items-center justify-center"><KeyRound className="w-5 h-5" /></div>
            <p className="text-sm text-stone-600">
              Nhập mã 6 số vừa gửi tới <span className="font-bold text-red-800">{maskedEmail || 'email đã đăng ký'}</span>
            </p>
          </div>
          <OtpInput value={code} onChange={setCode} disabled={busy} />
          <Message text={error} type="error" />
          <Message text={info} type="info" />
          <Button onClick={verify} isLoading={busy} className="w-full py-3" disabled={code.length < 6}>Xác thực</Button>
          <button
            onClick={resend}
            disabled={left > 0}
            className="w-full text-xs font-bold text-stone-500 hover:text-red-700 disabled:text-stone-300 py-2"
          >
            {left > 0 ? `Gửi lại mã sau ${left}s` : 'Gửi lại mã xác thực'}
          </button>
        </>
      )}

      {step === 'NEW_PASS' && (
        <>
          <Input type="password" label="Mật khẩu mới" value={password} onChange={e => setPassword(e.target.value)} placeholder="Ít nhất 6 ký tự" />
          <Input type="password" label="Xác nhận mật khẩu mới" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Nhập lại mật khẩu" />
          <Message text={error} type="error" />
          <Button onClick={savePassword} isLoading={busy} className="w-full py-3">Đặt lại mật khẩu</Button>
        </>
      )}

      {step === 'DONE' && (
        <div className="text-center py-4">
          <div className="w-11 h-11 mx-auto mb-4 bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-center"><CheckCircle2 className="w-6 h-6" /></div>
          <h3 className="font-bold text-green-700 text-lg">Đã đổi mật khẩu!</h3>
          <p className="text-sm text-stone-500 mt-2 mb-6">Đồng chí có thể đăng nhập bằng mật khẩu mới.</p>
          <Button onClick={onClose} className="w-full py-3">Về trang đăng nhập</Button>
        </div>
      )}
    </ModalShell>
  );
};
