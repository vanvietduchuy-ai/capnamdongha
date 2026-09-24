import React, { useState, useEffect } from 'react';
import { MockDB } from '../services/mockDatabase';
import { Button, Input, ResultMark, haptic } from './UI';
import { AlertCircle } from 'lucide-react';
import { LOGO_URL, ORG_NAME, ORG_PARENT } from '../lib/brand';

interface GuestCheckInProps {
  sessionId: string;
  slot: number;
  code: string;
  onSuccess?: () => void; // không còn dùng: trang tự hiện màn hình thành công
}

export const GuestCheckIn: React.FC<GuestCheckInProps> = ({ sessionId, slot, code }) => {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSystemReady, setIsSystemReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [ipAddress, setIpAddress] = useState<string>('');
  const [sessionTitle, setSessionTitle] = useState<string>('Hội nghị');
  const [ticket, setTicket] = useState<string>('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const initSystem = async () => {
      // Đổi mã QR vừa quét lấy "vé" điền biểu mẫu. Máy chủ kiểm tra chữ ký + độ mới
      // (mã đổi 3 giây/lần) theo đồng hồ máy chủ; vé có hạn vài phút.
      if (!Number.isFinite(slot) || !/^[0-9a-f]{12}$/i.test(code)) {
        setError("Mã QR không hợp lệ hoặc là mã cũ. Vui lòng quét lại mã đang hiển thị trên màn hình.");
        return;
      }
      const t = await MockDB.getGuestTicket(sessionId, slot, code);
      if (!t.ok || !t.ticket) {
        setError(MockDB.isCloudEnabled()
          ? (t.message || "Mã QR đã hết hạn. Vui lòng quét lại mã đang hiển thị trên màn hình.")
          : "Không kết nối được máy chủ. Vui lòng kiểm tra mạng rồi quét lại.");
        return;
      }
      setTicket(t.ticket);
      if (t.title) setSessionTitle(t.title);
      // Xoá mã khỏi thanh địa chỉ: chuyển tiếp đường dẫn cho người khác cũng không dùng được
      try { window.history.replaceState(null, '', window.location.pathname); } catch { /* bỏ qua */ }

      // Get or generate persistent unique device ID
      let id = localStorage.getItem('attendance_device_id');
      if (!id) {
          const random = Math.random().toString(36).substring(2, 11);
          const ts = Date.now().toString(36);
          id = `device_${ts}_${random}`;
          localStorage.setItem('attendance_device_id', id);
      }
      setDeviceId(id);
      
      // Fetch IP Address
      try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
          const data = await res.json();
          setIpAddress(data.ip);
          setIsSystemReady(true);
          clearTimeout(timeoutId);
      } catch (err) {
          try {
              const res2 = await fetch('https://api.db-ip.com/v2/free/self');
              const data2 = await res2.json();
              setIpAddress(data2.ipAddress);
              setIsSystemReady(true);
          } catch (err2) {
              setIsSystemReady(true);
          }
      }
    };

    initSystem();
  }, [sessionId, slot, code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !unit.trim() || !phone.trim()) {
      setError("Vui lòng điền đầy đủ thông tin.");
      return;
    }

    // Basic phone validation
    const phoneRegex = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/;
    if (!phoneRegex.test(phone.replace(/\s+/g, ''))) {
      setError("Số điện thoại không hợp lệ.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const normalizedPhone = phone.replace(/\s+/g, '').replace(/^\+84/, '0');
      const result = await MockDB.guestCheckIn(name.trim(), unit.trim(), normalizedPhone, deviceId, sessionId, ipAddress, ticket);
      if (result.success) {
        haptic(60);
        setDone(true); // hiện màn hình thành công ngay trên trang (thay cho hộp thoại alert)
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError("Lỗi kết nối. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  if (error && !isSystemReady) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-xl border border-stone-200 max-w-md w-full">
          <div className="w-10 h-10 bg-red-50 text-red-700 rounded-lg flex items-center justify-center mb-4"><AlertCircle className="w-5 h-5" /></div>
          <h2 className="text-lg font-semibold text-stone-900 mb-1">Không điểm danh được</h2>
          <p className="text-sm text-stone-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-orange-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-5">
          <img src={LOGO_URL} alt="" className="w-9 h-9 object-contain" />
          <div className="leading-tight">
            <div className="text-xs text-stone-500">{ORG_PARENT}</div>
            <div className="text-sm font-semibold text-stone-900">{ORG_NAME}</div>
          </div>
        </div>
      <div className="bg-white p-5 md:p-6 rounded-xl border border-stone-200">
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-stone-900">Điểm danh khách mời</h1>
          <p className="text-[15px] text-stone-800 mt-1">{sessionTitle}</p>
          <p className="text-sm text-stone-500 mt-1">Vui lòng điền thông tin để xác nhận tham dự.</p>
        </div>

        {done ? (
          <div className="text-center py-4" data-testid="guest-success">
            <div className="mb-4"><ResultMark ok size={76} /></div>
            <div className="result-text">
              <p className="text-lg font-semibold text-stone-900">Đã điểm danh</p>
              <p className="text-sm text-stone-700 mt-1">{name.trim()} · {unit.trim()}</p>
              <p className="text-xs text-stone-500 mt-3">Cảm ơn đồng chí đã tham dự. Có thể đóng trang này.</p>
            </div>
          </div>
        ) : !isSystemReady ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="w-8 h-8 border-2 border-stone-200 border-t-brand-700 rounded-full animate-spin"></div>
            <p className="text-sm text-stone-500">Đang khởi tạo hệ thống...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div key={error} role="alert" className="anim-shake p-3 bg-red-50 text-red-800 text-sm rounded-lg border border-red-200">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-[13px] font-medium text-stone-700 mb-1.5">Họ và tên *</label>
              <Input 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nhập họ và tên của bạn"
                required
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-stone-700 mb-1.5">Đơn vị công tác *</label>
              <Input 
                value={unit}
                onChange={e => setUnit(e.target.value)}
                placeholder="Nhập tên đơn vị/cơ quan"
                required
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-stone-700 mb-1.5">Số điện thoại *</label>
              <Input 
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Nhập số điện thoại cá nhân"
                required
              />
            </div>

            <Button 
              type="submit" 
              size="lg"
              className="w-full mt-2"
              disabled={loading}
            >
              {loading ? 'Đang xử lý...' : 'Xác nhận điểm danh'}
            </Button>
          </form>
        )}
      </div>
      </div>
    </div>
  );
};
