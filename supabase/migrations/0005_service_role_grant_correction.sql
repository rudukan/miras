-- 0005_service_role_grant_correction: prod'a bir ad-hoc komutla (bu dosya/CLI'dan
-- degil) service_role'e beklenenden cok daha genis yetki verilmisti.
--
-- Migration 0004 yalniz public.saves'e SELECT vermeyi review'dan gecirip onaylamisti
-- ("minimal — yalniz SELECT, yalniz saves, profiles'a dokunulmadi"). Ama prod'a
-- push edilirken migration dosyasi yerine daha genis bir komut calistirilmis oldugu
-- tespit edildi (2026-07-16): service_role hem saves hem profiles uzerinde tam CRUD
-- (SELECT+INSERT+UPDATE+DELETE) kazanmisti. Bu migration onaylanmis, minimal duruma
-- geri ceker.
revoke insert, update, delete on table public.saves from service_role;
revoke select, insert, update, delete on table public.profiles from service_role;
