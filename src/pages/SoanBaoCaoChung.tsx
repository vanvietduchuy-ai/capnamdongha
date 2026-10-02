// Thường trực BCĐ soạn báo cáo chung (gửi Công an tỉnh qua PV01) trên trang A4:
// căn cứ báo cáo văn bản (PDF đã ký) của 2 đầu mối (VH-XH: NQ 57, CĐS; CSKV: ĐA06); đầu mối chưa gửi thì liệt kê báo cáo đơn vị.
// Ký xong: gắn bản PDF đã ký, đóng dấu -> vào sổ công văn đi, lưu Google Drive.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileUp } from 'lucide-react';
import { loiDe, supabase } from '../lib/supabase';
import { kq, useDuLieu } from '../lib/useDuLieu';
import { useAuth } from '../lib/auth';
import { ngay } from '../lib/dinhDang';
import { dongKyTu, khoiBangDa06, LV_CDS, thangCuaKy, type KhoiA4, type MoHinhA4 } from '../lib/baoCaoA4';
import { layBangDa06 } from '../lib/duLieuBaoCao';
import { META_TRONG, soKyHieu, type MetaVb } from '../lib/docPdf';
import { Chip, DangTai, HopLoi, HopThoai, Nut, The, TieuDeThe, TieuDeTrang } from '../components/ui';
import KhungSoanA4 from '../components/KhungSoanA4';
import OVanBanPdf, { COT_VB_NOP, kiemTraMeta, taiPdfLenDrive, ThongTinVanBan, type VanBanDaNop } from '../components/VanBanPdf';
import { TT_NOP } from './KyBaoCaoChiTiet';

type Ky = { id: string; ten: string; loai: string; tu_ngay: string | null; den_ngay: string | null; han_nop: string; ban_tong_hop: MoHinhA4 | null; van_ban_gui_id: string | null };
type Vb = VanBanDaNop & { noi_dung: string | null };
type Bai = { don_vi_id: string; trang_thai: string; don_vi: { ten: string; thu_tu: number }; van_ban: Vb | null };

