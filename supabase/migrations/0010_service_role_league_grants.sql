-- 0010_service_role_league_grants: 0008, service_role'e leagues/league_entries/trades
-- uzerinde hicbir acik grant vermemisti — yalniz anon/authenticated duzenlenmisti.
-- service_role (admin.ts'in createAdminClient()'i, /api/trade + /api/league/tick'in
-- TAMAMI) bu yuzden PostgREST uzerinden bu tablolara HIC dokunamiyordu (canli test:
-- 42501 permission denied). service_role zaten en yuksek guven seviyesi (BYPASSRLS +
-- admin API); bu grant guven sinirini genisletmiyor, PostgREST'in ayri grant katmanini
-- var olan guvenle hizaliyor — bkz. 0004'un ayni gerekceli onceki duzeltmesi.
--
-- YALNIZ gercekten kullanilan yetkiler verildi (kod taranarak): hicbir yerde
-- admin.from(...).delete(...) yok, league_entries'e service_role INSERT yapmiyor
-- (o taraf kullanicinin kendi authenticated oturumundan, Task 14).
grant select, insert, update on table public.leagues to service_role;
grant select, update on table public.league_entries to service_role;
grant select, insert, update on table public.trades to service_role;
