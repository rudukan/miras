# Eğlence Ölçütü — "Sihir Anı" Tasarımı (Canlı Çekirdek)

> **Motto:** *"Paranı ver, istediğin gibi yatır."*

**Tarih:** 2026-06-01
**Durum:** Onaylı (brainstorming) → writing-plans'e hazır
**İlgili:** [[urun-vizyonu]], [[canli-cekirdek-tasarim]], [[project-state]], `2026-06-01-vizyon-haber-rolu-design.md`

---

## 0. Bu doküman neden var?

Mühendislik A+, ürün riski sona itildi. Plan 1 (Domain) + Plan 2 (API) + Plan 3-THIN
(oynanabilir dilim) bitti; **222 test yeşil, ama "eğlenceli mi?" sorusunun cevabı yok.**
Şu ana kadar "tamam" = test + build geçti = **doğruluğu** ölçüyordu, eğlenceyi değil.
Bu doküman o boşluğu kapatır: **eğlenceyi test edilebilir bir ölçüte çevirir.**

Bu, bir özellik spec'i değil — bir **başarı ölçütü** spec'idir. Çıktısı: Canlı Çekirdek
diliminin "his" katmanının başarılı olup olmadığını söyleyen tek, dürüst, gözlemlenebilir test.

**Altyapı donduruldu:** Bu ölçüt tutana kadar yeni domain modülü / yeni API sağlamlaştırması
yok. İstisna: doğrudan bu ölçüte hizmet eden, hedefli eklemeler (bkz. §4).

---

## 1. Sihir Anı (kuzey yıldızı)

> **Oyuncu sayfayı açar; önünde 1M$ nakit ve canlı gerçek pano vardır. İlk saniyelerde
> tanıdık bir gerçek sayıya _istemsizce_ tepki verir — "dolar 45.9 olmuş ya!", "gram altın
> uçmuş" — ve bu tanıma şoku onu, o gerçekliğe karşı _"1M$ olsa ŞİMDİ ben ne yapardım"_
> kararını, oyunu kazanmak için değil, gerçek bir karar gibi vermeye çeker.**

Üç direk:
- **Nerede:** açılış + dağıtım, ilk ~60 sn. (Karar anı; "haklı çıkma" / "canlı olay" anları sonraki katman.)
- **Ağırlık nereden:** **gerçeklik tanıma** — oyun parası değil, tanıdık + güncel + gerçek sayı.
- **Ne tetikler:** "şu an"-lık + görünür hareket → tanıma.

**Kanca + sustain:** Blurt anı **kancayı** atar; aşağıdaki sürekli-kontrol döngüsü (§4) **tutar.**

---

## 2. Başarı ölçütü: "blurt"

**Blurt = ** Açılıştan sonra ilk ~60 saniyede, **hiçbir işlem yapmadan önce**, GERÇEK bir
sayıya istemsiz sözlü/zihinsel tepki. Örn: *"dolar bu kadar mı olmuş", "altın uçmuş",
"BTC yine fırlamış"*. Tepki **sayıya/gerçekliğe** olmalı — arayüze/cilaya değil.

**Geçti eşiği (solo — ilk denek kullanıcı):** Soğuk açılışta, dokunmadan önce, en az bir
gerçek sayı istemsiz tepki uyandırdı mı? **Dürüst öz-bildirim** (gerçek tepki mi, zorlama mı).
Binary ve dürüst.

**Geniş test (sonra):** N taze denekten M'i 60 sn içinde blurt'lerse. (Eşik solo tuttuğunda belirlenir.)

---

## 3. Başarısızlık işaretleri (kendimizi kandırmamak için)

Bunlardan biri olursa **"tuttu" DİYEMEYİZ:**
- **Excel taraması:** Pano tablo gibi süzülüyor, hiçbir sayı tepki uyandırmıyor.
- **Kazanma modu:** "Kendim gibi" değil, en çok çıkanı kovalayarak dağıtılıyor → gerçeklik bağı kurulmadı.
- **Yanlış hedefe tepki:** Cilaya tepki var ("animasyon güzelmiş") ama SAYIYA değil → süs inşa edilmiş, tanıma değil.
- **"Bunlar gerçek mi?" tereddüdü:** Fiyatların gerçek + şu an olduğu apaçık değil → "şu an"-lık yüzeye çıkmamış.

---

## 4. Adil-test minimumu (Yaklaşım B)