async function taiNguon(kyId: string) {
  const [k, con, dm, cfg] = await Promise.all([
    supabase.from('ky_bao_cao').select('id, ten, loai, tu_ngay, den_ngay, han_nop, ban_tong_hop, van_ban_gui_id').eq('id', kyId).single(),
    supabase.from('ky_bao_cao').select('id').eq('ky_cha_id', kyId).eq('cap', 'linh_vuc').maybeSingle(),
    supabase.from('dau_moi_linh_vuc').select('linh_vuc, don_vi_id'),
    supabase.from('cau_hinh').select('gia_tri').eq('khoa', 'nguoi_ky_bao_cao').maybeSingle(),
  ]);
  const ky = kq(k) as Ky;
  const cot = `don_vi_id, trang_thai, don_vi(ten, thu_tu), van_ban!nop_bao_cao_van_ban_id_fkey(${COT_VB_NOP}, noi_dung)`;
  const [a, b, g] = await Promise.all([
    supabase.from('nop_bao_cao').select(cot).eq('ky_id', kyId),
    con.data ? supabase.from('nop_bao_cao').select(cot).eq('ky_id', (con.data as { id: string }).id) : Promise.resolve({ data: [], error: null }),
    ky.van_ban_gui_id ? supabase.from('van_ban').select(COT_VB_NOP).eq('id', ky.van_ban_gui_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const sx = (x: Bai[]) => x.sort((p, q) => p.don_vi.thu_tu - q.don_vi.thu_tu);
  return {
    ky, donVi: sx((kq(a) ?? []) as unknown as Bai[]), linhVuc: sx((kq(b) ?? []) as unknown as Bai[]),
    dm: (kq(dm) ?? []) as { linh_vuc: string; don_vi_id: string }[],
    nguoiKy: cfg.data?.gia_tri as { chuc_danh: string; ho_ten: string } | undefined,
    banGui: (g.data ?? null) as VanBanDaNop | null,
  };
}
type Nguon = Awaited<ReturnType<typeof taiNguon>>;
const daGui = (b?: Bai) => !!b && ['da_nop', 'da_duyet'].includes(b.trang_thai);
const trichDan = (b: Bai) => `Báo cáo số ${b.van_ban?.so_ky_hieu ?? '…'}${b.van_ban?.ngay_ban_hanh ? ` ngày ${ngay(b.van_ban.ngay_ban_hanh)}` : ''} của ${b.don_vi.ten}`;

// Phần thân văn bản đọc từ PDF: bỏ phần đầu, phần ký; ghép lại thành đoạn; bỏ đề mục in hoa của văn bản gốc
export function thanVanBan(chu?: string | null): string[] {
  if (!chu) return [];
  const d = chu.split('\n').map((x) => x.trim()).filter(Boolean);
  const dau = 0;                                                                           // chữ đã là phần nội dung (web đọc sẵn khi nộp)
  let cuoi = d.findIndex((x, i) => i > dau && /^Nơi nhận/i.test(x));
  if (cuoi < 0) cuoi = d.length;
  const doan: string[] = [];
  for (const x of d.slice(dau, cuoi)) {
    if (/^\((Từ|Kỳ)/.test(x)) continue;
    if (/\p{L}/u.test(x) && x === x.toUpperCase() && x.length < 90) continue;            // đề mục gốc (I. KẾT QUẢ…)
    if (/^Kính gửi/.test(x)) continue;
    const moi = /^([IVX]+\.|\d+(\.\d+)*\.|[a-zđ]\)|[-+•])\s/.test(x) || !doan.length || /[.:;!?]$/.test(doan[doan.length - 1]);
    if (moi) doan.push(x); else doan[doan.length - 1] += ` ${x}`;
  }
  return doan;
}

async function taoMoi(n: Nguon): Promise<MoHinhA4> {
  const dmDv = (lv: (x: string) => boolean) => n.dm.find((x) => lv(x.linh_vuc))?.don_vi_id;
  const baiCds = n.linhVuc.find((b) => b.don_vi_id === dmDv((x) => LV_CDS.includes(x)));
  const baiDa06 = n.linhVuc.find((b) => b.don_vi_id === dmDv((x) => x === 'de_an_06'));
  const donViNop = n.donVi.filter((b) => daGui(b) && b.van_ban);
  const phan = (bai: Bai | undefined) => {
    if (daGui(bai) && bai!.van_ban) { const t = thanVanBan(bai!.van_ban.noi_dung); return t.length ? t : [`(Theo ${trichDan(bai!)}: …)`]; }
    // Đầu mối chưa gửi: lấy đoạn đầu báo cáo của từng đơn vị
    return donViNop.length ? donViNop.map((b) => {
      const t = thanVanBan(b.van_ban?.noi_dung).join(' ');
      return `- ${b.don_vi.ten} (Báo cáo số ${b.van_ban?.so_ky_hieu ?? '…'}): ${t ? (t.length > 400 ? `${t.slice(0, 400)}…` : t) : '…'}`;
    }) : ['…'];
  };
  const canCu = [baiCds, baiDa06].filter((b) => daGui(b) && b!.van_ban).map((b) => trichDan(b!));
  const bang = await layBangDa06();
  const thang = thangCuaKy({ ...n.ky, cap: 'don_vi' });

  const khoi: KhoiA4[] = [{
    loai: 'van', ma: 'phan1', nhan: 'Phần I, II', tuDo: true, noiDung: [
      ...(canCu.length ? [`Trên cơ sở ${canCu.join('; ')}, Công an phường (Cơ quan Thường trực BCĐ 57) báo cáo như sau:`] : []),
      'I. CÔNG TÁC LÃNH ĐẠO, CHỈ ĐẠO, TRIỂN KHAI',
      '…',
      'II. KẾT QUẢ THỰC HIỆN',
      '1. Thực hiện Nghị quyết số 57-NQ/TW, khoa học công nghệ, đổi mới sáng tạo và chuyển đổi số',
      ...phan(baiCds),
      '2. Thực hiện Đề án 06',
      ...phan(baiDa06),
    ].join('\n'),
  }];
  if (bang?.dong.length) khoi.push(khoiBangDa06(bang));
  khoi.push({
    loai: 'van', ma: 'phan2', nhan: 'Phần III–V', tuDo: true, noiDung: [
      '3. An ninh mạng, an toàn thông tin', '…',
      'III. TỒN TẠI, HẠN CHẾ', '…',
      'IV. NHIỆM VỤ TRỌNG TÂM THÁNG TỚI', '…',
      'V. ĐỀ XUẤT, KIẾN NGHỊ', '…',
    ].join('\n'),
  });
  return {
    dang: false, cq: 'CÔNG AN TỈNH QUẢNG TRỊ', bh: 'CÔNG AN PHƯỜNG NAM ĐÔNG HÀ', so: '', kh: 'BC-CAP-TH', ngay: '',
    nam: Number((n.ky.den_ngay ?? n.ky.han_nop).slice(0, 4)),
    tenLoai: 'BÁO CÁO', trichYeu: thang ? `Kết quả thực hiện Nghị quyết số 57-NQ/TW và Đề án 06 tháng ${thang}` : n.ky.ten,
    dongPhu: dongKyTu(n.ky.tu_ngay, n.ky.den_ngay), khoi,
    noiNhan: '- Công an tỉnh (qua PV01);\n- Thường trực BCĐ 57 phường;\n- Ban Chỉ huy CAP;\n- Lưu: VT, TH.',
    chucDanh: n.nguoiKy?.chuc_danh ?? 'TRƯỞNG CÔNG AN PHƯỜNG', hoTen: n.nguoiKy?.ho_ten ?? '',
  };
}

export default function SoanBaoCaoChung() {
  const { id } = useParams();
  const { hoSo } = useAuth();
  const quanTri = hoSo?.vai_tro === 'quan_tri';
  const { data, loi, dangTai, taiLai } = useDuLieu(() => taiNguon(id!), [id]);
  const [m, setM] = useState<MoHinhA4 | null>(null);
  const [moGan, setMoGan] = useState(false);

  useEffect(() => {
    if (!data) return;
    if (data.ky.ban_tong_hop) setM(data.ky.ban_tong_hop);
    else void taoMoi(data).then(setM);
  }, [data]);

  if (loi) return <HopLoi loi={loi} taiLai={taiLai} />;
  if ((dangTai && !data) || !data || !m) return <DangTai />;

  const tenDv = (lv: (x: string) => boolean) => data.dm.find((x) => lv(x.linh_vuc))?.don_vi_id;
  const nguon = [
    { ten: 'NQ 57, CĐS', b: data.linhVuc.find((b) => b.don_vi_id === tenDv((x) => LV_CDS.includes(x))) },
    { ten: 'Đề án 06', b: data.linhVuc.find((b) => b.don_vi_id === tenDv((x) => x === 'de_an_06')) },
  ];

  return (
    <>
      <TieuDeTrang tren={<><Link to={`/ky-bao-cao/${data.ky.id}`} className="text-mo">{data.ky.ten}</Link> / Báo cáo chung</>}
        ten="Báo cáo gửi Công an tỉnh (PV01)"
        phai={quanTri && !data.banGui && <Nut kieu="chinh" icon={<FileUp className="h-4 w-4" />} onClick={() => setMoGan(true)}>Gắn bản đã ký (PDF)</Nut>} />
      {data.banGui && (
        <The className="flex flex-col gap-3 border-[#16A34A]/40 p-4">
          <TieuDeThe phai={<Chip nen="bg-[#DCFCE7]" chu="text-[#166534]">Đã vào sổ đi</Chip>}>Bản đã ký, đóng dấu gửi Công an tỉnh</TieuDeThe>
          <ThongTinVanBan vb={data.banGui} xemTruoc={false} />
        </The>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-vien bg-white px-4 py-3 text-[13px]">
        <span className="font-bold">Căn cứ</span>
        {nguon.map((x) => (
          <span key={x.ten} className="flex items-center gap-1.5">{x.ten}: {x.b?.don_vi.ten ?? '—'}
            {x.b ? <Chip nen={TT_NOP[x.b.trang_thai].nen} chu={TT_NOP[x.b.trang_thai].chu}>{TT_NOP[x.b.trang_thai].nhan}</Chip> : null}
            {x.b?.van_ban && <b className="so">{x.b.van_ban.so_ky_hieu}</b>}
          </span>
        ))}
        <span className="text-mo">{data.donVi.filter(daGui).length}/{data.donVi.length} đơn vị đã nộp</span>
      </div>
      <KhungSoanA4 m={m} setM={(f) => setM((x) => (x ? f(x) : x))} suaDuoc={quanTri && !data.banGui} moi={!data.ky.ban_tong_hop}
        tenFile={`Bao cao PV01 - ${data.ky.ten}`}
        taoLai={async () => setM(await taoMoi(await taiNguon(id!)))}
        luu={async (x) => { const { error } = await supabase.from('ky_bao_cao').update({ ban_tong_hop: x }).eq('id', data.ky.id); if (error) throw error; }} />
      {quanTri && <GanBanKy mo={moGan} dong={() => setMoGan(false)} kyId={data.ky.id} m={m} xong={() => { setMoGan(false); void taiLai(); }} />}
    </>
  );
}

// Gắn PDF đã ký, đóng dấu của báo cáo gửi Công an tỉnh -> kho văn bản (Báo cáo gửi cấp trên) + sổ công văn đi
function GanBanKy({ mo, dong, kyId, m, xong }: { mo: boolean; dong: () => void; kyId: string; m: MoHinhA4; xong: () => void }) {
  const macDinh = (): MetaVb => ({ ...META_TRONG, loai: 'bao_cao', ky_hieu: m.kh, trich_yeu: m.trichYeu, co_quan_ban_hanh: 'Công an phường Nam Đông Hà', nguoi_ky: m.hoTen, chuc_vu_nguoi_ky: m.chucDanh });
  const [meta, setMeta] = useState<MetaVb>(macDinh);
  const [tep, setTep] = useState<File | null>(null);
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const luu = async () => {
    setLoi(null);
    if (!tep) { setLoi('Chọn tệp PDF đã ký, đóng dấu'); return; }
    const l = kiemTraMeta(meta); if (l) { setLoi(l); return; }
    setDangChay(true);
    try {
      const len = await taiPdfLenDrive(tep, 'van_ban', { thuMuc: 'Báo cáo gửi cấp trên' });
      const r = await supabase.from('van_ban').insert({
        so_van_ban: meta.so_van_ban || null, ky_hieu: meta.ky_hieu || null, so_ky_hieu: soKyHieu(meta.so_van_ban, meta.ky_hieu) || null,
        ngay_ban_hanh: meta.ngay_ban_hanh || null, trich_yeu: meta.trich_yeu.trim(), co_quan_ban_hanh: meta.co_quan_ban_hanh || 'Công an phường Nam Đông Hà',
        loai: meta.loai, thu_muc: 'bao_cao_gui_cap_tren', trang_thai: 'ban_hanh', nguoi_ky: meta.nguoi_ky || null, chuc_vu_nguoi_ky: meta.chuc_vu_nguoi_ky || null,
        drive_file_id: len.drive_file_id, drive_url: len.url, ten_tep: tep.name, noi_dung: meta.noi_dung || null,
      }).select('id').single();
      if (r.error) throw r.error;
      const u = await supabase.from('ky_bao_cao').update({ van_ban_gui_id: r.data.id }).eq('id', kyId);
      if (u.error) throw u.error;
      xong();
    } catch (e) { setLoi(loiDe(e)); } finally { setDangChay(false); }
  };
  return (
    <HopThoai mo={mo} dong={dong} tieuDe="Gắn bản đã ký gửi Công an tỉnh" rong="max-w-[1000px]">
      <div className="flex flex-col gap-3">
        <OVanBanPdf meta={meta} doiMeta={setMeta} tep={tep} chonTep={(f, x) => { setTep(f); setMeta({ ...x, co_quan_ban_hanh: x.co_quan_ban_hanh || 'Công an phường Nam Đông Hà' }); }} hienCoQuan />
        {loi && <HopLoi loi={loi} />}
        <div className="flex justify-end gap-2"><Nut onClick={dong}>Huỷ</Nut><Nut kieu="chinh" dangChay={dangChay} onClick={luu}>Lưu, vào sổ đi</Nut></div>
      </div>
    </HopThoai>
  );
}
