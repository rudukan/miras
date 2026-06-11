# Ölüm/Yaşam Deneyi — Paylaşılabilir Günlük Kapanış Kartı + 5 Kullanıcılık Deneme

## Context

3 turluk yönetim kurulu toplantısının sonucu: ürünün viral potansiyeli inançla değil tek bir ucuz deneyle ölçülecek (GM hükmü: KOŞULLU-GO). Deney: mevcut canlı oyuna **paylaşılabilir günlük kapanış kartı** eklenir → 5 kişiye link verilir → 3 gün izlenir.

**Karar eşikleri (GM):**
- GO: 5'ten ≥3 kişi 2. VEYA 3. gün kendiliğinden geri dönerse → Supabase fazına geç
- Viral sinyal VAR: ≥1 kişi kartı İSTENMEDEN paylaşırsa
- NO-GO: ≤1 dönüş → kart/mesaj tasarımına geri dön, büyütme yok

**Kapsam sınırı:** Supabase/hesap/leaderboard YOK, localStorage yeter. ~1 hafta iş. Motor (`gameState.ts`, oracle, WS) değişmez.

**Kilitli tasarım kararları:** zaman çapası = gerçek İstanbul takvim günü (oyun-içi `clock.day` karta GİRMEZ) · karşılaştırma = "dolar tutsaydın" · sert basitlik (tek vurgu sayısı) · kartta zorunlu "SANAL OYUN — GERÇEK PARA DEĞİL" ibaresi (hukuk şartı) · CMO formatı: dağılım barı + strateji rozeti ("Kripto'cu/Altıncı/Mevduatçı/Borsacı/Dövizci/Temkinli").

**Mevcut durum:** main=`148cbb8` push'lu, 258 test yeşil, 11 varlık. `vsUsdHoldUsd` ve `positions` store'da hazır. EKSİK: persistence, gün snapshot'ı, kart, paylaşım, telemetri, deploy.

---

## Görev 1 — localStorage Persistence + playerId (M)

**Dosyalar:** YENİ `src/lib/stores/savegame.ts` + `.test.ts` · DEĞİŞİR `src/lib/stores/liveGameStore.svelte.ts`, `src/routes/+page.svelte`

- `SaveEnvelopeV1 { v:1, game: GameState, periodDays, activeBist: string[] }` — anahtar `miras.save.v1`. GameState zaten JSON-safe (Money düz obje). Parse hatası/yanlış versiyon → `null` (sıfırdan başla, migration yok). Para alanları restore'da `usd()` ile yeniden sarılır.
- **KRİTİK TUZAK:** restore'da `activeBist` = union(BIST_SYMBOLS, kayıtlı activeBist, holdings'teki BIST id'leri) — yoksa on-demand alınan hissenin fiyatı poll edilmez → oracle throw → netWorth null.
- Kaydetme: `$effect` DEĞİL, explicit `onPersist` callback — `apply()` (trade sonrası, satır ~218), `setPeriod`, `addBist` noktalarında. Fiyat tick'inde kayıt yok.
- Restore: `LiveGameStoreOptions.initial?: SaveEnvelopeV1`; `+page.svelte` script başında `browser ? loadGame(localStorage) : null`.
- `getOrCreatePlayerId(storage)` — anahtar `miras.playerId`, `crypto.randomUUID()`. Oyun sıfırlansa bile SİLİNMEZ (telemetri kimliği).
- Intro: kayıt varsa "DEVAM ET ▶" + küçük "Sıfırla ve yeni oyun"; yoksa mevcut akış.

**Test:** round-trip, bozuk JSON→null, holdings'li restore, playerId idempotent; store testinde `initial` ile kurulum + `onPersist` çağrısı + restore edilen BIST sembolü `activeBist`'te (mevcut enjeksiyon desenleri: `fetchFn`, `makeFeed`, `now`).

## Görev 2 — Günlük Snapshot Domain Modülü (M, TDD)

**Dosyalar:** YENİ `src/lib/domain/snapshot/dailySnapshot.ts` + `.test.ts` · DEĞİŞİR `savegame.ts` (anahtar `miras.history.v1`), `liveGameStore.svelte.ts`

