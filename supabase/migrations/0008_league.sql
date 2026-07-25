-- 0008_league: haftalik lig — leagues / league_entries / trades
-- Durus: varsayilan ret, acik izin (0001 ile ayni). trades'e authenticated INSERT VERILMEZ:
-- yalniz service_role (yani /api/trade) yazar — hile korumasinin cekirdegi budur.

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  week_key text not null unique,              -- 'YYYY-MM-DD' (pazartesi, Europe/Istanbul)
  opens_at timestamptz not null,
  locks_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.league_entries (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  final_score_usd numeric,
  rank int,
  primary key (league_id, user_id)
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_order_id text not null,
  asset_id text not null,
  side text not null check (side in ('buy', 'sell')),
  -- units: 'units'-kind emirde bastan belli; 'amountUsd'-kind bekleyen emirde dolumda yazilir.
  units numeric check (units > 0),
  amount_usd numeric check (amount_usd > 0),
  status text not null default 'filled' check (status in ('filled', 'pending', 'cancelled')),
  server_price_usd numeric check (server_price_usd > 0),
  server_ts timestamptz,
  cancel_reason text,
  placed_at timestamptz not null default now(),
  -- Dolmus islem MUTLAKA adet + damgali fiyat + damga ani tasir (replay'in on kosulu).
  constraint trades_filled_complete check (
    status <> 'filled' or (units is not null and server_price_usd is not null and server_ts is not null)
  ),
  -- Her emir ya adetle ya tutarla boyutlanir.
  constraint trades_sized check (units is not null or amount_usd is not null)
);

-- Idempotency: ayni client_order_id ikinci kez yazilamaz (ag tekrari cift islem yaratmaz).
create unique index trades_idem_idx on public.trades (league_id, user_id, client_order_id);
-- Replay okumasi: lig + kullanici + zaman sirasi.
create index trades_replay_idx on public.trades (league_id, user_id, server_ts);
-- Tick'in settle taramasi yalnizca bekleyenlere bakar.
create index trades_pending_idx on public.trades (league_id) where status = 'pending';
-- Hiz siniri sorgusu (son N saniyedeki islem sayisi).
create index trades_rate_idx on public.trades (user_id, placed_at);

alter table public.leagues enable row level security;
alter table public.league_entries enable row level security;
alter table public.trades enable row level security;

-- GRANT katmani
revoke all on table public.leagues from anon, authenticated;
revoke all on table public.league_entries from anon, authenticated;
revoke all on table public.trades from anon, authenticated;

grant select on table public.leagues to anon, authenticated;
grant select on table public.league_entries to anon, authenticated;
grant insert (league_id, user_id) on table public.league_entries to authenticated;
grant select on table public.trades to authenticated;   -- RLS ile yalniz kendi satirlari

-- RLS katmani
create policy leagues_select_all on public.leagues
  for select using (true);

create policy entries_select_all on public.league_entries
  for select using (true);

-- Anonim tuzagi: Supabase'de misafir oturum da 'authenticated' rolundedir. "Lige yalniz
-- kayitli hesap" kurali UI'da DEGIL burada zorlanir (spec §4).
create policy entries_insert_own on public.league_entries
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

create policy trades_select_own on public.trades
  for select to authenticated using (user_id = auth.uid());
-- trades icin INSERT/UPDATE/DELETE policy'si BILINCLI OLARAK YOK + GRANT de yok:
-- cift kilit (kazayla policy eklenirse GRANT hala engeller).
