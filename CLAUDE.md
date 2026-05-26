# Miras Oyunu

Türkiye'nin 2025 makro koşullarında 1M USD mirası 365 günde işletme finansal simülasyonu.
Detaylı proje hafızası için `memory.md`. Sprint planı için `.claude/plans/` dizinine bak.

## Tech Stack
SvelteKit 2 + Svelte 5 + TypeScript (strict) + Vite + Tailwind CSS 3 + Firebase (anon auth + Firestore).
Test: Vitest (unit/domain) + Playwright (E2E).

## Dizin Haritası
```
src/lib/domain/    — Saf TS, UI'sız, test edilebilir iş mantığı (her sistem ayrı modül)
src/lib/stores/    — Svelte stores (sistemler arası iletişim buradan)
src/lib/components/— Svelte component'lar (panels/, chart/, ui/)
src/lib/api/       — Dış API client'ları (yahoo.ts, binance.ts, firebase.ts)
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
- Domain unit: Vitest, `*.test.ts` domain dosyasının yanı başında.
- Balance simülasyon: `tests/balance/` — 1000x oyun simülasyonu, kazanılabilirlik %30-70 aralığında.
- E2E: `tests/e2e/` — Playwright critical path (onboarding → işlem → yıl sonu).
- **`verification-before-completion` skill**: "tamam" demeden önce `npm run test` + `npm run build` geçmeli.

## Subagent'lar
9 departman `.claude/agents/` altında, her biri model: sonnet.
Delegasyon için `subagent-driven-development` ve `dispatching-parallel-agents` skill'lerini kullan.

## Ekonomi Kanonları
- Başlangıç: $1,000,000 USD
- USD enflasyon: %0.01/gün → yıl sonu hedef: **$1,037,172**
- USD/TRY 2025 eğrisi: ₺35.30 → ₺42.50 (başlangıç değerleri — quant doğrulayacak)
- 9 BIST hissesi: THYAO, EREGL, ASELS, GUBRF, KCHOL, TUPRS, SASA, YKBNK, BIMAS
- 6 emlak: tapu süresi 5-18 gün, rüşvet emlak bedelinin %8'i, kira getirileri 2.0x optimize
- Vergi: stopaj %7.5, kira vergisi 50-günde dilimli %15-30, fırsatçı ceza ₺100K-350K
- Tech Agent: $50K uyandırma → $80/sn; Cloud $75K → +$250/sn; Viral $160K → +$650/sn

## Performance Constraint'leri
- Yahoo Finance proxy: 5s server cache zorunlu.
- Firebase free tier: Firestore 50K read/day limit'ine dikkat.
- Her saniye fiyat update'i var — `$derived` kullan, gereksiz re-render önle.

## 4 Oyun Modu (Feature Parity)
| Mod | Süre | Zorluk |
|-----|------|--------|
| VASİYET SEFERİ | 365 gün | Orta (2025 gerçek verileri) |
| CANLI SEANS | 90 gün | Dinamik (canlı API) |
| 2001 KRİZİ | 30 gün | Çok Zor (%7500 faiz şoku) |
| 2018 KUR ŞOKU | 45 gün | Zor (Trump tweet saldırıları) |
