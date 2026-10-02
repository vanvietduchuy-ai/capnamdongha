import { readFileSync, writeFileSync } from 'node:fs';
import { docFileTinh } from '../src/lib/docFileTinh.ts';
const f = process.argv[2];
const kq = docFileTinh(new Uint8Array(readFileSync(f)), f.split('/').pop()!, '2026-09-07', 'Đánh giá tháng 9/2026');
console.log('dia_phuong', kq.dia_phuong.length, 'diem', kq.diem.length);
for (const c of kq.chi_tieu) {
  const n = c.dong.find(d => d.ten === 'Phường Nam Đông Hà');
  console.log(c.ma.padEnd(10), 'dong', c.dong.length, 'tb', c.tb_tinh_file?.toFixed(4), 'tu', c.so_lieu_tu, 'den', c.so_lieu_den, 'moi', c.co_so_lieu_moi, 'nguong', c.nguong, 'NDH', n?.tu, '/', n?.mau, n?.danh_gia ?? '');
}
console.log('loi', kq.loi);
console.log('canh_bao', kq.canh_bao);
console.log('NDH diem', kq.diem.find(d => d.ten === 'Phường Nam Đông Hà'));
writeFileSync('/tmp/payload.json', JSON.stringify(kq));
