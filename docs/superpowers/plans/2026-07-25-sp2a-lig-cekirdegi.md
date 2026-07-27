# SP2a — Haftalık Lig Çekirdeği: Uygulama Planı

> **Ajan işçiler için:** ZORUNLU ALT-SKILL: Bu planı task-task uygulamak için `superpowers:subagent-driven-development` (önerilen) ya da `superpowers:executing-plans` kullan. Adımlar takip için checkbox (`- [ ]`) sözdizimi kullanır.

**Hedef:** CANLI SEANS'ı, skoru sunucu tarafından damgalanmış işlemlerden yeniden oynatılarak (replay) hesaplanan haftalık bir lige dönüştürmek — istemcinin beyan ettiği hiçbir fiyata veya kayıt payload'una güvenmeden.

**Mimari:** Oyun motoru istemcide kalır. Lige katılmış kullanıcının her alım/satımı `/api/trade`'e gider; sunucu fiyatı KENDİ proxy kaynağından (`yahooSource`/`cryptoSource`) çeker, `trades` tablosuna insert-only yazar ve damgalanmış fiyatı yanıtta döner — istemci o fiyatla kendi state'ini günceller, böylece ekran ile otorite birebir aynı kalır. Hafta kapanışında `/api/league/tick` tüm damgalı işlemleri **istemcinin kullandığı aynı reducer'larla** (`buyAsset`/`sellAsset`) yeniden oynatır ve sunucunun çektiği kapanış fiyatlarıyla değerler. `saves` payload'u skorda HİÇ kullanılmaz.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes + TypeScript (strict) · Supabase Postgres (RLS + GRANT çift katman) + pg_cron/pg_net · Vitest (unit + server rotaları) · Playwright (E2E).

---

## Global Kısıtlar

Her task'ın gereksinimleri bu bölümü örtük olarak içerir.

- **Para:** ham `number` kullanma. `src/lib/domain/money.ts` → `Money` tipi + `usd()`/`tryM()`. `round2` (2 ondalık) tüm aritmetiğe uygulanır — sunucu ile istemcinin AYNI fonksiyonları kullanması yuvarlama paritesinin tek garantisidir.
- **Başlangıç sermayesi:** `STARTING_USD = 1_000_000` (`src/lib/stores/gameState.ts`). Lig replay'i bu sabitle başlar.
- **Identifier'lar İngilizce, UI metinleri ve yorumlar Türkçe.**
- **Sunucuda kimlik DAİMA `locals.safeGetSession()` → `getUser()`** ile doğrulanır. `getSession()` tek başına yetkilendirmede kullanılmaz.
- **Yıkıcı/yazan POST rotalarında same-origin CSRF guard'ı:** `isSameOrigin(request.headers.get('origin'), url.origin)` → `error(403, 'Geçersiz kaynak')` (`src/lib/server/csrf.ts`).
- **Sunucuda `@supabase/supabase-js` `createClient` çağrılıyorsa `realtime: { transport: WebSocket }` (paket: `ws`) ZORUNLU** — aksi halde Vercel serverless'te constructor çöker ve rota 500 döner (SP1'de üç ayrı yerde yaşandı).
- **Migration duruşu:** önce `revoke all ... from anon, authenticated`, sonra tablo tablo açık `grant`. RLS her tabloda `enable`. Migration sonrası Supabase güvenlik lint'i (`get_advisors`) koşulur.
- **Sembol whitelist'i:** kullanıcıdan gelen her sembol `^[A-Z0-9]{1,12}$` ile doğrulanır (mevcut güvenlik sertleştirme kuralı).
- **Test disiplini:** her task RED→GREEN TDD. Task sonunda `npm run test` + `npm run check` + `npm run build` yeşil olmadan commit yok.

## CLAUDE.md'den Bilinçli Esnetmeler

Kullanıcı kuralı: kanonlar tavan değil zemin — esnetmeler planda AÇIKÇA listelenir.

1. **"Yeni server-side client YARATMA — hep `locals.supabase`"** → `/api/trade` ve `/api/league/tick` `SUPABASE_SECRET_KEY` ile ayrı bir admin client kurar. Gerekçe: `trades` tablosuna `authenticated` rolüne INSERT verilmiyor (hile korumasının tam kendisi) — yalnız `service_role` yazabilir. `src/routes/api/account/delete/+server.ts` bu kalıbın mevcut emsali; `ws` transport'u aynen kopyalanır.
2. **"Her `domain/<sistem>/` klasörü sadece `money.ts` + kendi type'larına bağımlı"** → `src/lib/domain/league/replay.ts` `src/lib/stores/gameState.ts`'ten import eder. Gerekçe: replay'in istemcinin çalıştırdığı **birebir aynı** `buyAsset`/`sellAsset`/`netWorthPartsUsd` fonksiyonlarını kullanması, skor ile ekranın kuruşu kuruşuna aynı olmasının tek yolu. `gameState.ts` rune içermeyen saf TS'tir; `stores/` altında olması tarihsel bir yerleşim hatası, bu planda taşınmıyor (ayrı refactor).
3. **"Fiyat update'leri `$derived` ya da rAF"** → lig işlemi artık ağ gidiş-dönüşü (async). Yalnız lige katılmış kullanıcı için geçerli; misafir/antrenman yolu bugünkü senkron davranışta kalır.

## Uygulama Sırasında Bulunan Düzeltmeler

Plan yazımından sonra, uygulama sırasında ortaya çıkan ve geriye dönük birden çok task'ı etkileyen bulgular. CLAUDE.md esnetmesi değil (proje kuralı değil, framework kısıtı) — ayrı tutuluyor.

