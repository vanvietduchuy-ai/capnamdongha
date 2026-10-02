import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Printer } from 'lucide-react';
import { User, UserRole } from '../../types';
import { Daily, dailyLink } from '../../services/dailyReportService';
import { btnPrimary, btnSecondary, card, inputCls } from '../learning/common';

interface Props { me: User; deadline: string; onDeadlineChanged: () => void; }

/** Thiết lập: 1 link / 1 mã QR chung cho cả đơn vị; giờ chốt kỳ báo cáo */
export const DailySettings: React.FC<Props> = ({ me, deadline, onDeadlineChanged }) => {
  const link = dailyLink();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* bỏ qua */ }
  };
  return (
    <div className="space-y-5" data-testid="daily-settings">
      <section className={`${card} p-4`}>
        <h3 className="font-bold text-stone-900 mb-1">Link và mã QR chung</h3>
        <p className="text-[13px] text-stone-500 mb-3">
          Dùng chung <b>1 link, 1 mã QR</b> cho tất cả các tổ, trực ban hình sự và trực ban đơn vị. Không phân công cố định:
          cán bộ mở link, đăng nhập tài khoản của mình rồi <b>tự chọn vai trò</b> đang đảm nhiệm hôm đó để báo cáo.
          App ghi đúng họ tên người báo cáo nên vẫn biết chính xác ai chịu trách nhiệm.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div id="daily-qr-box" className="bg-white p-2 rounded-lg border border-stone-200"><QRCodeSVG value={link} size={200} level="M" /></div>
          <div className="flex-1 min-w-0 w-full space-y-2">
            <div className="text-[13px] text-stone-700 break-all rounded-lg bg-stone-100 px-3 py-2" data-testid="daily-link">{link}</div>
            <div className="flex flex-wrap gap-2">
              <button className={btnSecondary} onClick={copy}>{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}{copied ? 'Đã sao chép' : 'Sao chép link'}</button>
              <button className={btnPrimary} onClick={() => printQr(link)}><Printer className="w-4 h-4" />In mã QR</button>
            </div>
            <p className="text-[12px] text-stone-500">Quét bằng camera điện thoại (không quét bằng Zalo).</p>
          </div>
        </div>
      </section>
      {(me.role === UserRole.ADMIN || me.role === UserRole.CHIEF) && <DeadlineBox deadline={deadline} onSaved={onDeadlineChanged} />}
    </div>
  );
};

const printQr = (link: string) => {
  const svg = document.querySelector('#daily-qr-box svg')?.outerHTML || '';
  const w = window.open('', '_blank', 'width=700,height=900');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Mã QR báo cáo ngày</title>
    <style>body{font-family:'Times New Roman',serif;text-align:center;padding:40px}svg{width:12cm;height:12cm}h1{font-size:26pt;margin:0 0 8px}h2{font-size:18pt;margin:0 0 24px;font-weight:normal}p{font-size:14pt}</style></head>
    <body><h1>BÁO CÁO NGÀY</h1><h2>Các tổ · Trực ban hình sự · Trực ban đơn vị</h2>${svg}
    <p>Quét bằng camera điện thoại, đăng nhập tài khoản cá nhân, chọn vai trò rồi báo cáo.</p>
    <p style="font-size:11pt;color:#555">${link}</p><script>window.onload=()=>{window.print();}</script></body></html>`);
  w.document.close();
};

const DeadlineBox: React.FC<{ deadline: string; onSaved: () => void }> = ({ deadline, onSaved }) => {
  const [v, setV] = useState(deadline);
  const [msg, setMsg] = useState('');
  return (
    <section className={`${card} p-4`}>
      <h3 className="font-bold text-stone-900 mb-1">Giờ chốt kỳ báo cáo và hạn nộp</h3>
      <p className="text-[13px] text-stone-500 mb-2">Kỳ báo cáo ngày D tính từ giờ chốt ngày D-1 đến giờ chốt ngày D. Nộp sau giờ chốt bị ghi "nộp muộn".</p>
      <div className="flex gap-2 items-center">
        <input type="time" className={`${inputCls} w-32`} value={v} onChange={e => setV(e.target.value)} data-testid="deadline-input" />
        <button className={btnPrimary} disabled={v === deadline} onClick={async () => {
          const r = await Daily.setDeadline(v); setMsg(r.ok ? 'Đã lưu.' : r.message || 'Không lưu được.'); if (r.ok) onSaved();
        }}>Lưu</button>
        {msg && <span className="text-sm text-stone-600">{msg}</span>}
      </div>
    </section>
  );
};
