import React, { useState, useEffect } from 'react';
import { X, Database } from 'lucide-react';
import { Button, Input } from './UI';
import { MockDB, CloudConfig } from '../services/mockDatabase';
import { CLOUD_CONFIG_KEY } from '../lib/supabase';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: () => void;
}

// Dán sẵn URL Web App của đơn vị vào đây để cán bộ không phải nhập tay
// Dán sẵn thông tin dự án của đơn vị để cán bộ không phải nhập tay
const PREFILLED_URL = '';
const PREFILLED_KEY = '';

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({ isOpen, onClose, onConfigSaved }) => {
  const [supabaseUrl, setSupabaseUrl] = useState(PREFILLED_URL);
  const [supabaseKey, setSupabaseKey] = useState(PREFILLED_KEY);
  const [status, setStatus] = useState<'IDLE' | 'CONNECTING' | 'CONNECTED' | 'ERROR'>('IDLE');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      const storedConfig = localStorage.getItem(CLOUD_CONFIG_KEY);
      if (storedConfig) {
        try {
          const config = JSON.parse(storedConfig);
          setSupabaseUrl(config.supabaseUrl || PREFILLED_URL);
          setSupabaseKey(config.supabaseKey || PREFILLED_KEY);
        } catch (e) { /* bỏ qua */ }
      }
      if (MockDB.isCloudEnabled()) setStatus('CONNECTED');
    }
  }, [isOpen]);

  const handleConnect = async () => {
    const url = supabaseUrl.trim().replace(/\/$/, '');
    const key = supabaseKey.trim();

    if (!url.startsWith('https://') || url.indexOf('.supabase.co') === -1) {
      setStatus('ERROR');
      setMessage('URL dự án chưa đúng. Dạng đúng: https://xxxxx.supabase.co');
      return;
    }
    if (key.length < 20) {
      setStatus('ERROR');
      setMessage('Khoá anon (publishable) chưa đúng.');
      return;
    }

    setStatus('CONNECTING');
    setMessage('Đang kiểm tra kết nối...');

    const config: CloudConfig = { supabaseUrl: url, supabaseKey: key };

    const test = await MockDB.testConnection(config);
    if (!test.ok) {
      setStatus('ERROR');
      setMessage(test.message);
      return;
    }

    setMessage('Đang kiểm tra các hàm đăng nhập / OTP...');
    const schema = await MockDB.checkCloudSchema(config);
    if (!schema.ok) {
      setStatus('ERROR');
      setMessage(schema.message);
      return;
    }

    localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config));
    localStorage.removeItem('supabaseConfig');

    const success = MockDB.initializeCloud(config);
    if (success) {
      setStatus('CONNECTED');
      setMessage('Đã kết nối và đồng bộ với Supabase.');
      onConfigSaved();
      setTimeout(onClose, 1200);
    } else {
      setStatus('ERROR');
      setMessage('Không khởi tạo được kết nối.');
    }
  };

  const handleDisconnect = () => {
    MockDB.disconnectCloud();
    localStorage.removeItem(CLOUD_CONFIG_KEY);
    localStorage.removeItem('supabaseConfig');
    setStatus('IDLE');
    setMessage('');
    onConfigSaved();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-900/80 backdrop-blur-sm p-4 animate-fade-in-up">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-stone-100 bg-green-50 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-green-900">Kết nối Supabase</h2>
            <p className="text-xs text-green-700">Cơ sở dữ liệu đám mây của đơn vị</p>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="p-2 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {status === 'CONNECTED' ? (
            <div className="text-center py-6">
              <div className="w-11 h-11 bg-stone-100 text-stone-700 rounded-lg flex items-center justify-center mx-auto mb-4"><Database className="w-5 h-5" /></div>
              <h3 className="font-bold text-green-700 text-lg">Đã kết nối Supabase!</h3>
              <p className="text-stone-500 text-sm mt-2 mb-2">
                Dữ liệu điểm danh, nhiệm vụ, lịch công tác được đồng bộ tức thời giữa các máy.
              </p>
              <p className="text-stone-400 text-[11px] mb-6 break-all px-4">{supabaseUrl}</p>
              <div className="flex flex-col gap-2 items-center">
                <Button
                  variant="secondary"
                  onClick={async () => {
                    setMessage('Đang kiểm tra cơ sở dữ liệu...');
                    const r = await MockDB.checkCloudSchema();
                    setMessage(r.message);
                  }}
                >
                  Kiểm tra cơ sở dữ liệu
                </Button>
                <Button variant="danger" onClick={handleDisconnect}>Ngắt kết nối / Dùng máy cục bộ</Button>
              </div>
              {message && <p className="text-xs text-stone-500 mt-3">{message}</p>}
            </div>
          ) : (
            <>
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 text-xs text-stone-600">
                <p className="font-bold mb-2 text-stone-800">Các bước thiết lập (làm một lần):</p>
                <ol className="list-decimal pl-4 space-y-1.5">
                  <li>Đăng nhập <strong>supabase.com</strong>, tạo một dự án mới (gói miễn phí là đủ dùng).</li>
                  <li>Vào <strong>SQL Editor</strong>, dán và chạy lần lượt 2 file trong thư mục
                      <strong> supabase/</strong> đi kèm phần mềm:
                    <div className="mt-1 pl-2 border-l-2 border-green-500 font-mono text-[10px]">
                      <div>01_schema.sql — tạo bảng dữ liệu</div>
                      <div>02_auth_otp.sql — mã hoá mật khẩu, đăng ký, OTP</div>
                    </div>
                  </li>
                  <li>Khai báo dịch vụ gửi email OTP (xem mục 9 cuối file 02).</li>
                  <li>Vào <strong>Project Settings → API</strong>, sao chép <strong>Project URL</strong> và
                      khoá <strong>anon / publishable</strong> dán vào ô bên dưới.</li>
                </ol>
                <p className="mt-2 text-green-700 font-bold italic">
                  * Hai file SQL an toàn, chạy lại nhiều lần không mất dữ liệu cũ.
                </p>
              </div>

              <div className="space-y-3">
                <Input
                  label="Project URL"
                  value={supabaseUrl}
                  onChange={e => setSupabaseUrl(e.target.value)}
                  placeholder="https://xxxxxxxx.supabase.co"
                />
                <Input
                  label="Khoá anon (publishable)"
                  value={supabaseKey}
                  onChange={e => setSupabaseKey(e.target.value)}
                  placeholder="eyJhbGciOi... hoặc sb_publishable_..."
                />
              </div>

              {message && (
                <p className={`text-xs ${status === 'ERROR' ? 'text-red-600' : 'text-stone-500'}`}>{message}</p>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="secondary" onClick={onClose} className="flex-1">Để sau</Button>
                <Button onClick={handleConnect} isLoading={status === 'CONNECTING'} className="flex-1">
                  {status === 'CONNECTING' ? 'Đang kết nối...' : 'Kết nối ngay'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