Blurt'e adil şans veren **en küçük** eklemeler — arayüzü karıştırmadan. (Yaklaşım A =
sıfır müdahale, yanlış-negatif riski yüksek; C = tam tiyatro, doğrulanmadan aşırı inşa. B = orta.)

1. **"Şu an"-lık, sessizce belirgin:** "CANLI" + "3 sn önce" tek satır. (StatusBadge zaten var → görünür kıl.)
2. **Görünür hareket — blurt tetikçilerinden biri:** her varlık satırında küçük **"%±X"** rozeti =
   **günlük değişim** (önceki kapanışa göre; kripto için 24s), yeşil/kırmızı. "Altın bugün uçmuş!"
   bundan gelir. *(Diğer tetikçi = mutlak fiyatın kendisi: "dolar 45.9 olmuş ya" → seviye tanıma, bedava.
   Geçmiş veri / yıl-başı kıyası kapsam DIŞI — sadece günlük/24s, çünkü quote API'sinden hazır gelir.)*
3. **Tek satır bağlam kartı (statik, küratörlü):** "Bayram haftası · dolar rekora yakın" gibi.
   Vizyonda zaten kararlı (statik bağlam kartı; haber şeridi DEĞİL). Bir cümle.

**Sürekli-kontrol döngüsü (zaten NetWorthMirror'da; korunur + sadeleşir):**
- **1M$ ana para çapası daima görünür**, P/L ona karşı tek bakışta okunur (kâr yeşil / zarar kırmızı).
- Çekirdek döngü = *bakiyeni gör → istediğin gibi yatır → ana para + kâr/zararı sürekli kontrol et.*

### SERT KURAL — basit kalır
Her ekleme tek satır / tek rozet. Panel sayısı **artmaz**. Eklenen şey blurt'e veya
para-kontrol döngüsüne hizmet etmiyorsa, **eklenmez.** (Kullanıcı: "çok da karışık bir arayüzle değil.")

### Kapsam DIŞI (basitliği korumak için)
Çoklu grafik · haber şeridi · gelişmiş emir tipleri · derinlik/seans · sekmeler ·
"haklı çıkma"/"canlı olay" anları (sonraki katman) · sosyal/leaderboard.

### Açık not — veri bağımlılığı
"%±X günlük hareket rozeti" (§4.2), proxy'nin **günlük değişim**i yüzeye çıkarmasını gerektirir
(önceki kapanış / 24s — geçmiş seri DEĞİL). Küçük ama gerçek bir veri eklemesi. **Altyapı için
değil, doğrudan blurt için** → "dondurma" kuralını ihlal etmez. (Writing-plans nasılını çözer:
Yahoo quote `regularMarketChangePercent`/`previousClose`, Binance 24s ticker `priceChangePercent`.)

---

## 5. Oyna-ve-gözlemle protokolü

Minimum (B) eklendikten sonra:

1. **Soğuk açılış:** `npm run dev` → tarayıcı, ilk kez görüyormuş gibi (önceden fiyata bakma).
2. **İlk 60 sn — dokunma:** Sadece bak. İstemsiz gerçek-sayı tepkisi geldi mi? Geldiyse **hangi sayı, ne dedin** → kaydet.
3. **Serbest dağıt:** "Kendin gibi" 1M$. Her seçim için tek cümle "neden".
4. **Döngü kontrolü:** Ana para + P/L'ye birkaç kez bak — **bakmak istedin mi**, yoksa kayıtsız mıydın?
5. **Hüküm:** Başarısızlık işareti (§3) tetiklendi mi? Blurt (§2) geldi mi? → **tuttu / kısmen / tutmadı** + tek cümle gerekçe.

İlk denek kullanıcı (solo). Tuttuysa → 2-3 taze deneğe aynı protokol.

---

## 6. Sonraki (bu ölçüt tuttuktan sonra)
- Tutmadıysa: §3 hangi işaret tetiklendi → onu hedef alan tek bir iterasyon (yine §4 sert kuralı).
- Tuttuysa: kanca kanıtlandı → sustain'i derinleştir (haklı çıkma anı / olay takvimi / leaderboard) — ayrı brainstorm.
- **CLAUDE.md tazeleme** (ürün körlüğünün #2 kaynağı): kanonik doküman pivotu + bu eğlence çıtasını yansıtsın — ayrı adım.
