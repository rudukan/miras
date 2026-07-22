-- 0007_service_role_residual_revoke: 0005'in geri cektigi genis yetkiden (2026-07-16
-- tespiti, muhtemelen ad-hoc GRANT ALL) geriye TRUNCATE, REFERENCES ve TRIGGER kalmisti.
-- 0005 yalniz CRUD kismini (saves insert/update/delete + profiles select/insert/update/delete)
-- geri cekmisti; bu uc yetki gozden kacmisti. 2026-07-19'da prod'da
-- information_schema.table_privileges sorgusuyla dogrulandi.
--
-- Onaylanmis hedef durum (bkz. 0004 gerekcesi): service_role'de YALNIZ public.saves SELECT.
-- PostgREST bu operasyonlari expose etmedigi icin pratik risk dusuk — hijyen migration'i.
-- Lokalde bu yetkiler hic verilmedi (auto_expose kapali, bkz. 0006 notu); revoke orada
-- no-op olarak temiz gecer.
revoke truncate, references, trigger on table public.saves from service_role;
revoke truncate, references, trigger on table public.profiles from service_role;
