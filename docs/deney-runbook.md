# Deney Runbook'u — Paylaşılabilir Günlük Kapanış Kartı (5 Kullanıcılık Deneme)

Bağlam ve karar eşikleri: [docs/superpowers/plans/2026-06-10-kapanis-karti-deneyi.md](superpowers/plans/2026-06-10-kapanis-karti-deneyi.md)

---

## 0. Deploy (bir kerelik kurulum)

1. **Vercel projesi oluştur/bağla** — `vercel link` (CLI) veya Vercel dashboard'dan repoyu içe aktar.
   `svelte.config.js` zaten `@sveltejs/adapter-vercel` + `runtime: 'nodejs20.x'` + `regions: ['fra1']`
   ile yapılandırılı — proje ayarlarında ekstra bölge seçimi gerekmez.
2. **Env değişkeni** — Vercel proje ayarlarında `TELEMETRY_WEBHOOK_URL` ekle (Discord kanal webhook'u).
   Şablon: [.env.example](../.env.example). Ayarlanmazsa `/api/telemetry` yalnız `console.log` yapar
   (Vercel Hobby logları ~1 saat saklanır — Discord olmadan deney verisi kaybolur).
3. **Windows-yerel build notu** — `npm run build` Windows'ta `@sveltejs/adapter-vercel`'in son
   paketleme adımında (`fs.symlinkSync`, Build Output API) `EPERM` ile başarısız olabilir
   (Developer Mode kapalıyken). Vite/SvelteKit derlemesinin kendisi (yukarısı) başarılıdır;
   bu yalnız Windows'a özgü bir paketleme kısıtıdır — Vercel'in Linux build runner'ı etkilenmez.
4. **Deploy** — `git push` (Vercel otomatik build) veya `vercel --prod`.

### Deploy sonrası smoke test

```bash
BASE=https://<deploy-url>
curl -sf "$BASE/api/yahoo?bist=THYAO" | head -c 300; echo
curl -sf "$BASE/api/crypto?coins=BTC" | head -c 300; echo
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/telemetry" \
  -H 'content-type: application/json' \
  -d '{"playerId":"smoke","event":"visit","tsISO":"2026-06-11T00:00:00.000Z"}'
# → 204 bekleniyor; webhook ayarlıysa Discord'a [visit] smoke ... düşmeli
```

### Canlı akış kontrolü

1. Soğuk açılışta deploy URL'sini ziyaret et → fiyatlar 1-2sn içinde akmaya başlamalı.
2. BAŞLA → bir varlık al → sayfayı yenile → "DEVAM ET" → state (bakiye/pozisyon) korunmuş olmalı.
3. "GÜNÜN KARTI" → kart açılıyor mu, PAYLAŞ → PNG üretiliyor mu (cihaz checklist'i aşağıda).
4. Discord kanalına `visit` event'i düşmüş mü (ilk ziyaret pingi).

### Gerçek cihaz checklist (G4 — paylaşım)

| Cihaz | Beklenen yol | Sonuç |
|---|---|---|
| Android Chrome | `navigator.share` → sistem paylaşım sayfası açılır | ☐ |
| Masaüstü Chrome/Edge | `navigator.share` yok → panoya kopyalanır (`ClipboardItem`) | ☐ |
| iOS Safari (15+) | `navigator.share` (dosya) → AirDrop/Mesajlar/Kaydet seçenekleri | ☐ |

Her satırda: kartı aç → PAYLAŞ → görsel doğru mu (1080×1080, JetBrains Mono, dağılım barı,
disclaimer bandı tam görünür) → Discord'a `share_click` ve `share_done` düşmüş mü.

### Oyna-ve-gözlemle (blurt)

Deploy edilen sürümde bir kez: yeni oyuncu gözüyle BAŞLA → birkaç işlem → kapanış kartını gör.
İlk tepki içtenlikle "vay be" mi, "ve?" mi — not al (eğlence ölçütü: blurt protokolü).

---

## 1. Gün 0 — Dağıtım

- **5 kişiye KİŞİSEL WhatsApp mesajı** (grup DEĞİL — kendiliğinden-paylaşım sinyalini kirletmemek için
  her kişi izole). Tek cümle + link, ör: *"Bunu denedin mi, 1M$ ile 2025 Türkiye'sinde ne yapardın?"*
  **"Paylaş" deme** — viral sinyal yalnız istenmeden gelirse anlamlı.
- Her kişi için önceden not al: **cihaz + iOS/Android sürümü** (Web Share desteğini yorumlamak için —
  iOS <15 dosya paylaşımını desteklemez, indirilenlere düşer).
- Her kişiye `playerId` eşlemesini not al (Discord loglarında `playerId` görünür; isimle eşleştir).

## 2. Ölçüm — Discord kanalı

`TELEMETRY_WEBHOOK_URL` Discord kanalına şu formatta event düşürür: `[event] playerId @ tsISO`.

Her gün akşamı **kişi × gün matrisi** çıkar (`visit` event'lerini İstanbul takvim gününe göre grupla):

| Oyuncu | Gün 0 | Gün 1 | Gün 2 | Gün 3 |
|---|---|---|---|---|
| A | ✅ | | | |
| B | ✅ | | | |
| ... | | | | |

`share_click` / `share_done` event'lerini ayrıca işaretle — özellikle **Gün 0'dan SONRA** ve
**hiç hatırlatma yapılmadan** gelen `share_done` = viral sinyal.

## 3. Gün 3 akşamı — Eşik değerlendirme

GM kararı (plan'daki eşikler):

- **GO**: 5 kişiden **≥3'ü** Gün 1 VEYA Gün 2 VEYA Gün 3'te **kendiliğinden** geri dönmüş
  (`visit` event'i var) → Supabase fazına geç (hesaplar + leaderboard).
- **Viral sinyal VAR**: en az 1 kişi kartı **istenmeden** paylaşmış (`share_done`, hatırlatmasız).
- **NO-GO**: ≤1 dönüş → büyütmeye geçme; kart/mesaj tasarımına geri dön (CMO + ürün ile
  ikinci 5'li tur için revizyon brainstorm'u).

Sonucu ve ham matrisi proje hafızasına (`project-state`) kaydet — bir sonraki oturumun
nereden devam edeceğini belirleyecek.

## 4. Bozulma protokolü

- **"Fiyatlar donmuş / stale" şikayeti** → Vercel dashboard → Deployments → Logs;
  `[api/yahoo]` veya `[api/crypto]` `fetch başarısız` satırlarını ara (Yahoo 429 / Binance 451 olası).
  fra1 bölgesi doğru mu kontrol et (Binance ABD'den 451 döner).
- **"Oyunum sıfırlandı" şikayeti** → muhtemel nedenler: tarayıcı gizli/private mod (localStorage
  oturum sonunda silinir) veya kullanıcı `localStorage`'ı manuel temizlemiş. Kullanıcıya normal
  pencerede (gizli sekme değil) devam etmesini söyle; "Sıfırla ve yeni oyun" kasıtlı bir aksiyon,
  yanlışlıkla tetiklenmesi raporlanmalı.
- **Discord'a hiç event düşmüyor** → `TELEMETRY_WEBHOOK_URL` env değişkeni Vercel'de set mi,
  redeploy gerekiyor mu (env değişikliği sonrası Vercel yeniden deploy ister).
