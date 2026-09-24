import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Download, X, Share, Ellipsis, EllipsisVertical, SquarePlus, Menu as MenuIcon, ExternalLink, Copy, Check,
  Smartphone, Bell, CircleCheck, Printer, ToggleRight, MonitorDown, ArrowRight, Info
} from 'lucide-react';
import { Portal } from './Portal';
import { LOGO_URL, ORG_NAME, ORG_PARENT } from '../lib/brand';
import {
  InstallEnv, detectInstallEnv, subscribeInstall, promptInstall, chromeIntentUrl, installPageUrl,
  hintDismissedRecently, dismissHint
} from '../lib/install';

const APP_TITLE = 'CAP Nam Đông Hà';

/** Theo dõi môi trường cài đặt (tự cập nhật khi trình duyệt cho phép cài / vừa cài xong) */
export const useInstallEnv = (): InstallEnv => {
  const [env, setEnv] = useState<InstallEnv>(() => detectInstallEnv());
  useEffect(() => subscribeInstall(() => setEnv(detectInstallEnv())), []);
  return env;
};

const IN_APP_NAME: Record<string, string> = {
  zalo: 'Zalo', facebook: 'Facebook', messenger: 'Messenger', instagram: 'Instagram', tiktok: 'TikTok', line: 'LINE', khac: 'một ứng dụng khác'
};

// ---------- Khối hiển thị ----------
const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center justify-center min-w-7 h-7 px-1.5 mx-0.5 align-middle rounded-md border border-stone-300 bg-white text-stone-700 shadow-sm">{children}</span>
);

const Steps: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ol className="space-y-3">
    {items.map((it, i) => (
      <li key={i} className="flex gap-3">
        <span className="icon-3d sm w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[13px] font-semibold" style={{ ['--c' as any]: '#a50f1a' }}>{i + 1}</span>
        <div className="text-[15px] leading-7 text-stone-800">{it}</div>
      </li>
    ))}
  </ol>
);

const Note: React.FC<{ children: React.ReactNode; tone?: 'info' | 'warn' | 'ok' }> = ({ children, tone = 'info' }) => {
  const cls = tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900' : tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-stone-50 border-stone-200 text-stone-700';
  const Icon = tone === 'ok' ? CircleCheck : Info;
  return <div className={`flex gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed ${cls}`}><Icon className="w-4 h-4 shrink-0 mt-0.5" /><div>{children}</div></div>;
};

const CopyLinkButton: React.FC<{ url?: string; label?: string }> = ({ url, label = 'Sao chép đường link' }) => {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    const link = url || installPageUrl();
    try { await navigator.clipboard.writeText(link); }
    catch {
      const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* bỏ qua */ } ta.remove();
    }
    setOk(true); window.setTimeout(() => setOk(false), 2500);
  };
  return (
    <button type="button" onClick={copy} className="w-full h-11 rounded-lg border border-stone-300 bg-white text-stone-800 text-sm font-semibold inline-flex items-center justify-center gap-2">
      {ok ? <><Check className="w-4 h-4 text-emerald-600" />Đã sao chép</> : <><Copy className="w-4 h-4" />{label}</>}
    </button>
  );
};