- `DailySnapshot { dateKey, netWorthUsd: Money, vsUsdHoldUsd: Money, allocation: Partial<Record<AssetCategory|'usd', number>>, recordedAt }` — dateKey = mevcut `istanbulParts(date).key` (yeni tarih kodu yazma).
- Saf fonksiyonlar: `computeAllocation` (categoryOf = `CATALOG[id]?.category ?? 'bist'`) · `upsertSnapshot` (aynı gün replace = günün son değeri; cap 60 kayıt) · `previousSnapshot` (bugünden önceki en yakın — "son görüşmenden beri" semantiği) · `changeSince` (prev yok → null) · `strategyBadge` (en büyük pay ≥%50 → rozet, değilse "Temkinli"; eşitlikte sabit öncelik) · `daysElapsed(createdAtMs, nowMs)` (İstanbul dateKey farkı + 1).
- Tetikleyici: `pollFx` sonunda (20sn'de bir + start'ta hemen) `netWorth !== null` ise upsert + persist. Fiyat eksikse ATLA (çöp veri yazılmaz). `beforeunload` yok.

**Test:** allocation toplamı 100±0.01 · yalnız nakit → `{usd:100}` · upsert replace/append/cap/sıra · changeSince edge'leri · rozet eşik sınırları (%49.9 vs %50) · daysElapsed İstanbul gece yarısı (UTC 21:00) sınırı.

## Görev 3 — Kapanış Kartı UI (M)

**Dosyalar:** YENİ `src/lib/components/closingCard.ts` (saf model builder) + `.test.ts`, `src/lib/components/ClosingCard.svelte` (~150 satır) · DEĞİŞİR `+page.svelte` (~+25 satır)

- `buildClosingCardModel(game, netWorth, vsUsdHold, history, nowMs) → ClosingCardModel` — tüm etiketler mevcut `format.ts`'ten (`displayUsd`, `signedUsd`, `signedPercent`) + `CATEGORY_LABELS`'a `usd → 'DOLAR'` eklenir.
- Sert basitlik hiyerarşisi: tek vurgu = "DÜNDEN BERİ ±$X" (ilk gün: toplam getiri) → "DOLAR TUTSAYDIN" satırı → yatay yığılmış dağılım barı (pasta değil; CSS flex, term.* renkleri) + strateji rozeti → altta disclaimer (her zaman tam görünür).
- Gösterim, iki tetikleyici birden: (1) **otomatik** açılışta history'de eski snapshot varsa ve `miras.cardSeen ≠ bugün` ise overlay (günde max 1) — retention anı; (2) **"GÜNÜN KARTI" butonu** header'da her zaman — viral an. Overlay aksiyonları: PAYLAŞ + KAPAT.

**Test:** node'da model builder — ilk gün (sinceLast null), kâr/zarar işaretleri, segment sırası, rozet, disclaimer her modelde sabit. `.svelte` test edilmez (repo konvansiyonu).

## Görev 4 — PNG Üretimi + Paylaşım (L)

**KARAR: elle canvas çizimi** (html2canvas/html-to-image REDDİ: yeni dep + font/renk rasterize bug riski; SVG→foreignObject REDDİ: taint/font gömme tuzakları). Kart = monospace metin + dikdörtgen + tek bar → `fillRect`+`fillText` ~150-200 satır, deterministik, CORS imkânsız. `document.fonts.ready` + `fonts.load('700 64px "JetBrains Mono"')` ile font garanti. **Format: 1080×1080 kare** (WhatsApp/Instagram hedef kanal; offscreen sabit canvas).

**Dosyalar:** YENİ `src/lib/share/cardImage.ts` (`buildCardLayout(model) → Primitive[]` saf + `drawCard(canvas, primitives)` ince + `TERM_COLORS` sabiti — tailwind.config.ts hex kopyası, kaynak yorumla işaretli) + `.test.ts` · YENİ `src/lib/share/share.ts` (`sharePng(blob)`: `navigator.canShare files` → `navigator.share` → `ClipboardItem` kopyala → `<a download>`; dönüş `'shared'|'copied'|'downloaded'|'cancelled'`) · DEĞİŞİR `ClosingCard.svelte` (PAYLAŞ → `canvas.toBlob` → `sharePng` → telemetri).

Kart görseli: term.bg zemin, term.green başlık, JetBrains Mono; alt köşe site URL'i + disclaimer bandı.

