import { useEffect, useState } from 'react';
import { loiDe, supabase } from '../lib/supabase';
import { LINH_VUC, NHOM_NV, thieu6Ro, type LinhVuc, type NhiemVu, type NhomNv } from '../lib/nhiemVu';
import { HopLoi, HopThoai, lopO, Nut, O, cx } from './ui';

type DonVi = { id: string; ten: string; loai: string };
type VanBan = { id: string; so_ky_hieu: string | null; trich_yeu: string };
type ChiTieu = { id: string; ma: string; ten: string };

export type GiaTriNv = {
  nhom: NhomNv; linh_vuc: LinhVuc; ten: string; mo_ta: string; chu_tri_don_vi_id: string; lanh_dao_phu_trach: string;
  han: string; san_pham: string; tham_quyen: string; can_cu_van_ban_id: string; chi_tieu_id: string; ket_luan_id: string | null;
  phoi_hop: string[];
};

const RONG: GiaTriNv = {
  nhom: 'chuong_trinh_cong_tac', linh_vuc: 'chung', ten: '', mo_ta: '', chu_tri_don_vi_id: '', lanh_dao_phu_trach: '',
  han: '', san_pham: '', tham_quyen: '', can_cu_van_ban_id: '', chi_tieu_id: '', ket_luan_id: null, phoi_hop: [],
};

export function tuNhiemVu(n: NhiemVu): GiaTriNv {
  return {
    nhom: n.nhom, linh_vuc: n.linh_vuc, ten: n.ten, mo_ta: n.mo_ta ?? '', chu_tri_don_vi_id: n.chu_tri_don_vi_id ?? '',
    lanh_dao_phu_trach: n.lanh_dao_phu_trach ?? '', han: n.han ?? '', san_pham: n.san_pham ?? '', tham_quyen: n.tham_quyen ?? '',
    can_cu_van_ban_id: n.can_cu_van_ban_id ?? '', chi_tieu_id: n.chi_tieu_id ?? '', ket_luan_id: n.ket_luan_id, phoi_hop: n.phoi_hop_ids ?? [],
  };
}

