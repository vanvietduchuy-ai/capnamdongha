import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Plus, Search, ShieldCheck } from 'lucide-react';
import { loiDe, supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { ngay } from '../lib/dinhDang';
import { COT_NV, hanNv, khongDau, LINH_VUC, NHOM_NV, TT_NV, type NhiemVu, type NhomNv } from '../lib/nhiemVu';
import { Chip, ChipHan, DangTai, HopLoi, lopO, Nut, Rong, The, TheSo, TieuDeTrang, cx } from '../components/ui';
import FormNhiemVu from '../components/FormNhiemVu';

type Tab = 'chu_y' | 'tat_ca' | 'cho_duyet' | 'qua_han' | 'hoan_thanh';

export function HanNv({ n }: { n: Pick<NhiemVu, 'han' | 'trang_thai'> }) {
  if (!n.han) return <Chip>Chưa chốt hạn</Chip>;
  if (n.trang_thai === 'hoan_thanh') return <span className="so text-xs text-mo">hạn {ngay(n.han)}</span>;
  if (n.trang_thai === 'tam_dung') return <Chip>Tạm dừng</Chip>;
  return <ChipHan han={hanNv(n.han)} />;
}

export function ThanhNv({ n }: { n: Pick<NhiemVu, 'phan_tram' | 'trang_thai' | 'qua_han'> }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-[#EEEBE3]">
        <div className={cx('h-1.5 rounded-full', n.qua_han ? 'bg-nguy' : TT_NV[n.trang_thai].thanh)} style={{ width: `${n.phan_tram}%` }} />
      </div>
      <span className="so w-9 text-right text-xs font-semibold">{n.phan_tram}%</span>
    </div>
  );
}

export default function NhiemVuTrang() {
  const { hoSo } = useAuth();
  const nav = useNavigate();
  const quanTri = hoSo?.vai_tro === 'quan_tri';
  const lanhDao = hoSo?.vai_tro === 'lanh_dao';
  const donVi = hoSo?.vai_tro === 'don_vi';
  const [sp, setSp] = useSearchParams();

  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    const [a, b] = await Promise.all([
      supabase.from('v_nhiem_vu').select(COT_NV).order('han', { ascending: true, nullsFirst: false }).order('ma'),
      supabase.from('don_vi').select('id, ten').order('thu_tu'),
    ]);
    let nv = kq(a) as unknown as NhiemVu[];
    // Đơn vị: chỉ việc mình chủ trì / phối hợp (việc lĩnh vực mình làm đầu mối xem ở "Theo dõi lĩnh vực")
    if (hoSo?.vai_tro === 'don_vi') nv = nv.filter((n) => n.chu_tri_don_vi_id === hoSo.don_vi_id || (n.phoi_hop_ids ?? []).includes(hoSo.don_vi_id!));
    return { nv, dv: (kq(b) ?? []) as { id: string; ten: string }[] };
  }, []);

  const choDuyet = (data?.nv ?? []).filter((n) => n.trang_thai_giao === 'de_xuat');
  const tab = (sp.get('tab') as Tab) ?? (lanhDao && choDuyet.length ? 'cho_duyet' : 'chu_y');
  const [nhom, setNhom] = useState<NhomNv | ''>('');
  const [dvLoc, setDvLoc] = useState('');
  const [tim, setTim] = useState('');
  const [chon, setChon] = useState<string[]>([]);
  const [moForm, setMoForm] = useState(false);
  const [dangDuyet, setDangDuyet] = useState(false);
  const [loiDuyet, setLoiDuyet] = useState<string | null>(null);

  const daGiao = (data?.nv ?? []).filter((n) => n.trang_thai_giao === 'da_duyet');
  const dem = {
    tong: daGiao.length,
    dang: daGiao.filter((n) => n.trang_thai === 'dang_thuc_hien' || n.trang_thai === 'trinh_ky').length,
    xong: daGiao.filter((n) => n.trang_thai === 'hoan_thanh').length,
    qua: daGiao.filter((n) => n.qua_han).length,
  };

  const ds = useMemo(() => {
    const t = khongDau(tim.trim());
    return (data?.nv ?? []).filter((n) => {
      if (tab === 'cho_duyet' && n.trang_thai_giao !== 'de_xuat') return false;
      if (tab !== 'cho_duyet' && tab !== 'tat_ca' && n.trang_thai_giao !== 'da_duyet') return false;
      if (tab === 'chu_y' && !(n.qua_han || (n.con_ngay != null && n.con_ngay <= 7 && !['hoan_thanh', 'tam_dung'].includes(n.trang_thai)) || (n.han == null && n.trang_thai !== 'hoan_thanh'))) return false;
      if (tab === 'qua_han' && !n.qua_han) return false;
      if (tab === 'hoan_thanh' && n.trang_thai !== 'hoan_thanh') return false;
      if (nhom && n.nhom !== nhom) return false;
      if (dvLoc && n.chu_tri_don_vi_id !== dvLoc && !(n.phoi_hop_ids ?? []).includes(dvLoc)) return false;
      if (t && !khongDau(`${n.ma ?? ''} ${n.ten} ${n.chu_tri_ten ?? ''} ${n.san_pham ?? ''}`).includes(t)) return false;
      return true;
    });
  }, [data, tab, nhom, dvLoc, tim]);

  const datTab = (t: Tab) => { setChon([]); setSp(t === 'chu_y' ? {} : { tab: t }, { replace: true }); };

  const duyet = async (ids: string[]) => {
    setDangDuyet(true); setLoiDuyet(null);
    const { error } = await supabase.from('nhiem_vu').update({ trang_thai_giao: 'da_duyet' }).in('id', ids);
    setDangDuyet(false);
    if (error) setLoiDuyet(loiDe(error)); else { setChon([]); void taiLai(); }
  };

  const xuatExcel = async () => {
    const XLSX = await import('xlsx');
    const tenDv = (id: string) => data?.dv.find((d) => d.id === id)?.ten ?? '';
    const dong = ds.map((n, i) => ({
      'TT': i + 1, 'Mã': n.ma, 'Nhiệm vụ (rõ việc)': n.ten, 'Nhóm': NHOM_NV[n.nhom], 'Lĩnh vực': LINH_VUC[n.linh_vuc],
      'Chủ trì (rõ người)': n.chu_tri_ten ?? '', 'Phối hợp': (n.phoi_hop_ids ?? []).map(tenDv).join('; '),
      'Lãnh đạo phụ trách': n.lanh_dao_phu_trach ?? '', 'Hạn (rõ thời gian)': n.han ? ngay(n.han) : '',
      'Sản phẩm': n.san_pham ?? '', 'Thẩm quyền': n.tham_quyen ?? '', 'Căn cứ': n.can_cu_so_ky_hieu ?? '',
      'Trạng thái': TT_NV[n.trang_thai].nhan, 'Tiến độ (%)': n.phan_tram, 'Quá hạn': n.qua_han ? 'x' : '',
      'Giao': n.trang_thai_giao === 'da_duyet' ? 'Đã duyệt' : 'Đề xuất',
    }));
    const ws = XLSX.utils.json_to_sheet(dong);
    ws['!cols'] = [4, 12, 50, 22, 16, 28, 30, 24, 12, 28, 24, 16, 16, 10, 8, 10].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nhiệm vụ');
    XLSX.writeFile(wb, `danh-muc-nhiem-vu-bcd57.xlsx`);
  };

  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if (dangTai && !data) return <DangTai />;

  const TABS: [Tab, string, number?][] = [
    ['chu_y', 'Cần chú ý'], ['tat_ca', 'Tất cả'], ...(donVi ? [] : [['cho_duyet', 'Chờ duyệt', choDuyet.length] as [Tab, string, number]]),
    ['qua_han', 'Quá hạn', dem.qua], ['hoan_thanh', 'Hoàn thành'],
  ];
  const chonDuoc = !donVi && tab === 'cho_duyet';

  return (
    <>
      <TieuDeTrang tren={donVi ? hoSo?.don_vi?.ten : undefined}
        ten={donVi ? 'Nhiệm vụ được giao' : 'Nhiệm vụ Ban Chỉ đạo'}
        phai={<>
          {!donVi && <Nut icon={<Download className="h-4 w-4" />} onClick={xuatExcel}>Xuất Excel</Nut>}
          {quanTri && <Nut kieu="chinh" icon={<Plus className="h-4 w-4" />} onClick={() => setMoForm(true)}>Đề xuất nhiệm vụ</Nut>}
        </>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <TheSo nhan={donVi ? 'Được giao' : 'Đã giao'} giaTri={dem.tong} phu={!donVi && choDuyet.length ? `${choDuyet.length} đề xuất chờ duyệt` : undefined} />
        <TheSo nhan="Đang thực hiện" giaTri={dem.dang} mau="text-xanh" />
        <TheSo nhan="Hoàn thành" giaTri={dem.xong} mau="text-[#166534]" phu={dem.tong ? `${Math.round((dem.xong / dem.tong) * 100)}%` : undefined} />
        <TheSo nhan="Quá hạn" giaTri={dem.qua} mau={dem.qua ? 'text-nguy' : 'text-den'} />
      </div>

      {lanhDao && choDuyet.length > 0 && tab !== 'cho_duyet' && (
        <button onClick={() => datTab('cho_duyet')} className="flex items-center gap-3 rounded-2xl bg-cam-nhat px-4 py-3 text-left text-sm text-cam-dam">
          <ShieldCheck className="h-5 w-5" /><span className="flex-1"><b>{choDuyet.length} nhiệm vụ</b> chờ duyệt giao.</span><span className="font-bold">Xem</span>
        </button>
      )}

      <The className="flex flex-col">
        <div className="flex flex-col gap-3 border-b border-vien p-4">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist">
            {TABS.map(([k, t, n]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => datTab(k)}
                className={cx('flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[13.5px] font-semibold', tab === k ? 'bg-ink text-white' : 'bg-nen text-mo-2 hover:bg-nen-3')}>
                {t}{n ? <span className={cx('so rounded-md px-1.5 text-[11px]', tab === k ? 'bg-white/20' : 'bg-white')}>{n}</span> : null}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-mo" />
              <input className={cx(lopO, 'w-full pl-10')} placeholder="Tìm nhiệm vụ" value={tim} onChange={(e) => setTim(e.target.value)} aria-label="Tìm nhiệm vụ" />
            </label>
            <select className={lopO} value={nhom} onChange={(e) => setNhom(e.target.value as NhomNv | '')} aria-label="Lọc nhóm">
              <option value="">Mọi nhóm</option>{Object.entries(NHOM_NV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {!donVi && (
              <select className={lopO} value={dvLoc} onChange={(e) => setDvLoc(e.target.value)} aria-label="Lọc đơn vị">
                <option value="">Mọi đơn vị</option>{data?.dv.map((d) => <option key={d.id} value={d.id}>{d.ten}</option>)}
              </select>
            )}
          </div>
          {chonDuoc && ds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-nen px-3 py-2">
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={chon.length === ds.length} onChange={(e) => setChon(e.target.checked ? ds.map((n) => n.id) : [])} />
                Chọn tất cả ({ds.length})
              </label>
              <span className="flex-1" />
              <Nut kieu="chinh" disabled={!chon.length} dangChay={dangDuyet} icon={<ShieldCheck className="h-4 w-4" />} onClick={() => duyet(chon)}>
                {lanhDao ? `Duyệt giao ${chon.length || ''} nhiệm vụ` : `Ghi nhận Trưởng ban đã duyệt (${chon.length})`}
              </Nut>
            </div>
          )}
          {loiDuyet && <HopLoi loi={loiDuyet} />}
        </div>

        {ds.length === 0 ? <div className="p-4"><Rong>{tab === 'chu_y' ? 'Không có việc sắp đến hạn.' : 'Không có nhiệm vụ.'}</Rong></div> : (
          <ul className="flex flex-col">
            {ds.map((n) => {
              const tt = TT_NV[n.trang_thai];
              const vai = donVi ? (n.chu_tri_don_vi_id === hoSo?.don_vi_id ? 'Chủ trì' : 'Phối hợp') : null;
              return (
                <li key={n.id} className="flex items-start gap-3 border-b border-[#F1EEE7] px-4 py-3.5 last:border-0 hover:bg-nen-2">
                  {chonDuoc && <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" aria-label={`Chọn ${n.ten}`} checked={chon.includes(n.id)}
                    onChange={(e) => setChon(e.target.checked ? [...chon, n.id] : chon.filter((x) => x !== n.id))} />}
                  <Link to={`/nhiem-vu/${n.id}`} className="grid min-w-0 flex-1 gap-2 md:grid-cols-[minmax(0,1fr)_180px_150px] md:items-center md:gap-5">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-mo">
                        <span className="so font-semibold text-mo-2">{n.ma}</span>
                        <span>· {NHOM_NV[n.nhom]}</span>
                        {vai && <Chip nen={vai === 'Chủ trì' ? 'bg-ink' : 'bg-nen-3'} chu={vai === 'Chủ trì' ? 'text-white' : 'text-mo-2'}>{vai}</Chip>}
                        {n.trang_thai_giao === 'de_xuat' && <Chip nen="bg-cam-nhat" chu="text-cam-dam">Đề xuất</Chip>}
                      </div>
                      <span className="text-[14.5px] font-semibold leading-snug text-den">{n.ten}</span>
                      <span className="truncate text-xs text-mo">{n.chu_tri_ten ?? 'Chưa rõ đơn vị chủ trì'}{n.san_pham ? ` · ${n.san_pham}` : ''}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Chip nen={tt.nen} chu={tt.chu} className="self-start">{tt.nhan}</Chip>
                      <ThanhNv n={n} />
                    </div>
                    <div className="flex md:justify-end"><HanNv n={n} /></div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </The>

      <FormNhiemVu mo={moForm} dong={() => setMoForm(false)} xong={(id) => { setMoForm(false); nav(`/nhiem-vu/${id}`); }} />
    </>
  );
}
