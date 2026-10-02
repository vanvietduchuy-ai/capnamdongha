// Dự thảo 4 hồ sơ phiên họp Ban Chỉ đạo, soạn trên trang A4:
//  1. Tờ trình (Công an phường – Cơ quan Thường trực trình Trưởng ban) — thể thức NĐ 30/2020
//  2. Giấy mời, 3. Báo cáo, 4. Thông báo kết luận — văn bản của Ban Chỉ đạo (trực thuộc Đảng ủy) — thể thức văn bản Đảng
import { khoiBangDa06, type KhoiA4, type MoHinhA4 } from './baoCaoA4';
import { tachDoan } from './baoCaoDocx';
import type { BangDa06 } from './duLieuBaoCao';

export type TheThucBcd = {
  co_quan_cap_tren: string; co_quan: string; ky_hieu: string; dia_danh: string;
  truong_ban: { chuc_danh: string; ho_ten: string };
  cqtt_ky_to_trinh: { chuc_danh: string; ho_ten: string };
};
export const THE_THUC_MAC_DINH: TheThucBcd = {
  co_quan_cap_tren: 'ĐẢNG ỦY PHƯỜNG NAM ĐÔNG HÀ', co_quan: 'BAN CHỈ ĐẠO 57', ky_hieu: 'BCĐ', dia_danh: 'Nam Đông Hà',
  truong_ban: { chuc_danh: 'TRƯỞNG BAN', ho_ten: '' },
  cqtt_ky_to_trinh: { chuc_danh: 'TRƯỞNG CÔNG AN PHƯỜNG', ho_ten: '' },
};

export type PhienHopA4 = {
  ten: string; thoi_gian: string | null; dia_diem: string | null; chu_tri: string | null; thanh_phan: string | null;
  noi_dung: string | null; ky_tu: string | null; ky_den: string | null;
};
export type NvA4 = { ten: string; chu_tri: string; han: string | null; phan_tram: number; trang_thai: string; qua_han: boolean };
export type KetLuanA4 = { stt: number; noi_dung: string; giao: { chu_tri: string; han: string | null }[] };
export type DuLieuBaoCaoHop = {
  vanBanBanHanh: { so_ky_hieu: string | null; ngay: string | null; trich_yeu: string }[];
  nhiemVu: NvA4[];
  kyBaoCao: { ten: string; so_don_vi: number; dung_han: number; tre: number; chua_nop: number }[];
  da06: BangDa06 | null;
};

const nam = () => new Date().getFullYear();
const dmy = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '…');
const thuong = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const gioNgay = (t: string | null) => {
  if (!t) return '… giờ … phút, ngày … tháng … năm …';
  const p = Object.fromEntries(new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'long', hour12: false })
    .formatToParts(new Date(t)).map((q) => [q.type, q.value]));
  return `${p.hour} giờ ${p.minute}, ${thuong(p.weekday)}, ngày ${p.day} tháng ${p.month} năm ${p.year}`;
};
const ngayVN = (t: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(t));
const gop = (s: string | null, macDinh: string) => tachDoan(s ?? '').join('; ') || macDinh;
const van = (ma: string, dong: string[]): KhoiA4 => ({ loai: 'van', ma, nhan: 'Nội dung', noiDung: dong.join('\n'), tuDo: true });

function dauDang(tt: TheThucBcd, loai: string): Pick<MoHinhA4, 'dang' | 'cq' | 'bh' | 'so' | 'kh' | 'ngay' | 'nam'> {
  return { dang: true, cq: tt.co_quan_cap_tren, bh: tt.co_quan, so: '', kh: `${loai}/${tt.ky_hieu}`, ngay: '', nam: nam() };
}
const kyDang = (tt: TheThucBcd, noiNhan: string[], tm = true) =>
  ({ noiNhan: noiNhan.join('\n'), chucDanh: tm ? `T/M BAN CHỈ ĐẠO\n${tt.truong_ban.chuc_danh}` : tt.truong_ban.chuc_danh, hoTen: tt.truong_ban.ho_ten ?? '' });

