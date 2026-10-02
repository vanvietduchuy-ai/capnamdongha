// Khung soạn văn bản tự do trên trang A4 (báo cáo chung gửi PV01, hồ sơ họp BCĐ): lưu nháp, tạo lại, tải .docx
import { useCallback, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { loiDe } from '../lib/supabase';
import { suaMoHinh, type MoHinhA4 } from '../lib/baoCaoA4';
import TrangA4 from './TrangA4';
import { HopLoi, Nut } from './ui';

export default function KhungSoanA4({ m, setM, suaDuoc, luu, taoLai, tenFile, ghiChu, moi = false }: {
  m: MoHinhA4; setM: (f: (m: MoHinhA4) => MoHinhA4) => void; suaDuoc: boolean;
  luu: (m: MoHinhA4) => Promise<void>; taoLai?: () => Promise<void>; tenFile: string; ghiChu?: React.ReactNode; moi?: boolean;   // moi = bản vừa tạo, chưa lưu
}) {
  const [doiChua, setDoiChua] = useState(moi);
  const [dangChay, setDangChay] = useState<'luu' | 'docx' | 'tao' | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [soTrang, setSoTrang] = useState(1);
  const sua = useCallback((k: string, v: string) => { setM((x) => suaMoHinh(x, k, v)); setDoiChua(true); }, [setM]);

  const chay = async (ten: 'luu' | 'docx' | 'tao', f: () => Promise<void>) => {
    setDangChay(ten); setLoi(null);
    try { await f(); } catch (e) { setLoi(loiDe(e)); } finally { setDangChay(null); }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-[13px] text-mo">{ghiChu ?? (suaDuoc ? 'Sửa thẳng trên trang. Dòng bắt đầu bằng "I.", "1." tự in đậm.' : 'Chỉ xem')}{soTrang > 1 && ` · khoảng ${soTrang} trang`}</span>
        {suaDuoc && taoLai && <Nut icon={<RotateCcw className="h-4 w-4" />} dangChay={dangChay === 'tao'}
          onClick={() => { if (window.confirm('Tạo lại từ dữ liệu mới nhất? Nội dung đang sửa sẽ bị thay.')) void chay('tao', async () => { await taoLai(); setDoiChua(true); }); }}>Tạo lại từ dữ liệu</Nut>}
        <Nut icon={<Download className="h-4 w-4" />} dangChay={dangChay === 'docx'}
          onClick={() => chay('docx', async () => { const { taiDocxA4 } = await import('../lib/baoCaoDonViDocx'); await taiDocxA4(m, tenFile); })}>Tải .docx</Nut>
        {suaDuoc && <Nut kieu="chinh" dangChay={dangChay === 'luu'} onClick={() => chay('luu', async () => { await luu(m); setDoiChua(false); })}>{doiChua ? 'Lưu nháp' : 'Đã lưu'}</Nut>}
      </div>
      {loi && <HopLoi loi={loi} />}
      <TrangA4 m={m} sua={suaDuoc ? sua : undefined} doiSoTrang={setSoTrang} />
    </>
  );
}
