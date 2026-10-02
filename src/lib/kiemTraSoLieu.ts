// Kiểm tra số Đề án 06 đơn vị tự báo so với lần báo trước và số tỉnh chốt — phát hiện số nhập sai
export type SoBao = { id: string; ngay_so_lieu: string; tu_so: number; mau_so: number; ty_le: number };
export type SoTinh = { ngay_file: string; tu_so: number; mau_so: number; ty_le: number };

export function kiemTraSoBao(ds: SoBao[], tinh: SoTinh[], cao: boolean): Record<string, string[]> {
  const kq: Record<string, string[]> = {};
  const tang = [...ds].sort((a, b) => a.ngay_so_lieu.localeCompare(b.ngay_so_lieu));
  tang.forEach((s, i) => {
    const c: string[] = [];
    const truoc = tang[i - 1];
    const t = [...tinh].filter((x) => x.ngay_file <= s.ngay_so_lieu).sort((a, b) => b.ngay_file.localeCompare(a.ngay_file))[0];
    if (cao && truoc && Number(s.tu_so) < Number(truoc.tu_so)) c.push(`Giảm so với lần báo trước (${Number(truoc.tu_so).toLocaleString('vi-VN')})`);
    if (cao && t && Number(s.tu_so) < Number(t.tu_so)) c.push(`Thấp hơn số tỉnh chốt ${t.ngay_file.split('-').reverse().join('/')} (${Number(t.tu_so).toLocaleString('vi-VN')})`);
    if (t && Math.abs(Number(s.mau_so) - Number(t.mau_so)) / Number(t.mau_so) > 0.1) c.push('Tổng số lệch quá 10% so với số tỉnh');
    if (truoc && Math.abs(Number(s.ty_le) - Number(truoc.ty_le)) > 0.2) c.push('Tỷ lệ thay đổi hơn 20 điểm % so với lần trước');
    if (Number(s.ty_le) > 1) c.push('Tỷ lệ trên 100%');
    if (c.length) kq[s.id] = c;
  });
  return kq;
}