// ---------- 1. Tờ trình ----------
export function toTrinhA4(ph: PhienHopA4, tt: TheThucBcd): MoHinhA4 {
  const nd = tachDoan(ph.noi_dung ?? '');
  return {
    dang: false, cq: 'CÔNG AN TỈNH QUẢNG TRỊ', bh: 'CÔNG AN PHƯỜNG NAM ĐÔNG HÀ', so: '', kh: 'TTr-CAP-TH', ngay: '', nam: nam(),
    tenLoai: 'TỜ TRÌNH', trichYeuNhieuDong: true,
    trichYeu: `Về việc tổ chức ${thuong(ph.ten)}\ncủa Ban Chỉ đạo 57 phường Nam Đông Hà`, dongPhu: '',
    kinhGui: 'Kính gửi: Đồng chí Trưởng Ban Chỉ đạo 57 phường Nam Đông Hà.',
    khoi: [van('than', [
      `Căn cứ Quy chế làm việc của Ban Chỉ đạo 57 phường Nam Đông Hà; căn cứ Chương trình công tác năm ${nam()} của Ban Chỉ đạo;`,
      `Thực hiện nhiệm vụ Cơ quan Thường trực Ban Chỉ đạo, Công an phường kính trình đồng chí Trưởng Ban Chỉ đạo cho chủ trương tổ chức ${thuong(ph.ten)}, cụ thể như sau:`,
      `1. Thời gian: ${gioNgay(ph.thoi_gian)}.`,
      `2. Địa điểm: ${ph.dia_diem ?? '…'}.`,
      `3. Chủ trì: ${ph.chu_tri ?? 'Đồng chí Trưởng Ban Chỉ đạo'}.`,
      `4. Thành phần: ${gop(ph.thanh_phan, 'Các đồng chí thành viên Ban Chỉ đạo; thành viên Tổ Giúp việc; đại diện Cơ quan Thường trực')}.`,
      '5. Nội dung:',
      ...(nd.length ? nd.map((x) => `- ${x}`) : [
        `- Nghe Cơ quan Thường trực báo cáo kết quả thực hiện nhiệm vụ${ph.ky_tu ? ` từ ngày ${dmy(ph.ky_tu)} đến ngày ${dmy(ph.ky_den)}` : ''}; nhiệm vụ trọng tâm thời gian tới.`,
        '- Các thành viên Ban Chỉ đạo, đơn vị thảo luận, đề xuất, kiến nghị.',
        '- Đồng chí Trưởng Ban Chỉ đạo kết luận.',
      ]),
      'Kèm theo Tờ trình: dự thảo Giấy mời, dự thảo Báo cáo kết quả thực hiện nhiệm vụ.',
      'Công an phường kính trình đồng chí Trưởng Ban Chỉ đạo xem xét, cho ý kiến./.',
    ])],
    noiNhan: '- Như trên;\n- Ban Chỉ huy CAP;\n- Lưu: VT, TH.',
    chucDanh: tt.cqtt_ky_to_trinh.chuc_danh, hoTen: tt.cqtt_ky_to_trinh.ho_ten ?? '',
  };
}

// ---------- 2. Giấy mời ----------
export function giayMoiA4(ph: PhienHopA4, tt: TheThucBcd): MoHinhA4 {
  return {
    ...dauDang(tt, 'GM'), tenLoai: 'GIẤY MỜI', trichYeu: `dự ${thuong(ph.ten)}`, trichYeuNhieuDong: true, dongPhu: '',
    khoi: [van('than', [
      'Ban Chỉ đạo 57 phường Nam Đông Hà trân trọng kính mời:',
      ...tachDoan(ph.thanh_phan ?? 'Các đồng chí thành viên Ban Chỉ đạo\nCác đồng chí thành viên Tổ Giúp việc\nThủ trưởng các đơn vị: Công an phường, Trạm Y tế, Phòng Văn hóa - Xã hội, Phòng Kinh tế, Hạ tầng và Đô thị, Trung tâm Phục vụ hành chính công')
        .map((x) => `- ${x}`),
      `Đến dự: ${ph.ten}.`,
      `Nội dung: ${tachDoan(ph.noi_dung ?? '').join('; ') || 'Đánh giá kết quả thực hiện nhiệm vụ, triển khai nhiệm vụ trọng tâm thời gian tới.'}`,
      `Chủ trì: ${ph.chu_tri ?? 'Đồng chí Trưởng Ban Chỉ đạo'}.`,
      `Thời gian: ${gioNgay(ph.thoi_gian)}.`,
      `Địa điểm: ${ph.dia_diem ?? '…'}.`,
      'Giao Công an phường (Cơ quan Thường trực) chuẩn bị tài liệu, điều kiện tổ chức phiên họp. Đề nghị các đồng chí được mời nghiên cứu tài liệu, chuẩn bị ý kiến phát biểu và dự họp đầy đủ, đúng thời gian./.',
    ])],
    ...kyDang(tt, ['- Như thành phần mời,', '- Lưu Cơ quan Thường trực.']),
  };
}

