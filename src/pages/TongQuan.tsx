import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { ngay, ngayGioDu, phanTram, thuNgay } from '../lib/dinhDang';
import { MAU_PHAN_LOAI, nhanPhanLoai, type KetQuaDa06 } from '../lib/da06';
import { hanNv, type TrangThaiNv } from '../lib/nhiemVu';
import { ChipHan, DangTai, DongHo, HopLoi, NhanGap, Rong, The, TheSo, ThanhTyLe, TieuDeThe, TieuDeTrang, cx } from '../components/ui';

type TinhHinh = { ky_id: string; ten: string; loai: string; han_nop: string; han_gui_tinh: string | null; so_don_vi: number; da_nop: number; da_duyet: number; can_bo_sung: number; chua_nop: number; nop_tre: number };
type NvTq = { id: string; ma: string | null; ten: string; trang_thai: TrangThaiNv; trang_thai_giao: string; nhom: string; han: string | null; qua_han: boolean; con_ngay: number | null; phan_tram: number; chu_tri_ten: string | null };
type ONop = { ky_id: string; don_vi_id: string; trang_thai: string; nop_luc: string | null; han: string; dung_han: boolean | null; don_vi: string; thu_tu: number };

async function tai() {
  const [tinhHinh, kyDa06, kyThang, nv, hop] = await Promise.all([
    supabase.from('v_tinh_hinh_nop').select('*').eq('trang_thai_ky', 'mo').order('han_nop'),
    supabase.from('da06_ky_danh_gia').select('id, ten, ngay_file').order('ngay_file', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('ky_bao_cao').select('id, ten, han_nop, tu_ngay').eq('loai', 'thang').order('tu_ngay', { ascending: false }).limit(4),
    supabase.from('v_nhiem_vu').select('id, ma, ten, trang_thai, trang_thai_giao, nhom, han, qua_han, con_ngay, phan_tram, chu_tri_ten'),
    supabase.from('v_phien_hop').select('id, ten, thoi_gian, ho_so_xong').gt('thoi_gian', new Date().toISOString()).order('thoi_gian').limit(1).maybeSingle(),
  ]);
  const ky = kq(kyDa06) as { id: string; ten: string; ngay_file: string } | null;
  const kys = (kq(kyThang) ?? []) as { id: string; ten: string; han_nop: string; tu_ngay: string }[];
  const [ketQua, diem, nop] = await Promise.all([
    ky ? supabase.from('v_da06_ket_qua').select('*').eq('ky_id', ky.id).eq('la_don_vi_minh', true).eq('tinh_diem', true).order('thu_tu') : Promise.resolve({ data: [], error: null }),
    ky ? supabase.from('v_da06_diem').select('*').eq('ky_id', ky.id).eq('la_don_vi_minh', true).maybeSingle() : Promise.resolve({ data: null, error: null }),
    kys.length ? supabase.from('v_theo_doi_nop').select('ky_id, don_vi_id, trang_thai, nop_luc, han, dung_han, don_vi, thu_tu').in('ky_id', kys.map((k) => k.id)) : Promise.resolve({ data: [], error: null }),
  ]);
  return {
    tinhHinh: (kq(tinhHinh) ?? []) as TinhHinh[],
    ky, ketQua: (kq(ketQua) ?? []) as KetQuaDa06[],
    diem: kq(diem) as { tong_diem_tinh_lai: number; tong_diem_file: number | null; hang: number; so_chua_ht: number } | null,
    kys: kys.slice().reverse(), nop: (kq(nop) ?? []) as unknown as ONop[],
    nhiemVu: (kq(nv) ?? []) as NvTq[],
    hop: hop.data as { id: string; ten: string; thoi_gian: string; ho_so_xong: number } | null,
  };
}

export default function TongQuan() {
  const { hoSo } = useAuth();
  const { data, loi, dangTai, taiLai } = useDuLieu(tai);
  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if (dangTai && !data) return <DangTai />;
  if (!data) return null;

  const gan = data.tinhHinh.find((k) => k.loai !== 'da06_tuan') ?? data.tinhHinh[0];
  const hoanThanh = data.ketQua.filter((x) => x.phan_loai === 'hoan_thanh').length;
  const nvGiao = data.nhiemVu.filter((x) => x.trang_thai_giao === 'da_duyet' && x.trang_thai !== 'tam_dung');
  const nvXong = nvGiao.filter((x) => x.trang_thai === 'hoan_thanh').length;
  const quaHanNv = nvGiao.filter((x) => x.qua_han).length;
  const choDuyet = data.nhiemVu.filter((x) => x.trang_thai_giao === 'de_xuat').length;
  const donDoc = nvGiao.filter((x) => x.trang_thai !== 'hoan_thanh' && (x.qua_han || (x.con_ngay != null && x.con_ngay <= 7)))
    .sort((a, b) => (a.con_ngay ?? 0) - (b.con_ngay ?? 0)).slice(0, 6);

  // Tỷ lệ nộp đúng hạn trên các kỳ tháng đã qua hạn
  const kyQuaHan = data.kys.filter((k) => new Date(k.han_nop) < new Date());
  const dongQuaHan = data.nop.filter((n) => kyQuaHan.some((k) => k.id === n.ky_id));
  const dungHan = dongQuaHan.filter((n) => n.dung_han).length;

  const donVi = [...new Map(data.nop.map((n) => [n.don_vi_id, { ten: n.don_vi, thu_tu: n.thu_tu }])).entries()].sort((a, b) => a[1].thu_tu - b[1].thu_tu);
  const oMau = (n?: ONop) => {
    if (!n) return 'bg-transparent';
    const quaHan = new Date(n.han) < new Date();
    if (n.nop_luc) return n.dung_han ? (n.trang_thai === 'can_bo_sung' ? 'bg-[#F59E0B]' : 'bg-xanh') : 'bg-[#F59E0B]';
    return quaHan ? 'bg-nguy' : 'border-[1.5px] border-dashed border-[#9AA1AE] bg-white';
  };

  return (
    <>
      <TieuDeTrang tren={`${thuNgay()} · ${hoSo?.ho_ten}`} ten="Tổng quan điều hành"
        phai={hoSo?.vai_tro === 'quan_tri' && <Link to="/ky-bao-cao?tao=1" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Tạo kỳ báo cáo đột xuất</Link>} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        {gan ? (
          <section className="flex flex-col gap-5 rounded-3xl bg-ink p-5 text-white sm:p-7">
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="self-start rounded-full bg-ink-2 px-3 py-1 text-[11px] font-bold tracking-wider text-[#FDE68A]">{gan.loai === 'dot_xuat' ? 'ĐỘT XUẤT' : gan.loai === 'da06_tuan' ? 'SỐ ĐỀ ÁN 06 · TUẦN' : 'ĐỊNH KỲ'}</span>
                <span className="text-xl font-bold">{gan.ten}</span>
                <span className="text-[13px] text-[#E9CBC7]">Hạn đơn vị nộp: {ngayGioDu(gan.han_nop)}</span>
              </div>
              <NhanGap han={gan.han_nop} />
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <DongHo han={gan.han_nop} />
              <div className="flex min-w-[200px] flex-1 flex-col gap-2.5">
                <div className="flex items-baseline gap-2"><span className="so text-[28px] font-bold">{gan.da_nop}/{gan.so_don_vi}</span><span className="text-[13px] text-[#E9CBC7]">đơn vị đã nộp</span></div>
                <div className="flex h-2 overflow-hidden rounded-full bg-[#3A0508]">
                  <div className="bg-[#F2C230]" style={{ width: `${((gan.da_nop - gan.can_bo_sung) / Math.max(1, gan.so_don_vi)) * 100}%` }} />
                  <div className="bg-[#F59E0B]" style={{ width: `${(gan.can_bo_sung / Math.max(1, gan.so_don_vi)) * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-3.5 text-xs text-[#F6E3E0]"><span>{gan.da_duyet} đã duyệt</span><span className="text-[#FBBF77]">{gan.can_bo_sung} cần bổ sung</span><span>{gan.chua_nop} chưa nộp</span></div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 border-t border-[#7A1A1E] pt-3.5 text-[13px] text-[#F6E3E0]">
              <span className="flex-1">{gan.han_gui_tinh ? `Gửi Công an tỉnh trước ${ngay(gan.han_gui_tinh)}` : ''}</span>
              <Link to={`/ky-bao-cao/${gan.ky_id}`} className="font-semibold text-[#FDE68A]">Xem chi tiết →</Link>
            </div>
          </section>
        ) : <Rong>Chưa có kỳ báo cáo nào đang mở.</Rong>}

        <The className="flex flex-col gap-3.5 p-5">
          <TieuDeThe phai={<Link to="/ky-bao-cao" className="text-[13px] font-semibold text-[#A4161A]">Tất cả kỳ</Link>}>Hạn sắp tới</TieuDeThe>
          {data.tinhHinh.length === 0 && <span className="text-sm text-mo">Không có hạn nào.</span>}
          {data.tinhHinh.slice(0, 5).map((k) => (
            <Link key={k.ky_id} to={`/ky-bao-cao/${k.ky_id}`} className="flex items-center gap-3 text-den">
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-nen">
                <span className="so text-[17px] font-bold leading-none">{ngay(k.han_nop).slice(0, 2)}</span>
                <span className="text-[10px] font-semibold text-mo">TH {Number(ngay(k.han_nop).slice(3, 5))}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="truncate text-sm font-semibold">{k.ten}</span><span className="text-xs text-mo">{k.da_nop}/{k.so_don_vi} đơn vị đã nộp</span></div>
              <ChipHan han={k.han_nop} />
            </Link>
          ))}
        </The>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <TheSo nhan="Điểm Đề án 06" giaTri={data.diem ? String(data.diem.tong_diem_tinh_lai).replace('.', ',') : '—'} mau="text-cam"
          phu={data.diem ? `Hạng ${data.diem.hang}/78` : 'Chưa nhập file tỉnh'} />
        <TheSo nhan="Chỉ tiêu ĐA06 hoàn thành" giaTri={`${hoanThanh}/${data.ketQua.length || 7}`} mau="text-xanh" phu={data.ky ? `Tỉnh chốt ${ngay(data.ky.ngay_file)}` : undefined} />
        <TheSo nhan="Nộp báo cáo đúng hạn" giaTri={dongQuaHan.length ? `${Math.round((dungHan / dongQuaHan.length) * 100)}%` : '—'} phu={`${dungHan}/${dongQuaHan.length} lượt nộp`} />
        <Link to="/nhiem-vu"><TheSo nhan="Nhiệm vụ BCĐ hoàn thành" giaTri={`${nvXong}/${nvGiao.length}`} mau={quaHanNv ? 'text-nguy' : 'text-den'}
          phu={[quaHanNv ? `${quaHanNv} quá hạn` : null, choDuyet ? `${choDuyet} chờ duyệt` : null].filter(Boolean).join(' · ') || 'không có việc quá hạn'} /></Link>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <The className="flex flex-col gap-3 p-5">
          <TieuDeThe phai={<Link to="/nhiem-vu" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#A4161A]">Tất cả<ArrowRight className="h-3.5 w-3.5" /></Link>}>Nhiệm vụ cần đôn đốc</TieuDeThe>
          {hoSo?.vai_tro === 'lanh_dao' && choDuyet > 0 && (
            <Link to="/nhiem-vu?tab=cho_duyet" className="rounded-xl bg-cam-nhat px-3 py-2.5 text-[13px] text-cam-dam"><b>{choDuyet} nhiệm vụ</b> chờ đồng chí duyệt giao →</Link>
          )}
          {donDoc.length === 0 ? <span className="text-sm text-mo">Không có việc sắp đến hạn.</span> : donDoc.map((n) => (
            <Link key={n.id} to={`/nhiem-vu/${n.id}`} className="flex items-center gap-3 text-den">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">{n.ten}</span>
                <span className="truncate text-xs text-mo"><span className="so">{n.ma}</span> · {n.chu_tri_ten ?? '—'} · {n.phan_tram}%</span>
              </div>
              {n.han && <ChipHan han={hanNv(n.han)} />}
            </Link>
          ))}
        </The>
        <The className="flex flex-col gap-3 p-5">
          <TieuDeThe phai={<Link to="/hop" className="text-[13px] font-semibold text-[#A4161A]">Họp BCĐ</Link>}>Phiên họp sắp tới</TieuDeThe>
          {data.hop ? (
            <Link to={`/hop/${data.hop.id}`} className="flex flex-col gap-2 text-den">
              <span className="text-[15px] font-bold">{data.hop.ten}</span>
              <span className="text-[13px] text-mo">{ngayGioDu(data.hop.thoi_gian)}</span>
              <div className="flex items-center gap-1.5">{[1, 2, 3, 4].map((i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full', i <= data.hop!.ho_so_xong ? 'bg-xanh' : 'bg-[#EEEBE3]')} />)}<span className="so ml-1 text-xs text-mo">{data.hop.ho_so_xong}/4 hồ sơ</span></div>
              <ChipHan han={data.hop.thoi_gian} className="self-start" />
            </Link>
          ) : <span className="text-sm text-mo">Chưa lên lịch phiên họp.</span>}
        </The>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <The className="flex flex-col gap-3 p-5">
          <TieuDeThe phai={<Link to="/ky-bao-cao?tab=theo_doi" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#A4161A]">Theo dõi đơn vị<ArrowRight className="h-3.5 w-3.5" /></Link>}>Nộp báo cáo tháng</TieuDeThe>
          <div className="flex flex-wrap gap-3 text-[11px] text-mo">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-xanh" />Đúng hạn</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-[#F59E0B]" />Trễ / cần bổ sung</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-nguy" />Không nộp</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded border-[1.5px] border-dashed border-[#9AA1AE]" />Đang mở</span>
          </div>
          {data.kys.length === 0 ? <Rong>Chưa có kỳ báo cáo tháng.</Rong> : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-x-2 border-spacing-y-1.5 text-[13px]">
                <thead><tr><th className="text-left text-[11px] font-semibold text-mo">ĐƠN VỊ</th>{data.kys.map((k) => <th key={k.id} className="w-14 text-center text-[11px] font-semibold text-mo">{k.ten.replace('Báo cáo tháng ', 'T')}</th>)}</tr></thead>
                <tbody>
                  {donVi.map(([id, dv]) => (
                    <tr key={id}>
                      <td className="max-w-[220px] truncate">{dv.ten}</td>
                      {data.kys.map((k) => <td key={k.id}><div className={cx('h-7 rounded-md', oMau(data.nop.find((n) => n.ky_id === k.id && n.don_vi_id === id)))} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </The>

        <The className="flex flex-col gap-3.5 p-5">
          <TieuDeThe phai={<Link to="/de-an-06" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#A4161A]">Bảng tỉnh<ArrowRight className="h-3.5 w-3.5" /></Link>}>Chỉ tiêu Đề án 06 tính điểm</TieuDeThe>
          {data.ketQua.length === 0 && <Rong>Chưa nhập file đánh giá của tỉnh.</Rong>}
          {data.ketQua.map((r) => {
            const m = MAU_PHAN_LOAI[r.phan_loai];
            return (
              <Link key={r.ma} to={`/de-an-06/${r.ma}`} className="flex flex-col gap-1.5 text-den">
                <div className="flex items-baseline gap-2 text-[13px]">
                  <span className="flex-1 font-medium">{r.chi_tieu}</span>
                  <span className={cx('so font-bold', m.chu === 'text-white' ? 'text-nguy' : m.chu)}>{phanTram(r.ty_le)}</span>
                  <span className="w-24 text-right text-xs text-mo">hạng {r.hang}/{r.so_dia_phuong}</span>
                </div>
                <ThanhTyLe tyLe={Number(r.ty_le)} mauThanh={m.thanh} vachGiao={Number(r.nguong)} vachTb={Number(r.tb_tinh)} />
                <span className="text-[11.5px] text-mo">{nhanPhanLoai(r.phan_loai, r.chieu, r.nguong_duoi)}</span>
              </Link>
            );
          })}
        </The>
      </div>
    </>
  );
}
