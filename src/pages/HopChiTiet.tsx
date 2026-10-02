import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, ExternalLink, FilePen, Link2, MapPin, Pencil, Plus, Send, Trash2, Users } from 'lucide-react';
import { loiDe, supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { ngay, ngayGioDu } from '../lib/dinhDang';
import { COT_NV, TT_NV, type NhiemVu } from '../lib/nhiemVu';
import { COT_VB, linkVb, type VanBan } from '../lib/vanBan';
import { Chip, ChipHan, DangTai, HopLoi, HopThoai, lopO, Nut, O, Rong, The, TieuDeThe, TieuDeTrang, cx } from '../components/ui';
import FormNhiemVu from '../components/FormNhiemVu';
import FormVanBan from '../components/FormVanBan';
import { FormPhienHop, LOAI_HOP, TT_HOP, type PhienHop, type TtPhienHop } from './Hop';
import { HanNv } from './NhiemVu';

type HoSo = { buoc: number; ten: string; trang_thai: 'chua_lam' | 'du_thao' | 'hoan_thanh'; van_ban_id: string | null; van_ban: VanBan | null };
type KetLuan = { id: string; stt: number; noi_dung: string };

const TT_HS = {
  chua_lam: { nhan: 'Chưa làm', nen: 'bg-nen-3', chu: 'text-mo-2' },
  du_thao: { nhan: 'Dự thảo', nen: 'bg-cam-nhat', chu: 'text-cam-dam' },
  hoan_thanh: { nhan: 'Đã ban hành', nen: 'bg-[#DCFCE7]', chu: 'text-[#166534]' },
} as const;
const LOAI_THEO_BUOC = { 1: 'to_trinh', 2: 'giay_moi', 3: 'bao_cao', 4: 'thong_bao' } as const;

export default function HopChiTiet() {
  const { id } = useParams();
  const { hoSo } = useAuth();
  const nav = useNavigate();
  const quanTri = hoSo?.vai_tro === 'quan_tri';

  const { data, loi, dangTai, taiLai } = useDuLieu(async () => {
    const [ph, hs, kl, cfg] = await Promise.all([
      supabase.from('v_phien_hop').select('*').eq('id', id!).maybeSingle(),
      supabase.from('phien_hop_ho_so').select(`buoc, ten, trang_thai, van_ban_id, van_ban(${COT_VB})`).eq('phien_hop_id', id!).order('buoc'),
      supabase.from('ket_luan').select('id, stt, noi_dung').eq('phien_hop_id', id!).order('stt'),
      supabase.from('cau_hinh').select('gia_tri').eq('khoa', 'the_thuc_bcd').maybeSingle(),
    ]);
    const ketLuan = (kq(kl) ?? []) as KetLuan[];
    const nv = ketLuan.length ? (kq(await supabase.from('v_nhiem_vu').select(COT_NV).in('ket_luan_id', ketLuan.map((k) => k.id)).order('ma')) ?? []) as unknown as NhiemVu[] : [];
    return { ph: kq(ph) as PhienHop | null, hs: (kq(hs) ?? []) as unknown as HoSo[], kl: ketLuan, nv, tt: cfg.data?.gia_tri as Record<string, unknown> | undefined };
  }, [id]);

  const [moSua, setMoSua] = useState(false);
  const [ganBuoc, setGanBuoc] = useState<number | null>(null);
  const [taoVbBuoc, setTaoVbBuoc] = useState<number | null>(null);
  const [giaoKl, setGiaoKl] = useState<KetLuan | null>(null);
  const [suaKl, setSuaKl] = useState<KetLuan | 'moi' | null>(null);
  const [dangChay, setDangChay] = useState<string | null>(null);
  const [loiTT, setLoiTT] = useState<string | null>(null);

  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if (dangTai && !data) return <DangTai />;
  if (!data?.ph) return <Rong>Không tìm thấy phiên họp.</Rong>;
  const { ph } = data;
  const tt = TT_HOP[ph.trang_thai];

  const chay = async (ten: string, f: () => PromiseLike<{ error: unknown }>, sau?: () => void) => {
    setDangChay(ten); setLoiTT(null);
    const { error } = await f();
    setDangChay(null);
    if (error) setLoiTT(loiDe(error)); else (sau ?? (() => void taiLai()))();
  };

  const ganVanBan = async (buoc: number, vbId: string, trangThaiVb?: string) => {
    const tt_ = trangThaiVb === 'ban_hanh' ? 'hoan_thanh' : 'du_thao';
    await chay(`gan${buoc}`, () => supabase.from('phien_hop_ho_so').update({ van_ban_id: vbId, trang_thai: tt_ }).eq('phien_hop_id', ph.id).eq('buoc', buoc));
    setGanBuoc(null); setTaoVbBuoc(null);
  };

  return (
    <>
      <TieuDeTrang tren={<><Link to="/hop" className="text-mo">Họp BCĐ</Link> / {LOAI_HOP[ph.loai]}</>} ten={ph.ten}
        phai={quanTri && <>
          <select className={cx(lopO, 'min-h-11 font-semibold')} value={ph.trang_thai} aria-label="Trạng thái phiên họp"
            onChange={(e) => chay('tt', () => supabase.from('phien_hop').update({ trang_thai: e.target.value as TtPhienHop }).eq('id', ph.id))}>
            {Object.entries(TT_HOP).map(([k, v]) => <option key={k} value={k}>{v.nhan}</option>)}
          </select>
          <Nut icon={<Pencil className="h-4 w-4" />} onClick={() => setMoSua(true)}>Sửa</Nut>
          <Nut kieu="nguy" icon={<Trash2 className="h-4 w-4" />} dangChay={dangChay === 'xoa'}
            onClick={() => { if (window.confirm(`Xoá "${ph.ten}" cùng hồ sơ và kết luận? (Nhiệm vụ đã giao vẫn giữ.)`)) void chay('xoa', async () => {
              const nvIds = data.nv.map((n) => n.id);
              if (nvIds.length) { const r = await supabase.from('nhiem_vu').update({ ket_luan_id: null }).in('id', nvIds); if (r.error) return r; }
              return supabase.from('phien_hop').delete().eq('id', ph.id);
            }, () => nav('/hop')); }}>Xoá</Nut>
        </>} />
      {loiTT && <HopLoi loi={loiTT} />}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-ink px-5 py-4 text-sm text-white">
        <Chip nen={tt.nen} chu={tt.chu}>{tt.nhan}</Chip>
        <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#E9CBC7]" />{ph.thoi_gian ? ngayGioDu(ph.thoi_gian) : 'Chưa chốt thời gian'}</span>
        <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[#E9CBC7]" />{ph.dia_diem ?? '—'}</span>
        <span className="flex items-center gap-2"><Users className="h-4 w-4 text-[#E9CBC7]" />{ph.chu_tri ?? '—'} chủ trì</span>
        {ph.ky_tu && <span className="text-[#F6E3E0]">Đánh giá {ngay(ph.ky_tu)} – {ngay(ph.ky_den)}</span>}
        <span className="flex-1" />
        {ph.thoi_gian && new Date(ph.thoi_gian).getTime() > Date.now() && <ChipHan han={ph.thoi_gian} />}
      </div>

      <The className="flex flex-col gap-3 p-4">
        <TieuDeThe>Hồ sơ phiên họp</TieuDeThe>
        {quanTri && !((data.tt?.truong_ban as { ho_ten?: string } | undefined)?.ho_ten) && (
          <div className="rounded-xl bg-cam-nhat px-3 py-2 text-[13px] text-cam-dam">Chưa có họ tên Trưởng ban để in phần ký — điền tại Quản trị › Cài đặt.</div>
        )}
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.hs.map((h) => {
            const t = TT_HS[h.trang_thai];
            const link = h.van_ban ? linkVb(h.van_ban) : null;
            return (
              <li key={h.buoc} className="flex flex-col gap-2.5 rounded-xl border border-vien p-3.5">
                <div className="flex items-start gap-3">
                  <span className={cx('so flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold', h.trang_thai === 'hoan_thanh' ? 'bg-[#16A34A] text-white' : 'bg-nen text-den')}>{h.buoc}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[14.5px] font-bold">{h.ten}</span>
                  </div>
                  <Chip nen={t.nen} chu={t.chu}>{t.nhan}</Chip>
                </div>
                {h.van_ban && (
                  <div className="flex items-center gap-2 rounded-lg bg-nen px-3 py-2 text-[13px]">
                    <Link2 className="h-4 w-4 shrink-0 text-do" />
                    {link ? <a href={link} target="_blank" rel="noreferrer" className="flex-1 truncate font-semibold text-[#A4161A]">{h.van_ban.so_ky_hieu ?? 'Dự thảo'} · {h.van_ban.trich_yeu}</a>
                      : <span className="flex-1 truncate">{h.van_ban.so_ky_hieu ?? 'Dự thảo'} · {h.van_ban.trich_yeu}</span>}
                    {link && <ExternalLink className="h-3.5 w-3.5 text-mo" />}
                  </div>
                )}
                {quanTri && (
                  <div className="flex flex-wrap gap-2">
                    <Nut icon={<FilePen className="h-4 w-4" />} onClick={() => nav(`/hop/${ph.id}/ho-so/${h.buoc}`)}>{h.trang_thai === 'chua_lam' ? 'Soạn dự thảo' : 'Mở dự thảo'}</Nut>
                    <Nut kieu="nhe" onClick={() => setGanBuoc(h.buoc)}>{h.van_ban ? 'Đổi văn bản' : 'Gắn văn bản đã ký'}</Nut>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </The>

      <The className="flex flex-col gap-3 p-4">
        <TieuDeThe phai={quanTri && <Nut icon={<Plus className="h-4 w-4" />} onClick={() => setSuaKl('moi')}>Thêm kết luận</Nut>}>Kết luận của Trưởng ban và việc giao</TieuDeThe>
        {data.kl.length === 0 ? <Rong>Chưa có kết luận.</Rong> : (
          <ol className="flex flex-col">
            {data.kl.map((k) => {
              const nv = data.nv.filter((n) => n.ket_luan_id === k.id);
              return (
                <li key={k.id} className="flex flex-col gap-2 border-b border-[#F1EEE7] py-3.5 last:border-0">
                  <div className="flex items-start gap-3">
                    <span className="so w-6 shrink-0 pt-0.5 text-right font-bold">{k.stt}.</span>
                    <p className="m-0 flex-1 whitespace-pre-line text-sm">{k.noi_dung}</p>
                    {quanTri && <>
                      <button aria-label="Sửa kết luận" onClick={() => setSuaKl(k)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-mo hover:bg-nen"><Pencil className="h-4 w-4" /></button>
                      <button aria-label="Xoá kết luận" onClick={() => { if (window.confirm('Xoá kết luận này? (Nhiệm vụ đã giao vẫn giữ.)')) void chay('xoa_kl', async () => {
                        if (nv.length) { const r = await supabase.from('nhiem_vu').update({ ket_luan_id: null }).in('id', nv.map((n) => n.id)); if (r.error) return r; }
                        return supabase.from('ket_luan').delete().eq('id', k.id);
                      }); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-mo hover:bg-nguy-nhat hover:text-nguy"><Trash2 className="h-4 w-4" /></button>
                    </>}
                  </div>
                  <div className="flex flex-col gap-1.5 pl-9">
                    {nv.map((n) => (
                      <Link key={n.id} to={`/nhiem-vu/${n.id}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-nen px-3 py-2 text-[13px] hover:bg-nen-3">
                        <span className="so font-semibold text-mo-2">{n.ma}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{n.chu_tri_ten ?? '—'}</span>
                        {n.trang_thai_giao === 'de_xuat' ? <Chip nen="bg-cam-nhat" chu="text-cam-dam">Chờ duyệt</Chip> : <Chip nen={TT_NV[n.trang_thai].nen} chu={TT_NV[n.trang_thai].chu}>{TT_NV[n.trang_thai].nhan} {n.phan_tram}%</Chip>}
                        <HanNv n={n} />
                      </Link>
                    ))}
                    {quanTri && <button onClick={() => setGiaoKl(k)} className="flex min-h-10 items-center gap-2 self-start rounded-lg px-2 text-[13px] font-semibold text-[#A4161A] hover:bg-xanh-nhat"><Send className="h-4 w-4" />Giao nhiệm vụ từ kết luận này</button>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </The>

      {(ph.thanh_phan || ph.noi_dung) && (
        <The className="grid gap-4 p-4 text-sm md:grid-cols-2">
          {ph.thanh_phan && <div><div className="mb-1 font-bold">Thành phần</div><p className="m-0 whitespace-pre-line text-mo-2">{ph.thanh_phan}</p></div>}
          {ph.noi_dung && <div><div className="mb-1 font-bold">Nội dung</div><p className="m-0 whitespace-pre-line text-mo-2">{ph.noi_dung}</p></div>}
        </The>
      )}

      {quanTri && <>
        <FormPhienHop mo={moSua} dong={() => setMoSua(false)} ph={ph} xong={() => { setMoSua(false); void taiLai(); }} />
        <FormKetLuan mo={suaKl !== null} dong={() => setSuaKl(null)} phId={ph.id} kl={suaKl === 'moi' ? null : suaKl} sttTiep={(data.kl.at(-1)?.stt ?? 0) + 1}
          xong={() => { setSuaKl(null); void taiLai(); }} />
        <FormNhiemVu mo={!!giaoKl} dong={() => setGiaoKl(null)} tieuDe={`Giao nhiệm vụ — kết luận số ${giaoKl?.stt ?? ''}`}
          dau={giaoKl ? { nhom: 'ket_luan_hop', ten: giaoKl.noi_dung, ket_luan_id: giaoKl.id, tham_quyen: `Trưởng Ban Chỉ đạo kết luận tại ${ph.ten}`, lanh_dao_phu_trach: 'Trưởng Ban Chỉ đạo' } : undefined}
          xong={() => { setGiaoKl(null); void taiLai(); }} />
        <ChonVanBan mo={ganBuoc !== null} dong={() => setGanBuoc(null)} buoc={ganBuoc}
          chon={(v) => ganVanBan(ganBuoc!, v.id, v.trang_thai)} taoMoi={() => { setTaoVbBuoc(ganBuoc); setGanBuoc(null); }} />
        <FormVanBan mo={taoVbBuoc !== null} dong={() => setTaoVbBuoc(null)}
          dau={taoVbBuoc ? { thu_muc: 'hop_bcd', loai: LOAI_THEO_BUOC[taoVbBuoc as 1 | 2 | 3 | 4], trich_yeu: `${data.hs.find((h) => h.buoc === taoVbBuoc)?.ten ?? ''} — ${ph.ten}`,
            co_quan_ban_hanh: taoVbBuoc === 1 ? 'Công an phường Nam Đông Hà' : 'Ban Chỉ đạo 57 phường Nam Đông Hà', trang_thai: 'ban_hanh' } : undefined}
          xong={async (vbId) => {
            const { data: v } = await supabase.from('van_ban').select('trang_thai').eq('id', vbId).single();
            await ganVanBan(taoVbBuoc!, vbId, v?.trang_thai);
          }} />
      </>}
    </>
  );
}

function FormKetLuan({ mo, dong, phId, kl, sttTiep, xong }: { mo: boolean; dong: () => void; phId: string; kl: KetLuan | null; sttTiep: number; xong: () => void }) {
  const [chu, setChu] = useState('');
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [daMo, setDaMo] = useState(false);
  if (mo && !daMo) { setDaMo(true); setChu(kl?.noi_dung ?? ''); setLoi(null); }
  if (!mo && daMo) setDaMo(false);

  const luu = async () => {
    const y = kl ? [chu.trim()].filter(Boolean) : chu.split(/\n\s*\n|\n(?=\s*\d+[.)]\s)/).map((x) => x.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
    if (!y.length) { setLoi('Nhập nội dung kết luận'); return; }
    setDangChay(true); setLoi(null);
    const r = kl
      ? await supabase.from('ket_luan').update({ noi_dung: y[0] }).eq('id', kl.id)
      : await supabase.from('ket_luan').insert(y.map((n, i) => ({ phien_hop_id: phId, stt: sttTiep + i, noi_dung: n })));
    setDangChay(false);
    if (r.error) setLoi(loiDe(r.error)); else xong();
  };
  return (
    <HopThoai mo={mo} dong={dong} tieuDe={kl ? `Sửa kết luận số ${kl.stt}` : 'Thêm kết luận'} rong="max-w-2xl">
      <div className="flex flex-col gap-3">
        <O nhan="Nội dung kết luận" goiY={kl ? undefined : 'Dán nhiều ý một lần: mỗi ý đánh số "1.", "2." hoặc cách nhau một dòng trống.'}>
          <textarea className={cx(lopO, 'min-h-40 py-2')} value={chu} onChange={(e) => setChu(e.target.value)} />
        </O>
        {loi && <HopLoi loi={loi} />}
        <div className="flex justify-end gap-2"><Nut onClick={dong}>Huỷ</Nut><Nut kieu="chinh" dangChay={dangChay} onClick={luu}>Lưu</Nut></div>
      </div>
    </HopThoai>
  );
}

function ChonVanBan({ mo, dong, buoc, chon, taoMoi }: { mo: boolean; dong: () => void; buoc: number | null; chon: (v: VanBan) => void; taoMoi: () => void }) {
  const { data } = useDuLieu(async () => (mo
    ? (kq(await supabase.from('van_ban').select(COT_VB).in('thu_muc', ['hop_bcd', 'bcd_phuong_ban_hanh']).order('tai_len_luc', { ascending: false }).limit(40)) ?? []) as unknown as VanBan[]
    : []), [mo]);
  return (
    <HopThoai mo={mo} dong={dong} tieuDe={`Gắn văn bản cho hồ sơ số ${buoc ?? ''}`}>
      <div className="flex flex-col gap-3">
        <Nut kieu="chinh" icon={<Plus className="h-4 w-4" />} onClick={taoMoi}>Tải lên văn bản mới (bản đã ký)</Nut>
        <div className="text-[13px] font-semibold text-mo-2">Hoặc chọn văn bản đã có trong kho</div>
        {(data ?? []).length === 0 ? <Rong>Kho chưa có văn bản thư mục họp BCĐ.</Rong> : (
          <ul className="flex max-h-80 flex-col overflow-auto rounded-xl border border-vien">
            {(data ?? []).map((v) => (
              <li key={v.id}><button onClick={() => chon(v)} className="flex w-full flex-col gap-0.5 border-b border-[#F1EEE7] px-3 py-2.5 text-left text-sm hover:bg-nen-2">
                <span className="so text-xs font-bold">{v.so_ky_hieu ?? 'Dự thảo'}{v.ngay_ban_hanh ? ` · ${ngay(v.ngay_ban_hanh)}` : ''}</span>
                <span>{v.trich_yeu}</span>
              </button></li>
            ))}
          </ul>
        )}
      </div>
    </HopThoai>
  );
}
