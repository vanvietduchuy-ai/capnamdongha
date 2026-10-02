import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { loiDe, supabase } from '../lib/supabase';
import { docVanBanPdf, soKyHieu, type MetaVb } from '../lib/docPdf';
import { taiPdfLenDrive } from './VanBanPdf';
import { idTuLinkDrive, LOAI_VB, SO_THEO_THU_MUC, THU_MUC, TT_VB, type LoaiVb, type ThuMuc, type TtVb, type VanBan } from '../lib/vanBan';
import { HopLoi, HopThoai, lopO, Nut, O, cx } from './ui';

type G = {
  so_ky_hieu: string; ngay_ban_hanh: string; trich_yeu: string; co_quan_ban_hanh: string; loai: LoaiVb; thu_muc: ThuMuc;
  trang_thai: TtVb; nguoi_ky: string; ghi_chu: string; link: string;
};

const tuVb = (v?: Partial<VanBan>): G => ({
  so_ky_hieu: v?.so_ky_hieu ?? '', ngay_ban_hanh: v?.ngay_ban_hanh ?? '', trich_yeu: v?.trich_yeu ?? '',
  co_quan_ban_hanh: v?.co_quan_ban_hanh ?? '', loai: v?.loai ?? 'cong_van', thu_muc: v?.thu_muc ?? 'cap_tren_tinh',
  trang_thai: v?.trang_thai ?? 'ban_hanh', nguoi_ky: v?.nguoi_ky ?? '', ghi_chu: v?.ghi_chu ?? '', link: v?.drive_url ?? '',
});

