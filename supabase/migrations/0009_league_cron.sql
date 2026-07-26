-- 0009_league_cron: /api/league/tick'i 5 dakikada bir tetikle.
-- Sirlar migration'a GOMULMEZ — Supabase Vault'tan okunur (Task 0'da elle girilir).
-- Neden 5 dakika: tick cogu turda bos donuyor (erken cikis), ama her dakika kosmak
-- Vercel invocation ve Yahoo rate-limit butcesini gereksiz yakiyordu. Bedeli: bekleyen
-- emir acilistan sonra en gec 5 dk icinde dolar, skor muhru kilit aninin en gec 5 dk
-- sonrasinda atilir (piyasalar o an kapali oldugu icin hisse fiyati degismez).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'league-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'league_tick_url'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'league_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