/** Nội dung hướng dẫn theo đúng thiết bị & trình duyệt */
export const InstallSteps: React.FC<{ env: InstallEnv; onDone?: () => void }> = ({ env, onDone }) => {
  const [result, setResult] = useState<'' | 'accepted' | 'dismissed' | 'unavailable'>('');

  if (env.standalone) {
    return <Note tone="ok">Phần mềm đang chạy dưới dạng ứng dụng đã cài trên thiết bị này. Không cần làm gì thêm.</Note>;
  }
  if (env.installedHere || result === 'accepted') {
    return (
      <div className="space-y-3">
        <Note tone="ok">Đã cài xong. Biểu tượng <b>{APP_TITLE}</b> đã có trên màn hình chính (hoặc trong danh sách ứng dụng).</Note>
        <p className="text-sm text-stone-600">Từ nay mở phần mềm bằng biểu tượng đó để nhận thông báo và chạy nhanh hơn.</p>
        {onDone && <button onClick={onDone} className="w-full h-11 rounded-lg bg-brand-700 text-white text-sm font-semibold">Xong</button>}
      </div>
    );
  }

  // 1. Đang mở trong Zalo / Facebook… → phải chuyển sang trình duyệt thật
  if (env.inApp) {
    const app = IN_APP_NAME[env.inApp] || 'ứng dụng khác';
    return (
      <div className="space-y-4">
        <Note tone="warn">Đang mở trong trình duyệt của <b>{app}</b>. Trình duyệt này <b>không cài được</b> ứng dụng. Hãy mở bằng {env.platform === 'ios' ? 'Safari' : 'Chrome'} rồi cài.</Note>
        {env.platform === 'android' ? (
          <>
            <a href={chromeIntentUrl(installPageUrl())} className="w-full h-12 rounded-lg bg-brand-700 text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2">
              <ExternalLink className="w-5 h-5" />Mở bằng Chrome
            </a>
            <p className="text-[13px] text-stone-500 text-center">Nếu nút trên không mở được:</p>
            <Steps items={[
              <>Bấm nút <Chip><EllipsisVertical className="w-4 h-4" /></Chip> hoặc <Chip><Ellipsis className="w-4 h-4" /></Chip> ở góc trên bên phải.</>,
              <>Chọn <b>Mở bằng trình duyệt</b> (hoặc <b>Mở trong Chrome</b>).</>
            ]} />
          </>
        ) : (
          <Steps items={[
            <>Bấm nút <Chip><Ellipsis className="w-4 h-4" /></Chip> ở góc trên bên phải màn hình {app}.</>,
            <>Chọn <b>Mở bằng trình duyệt</b> / <b>Mở trong Safari</b>.</>,
            <>Trang mở trong Safari → làm theo hướng dẫn cài hiện ra.</>
          ]} />
        )}
        <CopyLinkButton label={`Sao chép link để dán vào ${env.platform === 'ios' ? 'Safari' : 'Chrome'}`} />
      </div>
    );
  }

  // 2. Trình duyệt cho cài một chạm (Android Chrome/Edge/Samsung, máy tính Chrome/Edge)
  if (env.canPrompt) {
    return (
      <div className="space-y-3">
        <button
          onClick={async () => setResult(await promptInstall())}
          className="w-full h-12 rounded-lg bg-brand-700 text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2" data-testid="btn-install-now">
          <Download className="w-5 h-5" />Cài đặt ứng dụng
        </button>
        <p className="text-[13px] text-stone-500 text-center">Trình duyệt hỏi xác nhận → bấm <b>Cài đặt</b>. Chỉ mất vài giây, không tốn dung lượng đáng kể.</p>
        {result === 'dismissed' && <Note>Đã huỷ. Có thể bấm lại nút trên bất cứ lúc nào.</Note>}
      </div>
    );
  }

  // 3. iPhone / iPad
  if (env.platform === 'ios') {
    const moi = env.iosVersion >= 26;
    const safari = env.iosBrowser === 'safari';
    return (
      <div className="space-y-4">
        {safari ? (
          <Steps items={moi ? [
            <>Bấm nút <Chip><Ellipsis className="w-4 h-4" /></Chip> bên cạnh thanh địa chỉ.</>,
            <>Chọn <Chip><Share className="w-4 h-4" /></Chip> <b>Chia sẻ</b>.</>,
            <>Kéo xuống, chọn <Chip><SquarePlus className="w-4 h-4" /></Chip> <b>Thêm vào MH chính</b>.</>,
            <>Bật <Chip><ToggleRight className="w-4 h-4 text-emerald-600" /></Chip> <b>Mở dưới dạng ứng dụng web</b> → bấm <b>Thêm</b>.</>
          ] : [
            <>Bấm nút <Chip><Share className="w-4 h-4" /></Chip> <b>Chia sẻ</b> ở thanh công cụ của Safari (thanh dưới cùng, hoặc trên cùng nếu là iPad).</>,
            <>Kéo xuống, chọn <Chip><SquarePlus className="w-4 h-4" /></Chip> <b>Thêm vào MH chính</b>.</>,
            <>Bấm <b>Thêm</b> ở góc trên bên phải.</>
          ]} />
        ) : (
          <>
            <Steps items={[
              <>Bấm nút <Chip><Share className="w-4 h-4" /></Chip> <b>Chia sẻ</b> cạnh thanh địa chỉ (hoặc trong menu <Chip><Ellipsis className="w-4 h-4" /></Chip>).</>,
              <>Chọn <Chip><SquarePlus className="w-4 h-4" /></Chip> <b>Thêm vào MH chính</b> → <b>Thêm</b>.</>
            ]} />
            <Note>Không thấy mục "Thêm vào MH chính"? Mở trang này bằng <b>Safari</b> rồi làm lại.</Note>
            <CopyLinkButton label="Sao chép link để dán vào Safari" />
          </>
        )}
        <Note>Sau khi thêm, <b>mở phần mềm từ biểu tượng {APP_TITLE}</b> trên màn hình chính và <b>đăng nhập lại một lần</b> (iPhone tách riêng dữ liệu của ứng dụng với Safari), rồi cho phép nhận thông báo.</Note>
        {env.iosVersion > 0 && env.iosVersion < 17 && (
          <Note tone="warn">iPhone cần iOS 16.4 trở lên mới nhận được thông báo. Nên cập nhật iOS trong Cài đặt → Cài đặt chung → Cập nhật phần mềm.</Note>
        )}
      </div>
    );
  }

  // 4. Android nhưng trình duyệt chưa cho cài một chạm
  if (env.platform === 'android') {
    return (
      <div className="space-y-4">
        {env.androidBrowser === 'samsung' ? (
          <Steps items={[
            <>Bấm nút <Chip><MenuIcon className="w-4 h-4" /></Chip> ở góc dưới bên phải.</>,
            <>Chọn <b>Thêm trang vào</b> → <b>Màn hình chính</b>.</>,
            <>Bấm <b>Thêm</b>.</>
          ]} />
        ) : (
          <Steps items={[
            <>Bấm nút <Chip><EllipsisVertical className="w-4 h-4" /></Chip> ở góc trên bên phải trình duyệt.</>,
            <>Chọn <b>Cài đặt ứng dụng</b> hoặc <b>Thêm vào màn hình chính</b>.</>,
            <>Bấm <b>Cài đặt</b> để xác nhận.</>
          ]} />
        )}
        <Note>Nếu trong menu không có mục này, có thể phần mềm <b>đã được cài</b> trên máy — tìm biểu tượng <b>{APP_TITLE}</b> trên màn hình chính. Nên dùng trình duyệt <b>Chrome</b>.</Note>
      </div>
    );
  }

  // 5. Máy tính
  return (
    <div className="space-y-4">
      <Steps items={[
        <>Trên <b>Chrome</b> hoặc <b>Edge</b>: bấm biểu tượng <Chip><MonitorDown className="w-4 h-4" /></Chip> ở cuối thanh địa chỉ.</>,
        <>Hoặc mở menu <Chip><EllipsisVertical className="w-4 h-4" /></Chip> → <b>Cài đặt trang này làm ứng dụng</b> (Edge: <b>Ứng dụng</b> → <b>Cài đặt</b>).</>
      ]} />
    </div>
  );
};

