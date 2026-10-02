import { Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { ngay, phanTram, so } from '../lib/dinhDang';
import { MAU_PHAN_LOAI, nhanPhanLoai, type KetQuaDa06 } from '../lib/da06';
import { Chip, DangTai, HopLoi, Rong, The, ThanhTyLe, TieuDeTrang, cx } from '../components/ui';
import { chiTieuCuaDonVi, moiNhatTheoMa } from './TrangChuDonVi';

export default function ChiTieuCuaToi() {
  const { hoSo } = useAuth();
  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    const [r, pc] = await Promise.all([supabase.from('v_da06_ket_qua').select('*').eq('la_don_vi_minh', true), chiTieuCuaDonVi(hoSo?.don_vi_id ?? '')]);
    return moiNhatTheoMa(((kq(r) ?? []) as KetQuaDa06[]).filter((x) => pc.includes(x.chi_tieu_id)));
  });
  if (hoSo?.vai_tro !== 'don_vi') return <Navigate to="/de-an-06" replace />;
  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if (dangTai && !data) return <DangTai />;

  return (
    <>
      <TieuDeTrang tren={data?.[0] ? `Tỉnh chốt ${ngay(data[0].ngay_file)}` : undefined} ten="Chỉ tiêu Đề án 06 của đơn vị" />
      {data && data.length === 0 && <Rong>Chưa được giao chỉ tiêu.</Rong>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {data?.map((r) => {
          const m = MAU_PHAN_LOAI[r.phan_loai];
          return (
            <Link key={r.ma} to={`/de-an-06/${r.ma}`}>
              <The className="flex flex-col gap-2.5 p-4 text-den hover:border-ink">
                <div className="flex items-start gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[15px] font-semibold">{r.chi_tieu}</span><span className="text-xs text-mo">Hạng {r.hang}/{r.so_dia_phuong}{r.loai_dia_phuong === 'phuong' && ` · ${r.hang_cung_loai}/${r.so_cung_loai} phường`}</span></div>
                  <div className="flex flex-col items-end"><span className={cx('so text-xl font-bold', m.chu === 'text-white' ? 'text-nguy' : m.chu)}>{phanTram(r.ty_le)}</span><span className="text-[11px] text-mo">TB {phanTram(r.tb_tinh)}</span></div>
                </div>
                <ThanhTyLe tyLe={Number(r.ty_le)} mauThanh={m.thanh} vachGiao={r.chieu === 'cao_hon_tot' ? Number(r.nguong) : null} vachTb={r.chieu === 'cao_hon_tot' ? Number(r.tb_tinh) : null} />
                <div className="flex flex-wrap items-center gap-2">
                  <Chip nen={m.nen} chu={m.chu}>{nhanPhanLoai(r.phan_loai, r.chieu, r.nguong_duoi)}</Chip>
                  {r.phan_loai !== 'hoan_thanh' && <span className="text-xs font-semibold text-nguy">Còn {so(r.con_thieu_dat)} để đạt{r.con_thieu_vuot_tb > 0 && ` · ${so(r.con_thieu_vuot_tb)} để vượt TB`}</span>}
                </div>
              </The>
            </Link>
          );
        })}
      </div>
    </>
  );
}
