import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Upload } from 'lucide-react';
import { goiChucNang, loiDe, supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { ngay, phanTram, so } from '../lib/dinhDang';
import { MAU_PHAN_LOAI, nhanPhanLoai, phanLoaiTuChu, type KetQuaDa06 } from '../lib/da06';
import type { KetQuaDocFile } from '../lib/docFileTinh';
import { Chip, DangTai, HopLoi, HopThoai, lopO, Nut, O, Rong, The, ThanhTyLe, TieuDeTrang, cx } from '../components/ui';

type Ky = { id: string; ten: string; ngay_file: string; ten_file: string | null; drive_file_id: string | null };
type Diem = { so_chi_tieu: number; so_chua_ht: number; so_thap_tb: number; so_cao_tb: number; diem_adn: number; so_tru_lam_sach: number; tong_diem_tinh_lai: number; tong_diem_file: number | null; co_ton_tai_dvc: boolean; hang: number };
type Loi = { sheet: string; o: string | null; mo_ta: string; anh_huong_diem: boolean };
type KyCt = { chi_tieu_id: string; co_so_lieu_moi: boolean; ngay_chot: string | null; tb_tinh_file: number | null };
type Pc = { chi_tieu_id: string; vai: string; trang_thai: string; don_vi: { ten: string } };
type TuTheoDoi = { chi_tieu_id: string; ty_le: number | null; ngay_so_lieu: string | null };

const vi = (n: number) => String(n).replace('.', ',');

export default function DeAn06() {
  const { hoSo } = useAuth();
  const [kyId, setKyId] = useState<string | null>(null);
  const [nhapMo, setNhapMo] = useState(false);

  const dsKy = useDuLieu(async () => (kq(await supabase.from('da06_ky_danh_gia').select('id, ten, ngay_file, ten_file, drive_file_id').order('ngay_file', { ascending: false })) ?? []) as Ky[]);
  useEffect(() => { if (!kyId && dsKy.data?.length) setKyId(dsKy.data[0].id); }, [dsKy.data, kyId]);

  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    if (!kyId) return null;
    const [a, b, c, d, e, f] = await Promise.all([
      supabase.from('v_da06_ket_qua').select('*').eq('ky_id', kyId).eq('la_don_vi_minh', true).order('thu_tu'),
      supabase.from('v_da06_diem').select('*').eq('ky_id', kyId).eq('la_don_vi_minh', true).maybeSingle(),
      supabase.from('da06_loi_file').select('sheet, o, mo_ta, anh_huong_diem').eq('ky_id', kyId),
      supabase.from('da06_ky_chi_tieu').select('chi_tieu_id, co_so_lieu_moi, ngay_chot, tb_tinh_file').eq('ky_id', kyId),
      supabase.from('da06_phan_cong').select('chi_tieu_id, vai, trang_thai, don_vi(ten)'),
      supabase.from('v_da06_so_tu_theo_doi').select('chi_tieu_id, ty_le, ngay_so_lieu').not('don_vi_id', 'is', null),
    ]);
    return {
      kq: (kq(a) ?? []) as KetQuaDa06[], diem: kq(b) as Diem | null, loi: (kq(c) ?? []) as Loi[], kyCt: (kq(d) ?? []) as KyCt[],
      pc: (kq(e) ?? []) as unknown as Pc[], tu: (kq(f) ?? []) as TuTheoDoi[],
    };
  }, [kyId]);

  const ky = dsKy.data?.find((k) => k.id === kyId);
  const quanTri = hoSo?.vai_tro === 'quan_tri';

  return (
    <>
      <TieuDeTrang
        tren={ky ? <>Tỉnh chốt {ngay(ky.ngay_file)}{ky.drive_file_id && <> · <a className="text-[#A4161A]" href={`https://drive.google.com/file/d/${ky.drive_file_id}/view`} target="_blank" rel="noreferrer">file gốc</a></>}</> : undefined}
        ten="Đề án 06"
        phai={<>
          {(dsKy.data?.length ?? 0) > 1 && (
            <select aria-label="Chọn kỳ" className={lopO} value={kyId ?? ''} onChange={(e) => setKyId(e.target.value)}>
              {dsKy.data!.map((k) => <option key={k.id} value={k.id}>{k.ten}</option>)}
            </select>
          )}
          {quanTri && <Nut kieu="chinh" icon={<Upload className="h-4 w-4" />} onClick={() => setNhapMo(true)}>Nhập file đánh giá của tỉnh</Nut>}
        </>} />

      {(loi || dsKy.loi) && <HopLoi loi={(loi || dsKy.loi)!} taiLai={taiLai} />}
      {(dangTai || dsKy.dangTai) && !data && <DangTai />}
      {dsKy.data && dsKy.data.length === 0 && <Rong>Chưa có file đánh giá của tỉnh.</Rong>}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[470px_minmax(0,1fr)]">
            {data.diem && (
              <section className="flex flex-wrap items-center gap-6 rounded-3xl bg-ink p-5 text-white">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[#E9CBC7]">Điểm (tính lại theo công thức tỉnh)</span>
                  <span className="so text-[52px] font-bold leading-none">{vi(data.diem.tong_diem_tinh_lai)}</span>
                  <span className="text-xs text-[#F6E3E0]">Hạng {data.diem.hang}/78 · file tỉnh ghi {data.diem.tong_diem_file != null ? vi(data.diem.tong_diem_file) : '—'}</span>
                  {data.diem.co_ton_tai_dvc && <span className="mt-1 self-start rounded-md bg-do px-2 py-0.5 text-[11px] font-bold">Có tồn tại DVC · Đoàn KT</span>}
                </div>
                <div className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-xs text-[#F6E3E0]">
                  {[
                    ['Điểm gốc', vi(data.diem.so_chi_tieu), ''],
                    ['Chưa hoàn thành × (−1)', `−${data.diem.so_chua_ht}`, 'text-[#FCA5A5]'],
                    ['Thấp hơn TB / dưới ngưỡng × (−0,5)', `−${vi(data.diem.so_thap_tb * 0.5)}`, 'text-[#FCA5A5]'],
                    ['Cao hơn TB × (+0,5)', `+${vi(data.diem.so_cao_tb * 0.5)}`, ''],
                    ['Thực hiện tốt ADN', `+${vi(data.diem.diem_adn)}`, 'text-[#FDE68A]'],
                    ['Tồn làm sạch dữ liệu × (−0,5)', `−${vi(data.diem.so_tru_lam_sach * 0.5)}`, 'text-[#FCA5A5]'],
                  ].map(([a, b, m]) => <div key={a} className="flex"><span className="flex-1">{a}</span><span className={cx('so font-bold text-white', m)}>{b}</span></div>)}
                </div>
              </section>
            )}
            {data.loi.length > 0 && (
              <section className="flex flex-col gap-2 rounded-3xl bg-cam-nhat p-5 text-[#3D2A06]">
                <div className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="h-5 w-5 text-cam-dam" />File tỉnh có {data.loi.length} lỗi công thức</div>
                {data.loi.map((l, i) => <div key={i} className="text-[12.5px] leading-relaxed"><b>{l.sheet}{l.o ? ` (${l.o})` : ''}:</b> {l.mo_ta}{l.anh_huong_diem && ' — ảnh hưởng điểm.'}</div>)}
                
              </section>
            )}
          </div>

          <The className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] border-collapse text-[13px]">
                <thead className="bg-nen-2 text-left text-[10.5px] tracking-wide text-mo">
                  <tr>
                    <th className="px-4 py-3">CHỈ TIÊU</th><th className="px-2 text-right">ĐÃ THỰC HIỆN / TỔNG</th><th className="w-44 px-3">TỶ LỆ · ▎GIAO ┆TB</th>
                    <th className="px-2">ĐÁNH GIÁ</th><th className="px-2 text-right">HẠNG /78</th><th className="px-2 text-right">8 PHƯỜNG</th>
                    <th className="px-2 text-right">CÒN THIẾU</th><th className="px-2">ĐẦU MỐI</th><th className="px-4 text-right">SỐ ĐƠN VỊ BÁO</th>
                  </tr>
                </thead>
                <tbody>
                  {data.kq.map((r, i) => {
                    const m = MAU_PHAN_LOAI[r.phan_loai];
                    const nhan = nhanPhanLoai(r.phan_loai, r.chieu, r.nguong_duoi);
                    const khac = !!r.danh_gia_file && phanLoaiTuChu(r.danh_gia_file) !== r.phan_loai;
                    const kc = data.kyCt.find((x) => x.chi_tieu_id === r.chi_tieu_id);
                    const pc = data.pc.filter((x) => x.chi_tieu_id === r.chi_tieu_id && x.vai === 'chu_tri');
                    const tu = data.tu.find((x) => x.chi_tieu_id === r.chi_tieu_id);
                    const phu = i > 0 && !r.tinh_diem && data.kq[i - 1].tinh_diem;
                    return (
                      <tr key={r.ma} className={cx('border-t border-[#F1EEE7] align-middle', phu && 'border-t-4 border-t-nen')}>
                        <td className="px-4 py-3">
                          <Link to={`/de-an-06/${r.ma}`} className="font-semibold text-den hover:underline">{r.chi_tieu}</Link>
                          <div className="text-[11px] text-mo">{r.tinh_diem ? 'Tính điểm' : 'Theo dõi'} · chốt {ngay(kc?.ngay_chot)}{kc && !kc.co_so_lieu_moi && ' · chưa có số mới'}</div>
                        </td>
                        <td className="so px-2 text-right text-xs">{so(r.tu_so)} / {so(r.mau_so)}</td>
                        <td className="px-3">
                          <div className={cx('so mb-1 font-bold', m.chu === 'text-white' ? 'text-nguy' : m.chu)}>{phanTram(r.ty_le)}</div>
                          <ThanhTyLe tyLe={r.chieu === 'cao_hon_tot' ? Number(r.ty_le) : Math.min(1, Number(r.ty_le) * 4)} mauThanh={m.thanh}
                            vachGiao={r.chieu === 'cao_hon_tot' ? Number(r.nguong) : null} vachTb={r.chieu === 'cao_hon_tot' ? Number(r.tb_tinh) : Number(r.tb_tinh) * 4} />
                          <div className="mt-1 text-[11px] text-mo">giao {r.chieu === 'cao_hon_tot' ? phanTram(r.nguong, 0) : 'tồn 0%'} · TB {phanTram(r.tb_tinh)}</div>
                        </td>
                        <td className="px-2"><Chip nen={m.nen} chu={m.chu}>{nhan}</Chip>{khac && <div className="mt-1 text-[11px] text-cam-dam">File ghi: {r.danh_gia_file}</div>}</td>
                        <td className="so px-2 text-right font-bold">{r.hang}</td>
                        <td className="so px-2 text-right text-mo-2">{r.loai_dia_phuong === 'phuong' ? `${r.hang_cung_loai}/${r.so_cung_loai}` : '—'}</td>
                        <td className="so px-2 text-right text-xs font-semibold text-nguy">{r.phan_loai === 'hoan_thanh' ? '—' : `${so(r.con_thieu_dat)}${r.con_thieu_vuot_tb > 0 ? ` (vượt TB: ${so(r.con_thieu_vuot_tb)})` : ''}`}</td>
                        <td className="px-2 text-xs text-mo-2">{pc.map((p) => <div key={p.don_vi.ten}>{p.don_vi.ten}{p.trang_thai === 'de_xuat' && <span className="text-cam"> (đề xuất)</span>}</div>)}</td>
                        <td className="so px-4 text-right text-xs">{tu?.ty_le != null ? <>{phanTram(tu.ty_le, 2)}<div className="font-sans text-[11px] text-mo">{ngay(tu.ngay_so_lieu)}</div></> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </The>
        </>
      )}

      <NhapFileTinh mo={nhapMo} dong={() => setNhapMo(false)} xong={(id) => { setNhapMo(false); void dsKy.taiLai(); setKyId(id); }} />
    </>
  );
}

function NhapFileTinh({ mo, dong, xong }: { mo: boolean; dong: () => void; xong: (kyId: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [ngayFile, setNgayFile] = useState('');
  const [ten, setTen] = useState('');
  const [kqDoc, setKqDoc] = useState<KetQuaDocFile | null>(null);
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [ghiChu, setGhiChu] = useState<string | null>(null);

  const doc = async (f: File, ngayChon?: string) => {
    setLoi(null); setKqDoc(null); setDangChay(true);
    try {
      const { docFileTinh, doanNgayTuTenFile } = await import('../lib/docFileTinh');
      const nam = new Date().getFullYear();
      const n = ngayChon || ngayFile || doanNgayTuTenFile(f.name, nam) || new Date().toISOString().slice(0, 10);
      const t = ten || `Đánh giá tháng ${Number(n.slice(5, 7))}/${n.slice(0, 4)}`;
      setNgayFile(n); setTen(t);
      setKqDoc(docFileTinh(new Uint8Array(await f.arrayBuffer()), f.name, n, t));
    } catch (e) { setLoi(loiDe(e)); } finally { setDangChay(false); }
  };

  const nhap = async () => {
    if (!kqDoc || !file) return;
    setDangChay(true); setLoi(null);
    try {
      const payload = { ...kqDoc, ngay_file: ngayFile, ten };
      try {
        const fd = new FormData();
        fd.append('file', file); fd.append('loai', 'file_tinh'); fd.append('thu_muc', `DeAn06/${ngayFile.slice(0, 7)}`);
        const r = await goiChucNang<{ drive_file_id: string }>('drive-upload', fd, true);
        payload.drive_file_id = r.drive_file_id;
      } catch (e) { setGhiChu(`Chưa lưu được file gốc lên Google Drive (${loiDe(e)}); số liệu vẫn được nhập.`); }
      const { data, error } = await supabase.rpc('da06_nhap_ky', { p: payload });
      if (error) throw error;
      xong(data as string);
      setFile(null); setKqDoc(null);
    } catch (e) { setLoi(loiDe(e)); } finally { setDangChay(false); }
  };

  const ndh = (ct: KetQuaDocFile['chi_tieu'][number]) => ct.dong.find((d) => d.ten === 'Phường Nam Đông Hà');

  return (
    <HopThoai mo={mo} dong={dong} tieuDe="Nhập file đánh giá Đề án 06 của tỉnh" rong="max-w-3xl">
      <div className="flex flex-col gap-4">
        {loi && <HopLoi loi={loi} />}
        {ghiChu && <div className="rounded-xl bg-cam-nhat p-3 text-sm text-cam-dam">{ghiChu}</div>}
        <O nhan="File Excel của tỉnh" goiY="Nhập lại cùng ngày sẽ thay bản cũ">
          <input type="file" accept=".xlsx,.xls" className={cx(lopO, 'py-2')} onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setTen(''); setNgayFile(''); if (f) void doc(f); }} />
        </O>
        {file && (
          <div className="grid gap-3 sm:grid-cols-2">
            <O nhan="Ngày số liệu của file"><input type="date" className={lopO} value={ngayFile} onChange={(e) => { setNgayFile(e.target.value); if (file) void doc(file, e.target.value); }} /></O>
            <O nhan="Tên kỳ đánh giá"><input className={lopO} value={ten} onChange={(e) => setTen(e.target.value)} /></O>
          </div>
        )}
        {dangChay && !kqDoc && <DangTai chu="Đang đọc file…" />}
        {kqDoc && (
          <>
            <div className="text-sm">Đọc được <b>{kqDoc.dia_phuong.length}</b> địa phương, <b>{kqDoc.chi_tieu.length}</b> chỉ tiêu. Số của Nam Đông Hà:</div>
            <div className="overflow-x-auto rounded-xl border border-vien">
              <table className="w-full text-[12.5px]">
                <thead className="bg-nen-2 text-left text-[11px] text-mo"><tr><th className="px-3 py-2">Chỉ tiêu</th><th className="px-2 text-right">Đã / Tổng</th><th className="px-2 text-right">Tỷ lệ</th><th className="px-2">Số chốt</th><th className="px-3">Đánh giá trong file</th></tr></thead>
                <tbody>
                  {kqDoc.chi_tieu.map((c) => { const d = ndh(c); return (
                    <tr key={c.ma} className="border-t border-[#F1EEE7]">
                      <td className="px-3 py-1.5 font-semibold">{c.ma}</td>
                      <td className="so px-2 text-right">{d ? `${so(d.tu)}/${so(d.mau)}` : '—'}</td>
                      <td className="so px-2 text-right">{d && d.mau ? phanTram(d.tu / d.mau) : '—'}</td>
                      <td className="px-2">{ngay(c.ngay_chot)}{!c.co_so_lieu_moi && <span className="text-cam"> · chưa có số mới</span>}</td>
                      <td className="px-3 text-mo-2">{d?.danh_gia ?? <span className="text-cam">lỗi/không có</span>}</td>
                    </tr>); })}
                </tbody>
              </table>
            </div>
            {kqDoc.loi.length > 0 && <div className="rounded-xl bg-cam-nhat p-3 text-[12.5px] text-[#3D2A06]"><b>Lỗi công thức phát hiện ({kqDoc.loi.length}):</b>{kqDoc.loi.map((l, i) => <div key={i}>• {l.sheet}: {l.mo_ta}</div>)}</div>}
            {kqDoc.canh_bao.length > 0 && <div className="rounded-xl bg-nguy-nhat p-3 text-[12.5px] text-nguy"><b>Cần kiểm tra:</b>{kqDoc.canh_bao.map((l, i) => <div key={i}>• {l}</div>)}</div>}
            <Nut kieu="chinh" dangChay={dangChay} onClick={nhap}>Ghi vào hệ thống</Nut>
          </>
        )}
      </div>
    </HopThoai>
  );
}
