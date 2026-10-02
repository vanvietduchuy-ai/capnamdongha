import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, dauMoiDa06, laDauMoi, useAuth, type VaiTro } from './lib/auth';
import KhungTrang from './components/KhungTrang';
import { DangTai } from './components/ui';
import DangNhap from './pages/DangNhap';

const TongQuan = lazy(() => import('./pages/TongQuan'));
const KyBaoCao = lazy(() => import('./pages/KyBaoCao'));
const KyBaoCaoChiTiet = lazy(() => import('./pages/KyBaoCaoChiTiet'));
const DeAn06 = lazy(() => import('./pages/DeAn06'));
const ChiTieuChiTiet = lazy(() => import('./pages/ChiTieuChiTiet'));
const TrangChuDonVi = lazy(() => import('./pages/TrangChuDonVi'));
const ViecCanNop = lazy(() => import('./pages/ViecCanNop'));
const NopBaoCao = lazy(() => import('./pages/NopBaoCao'));
const ChiTieuCuaToi = lazy(() => import('./pages/ChiTieuCuaToi'));
const QuanTri = lazy(() => import('./pages/QuanTri'));
const PhanCong = lazy(() => import('./pages/PhanCong'));
const NhiemVu = lazy(() => import('./pages/NhiemVu'));
const NhiemVuChiTiet = lazy(() => import('./pages/NhiemVuChiTiet'));
const Hop = lazy(() => import('./pages/Hop'));
const HopChiTiet = lazy(() => import('./pages/HopChiTiet'));
const KhoVanBan = lazy(() => import('./pages/KhoVanBan'));
const TheoDoiLinhVuc = lazy(() => import('./pages/TheoDoiLinhVuc'));
const SoanBaoCaoChung = lazy(() => import('./pages/SoanBaoCaoChung'));
const SoanHoSoHop = lazy(() => import('./pages/SoanHoSoHop'));
const SoCongVan = lazy(() => import('./pages/SoCongVan'));

function Chan({ cho, hoac = false, children }: { cho: VaiTro[]; hoac?: boolean; children: ReactNode }) {
  const { hoSo } = useAuth();
  if (!hoSo || !(cho.includes(hoSo.vai_tro) || hoac)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function CacTrang() {
  const { hoSo, dangTai, khoiPhuc } = useAuth();
  if (dangTai) return <DangTai chu="Đang kiểm tra đăng nhập…" />;
  if (!hoSo || khoiPhuc) return <DangNhap />;
  const cqtt: VaiTro[] = ['quan_tri', 'lanh_dao'];
  return (
    <Suspense fallback={<DangTai />}>
      <Routes>
        <Route element={<KhungTrang />}>
          <Route index element={hoSo.vai_tro === 'don_vi' ? <TrangChuDonVi /> : <TongQuan />} />
          <Route path="ky-bao-cao" element={<Chan cho={cqtt}><KyBaoCao /></Chan>} />
          <Route path="ky-bao-cao/:id" element={<Chan cho={cqtt} hoac={laDauMoi(hoSo)}><KyBaoCaoChiTiet /></Chan>} />
          <Route path="ky-bao-cao/:id/bao-cao-chung" element={<Chan cho={cqtt}><SoanBaoCaoChung /></Chan>} />
          <Route path="theo-doi" element={<Chan cho={[]} hoac={laDauMoi(hoSo)}><TheoDoiLinhVuc /></Chan>} />
          <Route path="de-an-06" element={<Chan cho={cqtt} hoac={dauMoiDa06(hoSo)}><DeAn06 /></Chan>} />
          <Route path="de-an-06/:ma" element={<ChiTieuChiTiet />} />
          <Route path="viec-can-nop" element={<ViecCanNop />} />
          <Route path="viec-can-nop/:id" element={<NopBaoCao />} />
          <Route path="chi-tieu" element={<ChiTieuCuaToi />} />
          <Route path="phan-cong" element={<Chan cho={cqtt}><PhanCong /></Chan>} />
          <Route path="nhiem-vu" element={<NhiemVu />} />
          <Route path="nhiem-vu/:id" element={<NhiemVuChiTiet />} />
          <Route path="hop" element={<Chan cho={cqtt}><Hop /></Chan>} />
          <Route path="hop/:id" element={<Chan cho={cqtt}><HopChiTiet /></Chan>} />
          <Route path="hop/:id/ho-so/:buoc" element={<Chan cho={['quan_tri']}><SoanHoSoHop /></Chan>} />
          <Route path="kho-van-ban" element={<KhoVanBan />} />
          <Route path="so-cong-van" element={<SoCongVan />} />
          <Route path="quan-tri" element={<Chan cho={['quan_tri']}><QuanTri /></Chan>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <CacTrang />
      </BrowserRouter>
    </AuthProvider>
  );
}