/** Hộp hướng dẫn cài (mở từ menu, trang chủ, màn đăng nhập) */
export const InstallSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const env = useInstallEnv();
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[115] bg-stone-900/50 flex items-end md:items-center justify-center md:p-4" onClick={onClose} data-testid="install-sheet">
        <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-xl border border-stone-200 shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <img src={LOGO_URL} alt="" className="w-10 h-10 object-contain" />
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-stone-900">Cài ứng dụng lên {env.platform === 'desktop' ? 'máy tính' : 'điện thoại'}</h3>
              <p className="text-xs text-stone-500">Mở nhanh từ màn hình chính · nhận thông báo giao việc tức thì</p>
            </div>
            <button onClick={onClose} aria-label="Đóng" className="p-2 -mr-2 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X className="w-5 h-5" /></button>
          </div>
          <div className="px-4 pb-4 overflow-y-auto" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <InstallSteps env={env} onDone={onClose} />
            {env.platform === 'desktop' && !env.standalone && (
              <div className="mt-5 pt-4 border-t border-stone-200 flex items-center gap-4">
                <div className="bg-white p-2 rounded-lg border border-stone-200 shrink-0"><QRCodeSVG value={installPageUrl()} size={104} level="M" /></div>
                <p className="text-[13px] text-stone-600"><b className="text-stone-900">Cài lên điện thoại:</b> mở camera điện thoại quét mã này (không quét bằng Zalo), làm theo hướng dẫn hiện ra.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
};

/** Dải gợi ý cài ở trang chủ (điện thoại, chưa cài, không bấm "Để sau" trong 7 ngày) */
export const InstallBanner: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const env = useInstallEnv();
  const [hidden, setHidden] = useState(() => hintDismissedRecently());
  if (hidden || env.standalone || env.installedHere) return null;
  if (env.platform === 'desktop' && !env.canPrompt) return null;
  const inApp = !!env.inApp;
  return (
    <div className="mb-5 bg-white border border-stone-200 rounded-2xl p-3.5 flex items-center gap-3" data-testid="install-banner">
      <span className="icon-3d w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ ['--c' as any]: inApp ? '#b45309' : '#15803d' }}>
        {inApp ? <ExternalLink className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-stone-900">{inApp ? `Đang mở trong ${IN_APP_NAME[env.inApp!]}` : 'Cài ứng dụng lên màn hình chính'}</div>
        <div className="text-[13px] text-stone-500 leading-snug">{inApp ? 'Mở bằng trình duyệt để cài và nhận thông báo' : 'Mở nhanh, nhận thông báo giao việc tức thì'}</div>
      </div>
      <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
        <button
          onClick={async () => { if (env.canPrompt && !inApp) { const r = await promptInstall(); if (r === 'unavailable') onOpen(); } else onOpen(); }}
          className="h-9 px-3.5 rounded-lg bg-brand-700 text-white text-[13px] font-semibold inline-flex items-center gap-1.5" data-testid="banner-install">
          <Download className="w-4 h-4" />{inApp ? 'Xem cách' : 'Cài đặt'}
        </button>
        <button onClick={() => { dismissHint(); setHidden(true); }} className="h-8 px-2 text-xs font-medium text-stone-500 hover:text-stone-800">Để sau</button>
      </div>
    </div>
  );
};

/** Cảnh báo ở màn đăng nhập khi đang mở trong Zalo/Facebook */
export const InAppNotice: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const env = useInstallEnv();
  if (!env.inApp || env.standalone) return null;
  return (
    <div className="mx-3 mt-3 md:mx-auto md:max-w-[380px] rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900 flex gap-2.5" data-testid="inapp-notice">
      <Info className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="flex-1">
        Đang mở trong <b>{IN_APP_NAME[env.inApp]}</b>. Nên mở bằng {env.platform === 'ios' ? 'Safari' : 'Chrome'} để đăng nhập ổn định, dùng camera quét mã và cài ứng dụng.
        <div className="mt-2 flex gap-2">
          {env.platform === 'android' && <a href={chromeIntentUrl()} className="h-8 px-3 rounded-md bg-brand-700 text-white font-semibold inline-flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" />Mở bằng Chrome</a>}
          <button onClick={onOpen} className="h-8 px-3 rounded-md border border-amber-300 bg-white font-semibold">Xem hướng dẫn</button>
        </div>
      </div>
    </div>
  );
};