1. **SvelteKit `+server.ts` export whitelist'i.** Task 5'in uygulanmasından sonra (Task 6 sırasında) keşfedildi: SvelteKit, route `+server.ts` dosyalarından yalnız HTTP verb handler'larının (`GET`/`POST`/...), birkaç config adının (`prerender`, `trailingSlash`, ...) ya da **`_` önekli isimlerin** export edilmesine izin veriyor — `npm run build` (Vite/SvelteKit'in kendi analiz adımı) bunu sert hata olarak reddediyor. `npm run check` (svelte-check, tip kontrolü) bunu YAKALAMIYOR — ayrı bir mekanizma. Bu yüzden Task 5'in `parseTradeRequest` export'u (test edilebilirlik için, planın kendi Interfaces bölümünde istendiği gibi) merge olduktan sonra bile fark edilmeden kaldı; Task 6'nın kendi yeni export'larıyla (`RATE_LIMIT_MAX`, `withinRateLimit`, `validateAgainstReplay`) `npm run build` ilk kez koşulunca ortaya çıktı.
   **Karar (kurucu onayı, 2026-07-26):** test edilebilirlik için bir route dosyasından export edilen saf yardımcı fonksiyon/sabitler `_` öneki alır (ör. `_parseTradeRequest`); ilgili `*.test.ts` dosyası `import { _parseTradeRequest as parseTradeRequest } from './+server';` şeklinde takma adla içe aktarır, böylece test gövdeleri değişmez. Yalnızca `interface`/`type` export'ları (derleme anında silindiği, SvelteKit'in çalışma-zamanı export kontrolüne hiç girmediği için) önek ALMAZ. Task 5+6 bu desenle düzeltildi (commit `bc9bc53`).
   **Etki:** Task 7 (`authorizeTick`, `weekRowFor`), Task 8 (`settleDecision`), Task 9 (`rankScores`) — hepsi `src/routes/api/league/tick/+server.ts`'ten aynı şekilde export edilecek plan metninde; bu task'lar dispatch edilirken export isimleri baştan `_` önekiyle verilecek (planın kod bloklarındaki önek'siz isimler yerine). Ayrıca **her task'ın kendi doğrulama adımına `npm run build` eklendi** — yalnız Task 9'un/kapanışın sonunda değil, önce fark edilmesi için.

2. **Task 14'ün kod bloğundaki `term-info`/`term-warn`/`term-down` renk token'ları gerçekte yok.** Task 14 review'ında (2026-07-27) bulundu: `tailwind.config.ts`'deki gerçek `term.*` paleti yalnız `bg/panel/panelLight/border/borderGlow/green/red/amber/blue/violet/indigo/text` içeriyor. Plan metnindeki `text-term-info`/`text-term-warn`/`text-term-down` (LİG HAFTASI rozeti/LİGE KATIL butonu/hata mesajı için) hiçbiri tanımlı değil — Tailwind JIT bunları sessizce hiçbir CSS üretmeden atlardı (build hatası vermez, yalnız renksiz render olurdu). Implementer (kesintiye uğramış önceki oturumdan devralınan taslak) bunun yerine gerçek, mevcut token'ları kullandı: `text-term-blue` (rozet), `text-term-amber` (buton), `text-term-red` (hata) — reviewer bunu bağımsız doğruladı (0 Critical, plan-mandated Important olarak raporlandı ama uygulanan koda değil plan metnine karşı). Şu an bu snippet'i tekrar kullanacak başka task yok; not yalnız gelecekte plan metni referans alınırsa yanlış token kopyalanmasın diye.

## Tasarım Kararları (kurucu onayı, 2026-07-25)

| Konu | Karar |
|---|---|
| Skor otoritesi | Sunucu damgalı işlem + kapanışta replay. `saves` payload'u skorda kullanılmaz. |
| Lig kapsamı | Yalnız alım-satım (BIST + ABD + kripto + emtia/döviz). **Mevduat ve emlak lig skoruna girmez.** |
| Oyun/lig ilişkisi | CANLI SEANS = lig. Pazartesi 00:00 TSİ herkes $1M'a döner, ayrı slot yok. Hafta sonu antrenman (skor sayılmaz). |
| Cron altyapısı | Supabase **pg_cron + pg_net**, `*/5 * * * *`. Vercel Cron DEĞİL (Pro alınmadı; Hobby günde 1 ile sınırlı). |
| Kapanış anı | Cuma NYSE kapanışı (16:00 America/New_York, DST-duyarlı). O cuma NYSE tatiliyse cuma 18:15 Europe/Istanbul. |

**Kabul edilen gevşeklikler (bilinçli, belgeli):**
- Tick 5 dakikada bir koştuğu için bekleyen emirler açılıştan sonra **en geç 5 dk içinde** dolar, anında değil. Skor mührü de kilit anından en geç 5 dk sonra atılır; BIST/NYSE o anda zaten kapalı olduğu için hisse fiyatları değişmez, yalnız kripto birkaç dakika kayabilir.
- `/api/trade`'de bakiye doğrulaması eşzamanlı iki istekte teorik olarak yarışabilir. **Kapanış replay'i nihai otoritedir**: replay sırasında bakiyeyi aşan işlem reddedilir ve skora girmez. Yani yarış, hileye değil yalnız istemcide anlık tutarsızlığa yol açabilir.
- **(Task 9 review'ında bulundu, 2026-07-26 — controller kararı, kullanıcıya henüz ayrıca onaylatılmadı: reviewer'ın "ayrı takip işi" önerisine dayanarak SP2a'yı bloklamadan backlog'a bırakıldı)** `/api/league/tick`'in kapanış fazında yalnız SON `leagues.status='closed'` yazması CAS korumalı (`eq('status','open')`) — per-user `league_entries` skor yazma döngüsünün kendi kilidi yok. pg_net fire-and-forget olduğu için (bir önceki tick'in isteği hâlâ işlenirken sıradaki 5 dk'lık cron'u engellemiyor) teorik olarak iki invocation aynı league'i "due" görüp ikisi de skorlayıp yazabilir; hangi invocation'ın per-user yazması kazanır sırasız. Reviewer analizi: düşük olasılık (hobi ölçekli iş yükü, tek invocation'ın 5 dk'yı aşması atipik) + sınırlı etki (kullanıcı-arası karışma yok, yalnız iki `stampPrices` anlık görüntüsü arasında kripto fiyatı birkaç saniye kayabilir — planın zaten kabul ettiği yukarıdaki 5-dk kripto kaymasından küçük). **Naif düzeltme YANLIŞ yön**: CAS'ı skorlamadan önceye taşımak, skorlama ortasındaki bir hatanın league'i kalıcı olarak yarım skorla "closed" durumunda mahsur bırakmasına yol açar (due sorgusu bir daha asla bakmaz, kendiliğinden düzelme yok) — şu anki "status'u en son çevir" sırası kasıtlı crash-safe, korunmalı. **Önerilen düzeltme (ayrı, kapsamlı bir takip işi):** Postgres advisory lock (`pg_try_advisory_xact_lock` — transaction-scoped, PostgREST'in her isteği kendi transaction'ında çalıştırmasıyla uyumlu, crash-safety'i korur) + bunu sarmalayan bir RPC fonksiyonu (yeni migration), kapanış bloğunun başında league id'sine kilitlenir.

---

## Dosya Yapısı

**Yeni:**

| Dosya | Sorumluluk |
|---|---|
| `supabase/migrations/0008_league.sql` | `leagues` / `league_entries` / `trades` şeması + GRANT + RLS |
| `supabase/migrations/0009_league_cron.sql` | pg_cron + pg_net ile 5 dakikalık tick zamanlaması (sır Vault'tan) |
| `src/lib/domain/league/week.ts` | Hafta açılış/kilit anları — saf, tz/DST/tatil duyarlı |
| `src/lib/domain/league/week.test.ts` | Yaz/kış DST + NYSE-tatili cuma testleri |
| `src/lib/domain/league/replay.ts` | Damgalı işlem replay'i + kapanış değerlemesi (saf) |
| `src/lib/domain/league/replay.test.ts` | Replay + red senaryoları |
| `src/lib/server/league/prices.ts` | assetId → sunucu tarafı USD fiyat damgası + tazelik |
| `src/lib/server/league/prices.test.ts` | Kaynak seçimi + tazelik testleri |
| `src/lib/server/league/admin.ts` | service_role Supabase client fabrikası (`ws` transport'lu) |
| `src/routes/api/trade/+server.ts` | Damgalı işlem endpoint'i |
| `src/routes/api/trade/server.test.ts` | Auth/CSRF/doğrulama/idempotency/bakiye testleri |
| `src/routes/api/league/tick/+server.ts` | Hafta aç / bekleyen emir settle / kapanış + skor |
| `src/routes/api/league/tick/server.test.ts` | Üç fazın testleri |
| `src/lib/api/leagueClient.ts` | İstemci tarafı `/api/trade` sarmalayıcısı |
| `src/lib/api/leagueClient.test.ts` | Sarmalayıcı testleri |
| `tests/e2e/league-trade.spec.ts` | Lig işleminin damgalandığını uçtan uca doğrulayan senaryo |

**Değiştirilen:**

| Dosya | Değişiklik |
|---|---|
| `src/lib/stores/liveGameStore.svelte.ts` | Lig modu: `stampTrade` seam'i + damgalı fiyatla apply + hafta reset'i |
| `src/lib/stores/liveGameStore.test.ts` | Lig modu testleri |
| `src/routes/+page.svelte` | Lig modu kablolaması + "LİGE KATIL" kapısı |
| `src/lib/domain/scenario/types.ts` | (gerekirse) `AssetCategory` kullanımı — yalnız okuma, değişiklik beklenmiyor |

---

## Manuel Ön Koşul (Task 0 — insan işi, kod değil)

- [ ] **Vercel env:** `CRON_SECRET` = güçlü rastgele değer (`openssl rand -hex 32`). Production + Preview + Development.
- [ ] **Supabase Vault** (Dashboard → Project Settings → Vault) iki sır:
  - `league_tick_url` = `https://<prod-domain>/api/league/tick`
  - `league_cron_secret` = Vercel'e girilen `CRON_SECRET` ile AYNI değer
- [ ] `.env.local`'e `CRON_SECRET` eklenir (lokal test için).

Bu adım tamamlanmadan Task 10 doğrulanamaz; Task 1-9 ve 11-15 bağımsız ilerler.

---

## Task 1: Lig haftası sınırları

**Files:**
- Create: `src/lib/domain/league/week.ts`
- Test: `src/lib/domain/league/week.test.ts`

**Interfaces:**
- Consumes: `istanbulParts`, `newYorkParts` (`src/lib/domain/calendar/calendar.ts`), `NYSE_HOLIDAYS_2026` (`src/lib/domain/calendar/nyseHolidays2026.ts`)
- Produces: `leagueWeekKey(at: Date): string` · `leagueWeekStart(at: Date): Date` · `leagueLockMoment(weekKey: string): Date` · `isLeagueOpen(at: Date): boolean`

- [ ] **Step 1: Failing test yaz**

`src/lib/domain/league/week.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { leagueWeekKey, leagueWeekStart, leagueLockMoment, isLeagueOpen } from './week';

describe('leagueWeekKey', () => {
  it('haftanın herhangi bir anını o haftanın pazartesisine indirger', () => {
    // 2026-07-25 cumartesi → haftanın pazartesisi 2026-07-20
    expect(leagueWeekKey(new Date('2026-07-25T12:00:00+03:00'))).toBe('2026-07-20');
    expect(leagueWeekKey(new Date('2026-07-20T00:00:00+03:00'))).toBe('2026-07-20');
    expect(leagueWeekKey(new Date('2026-07-26T23:59:00+03:00'))).toBe('2026-07-20'); // pazar
  });

  it('pazartesi 00:00 TSİ yeni haftadır (İstanbul günü, UTC değil)', () => {
    // 2026-07-19T22:00Z = 2026-07-20T01:00 TSİ → artık yeni hafta
    expect(leagueWeekKey(new Date('2026-07-19T22:00:00Z'))).toBe('2026-07-20');
    // 2026-07-19T20:00Z = 2026-07-19T23:00 TSİ → hâlâ eski hafta (pazar)
    expect(leagueWeekKey(new Date('2026-07-19T20:00:00Z'))).toBe('2026-07-13');
  });
});

describe('leagueWeekStart', () => {
  it('pazartesi 00:00 Europe/Istanbul anını döndürür', () => {
    expect(leagueWeekStart(new Date('2026-07-25T12:00:00+03:00')).toISOString()).toBe(
      '2026-07-19T21:00:00.000Z', // 2026-07-20T00:00+03:00
    );
  });
});

describe('leagueLockMoment', () => {
  it('yaz (EDT): cuma 16:00 New York = 23:00 TSİ', () => {
    expect(leagueLockMoment('2026-07-20').toISOString()).toBe('2026-07-24T20:00:00.000Z');
  });

  it('kış (EST): cuma 16:00 New York = 00:00 TSİ (ertesi gün)', () => {
    expect(leagueLockMoment('2026-01-05').toISOString()).toBe('2026-01-09T21:00:00.000Z');
  });

  it('cuma NYSE tatiliyse BIST ölçeğine düşer: 18:15 TSİ', () => {
    // 2026-04-03 Good Friday — NYSE kapalı
    expect(leagueLockMoment('2026-03-30').toISOString()).toBe('2026-04-03T15:15:00.000Z');
  });
});

describe('isLeagueOpen', () => {
  it('kilit anından önce açık, sonra kapalı', () => {
    expect(isLeagueOpen(new Date('2026-07-24T19:59:00Z'))).toBe(true);
    expect(isLeagueOpen(new Date('2026-07-24T20:00:00Z'))).toBe(false);
    expect(isLeagueOpen(new Date('2026-07-25T12:00:00Z'))).toBe(false); // cumartesi antrenman
  });

  it('yeni hafta pazartesi tekrar açılır', () => {
    expect(isLeagueOpen(new Date('2026-07-26T21:30:00Z'))).toBe(true); // 2026-07-27 00:30 TSİ
  });
});
```

- [ ] **Step 2: Testi koş, kırmızı olduğunu doğrula**

```bash
npx vitest run src/lib/domain/league/week.test.ts
```

Beklenen: FAIL — `Failed to resolve import "./week"`.

- [ ] **Step 3: Minimal implementasyon**

`src/lib/domain/league/week.ts`:

```ts
import { istanbulParts, newYorkParts } from '../calendar/calendar';
import { NYSE_HOLIDAYS_2026 } from '../calendar/nyseHolidays2026';

/** Cuma NYSE kapanışı: 16:00 America/New_York. DST iki yönde de denenir (EDT/EST). */
const NYSE_CLOSE_HOUR = 16;
const NY_CLOSE_CANDIDATE_OFFSETS = ['-04:00', '-05:00'];
/** NYSE'nin kapalı olduğu cumalarda kilit ölçeği: BIST kapanış sonrası tampon (spec kararı).
 *  BIST seansı 18:00'de biter; 18:00-18:15 arasında zaten işlem yapılamaz. */
const BIST_LOCK_CLOCK = '18:15:00';
/** Europe/Istanbul 2016'dan beri sabit UTC+3 — DST yok, literal offset güvenli. */
const IST_OFFSET = '+03:00';

/** 'YYYY-MM-DD' anahtarına gün ekler/çıkarır (saf takvim aritmetiği, tz-bağımsız). */
function addDaysToKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `at` anının içinde bulunduğu lig haftasının kimliği — o haftanın pazartesisi (İstanbul günü). */
export function leagueWeekKey(at: Date): string {
  const p = istanbulParts(at);
  return addDaysToKey(p.key, -(p.weekday - 1)); // weekday: 1=Pzt..7=Paz
}

/** Haftanın açılış anı: pazartesi 00:00 Europe/Istanbul. */
export function leagueWeekStart(at: Date): Date {
  return new Date(`${leagueWeekKey(at)}T00:00:00${IST_OFFSET}`);
}

/** Haftanın skor kilit anı. Normalde cuma NYSE kapanışı (DST-duyarlı); o cuma NYSE
 *  tatiliyse cuma 18:15 Europe/Istanbul. `weekKey` = pazartesi anahtarı. */
export function leagueLockMoment(weekKey: string): Date {
  const fridayKey = addDaysToKey(weekKey, 4);
  if (!NYSE_HOLIDAYS_2026.has(fridayKey)) {
    for (const offset of NY_CLOSE_CANDIDATE_OFFSETS) {
      const cand = new Date(`${fridayKey}T${String(NYSE_CLOSE_HOUR).padStart(2, '0')}:00:00${offset}`);
      const p = newYorkParts(cand);
      // Yanlış DST adayı geri okunduğunda 16:00'a denk gelmez — o adayı atla.
      if (p.key === fridayKey && p.hour === NYSE_CLOSE_HOUR && p.minute === 0) return cand;
    }
  }
  return new Date(`${fridayKey}T${BIST_LOCK_CLOCK}${IST_OFFSET}`);
}

/** Verilen anda lig işlemi (damgalı) kabul ediliyor mu? Kilit anından sonrası antrenmandır. */
export function isLeagueOpen(at: Date): boolean {
  return at.getTime() < leagueLockMoment(leagueWeekKey(at)).getTime();
}
```

- [ ] **Step 4: Testi koş, yeşil olduğunu doğrula**

```bash
npx vitest run src/lib/domain/league/week.test.ts
```

Beklenen: PASS (5 test dosyasında toplam 8 assertion bloğu).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/league/week.ts src/lib/domain/league/week.test.ts
git commit -m "feat(league): hafta acilis/kilit anlari — DST + NYSE tatili duyarli"
```

---

## Task 2: Damgalı işlem replay'i ve kapanış değerlemesi

**Files:**
- Create: `src/lib/domain/league/replay.ts`
- Test: `src/lib/domain/league/replay.test.ts`

**Interfaces:**
- Consumes: `createGameState`, `buyAsset`, `sellAsset`, `netWorthPartsUsd`, `STARTING_USD`, tip `GameState` (`src/lib/stores/gameState.ts`); `usd` (`src/lib/domain/money.ts`); tip `UsdPriceOracle` (`src/lib/domain/fx/usdOracle.ts`)
- Produces: tip `StampedTrade` · `ReplayResult` · `replayTrades(trades, opts): ReplayResult` · `valuate(state, closePricesUsd): { scoreUsd: number; complete: boolean }`

- [ ] **Step 1: Failing test yaz**

`src/lib/domain/league/replay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { replayTrades, valuate, type StampedTrade } from './replay';
import { STARTING_USD } from '../../stores/gameState';

const t = (over: Partial<StampedTrade> = {}): StampedTrade => ({
  assetId: 'THYAO',
  side: 'buy',
  units: 100,
  priceUsd: 10,
  ts: 1,
  ...over,
});

describe('replayTrades', () => {
  it('boş listede $1M nakit ve pozisyonsuz başlar', () => {
    const { state, rejected } = replayTrades([], { userId: 'u1', startedAt: 0 });
    expect(state.usdBalance.amount).toBe(STARTING_USD);
    expect(state.holdings).toEqual([]);
    expect(rejected).toEqual([]);
  });

  it('alım nakiti düşürür, pozisyon açar', () => {
    const { state } = replayTrades([t()], { userId: 'u1', startedAt: 0 });
    expect(state.usdBalance.amount).toBe(STARTING_USD - 1000);
    expect(state.holdings).toEqual([{ assetId: 'THYAO', units: 100, avgCost: { amount: 10, currency: 'USD' } }]);
  });

  it('satım pozisyonu kapatır, nakiti damgalı fiyattan artırır', () => {
    const { state } = replayTrades(
      [t(), t({ side: 'sell', units: 100, priceUsd: 12, ts: 2 })],
      { userId: 'u1', startedAt: 0 },
    );
    expect(state.usdBalance.amount).toBe(STARTING_USD + 200);
    expect(state.holdings).toEqual([]);
  });

  it('ts sırasına göre uygular — girdi sırası bozuksa bile', () => {
    const { state } = replayTrades(
      [t({ side: 'sell', units: 100, priceUsd: 12, ts: 2 }), t({ ts: 1 })],
      { userId: 'u1', startedAt: 0 },
    );
    expect(state.usdBalance.amount).toBe(STARTING_USD + 200);
  });

  it('bakiyeyi aşan işlemi REDDEDER ve state bozulmadan devam eder (kapanış nihai otorite)', () => {
    const { state, rejected } = replayTrades(
      [t({ units: 1_000_000, priceUsd: 10, ts: 1 }), t({ units: 10, priceUsd: 10, ts: 2 })],
      { userId: 'u1', startedAt: 0 },
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain('Insufficient USD');
    expect(state.usdBalance.amount).toBe(STARTING_USD - 100); // yalnız ikinci işlem geçti
  });

  it('elde olmayanı satmayı REDDEDER', () => {
    const { rejected } = replayTrades([t({ side: 'sell', units: 5 })], { userId: 'u1', startedAt: 0 });
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain('Insufficient units');
  });
});

describe('valuate', () => {
  it('nakit + pozisyonları kapanış fiyatlarıyla toplar', () => {
    const { state } = replayTrades([t()], { userId: 'u1', startedAt: 0 });
    expect(valuate(state, { THYAO: 11 })).toEqual({ scoreUsd: STARTING_USD + 100, complete: true });
  });

  it('kapanış fiyatı eksik pozisyonu atlar ve complete=false işaretler', () => {
    const { state } = replayTrades([t()], { userId: 'u1', startedAt: 0 });
    expect(valuate(state, {})).toEqual({ scoreUsd: STARTING_USD - 1000, complete: false });
  });
});
```

- [ ] **Step 2: Testi koş, kırmızı olduğunu doğrula**

```bash
npx vitest run src/lib/domain/league/replay.test.ts
```

Beklenen: FAIL — `Failed to resolve import "./replay"`.

- [ ] **Step 3: Minimal implementasyon**

`src/lib/domain/league/replay.ts`:

```ts
/**
 * Lig skoru: $1M'dan başlayıp SUNUCU tarafından damgalanmış işlemleri yeniden oynatır ve
 * kapanış fiyatlarıyla değerler. `saves` payload'u burada HİÇ kullanılmaz — hile koruması
 * bunun üzerine kuruludur.
 *
 * CLAUDE.md esnetmesi (planda belgeli): bu domain modülü `stores/gameState`'ten import eder.
 * Gerekçe: istemcinin çalıştırdığı BİREBİR aynı reducer'lar kullanılmazsa sunucunun hesapladığı
 * skor ile oyuncunun ekranda gördüğü net servet yuvarlamada ayrışır. `gameState.ts` rune
 * içermeyen saf TS'tir.
 */
import {
  createGameState,
  buyAsset,
  sellAsset,
  netWorthPartsUsd,
  type GameState,
} from '../../stores/gameState';
import { usd } from '../money';
import type { UsdPriceOracle } from '../fx/usdOracle';

/** Sunucunun damgaladığı, gerçekleşmiş tek işlem. */
export interface StampedTrade {
  readonly assetId: string;
  readonly side: 'buy' | 'sell';
  readonly units: number;
  readonly priceUsd: number;
  /** Sunucu damga anı (epoch ms) — replay sırası bu alandan kurulur. */
  readonly ts: number;
}

export interface RejectedTrade {
  readonly trade: StampedTrade;
  readonly reason: string;
}

export interface ReplayResult {
  readonly state: GameState;
  readonly rejected: readonly RejectedTrade[];
}

export interface ReplayOptions {
  /** Oyuncu kimliği — yalnız GameState.playerId alanını doldurur, hesaba girmez. */
  readonly userId: string;
  /** Haftanın açılış anı (epoch ms) — GameState.createdAt damgası. */
  readonly startedAt: number;
}

/** Tek bir sabit fiyatı dönen oracle — reducer'ları damgalı fiyata zorlar. */
function fixedOracle(priceUsd: number): UsdPriceOracle {
  return { assetUsd: () => usd(priceUsd) };
}

/** Damgalı işlemleri ts sırasıyla oynatır. Bakiyeyi/pozisyonu aşan işlem REDDEDİLİR ve
 *  atlanır — döngü durmaz. Reddedilenler skora girmez; bu, `/api/trade`'deki teorik
 *  eşzamanlılık yarışının nihai kapanışıdır. */
export function replayTrades(
  trades: readonly StampedTrade[],
  opts: ReplayOptions,
): ReplayResult {
  let state = createGameState('canli', 0, opts.userId, opts.startedAt);
  const rejected: RejectedTrade[] = [];
  const ordered = [...trades].sort((a, b) => a.ts - b.ts);
  for (const trade of ordered) {
    try {
      const oracle = fixedOracle(trade.priceUsd);
      state =
        trade.side === 'buy'
          ? buyAsset(state, oracle, trade.assetId, trade.units)
          : sellAsset(state, oracle, trade.assetId, trade.units);
    } catch (e) {
      rejected.push({ trade, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { state, rejected };
}

/** Kapanış değerlemesi: nakit + fiyatlanabilen her pozisyon. Fiyatı olmayan pozisyon
 *  ATLANIR ve `complete=false` olur (kapanış işi bunu loglar, skoru yine de mühürler —
 *  eksik bir sembol yüzünden tüm haftayı iptal etmek daha kötü bir sonuç). */
export function valuate(
  state: GameState,
  closePricesUsd: Readonly<Record<string, number>>,
): { scoreUsd: number; complete: boolean } {
  const oracle: UsdPriceOracle = {
    assetUsd: (id) => {
      const p = closePricesUsd[id];
      if (p === undefined) throw new Error(`No close price: ${id}`);
      return usd(p);
    },
  };
  const parts = netWorthPartsUsd(state, oracle);
  return { scoreUsd: usd(parts.totalUsd).amount, complete: parts.complete };
}
```

- [ ] **Step 4: Testi koş, yeşil olduğunu doğrula**

```bash
npx vitest run src/lib/domain/league/replay.test.ts
```

Beklenen: PASS (8 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/league/replay.ts src/lib/domain/league/replay.test.ts
git commit -m "feat(league): damgali islem replay + kapanis degerlemesi"
```

---

## Task 3: Lig şeması migration'ı (0008)

**Files:**
- Create: `supabase/migrations/0008_league.sql`

**Interfaces:**
- Produces: `public.leagues`, `public.league_entries`, `public.trades` tabloları. `/api/trade` (Task 5) ve tick (Task 7-9) bu şemayı okur/yazar.

- [ ] **Step 1: Migration dosyasını yaz**

`supabase/migrations/0008_league.sql`:

```sql
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
```

- [ ] **Step 2: Lokal Supabase'e uygula ve şemayı doğrula**

```bash
npx supabase db reset
```

Beklenen: tüm migration'lar (0001-0008) hatasız uygulanır, çıktının sonunda `Finished supabase db reset.`

- [ ] **Step 3: Yetki matrisini canlı doğrula**

```bash
npx supabase db reset && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "set role authenticated; insert into public.trades (league_id, user_id, client_order_id, asset_id, side, units) values (gen_random_uuid(), gen_random_uuid(), 'x', 'THYAO', 'buy', 1);"
```

Beklenen: `ERROR: permission denied for table trades` — `authenticated` rolü işlem yazamıyor.

- [ ] **Step 4: Güvenlik lint'i koş**

Supabase MCP `get_advisors` (type: `security`) çağrılır.

Beklenen: yeni tablolar için ERROR seviyesinde bulgu YOK. `leagues`/`league_entries` üzerindeki "anon erişimi" WARN'ları beklenen ve kasıtlıdır (leaderboard oturumsuz ziyaretçiye açık) — rapora not düşülür.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_league.sql
git commit -m "feat(db): lig semasi — leagues/league_entries/trades, RLS+GRANT cift katman"
```

---

## Task 4: Sunucu tarafı fiyat damgası

**Files:**
- Create: `src/lib/server/league/prices.ts`
- Test: `src/lib/server/league/prices.test.ts`

**Interfaces:**
- Consumes: `fetchFxValue` (`src/lib/api/yahooSource.ts`), `fetchCryptoValue` (`src/lib/api/cryptoSource.ts`), `CATALOG`/`CRYPTO_SET` (`src/lib/catalog/liveAssets.ts`), `US_STOCKS` (`src/lib/catalog/usStocks.ts`), `isMarketOpen`/`sessionOpenMs` (`src/lib/domain/calendar/calendar.ts`), tip `AssetCategory` (`src/lib/domain/scenario/types.ts`)
- Produces: `assetCategoryOf(assetId): AssetCategory` · tip `StampedPrice` · `stampPrices(assetIds, fetchFn, at): Promise<Record<string, StampedPrice>>`

- [ ] **Step 1: Failing test yaz**

`src/lib/server/league/prices.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { assetCategoryOf, stampPrices } from './prices';

describe('assetCategoryOf', () => {
  it('katalog üyelerini kendi kategorisine, ABD sembollerini us, kalanı bist sayar', () => {
    expect(assetCategoryOf('BTC')).toBe('crypto');
    expect(assetCategoryOf('XAUGRAM')).toBe('commodity');
    expect(assetCategoryOf('AAPL')).toBe('us');
    expect(assetCategoryOf('EREGL')).toBe('bist');
  });
});

describe('stampPrices', () => {
  const at = new Date('2026-07-24T14:00:00Z'); // 10:00 New York — NYSE açık, BIST 17:00 açık

  it('kripto fiyatını doğrudan USD damgalar ve taze sayar', async () => {
    const fetchFn = vi.fn();
    const out = await stampPrices(['BTC'], fetchFn, at, {
      fetchCrypto: async () => ({ prices: { BTC: 95000 }, change: {} }),
      fetchYahoo: async () => ({ usdTry: 40, prices: {}, priceAt: {} }),
    });
    expect(out.BTC).toEqual({ priceUsd: 95000, fresh: true });
  });

  it('BIST fiyatını TRY→USD çevirir, seans içi damgalıysa taze sayar', async () => {
    const out = await stampPrices(['THYAO'], vi.fn(), at, {
      fetchCrypto: async () => ({ prices: {}, change: {} }),
      fetchYahoo: async () => ({
        usdTry: 40,
        prices: { THYAO: 400 },
        priceAt: { THYAO: at.getTime() },
      }),
    });
    expect(out.THYAO).toEqual({ priceUsd: 10, fresh: true });
  });

  it('fiyat damgası BUGÜNKÜ seans açılışından eskiyse taze SAYMAZ (15dk tuzağı)', async () => {
    const out = await stampPrices(['THYAO'], vi.fn(), at, {
      fetchCrypto: async () => ({ prices: {}, change: {} }),
      fetchYahoo: async () => ({
        usdTry: 40,
        prices: { THYAO: 400 },
        priceAt: { THYAO: at.getTime() - 86_400_000 }, // dünkü fiyat
      }),
    });
    expect(out.THYAO).toEqual({ priceUsd: 10, fresh: false });
  });

  it('piyasa kapalıyken fiyat gelse de taze saymaz', async () => {
    const closed = new Date('2026-07-25T14:00:00Z'); // cumartesi
    const out = await stampPrices(['THYAO'], vi.fn(), closed, {
      fetchCrypto: async () => ({ prices: {}, change: {} }),
      fetchYahoo: async () => ({ usdTry: 40, prices: { THYAO: 400 }, priceAt: { THYAO: closed.getTime() } }),
    });
    expect(out.THYAO.fresh).toBe(false);
  });

  it('bilinmeyen sembol için kayıt üretmez', async () => {
    const out = await stampPrices(['ZZZZ'], vi.fn(), at, {
      fetchCrypto: async () => ({ prices: {}, change: {} }),
      fetchYahoo: async () => ({ usdTry: 40, prices: {}, priceAt: {} }),
    });
    expect(out.ZZZZ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Testi koş, kırmızı olduğunu doğrula**

```bash
npx vitest run src/lib/server/league/prices.test.ts
```

Beklenen: FAIL — `Failed to resolve import "./prices"`.

- [ ] **Step 3: Minimal implementasyon**

`src/lib/server/league/prices.ts`:

```ts
/**
 * Lig fiyat damgası: istemcinin beyan ettiği fiyata ASLA güvenilmez — fiyat burada,
 * sunucunun kendi upstream çağrısından üretilir. `/api/trade` ve `/api/league/tick`
 * tek kaynak olarak bunu kullanır.
 */
import { fetchFxValue } from '$lib/api/yahooSource';
import { fetchCryptoValue } from '$lib/api/cryptoSource';
import type { CryptoValue, FxValue } from '$lib/api/types';
import { CATALOG, CRYPTO_SET } from '$lib/catalog/liveAssets';
import { US_STOCKS } from '$lib/catalog/usStocks';
import { isMarketOpen, sessionOpenMs } from '$lib/domain/calendar/calendar';
import type { AssetCategory } from '$lib/domain/scenario/types';

const US_SYMBOLS: ReadonlySet<string> = new Set(US_STOCKS.map((s) => s.symbol));

export interface StampedPrice {
  /** Sunucunun gördüğü USD fiyat. */
  readonly priceUsd: number;
  /** Anlık işleme uygun mu — kapalı piyasa/bayat damga false yapar (emir kuyruğa girer). */
  readonly fresh: boolean;
}

/** İstemcideki `isAssetFresh` kategori çözümünün sunucu ikizi: katalog → ABD kataloğu → bist. */
export function assetCategoryOf(assetId: string): AssetCategory {
  const known = CATALOG[assetId]?.category;
  if (known !== undefined) return known;
  return US_SYMBOLS.has(assetId) ? 'us' : 'bist';
}

/** Test edilebilirlik için upstream çağrıları enjekte edilebilir (varsayılan gerçek kaynaklar). */
export interface PriceDeps {
  fetchCrypto?: (coins: readonly string[], fetchFn: typeof fetch) => Promise<CryptoValue>;
  fetchYahoo?: (
    bist: readonly string[],
    us: readonly string[],
    fetchFn: typeof fetch,
  ) => Promise<FxValue>;
}

/** İstenen sembolleri tek turda damgalar. Fiyatı bulunamayan sembol sonuçta HİÇ yer almaz
 *  (çağıran `undefined` kontrolüyle "fiyat yok" durumunu ayırt eder). */
export async function stampPrices(
  assetIds: readonly string[],
  fetchFn: typeof fetch,
  at: Date,
  deps: PriceDeps = {},
): Promise<Record<string, StampedPrice>> {
  const fetchCrypto = deps.fetchCrypto ?? ((c, f) => fetchCryptoValue(c, f));
  const fetchYahoo = deps.fetchYahoo ?? ((b, u, f) => fetchFxValue(b, u, f));

  const wanted = Array.from(new Set(assetIds));
  const crypto = wanted.filter((id) => CRYPTO_SET.has(id));
  const bist = wanted.filter((id) => assetCategoryOf(id) === 'bist');
  const us = wanted.filter((id) => assetCategoryOf(id) === 'us');
  // Emtia/döviz (XAUGRAM/XAGGRAM/EUR) yahoo snapshot'ında her durumda gelir — istenmez.
  const needsYahoo = wanted.some((id) => !CRYPTO_SET.has(id));

  const [cryptoValue, fxValue] = await Promise.all([
    crypto.length > 0 ? fetchCrypto(crypto, fetchFn) : Promise.resolve<CryptoValue>({ prices: {} }),
    needsYahoo
      ? fetchYahoo(bist, us, fetchFn)
      : Promise.resolve<FxValue>({ usdTry: 0, prices: {} }),
  ]);

  const out: Record<string, StampedPrice> = {};
  for (const id of wanted) {
    if (CRYPTO_SET.has(id)) {
      const p = cryptoValue.prices[id];
      // Kripto 7/24 açık: fiyat geldiyse tazedir.
      if (p !== undefined && p > 0) out[id] = { priceUsd: p, fresh: true };
      continue;
    }
    const tryPrice = fxValue.prices[id];
    if (tryPrice === undefined || !(fxValue.usdTry > 0)) continue;
    const priceUsd = tryPrice / fxValue.usdTry;
    const category = assetCategoryOf(id);
    let fresh: boolean;
    if (category !== 'bist' && category !== 'us') {
      fresh = true; // altın/gümüş/EUR: seans kavramı yok
    } else {
      // İstemcideki isAssetFresh ile AYNI kural: seans açık + damga BUGÜNKÜ açılıştan sonra.
      const stampedAt = fxValue.priceAt?.[id];
      fresh =
        isMarketOpen(category, at) &&
        stampedAt !== undefined &&
        stampedAt >= sessionOpenMs(category, at);
    }
    out[id] = { priceUsd, fresh };
  }
  return out;
}
```

- [ ] **Step 4: Testi koş, yeşil olduğunu doğrula**

```bash
npx vitest run src/lib/server/league/prices.test.ts
```

Beklenen: PASS (6 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/league/prices.ts src/lib/server/league/prices.test.ts
git commit -m "feat(league): sunucu tarafi fiyat damgasi — kaynak secimi + tazelik"
```

---

## Task 5: `/api/trade` — kimlik, doğrulama, damga, insert

**Files:**
- Create: `src/lib/server/league/admin.ts`
- Create: `src/routes/api/trade/+server.ts`
- Test: `src/routes/api/trade/server.test.ts`

**Interfaces:**
- Consumes: `isSameOrigin` (`src/lib/server/csrf.ts`), `stampPrices` (Task 4), `leagueWeekKey`/`leagueLockMoment` (Task 1), `usd` (`src/lib/domain/money.ts`)
- Produces: `createAdminClient(): SupabaseClient` · POST `/api/trade` → `{ status: 'filled', priceUsd, units, serverTs } | { status: 'queued', orderId }`

- [ ] **Step 1: Failing test yaz**

`src/routes/api/trade/server.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { parseTradeRequest } from './+server';

describe('parseTradeRequest', () => {
  it('geçerli units emrini kabul eder', () => {
    expect(
      parseTradeRequest({ assetId: 'THYAO', side: 'buy', units: 10, clientOrderId: 'abc-1' }),
    ).toEqual({ ok: true, value: { assetId: 'THYAO', side: 'buy', units: 10, amountUsd: null, clientOrderId: 'abc-1' } });
  });

  it('geçerli amountUsd emrini kabul eder', () => {
    expect(
      parseTradeRequest({ assetId: 'BTC', side: 'buy', amountUsd: 500, clientOrderId: 'abc-2' }),
    ).toEqual({ ok: true, value: { assetId: 'BTC', side: 'buy', units: null, amountUsd: 500, clientOrderId: 'abc-2' } });
  });

  it('katalog dışı sembol biçimini reddeder', () => {
    expect(parseTradeRequest({ assetId: 'thyao; drop', side: 'buy', units: 1, clientOrderId: 'a' }).ok).toBe(false);
    expect(parseTradeRequest({ assetId: 'TOOLONGSYMBOL1', side: 'buy', units: 1, clientOrderId: 'a' }).ok).toBe(false);
  });

  it('negatif/sıfır/absürt adedi reddeder', () => {
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 0, clientOrderId: 'a' }).ok).toBe(false);
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: -5, clientOrderId: 'a' }).ok).toBe(false);
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 1e15, clientOrderId: 'a' }).ok).toBe(false);
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: Number.NaN, clientOrderId: 'a' }).ok).toBe(false);
  });

  it('satışta amountUsd kabul etmez (yalnız alışta anlamlı)', () => {
    expect(parseTradeRequest({ assetId: 'BTC', side: 'sell', amountUsd: 100, clientOrderId: 'a' }).ok).toBe(false);
  });

  it('units ve amountUsd birlikte gelirse reddeder', () => {
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 1, amountUsd: 100, clientOrderId: 'a' }).ok).toBe(false);
  });

  it('clientOrderId yoksa/biçimsizse reddeder', () => {
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 1 }).ok).toBe(false);
    expect(parseTradeRequest({ assetId: 'BTC', side: 'buy', units: 1, clientOrderId: 'x'.repeat(80) }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Testi koş, kırmızı olduğunu doğrula**

```bash
npx vitest run src/routes/api/trade/server.test.ts
```

Beklenen: FAIL — `Failed to resolve import "./+server"`.

- [ ] **Step 3: Admin client fabrikasını yaz**

`src/lib/server/league/admin.ts`:

```ts
/**
 * service_role Supabase client'i. `trades` tablosuna `authenticated` INSERT yetkisi
 * BİLİNÇLİ olarak verilmiyor (hile korumasının çekirdeği) — o yüzden lig yazımları
 * bu client'tan geçer. CLAUDE.md'nin "hep locals.supabase" kuralından planda belgeli
 * esnetme; emsali `src/routes/api/account/delete/+server.ts`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';
import { SUPABASE_SECRET_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

export function createAdminClient(): SupabaseClient {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Vercel serverless'te native WebSocket yok; RealtimeClient constructor'da eagerly
    // kuruluyor ve transport verilmezse tüm rota 500 döner (SP1 dersi).
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
}
```

- [ ] **Step 4: Endpoint'i yaz**

`src/routes/api/trade/+server.ts`:

```ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSameOrigin } from '$lib/server/csrf';
import { createAdminClient } from '$lib/server/league/admin';
import { stampPrices } from '$lib/server/league/prices';
import { leagueWeekKey, leagueLockMoment } from '$lib/domain/league/week';

const SYMBOL_RE = /^[A-Z0-9]{1,12}$/;
const ORDER_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const MAX_UNITS = 1e12;
const MAX_AMOUNT_USD = 1e12;

export interface TradeRequest {
  assetId: string;
  side: 'buy' | 'sell';
  units: number | null;
  amountUsd: number | null;
  clientOrderId: string;
}

export type ParseResult =
  | { ok: true; value: TradeRequest }
  | { ok: false; reason: string };

function positiveFinite(n: unknown, max: number): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= max;
}

/** Girdi şema doğrulaması — endpoint'ten ayrı export edilir ki test edilebilsin. */
export function parseTradeRequest(body: unknown): ParseResult {
  if (body === null || typeof body !== 'object') return { ok: false, reason: 'Geçersiz istek' };
  const b = body as Record<string, unknown>;

  if (typeof b.assetId !== 'string' || !SYMBOL_RE.test(b.assetId))
    return { ok: false, reason: 'Geçersiz sembol' };
  if (b.side !== 'buy' && b.side !== 'sell') return { ok: false, reason: 'Geçersiz yön' };
  if (typeof b.clientOrderId !== 'string' || !ORDER_ID_RE.test(b.clientOrderId))
    return { ok: false, reason: 'Geçersiz emir kimliği' };

  const hasUnits = b.units !== undefined && b.units !== null;
  const hasAmount = b.amountUsd !== undefined && b.amountUsd !== null;
  if (hasUnits === hasAmount) return { ok: false, reason: 'Adet ya da tutardan yalnız biri verilmeli' };
  if (hasAmount && b.side !== 'buy') return { ok: false, reason: 'Tutar bazlı emir yalnız alışta geçerli' };
  if (hasUnits && !positiveFinite(b.units, MAX_UNITS)) return { ok: false, reason: 'Geçersiz adet' };
  if (hasAmount && !positiveFinite(b.amountUsd, MAX_AMOUNT_USD))
    return { ok: false, reason: 'Geçersiz tutar' };

  return {
    ok: true,
    value: {
      assetId: b.assetId,
      side: b.side,
      units: hasUnits ? (b.units as number) : null,
      amountUsd: hasAmount ? (b.amountUsd as number) : null,
      clientOrderId: b.clientOrderId,
    },
  };
}

export const POST: RequestHandler = async ({ request, locals, url, fetch }) => {
  if (!isSameOrigin(request.headers.get('origin'), url.origin)) error(403, 'Geçersiz kaynak');
  const { user } = await locals.safeGetSession();
  if (!user) error(401, 'Oturum gerekli');
  if (user.is_anonymous === true) error(403, 'Lig işlemi için kayıtlı hesap gerekli');

  const parsed = parseTradeRequest(await request.json().catch(() => null));
  if (!parsed.ok) error(400, parsed.reason);
  const req = parsed.value;

  const at = new Date();
  const weekKey = leagueWeekKey(at);
  if (at.getTime() >= leagueLockMoment(weekKey).getTime())
    error(409, 'Hafta kapandı — bu işlem skora girmez');

  const admin = createAdminClient();

  const { data: league } = await admin
    .from('leagues')
    .select('id, status')
    .eq('week_key', weekKey)
    .maybeSingle();
  if (!league || league.status !== 'open') error(409, 'Lig haftası henüz açılmadı');

  const { data: entry } = await admin
    .from('league_entries')
    .select('user_id')
    .eq('league_id', league.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!entry) error(403, 'Lige katılmadınız');

  const stamped = (await stampPrices([req.assetId], fetch, at))[req.assetId];

  // Fiyat yok ya da bayat/kapalı → emir kuyruğa girer (kapalı piyasa mekaniğinin sunucu ikizi).
  const queued = stamped === undefined || !stamped.fresh;

  const row = queued
    ? {
        league_id: league.id,
        user_id: user.id,
        client_order_id: req.clientOrderId,
        asset_id: req.assetId,
        side: req.side,
        units: req.units,
        amount_usd: req.amountUsd,
        status: 'pending' as const,
      }
    : {
        league_id: league.id,
        user_id: user.id,
        client_order_id: req.clientOrderId,
        asset_id: req.assetId,
        side: req.side,
        units: req.units ?? Math.floor((req.amountUsd! / stamped!.priceUsd) * 1e4) / 1e4,
        amount_usd: req.amountUsd,
        status: 'filled' as const,
        server_price_usd: stamped!.priceUsd,
        server_ts: at.toISOString(),
      };

  const { data: inserted, error: dbError } = await admin
    .from('trades')
    .insert(row)
    .select('id, status, units, server_price_usd, server_ts')
    .single();

  if (dbError) {
    // Idempotency: aynı clientOrderId ikinci kez geldi — mevcut satır aynen döner.
    if (dbError.code === '23505') {
      const { data: existing } = await admin
        .from('trades')
        .select('id, status, units, server_price_usd, server_ts')
        .eq('league_id', league.id)
        .eq('user_id', user.id)
        .eq('client_order_id', req.clientOrderId)
        .single();
      if (existing) return json(toResponse(existing));
    }
    console.error('[api/trade] insert hatası', dbError);
    error(500, 'İşlem kaydedilemedi');
  }

  return json(toResponse(inserted));
};

function toResponse(row: {
  id: string;
  status: string;
  units: number | null;
  server_price_usd: number | null;
  server_ts: string | null;
}) {
  if (row.status === 'filled')
    return {
      status: 'filled' as const,
      orderId: row.id,
      units: row.units,
      priceUsd: row.server_price_usd,
      serverTs: row.server_ts,
    };
  return { status: 'queued' as const, orderId: row.id };
}
```

- [ ] **Step 5: Testi koş, yeşil olduğunu doğrula**

```bash
npx vitest run src/routes/api/trade/server.test.ts
```

Beklenen: PASS (7 test).

- [ ] **Step 6: Tip kontrolü + commit**

```bash
npm run check
```

Beklenen: `svelte-check found 0 errors`.

```bash
git add src/lib/server/league/admin.ts src/routes/api/trade/
git commit -m "feat(api): /api/trade — sunucu damgali lig islemi + idempotency"
```

---

## Task 6: `/api/trade` bakiye doğrulaması ve hız sınırı

**Files:**
- Modify: `src/routes/api/trade/+server.ts`
- Test: `src/routes/api/trade/server.test.ts` (ek testler)

**Interfaces:**
- Consumes: `replayTrades` (Task 2), `leagueWeekStart` (Task 1)
- Produces: `validateAgainstReplay(trades, candidate, startedAt, userId): { ok: true } | { ok: false; reason: string }` · `withinRateLimit(recentCount): boolean`

- [ ] **Step 1: Failing test yaz**

`src/routes/api/trade/server.test.ts` dosyasının sonuna eklenir:

```ts
import { validateAgainstReplay, withinRateLimit, RATE_LIMIT_MAX } from './+server';
import type { StampedTrade } from '$lib/domain/league/replay';

describe('validateAgainstReplay', () => {
  const prior: StampedTrade[] = [
    { assetId: 'THYAO', side: 'buy', units: 100, priceUsd: 10, ts: 1 },
  ];

  it('bakiyeye sığan alımı kabul eder', () => {
    const r = validateAgainstReplay(prior, { assetId: 'BTC', side: 'buy', units: 1, priceUsd: 95000, ts: 2 }, 0, 'u1');
    expect(r.ok).toBe(true);
  });

  it('bakiyeyi aşan alımı reddeder', () => {
    const r = validateAgainstReplay(prior, { assetId: 'BTC', side: 'buy', units: 100, priceUsd: 95000, ts: 2 }, 0, 'u1');
    expect(r).toEqual({ ok: false, reason: 'Yetersiz bakiye' });
  });

  it('elde olmayanı satmayı reddeder', () => {
    const r = validateAgainstReplay(prior, { assetId: 'BTC', side: 'sell', units: 1, priceUsd: 95000, ts: 2 }, 0, 'u1');
    expect(r).toEqual({ ok: false, reason: 'Yetersiz pozisyon' });
  });

  it('elde olanı satmayı kabul eder', () => {
    const r = validateAgainstReplay(prior, { assetId: 'THYAO', side: 'sell', units: 50, priceUsd: 11, ts: 2 }, 0, 'u1');
    expect(r.ok).toBe(true);
  });
});

describe('withinRateLimit', () => {
  it('sınırın altında geçirir, sınırda/üstünde reddeder', () => {
    expect(withinRateLimit(0)).toBe(true);
    expect(withinRateLimit(RATE_LIMIT_MAX - 1)).toBe(true);
    expect(withinRateLimit(RATE_LIMIT_MAX)).toBe(false);
  });
});
```

- [ ] **Step 2: Testi koş, kırmızı olduğunu doğrula**

```bash
npx vitest run src/routes/api/trade/server.test.ts
```

Beklenen: FAIL — `validateAgainstReplay is not a function`.

- [ ] **Step 3: Implementasyon — `+server.ts`'e ekle**

`src/routes/api/trade/+server.ts` dosyasında `import` bloğuna eklenir:

```ts
import { replayTrades, type StampedTrade } from '$lib/domain/league/replay';
import { leagueWeekStart } from '$lib/domain/league/week';
```

Dosyanın `parseTradeRequest`'ten sonrasına eklenir:

```ts
/** Kullanıcı başına, kayan 10 saniyelik pencerede izin verilen azami işlem sayısı. */
export const RATE_LIMIT_MAX = 20;
export const RATE_LIMIT_WINDOW_MS = 10_000;

export function withinRateLimit(recentCount: number): boolean {
  return recentCount < RATE_LIMIT_MAX;
}

/** Aday işlemi, o ana kadarki damgalı işlemlerin replay'i üstünde dener.
 *  Not: Bu kontrol eşzamanlı iki istekte teorik olarak yarışabilir — nihai otorite
 *  kapanış replay'idir (bakiyeyi aşan işlem orada da reddedilir ve skora girmez). */
export function validateAgainstReplay(
  prior: readonly StampedTrade[],
  candidate: StampedTrade,
  startedAt: number,
  userId: string,
): { ok: true } | { ok: false; reason: string } {
  const { rejected } = replayTrades([...prior, candidate], { userId, startedAt });
  const failed = rejected.find((r) => r.trade === candidate);
  if (!failed) return { ok: true };
  return {
    ok: false,
    reason: failed.reason.includes('units') ? 'Yetersiz pozisyon' : 'Yetersiz bakiye',
  };
}
```

`POST` handler'ında, `const stamped = ...` satırından ÖNCE hız sınırı eklenir:

```ts
  const { count: recentCount } = await admin
    .from('trades')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('placed_at', new Date(at.getTime() - RATE_LIMIT_WINDOW_MS).toISOString());
  if (!withinRateLimit(recentCount ?? 0)) error(429, 'Çok hızlı işlem — biraz bekleyin');
```

`POST` handler'ında, `const row = queued ? ... : ...` satırından ÖNCE bakiye doğrulaması eklenir:

```ts
  // Anlık dolacak emirler bakiyeye karşı doğrulanır. Kuyruğa giren emir doğrulanmaz:
  // dolum anındaki fiyat/bakiye bilinmiyor — settle sırasında (Task 8) denenir ve
  // yetmezse iptal edilir (istemcideki settlePendingOrders ile aynı semantik).
  if (!queued) {
    const units = req.units ?? Math.floor((req.amountUsd! / stamped!.priceUsd) * 1e4) / 1e4;
    if (!(units > 0)) error(400, 'Tutar bu fiyatta işleme yetmiyor');
    const { data: priorRows } = await admin
      .from('trades')
      .select('asset_id, side, units, server_price_usd, server_ts')
      .eq('league_id', league.id)
      .eq('user_id', user.id)
      .eq('status', 'filled')
      .order('server_ts', { ascending: true });
    const prior: StampedTrade[] = (priorRows ?? []).map((r) => ({
      assetId: r.asset_id as string,
      side: r.side as 'buy' | 'sell',
      units: Number(r.units),
      priceUsd: Number(r.server_price_usd),
      ts: Date.parse(r.server_ts as string),
    }));
    const verdict = validateAgainstReplay(
      prior,
      { assetId: req.assetId, side: req.side, units, priceUsd: stamped!.priceUsd, ts: at.getTime() },
      leagueWeekStart(at).getTime(),
      user.id,
    );
    if (!verdict.ok) error(422, verdict.reason);
  }
```

- [ ] **Step 4: Testi koş, yeşil olduğunu doğrula**

```bash
npx vitest run src/routes/api/trade/server.test.ts
```

Beklenen: PASS (12 test).

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/trade/
git commit -m "feat(api): /api/trade bakiye replay dogrulamasi + kullanici hiz siniri"
```

---

## Task 7: `/api/league/tick` — hafta açma

**Files:**
- Create: `src/routes/api/league/tick/+server.ts`
- Test: `src/routes/api/league/tick/server.test.ts`

**Interfaces:**
- Consumes: `leagueWeekKey`, `leagueWeekStart`, `leagueLockMoment` (Task 1), `createAdminClient` (Task 5), `CRON_SECRET` (`$env/static/private`)
- Produces: POST `/api/league/tick` → `{ opened: string | null; settled: number; closed: string | null }` · `authorizeTick(header, secret): boolean`

- [ ] **Step 1: Failing test yaz**

`src/routes/api/league/tick/server.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { authorizeTick, weekRowFor } from './+server';

describe('authorizeTick', () => {
  it('doğru sırrı kabul, yanlışı/eksiği reddeder', () => {
    expect(authorizeTick('s3cret', 's3cret')).toBe(true);
    expect(authorizeTick('wrong', 's3cret')).toBe(false);
    expect(authorizeTick(null, 's3cret')).toBe(false);
    expect(authorizeTick('s3cret', '')).toBe(false); // sır yapılandırılmamış → daima ret
  });

  it('uzunluk farkında da sabit sonuç verir (kısa/uzun girdi çökmez)', () => {
    expect(authorizeTick('a', 's3cret')).toBe(false);
    expect(authorizeTick('s3cretlonger', 's3cret')).toBe(false);
  });
});

describe('weekRowFor', () => {
  it('verilen an için hafta satırını üretir', () => {
    expect(weekRowFor(new Date('2026-07-22T12:00:00Z'))).toEqual({
      week_key: '2026-07-20',
      opens_at: '2026-07-19T21:00:00.000Z',
      locks_at: '2026-07-24T20:00:00.000Z',
    });
  });
});
```

- [ ] **Step 2: Testi koş, kırmızı olduğunu doğrula**

```bash
npx vitest run src/routes/api/league/tick/server.test.ts
```

Beklenen: FAIL — `Failed to resolve import "./+server"`.

- [ ] **Step 3: Minimal implementasyon**

`src/routes/api/league/tick/+server.ts`:

```ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$env/static/private';
import { createAdminClient } from '$lib/server/league/admin';
import { leagueWeekKey, leagueWeekStart, leagueLockMoment } from '$lib/domain/league/week';

/** Zamanlayıcı kimliği. Sır yapılandırılmamışsa (boş) DAİMA reddeder — açık kapı bırakmaz. */
export function authorizeTick(header: string | null, secret: string): boolean {
  if (secret.length === 0 || header === null) return false;
  if (header.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= header.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export interface WeekRow {
  week_key: string;
  opens_at: string;
  locks_at: string;
}

/** Verilen anın ait olduğu hafta için `leagues` satırı. */
export function weekRowFor(at: Date): WeekRow {
  const weekKey = leagueWeekKey(at);
  return {
    week_key: weekKey,
    opens_at: leagueWeekStart(at).toISOString(),
    locks_at: leagueLockMoment(weekKey).toISOString(),
  };
}

export const POST: RequestHandler = async ({ request }) => {
  if (!authorizeTick(request.headers.get('x-cron-secret'), CRON_SECRET)) error(401, 'Yetkisiz');

  const at = new Date();
  const admin = createAdminClient();

  // 1) Hafta aç — idempotent: week_key unique, çakışma yok sayılır.
  const row = weekRowFor(at);
  const { error: openError } = await admin
    .from('leagues')
    .upsert(row, { onConflict: 'week_key', ignoreDuplicates: true });
  if (openError) {
    console.error('[api/league/tick] hafta açma hatası', openError);
    error(500, 'Hafta açılamadı');
  }

  return json({ opened: row.week_key, settled: 0, closed: null });
};
```

- [ ] **Step 4: Testi koş, yeşil olduğunu doğrula**

```bash
npx vitest run src/routes/api/league/tick/server.test.ts
```

Beklenen: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/league/tick/
git commit -m "feat(api): /api/league/tick — CRON_SECRET korumali idempotent hafta acma"
```

---

## Task 8: `/api/league/tick` — bekleyen emir settle

**Files:**
- Modify: `src/routes/api/league/tick/+server.ts`
- Test: `src/routes/api/league/tick/server.test.ts` (ek testler)

**Interfaces:**
- Consumes: `stampPrices` (Task 4), `replayTrades` (Task 2)
- Produces: `settleDecision(order, stamped, state): { action: 'fill'; units: number; priceUsd: number } | { action: 'wait' } | { action: 'cancel'; reason: string }`

- [ ] **Step 1: Failing test yaz**

`src/routes/api/league/tick/server.test.ts` sonuna eklenir:

```ts
import { settleDecision } from './+server';
import { replayTrades } from '$lib/domain/league/replay';

const emptyState = () => replayTrades([], { userId: 'u1', startedAt: 0 }).state;

describe('settleDecision', () => {
  it('fiyat yoksa bekletir', () => {
    const o = { asset_id: 'THYAO', side: 'buy' as const, units: 10, amount_usd: null };
    expect(settleDecision(o, undefined, emptyState())).toEqual({ action: 'wait' });
  });

  it('fiyat bayat/kapalıysa bekletir', () => {
    const o = { asset_id: 'THYAO', side: 'buy' as const, units: 10, amount_usd: null };
    expect(settleDecision(o, { priceUsd: 10, fresh: false }, emptyState())).toEqual({ action: 'wait' });
  });

  it('taze fiyatta units emrini doldurur', () => {
    const o = { asset_id: 'THYAO', side: 'buy' as const, units: 10, amount_usd: null };
    expect(settleDecision(o, { priceUsd: 10, fresh: true }, emptyState())).toEqual({
      action: 'fill',
      units: 10,
      priceUsd: 10,
    });
  });

  it('amountUsd emrini dolum anındaki fiyattan adede çevirir', () => {
    const o = { asset_id: 'BTC', side: 'buy' as const, units: null, amount_usd: 1000 };
    expect(settleDecision(o, { priceUsd: 400, fresh: true }, emptyState())).toEqual({
      action: 'fill',
      units: 2.5,
      priceUsd: 400,
    });
  });

  it('bakiye yetmiyorsa iptal eder', () => {
    const o = { asset_id: 'BTC', side: 'buy' as const, units: 1000, amount_usd: null };
    expect(settleDecision(o, { priceUsd: 95000, fresh: true }, emptyState())).toEqual({
      action: 'cancel',
      reason: 'Yetersiz bakiye',
    });
  });

  it('elde olmayanı satma emrini iptal eder', () => {
    const o = { asset_id: 'BTC', side: 'sell' as const, units: 1, amount_usd: null };
    expect(settleDecision(o, { priceUsd: 95000, fresh: true }, emptyState())).toEqual({
      action: 'cancel',
      reason: 'Yetersiz pozisyon',
    });
  });
});
```

- [ ] **Step 2: Testi koş, kırmızı olduğunu doğrula**

```bash
npx vitest run src/routes/api/league/tick/server.test.ts
```

Beklenen: FAIL — `settleDecision is not a function`.

- [ ] **Step 3: Implementasyon**

`src/routes/api/league/tick/+server.ts` import bloğuna eklenir:

```ts
import { stampPrices, type StampedPrice } from '$lib/server/league/prices';
import { replayTrades, type StampedTrade } from '$lib/domain/league/replay';
import { buyAsset, sellAsset, type GameState } from '$lib/stores/gameState';
import { usd } from '$lib/domain/money';
```

`weekRowFor`'dan sonra eklenir:

```ts
export interface PendingRow {
  asset_id: string;
  side: 'buy' | 'sell';
  units: number | null;
  amount_usd: number | null;
}

export type SettleAction =
  | { action: 'fill'; units: number; priceUsd: number }
  | { action: 'wait' }
  | { action: 'cancel'; reason: string };

/** Bekleyen emrin bu turdaki kaderi. İstemcideki `settlePendingOrders` ile AYNI semantik:
 *  taze fiyat yoksa bekle; varsa dene; reducer reddederse iptal (kuyrukta sonsuza kalmaz). */
export function settleDecision(
  order: PendingRow,
  stamped: StampedPrice | undefined,
  state: GameState,
): SettleAction {
  if (stamped === undefined || !stamped.fresh) return { action: 'wait' };
  const priceUsd = stamped.priceUsd;
  const units =
    order.units ?? Math.floor((Number(order.amount_usd) / priceUsd) * 1e4) / 1e4;
  if (!(units > 0)) return { action: 'cancel', reason: 'Tutar bu fiyatta işleme yetmiyor' };
  const oracle = { assetUsd: () => usd(priceUsd) };
  try {
    if (order.side === 'buy') buyAsset(state, oracle, order.asset_id, units);
    else sellAsset(state, oracle, order.asset_id, units);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { action: 'cancel', reason: msg.includes('units') ? 'Yetersiz pozisyon' : 'Yetersiz bakiye' };
  }
  return { action: 'fill', units, priceUsd };
}
```

`POST` handler'ında, `return json(...)` satırından ÖNCE settle fazı eklenir:

```ts
  // 2) Bekleyen emirleri settle et. Erken çıkış: bekleyen yoksa upstream fiyat çekilmez
  //    (tick 5 dakikada bir koşuyor — boş turlar tek ucuz DB sorgusuna iner).
  let settled = 0;
  const { data: openLeague } = await admin
    .from('leagues')
    .select('id, week_key, opens_at')
    .eq('week_key', row.week_key)
    .maybeSingle();

  if (openLeague) {
    const { data: pending } = await admin
      .from('trades')
      .select('id, user_id, asset_id, side, units, amount_usd')
      .eq('league_id', openLeague.id)
      .eq('status', 'pending');

    if (pending && pending.length > 0) {
      const prices = await stampPrices(
        pending.map((p) => p.asset_id as string),
        fetch,
        at,
      );
      const startedAt = Date.parse(openLeague.opens_at as string);
      // Kullanıcı başına gruplanır: her emir, aynı kullanıcının o ana kadarki state'i
      // üstünde denenir (aynı turda dolan emirler birbirini etkiler).
      const byUser = new Map<string, typeof pending>();
      for (const p of pending) {
        const list = byUser.get(p.user_id as string) ?? [];
        list.push(p);
        byUser.set(p.user_id as string, list);
      }

      for (const [userId, orders] of byUser) {
        const { data: filledRows } = await admin
          .from('trades')
          .select('asset_id, side, units, server_price_usd, server_ts')
          .eq('league_id', openLeague.id)
          .eq('user_id', userId)
          .eq('status', 'filled')
          .order('server_ts', { ascending: true });
        const prior: StampedTrade[] = (filledRows ?? []).map((r) => ({
          assetId: r.asset_id as string,
          side: r.side as 'buy' | 'sell',
          units: Number(r.units),
          priceUsd: Number(r.server_price_usd),
          ts: Date.parse(r.server_ts as string),
        }));
        let state = replayTrades(prior, { userId, startedAt }).state;

        for (const order of orders) {
          const decision = settleDecision(order as PendingRow, prices[order.asset_id as string], state);
          if (decision.action === 'wait') continue;
          if (decision.action === 'cancel') {
            await admin
              .from('trades')
              .update({ status: 'cancelled', cancel_reason: decision.reason })
              .eq('id', order.id);
            settled++;
            continue;
          }
          const oracle = { assetUsd: () => usd(decision.priceUsd) };
          state =
            order.side === 'buy'
              ? buyAsset(state, oracle, order.asset_id as string, decision.units)
              : sellAsset(state, oracle, order.asset_id as string, decision.units);
          await admin
            .from('trades')
            .update({
              status: 'filled',
              units: decision.units,
              server_price_usd: decision.priceUsd,
              server_ts: at.toISOString(),
            })
            .eq('id', order.id);
          settled++;
        }
      }
    }
  }
```

`return json({ opened: row.week_key, settled: 0, closed: null });` satırı şununla değiştirilir:

```ts
  return json({ opened: row.week_key, settled, closed: null });
```

Ayrıca handler imzası `fetch`'i alacak şekilde güncellenir:

```ts
export const POST: RequestHandler = async ({ request, fetch }) => {
```

- [ ] **Step 4: Testi koş, yeşil olduğunu doğrula**

```bash
npx vitest run src/routes/api/league/tick/server.test.ts
```

Beklenen: PASS (9 test).

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/league/tick/
git commit -m "feat(api): tick — bekleyen lig emirlerini sunucuda settle et"
```

---

## Task 9: `/api/league/tick` — kapanış ve skor mühürleme

**Files:**
- Modify: `src/routes/api/league/tick/+server.ts`
- Test: `src/routes/api/league/tick/server.test.ts` (ek testler)

**Interfaces:**
- Consumes: `valuate`, `replayTrades` (Task 2)
- Produces: `rankScores(entries): { userId: string; scoreUsd: number; rank: number }[]`

- [ ] **Step 1: Failing test yaz**

`src/routes/api/league/tick/server.test.ts` sonuna eklenir:

```ts
import { rankScores } from './+server';

describe('rankScores', () => {
  it('skora göre azalan sıralar, 1'den başlar', () => {
    expect(
      rankScores([
        { userId: 'a', scoreUsd: 1_000_000 },
        { userId: 'b', scoreUsd: 1_200_000 },
        { userId: 'c', scoreUsd: 900_000 },
      ]),
    ).toEqual([
      { userId: 'b', scoreUsd: 1_200_000, rank: 1 },
      { userId: 'a', scoreUsd: 1_000_000, rank: 2 },
      { userId: 'c', scoreUsd: 900_000, rank: 3 },
    ]);
  });

  it('eşit skorlara aynı rank verir, sonraki rank atlanır (standart rekabet sıralaması)', () => {
    expect(
      rankScores([
        { userId: 'a', scoreUsd: 1_000_000 },
        { userId: 'b', scoreUsd: 1_000_000 },
        { userId: 'c', scoreUsd: 900_000 },
      ]),
    ).toEqual([
      { userId: 'a', scoreUsd: 1_000_000, rank: 1 },
      { userId: 'b', scoreUsd: 1_000_000, rank: 1 },
      { userId: 'c', scoreUsd: 900_000, rank: 3 },
    ]);
  });

  it('boş listede boş döner', () => {
    expect(rankScores([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Testi koş, kırmızı olduğunu doğrula**

```bash
npx vitest run src/routes/api/league/tick/server.test.ts
```

Beklenen: FAIL — `rankScores is not a function`.

- [ ] **Step 3: Implementasyon**

`src/routes/api/league/tick/+server.ts` import bloğuna eklenir:

```ts
import { valuate } from '$lib/domain/league/replay';
```

`settleDecision`'dan sonra eklenir:

```ts
export interface ScoreEntry {
  userId: string;
  scoreUsd: number;
}

/** Standart rekabet sıralaması (1,1,3): eşit skorlar aynı rank alır, sonraki rank atlanır. */
export function rankScores(entries: readonly ScoreEntry[]): (ScoreEntry & { rank: number })[] {
  const sorted = [...entries].sort((a, b) => b.scoreUsd - a.scoreUsd);
  const out: (ScoreEntry & { rank: number })[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const rank = i > 0 && sorted[i].scoreUsd === sorted[i - 1].scoreUsd ? out[i - 1].rank : i + 1;
    out.push({ ...sorted[i], rank });
  }
  return out;
}
```

`POST` handler'ında, `return json(...)` satırından ÖNCE kapanış fazı eklenir:

```ts
  // 3) Kilit anı geçmiş ve henüz mühürlenmemiş haftaları kapat. GEÇMİŞ haftalar da taranır:
  //    tick bir süre çalışmazsa (deploy, kesinti) kapanış atlanmaz.
  let closed: string | null = null;
  const { data: due } = await admin
    .from('leagues')
    .select('id, week_key, opens_at')
    .eq('status', 'open')
    .lte('locks_at', at.toISOString())
    .order('locks_at', { ascending: true })
    .limit(1);

  const league = due?.[0];
  if (league) {
    const { data: entries } = await admin
      .from('league_entries')
      .select('user_id')
      .eq('league_id', league.id);
    const { data: allTrades } = await admin
      .from('trades')
      .select('user_id, asset_id, side, units, server_price_usd, server_ts')
      .eq('league_id', league.id)
      .eq('status', 'filled')
      .order('server_ts', { ascending: true });

    const startedAt = Date.parse(league.opens_at as string);
    const tradesByUser = new Map<string, StampedTrade[]>();
    for (const r of allTrades ?? []) {
      const list = tradesByUser.get(r.user_id as string) ?? [];
      list.push({
        assetId: r.asset_id as string,
        side: r.side as 'buy' | 'sell',
        units: Number(r.units),
        priceUsd: Number(r.server_price_usd),
        ts: Date.parse(r.server_ts as string),
      });
      tradesByUser.set(r.user_id as string, list);
    }

    // Kapanış fiyatları SUNUCUDAN çekilir; tüm katılımcıların pozisyonları tek turda.
    const heldAssets = new Set<string>();
    for (const list of tradesByUser.values()) for (const t of list) heldAssets.add(t.assetId);
    const closePrices: Record<string, number> = {};
    if (heldAssets.size > 0) {
      const stamped = await stampPrices(Array.from(heldAssets), fetch, at);
      for (const [id, s] of Object.entries(stamped)) closePrices[id] = s.priceUsd;
    }

    const scores: ScoreEntry[] = (entries ?? []).map((e) => {
      const userId = e.user_id as string;
      const { state, rejected } = replayTrades(tradesByUser.get(userId) ?? [], { userId, startedAt });
      if (rejected.length > 0)
        console.warn(`[api/league/tick] ${league.week_key}/${userId}: ${rejected.length} işlem replay'de reddedildi`);
      const { scoreUsd, complete } = valuate(state, closePrices);
      if (!complete)
        console.warn(`[api/league/tick] ${league.week_key}/${userId}: kapanış fiyatı eksik pozisyon var`);
      return { userId, scoreUsd };
    });

    for (const s of rankScores(scores)) {
      await admin
        .from('league_entries')
        .update({ final_score_usd: s.scoreUsd, rank: s.rank })
        .eq('league_id', league.id)
        .eq('user_id', s.userId);
    }
    await admin
      .from('leagues')
      .update({ status: 'closed', closed_at: at.toISOString() })
      .eq('id', league.id)
      .eq('status', 'open'); // idempotency: eşzamanlı ikinci tick tekrar kapatmaz
    closed = league.week_key as string;
  }
```

`return json({ opened: row.week_key, settled, closed: null });` şununla değiştirilir:

```ts
  return json({ opened: row.week_key, settled, closed });
```

- [ ] **Step 4: Testi koş, yeşil olduğunu doğrula**

```bash
npx vitest run src/routes/api/league/tick/server.test.ts
```

Beklenen: PASS (12 test).

- [ ] **Step 5: Tam süit + commit**

```bash
npm run test && npm run check && npm run build
```

Beklenen: tüm testler yeşil, `svelte-check found 0 errors`, build başarılı.

```bash
git add src/routes/api/league/tick/
git commit -m "feat(api): tick — hafta kapanisi, replay skoru ve rank muhurleme"
```

---

## Task 10: pg_cron + pg_net zamanlaması (0009)

**Files:**
- Create: `supabase/migrations/0009_league_cron.sql`

**Interfaces:**
- Consumes: Task 0'da Vault'a yazılan `league_tick_url` ve `league_cron_secret` sırları; `/api/league/tick` (Task 7-9)
- Produces: `cron.job` içinde `league-tick` adlı 5 dakikalık zamanlama

- [ ] **Step 1: Migration'ı yaz**

`supabase/migrations/0009_league_cron.sql`:

```sql
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
```

- [ ] **Step 2: Lokal olarak uygula**

```bash
npx supabase db reset
```

Beklenen: migration hatasız uygulanır. (Lokal stack'te Vault sırları yoksa `net.http_post` `null` url ile no-op olur — bu beklenen, hata değil.)

- [ ] **Step 3: Zamanlamanın kayıtlı olduğunu doğrula**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select jobname, schedule, active from cron.job where jobname = 'league-tick';"
```

Beklenen: tek satır — `league-tick | */5 * * * * | t`.

- [ ] **Step 4: Endpoint'i sırla elle tetikleyip uçtan uca doğrula**

Dev server açıkken (`npm run dev`):

```bash
curl -s -X POST http://localhost:5173/api/league/tick -H "x-cron-secret: $CRON_SECRET" -H "content-type: application/json" -d '{}'
```

Beklenen: `{"opened":"<bu haftanın pazartesisi>","settled":0,"closed":null}`.

Yanlış sırla:

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5173/api/league/tick -H "x-cron-secret: yanlis" -d '{}'
```

Beklenen: `401`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_league_cron.sql
git commit -m "feat(db): pg_cron + pg_net ile 5 dakikalik lig tick zamanlamasi"
```

---

## Task 11: İstemci lig client'ı

**Files:**
- Create: `src/lib/api/leagueClient.ts`
- Test: `src/lib/api/leagueClient.test.ts`

**Interfaces:**
- Consumes: `/api/trade` (Task 5-6)
- Produces: tip `StampRequest` · `StampResult` · `createTradeStamper(fetchFn, newOrderId): (req: StampRequest) => Promise<StampResult>`

- [ ] **Step 1: Failing test yaz**

`src/lib/api/leagueClient.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createTradeStamper } from './leagueClient';

const okResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('createTradeStamper', () => {
  it('dolan işlemde sunucu fiyatını ve adedini döner', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({ status: 'filled', orderId: 'o1', units: 10, priceUsd: 12.5, serverTs: '2026-07-22T10:00:00.000Z' }),
    );
    const stamp = createTradeStamper(fetchFn as unknown as typeof fetch, () => 'order-0001');
    await expect(stamp({ assetId: 'THYAO', side: 'buy', units: 10 })).resolves.toEqual({
      status: 'filled',
      orderId: 'o1',
      units: 10,
      priceUsd: 12.5,
    });
  });

  it('gövdeye clientOrderId ekler ve POST atar', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ status: 'queued', orderId: 'o2' }));
    const stamp = createTradeStamper(fetchFn as unknown as typeof fetch, () => 'order-0001');
    await stamp({ assetId: 'BTC', side: 'buy', amountUsd: 500 });
    expect(fetchFn).toHaveBeenCalledWith('/api/trade', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assetId: 'BTC', side: 'buy', amountUsd: 500, clientOrderId: 'order-0001' }),
    });
  });

  it('kuyruğa giren emri queued olarak döner', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ status: 'queued', orderId: 'o3' }));
    const stamp = createTradeStamper(fetchFn as unknown as typeof fetch, () => 'order-0001');
    await expect(stamp({ assetId: 'THYAO', side: 'sell', units: 3 })).resolves.toEqual({
      status: 'queued',
      orderId: 'o3',
    });
  });

  it('sunucu hatasını mesajıyla fırlatır', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: 'Yetersiz bakiye' }), { status: 422 }));
    const stamp = createTradeStamper(fetchFn as unknown as typeof fetch, () => 'order-0001');
    await expect(stamp({ assetId: 'BTC', side: 'buy', units: 100 })).rejects.toThrow('Yetersiz bakiye');
  });

  it('ağ hatasında anlaşılır mesaj fırlatır', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    const stamp = createTradeStamper(fetchFn as unknown as typeof fetch, () => 'order-0001');
    await expect(stamp({ assetId: 'BTC', side: 'buy', units: 1 })).rejects.toThrow(
      'Lig işlemi gönderilemedi — bağlantı yok',
    );
  });
});
```

- [ ] **Step 2: Testi koş, kırmızı olduğunu doğrula**

```bash
npx vitest run src/lib/api/leagueClient.test.ts
```

Beklenen: FAIL — `Failed to resolve import "./leagueClient"`.

- [ ] **Step 3: Minimal implementasyon**

`src/lib/api/leagueClient.ts`:

```ts
/** Lig işleminin sunucu damgası — istemci fiyatı ASLA göndermez, sunucununkini uygular. */
export interface StampRequest {
  readonly assetId: string;
  readonly side: 'buy' | 'sell';
  readonly units?: number;
  readonly amountUsd?: number;
}

export type StampResult =
  | { status: 'filled'; orderId: string; units: number; priceUsd: number }
  | { status: 'queued'; orderId: string };

/** `/api/trade` sarmalayıcısı. `newOrderId` idempotency anahtarını üretir (ağ tekrarında
 *  aynı anahtar gönderilirse sunucu çift işlem yaratmaz). */
export function createTradeStamper(
  fetchFn: typeof fetch,
  newOrderId: () => string,
): (req: StampRequest) => Promise<StampResult> {
  return async (req) => {
    // Alan sırası sabit tutulur (test JSON.stringify çıktısına birebir bakar):
    // assetId, side, units|amountUsd, clientOrderId.
    const payload = {
      assetId: req.assetId,
      side: req.side,
      ...(req.units !== undefined ? { units: req.units } : {}),
      ...(req.amountUsd !== undefined ? { amountUsd: req.amountUsd } : {}),
      clientOrderId: newOrderId(),
    };

    let res: Response;
    try {
      res = await fetchFn('/api/trade', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new Error('Lig işlemi gönderilemedi — bağlantı yok');
    }

    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(detail?.message ?? `Lig işlemi reddedildi (${res.status})`);
    }

    const data = (await res.json()) as {
      status: 'filled' | 'queued';
      orderId: string;
      units?: number;
      priceUsd?: number;
    };
    if (data.status === 'filled')
      return { status: 'filled', orderId: data.orderId, units: data.units!, priceUsd: data.priceUsd! };
    return { status: 'queued', orderId: data.orderId };
  };
}
```

- [ ] **Step 4: Testi koş, yeşil olduğunu doğrula**

```bash
npx vitest run src/lib/api/leagueClient.test.ts
```

Beklenen: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/leagueClient.ts src/lib/api/leagueClient.test.ts
git commit -m "feat(league): istemci /api/trade sarmalayicisi — idempotent damga istegi"
```

---

## Task 12: `liveGameStore` lig modu

**Files:**
- Modify: `src/lib/stores/liveGameStore.svelte.ts`
- Test: `src/lib/stores/liveGameStore.test.ts` (ek testler)

**Interfaces:**
- Consumes: tip `StampRequest`/`StampResult` (Task 11)
- Produces: `LiveGameStoreOptions.stampTrade?: (req: StampRequest) => Promise<StampResult>` · `LiveGameStoreOptions.isLeagueActive?: () => boolean` · `LiveGameStore.leagueMode: boolean` · `LiveGameStore.tradeBusy: boolean` · `buy`/`sell`/`buyAmountUsd` artık `Promise<void>` döner

- [ ] **Step 1: Failing test yaz**

`src/lib/stores/liveGameStore.test.ts` sonuna eklenir:

```ts
describe('lig modu (stampTrade)', () => {
  it('lig modunda buy sunucu fiyatını uygular, yerel oracle fiyatını DEĞİL', async () => {
    const stampTrade = vi.fn().mockResolvedValue({ status: 'filled', orderId: 'o1', units: 10, priceUsd: 7 });
    const { store } = setup({ stampTrade });
    expect(store.leagueMode).toBe(true);
    await store.buy('BTC', 10);
    // Fixture'da BTC 60000 USD; lig yolu onu YOK SAYIP sunucu fiyatını (7) uygulamalı.
    expect(store.game.usdBalance.amount).toBe(1_000_000 - 70);
    expect(store.game.holdings).toEqual([
      { assetId: 'BTC', units: 10, avgCost: { amount: 7, currency: 'USD' } },
    ]);
    expect(stampTrade).toHaveBeenCalledWith({ assetId: 'BTC', side: 'buy', units: 10 });
  });

  it('lig modunda sunucu queued dönerse yerel bakiye değişmez, emir kuyruğa yansır', async () => {
    const stampTrade = vi.fn().mockResolvedValue({ status: 'queued', orderId: 'o2' });
    const { store } = setup({ stampTrade });
    await store.buy('BTC', 10);
    expect(store.game.usdBalance.amount).toBe(1_000_000);
    expect(store.pendingOrders).toHaveLength(1);
    expect(store.pendingOrders[0].assetId).toBe('BTC');
    expect(store.pendingOrders[0].id).toBe('o2'); // kuyruk kimliği SUNUCUnun verdiği id
  });

  it('lig modunda sunucu reddederse lastError dolar, state bozulmaz', async () => {
    const stampTrade = vi.fn().mockRejectedValue(new Error('Yetersiz bakiye'));
    const { store } = setup({ stampTrade });
    await store.buy('BTC', 10);
    expect(store.lastError).toBe('Yetersiz bakiye');
    expect(store.game.usdBalance.amount).toBe(1_000_000);
    expect(store.game.holdings).toEqual([]);
  });

  it('stampTrade verilmezse eski (yerel) davranış korunur — store başlatılmadan feed stale, emir kuyruğa girer', async () => {
    const { store } = setup();
    expect(store.leagueMode).toBe(false);
    await store.buy('BTC', 1);
    expect(store.pendingOrders).toHaveLength(1);
  });

  it('isLeagueActive false iken damgalama YAPILMAZ — misafir/antrenman yolu korunur', async () => {
    const stampTrade = vi.fn();
    const { store } = setup({ stampTrade, isLeagueActive: () => false });
    expect(store.leagueMode).toBe(false);
    await store.buy('BTC', 1);
    expect(stampTrade).not.toHaveBeenCalled();
    expect(store.pendingOrders).toHaveLength(1); // yerel kuyruk yolu
  });

  it('lig modunda satım da sunucu fiyatından geçer', async () => {
    const stampTrade = vi
      .fn()
      .mockResolvedValueOnce({ status: 'filled', orderId: 'o1', units: 10, priceUsd: 7 })
      .mockResolvedValueOnce({ status: 'filled', orderId: 'o2', units: 10, priceUsd: 9 });
    const { store } = setup({ stampTrade });
    await store.buy('BTC', 10);
    await store.sell('BTC', 10);
    expect(store.game.usdBalance.amount).toBe(1_000_000 + 20);
    expect(store.game.holdings).toEqual([]);
  });
});
```

> **Not:** `setup(overrides)` bu test dosyasının en başında tanımlı mevcut fixture fabrikasıdır (`{ store, fetchFn, feedStop, ... }` döner) — yeni bir kurulum yazma, onu kullan. Testler `store.start()` ÇAĞIRMAZ: feed `stale` kalır, bu da lig yolunun yerel tazelik kontrolünü tamamen atladığını kanıtlar.

- [ ] **Step 2: Testi koş, kırmızı olduğunu doğrula**

```bash
npx vitest run src/lib/stores/liveGameStore.test.ts
```

Beklenen: FAIL — `store.leagueMode` undefined ve `stampTrade` çağrılmıyor.

- [ ] **Step 3: Implementasyon**

`src/lib/stores/liveGameStore.svelte.ts` import bloğuna eklenir:

```ts
import type { StampRequest, StampResult } from '../api/leagueClient';
```

`LiveGameStoreOptions` arayüzüne eklenir:

```ts
  /** Verilirse LİG MODU mümkün olur: buy/sell yerel fiyatla değil, sunucunun damgaladığı
   *  fiyatla uygulanır. Verilmezse mevcut (yerel/anlık) davranış aynen korunur. */
  stampTrade?: (req: StampRequest) => Promise<StampResult>;
  /** Lig modunun O ANDA açık olup olmadığı — her okumada çağrılır (reaktif).
   *  Sayfa store'u SENKRON kuruyor (`+page.svelte:97`), lige katılım ise ASENKRON
   *  yükleniyor; bu yüzden mod kuruluş anında sabitlenemez, çağrı anında sorulur.
   *  Verilmezse `stampTrade` varlığı tek başına yeterlidir (testler için). */
  isLeagueActive?: () => boolean;
```

`LiveGameStore` arayüzünde `buy`/`sell`/`buyAmountUsd` imzaları güncellenir ve iki alan eklenir:

```ts
  buy(assetId: string, units: number): Promise<void>;
  sell(assetId: string, units: number): Promise<void>;
  buyAmountUsd(assetId: string, amountUsd: Money): Promise<void>;
  /** Lig modu açık mı — UI "işlem sunucuya gidiyor" durumunu bundan bilir. */
  readonly leagueMode: boolean;
  /** Uçuşta bir lig işlemi var mı — UI butonları bununla kilitler (çift gönderim önleme). */
  readonly tradeBusy: boolean;
```

`createLiveGameStore` gövdesinde, `let orderNotice = ...` satırından sonra eklenir:

```ts
  const stampTrade = opts.stampTrade;
  // $derived: sayfa lige katılımı asenkron yüklüyor — mod kuruluş anında sabitlenemez.
  const leagueMode = $derived(stampTrade !== undefined && (opts.isLeagueActive?.() ?? true));
  let tradeBusy = $state(false);
```

`buy`/`sell`/`buyAmountUsdAction` şunlarla DEĞİŞTİRİLİR:

```ts
  /** Lig modunda tek işlem yolu: sunucuya damgalat → dönen fiyatla uygula.
   *  Sunucu 'queued' derse yerel kuyruğa aynı emri yansıtırız (UI'da "bekliyor" görünür);
   *  dolum sunucuda gerçekleşir, yerel settle bu emirlere DOKUNMAZ (bkz. settlePendingOrders). */
  async function stampAndApply(
    req: StampRequest,
    mkOrder: (orderId: string) => PendingOrder,
    applyFilled: (units: number, priceUsd: number) => GameState,
  ): Promise<void> {
    if (tradeBusy) return; // çift tık koruması
    tradeBusy = true;
    try {
      const result = await stampTrade!(req);
      if (result.status === 'queued') {
        pendingOrders = [...pendingOrders, mkOrder(result.orderId)];
        lastError = null;
        persist();
        return;
      }
      apply(() => applyFilled(result.units, result.priceUsd), opts.onFirstTrade);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    } finally {
      tradeBusy = false;
    }
  }

  /** Sunucunun damgaladığı fiyatı zorlayan tek-atımlık oracle. */
  function stampedOracle(priceUsd: number): UsdPriceOracle {
    return { assetUsd: () => usd(priceUsd) };
  }

  const buy = async (assetId: string, units: number): Promise<void> => {
    if (leagueMode) {
      await stampAndApply(
        { assetId, side: 'buy', units },
        (orderId) => ({ id: orderId, assetId, side: 'buy', kind: 'units', units, placedAt: now() }),
        (u, p) => buyAsset(game, stampedOracle(p), assetId, u),
      );
      return;
    }
    if (tradeMode(assetId) === 'queued') {
      enqueueOrder({ id: nextOrderId(), assetId, side: 'buy', kind: 'units', units, placedAt: now() });
      return;
    }
    apply(() => buyAsset(game, oracle, assetId, units), opts.onFirstTrade);
  };

  const sell = async (assetId: string, units: number): Promise<void> => {
    if (leagueMode) {
      await stampAndApply(
        { assetId, side: 'sell', units },
        (orderId) => ({ id: orderId, assetId, side: 'sell', kind: 'units', units, placedAt: now() }),
        (u, p) => sellAsset(game, stampedOracle(p), assetId, u),
      );
      return;
    }
    if (tradeMode(assetId) === 'queued') {
      enqueueOrder({ id: nextOrderId(), assetId, side: 'sell', kind: 'units', units, placedAt: now() });
      return;
    }
    apply(() => sellAsset(game, oracle, assetId, units), opts.onFirstTrade);
  };

  const buyAmountUsdAction = async (assetId: string, amountUsd: Money): Promise<void> => {
    if (leagueMode) {
      await stampAndApply(
        { assetId, side: 'buy', amountUsd: amountUsd.amount },
        (orderId) => ({ id: orderId, assetId, side: 'buy', kind: 'amountUsd', amountUsd, placedAt: now() }),
        (u, p) => buyAsset(game, stampedOracle(p), assetId, u),
      );
      return;
    }
    if (tradeMode(assetId) === 'queued') {
      enqueueOrder({ id: nextOrderId(), assetId, side: 'buy', kind: 'amountUsd', amountUsd, placedAt: now() });
      return;
    }
    apply(() => {
      const price = assetUsdPrice(assetId);
      if (price === undefined) throw new Error(`No live price: ${assetId}`);
      const draft: PendingOrder = { id: '', assetId, side: 'buy', kind: 'amountUsd', amountUsd, placedAt: now() };
      const units = resolveUnits(draft, price);
      return buyAsset(game, oracle, assetId, units);
    }, opts.onFirstTrade);
  };
```

`settlePendingOrders` fonksiyonunun başına eklenir (lig emirlerinin sahibi sunucudur):

```ts
    // LİG MODU: kuyruğun sahibi sunucudur (tick settle eder). Yerel settle çalışırsa
    // aynı emir hem burada hem sunucuda dolar — çift işlem. Bu yüzden tamamen devre dışı.
    if (leagueMode) return;
```

Döndürülen store nesnesine eklenir:

```ts
    get leagueMode() {
      return leagueMode;
    },
    get tradeBusy() {
      return tradeBusy;
    },
```

- [ ] **Step 4: Testi koş, yeşil olduğunu doğrula**

```bash
npx vitest run src/lib/stores/liveGameStore.test.ts
```

Beklenen: PASS — yeni 6 test dahil, dosyadaki mevcut testler de yeşil (async'e dönen `buy`/`sell` çağrılarında `await` eklenmesi gerekebilir; gerekiyorsa mevcut testlere `await` ekle, beklentileri DEĞİŞTİRME).

- [ ] **Step 5: Tip kontrolü + commit**

```bash
npm run check
```

Beklenen: 0 hata. (`+page.svelte` ve `TradeForm.svelte`'de `store.buy(...)` çağrıları artık Promise dönüyor — `void store.buy(...)` ile işaretlenmesi gerekebilir; svelte-check bunu yüzeyler.)

```bash
git add src/lib/stores/liveGameStore.svelte.ts src/lib/stores/liveGameStore.test.ts
git commit -m "feat(league): liveGameStore lig modu — sunucu damgali fiyatla islem"
```

---

## Task 13: Pazartesi reset (hafta değişimi)

**Files:**
- Modify: `src/lib/stores/liveGameStore.svelte.ts`
- Test: `src/lib/stores/liveGameStore.test.ts` (ek testler)

**Interfaces:**
- Consumes: `leagueWeekKey` (Task 1), `createGameState`/`STARTING_USD` (`src/lib/stores/gameState.ts`)
- Produces: `LiveGameStore.leagueWeekKey: string` · `LiveGameStoreOptions.onWeekRollover?: (prev: string, next: string) => void`

- [ ] **Step 1: Failing test yaz**

`src/lib/stores/liveGameStore.test.ts` sonuna eklenir:

```ts
describe('haftalık reset', () => {
  // FIXED_NOW (2026-06-01 12:00 TSİ) pazartesidir; bu blok kendi mutable saatini kurar.
  const WEDNESDAY = new Date('2026-06-03T12:00:00+03:00').getTime();
  const NEXT_MONDAY = new Date('2026-06-08T08:00:00+03:00').getTime();

  it('hafta değişince oyunu $1M\'a döndürür ve kuyruğu temizler', async () => {
    let clock = WEDNESDAY;
    const { store } = setup({ now: () => clock });
    expect(store.leagueWeekKey).toBe('2026-06-01');

    // Store başlatılmadığı için feed stale → emir kuyruğa girer (deterministik durum).
    await store.buy('BTC', 1);
    expect(store.pendingOrders).toHaveLength(1);

    clock = NEXT_MONDAY;
    store.tickWeek();

    expect(store.leagueWeekKey).toBe('2026-06-08');
    expect(store.game.usdBalance.amount).toBe(1_000_000);
    expect(store.game.holdings).toEqual([]);
    expect(store.pendingOrders).toEqual([]);
    expect(store.game.createdAt).toBe(NEXT_MONDAY); // yeni jenerasyon damgası
  });

  it('aynı hafta içinde tickWeek state\'e dokunmaz', () => {
    const { store } = setup({ now: () => WEDNESDAY });
    const before = store.game;
    store.tickWeek();
    expect(store.game).toBe(before);
    expect(store.leagueWeekKey).toBe('2026-06-01');
  });

  it('hafta dönüşünde onWeekRollover çağrılır', () => {
    let clock = WEDNESDAY;
    const onWeekRollover = vi.fn();
    const { store } = setup({ now: () => clock, onWeekRollover });
    clock = NEXT_MONDAY;
    store.tickWeek();
    expect(onWeekRollover).toHaveBeenCalledWith('2026-06-01', '2026-06-08');
  });
});
```

- [ ] **Step 2: Testi koş, kırmızı olduğunu doğrula**

```bash
npx vitest run src/lib/stores/liveGameStore.test.ts
```

Beklenen: FAIL — `store.tickWeek is not a function`.

- [ ] **Step 3: Implementasyon**

`src/lib/stores/liveGameStore.svelte.ts` import bloğuna eklenir:

```ts
import { leagueWeekKey as computeWeekKey } from '../domain/league/week';
```

`LiveGameStoreOptions` arayüzüne eklenir:

```ts
  /** Hafta döndüğünde (pazartesi 00:00 TSİ) çağrılır — sayfa bulut kaydını/arşivi buradan tazeler. */
  onWeekRollover?: (prev: string, next: string) => void;
```

`LiveGameStore` arayüzüne eklenir:

```ts
  /** İçinde bulunulan lig haftasının kimliği ('YYYY-MM-DD', pazartesi). */
  readonly leagueWeekKey: string;
  /** Hafta sınırını kontrol eder; geçildiyse oyunu $1M'a döndürür. start() saniyede bir çağırır. */
  tickWeek(): void;
```

`createLiveGameStore` gövdesinde, `let tradeBusy = $state(false);` satırından sonra eklenir:

```ts
  let weekKey = $state(computeWeekKey(new Date(now())));
```

`settlePendingOrders`'dan sonra eklenir:

```ts
  /** Haftalık lig reset'i: pazartesi 00:00 TSİ'de herkes $1M'a döner (spec kararı — CANLI
   *  SEANS = lig, ayrı slot yok). Bekleyen emirler de silinir: geçen haftanın kuyruğu yeni
   *  haftaya taşınırsa oyuncu hiç vermediği bir emirle karşılaşır. */
  function tickWeek(): void {
    const next = computeWeekKey(new Date(now()));
    if (next === weekKey) return;
    const prev = weekKey;
    weekKey = next;
    game = createGameState('canli', seed, playerId, now());
    pendingOrders = [];
    history = [];
    orderNotice = `Yeni lig haftası başladı — herkes $1.000.000 ile eşit başlıyor.`;
    lastError = null;
    persist();
    try {
      opts.onWeekRollover?.(prev, next);
    } catch {
      /* sayfa tarafı best-effort — oyunu bozmaz */
    }
  }
```

`start()` içindeki saniyelik `setInterval` gövdesine (`nowMsTick = now();` satırının yanına) eklenir:

```ts
      tickWeek();
```

Döndürülen store nesnesine eklenir:

```ts
    get leagueWeekKey() {
      return weekKey;
    },
    tickWeek,
```

- [ ] **Step 4: Testi koş, yeşil olduğunu doğrula**

```bash
npx vitest run src/lib/stores/liveGameStore.test.ts
```

Beklenen: PASS (yeni 3 test dahil).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/liveGameStore.svelte.ts src/lib/stores/liveGameStore.test.ts
git commit -m "feat(league): pazartesi 00:00 TSI haftalik reset — oyun $1M'a doner"
```

---

## Task 14: Sayfa kablolaması ve "LİGE KATIL" kapısı

**Files:**
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `createTradeStamper` (Task 11), `leagueMode`/`onWeekRollover` (Task 12-13), `locals.supabase` üzerinden `league_entries` (Task 3)
- Produces: sayfada `joinLeague()` aksiyonu + lig durum rozeti

- [ ] **Step 1: Lig katılım yardımcılarını ekle**

`src/routes/+page.svelte`'de `<script>` bloğuna eklenir (mevcut supabase client import kalıbını aynen kullan):

```ts
  import { createTradeStamper } from '$lib/api/leagueClient';
  import { leagueWeekKey } from '$lib/domain/league/week';

  let leagueEntry = $state<{ leagueId: string } | null>(null);
  let leagueJoining = $state(false);
  let leagueError = $state<string | null>(null);

  /** Bu haftanın açık ligini ve kullanıcının katılım kaydını okur. Misafir hesapta
   *  entry OLUŞTURULAMAZ (RLS is_anonymous kuralı) — UI da bunu göstermelidir. */
  async function loadLeagueEntry(): Promise<void> {
    const { data: { user } } = await data.supabase.auth.getUser();
    if (!user || user.is_anonymous === true) {
      leagueEntry = null;
      return;
    }
    const weekKey = leagueWeekKey(new Date());
    const { data: league } = await data.supabase
      .from('leagues')
      .select('id')
      .eq('week_key', weekKey)
      .eq('status', 'open')
      .maybeSingle();
    if (!league) {
      leagueEntry = null;
      return;
    }
    const { data: entry } = await data.supabase
      .from('league_entries')
      .select('league_id')
      .eq('league_id', league.id)
      .eq('user_id', user.id)
      .maybeSingle();
    leagueEntry = entry ? { leagueId: league.id } : null;
  }

  async function joinLeague(): Promise<void> {
    leagueJoining = true;
    leagueError = null;
    try {
      const { data: { user } } = await data.supabase.auth.getUser();
      if (!user || user.is_anonymous === true) {
        leagueError = 'Lige katılmak için kayıtlı hesap gerekli.';
        return;
      }
      const weekKey = leagueWeekKey(new Date());
      const { data: league } = await data.supabase
        .from('leagues')
        .select('id')
        .eq('week_key', weekKey)
        .eq('status', 'open')
        .maybeSingle();
      if (!league) {
        leagueError = 'Bu haftanın ligi henüz açılmadı.';
        return;
      }
      const { error: joinError } = await data.supabase
        .from('league_entries')
        .insert({ league_id: league.id, user_id: user.id });
      // 23505 = zaten katılmış; hata değil.
      if (joinError && joinError.code !== '23505') {
        leagueError = 'Lige katılınamadı.';
        return;
      }
      leagueEntry = { leagueId: league.id };
    } finally {
      leagueJoining = false;
    }
  }
```

- [ ] **Step 2: Store'u lig moduyla kur**

`makeStore()` içindeki `createLiveGameStore({...})` çağrısına eklenir (mevcut seçenekler korunarak):

```ts
			stampTrade: createTradeStamper(fetch, () => crypto.randomUUID()),
			// Store SENKRON kuruluyor (satır 97) ama katılım ASENKRON yükleniyor —
			// bu yüzden mod her işlemde sorulur, kuruluşta sabitlenmez.
			isLeagueActive: () => leagueEntry !== null,
			onWeekRollover: () => {
				void loadLeagueEntry();
			},
```

Ayrıca mevcut boot `$effect`/onMount bloğuna (oturum okunduktan sonra) eklenir:

```ts
		void loadLeagueEntry();
```

> **Not:** `stampTrade` KOŞULSUZ verilir; lig modunu belirleyen tek şey `isLeagueActive`'dir. Böylece store'u yeniden kurmaya (ve oyun state'ini kaybetmeye) gerek kalmaz — kullanıcı "LİGE KATIL"a bastığı anda `leagueEntry` dolar ve bir sonraki işlem damgalı yoldan gider.

- [ ] **Step 3: Lig rozetini ve katıl butonunu ekle**

Net servet panelinin yakınına eklenir:

```svelte
{#if store.leagueMode}
  <div class="text-xs font-mono text-term-info">
    LİG HAFTASI {store.leagueWeekKey} — işlemler sunucuda damgalanıyor
  </div>
{:else}
  <button
    class="text-xs font-mono text-term-warn underline disabled:opacity-50"
    disabled={leagueJoining}
    onclick={() => void joinLeague()}
  >
    {leagueJoining ? 'KATILINIYOR…' : 'LİGE KATIL'}
  </button>
  {#if leagueError}
    <div class="text-xs font-mono text-term-down">{leagueError}</div>
  {/if}
{/if}
```

- [ ] **Step 4: Tip kontrolü + build**

```bash
npm run check && npm run build
```

Beklenen: 0 hata, build başarılı.

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(league): sayfa kablolamasi — LIGE KATIL kapisi + lig modu rozeti"
```

---

## Task 15: E2E — lig işlemi damgalanıyor

**Files:**
- Create: `tests/e2e/league-trade.spec.ts`

**Interfaces:**
- Consumes: `mockMarketData`/`waitForLivePrice` (`tests/e2e/helpers/market-mocks.ts`), `stubTurnstile` (`tests/e2e/helpers/turnstile-stub.ts`)

- [ ] **Step 1: Failing E2E senaryosunu yaz**

`tests/e2e/league-trade.spec.ts` (kayıt + AL zinciri `signout-persistence.spec.ts`'ten birebir kopyalanan, doğrulanmış kalıptır):

```ts
import { test, expect } from '@playwright/test';
import { mockMarketData, waitForLivePrice } from './helpers/market-mocks';
import { stubTurnstile } from './helpers/turnstile-stub';

const PASSWORD = 'e2e-Sifre-123';

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

test.beforeEach(async ({ page }) => {
  await mockMarketData(page);
  await stubTurnstile(page);
});

// Lig yolu iki iddiayı doğrular: (1) kayıtlı kullanıcı lige katılabiliyor,
// (2) katıldıktan sonra AL isteği /api/trade'e gidiyor (fiyat sunucuda damgalanıyor).
test('lige katılan kullanıcının işlemi /api/trade üzerinden damgalanır', async ({ page }) => {
  test.setTimeout(45_000);

  // 1) Hafta satırını aç — prod'da cron yapar, testte endpoint elle tetiklenir.
  const tick = await page.request.post('/api/league/tick', {
    headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
    data: {},
  });
  expect(tick.ok()).toBeTruthy();

  // 2) Kayıt (yerel stack'te enable_confirmations=false → anında oturum).
  await page.goto('/');
  await page.getByRole('button', { name: 'E-POSTA İLE GİRİŞ / KAYIT' }).click();
  await page.getByRole('button', { name: 'Kayıt', exact: true }).click();
  await page.getByPlaceholder('e-posta').fill(uniqueEmail('league'));
  await page.getByPlaceholder('şifre (en az 8 karakter)').fill(PASSWORD);
  await page.getByRole('button', { name: 'KAYIT OL' }).click();
  await expect(page.getByRole('button', { name: 'Günün Kartı' })).toBeVisible();

  // 3) Lige katıl → store lig moduna geçer (rozet görünür).
  await page.getByRole('button', { name: 'LİGE KATIL' }).click();
  await expect(page.getByText(/LİG HAFTASI/)).toBeVisible({ timeout: 15_000 });

  // 4) BTC 1 adet AL (BTC 7/24 açık — market-saat flake'i yok).
  await page.getByText('Bitcoin').first().click();
  await waitForLivePrice(page, 'BTC');
  await page.locator('#trade-units-BTC').fill('1');

  const tradeRequest = page.waitForRequest(
    (req) => req.url().includes('/api/trade') && req.method() === 'POST',
  );
  // AccountPanel'de de "AL" var — #trade-panel'e scope zorunlu.
  await page.locator('#trade-panel').getByRole('button', { name: 'AL', exact: true }).click();

  const body = (await tradeRequest).postDataJSON() as Record<string, unknown>;
  expect(body.assetId).toBe('BTC');
  expect(body.side).toBe('buy');
  expect(body.units).toBe(1);
  expect(body.clientOrderId).toBeTruthy();
  // İstemci FİYAT GÖNDERMEZ — hile korumasının gözlemlenebilir kanıtı.
  expect(body.priceUsd).toBeUndefined();
});
```

> **Not:** `playwright.config.ts` `workers: 1` kullanır (paylaşımlı dev server + Supabase). Bu test `CRON_SECRET` ortam değişkenini ister — `.env.local`'de tanımlı olmalı, yoksa tick 401 döner ve test ilk adımda kırılır.

- [ ] **Step 2: E2E'yi koş, kırmızı olduğunu doğrula**

```bash
npm run e2e -- league-trade
```

Beklenen: FAIL — "LİGE KATIL" butonu bulunamıyor (Task 14 uygulanmadıysa) ya da `/api/trade` isteği gelmiyor.

- [ ] **Step 3: Gerekli düzeltmeleri yap**

Task 14'ün UI metinleri ile testin locator'ları arasındaki farkları gider. Kod değişikliği gerekiyorsa `+page.svelte`'de yap, testte beklentiyi gevşetme.

- [ ] **Step 4: E2E'yi koş, yeşil olduğunu doğrula**

```bash
npm run e2e
```

Beklenen: tüm senaryolar (mevcut 15 + yeni 1) yeşil.

- [ ] **Step 5: Tam doğrulama + commit**

```bash
npm run test && npm run check && npm run build
```

Beklenen: hepsi yeşil.

```bash
git add tests/e2e/league-trade.spec.ts
git commit -m "test(e2e): lig islemi /api/trade uzerinden damgalaniyor"
```

---

## Kapanış Kontrol Listesi

- [ ] `npm run test` — tüm unit/server testleri yeşil
- [ ] `npm run check` — 0 hata
- [ ] `npm run build` — başarılı
- [ ] `npm run e2e` — tüm senaryolar yeşil
- [ ] Supabase `get_advisors` (security) — yeni tablolarda ERROR yok
- [ ] Prod: Vercel env `CRON_SECRET` girildi; Supabase Vault'ta `league_tick_url` + `league_cron_secret` var
- [ ] Prod: migration 0008 + 0009 uygulandı (`npx supabase db push`), `cron.job` tablosunda `league-tick` aktif
- [ ] Prod: `/api/league/tick` bir kez elle tetiklenip `{opened: "<pazartesi>"}` döndüğü doğrulandı
- [ ] `memory.md` §6 ve `CHANGELOG.md` güncellendi

## SP2a Kapsamı DIŞINDA (SP2b'ye bırakıldı)

Bunlar bilinçli olarak bu planda YOK — lig çekirdeği onlarsız da uçtan uca çalışır ve doğrulanabilir:

- Leaderboard arayüzü (sıralama tablosu, takma adlarla)
- Hafta geri sayımı ve "kilitlendi" durum ekranı
- Geçen haftanın sonucunun arşivlenip oyuncuya gösterilmesi (Task 13 reset'i bugün sessizce siliyor)
- Paylaşım kartı verisi ve "mahkeme beratı" metni
- 30 gün hareketsiz anonim hesap temizliği
- Takma ad küfür filtresi (`validateNickname` bugün yalnız biçim doğruluyor)
- `/api/trade` için Turnstile
