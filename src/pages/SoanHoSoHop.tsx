// Soạn 1 trong 4 hồ sơ phiên họp BCĐ trên trang A4 (tờ trình, giấy mời, báo cáo, thông báo kết luận)
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { COT_NV, TT_NV, type NhiemVu } from '../lib/nhiemVu';
import type { MoHinhA4 } from '../lib/baoCaoA4';
import { baoCaoHopA4, giayMoiA4, THE_THUC_MAC_DINH, thongBaoKetLuanA4, toTrinhA4, type TheThucBcd } from '../lib/hoSoHopA4';
import { layBangDa06 } from '../lib/duLieuBaoCao';
import { DangTai, HopLoi, Rong, TieuDeTrang } from '../components/ui';
import KhungSoanA4 from '../components/KhungSoanA4';
import type { PhienHop } from './Hop';

type HoSo = { buoc: number; ten: string; trang_thai: string; noi_dung: MoHinhA4 | null };
const TEN_FILE: Record<number, string> = { 1: 'To trinh', 2: 'Giay moi', 3: 'Bao cao', 4: 'Thong bao ket luan' };

async function taoMoi(ph: PhienHop, buoc: number, tt: TheThucBcd): Promise<MoHinhA4> {
  if (buoc === 1) return toTrinhA4(ph, tt);
  if (buoc === 2) return giayMoiA4(ph, tt);
  if (buoc === 4) {
    const kl = (kq(await supabase.from('ket_luan').select('id, stt, noi_dung').eq('phien_hop_id', ph.id).order('stt')) ?? []) as { id: string; stt: number; noi_dung: string }[];
    const nv = kl.length ? (kq(await supabase.from('v_nhiem_vu').select('ket_luan_id, chu_tri_ten, han').in('ket_luan_id', kl.map((k) => k.id))) ?? []) as { ket_luan_id: string; chu_tri_ten: string | null; han: string | null }[] : [];
    return thongBaoKetLuanA4(ph, tt, kl.map((k) => ({ stt: k.stt, noi_dung: k.noi_dung, giao: nv.filter((n) => n.ket_luan_id === k.id).map((n) => ({ chu_tri: n.chu_tri_ten ?? '…', han: n.han })) })));
  }
  const tu = ph.ky_tu ?? `${new Date().getFullYear()}-01-01`;
  const den = ph.ky_den ?? new Date().toISOString().slice(0, 10);
  const [vb, nv, ky, da06] = await Promise.all([
    supabase.from('van_ban').select('so_ky_hieu, ngay_ban_hanh, trich_yeu').eq('thu_muc', 'bcd_phuong_ban_hanh').eq('trang_thai', 'ban_hanh')
      .gte('ngay_ban_hanh', tu).lte('ngay_ban_hanh', den).order('ngay_ban_hanh'),
    supabase.from('v_nhiem_vu').select(COT_NV).eq('trang_thai_giao', 'da_duyet').neq('trang_thai', 'tam_dung').order('han', { nullsFirst: false }),
    supabase.from('v_tinh_hinh_nop').select('ten, loai, han_nop, so_don_vi, da_nop, chua_nop, nop_tre').eq('cap', 'don_vi').neq('loai', 'da06_tuan')
      .gte('han_nop', `${tu}T00:00:00+07:00`).lte('han_nop', new Date(Math.min(Date.parse(`${den}T23:59:59+07:00`), Date.now())).toISOString()).order('han_nop'),
    layBangDa06(),
  ]);
  return baoCaoHopA4(ph, tt, {
    vanBanBanHanh: ((kq(vb) ?? []) as { so_ky_hieu: string | null; ngay_ban_hanh: string | null; trich_yeu: string }[]).map((v) => ({ so_ky_hieu: v.so_ky_hieu, ngay: v.ngay_ban_hanh, trich_yeu: v.trich_yeu })),
    nhiemVu: ((kq(nv) ?? []) as unknown as NhiemVu[]).map((n) => ({ ten: n.ten, chu_tri: n.chu_tri_ten ?? '…', han: n.han, phan_tram: n.phan_tram, trang_thai: TT_NV[n.trang_thai].nhan, qua_han: n.qua_han })),
    kyBaoCao: ((kq(ky) ?? []) as { ten: string; so_don_vi: number; da_nop: number; chua_nop: number; nop_tre: number }[])
      .map((k) => ({ ten: k.ten, so_don_vi: k.so_don_vi, dung_han: k.da_nop - k.nop_tre, tre: k.nop_tre, chua_nop: k.chua_nop })),
    da06,
  });
}

export default function SoanHoSoHop() {
  const { id, buoc: b } = useParams();
  const buoc = Number(b);
  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    const [ph, hs, cfg] = await Promise.all([
      supabase.from('phien_hop').select('*').eq('id', id!).maybeSingle(),
      supabase.from('phien_hop_ho_so').select('buoc, ten, trang_thai, noi_dung').eq('phien_hop_id', id!).eq('buoc', buoc).maybeSingle(),
      supabase.from('cau_hinh').select('gia_tri').eq('khoa', 'the_thuc_bcd').maybeSingle(),
    ]);
    const tt = { ...THE_THUC_MAC_DINH, ...((cfg.data?.gia_tri as Partial<TheThucBcd>) ?? {}) } as TheThucBcd;
    return { ph: kq(ph) as PhienHop | null, hs: kq(hs) as HoSo | null, tt };
  }, [id, buoc]);
  const [m, setM] = useState<MoHinhA4 | null>(null);

  useEffect(() => {
    if (!data?.ph || !data.hs) return;
    if (data.hs.noi_dung) setM(data.hs.noi_dung); else void taoMoi(data.ph, buoc, data.tt).then(setM);
  }, [data, buoc]);

  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if (dangTai && !data) return <DangTai />;
  if (!data?.ph || !data.hs) return <Rong>Không tìm thấy hồ sơ.</Rong>;
  if (!m) return <DangTai />;
  const { ph, hs } = data;

  return (
    <>
      <TieuDeTrang tren={<><Link to="/hop" className="text-mo">Họp BCĐ</Link> / <Link to={`/hop/${ph.id}`} className="text-mo">{ph.ten}</Link></>} ten={`${hs.buoc}. ${hs.ten}`} />
      <KhungSoanA4 m={m} setM={(f) => setM((x) => (x ? f(x) : x))} suaDuoc moi={!hs.noi_dung} tenFile={`${TEN_FILE[buoc]} - ${ph.ten}`}
        taoLai={async () => setM(await taoMoi(ph, buoc, data.tt))}
        luu={async (x) => {
          const r = await supabase.from('phien_hop_ho_so').update({ noi_dung: x, ...(hs.trang_thai === 'chua_lam' ? { trang_thai: 'du_thao' } : {}) })
            .eq('phien_hop_id', ph.id).eq('buoc', buoc);
          if (r.error) throw r.error;
          if (ph.trang_thai === 'du_kien') await supabase.from('phien_hop').update({ trang_thai: 'chuan_bi' }).eq('id', ph.id);
        }} />
    </>
  );
}
