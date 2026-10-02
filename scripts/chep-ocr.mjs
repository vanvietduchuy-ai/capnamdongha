// Chép bộ nhận dạng chữ (tesseract.js + dữ liệu tiếng Việt) vào public/ocr để web tự phục vụ, không phụ thuộc CDN.
// Chạy tự động trước "npm run dev" / "npm run build".
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const dich = 'public/ocr';
mkdirSync(dich, { recursive: true });
const chep = (tu, den) => { if (!existsSync(`${dich}/${den}`)) cpSync(tu, `${dich}/${den}`); };
chep('node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js');
for (const b of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) chep(`node_modules/tesseract.js-core/${b}`, b);
chep('node_modules/@tesseract.js-data/vie/4.0.0_best_int/vie.traineddata.gz', 'vie.traineddata.gz');
console.log('Đã chép bộ nhận dạng chữ vào', dich);
