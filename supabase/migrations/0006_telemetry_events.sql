-- 0006_telemetry_events: Faz 1 GO/NO-GO deneyi icin funnel tablosu (visit -> first_trade -> D1).
-- Mevcut /api/telemetry yalniz console.log + Discord webhook yapiyordu (Vercel Hobby logu ~1 saat
-- yasiyor) -- gun-farki join'in dayanacagi kalici depo yoktu. Bu tablo o on kosulu karsilar.

create table public.telemetry_events (
  id          bigint generated always as identity primary key,
  player_id   text        not null,
  event       text        not null,
  ts          timestamptz not null,          -- istemci saati (guvenilmez)
  received_at timestamptz not null default now(),  -- sunucu saati -- gun kovasi bundan
  constraint player_id_format check (player_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  constraint event_valid check (event in ('visit','share_click','share_done','first_trade'))
);
alter table public.telemetry_events enable row level security;

-- REVOKE-FIRST (derinlemesine savunma) + GRANT (yuk tasiyan). auto_expose_new_tables
-- lokalde + yeni cloud default'ta KAPALI (config.toml:24 unset) -> yeni tablo hicbir default
-- grant ile dogmaz; bu yuzden asagidaki `grant insert` ZORUNLU (savunma degil, on kosul).
-- `revoke all` legacy auto-expose'a karsi savunma (prod o davranisla yaratilmis olabilir --
-- 0001 anon/authenticated'i revoke etmek zorunda kalmisti) + service_role'u kapatir.
revoke all on table public.telemetry_events from anon, authenticated, service_role;

-- SONRA GEREKENI AC: yalniz INSERT, yalniz client'in yazmasi mesru kolonlar.
-- received_at + id GRANT'TE YOK -> sunucu saati/kimligi client'a birakilmaz (0001:18 gerekcesi).
grant insert (player_id, event, ts) on table public.telemetry_events to anon, authenticated;

create policy telemetry_insert_any on public.telemetry_events
  for insert to anon, authenticated with check (true);
-- SELECT grant/policy YOK -> okuma yalniz owner (postgres / SQL editor).
