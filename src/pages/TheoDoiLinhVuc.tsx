// Theo dõi lĩnh vực — dành cho đơn vị đầu mối:
//   Phòng VH-XH đôn đốc NQ 57, KHCN – ĐMST, chuyển đổi số · Tổ CSKV theo dõi Đề án 06
// Xem tình hình nộp của các đơn vị, nhắc, tiếp nhận; theo dõi nhiệm vụ lĩnh vực; lập báo cáo tổng hợp gửi Thường trực BCĐ.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Bell, ChevronRight, FileText } from 'lucide-react';
import { loiDe, supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { dauMoiDa06, tenLinhVucDauMoi, useAuth } from '../lib/auth';
import { ngay, ngayGioDu } from '../lib/dinhDang';
import { COT_NV, LINH_VUC, TT_NV, type NhiemVu } from '../lib/nhiemVu';
import { MAU_PHAN_LOAI, nhanPhanLoai, type KetQuaDa06 } from '../lib/da06';
import { Chip, ChipHan, DangTai, HopLoi, Rong, The, TieuDeThe, TieuDeTrang, cx } from '../components/ui';
import { HanNv, ThanhNv } from './NhiemVu';
import { TT_NOP } from './KyBaoCaoChiTiet';
import { moiNhatTheoMa } from './TrangChuDonVi';

type Ky = { ky_id: string; ten: string; loai: string; han_nop: string; so_don_vi: number; da_nop: number; da_duyet: number; can_bo_sung: number; chua_nop: number; nop_tre: number };
type BaiLv = { id: string; trang_thai: string; nop_luc: string | null; han_rieng: string | null; ky_bao_cao: { ten: string; han_nop: string; trang_thai: string } };
const LOAI: Record<string, string> = { thang: 'THÁNG', dot_xuat: 'ĐỘT XUẤT', da06_tuan: 'SỐ ĐA06 · TUẦN', quy: 'QUÝ', sau_thang: '6 THÁNG', nam: 'NĂM' };

export default function TheoDoiLinhVuc() {
  const { hoSo } = useAuth();
  const da06 = dauMoiDa06(hoSo);
  const lv = hoSo?.dau_moi ?? [];
  const dv = hoSo?.don_vi_id ?? '';
  const [thongBao, setThongBao] = useState<string | null>(null);

  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.from('v_tinh_hinh_nop').select('*').eq('cap', 'don_vi').eq('trang_thai_ky', 'mo').order('han_nop'),
      supabase.from('nop_bao_cao').select('id, trang_thai, nop_luc, han_rieng, ky_bao_cao!inner(ten, han_nop, trang_thai, cap)').eq('don_vi_id', dv).eq('ky_bao_cao.cap', 'linh_vuc').order('ky_id').limit(20),
      supabase.from('v_nhiem_vu').select(COT_NV).in('linh_vuc', lv).eq('trang_thai_giao', 'da_duyet').order('han', { nullsFirst: false }),
      da06 ? supabase.from('v_da06_ket_qua').select('*').eq('la_don_vi_minh', true).eq('tinh_diem', true) : Promise.resolve({ data: [], error: null }),
    ]);
    const ky = ((kq(a) ?? []) as Ky[]).filter((k) => k.loai !== 'da06_tuan' || da06);
    const bai = ((kq(b) ?? []) as unknown as BaiLv[]).sort((x, y) => y.ky_bao_cao.han_nop.localeCompare(x.ky_bao_cao.han_nop));
    return { ky, bai, nv: (kq(c) ?? []) as unknown as NhiemVu[], chiTieu: moiNhatTheoMa((kq(d) ?? []) as KetQuaDa06[]) };
  }, [dv]);

  const nhacNv = async (n: NhiemVu) => {
    if (!n.chu_tri_don_vi_id) return;
    const { error } = await supabase.from('thong_bao').insert({
      don_vi_id: n.chu_tri_don_vi_id, tieu_de: `Đôn đốc: ${n.ten}`,
      noi_dung: `${hoSo?.don_vi?.ten} đề nghị cập nhật tiến độ${n.han ? `, hạn ${ngay(n.han)}` : ''}.`, duong_dan: `/nhiem-vu/${n.id}`,
    });
    setThongBao(error ? loiDe(error) : `Đã nhắc ${n.chu_tri_ten}`);
  };

  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if (dangTai && !data) return <DangTai />;
  if (!data) return null;
  const dangLam = data.nv.filter((n) => !['hoan_thanh', 'tam_dung'].includes(n.trang_thai));
  const quaHan = dangLam.filter((n) => n.qua_han);
  const baiMo = data.bai.find((b) => b.ky_bao_cao.trang_thai === 'mo');

  return (
    <>
      <TieuDeTrang tren={`Đầu mối: ${tenLinhVucDauMoi(hoSo)}`} ten="Theo dõi lĩnh vực" />
      {thongBao && <div role="status" className="rounded-xl bg-xanh-nhat px-4 py-3 text-sm text-xanh">{thongBao}</div>}

      {/* Báo cáo tổng hợp gửi Thường trực BCĐ */}
      {baiMo && (
        <Link to={`/viec-can-nop/${baiMo.id}`} className="flex flex-wrap items-center gap-4 rounded-2xl bg-ink px-5 py-4 text-white">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-wider text-[#E9CBC7]">BÁO CÁO TỔNG HỢP GỬI THƯỜNG TRỰC BCĐ</span>
            <span className="text-lg font-bold">{baiMo.ky_bao_cao.ten}</span>
            <span className="text-[13px] text-[#F6E3E0]">Hạn {ngayGioDu(baiMo.han_rieng ?? baiMo.ky_bao_cao.han_nop)} · {TT_NOP[baiMo.trang_thai].nhan}</span>
          </div>
          {['chua_nop', 'nhap', 'can_bo_sung'].includes(baiMo.trang_thai) ? <ChipHan han={baiMo.han_rieng ?? baiMo.ky_bao_cao.han_nop} /> : <Chip nen="bg-white/15" chu="text-white">{TT_NOP[baiMo.trang_thai].nhan}</Chip>}
          <ChevronRight className="h-5 w-5 text-[#E9CBC7]" />
        </Link>
      )}

      {/* Tình hình nộp của các đơn vị */}
      <The className="flex flex-col gap-3 p-4">
        <TieuDeThe>Báo cáo của các đơn vị</TieuDeThe>
        {data.ky.length === 0 ? <Rong>Không có kỳ báo cáo đang mở.</Rong> : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {data.ky.map((k) => {
              const cho = k.da_nop - k.da_duyet;
              return (
                <Link key={k.ky_id} to={`/ky-bao-cao/${k.ky_id}`} className="flex flex-col gap-2 rounded-xl border border-vien p-3.5 text-den hover:border-ink">
                  <div className="flex items-center gap-2"><span className="text-[10.5px] font-bold tracking-wider text-mo">{LOAI[k.loai] ?? k.loai}</span><span className="flex-1" /><ChipHan han={k.han_nop} /></div>
                  <span className="text-[15px] font-bold">{k.ten}</span>
                  <div className="h-1.5 rounded-full bg-[#EEEBE3]"><div className="h-1.5 rounded-full bg-xanh" style={{ width: `${(k.da_nop / Math.max(1, k.so_don_vi)) * 100}%` }} /></div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-mo">
                    <span className="flex-1">{k.da_nop}/{k.so_don_vi} đã nộp{k.nop_tre ? ` · ${k.nop_tre} trễ` : ''}</span>
                    {cho > 0 && <Chip nen="bg-[#E7E5DF]" chu="text-den">{cho} chờ tiếp nhận</Chip>}
                    {k.chua_nop > 0 && <Chip nen="bg-cam-nhat" chu="text-cam-dam">{k.chua_nop} chưa nộp</Chip>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </The>

      {/* Chỉ tiêu Đề án 06 (CSKV) */}
      {da06 && (
        <The className="flex flex-col gap-3 p-4">
          <TieuDeThe phai={<Link to="/de-an-06" className="flex items-center gap-1 text-[13px] font-semibold text-[#A4161A]"><BarChart3 className="h-4 w-4" />Bảng Đề án 06</Link>}>
            Chỉ tiêu Đề án 06 của phường{data.chiTieu[0] ? ` · tỉnh chốt ${ngay(data.chiTieu[0].ngay_file)}` : ''}
          </TieuDeThe>
          {data.chiTieu.length === 0 ? <Rong>Chưa có số liệu tỉnh.</Rong> : (
            <div className="flex flex-wrap gap-2">
              {data.chiTieu.map((c) => {
                const m = MAU_PHAN_LOAI[c.phan_loai];
                return (
                  <Link key={c.ma} to={`/de-an-06/${c.ma}`} className={cx('flex flex-col rounded-xl px-3 py-2 text-xs', m.nen, m.chu)}>
                    <span className="font-bold">{c.ma}</span><span>{nhanPhanLoai(c.phan_loai, c.chieu, c.nguong_duoi)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </The>
      )}

      {/* Nhiệm vụ lĩnh vực */}
      <The className="flex flex-col gap-3 p-4">
        <TieuDeThe>Nhiệm vụ lĩnh vực · {dangLam.length} đang thực hiện{quaHan.length ? ` · ${quaHan.length} quá hạn` : ''}</TieuDeThe>
        {dangLam.length === 0 ? <Rong>Không có nhiệm vụ đang thực hiện.</Rong> : (
          <ul className="m-0 flex list-none flex-col p-0">
            {dangLam.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[#F1EEE7] py-3 last:border-0">
                <Link to={`/nhiem-vu/${n.id}`} className="flex min-w-0 flex-1 basis-64 flex-col gap-1 text-den">
                  <span className="text-[14px] font-semibold leading-snug">{n.ten}</span>
                  <span className="text-xs text-mo">{n.chu_tri_ten ?? '—'} · {LINH_VUC[n.linh_vuc]} · {TT_NV[n.trang_thai].nhan}</span>
                  <ThanhNv n={n} />
                </Link>
                <HanNv n={n} />
                {n.chu_tri_don_vi_id && n.chu_tri_don_vi_id !== dv && (
                  <button onClick={() => nhacNv(n)} aria-label={`Nhắc ${n.chu_tri_ten}`} className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-nguy hover:bg-nguy-nhat"><Bell className="h-4 w-4" />Nhắc</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </The>

      {data.bai.filter((b) => b !== baiMo).length > 0 && (
        <The className="flex flex-col gap-2 p-4">
          <TieuDeThe>Báo cáo tổng hợp đã gửi</TieuDeThe>
          {data.bai.filter((b) => b !== baiMo).slice(0, 6).map((b) => (
            <Link key={b.id} to={`/viec-can-nop/${b.id}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-den hover:bg-nen">
              <FileText className="h-4 w-4 text-mo" /><span className="flex-1">{b.ky_bao_cao.ten}</span>
              <Chip nen={TT_NOP[b.trang_thai].nen} chu={TT_NOP[b.trang_thai].chu}>{TT_NOP[b.trang_thai].nhan}</Chip>
            </Link>
          ))}
        </The>
      )}
    </>
  );
}
