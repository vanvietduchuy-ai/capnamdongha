import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Pencil, ShieldCheck, Trash2, Undo2 } from 'lucide-react';
import { loiDe, supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { ngay, ngayGio, ngayGioDu } from '../lib/dinhDang';
import { COT_NV, LINH_VUC, NHOM_NV, thieu6Ro, TT_NV, type NhiemVu, type TrangThaiNv } from '../lib/nhiemVu';
import { Chip, DangTai, HopLoi, lopO, Nut, O, Rong, The, TieuDeThe, TieuDeTrang, cx } from '../components/ui';
import FormNhiemVu, { tuNhiemVu } from '../components/FormNhiemVu';
import TepDinhKem, { type Tep } from '../components/TepDinhKem';
import { HanNv, ThanhNv } from './NhiemVu';

type CapNhat = { id: number; noi_dung: string; phan_tram: number | null; trang_thai_moi: TrangThaiNv | null; luc: string; boi_ten: string | null };

export default function NhiemVuChiTiet() {
  const { id } = useParams();
  const { hoSo } = useAuth();
  const nav = useNavigate();
  const quanTri = hoSo?.vai_tro === 'quan_tri';
  const lanhDao = hoSo?.vai_tro === 'lanh_dao';

  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    const n = kq(await supabase.from('v_nhiem_vu').select(COT_NV).eq('id', id!).maybeSingle()) as unknown as NhiemVu | null;
    if (!n) return null;
    const [cn, tep, dv, vb, ct, kl] = await Promise.all([
      supabase.from('v_nhiem_vu_cap_nhat').select('id, noi_dung, phan_tram, trang_thai_moi, luc, boi_ten').eq('nhiem_vu_id', id!).order('luc', { ascending: false }),
      supabase.from('tep').select('id, drive_file_id, ten').eq('nhiem_vu_id', id!).order('tai_len_luc'),
      supabase.from('don_vi').select('id, ten'),
      n.can_cu_van_ban_id ? supabase.from('van_ban').select('id, so_ky_hieu, trich_yeu, drive_file_id').eq('id', n.can_cu_van_ban_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      n.chi_tieu_id ? supabase.from('da06_chi_tieu').select('ma, ten').eq('id', n.chi_tieu_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      n.ket_luan_id && !(hoSo?.vai_tro === 'don_vi') ? supabase.from('ket_luan').select('stt, noi_dung, phien_hop(id, ten)').eq('id', n.ket_luan_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    return {
      n, cn: (kq(cn) ?? []) as CapNhat[], tep: (kq(tep) ?? []) as Tep[], dv: (kq(dv) ?? []) as { id: string; ten: string }[],
      vb: vb.data as { id: string; so_ky_hieu: string | null; trich_yeu: string; drive_file_id: string | null } | null,
      ct: ct.data as { ma: string; ten: string } | null,
      kl: kl.data as unknown as { stt: number; noi_dung: string; phien_hop: { id: string; ten: string } } | null,
    };
  }, [id]);

  const [moSua, setMoSua] = useState(false);
  const [dangChay, setDangChay] = useState<string | null>(null);
  const [loiTT, setLoiTT] = useState<string | null>(null);

  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if (dangTai && !data) return <DangTai />;
  if (!data) return <Rong>Không tìm thấy nhiệm vụ.</Rong>;
  const { n } = data;
  const tt = TT_NV[n.trang_thai];
  const daGiao = n.trang_thai_giao === 'da_duyet';
  const chuTri = hoSo?.don_vi_id != null && hoSo.don_vi_id === n.chu_tri_don_vi_id;
  const phoiHop = (n.phoi_hop_ids ?? []).includes(hoSo?.don_vi_id ?? '');
  const tenDv = (x: string) => data.dv.find((d) => d.id === x)?.ten ?? '';
  const thieu = thieu6Ro(n);

  const chay = async (ten: string, f: () => PromiseLike<{ error: unknown }>, sau?: () => void) => {
    setDangChay(ten); setLoiTT(null);
    const { error } = await f();
    setDangChay(null);
    if (error) setLoiTT(loiDe(error)); else (sau ?? (() => void taiLai()))();
  };

  const RO: [string, string, React.ReactNode][] = [
    ['1', 'Rõ việc', n.ten],
    ['2', 'Rõ người', <>{n.chu_tri_ten ?? <i className="text-nguy">Chưa có</i>}{(n.phoi_hop_ids ?? []).length > 0 && <span className="block text-xs font-normal text-mo">Phối hợp: {(n.phoi_hop_ids ?? []).map(tenDv).join(', ')}</span>}</>],
    ['3', 'Rõ trách nhiệm', n.lanh_dao_phu_trach ?? <i className="text-nguy">Chưa có</i>],
    ['4', 'Rõ thời gian', n.han ? ngay(n.han) : <i className="text-nguy">Chưa chốt</i>],
    ['5', 'Rõ sản phẩm', n.san_pham ?? <i className="text-nguy">Chưa có</i>],
    ['6', 'Rõ thẩm quyền', n.tham_quyen ?? <i className="text-nguy">Chưa có</i>],
  ];

  return (
    <>
      <TieuDeTrang tren={<><Link to="/nhiem-vu" className="text-mo">Nhiệm vụ</Link> / <span className="so">{n.ma}</span> · {NHOM_NV[n.nhom]} · {LINH_VUC[n.linh_vuc]}</>}
        ten={n.ten}
        phai={<>
          {!daGiao && (lanhDao || quanTri) && <Nut kieu="chinh" dangChay={dangChay === 'duyet'} icon={<ShieldCheck className="h-4 w-4" />}
            onClick={() => chay('duyet', () => supabase.from('nhiem_vu').update({ trang_thai_giao: 'da_duyet' }).eq('id', n.id))}>
            {lanhDao ? 'Duyệt giao nhiệm vụ' : 'Ghi nhận Trưởng ban đã duyệt'}</Nut>}
          {quanTri && <Nut icon={<Pencil className="h-4 w-4" />} onClick={() => setMoSua(true)}>Sửa</Nut>}
          {quanTri && daGiao && <Nut icon={<Undo2 className="h-4 w-4" />} dangChay={dangChay === 'thu_hoi'}
            onClick={() => { if (window.confirm('Thu hồi về đề xuất? Đơn vị sẽ không thấy nhiệm vụ này.')) void chay('thu_hoi', () => supabase.from('nhiem_vu').update({ trang_thai_giao: 'de_xuat' }).eq('id', n.id)); }}>Thu hồi</Nut>}
          {quanTri && <Nut kieu="nguy" icon={<Trash2 className="h-4 w-4" />} dangChay={dangChay === 'xoa'}
            onClick={() => { if (window.confirm(`Xoá nhiệm vụ "${n.ten}" cùng toàn bộ lịch sử cập nhật?`)) void chay('xoa', () => supabase.from('nhiem_vu').delete().eq('id', n.id), () => nav('/nhiem-vu')); }}>Xoá</Nut>}
        </>} />
      {loiTT && <HopLoi loi={loiTT} />}

      {!daGiao && <div className="rounded-xl bg-cam-nhat px-4 py-3 text-sm text-cam-dam"><b>Chờ Trưởng ban duyệt giao.</b>{thieu.length > 0 && <> Thiếu: {thieu.join(', ')}.</>}</div>}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl bg-ink px-5 py-4 text-white">
        <div className="flex flex-col gap-1"><span className="text-[11px] font-semibold tracking-wider text-[#E9CBC7]">TRẠNG THÁI</span><Chip nen={tt.nen} chu={tt.chu}>{tt.nhan}</Chip></div>
        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5"><span className="text-[11px] font-semibold tracking-wider text-[#E9CBC7]">TIẾN ĐỘ</span><ThanhNv n={n} /></div>
        <div className="flex flex-col gap-1"><span className="text-[11px] font-semibold tracking-wider text-[#E9CBC7]">HẠN {n.han && ngay(n.han)}</span><HanNv n={n} /></div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          {daGiao && (chuTri || phoiHop || quanTri || lanhDao) && (
            <CapNhatTienDo key={`${n.trang_thai}-${n.phan_tram}-${data.cn.length}`} n={n} laChuTri={chuTri || quanTri} quanTri={quanTri} xong={taiLai}
              tieuDe={chuTri || quanTri ? 'Báo cáo tiến độ' : lanhDao ? 'Ý kiến chỉ đạo' : 'Ý kiến của đơn vị phối hợp'} />
          )}
          <The className="flex flex-col gap-3 p-4">
            <TieuDeThe>Lịch sử thực hiện</TieuDeThe>
            {data.cn.length === 0 ? <Rong>Chưa có cập nhật.</Rong> : (
              <ol className="flex flex-col">
                {data.cn.map((c) => (
                  <li key={c.id} className="relative flex gap-3 pb-4 pl-1 last:pb-0">
                    <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', c.trang_thai_moi ? TT_NV[c.trang_thai_moi].thanh : 'bg-vien-2')} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-mo">
                        <span className="font-semibold text-mo-2">{c.boi_ten ?? 'Hệ thống'}</span><span>{ngayGioDu(c.luc)}</span>
                        {c.phan_tram != null && <Chip>{c.phan_tram}%</Chip>}
                        {c.trang_thai_moi && <Chip nen={TT_NV[c.trang_thai_moi].nen} chu={TT_NV[c.trang_thai_moi].chu}>{TT_NV[c.trang_thai_moi].nhan}</Chip>}
                      </div>
                      <p className="m-0 whitespace-pre-line text-sm">{c.noi_dung}</p>
                    </div>
                    {quanTri && <button aria-label="Xoá cập nhật nhập nhầm" className="h-9 w-9 shrink-0 rounded-lg text-mo hover:bg-nguy-nhat hover:text-nguy"
                      onClick={() => { if (window.confirm('Xoá dòng cập nhật này?')) void chay('xoa_cn', () => supabase.from('nhiem_vu_cap_nhat').delete().eq('id', c.id)); }}><Trash2 className="mx-auto h-4 w-4" /></button>}
                  </li>
                ))}
              </ol>
            )}
          </The>
        </div>

        <div className="flex flex-col gap-5">
          <The className="flex flex-col p-4">
            <TieuDeThe>6 rõ</TieuDeThe>
            <dl className="mt-2 flex flex-col">
              {RO.map(([so_, nhan, gt]) => (
                <div key={so_} className="grid grid-cols-[110px_1fr] gap-3 border-b border-[#F1EEE7] py-2.5 text-sm last:border-0">
                  <dt className="text-mo"><span className="so mr-1 font-bold text-den">{so_}</span>{nhan}</dt>
                  <dd className="m-0 font-semibold">{gt}</dd>
                </div>
              ))}
            </dl>
            {n.mo_ta && <p className="mt-2 whitespace-pre-line rounded-xl bg-nen p-3 text-sm">{n.mo_ta}</p>}
          </The>

          {(data.vb || data.ct || data.kl) && (
            <The className="flex flex-col gap-2.5 p-4 text-sm">
              <TieuDeThe>Liên kết</TieuDeThe>
              {data.vb && <div><span className="text-mo">Căn cứ: </span>{data.vb.drive_file_id
                ? <a className="font-semibold text-[#A4161A]" target="_blank" rel="noreferrer" href={`https://drive.google.com/file/d/${data.vb.drive_file_id}/view`}>{data.vb.so_ky_hieu ?? ''} {data.vb.trich_yeu}</a>
                : <span className="font-semibold">{data.vb.so_ky_hieu ?? ''} {data.vb.trich_yeu}</span>}</div>}
              {data.ct && <div><span className="text-mo">Chỉ tiêu Đề án 06: </span><Link className="font-semibold text-[#A4161A]" to={`/de-an-06/${data.ct.ma}`}>{data.ct.ten}</Link></div>}
              {data.kl && <div><span className="text-mo">Kết luận số {data.kl.stt} — </span><Link className="font-semibold text-[#A4161A]" to={`/hop/${data.kl.phien_hop.id}`}>{data.kl.phien_hop.ten}</Link></div>}
            </The>
          )}

          <The className="flex flex-col gap-3 p-4">
            <TieuDeThe>Sản phẩm, minh chứng</TieuDeThe>
            {data.tep.length === 0 && !(daGiao && (chuTri || phoiHop || quanTri)) && <Rong>Chưa có tệp.</Rong>}
            <TepDinhKem loai="nhiem_vu" dichId={n.id} suaDuoc={daGiao && (chuTri || phoiHop || quanTri)} xoaDuoc={quanTri} tep={data.tep} xong={taiLai} />
          </The>

          {(quanTri || lanhDao) && (
            <The className="flex flex-col gap-2 p-4 text-sm">
              <TieuDeThe>Theo dõi Nghị quyết 57</TieuDeThe>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" className="h-5 w-5" disabled={!quanTri || dangChay === 'tdnq'} checked={n.da_cap_nhat_theodoinq}
                  onChange={(e) => chay('tdnq', () => supabase.from('nhiem_vu').update({ da_cap_nhat_theodoinq: e.target.checked }).eq('id', n.id))} />
                Đã cập nhật lên theodoinq.dcs.vn
              </label>
              {n.duyet_luc && <span className="text-xs text-mo">Duyệt giao lúc {ngayGio(n.duyet_luc)}</span>}
            </The>
          )}
        </div>
      </div>

      {quanTri && <FormNhiemVu mo={moSua} dong={() => setMoSua(false)} id={n.id} dau={tuNhiemVu(n)} xong={() => { setMoSua(false); void taiLai(); }} />}
    </>
  );
}

function CapNhatTienDo({ n, laChuTri, quanTri, xong, tieuDe }: { n: NhiemVu; laChuTri: boolean; quanTri: boolean; xong: () => void; tieuDe: string }) {
  const [noiDung, setNoiDung] = useState('');
  const [pt, setPt] = useState(n.phan_tram);
  const [tt, setTt] = useState<TrangThaiNv>(n.trang_thai);
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const cacTT = (Object.keys(TT_NV) as TrangThaiNv[]).filter((k) => quanTri || k !== 'tam_dung');

  const gui = async () => {
    if (!noiDung.trim()) { setLoi('Nhập nội dung đã thực hiện'); return; }
    setDangChay(true); setLoi(null);
    const { error } = await supabase.from('nhiem_vu_cap_nhat').insert({
      nhiem_vu_id: n.id, noi_dung: noiDung.trim(),
      phan_tram: laChuTri && pt !== n.phan_tram ? pt : null,
      trang_thai_moi: laChuTri && tt !== n.trang_thai ? tt : null,
    });
    setDangChay(false);
    if (error) setLoi(loiDe(error)); else { setNoiDung(''); xong(); }
  };

  return (
    <The className="flex flex-col gap-3.5 p-4">
      <TieuDeThe>{tieuDe}</TieuDeThe>
      <O nhan={laChuTri ? 'Đã thực hiện được gì, vướng mắc gì' : 'Nội dung'}>
        <textarea className={cx(lopO, 'min-h-24 py-2')} value={noiDung} onChange={(e) => setNoiDung(e.target.value)} />
      </O>
      {laChuTri && (
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <O nhan={`Tỷ lệ hoàn thành: ${pt}%`}>
            <input type="range" min={0} max={100} step={5} value={pt} onChange={(e) => { const v = Number(e.target.value); setPt(v); if (v === 100) setTt('hoan_thanh'); else if (tt === 'hoan_thanh') setTt('dang_thuc_hien'); }} className="h-11 accent-[#A4161A]" />
          </O>
          <O nhan="Trạng thái"><select className={lopO} value={tt} onChange={(e) => { const v = e.target.value as TrangThaiNv; setTt(v); if (v === 'hoan_thanh') setPt(100); }}>
            {cacTT.map((k) => <option key={k} value={k}>{TT_NV[k].nhan}</option>)}</select></O>
        </div>
      )}
      {tt === 'hoan_thanh' && n.trang_thai !== 'hoan_thanh' && <div className="flex items-center gap-2 rounded-xl bg-[#DCFCE7] px-3 py-2 text-[13px] text-[#166534]"><CheckCircle2 className="h-4 w-4" />Nhớ đính kèm sản phẩm{n.san_pham ? ` (${n.san_pham})` : ''}.</div>}
      {loi && <HopLoi loi={loi} />}
      <div className="flex justify-end"><Nut kieu="chinh" dangChay={dangChay} onClick={gui}>Gửi cập nhật</Nut></div>
    </The>
  );
}