/** Trang công khai /cai-dat — gửi link hoặc in mã QR dán ở trụ sở, hội trường */
export const InstallPage: React.FC = () => {
  const env = useInstallEnv();
  const printRef = useRef<HTMLDivElement>(null);
  const url = installPageUrl();
  return (
    <div className="min-h-screen bg-orange-50">
      <style>{`@media print { @page{size:A4;margin:18mm} .no-print{display:none!important} html,body,.min-h-screen{background:#fff!important}
        .print-wrap{display:block!important;max-width:none!important;padding:0!important}
        .print-sheet{box-shadow:none!important;border:0!important;background:#fff!important;padding:0!important}
        .print-sheet img{width:22mm!important;height:22mm!important}
        .print-sheet .qr-box svg{width:110mm!important;height:110mm!important}
        .print-title{font-size:22pt!important;margin-top:8mm!important} .print-org{font-size:15pt!important} }`}</style>
      <div className="print-wrap max-w-5xl mx-auto px-4 py-6 md:py-10 md:grid md:grid-cols-[1fr_380px] md:gap-8 md:items-start">
        <div className="no-print bg-white border border-stone-200 rounded-2xl p-5 md:p-6" data-testid="install-page">
          <div className="flex items-center gap-3 mb-5">
            <img src={LOGO_URL} alt="" className="w-12 h-12 object-contain" />
            <div className="leading-tight">
              <div className="text-xs text-stone-500">{ORG_PARENT}</div>
              <div className="text-base font-semibold text-stone-900">{ORG_NAME}</div>
            </div>
          </div>
          <h1 className="text-xl font-semibold text-stone-900 tracking-tight">Cài ứng dụng {APP_TITLE}</h1>
          <p className="text-sm text-stone-500 mt-1 mb-5">Mở nhanh từ màn hình chính, nhận thông báo giao việc và điểm danh hội nghị tức thì.</p>
          <InstallSteps env={env} />
          <div className="no-print mt-6 flex flex-col sm:flex-row gap-2">
            <a href="/" className="flex-1 h-11 rounded-lg border border-stone-300 bg-white text-stone-800 text-sm font-semibold inline-flex items-center justify-center gap-2">Vào phần mềm<ArrowRight className="w-4 h-4" /></a>
          </div>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[13px] text-stone-600">
            <div className="flex gap-2"><Bell className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />Nhận thông báo ngay cả khi đã tắt màn hình</div>
            <div className="flex gap-2"><Smartphone className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />Mở như ứng dụng, không cần gõ địa chỉ</div>
            <div className="flex gap-2"><Download className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />Không qua kho ứng dụng, dung lượng nhỏ</div>
          </div>
        </div>

        {/* Tờ in: mã QR dán ở trụ sở / hội trường */}
        <div className="mt-6 md:mt-0">
          <div ref={printRef} className="print-sheet bg-white border border-stone-200 rounded-2xl p-6 text-center" data-testid="install-qr">
            <img src={LOGO_URL} alt="" className="w-12 h-12 mx-auto mb-2 object-contain" />
            <div className="text-xs text-stone-500">{ORG_PARENT}</div>
            <div className="print-org text-base font-semibold text-stone-900">{ORG_NAME}</div>
            <div className="qr-box mt-4 inline-block bg-white p-3 rounded-xl border border-stone-200"><QRCodeSVG value={url} size={220} level="M" /></div>
            <div className="print-title mt-3 text-[15px] font-semibold text-stone-900">Quét mã để cài ứng dụng</div>
            <div className="text-[13px] text-stone-500 mt-1">Dùng <b>camera điện thoại</b> để quét (không quét bằng Zalo)</div>
            <div className="mt-2 text-xs text-stone-400 break-all">{url}</div>
          </div>
          <div className="no-print mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => window.print()} className="h-10 rounded-lg border border-stone-300 bg-white text-stone-800 text-sm font-semibold inline-flex items-center justify-center gap-2"><Printer className="w-4 h-4" />In tờ QR</button>
            <CopyLinkButton url={url} label="Sao chép link" />
          </div>
        </div>
      </div>
    </div>
  );
};