// ---------- 3. Báo cáo kết quả thực hiện nhiệm vụ ----------
export function baoCaoHopA4(ph: PhienHopA4, tt: TheThucBcd, d: DuLieuBaoCaoHop): MoHinhA4 {
  const tong = d.nhiemVu.length;
  const xong = d.nhiemVu.filter((n) => n.trang_thai === 'Hoàn thành').length;
  const qua = d.nhiemVu.filter((n) => n.qua_han);
  const dang = d.nhiemVu.filter((n) => n.trang_thai !== 'Hoàn thành');
  const khoi: KhoiA4[] = [
    van('phan1', [
      'I. CÔNG TÁC LÃNH ĐẠO, CHỈ ĐẠO, ĐIỀU HÀNH',
      ...(d.vanBanBanHanh.length
        ? [`Trong kỳ, Ban Chỉ đạo đã ban hành ${d.vanBanBanHanh.length} văn bản lãnh đạo, chỉ đạo, gồm:`,
          ...d.vanBanBanHanh.map((v) => `- ${v.so_ky_hieu ? v.so_ky_hieu + ' ' : ''}${v.ngay ? `ngày ${dmy(v.ngay)} ` : ''}về ${thuong(v.trich_yeu)};`)]
        : ['…']),
      'II. KẾT QUẢ THỰC HIỆN NHIỆM VỤ',
      '1. Kết quả thực hiện nhiệm vụ được giao',
      `Tổng số nhiệm vụ Ban Chỉ đạo giao: ${tong}; đã hoàn thành ${xong} (${tong ? Math.round((xong / tong) * 100) : 0}%); đang thực hiện ${tong - xong}${qua.length ? `, trong đó ${qua.length} nhiệm vụ quá hạn` : ''}.`,
    ]),
  ];
  if (tong) khoi.push({
    loai: 'bang', ma: 'bang_nv', cot: ['TT', 'Nhiệm vụ', 'Chủ trì', 'Hạn', 'Kết quả'], rong: [560, 3500, 2000, 1450, 1561], cotTrai: [1, 2],
    dong: d.nhiemVu.map((n, i) => [String(i + 1), n.ten, n.chu_tri, n.han ? dmy(n.han) : '—', n.trang_thai === 'Hoàn thành' ? 'Hoàn thành' : `${n.trang_thai}, ${n.phan_tram}%${n.qua_han ? ' (quá hạn)' : ''}`]),
  });
  khoi.push(van('phan2', [
    '2. Thực hiện chế độ báo cáo',
    ...(d.kyBaoCao.length ? d.kyBaoCao.map((k) => `- ${k.ten}: ${k.dung_han}/${k.so_don_vi} đơn vị nộp đúng hạn${k.tre ? `, ${k.tre} đơn vị nộp trễ` : ''}${k.chua_nop ? `, ${k.chua_nop} đơn vị chưa nộp` : ''}.`) : ['…']),
    ...(d.da06?.dong.length ? ['3. Kết quả các chỉ tiêu Đề án 06'] : []),
  ]));
  if (d.da06?.dong.length) khoi.push(khoiBangDa06(d.da06));
  khoi.push(van('phan3', [
    'III. TỒN TẠI, HẠN CHẾ VÀ NGUYÊN NHÂN',
    ...(qua.length ? [`Còn ${qua.length} nhiệm vụ chậm tiến độ so với thời hạn được giao:`, ...qua.map((n) => `- ${n.ten} (${n.chu_tri}, hạn ${dmy(n.han)}, đạt ${n.phan_tram}%);`)] : ['…']),
    'Nguyên nhân: …',
    'IV. NHIỆM VỤ TRỌNG TÂM THỜI GIAN TỚI',
    ...(dang.length ? dang.map((n, i) => `- ${n.ten} (${n.chu_tri} chủ trì${n.han ? `, hoàn thành trước ngày ${dmy(n.han)}` : ''})${i === dang.length - 1 ? '.' : ';'}`) : ['…']),
    'V. ĐỀ XUẤT, KIẾN NGHỊ',
    '…',
  ]));
  return {
    ...dauDang(tt, 'BC'), tenLoai: 'BÁO CÁO', trichYeuNhieuDong: true,
    trichYeu: 'kết quả thực hiện nhiệm vụ của Ban Chỉ đạo 57 phường\nvà nhiệm vụ trọng tâm thời gian tới',
    dongPhu: ph.ky_tu ? `(Từ ngày ${dmy(ph.ky_tu)} đến ngày ${dmy(ph.ky_den)})` : '',
    khoi, ...kyDang(tt, ['- Thường trực Đảng ủy phường,', '- Các thành viên Ban Chỉ đạo,', '- Lưu Cơ quan Thường trực.']),
  };
}