// Thêm / sửa nhiệm vụ theo "6 rõ". CQTT chỉ tham mưu: lưu ở trạng thái "đề xuất" chờ Trưởng ban duyệt.
export default function FormNhiemVu({ mo, dong, id, dau, xong, tieuDe }: {
  mo: boolean; dong: () => void; id?: string; dau?: Partial<GiaTriNv>; xong: (id: string) => void; tieuDe?: string;
}) {
  const [g, setG] = useState<GiaTriNv>({ ...RONG, ...dau });
  const [dm, setDm] = useState<{ dv: DonVi[]; vb: VanBan[]; ct: ChiTieu[] }>({ dv: [], vb: [], ct: [] });
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => { if (mo) { setG({ ...RONG, ...dau }); setLoi(null); } }, [mo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!mo || dm.dv.length) return;
    void Promise.all([
      supabase.from('don_vi').select('id, ten, loai').eq('hoat_dong', true).order('thu_tu'),
      supabase.from('van_ban').select('id, so_ky_hieu, trich_yeu').neq('trang_thai', 'het_hieu_luc').order('ngay_ban_hanh', { ascending: false }),
      supabase.from('da06_chi_tieu').select('id, ma, ten').order('thu_tu'),
    ]).then(([a, b, c]) => setDm({ dv: (a.data ?? []) as DonVi[], vb: (b.data ?? []) as VanBan[], ct: (c.data ?? []) as ChiTieu[] }));
  }, [mo, dm.dv.length]);

  const dat = <K extends keyof GiaTriNv>(k: K, v: GiaTriNv[K]) => setG((x) => ({ ...x, [k]: v }));
  const thieu = thieu6Ro({ ...g, chu_tri_don_vi_id: g.chu_tri_don_vi_id || null, lanh_dao_phu_trach: g.lanh_dao_phu_trach || null, han: g.han || null, san_pham: g.san_pham || null, tham_quyen: g.tham_quyen || null });

  const luu = async () => {
    if (!g.ten.trim()) { setLoi('Nhập tên nhiệm vụ (rõ việc)'); return; }
    setDangChay(true); setLoi(null);
    try {
      const dong_ = {
        nhom: g.nhom, linh_vuc: g.linh_vuc, ten: g.ten.trim(), mo_ta: g.mo_ta || null, chu_tri_don_vi_id: g.chu_tri_don_vi_id || null,
        lanh_dao_phu_trach: g.lanh_dao_phu_trach || null, han: g.han || null, san_pham: g.san_pham || null, tham_quyen: g.tham_quyen || null,
        can_cu_van_ban_id: g.can_cu_van_ban_id || null, chi_tieu_id: g.chi_tieu_id || null, ket_luan_id: g.ket_luan_id,
      };
      let nvId = id;
      if (id) {
        const { error } = await supabase.from('nhiem_vu').update(dong_).eq('id', id);
        if (error) throw error;
        const { error: e2 } = await supabase.from('nhiem_vu_phoi_hop').delete().eq('nhiem_vu_id', id);
        if (e2) throw e2;
      } else {
        const { data, error } = await supabase.from('nhiem_vu').insert(dong_).select('id').single();
        if (error) throw error;
        nvId = data.id as string;
      }
      const ph = g.phoi_hop.filter((x) => x !== g.chu_tri_don_vi_id);
      if (ph.length) {
        const { error } = await supabase.from('nhiem_vu_phoi_hop').insert(ph.map((d) => ({ nhiem_vu_id: nvId, don_vi_id: d })));
        if (error) throw error;
      }
      xong(nvId!);
    } catch (e) { setLoi(loiDe(e)); } finally { setDangChay(false); }
  };

  return (
    <HopThoai mo={mo} dong={dong} tieuDe={tieuDe ?? (id ? 'Sửa nhiệm vụ' : 'Đề xuất nhiệm vụ mới')} rong="max-w-2xl">
      <div className="flex flex-col gap-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <O nhan="Nhóm"><select className={lopO} value={g.nhom} onChange={(e) => dat('nhom', e.target.value as NhomNv)}>
            {Object.entries(NHOM_NV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></O>
          <O nhan="Lĩnh vực"><select className={lopO} value={g.linh_vuc} onChange={(e) => dat('linh_vuc', e.target.value as LinhVuc)}>
            {Object.entries(LINH_VUC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></O>
        </div>
        <O nhan="Tên nhiệm vụ"><textarea className={cx(lopO, 'min-h-20 py-2')} value={g.ten} onChange={(e) => dat('ten', e.target.value)} /></O>
        <O nhan="Yêu cầu cụ thể"><textarea className={cx(lopO, 'min-h-16 py-2')} value={g.mo_ta} onChange={(e) => dat('mo_ta', e.target.value)} /></O>
        <div className="grid gap-3 sm:grid-cols-2">
          <O nhan="Đơn vị chủ trì"><select className={lopO} value={g.chu_tri_don_vi_id} onChange={(e) => dat('chu_tri_don_vi_id', e.target.value)}>
            <option value="">— Chọn đơn vị —</option>
            {dm.dv.filter((d) => d.loai !== 'lanh_dao_bcd').map((d) => <option key={d.id} value={d.id}>{d.ten}</option>)}</select></O>
          <O nhan="Lãnh đạo phụ trách"><input className={lopO} value={g.lanh_dao_phu_trach} onChange={(e) => dat('lanh_dao_phu_trach', e.target.value)} /></O>
          <O nhan="Hạn hoàn thành"><input type="date" className={lopO} value={g.han} onChange={(e) => dat('han', e.target.value)} /></O>
          <O nhan="Sản phẩm"><input className={lopO} value={g.san_pham} onChange={(e) => dat('san_pham', e.target.value)} /></O>
        </div>
        <O nhan="Thẩm quyền (ai giao, ai ký)"><input className={lopO} value={g.tham_quyen} onChange={(e) => dat('tham_quyen', e.target.value)} /></O>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[13px] font-semibold text-mo-2">Đơn vị phối hợp</legend>
          <div className="flex flex-wrap gap-2">
            {dm.dv.filter((d) => d.loai !== 'lanh_dao_bcd' && d.id !== g.chu_tri_don_vi_id).map((d) => {
              const chon = g.phoi_hop.includes(d.id);
              return (
                <button type="button" key={d.id} aria-pressed={chon}
                  onClick={() => dat('phoi_hop', chon ? g.phoi_hop.filter((x) => x !== d.id) : [...g.phoi_hop, d.id])}
                  className={cx('min-h-9 rounded-lg border px-3 text-[13px]', chon ? 'border-ink bg-ink text-white' : 'border-vien-2 bg-white text-den')}>{d.ten}</button>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <O nhan="Văn bản căn cứ"><select className={lopO} value={g.can_cu_van_ban_id} onChange={(e) => dat('can_cu_van_ban_id', e.target.value)}>
            <option value="">— Không —</option>
            {dm.vb.map((v) => <option key={v.id} value={v.id}>{v.so_ky_hieu ? `${v.so_ky_hieu} · ` : ''}{v.trich_yeu.slice(0, 70)}</option>)}</select></O>
          <O nhan="Gắn chỉ tiêu Đề án 06"><select className={lopO} value={g.chi_tieu_id} onChange={(e) => dat('chi_tieu_id', e.target.value)}>
            <option value="">— Không —</option>
            {dm.ct.map((c) => <option key={c.id} value={c.id}>{c.ten}</option>)}</select></O>
        </div>
        {thieu.length > 0 && <div className="rounded-xl bg-cam-nhat px-3 py-2 text-[13px] text-cam-dam">Chưa đủ 6 rõ: thiếu {thieu.join(', ')}.</div>}
        {loi && <HopLoi loi={loi} />}
        <div className="flex justify-end gap-2">
          <Nut onClick={dong}>Huỷ</Nut>
          <Nut kieu="chinh" dangChay={dangChay} onClick={luu}>{id ? 'Lưu' : 'Lưu đề xuất'}</Nut>
        </div>
      </div>
    </HopThoai>
  );
}
