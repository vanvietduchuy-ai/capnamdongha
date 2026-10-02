// Trang A4 động: soạn và xem văn bản đúng thể thức NĐ 30/2020 (văn bản Đảng: HD 36).
// Máy tính: tờ A4 thật tỷ lệ (lề 20-20-30-20 mm, Times New Roman 14, giãn dòng 1,2, cách đoạn 6 pt) kèm vạch ngắt trang.
// Điện thoại: tờ giấy co giãn theo màn hình, phần đầu văn bản xếp dọc cho dễ đọc.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { coVua, dong, dongNgay, doanVan, kieuDong, type KhoaMeta, type KhoiA4, type MoHinhA4 } from '../lib/baoCaoA4';
import SoanDoanVan, { OChu } from './SoanDoanVan';

const RONG_A4 = 794, CAO_A4 = 1123;          // px ở 96 dpi
const MM = 3.7795;
const FONT = "'Times New Roman', Tinos, 'Liberation Serif', serif";
export default function TrangA4({ m, sua, doiSoTrang }: {
  m: MoHinhA4;
  sua?: (khoa: KhoaMeta | string, gt: string) => void;   // không truyền = chỉ xem
  doiSoTrang?: (n: number) => void;
}) {
  const vo = useRef<HTMLDivElement>(null);
  const noiDung = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [caoND, setCaoND] = useState(0);

  useLayoutEffect(() => {
    const el = vo.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = noiDung.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setCaoND(e.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [w > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const du = w >= 640;                                   // đủ rộng để hiện tờ A4 đúng tỷ lệ
  const rongTo = du ? Math.min(w - 32, RONG_A4) : w;
  const k = rongTo / RONG_A4;
  const coChu = du ? 18.667 * k : 15;                    // 14 pt
  const pt = (n: number) => (n * coChu) / 14;
  const le = du ? { tren: 20 * MM * k, duoi: 20 * MM * k, trai: 30 * MM * k, phai: 20 * MM * k } : { tren: 22, duoi: 26, trai: 18, phai: 16 };
  const caoTrang = CAO_A4 * k, vungIn = caoTrang - le.tren - le.duoi;
  const soTrang = du && caoND ? Math.max(1, Math.ceil((caoND - le.tren - le.duoi - 1) / vungIn)) : 1;
  useLayoutEffect(() => { if (du) doiSoTrang?.(soTrang); }, [soTrang, du, doiSoTrang]);

  const doan: CSSProperties = { fontSize: pt(14), lineHeight: 1.38, textAlign: 'justify', textIndent: du ? 10 * MM * k : 20, padding: `${pt(6)}px 0` };
  const giua = (co: number, x: CSSProperties = {}): CSSProperties => ({ fontSize: pt(co), lineHeight: 1.25, textAlign: 'center', ...x });
  const hoa = (co: number, dam: boolean): CSSProperties => giua(co, { textTransform: 'uppercase', fontWeight: dam ? 700 : 400 });
  const vach = (rong: string): ReactNode => <div aria-hidden style={{ width: rong, margin: `${pt(2)}px auto 0`, borderTop: '1px solid #1F1A17' }} />;
  // Bảng hai cột không viền: rộng hơn vùng chữ, nhô trái 1 cm như bản Word (10200 DXA, thụt −567)
  const haiCot: CSSProperties = du
    ? { display: 'grid', gridTemplateColumns: '42.16% 57.84%', width: 680 * k, marginLeft: -37.8 * k }
    : { display: 'grid', gridTemplateColumns: '1fr', rowGap: 14 };

  const chu = (khoa: KhoaMeta, gt: string, kieu: CSSProperties, nhan: string, o: { dong1?: boolean; goiY?: string } = {}) =>
    sua ? <OChu nhan={nhan} value={gt} onChange={(v) => sua(khoa, v)} style={kieu} rong={rongTo} dong1={o.dong1} placeholder={o.goiY} />
      : <div style={{ ...kieu, whiteSpace: 'pre-line' }}>{gt}</div>;

  // ---------- Phần đầu (quốc hiệu, tên cơ quan, số, ngày)
  const oSo = sua
    ? <input aria-label="Số văn bản" value={m.so} onChange={(e) => sua('_so', e.target.value.replace(/\s/g, ''))} placeholder="…"
        className="border-0 border-b border-dotted border-[#A8A29E] bg-transparent p-0 text-center outline-none focus:bg-[#FEF3C7]/60"
        style={{ width: `${Math.max(2, m.so.length) + 0.3}ch`, fontSize: 'inherit' }} />
    : (m.so || '    ');
  const trai = (
    <div>
      {(m.cq || sua) && chu('_cq', m.cq, hoa(coVua(m.cq, m.dang ? 14 : 13), false), 'Cơ quan chủ quản', { goiY: 'CƠ QUAN CHỦ QUẢN' })}
      {chu('_bh', m.bh, hoa(coVua(m.bh, m.dang ? 14 : 13), true), 'Cơ quan ban hành', { goiY: 'TÊN ĐƠN VỊ' })}
      {m.dang ? <div style={giua(14)} aria-hidden>*</div> : vach('32%')}
      <div style={giua(m.dang ? 14 : 13, { marginTop: pt(6) })}>
        {m.dang ? <>Số {oSo}-{m.kh}</> : <>Số: {oSo}/{m.kh}</>}
      </div>
    </div>
  );
  const oNgay = useRef<HTMLInputElement>(null);
  const ngayChu = dongNgay(m);
  const phai = (
    <div>
      {m.dang
        ? <div style={giua(15, { fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: pt(4), whiteSpace: 'nowrap' })}>ĐẢNG CỘNG SẢN VIỆT NAM</div>
        : <>
            <div style={giua(13, { fontWeight: 700, whiteSpace: du ? 'nowrap' : 'normal' })}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
            <div style={giua(14, { fontWeight: 700 })}><span style={{ display: 'inline-block', borderBottom: '1px solid #1F1A17', paddingBottom: 1 }}>Độc lập - Tự do - Hạnh phúc</span></div>
          </>}
      <div style={giua(14, { fontStyle: 'italic', marginTop: pt(m.dang ? 18 : 10) })}>
        {sua
          ? <span className="relative inline-block">
              <button type="button" onClick={() => { try { oNgay.current?.showPicker(); } catch { oNgay.current?.focus(); } }}
                className="cursor-pointer border-0 border-b border-dotted border-[#A8A29E] bg-transparent p-0 italic hover:bg-[#FFFBEB]" style={{ fontSize: 'inherit' }}
                aria-label="Chọn ngày ký">{ngayChu}</button>
              <input ref={oNgay} type="date" tabIndex={-1} aria-hidden value={m.ngay} onChange={(e) => sua('_ngay', e.target.value)}
                className="pointer-events-none absolute bottom-0 left-1/2 h-0 w-0 opacity-0" />
            </span>
          : ngayChu}
      </div>
    </div>
  );

  // ---------- Tên loại, trích yếu, kính gửi
  const tieuDe = (
    <div style={{ marginTop: pt(du ? 18 : 16), marginBottom: pt(6) }}>
      {m.tenLoai && <div style={giua(m.dang ? 15 : 14, { fontWeight: 700 })}>{m.tenLoai}</div>}
      {chu('_trich_yeu', m.trichYeu, giua(14, { fontWeight: 700 }), 'Trích yếu', { dong1: !m.trichYeuNhieuDong, goiY: 'Trích yếu nội dung' })}
      {m.dongPhu && <div style={giua(14, { fontStyle: 'italic' })}>{m.dongPhu}</div>}
      <div style={{ paddingTop: pt(3) }}>{vach('22%')}</div>
      {m.kinhGui != null && <div style={{ marginTop: pt(10) }}>{chu('_kinh_gui', m.kinhGui, giua(14), 'Kính gửi', { goiY: 'Kính gửi: …' })}</div>}
    </div>
  );

  // ---------- Nội dung
  const kieuTuDo = (t: string): CSSProperties => {
    const k = kieuDong(t);
    return k === 'dam' ? { fontWeight: 700 } : k === 'nghieng' ? { fontStyle: 'italic' } : {};
  };
  const doanXem = (p: string, j: number, tuDo?: boolean) => {
    const k = tuDo ? kieuDong(p) : 'thuong';
    if (k === 'nhan') { const i = p.indexOf(':') + 1; return <p key={j} style={{ ...doan, margin: 0 }}><b>{p.slice(0, i)}</b>{p.slice(i)}</p>; }
    return <p key={j} style={{ ...doan, margin: 0, ...(tuDo ? kieuTuDo(p) : {}) }}>{p}</p>;
  };
  const oBang: CSSProperties = { border: '1px solid #111', padding: `${pt(3)}px ${pt(4)}px`, verticalAlign: 'top', fontSize: pt(13), lineHeight: 1.25 };
  const veKhoi = (x: KhoiA4, i: number): ReactNode => {
    if (x.loai === 'tieu_de') return <div key={i} style={{ ...doan, fontWeight: 700 }}>{x.text}{x.batBuoc && sua && <span className="text-[#A4161A]"> *</span>}</div>;
    if (x.loai === 'bang') {
      const tong = x.rong.reduce((a, b) => a + b, 0);
      return (
        <div key={i} style={{ padding: `${pt(4)}px 0 ${pt(6)}px`, overflowX: 'auto' }}>
          {x.tieuDe && <div style={{ ...doan, fontStyle: 'italic', paddingTop: 0 }}>{x.tieuDe}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: du ? undefined : 480 }}>
            <colgroup>{x.rong.map((r, j) => <col key={j} style={{ width: `${(r / tong) * 100}%` }} />)}</colgroup>
            <thead><tr>{x.cot.map((c, j) => <th key={j} style={{ ...oBang, fontWeight: 700, textAlign: 'center' }}>{c}</th>)}</tr></thead>
            <tbody>{x.dong.map((r, j) => <tr key={j}>{r.map((c, l) => <td key={l} style={{ ...oBang, textAlign: x.cotTrai?.includes(l) ? 'left' : 'center' }}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    if (x.loai === 'so') return (
      <p key={i} style={{ ...doan, margin: 0 }}>
        {sua
          ? <input aria-label={x.nhan} type="number" inputMode="decimal" value={x.noiDung} onChange={(e) => sua(x.ma, e.target.value)}
              className="w-28 border-0 border-b border-dotted border-[#A8A29E] bg-transparent p-0 text-center font-bold outline-none focus:bg-[#FEF3C7]/60" style={{ fontSize: 'inherit' }} />
          : <b>{x.noiDung || '…'}</b>}
        {x.donViTinh ? ` ${x.donViTinh}` : ''}
      </p>
    );
    if (sua) return <SoanDoanVan key={i} nhan={x.nhan} value={x.noiDung} onChange={(v) => sua(x.ma, v)} rong={rongTo} kieuDoan={doan}
      kieuTheoDong={x.tuDo ? kieuTuDo : undefined} placeholder={x.goiY ?? 'Nhập nội dung…'} />;
    const ds = doanVan(x.noiDung);
    return <div key={i}>{ds.length ? ds.map((p, j) => doanXem(p, j, x.tuDo)) : <p style={{ ...doan, margin: 0, color: '#A8A29E' }}>…</p>}</div>;
  };
  const noiDungMuc = m.khoi.map(veKhoi);

  // ---------- Nơi nhận, chữ ký
  const noiNhan = (
    <div style={{ paddingTop: pt(12) }}>
      <div style={m.dang ? { fontSize: pt(14), textDecoration: 'underline' } : { fontSize: pt(12), fontWeight: 700, fontStyle: 'italic' }}>Nơi nhận:</div>
      {sua
        ? <OChu nhan="Nơi nhận" value={m.noiNhan} onChange={(v) => sua('_noi_nhan', v)} rong={rongTo} style={{ fontSize: pt(m.dang ? 12 : 11), lineHeight: 1.3 }} />
        : dong(m.noiNhan).map((d, i) => <div key={i} style={{ fontSize: pt(m.dang ? 12 : 11), lineHeight: 1.3 }}>{d}</div>)}
    </div>
  );
  const chuKy = (
    <div style={{ paddingTop: pt(12) }}>
      {chu('_chuc_danh', m.chucDanh, hoa(m.dang ? 14 : 13, true), 'Chức danh người ký', { goiY: 'CHỨC DANH NGƯỜI KÝ' })}
      <div aria-hidden style={{ height: pt(14) * 1.3 * (du ? 4.5 : 3.5) }} />
      {chu('_ho_ten', m.hoTen, giua(14, { fontWeight: 700 }), 'Họ tên người ký', { dong1: true, goiY: 'Họ và tên' })}
    </div>
  );

  const vachTrang = du && soTrang > 1 ? Array.from({ length: soTrang - 1 }, (_, i) => le.tren + (i + 1) * vungIn) : [];

  return (
    <div ref={vo} className={du ? 'rounded-2xl bg-[#E7E3DC] px-4 py-6' : ''}>
      {w > 0 && (
        <article lang="vi" aria-label="Trang báo cáo"
          className={du ? 'relative mx-auto bg-white shadow-[0_1px_3px_rgba(0,0,0,.12),0_8px_24px_rgba(0,0,0,.08)]' : 'relative rounded-xl border border-vien bg-white shadow-sm'}
          style={{ width: rongTo, minHeight: du ? soTrang * vungIn + le.tren + le.duoi : undefined, fontFamily: FONT, color: '#111', fontSize: coChu }}>
          {vachTrang.map((y, i) => (
            <div key={i} aria-hidden className="pointer-events-none absolute inset-x-0" style={{ top: y }}>
              <div className="border-t border-dashed border-[#C9C2B8]" />
              <span className="absolute right-2 top-1 font-sans text-[10.5px] text-[#A8A29E]">Trang {i + 2}</span>
            </div>
          ))}
          <div ref={noiDung} style={{ padding: `${le.tren}px ${le.phai}px ${le.duoi}px ${le.trai}px` }}>
            <div style={haiCot}>{trai}{phai}</div>
            {tieuDe}
            {noiDungMuc}
            <div style={{ ...haiCot, marginTop: pt(6), breakInside: 'avoid' }}>{du ? <>{noiNhan}{chuKy}</> : <>{chuKy}{noiNhan}</>}</div>
          </div>
        </article>
      )}
    </div>
  );
}

