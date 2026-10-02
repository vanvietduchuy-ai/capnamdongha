import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { ngayGio } from '../lib/dinhDang';
import { Chip, ChipHan, DangTai, HopLoi, Rong, TieuDeTrang, cx } from '../components/ui';
import { nhanViec, type Viec } from './TrangChuDonVi';
import { TT_NOP } from './KyBaoCaoChiTiet';

type DaNop = { id: string; trang_thai: string; nop_luc: string | null; y_kien_duyet: string | null; han_rieng: string | null; ky_bao_cao: { ten: string; loai: string; han_nop: string } };

export default function ViecCanNop() {
  const [tab, setTab] = useState<'mo' | 'xong'>('mo');
  const { hoSo } = useAuth();
  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    const dv = hoSo?.don_vi_id ?? '';
    const [a, b] = await Promise.all([
      supabase.from('v_viec_can_nop').select('*').eq('don_vi_id', dv).order('han_nop'),
      supabase.from('nop_bao_cao').select('id, trang_thai, nop_luc, y_kien_duyet, han_rieng, ky_bao_cao(ten, loai, han_nop)').eq('don_vi_id', dv).in('trang_thai', ['da_nop', 'da_duyet']).order('nop_luc', { ascending: false }).limit(30),
    ]);
    return { mo: (kq(a) ?? []) as Viec[], xong: (kq(b) ?? []) as unknown as DaNop[] };
  });

  return (
    <>
      <TieuDeTrang ten="Việc cần nộp" />
      <div role="tablist" className="grid max-w-md grid-cols-2 rounded-xl bg-[#E7E3D9] p-1">
        {([['mo', `Đang mở · ${data?.mo.length ?? 0}`], ['xong', 'Đã nộp']] as const).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('h-10 rounded-lg text-[13px]', tab === k ? 'bg-white font-bold' : 'font-medium text-mo-2')}>{t}</button>
        ))}
      </div>
      {loi && <HopLoi loi={loi} taiLai={taiLai} />}
      {dangTai && !data && <DangTai />}
      {data && tab === 'mo' && (data.mo.length === 0 ? <Rong>Không còn việc nào cần nộp.</Rong> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.mo.map((v) => (
            <Link key={v.nop_id} to={`/viec-can-nop/${v.nop_id}`} className="flex flex-col gap-2.5 rounded-2xl border border-vien bg-white p-4 text-den hover:border-ink">
              <div className="flex items-center gap-2"><span className={cx('text-[10.5px] font-bold tracking-wider', nhanViec(v)[1])}>{nhanViec(v)[0]}</span><span className="flex-1" /><ChipHan han={v.han_nop} /></div>
              <span className="text-[15px] font-bold">{v.ten}</span>
              <div className="flex items-center gap-2 text-xs text-mo">
                <span className="flex-1">Hạn {ngayGio(v.han_nop)}</span>
                <Chip nen={TT_NOP[v.trang_thai].nen} chu={TT_NOP[v.trang_thai].chu}>{TT_NOP[v.trang_thai].nhan}</Chip>
                <span className="font-bold text-xanh">{v.loai === 'da06_tuan' ? 'Nhập số' : 'Nộp'} →</span>
              </div>
            </Link>
          ))}
        </div>
      ))}
      {data && tab === 'xong' && (data.xong.length === 0 ? <Rong>Chưa có báo cáo nào đã nộp.</Rong> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.xong.map((n) => (
            <Link key={n.id} to={`/viec-can-nop/${n.id}`} className="flex flex-col gap-1.5 rounded-2xl border border-vien bg-white p-4 text-den">
              <div className="flex items-center gap-2"><span className="flex-1 text-sm font-bold">{n.ky_bao_cao.ten}</span><Chip nen={TT_NOP[n.trang_thai].nen} chu={TT_NOP[n.trang_thai].chu}>{TT_NOP[n.trang_thai].nhan}</Chip></div>
              <span className="text-xs text-mo">Nộp lúc {ngayGio(n.nop_luc)}{n.nop_luc && new Date(n.nop_luc) > new Date(n.han_rieng ?? n.ky_bao_cao.han_nop) && ' · trễ hạn'}</span>
              {n.y_kien_duyet && <span className="text-xs text-mo-2">Ý kiến: {n.y_kien_duyet}</span>}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}
