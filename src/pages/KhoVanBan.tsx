import { useMemo, useState } from 'react';
import { ExternalLink, FileText, Folder, Pencil, Plus, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { ngay } from '../lib/dinhDang';
import { khongDau } from '../lib/nhiemVu';
import { COT_VB, linkVb, LOAI_VB, THU_MUC, TT_VB, type LoaiVb, type ThuMuc, type VanBan } from '../lib/vanBan';
import { Chip, DangTai, HopLoi, lopO, Nut, Rong, The, TieuDeTrang, cx } from '../components/ui';
import FormVanBan from '../components/FormVanBan';

export default function KhoVanBan() {
  const { hoSo } = useAuth();
  const quanTri = hoSo?.vai_tro === 'quan_tri';
  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    const [a, b] = await Promise.all([
      supabase.from('van_ban').select(COT_VB).order('ngay_ban_hanh', { ascending: false, nullsFirst: true }).order('tai_len_luc', { ascending: false }),
      supabase.from('nhiem_vu').select('can_cu_van_ban_id').not('can_cu_van_ban_id', 'is', null),
    ]);
    const dem: Record<string, number> = {};
    for (const x of (b.data ?? []) as { can_cu_van_ban_id: string }[]) dem[x.can_cu_van_ban_id] = (dem[x.can_cu_van_ban_id] ?? 0) + 1;
    return { vb: kq(a) as unknown as VanBan[], dem };
  }, []);

  const [thuMuc, setThuMuc] = useState<ThuMuc | ''>('');
  const [loai, setLoai] = useState<LoaiVb | ''>('');
  const [nam, setNam] = useState('');
  const [tim, setTim] = useState('');
  const [hetHl, setHetHl] = useState(false);
  const [form, setForm] = useState<{ vb?: VanBan } | null>(null);

  const cacNam = useMemo(() => [...new Set((data?.vb ?? []).map((v) => v.ngay_ban_hanh?.slice(0, 4)).filter(Boolean))].sort().reverse() as string[], [data]);
  const ds = useMemo(() => {
    const t = khongDau(tim.trim());
    return (data?.vb ?? []).filter((v) =>
      (!thuMuc || v.thu_muc === thuMuc) && (!loai || v.loai === loai) && (!nam || v.ngay_ban_hanh?.startsWith(nam))
      && (hetHl || v.trang_thai !== 'het_hieu_luc')
      && (!t || khongDau(`${v.so_ky_hieu ?? ''} ${v.trich_yeu} ${v.co_quan_ban_hanh} ${v.nguoi_ky ?? ''} ${v.ghi_chu ?? ''}`).includes(t)));
  }, [data, thuMuc, loai, nam, tim, hetHl]);
  const demTM = (k: ThuMuc) => (data?.vb ?? []).filter((v) => v.thu_muc === k && (hetHl || v.trang_thai !== 'het_hieu_luc')).length;

  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if (dangTai && !data) return <DangTai />;

  const nutTM = (k: ThuMuc | '', ten: string, n: number) => (
    <button key={k || 'all'} onClick={() => setThuMuc(k)} aria-pressed={thuMuc === k}
      className={cx('flex min-h-10 shrink-0 items-center gap-2.5 rounded-xl px-3 text-left text-[13.5px] lg:w-full',
        thuMuc === k ? 'bg-ink font-semibold text-white' : 'bg-nen text-mo-2 hover:bg-nen-3 lg:bg-transparent')}>
      <Folder className="h-4 w-4 shrink-0" /><span className="flex-1 whitespace-nowrap lg:whitespace-normal">{ten}</span><span className="so text-xs opacity-70">{n}</span>
    </button>
  );

  return (
    <>
      <TieuDeTrang ten="Kho văn bản"
        phai={quanTri && <Nut kieu="chinh" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({})}>Thêm văn bản</Nut>} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav aria-label="Thư mục" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
          {nutTM('', 'Tất cả', (data?.vb ?? []).filter((v) => hetHl || v.trang_thai !== 'het_hieu_luc').length)}
          {(Object.keys(THU_MUC) as ThuMuc[]).map((k) => nutTM(k, THU_MUC[k], demTM(k)))}
        </nav>

        <The className="flex min-w-0 flex-col">
          <div className="grid gap-2 border-b border-vien p-4 sm:grid-cols-[1fr_auto_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-mo" />
              <input className={cx(lopO, 'w-full pl-10')} placeholder="Tìm văn bản" value={tim} onChange={(e) => setTim(e.target.value)} aria-label="Tìm văn bản" />
            </label>
            <select className={lopO} value={loai} onChange={(e) => setLoai(e.target.value as LoaiVb | '')} aria-label="Loại văn bản">
              <option value="">Mọi loại</option>{Object.entries(LOAI_VB).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className={lopO} value={nam} onChange={(e) => setNam(e.target.value)} aria-label="Năm">
              <option value="">Mọi năm</option>{cacNam.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <label className="flex min-h-10 items-center gap-2 text-[13px] text-mo sm:col-span-3">
              <input type="checkbox" className="h-4 w-4" checked={hetHl} onChange={(e) => setHetHl(e.target.checked)} /> Hiện cả văn bản hết hiệu lực
            </label>
          </div>
          {ds.length === 0 ? <div className="p-4"><Rong>Không có văn bản phù hợp.</Rong></div> : (
            <ul className="flex flex-col">
              {ds.map((v) => {
                const link = linkVb(v);
                const tt = TT_VB[v.trang_thai];
                return (
                  <li key={v.id} className={cx('flex items-start gap-3 border-b border-[#F1EEE7] px-4 py-3.5 last:border-0', v.trang_thai === 'het_hieu_luc' && 'opacity-60')}>
                    <FileText className={cx('mt-0.5 h-5 w-5 shrink-0', link ? 'text-do' : 'text-vien-2')} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mo">
                        <span className="so font-bold text-den">{v.so_ky_hieu ?? 'Chưa có số'}</span>
                        {v.ngay_ban_hanh && <span>ngày {ngay(v.ngay_ban_hanh)}</span>}
                        <span>· {LOAI_VB[v.loai]}</span>
                        {v.trang_thai !== 'ban_hanh' && <Chip nen={tt.nen} chu={tt.chu}>{tt.nhan}</Chip>}
                        {quanTri && data?.dem[v.id] ? <Chip nen="bg-xanh-nhat" chu="text-xanh">căn cứ {data.dem[v.id]} nhiệm vụ</Chip> : null}
                      </div>
                      {link
                        ? <a href={link} target="_blank" rel="noreferrer" className="text-[14.5px] font-semibold leading-snug text-[#A4161A] hover:underline">{v.trich_yeu}<ExternalLink className="ml-1 inline h-3.5 w-3.5" /></a>
                        : <span className="text-[14.5px] font-semibold leading-snug">{v.trich_yeu}</span>}
                      <span className="text-xs text-mo">{v.co_quan_ban_hanh}{v.nguoi_ky ? ` · ${v.nguoi_ky} ký` : ''}{v.ghi_chu ? ` · ${v.ghi_chu}` : ''}</span>
                    </div>
                    {quanTri && <button aria-label={`Sửa ${v.trich_yeu}`} onClick={() => setForm({ vb: v })} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-mo hover:bg-nen"><Pencil className="h-4 w-4" /></button>}
                  </li>
                );
              })}
            </ul>
          )}
        </The>
      </div>

      <FormVanBan mo={!!form} dong={() => setForm(null)} vb={form?.vb} dau={thuMuc ? { thu_muc: thuMuc } : undefined}
        xong={() => { setForm(null); void taiLai(); }} />
    </>
  );
}
