import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { loiDe, supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { homNayVN, ngay, ngayGioDu, phanTram, so } from '../lib/dinhDang';
import { conThieu, MAU_PHAN_LOAI, nhanPhanLoai, phanLoai, type KetQuaDa06 } from '../lib/da06';
import { Chip, ChipHan, DangTai, HopLoi, lopO, Nut, O, Rong, The, TieuDeThe, TieuDeTrang, cx } from '../components/ui';
import { TT_NOP } from './KyBaoCaoChiTiet';
import TepDinhKem, { type Tep } from '../components/TepDinhKem';
import { moiNhatTheoMa } from './TrangChuDonVi';
import OVanBanPdf, { COT_VB_NOP, kiemTraMeta, linkXemDrive, metaTuVanBan, taiPdfLenDrive, ThongTinVanBan, type VanBanDaNop } from '../components/VanBanPdf';
import type { MetaVb } from '../lib/docPdf';
import type { TruongMau } from '../lib/baoCaoA4';

type Truong = TruongMau;
type Nop = {
  id: string; ky_id: string; don_vi_id: string; trang_thai: string; so_lieu: Record<string, string>; nop_luc: string | null; y_kien_duyet: string | null; han_rieng: string | null; nop_ngoai: boolean;
  ky_bao_cao: { id: string; ten: string; loai: string; han_nop: string; trang_thai: string; tu_ngay: string | null; den_ngay: string | null; yeu_cau: string | null; cap: string; ky_cha_id: string | null; hinh_thuc: string | null; mau_bieu: { truong: Truong[]; hinh_thuc: string } | null };
  don_vi: { ten: string }; tep: Tep[]; van_ban: VanBanDaNop | null;
};

export default function NopBaoCao() {
  const { id } = useParams();
  const { hoSo } = useAuth();
  const { data, loi, dangTai, taiLai } = useDuLieu(async () =>
    kq(await supabase.from('nop_bao_cao')
      .select(`id, ky_id, don_vi_id, trang_thai, so_lieu, nop_luc, y_kien_duyet, han_rieng, nop_ngoai, ky_bao_cao(id, ten, loai, han_nop, trang_thai, tu_ngay, den_ngay, yeu_cau, cap, ky_cha_id, hinh_thuc, mau_bieu(truong, hinh_thuc)), don_vi(ten), tep(id, drive_file_id, ten), van_ban!nop_bao_cao_van_ban_id_fkey(${COT_VB_NOP})`)
      .eq('id', id!).single()) as unknown as Nop, [id]);

  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if (dangTai && !data) return <DangTai />;
  if (!data) return null;
  const ky = data.ky_bao_cao;
  const suaDuoc = hoSo?.don_vi_id === data.don_vi_id && ky.trang_thai === 'mo' && ['chua_nop', 'nhap', 'can_bo_sung'].includes(data.trang_thai);
  const tt = TT_NOP[data.trang_thai];
  const han = data.han_rieng ?? ky.han_nop;
  const rutDuoc = hoSo?.don_vi_id === data.don_vi_id && ky.trang_thai === 'mo' && data.trang_thai === 'da_nop' && !data.nop_ngoai;
  const rutLai = async () => {
    if (!window.confirm('Rút lại báo cáo để sửa? Nhớ gửi lại trước hạn.')) return;
    const { error } = await supabase.from('nop_bao_cao').update({ trang_thai: 'nhap' }).eq('id', data.id);
    if (error) window.alert(loiDe(error)); else void taiLai();
  };

  return (
    <>
      <TieuDeTrang tren={<><Link to="/viec-can-nop" className="text-mo">Việc cần nộp</Link> / {data.don_vi.ten}{ky.tu_ngay && ` · kỳ ${ngay(ky.tu_ngay)} – ${ngay(ky.den_ngay)}`}</>}
        ten={ky.ten} phai={<Chip nen={tt.nen} chu={tt.chu} className="px-3 py-1.5">{tt.nhan}</Chip>} />
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white">
        <span className="flex-1 text-[13px] text-[#F6E3E0]">Hạn nộp {ngayGioDu(han)}{data.han_rieng && ' (đã gia hạn)'}</span>
        {ky.trang_thai === 'mo' ? <ChipHan han={han} /> : <Chip>Kỳ đã khoá</Chip>}
        {rutDuoc && <button onClick={rutLai} className="min-h-9 rounded-lg bg-white/10 px-3 text-[13px] font-semibold text-white hover:bg-white/20">Rút lại để sửa</button>}
      </div>
      {ky.yeu_cau && <div className="whitespace-pre-line rounded-xl bg-nen-3 px-4 py-3 text-sm"><b>Yêu cầu:</b> {ky.yeu_cau}</div>}
      {data.trang_thai === 'can_bo_sung' && data.y_kien_duyet && <div className="rounded-xl bg-cam-nhat p-4 text-sm text-cam-dam"><b>Cần bổ sung:</b> {data.y_kien_duyet}</div>}
      {data.trang_thai === 'da_duyet' && <div className="rounded-xl bg-xanh-nhat p-4 text-sm text-xanh">Đã được duyệt{data.y_kien_duyet ? `: ${data.y_kien_duyet}` : ''}.</div>}
      {ky.loai === 'da06_tuan'
        ? <NhapSoDa06 nop={data} suaDuoc={suaDuoc} xong={taiLai} />
        : <FormBaoCao nop={data} suaDuoc={suaDuoc} xong={taiLai} />}
    </>
  );
}

// ---------------------------------------------------------------- Báo cáo: văn bản PDF đã ký hoặc phiếu số liệu
const TRUONG_MD: Truong[] = [{ ma: 'tep_bao_cao', nhan: 'Tài liệu kèm theo (nếu có)', kieu: 'tep' }];

function FormBaoCao({ nop, suaDuoc, xong }: { nop: Nop; suaDuoc: boolean; xong: () => void }) {
  const nav = useNavigate();
  const ky = nop.ky_bao_cao;
  const truong = ky.mau_bieu?.truong?.length ? ky.mau_bieu.truong : TRUONG_MD;
  const laVanBan = (ky.hinh_thuc ?? ky.mau_bieu?.hinh_thuc ?? 'van_ban') !== 'phieu';
  const laLinhVuc = ky.cap === 'linh_vuc';
  const [gt, setGt] = useState<Record<string, string>>(nop.so_lieu ?? {});
  const [meta, setMeta] = useState<MetaVb>(() => ({ ...metaTuVanBan(nop.van_ban), co_quan_ban_hanh: nop.van_ban?.co_quan_ban_hanh ?? nop.don_vi.ten }));
  const [tep, setTep] = useState<File | null>(null);
  const [doiChua, setDoiChua] = useState(false);
  const [camKet, setCamKet] = useState(false);
  const [dangChay, setDangChay] = useState<'nhap' | 'nop' | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  useEffect(() => { setGt(nop.so_lieu ?? {}); setDoiChua(false); setTep(null); setMeta({ ...metaTuVanBan(nop.van_ban), co_quan_ban_hanh: nop.van_ban?.co_quan_ban_hanh ?? nop.don_vi.ten }); }, [nop]);

  const oSo = truong.filter((t) => t.kieu === 'so' || t.kieu === 'ty_le');
  const oChu = laVanBan ? [] : truong.filter((t) => t.kieu === 'van_ban');
  const tepPhu = truong.filter((t) => t.kieu === 'tep');
  const sua = (k: string, v: string) => { setGt((x) => ({ ...x, [k]: v })); setDoiChua(true); };

  const luu = async (tt: 'nhap' | 'da_nop') => {
    setLoi(null);
    if (tt === 'da_nop') {
      const thieu = truong.filter((t) => t.bat_buoc && t.kieu !== 'tep' && !(laVanBan && t.kieu === 'van_ban') && !String(gt[t.ma] ?? '').trim());
      if (thieu.length) { setLoi(`Còn thiếu: ${thieu.map((t) => t.nhan).join(', ')}`); return; }
      if (laVanBan) {
        if (!tep && !nop.van_ban) { setLoi('Chọn tệp PDF văn bản đã ký, đóng dấu'); return; }
        const l = kiemTraMeta(meta); if (l) { setLoi(l); return; }
      }
      if (!camKet) { setLoi('Tích ô xác nhận trước khi gửi'); return; }
    } else if (laVanBan && meta.mat) { setLoi('Văn bản có độ mật — không nộp lên hệ thống.'); return; }
    setDangChay(tt === 'nhap' ? 'nhap' : 'nop');
    try {
      if (laVanBan && (tep || (nop.van_ban && doiChua))) {
        const l = kiemTraMeta(meta, false); if (l) throw new Error(l);
        const len = tep ? await taiPdfLenDrive(tep, 'van_ban_nop', { nopId: nop.id, thuMuc: `${ky.ten}/${nop.don_vi.ten}` }) : null;
        const { error } = await supabase.rpc('nop_gan_van_ban', { p_nop: nop.id, p: {
          ...meta, noi_dung: tep ? meta.noi_dung : null, drive_file_id: len?.drive_file_id ?? '', drive_url: len?.url ?? '', ten_tep: tep?.name ?? '',
        } });
        if (error) throw error;
      }
      const { error } = await supabase.from('nop_bao_cao').update({ so_lieu: gt, trang_thai: tt }).eq('id', nop.id);
      if (error) throw error;
      setDoiChua(false); setTep(null);
      if (tt === 'da_nop') nav('/viec-can-nop'); else xong();
    } catch (e) { setLoi(loiDe(e)); } finally { setDangChay(null); }
  };

  return (
    <>
      {laLinhVuc && ky.ky_cha_id && <BaiDonViDaNhan kyChaId={ky.ky_cha_id} />}
      {laVanBan && (
        <The className="flex flex-col gap-3 p-4">
          <TieuDeThe>{laLinhVuc ? 'Báo cáo tổng hợp đã ký, đóng dấu' : 'Báo cáo đã ký, đóng dấu'}</TieuDeThe>
          {suaDuoc
            ? <OVanBanPdf meta={meta} doiMeta={(m) => { setMeta(m); setDoiChua(true); }} tep={tep} driveId={nop.van_ban?.drive_file_id}
                chonTep={(f, m) => { setTep(f); setMeta(m); setDoiChua(true); }} />
            : nop.van_ban ? <ThongTinVanBan vb={nop.van_ban} /> : <Rong>{nop.nop_ngoai ? 'Nộp ngoài hệ thống.' : 'Chưa có văn bản.'}</Rong>}
        </The>
      )}
      {(oSo.length > 0 || oChu.length > 0) && (
        <The className="flex flex-col gap-4 p-4">
          {laVanBan && <TieuDeThe>Số liệu</TieuDeThe>}
          {[...oChu, ...oSo].map((t) => (
            <O key={t.ma} nhan={`${t.nhan}${t.bat_buoc ? ' *' : ''}${t.don_vi_tinh ? ` (${t.don_vi_tinh})` : ''}`}>
              {t.kieu === 'van_ban'
                ? <textarea disabled={!suaDuoc} className={cx(lopO, 'min-h-24 py-2.5')} value={gt[t.ma] ?? ''} onChange={(e) => sua(t.ma, e.target.value)} />
                : <input disabled={!suaDuoc} type="number" inputMode="decimal" className={cx(lopO, 'so max-w-60 text-lg font-bold')} value={gt[t.ma] ?? ''} onChange={(e) => sua(t.ma, e.target.value)} />}
            </O>
          ))}
        </The>
      )}
      {tepPhu.map((t) => (
        <The key={t.ma} className="flex flex-col gap-2 p-4">
          <span className="text-[13px] font-semibold text-mo-2">{t.nhan}{t.bat_buoc ? ' *' : ''}</span>
          <TepDinhKem thuMuc={`${ky.ten}/${nop.don_vi.ten}`} loai="nop_bao_cao" dichId={nop.id} suaDuoc={suaDuoc} tep={nop.tep} xong={xong} />
        </The>
      ))}
      {suaDuoc && (
        <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-2xl border border-vien bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
          {loi && <HopLoi loi={loi} />}
          <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-mo-2">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-ink" checked={camKet} onChange={(e) => setCamKet(e.target.checked)} />
            {laVanBan ? 'Văn bản đã ký, đóng dấu; không có nội dung mật.' : 'Thủ trưởng đơn vị đã duyệt; không có nội dung mật.'}
          </label>
          <div className="flex items-center gap-2.5">
            <Nut dangChay={dangChay === 'nhap'} onClick={() => luu('nhap')}>{doiChua ? 'Lưu nháp' : 'Đã lưu'}</Nut>
            <Nut kieu="chinh" className="flex-1" dangChay={dangChay === 'nop'} onClick={() => luu('da_nop')}>{laLinhVuc ? 'Gửi Thường trực BCĐ' : 'Gửi báo cáo'}</Nut>
          </div>
        </div>
      )}
    </>
  );
}

// Đầu mối: danh sách báo cáo đơn vị trong kỳ để làm căn cứ tổng hợp
function BaiDonViDaNhan({ kyChaId }: { kyChaId: string }) {
  const { hoSo } = useAuth();
  const { data } = useDuLieu(async () => (kq(await supabase.from('nop_bao_cao')
    .select(`id, trang_thai, don_vi_id, don_vi(ten, thu_tu), van_ban!nop_bao_cao_van_ban_id_fkey(${COT_VB_NOP})`).eq('ky_id', kyChaId)) ?? []) as unknown as
    { id: string; trang_thai: string; don_vi_id: string; don_vi: { ten: string; thu_tu: number }; van_ban: VanBanDaNop | null }[], [kyChaId]);
  const ds = (data ?? []).filter((x) => x.don_vi_id !== hoSo?.don_vi_id).sort((a, b) => a.don_vi.thu_tu - b.don_vi.thu_tu);
  if (!ds.length) return null;
  return (
    <The className="flex flex-col gap-2 p-4">
      <TieuDeThe>Báo cáo của các đơn vị · {ds.filter((x) => ['da_nop', 'da_duyet'].includes(x.trang_thai)).length}/{ds.length} đã gửi</TieuDeThe>
      <ul className="m-0 flex list-none flex-col p-0">
        {ds.map((x) => {
          const link = x.van_ban ? (x.van_ban.drive_url || linkXemDrive(x.van_ban.drive_file_id)) : null;
          return (
            <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#F1EEE7] py-2.5 text-[13px] last:border-0">
              <span className="w-44 shrink-0 font-semibold">{x.don_vi.ten}</span>
              <span className="min-w-0 flex-1">
                {x.van_ban ? <>{link ? <a href={link} target="_blank" rel="noreferrer" className="so font-bold text-[#A4161A]">{x.van_ban.so_ky_hieu ?? 'Văn bản'}</a> : <b className="so">{x.van_ban.so_ky_hieu}</b>} · {x.van_ban.trich_yeu}</> : <span className="text-mo">—</span>}
              </span>
              <Chip nen={TT_NOP[x.trang_thai].nen} chu={TT_NOP[x.trang_thai].chu}>{TT_NOP[x.trang_thai].nhan}</Chip>
            </li>
          );
        })}
      </ul>
    </The>
  );
}

// ---------------------------------------------------------------- Số Đề án 06 tự theo dõi
type Pc = { chi_tieu_id: string; da06_chi_tieu: { id: string; ma: string; ten: string; nhan_tu_so: string; nhan_mau_so: string; mau_so_tinh_cap: boolean; chieu: 'cao_hon_tot' | 'thap_hon_tot'; nhan_cao_hon_tb: boolean } };
type SoDv = { id: string; chi_tieu_id: string; tu_so: number; mau_so: number; ngay_so_lieu: string; trang_thai: string; tep: Tep[] };

function NhapSoDa06({ nop, suaDuoc, xong }: { nop: Nop; suaDuoc: boolean; xong: () => void }) {
  const nav = useNavigate();
  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('da06_phan_cong').select('chi_tieu_id, da06_chi_tieu(id, ma, ten, nhan_tu_so, nhan_mau_so, mau_so_tinh_cap, chieu, nhan_cao_hon_tb)')
        .eq('don_vi_id', nop.don_vi_id).eq('trang_thai', 'da_duyet').eq('vai', 'chu_tri'),
      supabase.from('v_da06_ket_qua').select('*').eq('la_don_vi_minh', true),
      supabase.from('da06_so_lieu_don_vi').select('id, chi_tieu_id, tu_so, mau_so, ngay_so_lieu, trang_thai, tep(id, drive_file_id, ten)').eq('ky_bao_cao_id', nop.ky_id).eq('don_vi_id', nop.don_vi_id),
    ]);
    return { pc: (kq(a) ?? []) as unknown as Pc[], tinh: moiNhatTheoMa((kq(b) ?? []) as KetQuaDa06[]), da: (kq(c) ?? []) as unknown as SoDv[] };
  }, [nop.id]);

  const [gt, setGt] = useState<Record<string, { tu: string; mau: string; ngay: string }>>({});
  const [dangChay, setDangChay] = useState<'nhap' | 'gui' | null>(null);
  const [loiLuu, setLoiLuu] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const g: typeof gt = {};
    for (const p of data.pc) {
      const cu = data.da.find((x) => x.chi_tieu_id === p.chi_tieu_id);
      const t = data.tinh.find((x) => x.chi_tieu_id === p.chi_tieu_id);
      g[p.chi_tieu_id] = { tu: String(cu?.tu_so ?? t?.tu_so ?? ''), mau: String(cu?.mau_so ?? t?.mau_so ?? ''), ngay: cu?.ngay_so_lieu ?? homNayVN() };
    }
    setGt(g);
  }, [data]);

  const dong = useMemo(() => (data?.pc ?? []).map((p) => {
    const ct = p.da06_chi_tieu;
    const t = data!.tinh.find((x) => x.chi_tieu_id === p.chi_tieu_id);
    const v = gt[p.chi_tieu_id] ?? { tu: '', mau: '', ngay: '' };
    const tu = Number(v.tu), mau = ct.mau_so_tinh_cap && t ? Number(t.mau_so) : Number(v.mau);
    const tyLe = mau > 0 && v.tu !== '' ? tu / mau : null;
    const pl = t && tyLe != null ? phanLoai(tyLe, Number(t.nguong), t.nguong_duoi != null ? Number(t.nguong_duoi) : null, Number(t.tb_tinh), ct.chieu, ct.nhan_cao_hon_tb) : null;
    return { p, ct, t, v, tu, mau, tyLe, pl, cu: data!.da.find((x) => x.chi_tieu_id === p.chi_tieu_id) };
  }), [data, gt]);

  const luu = async (tt: 'nhap' | 'da_gui') => {
    setLoiLuu(null);
    if (dong.some((d) => d.tyLe == null)) { setLoiLuu('Nhập đủ số liệu cho tất cả chỉ tiêu'); return; }
    const bat = dong.filter((d) => d.tyLe != null && d.tyLe > 1 && d.t && Number(d.t.ty_le) <= 1);
    if (tt === 'da_gui' && bat.length && !window.confirm(`${bat.length} chỉ tiêu có tỷ lệ trên 100%. Vẫn gửi?`)) return;
    setDangChay(tt === 'nhap' ? 'nhap' : 'gui');
    try {
      const { error } = await supabase.from('da06_so_lieu_don_vi').upsert(dong.map((d) => ({
        ky_bao_cao_id: nop.ky_id, chi_tieu_id: d.p.chi_tieu_id, don_vi_id: nop.don_vi_id,
        ngay_so_lieu: d.v.ngay || homNayVN(), tu_so: d.tu, mau_so: d.mau, trang_thai: tt,
      })), { onConflict: 'ky_bao_cao_id,chi_tieu_id,don_vi_id' });
      if (error) throw error;
      if (tt === 'da_gui') {
        const r = await supabase.from('nop_bao_cao').update({ trang_thai: 'da_nop' }).eq('id', nop.id);
        if (r.error) throw r.error;
        nav('/viec-can-nop');
      } else { void taiLai(); xong(); }
    } catch (e) { setLoiLuu(loiDe(e)); } finally { setDangChay(null); }
  };

  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if (dangTai && !data) return <DangTai />;
  if (!data) return null;
  if (data.pc.length === 0) return <Rong>Đơn vị chưa được giao chỉ tiêu Đề án 06.</Rong>;

  return (
    <>
      {suaDuoc && <p className="m-0 text-[13px] text-mo">Nhập số mới nhất từ phần mềm nguồn. Ô đang điền sẵn số tỉnh chốt gần nhất.</p>}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {dong.map(({ p, ct, t, v, tu, mau, tyLe, pl, cu }) => {
          const m = pl ? MAU_PHAN_LOAI[pl] : null;
          const cheo = tyLe != null && t ? tyLe - Number(t.ty_le) : 0;
          return (
            <The key={p.chi_tieu_id} className="flex flex-col gap-3.5 p-4">
              <div className="flex flex-col-reverse items-start gap-2 sm:flex-row sm:gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-bold">{ct.ten}</span>
                  {t && <span className="so text-xs text-mo">Tỉnh chốt {ngay(t.ngay_file)}: {so(t.tu_so)}/{so(t.mau_so)} = {phanTram(t.ty_le)} · TB tỉnh {phanTram(t.tb_tinh)}</span>}
                </div>
                {m && pl && <Chip nen={m.nen} chu={m.chu}>Dự kiến: {nhanPhanLoai(pl, ct.chieu, t?.nguong_duoi ?? null)}</Chip>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <O nhan={ct.nhan_mau_so} goiY={ct.mau_so_tinh_cap ? 'Số tỉnh cấp' : undefined}>
                  <input className={cx(lopO, 'so text-lg font-bold')} type="number" inputMode="numeric" disabled={!suaDuoc || ct.mau_so_tinh_cap}
                    value={ct.mau_so_tinh_cap && t ? String(t.mau_so) : v.mau} onChange={(e) => setGt({ ...gt, [p.chi_tieu_id]: { ...v, mau: e.target.value } })} />
                </O>
                <O nhan={ct.nhan_tu_so}>
                  <input className={cx(lopO, 'so border-2 border-do bg-white text-lg font-bold')} type="number" inputMode="numeric" disabled={!suaDuoc}
                    value={v.tu} onChange={(e) => setGt({ ...gt, [p.chi_tieu_id]: { ...v, tu: e.target.value } })} />
                </O>
              </div>
              {ct.chieu === 'cao_hon_tot' && t && v.tu !== '' && tu < Number(t.tu_so) && (
                <div className="rounded-lg bg-cam-nhat px-3 py-2 text-xs font-semibold text-cam-dam">Thấp hơn số tỉnh đã chốt ({so(t.tu_so)}) — kiểm tra lại.</div>
              )}
              {tyLe != null && tyLe > 1 && t && Number(t.ty_le) <= 1 && (
                <div className="rounded-lg bg-cam-nhat px-3 py-2 text-xs font-semibold text-cam-dam">Số “{ct.nhan_tu_so}” lớn hơn “{ct.nhan_mau_so}” — kiểm tra lại số liệu.</div>
              )}
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-ink p-3 text-white">
                <div className="flex flex-col"><span className="text-[10.5px] font-semibold text-[#E9CBC7]">TỶ LỆ ƯỚC TÍNH</span><span className="so text-[22px] font-bold">{tyLe != null ? phanTram(tyLe, 2) : '—'}</span></div>
                <div className="flex flex-1 flex-col items-end text-xs text-[#F6E3E0]">
                  {t && tyLe != null && <span className={cheo >= 0 ? 'text-[#FDE68A]' : 'text-[#FCA5A5]'}>{cheo >= 0 ? '▲ +' : '▼ '}{(cheo * 100).toFixed(2).replace('.', ',')} điểm % so với số tỉnh</span>}
                  {t && tyLe != null && mau > 0 && pl !== 'hoan_thanh' && (
                    <span>Còn {so(conThieu(tu, mau, Number(t.tb_tinh), ct.chieu))} để vượt TB · {so(conThieu(tu, mau, Number(t.nguong), ct.chieu))} để đạt mức giao</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                <O nhan="Số liệu đến ngày"><input type="date" className={lopO} disabled={!suaDuoc} value={v.ngay} onChange={(e) => setGt({ ...gt, [p.chi_tieu_id]: { ...v, ngay: e.target.value } })} /></O>
                {cu && <span className="pb-3 text-xs text-mo">{cu.trang_thai === 'da_gui' ? 'Đã gửi' : 'Đã lưu nháp'}</span>}
              </div>
              {cu ? <O nhan="Minh chứng"><TepDinhKem thuMuc={`${nop.ky_bao_cao.ten}/${nop.don_vi.ten}`} loai="so_lieu_da06" dichId={cu.id} suaDuoc={suaDuoc} tep={cu.tep} xong={taiLai} /></O>
                : suaDuoc && <span className="text-xs text-mo">Lưu nháp để đính kèm minh chứng.</span>}
            </The>
          );
        })}
      </div>
      {loiLuu && <HopLoi loi={loiLuu} />}
      {suaDuoc && (
        <div className="sticky bottom-20 flex gap-2.5 rounded-2xl bg-nen/90 py-2 backdrop-blur lg:bottom-4">
          <Nut dangChay={dangChay === 'nhap'} onClick={() => luu('nhap')}>Lưu nháp</Nut>
          <Nut kieu="chinh" className="flex-1" dangChay={dangChay === 'gui'} onClick={() => luu('da_gui')}>Gửi Cơ quan Thường trực</Nut>
        </div>
      )}
    </>
  );
}