// Thêm / sửa văn bản trong kho. Tệp đưa lên Google Drive qua Edge Function (thư mục "Kho văn bản/<thư mục>").
export default function FormVanBan({ mo, dong, vb, dau, xong }: {
  mo: boolean; dong: () => void; vb?: VanBan; dau?: Partial<VanBan>; xong: (id: string) => void;
}) {
  const [g, setG] = useState<G>(tuVb(vb ?? dau));
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<MetaVb | null>(null);
  const [dangDoc, setDangDoc] = useState<string | null>(null);
  const [khongMat, setKhongMat] = useState(!!vb);
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  useEffect(() => { if (mo) { setG(tuVb(vb ?? dau)); setFile(null); setDoc(null); setKhongMat(!!vb); setLoi(null); } }, [mo]); // eslint-disable-line react-hooks/exhaustive-deps
  const dat = <K extends keyof G>(k: K, v: G[K]) => setG((x) => ({ ...x, [k]: v }));

  // Chọn PDF: tự đọc số, ký hiệu, ngày, trích yếu, cơ quan, người ký
  const chonTep = async (f: File | null) => {
    setFile(f); setDoc(null); setLoi(null);
    if (!f || !/\.pdf$/i.test(f.name)) return;
    try {
      const m = await docVanBanPdf(f, setDangDoc);
      setDoc(m);
      setG((x) => ({
        ...x, so_ky_hieu: soKyHieu(m.so_van_ban, m.ky_hieu) || x.so_ky_hieu, ngay_ban_hanh: m.ngay_ban_hanh || x.ngay_ban_hanh,
        trich_yeu: m.trich_yeu || x.trich_yeu, co_quan_ban_hanh: m.co_quan_ban_hanh || x.co_quan_ban_hanh,
        loai: m.trich_yeu || m.ky_hieu ? m.loai : x.loai, nguoi_ky: m.nguoi_ky || x.nguoi_ky,
      }));
      if (m.mat) { setKhongMat(false); setLoi('Văn bản có độ mật — không đưa lên hệ thống.'); }
    } catch { setLoi('Không đọc được PDF — nhập thông tin thủ công.'); } finally { setDangDoc(null); }
  };

  const luu = async () => {
    if (doc?.mat) { setLoi('Văn bản có độ mật — không đưa lên hệ thống.'); return; }
    if (!g.trich_yeu.trim() || !g.co_quan_ban_hanh.trim()) { setLoi('Nhập trích yếu và cơ quan ban hành'); return; }
    if (!khongMat) { setLoi('Tích xác nhận văn bản không mật'); return; }
    const idLink = g.link.trim() ? idTuLinkDrive(g.link.trim()) : null;
    if (g.link.trim() && !idLink) { setLoi('Đường dẫn Google Drive không đúng dạng (…/d/<mã tệp>/…)'); return; }
    setDangChay(true); setLoi(null);
    try {
      let drive: { drive_file_id: string | null; drive_url: string | null; ten_tep: string | null } | null = null;
      if (file) {
        const r = await taiPdfLenDrive(file, 'van_ban', { thuMuc: THU_MUC[g.thu_muc] });
        drive = { drive_file_id: r.drive_file_id, drive_url: r.url ?? null, ten_tep: file.name };
      } else if (idLink && idLink !== vb?.drive_file_id) {
        drive = { drive_file_id: idLink, drive_url: g.link.trim(), ten_tep: null };
      }
      const dong_ = {
        so_ky_hieu: g.so_ky_hieu.trim() || null, ngay_ban_hanh: g.ngay_ban_hanh || null, trich_yeu: g.trich_yeu.trim(),
        co_quan_ban_hanh: g.co_quan_ban_hanh.trim(), loai: g.loai, thu_muc: g.thu_muc, trang_thai: g.trang_thai,
        nguoi_ky: g.nguoi_ky.trim() || null, ghi_chu: g.ghi_chu.trim() || null, ...(drive ?? {}),
        ...(doc ? { so_van_ban: doc.so_van_ban || null, ky_hieu: doc.ky_hieu || null, chuc_vu_nguoi_ky: doc.chuc_vu_nguoi_ky || null, noi_dung: doc.noi_dung || null } : {}),
      };
      const r = vb
        ? await supabase.from('van_ban').update(dong_).eq('id', vb.id).select('id').single()
        : await supabase.from('van_ban').insert(dong_).select('id').single();
      if (r.error) throw r.error;
      xong(r.data.id as string);
    } catch (e) { setLoi(loiDe(e)); } finally { setDangChay(false); }
  };

  return (
    <HopThoai mo={mo} dong={dong} tieuDe={vb ? 'Sửa văn bản' : 'Thêm văn bản vào kho'} rong="max-w-2xl">
      <div className="flex flex-col gap-3.5">
        <O nhan={vb?.drive_file_id ? 'Thay tệp (PDF: tự đọc thông tin)' : 'Tệp văn bản (PDF: tự đọc thông tin)'}>
          <input type="file" aria-label="Tệp văn bản" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip" className={cx(lopO, 'py-2')} onChange={(e) => void chonTep(e.target.files?.[0] ?? null)} />
        </O>
        {dangDoc && <div className="rounded-xl bg-xanh-nhat px-3 py-2 text-[13px] text-xanh">{dangDoc}</div>}
        {doc && !dangDoc && <div className="rounded-xl bg-nen-3 px-3 py-2 text-[12.5px] text-mo-2">{doc.ocr ? 'Bản scan: đã nhận dạng chữ.' : 'Đã đọc tự động từ PDF.'} Kiểm tra, sửa nếu sai.</div>}
        <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
          <O nhan="Số, ký hiệu"><input className={lopO} placeholder="VD: 12-TB/BCĐ" value={g.so_ky_hieu} onChange={(e) => dat('so_ky_hieu', e.target.value)} /></O>
          <O nhan="Ngày ban hành"><input type="date" className={lopO} value={g.ngay_ban_hanh} onChange={(e) => dat('ngay_ban_hanh', e.target.value)} /></O>
        </div>
        <O nhan="Trích yếu"><textarea className={cx(lopO, 'min-h-16 py-2')} value={g.trich_yeu} onChange={(e) => dat('trich_yeu', e.target.value)} /></O>
        <div className="grid gap-3 sm:grid-cols-2">
          <O nhan="Cơ quan ban hành"><input className={lopO} list="co-quan-bh" value={g.co_quan_ban_hanh} onChange={(e) => dat('co_quan_ban_hanh', e.target.value)} /></O>
          <O nhan="Người ký"><input className={lopO} value={g.nguoi_ky} onChange={(e) => dat('nguoi_ky', e.target.value)} /></O>
          <O nhan="Loại văn bản"><select className={lopO} value={g.loai} onChange={(e) => dat('loai', e.target.value as LoaiVb)}>
            {Object.entries(LOAI_VB).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></O>
          <O nhan="Thư mục" goiY={SO_THEO_THU_MUC(g.thu_muc) === 'den' ? 'Tự vào sổ công văn đến' : SO_THEO_THU_MUC(g.thu_muc) === 'di' ? 'Tự vào sổ công văn đi' : undefined}><select className={lopO} value={g.thu_muc} onChange={(e) => dat('thu_muc', e.target.value as ThuMuc)}>
            {Object.entries(THU_MUC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></O>
          <O nhan="Tình trạng" goiY={g.trang_thai === 'du_thao' ? 'Đơn vị không thấy dự thảo' : undefined}>
            <select className={lopO} value={g.trang_thai} onChange={(e) => dat('trang_thai', e.target.value as TtVb)}>
              {Object.entries(TT_VB).map(([k, v]) => <option key={k} value={k}>{v.nhan}</option>)}</select></O>
          <O nhan="Hoặc liên kết Google Drive"><input className={lopO} placeholder="https://drive.google.com/file/d/…" value={g.link} onChange={(e) => dat('link', e.target.value)} /></O>
        </div>
        <datalist id="co-quan-bh">
          {['Bộ Chính trị', 'Ban Chấp hành Trung ương', 'Tỉnh ủy Quảng Trị', 'Ban Chỉ đạo 57 tỉnh Quảng Trị', 'Công an tỉnh Quảng Trị', 'Đảng ủy phường Nam Đông Hà', 'Ban Chỉ đạo 57 phường Nam Đông Hà', 'UBND phường Nam Đông Hà', 'Công an phường Nam Đông Hà'].map((x) => <option key={x} value={x} />)}
        </datalist>
        <O nhan="Ghi chú"><input className={lopO} value={g.ghi_chu} onChange={(e) => dat('ghi_chu', e.target.value)} /></O>
        <label className="flex items-start gap-3 rounded-xl bg-nguy-nhat px-3 py-2.5 text-[13px] text-nguy">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={khongMat} onChange={(e) => setKhongMat(e.target.checked)} />
          <span><ShieldAlert className="mr-1 inline h-4 w-4" /><b>Văn bản không mật</b> (hệ thống không lưu văn bản mật)</span>
        </label>
        {loi && <HopLoi loi={loi} />}
        <div className="flex justify-end gap-2">
          <Nut onClick={dong}>Huỷ</Nut>
          <Nut kieu="chinh" dangChay={dangChay} onClick={luu}>{file ? 'Tải lên và lưu' : 'Lưu'}</Nut>
        </div>
      </div>
    </HopThoai>
  );
}
