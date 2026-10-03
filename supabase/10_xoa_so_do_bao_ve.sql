-- =====================================================================
-- 10. XOÁ HẲN CHỨC NĂNG SƠ ĐỒ BẢO VỆ
-- Xoá 2 bảng map_zones (vùng/chốt) và duty_info (đợt bảo vệ) cùng toàn bộ dữ liệu.
-- Hai bảng này trước đây để mở quyền đọc/ghi công khai — xoá đi cũng bịt luôn lỗ hổng đó.
-- KHÔNG khôi phục được. Chạy lại nhiều lần không lỗi.
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['map_zones', 'duty_info'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;

DROP TABLE IF EXISTS public.map_zones;
DROP TABLE IF EXISTS public.duty_info;

NOTIFY pgrst, 'reload schema';
