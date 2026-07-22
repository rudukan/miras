# Miras Oyunu

Türkiye'nin 2025 makro koşullarında 1M USD mirası 365 günde işletme finansal simülasyonu.
Detaylı proje hafızası için `memory.md` (güncel durum, son oturum özeti — küçük tutulur). Aylık değişiklik geçmişi için `CHANGELOG.md` (yalnız geçmiş sorulunca okunur). Sprint planı için `.claude/plans/` dizinine bak.

## Tech Stack
SvelteKit 2 + Svelte 5 + TypeScript (strict) + Vite + Tailwind CSS 3.
Auth/DB: **Supabase CANLI** (SP1 + SP1.5): `@supabase/ssr` (hooks'ta `ws` transport'lu client → `locals.supabase`), anonim misafir + Google OAuth + e-posta/şifre girişi, RLS'li `profiles`/`saves` tabloları (migrations 0001-0003 canlıda). Auth rotaları: `/auth/callback` (OAuth code takası), `/auth/confirm` (e-posta doğrulama + şifre kurtarma). Kural: yeni server-side client YARATMA — hep `locals.supabase`.
Test: Vitest (unit/domain + server rotaları) + Playwright (E2E, KURULU — bkz. Test Disiplini).

## Dizin Haritası
```
src/lib/domain/    — Saf TS, UI'sız, test edilebilir iş mantığı (her sistem ayrı modül)
src/lib/stores/    — Svelte stores (sistemler arası iletişim buradan)
src/lib/components/— Svelte component'lar (panels/, chart/, ui/)
src/lib/api/       — Dış API client'ları (yahoo.ts, binance.ts)
src/lib/audio/     — Web Audio sentezleyici
src/lib/data/      — Statik makro veri (macro2025.ts)
src/routes/        — Sayfalar + API endpoint'leri (/api/yahoo, /api/crypto)
legacy/            — v3.1.0 referans (build'den hariç, silinmeyecek)
```

## Kod Konvansiyonları
- **Para**: `number` kullanma. `src/lib/domain/money.ts` → `Money` tipi + `usd()`, `tryM()` helpers.
- **Domain logic**: UI'dan tamamen bağımsız. Her domain modülü tek sorumlu. TDD zorunlu.
- **Svelte**: Svelte 5 runes kullan (`$state`, `$derived`, `$effect`, `$props`). `$derived` re-render minimize eder.
- **Component boyutu**: Max ~200 satır. Geçerse parçala.
- **Identifier'lar**: İngilizce. UI metinleri: Türkçe.
- **Renkler**: `tailwind.config.ts`'deki `term.*` token'larını kullan. Hard-coded renk (#hex) yazma.
- **Font**: `font-mono` class → JetBrains Mono.
- **Fiyat update'leri**: `$derived` veya `requestAnimationFrame`. `setInterval` + DOM manipulation yasak.

## Sistem Sınırları
- Sistemler arası iletişim **sadece** `src/lib/stores/` üzerinden.
- API çağrıları **sadece** `src/lib/api/` altında.
- Her `src/lib/domain/<sistem>/` klasörü sadece `money.ts` + kendi type'larına bağımlı.

## Test Disiplini
- Domain unit: Vitest, `*.test.ts` domain dosyasının yanı başında. **Mevcut ve sağlam** — güncel sayı için `npm run test` (buraya sabit sayı yazma, drift ediyor).
- Balance simülasyon: `tests/balance/` — **Mevcut**: 1000-seed simülasyon (`winnability.test.ts`), 4 strateji; dengeli strateji %30-70 kazanılabilirlik bandını doğruluyor. Aggressive strateji kalibrasyonu backlog'da (test dosyasındaki nota bak).
- E2E: `tests/e2e/` — Playwright, **KURULU ve CI'da bloklayıcı**. 15 senaryo: çekirdek yolculuk (offline giriş → al/sat → reload kalıcılığı) + e-posta auth tam gidiş-dönüşü (kayıt/giriş/reset — lokal Mailpit inbox'ı) + misafir/offline yolları + grafik overlay smoke (popover → BÜYÜT → dialog/Escape) + çıkışta bulut kalıcılığı (signout-persistence: gerçek DB satırı okuması) + kapalı piyasada bekleyen emir smoke (AL/SAT asla disabled değil, `pending-order.spec.ts`). Lokal koşu: Docker Desktop + `npx supabase start` + `npm run e2e`. Piyasa verisi tam mock (route + routeWebSocket, RegExp matcher — glob string'ler Vite dev'de aynı önekli kaynak dosyalarıyla çakışıyordu); Supabase lokal stack gerçek. `playwright.config.ts`'te **`workers: 1`** — tek paylaşımlı dev server + tek paylaşımlı lokal Supabase paralel worker'larla gerçek flake üretti (izole edilmemiş ortak backend). Seans sonu E2E'de YOK (canlı modda zaman gerçek akar — clock seam ayrı dilim).
- CI: `.github/workflows/ci.yml` — main push + PR'da iki paralel job: `test` (`npm ci` → `test` → `check` → `build`) ve `e2e` (lokal Supabase + Playwright chromium, bloklayıcı).
- **`verification-before-completion` skill**: "tamam" demeden önce `npm run test` + `npm run build` geçmeli.
- Sprint/plan kapanışında bu bölümü gerçek durumla senkronla — CLAUDE.md her oturuma yüklenir, yanlış bilgi hafızasızlıktan pahalıdır.

