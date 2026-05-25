# Sprint 1 — Domain Katmanı Tasarımı

**Tarih:** 2026-05-25  
**Kapsam:** Clock, FX Engine, Deposit, Portfolio Store, Persistence  
**Dışarıda kalan:** BIST, Emlak, Tech Agent, Tarihsel modlar (2001/2018)

---

## 1. Mimari Karar

**Yaklaşım: Düz modüller + tek game store**

- Domain modülleri saf fonksiyon kütüphaneleri — state tutmaz, UI'dan bağımsız, TDD ile test edilir
- Tüm oyun state'i tek `GameState` objesinde yaşar (`src/lib/stores/game.ts`)
- Sistemler arası iletişim sadece store üzerinden (CLAUDE.md kuralı)
- Persistence adapter ayrı dosyada — localStorage şimdi, Firestore/Supabase sonra

---

## 2. Oyun Modları

| Mod | Süre | FX Kaynağı | Not |
|-----|------|------------|-----|
| VASİYET SEFERİ | 365 gün | Canlı | Bürokrasi ağır, mahkeme/tapu mekanikleri tam |
| CANLI SEANS | 90 gün | Canlı | Hızlı tempo |
| 2001 KRİZİ | 30 gün | 2001 arşivi | Sprint 1 dışı — sonraki sprint |
| 2018 KUR ŞOKU | 45 gün | 2018 arşivi | Sprint 1 dışı — sonraki sprint |

Sprint 1'de sadece canlı FX ile gidilir. Tarihsel arşiv verisi ayrı sprint.

---

## 3. State Yapısı

```ts
// src/lib/stores/game.ts

type GameMode = 'vasiyet' | 'canli' | 'kriz2001' | 'kur2018'
type ClockSpeed = 'realtime' | 'turn'

interface GameClock {
  day: number        // 1'den başlar
  totalDays: number  // mode'a göre: 365 / 90 / 30 / 45
  speed: ClockSpeed  // realtime = 1s/gün, turn = manuel
  paused: boolean
}

interface GameState {
  playerId: string   // UUID — ileride Firebase/Supabase UID'e map edilir
  mode: GameMode
  clock: GameClock
  usdBalance: Money
  tryBalance: Money
  deposits: Deposit[]
  createdAt: number  // Unix timestamp — Firestore uyumlu
  updatedAt: number
}
```

**Tasarım kararı:** Circular ref yok, fonksiyon yok, Date objesi yok. `JSON.stringify` ile localStorage'a gider, ileride Firestore'a direkt yazılabilir. Bulut geçişinde sadece persistence adapter değişir, state yapısı değişmez.

---

## 4. Clock (`src/lib/domain/time/clock.ts`)

**Sorumluluk:** Gün sayacını yönetir, mod bazlı toplam gün limitini bilir.

```ts
function createClock(mode: GameMode): GameClock
function advanceDay(clock: GameClock): GameClock
function pause(clock: GameClock): GameClock
function resume(clock: GameClock): GameClock
function isFinished(clock: GameClock): boolean
function getModeTotalDays(mode: GameMode): number
// vasiyet: 365, canli: 90, kriz2001: 30, kur2018: 45
```

**Clock tick mekanizması:** Store dışında, `src/lib/stores/game.ts` içinde yönetilir.
- `realtime`: `setInterval(1000)` → `advanceDay` çağırır
- `turn`: kullanıcı aksiyonu → `advanceDay` çağırır

**Test:** Her fonksiyon saf — input/output test edilebilir, timer mock gerektirmez.

---

## 5. FX Engine (`src/lib/domain/fx/engine.ts`)

**Sorumluluk:** Güncel USD/TRY kurunu sağlar. Mod bazlı kaynak seçimi yapar.

```ts
async function getCurrentRate(mode: GameMode, day: number): Promise<number>
```

- `vasiyet` ve `canli`: `/api/yahoo` proxy'den çeker (5s server cache)
- `kriz2001`, `kur2018`: ilgili arşivden lineer interpolasyon (Sprint 1 dışı)
- Fallback: network hatasında son bilinen kuru döner (başlangıç değeri: ₺32.00), oyun kilitlenmez
- Rate store'da cache'lenir — fetch yavaş olsa bile gameplay bloklanmaz

**Bağımlılık:** `src/lib/api/yahoo.ts` — FX engine bunu çağırır, direkt fetch yapmaz.

---

## 6. Deposit (`src/lib/domain/deposit/deposit.ts`)

**Sorumluluk:** Vadeli mevduat açma, kapatma, faiz hesaplama.

```ts
interface Deposit {
  id: string
  principal: Money        // TRY cinsinden
  termDays: 30 | 90 | 180 // 1 / 3 / 6 ay
  openedDay: number
  annualRate: number      // Sprint 1'de sabit %42 yıllık (2024 TCMB başlangıç faizi)
}

function openDeposit(principal: Money, termDays: 30|90|180, currentDay: number, rate: number): Deposit
function closeDeposit(deposit: Deposit, currentDay: number): Money
// Erken çıkış: sadece principal döner, faiz sıfır
// Vadesi dolmuş: principal + net faiz (stopaj kesilmiş)

function calculateGrossInterest(deposit: Deposit, currentDay: number): Money
function calculateNetInterest(deposit: Deposit, currentDay: number): Money
// Net = Gross * (1 - 0.075)  — %7.5 stopaj
```

**Basit model:** Sprint 1'de sabit rate, kısmi çekim yok. Detaylar sonraki sprint.

---

## 7. Persistence (`src/lib/stores/persistence.ts`)

**Sorumluluk:** GameState serialize/deserialize. Tek adapter dosyası.

```ts
const STORAGE_KEY = 'miras-game-state'

function save(state: GameState): void
function load(): GameState | null
function clear(): void
```

- Şimdi: `localStorage.setItem / getItem`
- Sonra: bu dosyayı Firestore/Supabase adapter ile değiştir — başka hiçbir dosya değişmez

---

## 8. Test Planı

| Modül | Test Dosyası | Kapsam |
|-------|-------------|--------|
| clock.ts | clock.test.ts | createClock, advanceDay, isFinished |
| deposit.ts | deposit.test.ts | faiz hesabı, stopaj, erken çıkış |
| persistence.ts | persistence.test.ts | save/load round-trip |
| fx/engine.ts | engine.test.ts | mock fetch ile rate dönüşü, fallback |

Balance simülasyonu (`tests/balance/`) Sprint 1 dışı — domain tamamlandıkça eklenir.

---

## 9. Dosya Yapısı

```
src/lib/domain/
  time/
    clock.ts
    clock.test.ts
  fx/
    engine.ts
    engine.test.ts
  deposit/
    deposit.ts
    deposit.test.ts
src/lib/stores/
  game.ts          — GameState + Svelte store
  persistence.ts   — localStorage adapter
src/lib/api/
  yahoo.ts         — mevcut, FX engine buradan çeker
```

---

## 10. Sprint 1 Dışında Kalan (Sonraki Sprint)

- Tarihsel arşiv verisi (2001, 2018)
- BIST hisse sistemi
- Emlak + tapu mekaniği
- Tech Agent
- UI katmanı (mahkeme onboarding, route akışı)
- Bulut persistence (Firebase/Supabase)