// ---------- 4. Thông báo kết luận ----------
export function thongBaoKetLuanA4(ph: PhienHopA4, tt: TheThucBcd, kl: KetLuanA4[]): MoHinhA4 {
  return {
    ...dauDang(tt, 'TB'), tenLoai: 'THÔNG BÁO', trichYeuNhieuDong: true, dongPhu: '',
    trichYeu: `kết luận của đồng chí Trưởng Ban Chỉ đạo\ntại ${thuong(ph.ten)}`,
    khoi: [van('than', [
      `Ngày ${ph.thoi_gian ? dmy(ngayVN(ph.thoi_gian)) : '…'}, tại ${ph.dia_diem ?? '…'}, Ban Chỉ đạo 57 phường Nam Đông Hà tổ chức ${thuong(ph.ten)}. ${ph.chu_tri ? `Đồng chí ${ph.chu_tri.replace(/^đồng chí\s*/i, '')} chủ trì. ` : ''}Tham dự có: ${thuong(gop(ph.thanh_phan, 'các đồng chí thành viên Ban Chỉ đạo, Tổ Giúp việc và đại diện các đơn vị liên quan'))}.`,
      'Sau khi nghe Cơ quan Thường trực báo cáo kết quả thực hiện nhiệm vụ, ý kiến của các thành viên Ban Chỉ đạo và đại diện các đơn vị, đồng chí Trưởng Ban Chỉ đạo kết luận như sau:',
      ...(kl.length ? kl.flatMap((k) => [
        `${k.stt}. ${k.noi_dung.replace(/\s*\n\s*/g, ' ')}${/[.;]$/.test(k.noi_dung.trim()) ? '' : '.'}`,
        ...k.giao.map((g) => `(Giao: ${g.chu_tri} chủ trì; thời hạn: ${g.han ? dmy(g.han) : '…'})`),
      ]) : ['1. …']),
      'Ban Chỉ đạo thông báo để các thành viên Ban Chỉ đạo, các đơn vị liên quan biết, thực hiện. Giao Công an phường (Cơ quan Thường trực) theo dõi, đôn đốc, tổng hợp kết quả báo cáo Trưởng Ban Chỉ đạo./.',
    ])],
    ...kyDang(tt, ['- Thường trực Đảng ủy phường,', '- Các thành viên Ban Chỉ đạo,', '- Các đơn vị liên quan,', '- Lưu Cơ quan Thường trực.']),
  };
}