## Subagent'lar
9 departman `.claude/agents/` altında, her biri model: sonnet.
Delegasyon için `subagent-driven-development` ve `dispatching-parallel-agents` skill'lerini kullan.

## İş Triyajı (model ekonomisi)
Her oturumun İLK yanıtında gelen işi sınıflandır ve sınıfı AÇIKÇA söyle:
- **Küçük** (≤3 dosya, mevcut kalıbın tekrarı, mimari/UX kararı yok — ör. metin/stil değişikliği, satır silme, küçük prop, bariz fix): spec/plan AÇMA; doğrudan TDD + verification. Güçlü modeldeysen (Opus/Fable) önce uyar: *"Durukan, bu küçük iş — büyük modelin düşünmesine gerek yok, Sonnet oturumunda hemen hallederiz."* Kullanıcı yine de burada isterse yap.
- **Orta/Büyük** (yeni bileşen/modül, çok katman, "daha iyi olsun" gibi tanımsız hedef): güçlü modelde brainstorm→spec→plan; uygulama ayrı Sonnet oturumunda. Sonnet'teysen ve plan yoksa uyar: *"Bu iş plan istiyor — spec/planı güçlü model oturumunda yazalım."*
- **Keşif/bug** (kök neden bilinmiyor, entegrasyon sürprizi): plan çürür — güçlü modelde iteratif, `systematic-debugging` ile.
Karışık istek gelirse (küçük + orta bir arada) ayrıştırıp söyle: küçük parça beklemesin diye önce onu Sonnet'e almayı öner.

## Ekonomi Kanonları
- Başlangıç: $1,000,000 USD
- USD enflasyon: %0.01/gün → yıl sonu hedef: **$1,037,172**
- USD/TRY 2025 eğrisi: ₺35.30 → ₺42.50 (başlangıç değerleri — quant doğrulayacak)
- 9 BIST hissesi: THYAO, EREGL, ASELS, GUBRF, KCHOL, TUPRS, SASA, YKBNK, BIMAS
- 6 emlak: tapu süresi 5-18 gün, rüşvet emlak bedelinin %8'i, kira getirileri 2.0x optimize
- Vergi: stopaj %7.5, kira vergisi 50-günde dilimli %15-30, fırsatçı ceza ₺100K-350K
- Tech Agent: $50K uyandırma → $80/sn; Cloud $75K → +$250/sn; Viral $160K → +$650/sn

## Performance Constraint'leri
- Yahoo/Binance proxy: keyed 5s server cache + inflight dedup (parametreli istekler dahil — `createKeyedTtlFetchCache`).
- Supabase Pro'ya geçince free tier limitlerine (Postgres satır/depolama, aylık aktif kullanıcı) dikkat.
- Her saniye fiyat update'i var — `$derived` kullan, gereksiz re-render önle.

## 4 Oyun Modu (Feature Parity)
| Mod | Süre | Zorluk |
|-----|------|--------|
| VASİYET SEFERİ | 365 gün | Orta (2025 gerçek verileri) |
| CANLI SEANS | 90 gün | Dinamik (canlı API) |
| 2001 KRİZİ | 30 gün | Çok Zor (%7500 faiz şoku) |
| 2018 KUR ŞOKU | 45 gün | Zor (Trump tweet saldırıları) |
