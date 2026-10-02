import { useState } from 'react';
import { ExternalLink, Paperclip, Trash2, Upload } from 'lucide-react';
import { goiChucNang, loiDe, supabase } from '../lib/supabase';
import { HopLoi, cx } from './ui';

export type Tep = { id: string; drive_file_id: string; ten: string };
export const linkDrive = (id: string) => `https://drive.google.com/file/d/${id}/view`;

// Danh sách tệp trên Google Drive + ô tải lên (qua Edge Function drive-upload)
export default function TepDinhKem({ loai, dichId, thuMuc, suaDuoc, tep, xong, xoaDuoc = suaDuoc }: {
  loai: 'nop_bao_cao' | 'so_lieu_da06' | 'nhiem_vu'; dichId: string; thuMuc?: string;
  suaDuoc: boolean; xoaDuoc?: boolean; tep: Tep[]; xong: () => void;
}) {
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const tai = async (f: File) => {
    setDangChay(true); setLoi(null);
    try {
      const fd = new FormData();
      fd.append('file', f); fd.append('loai', loai); fd.append(`${loai}_id`, dichId);
      if (thuMuc) fd.append('thu_muc', thuMuc);
      await goiChucNang('drive-upload', fd, true);
      xong();
    } catch (e) { setLoi(loiDe(e)); } finally { setDangChay(false); }
  };
  const xoa = async (t: Tep) => {
    if (!window.confirm(`Gỡ tệp "${t.ten}"?`)) return;
    const { error } = await supabase.from('tep').delete().eq('id', t.id);
    if (error) setLoi(loiDe(error)); else xong();
  };
  return (
    <div className="flex flex-col gap-2">
      {tep.map((t) => (
        <div key={t.id} className="flex items-center gap-2 rounded-xl bg-nen px-3 py-2 text-sm">
          <Paperclip className="h-4 w-4 shrink-0 text-do" />
          <a href={linkDrive(t.drive_file_id)} target="_blank" rel="noreferrer" className="flex-1 truncate text-[#A4161A]">{t.ten}</a>
          <ExternalLink className="h-3.5 w-3.5 text-mo" />
          {xoaDuoc && <button aria-label={`Gỡ ${t.ten}`} onClick={() => xoa(t)} className="flex h-9 w-9 items-center justify-center rounded-lg text-nguy hover:bg-nguy-nhat"><Trash2 className="h-4 w-4" /></button>}
        </div>
      ))}
      {suaDuoc && (
        <label className={cx('flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-[#9AA1AE] bg-nen-2 px-3 text-center text-[13px] text-mo-2', dangChay && 'opacity-60')}>
          <Upload className="h-5 w-5 text-do" />
          <span>{dangChay ? 'Đang tải lên Google Drive…' : <><b className="text-do">Chọn tệp</b> hoặc chụp ảnh</>}</span>
          <input type="file" className="sr-only" disabled={dangChay} accept=".doc,.docx,.pdf,.xls,.xlsx,.jpg,.jpeg,.png,.heic,.zip"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void tai(f); e.target.value = ''; }} />
        </label>
      )}
      {loi && <HopLoi loi={loi} />}
    </div>
  );
}