**Test:** `buildCardLayout` node'da — disclaimer primitive'i HER layout'ta (hukuk regresyon testi), bar genişlikleri pct orantılı, taşma yok (x+w ≤ 1080), uzun rakamda font küçültme. Çizim/paylaşım: gerçek cihaz checklist'i (runbook'a).

## Görev 5 — Minimal Telemetri (S, G1-4'e paralel)

Vercel Hobby runtime logları ~1 saat saklanır → console.log tek başına YETMEZ. **Discord webhook** (ücretsiz, kalıcı, telefondan anlık): endpoint hem `console.log` hem `TELEMETRY_WEBHOOK_URL` env varsa fire-and-forget POST (await etme, hata yut).

**Dosyalar:** YENİ `src/routes/api/telemetry/+server.ts` + `server.test.ts` (`POST {playerId, event:'visit'|'share_click'|'share_done', tsISO}` → şema dışı 400, geçerli 204) · YENİ `src/lib/api/telemetry.ts` (client: `sendBeacon` → `fetch keepalive`, hatalar sessiz; `pingDailyVisit`: `miras.lastVisitPing ≠ bugünkü İstanbul dateKey` ise gönder) · DEĞİŞİR `+page.svelte` (mount'ta ping; kartta share_click/share_done).

**Test:** mevcut `src/routes/api/yahoo/server.test.ts` deseni — 204/400, webhook env yokken fetch çağrılmaz; `pingDailyVisit` günde-1 mantığı fake storage ile.

## Görev 6 — Vercel Deploy (S)

**Dosyalar:** `svelte.config.js`, `package.json` (devDep `@sveltejs/adapter-vercel`)

- `adapter({ runtime: 'nodejs20.x', regions: ['fra1'] })` — **ZORUNLU: Binance ABD IP'lerine HTTP 451 döner**, varsayılan iad1 bölgesi `/api/crypto`'yu kırar. Tarayıcı WS'i (kullanıcı TR IP) etkilenmez.
- Yahoo cache instance-bazlı — 5 kullanıcıda sorun değil (not: viral ölçekte KV gerekir). `firebase` dep'i import edilmiyor, DOKUNMA.
- Env: `TELEMETRY_WEBHOOK_URL`. **Öneri: G1 biter bitmez bir erken smoke deploy** (bölge riskini erken doğrula).
- Doğrulama: `npm run build` + deploy sonrası `/api/yahoo`, `/api/crypto`, `/api/telemetry` curl smoke.

## Görev 7 — Deneme Runbook'u (S)

YENİ `docs/deney-runbook.md`:
1. **Gün 0:** 5 kişiye KİŞİSEL WhatsApp (grup değil — kendiliğinden-paylaşım sinyalini kirletmemek için izole). Tek cümle + link; "paylaş" DEME. Cihaz/iOS sürümü önceden not (Web Share kontrolü).
2. **Ölçüm:** Discord kanalı → kişi × gün matrisi (`visit` İstanbul gününe göre).
3. **Gün 3 akşamı eşik değerlendirme:** GO ≥3/5 dönüş · viral sinyal ≥1 istenmemiş `share_done` · NO-GO ≤1 dönüş → kart revizyonu + ikinci 5'li tur.
4. **Bozulma protokolü:** stale veri → Vercel logs; "oyunum sıfırlandı" → private mod/localStorage temizliği uyarısı.

---

## Sıra ve Takvim

```
G1 persistence ─► G2 snapshot ─► G3 kart UI ─► G4 canvas+paylaşım ─┐
G5 telemetri (paralel) ────────────────────────────────────────────┤
G1 sonrası erken smoke deploy ··· G6 deploy ───────────────────────┴─► G7 runbook ─► GÖNDERİM
```
Toplam ~5.5-6 iş günü.

## Doğrulama

- Her görev: `npm run test` + `npm run check` yeşil; bitişte `npm run build` (verification-before-completion).
- G4 sonrası gerçek cihaz checklist: Android Chrome `navigator.share`, masaüstü Chrome clipboard, iOS Safari (15+) dosya paylaşımı.
- Deploy sonrası: canlı URL'de soğuk açılış → fiyatlar akıyor mu, trade → yenile → "DEVAM ET" → state korunmuş mu, kart açılıp PNG paylaşılıyor mu, Discord'a event düşüyor mu.
- Oyna-ve-gözlemle (blurt protokolü) deploy edilen sürümde bir kez koşulur.

## Riskler (kabul edilmiş)

1. localStorage tek kayıt — private mod kaybettirir (runbook uyarısı).
2. Eski iOS'ta paylaşım downloads'a düşer → `share_done` cihaz bazında yorumlanır.
3. Yahoo datacenter 429 → mevcut stale+fallback yutar; fiyat eksikken snapshot atlanır (kart çöp sayı göstermez).
4. Çoklu sekme: son yazan kazanır — kilit eklenmez (over-engineering).
