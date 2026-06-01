# Vizyon Netleştirme — Haberin Rolü (Mod-Bağımlı Hibrit)

**Tarih:** 2026-06-01
**Kapsam:** Ürün vizyonunun #1 açık kararını kapatır: *gerçek dünya haberi/olayı oyunda hangi rolü oynar?* Bu bir özellik spec'i değil, **çatı karar dokümanıdır** — aşağı akıştaki Plan 2 (API & Proxy) ve Plan 3 (Store/UI) yönünü buradan alır.
**Dışarıda kalan:** Somut UI yerleşimi, API sembol formatı, store mimarisi (bunlar ilgili planların işi). Canlı haber akışı (RSS/API) ve tarihsel modların mekanik olay tasarımı sonraki dilimlere ertelenir.

> **Bağlam:** Pivot sonrası çekirdek fantezi — "şu an, içinde yaşadığın gerçek piyasada 1M USD ile ne yapardın?" Sihir = **eş zamanlılık + kültürel zamanlama**. Bu doküman, "haber yönlendirsin mi yoksa sadece yansıtsın mı?" gerilimini çözer. Karar geçmişi: hafıza `urun-vizyonu` + `canli-cekirdek-tasarim` + `project-state`.

---

## 1. Çözülen Gerilim

Açık karar iki uçtu:

- **(A) Saf ayna:** Gerçek haber sadece dekor; beceri = oyuncunun gerçeği okuması. (Mevcut canlı-çekirdek spec'i §1.1 bunu varsayıyordu.)
- **(B) Yönlendiren/mekanik:** Oyun "döviz artacak gibi" sinyali verir; oyuncu ona göre plan yapar.

Kullanıcı içgüdüsü (B)'ye yakındı. Ama (B), **canlı modda felsefeyle çelişir**: fiyatlar gerçekse, oyunun "yön ipucu" verebilmesi için ya gerçek geleceği bilmesi gerekir (imkânsız + **future-leak**, ki kanonen yasak), ya da gerçekle tutmayabilecek **uydurma sinyal** enjekte etmesi gerekir. İkisi de "gerçek = motorun ta kendisi, haberi ayrıca simüle etme" ilkesini bozar.

**Çözüm:** A vs B tek bir global karar değil — **moda bağlı**. Çelişki mod ayrımıyla kalkar.

## 2. Çatı Karar — Mod-Bağımlı Hibrit

| Mod ailesi | Haberin rolü | Gerekçe |
|------------|--------------|---------|
| **Canlı mod** (Dilim 2 — şu an inşa edilen) | **Zengin ayna** — gerçek bağlam öne çıkar, fiyat tahmini oyuncuda | Gelecek bilinemez; tahmin oyuncunun becerisi. Future-leak yapısal olarak imkânsız. |
| **Tarihsel/replay modlar** (VASİYET 2025, 2001, 2018) | **Mekanik sinyal/olay** | Motor scripti zaten biliyor → olay enjekte etmek cheat değil, *tarih*. Felsefe bozulmaz. |

**İlke:** Future-leak yalnızca motorun geleceği *meşru olarak* bildiği yerde (replay) serbesttir; canlı modda asla.

## 3. Canlı Mod İçin "Zengin Ayna" — v1 Kapsamı

"Zengin ayna" bağlamı bir kaynaktan gelmeli. Seçenekler değerlendirildi:

1. Hiç yok (sadece canlı fiyat + seans göstergesi).
2. **Statik küratörlü bağlam** — elle girilmiş TR olay takvimi (Bayram tarihleri zaten `holidays2026.ts`'te + bilinen Fed/seçim günleri).
3. Canlı haber akışı (RSS/API, ör. Bloomberg HT).

**Karar: v1 = Seçenek 2.** API'siz, statik veriyle beslenen **tek bir bağlam kartı** ("Bu hafta: Ramazan Bayramı sonrası açılış" gibi). Bu bir **haber şeridi değildir** — küçük, küratörlü, nötr bir zamanlama bağlamıdır.

**Gerekçe:** Elimizdeki `holidays2026.ts` verisiyle vizyonun "kültürel zamanlama" sihrini **sıfır API riskiyle** verir. Geçmiş + bilinen-gelecek tarihler nötrdür → future-leak değil. Canlı haber (3) en kırılgan katmanı (Plan 2) şişireceği ve ayna≠yorum riski taşıdığı için sonraya ertelenir.

## 4. Aşağı Akışa Etkisi (neden bu doküman önce gelmeli)

- **Plan 2 (API & Proxy):** Haber API'si GİRMEZ. API katmanı yalnızca **fiyat proxy'si** olarak kalır (BIST/altın/USD-TRY + kripto). Kırılgan katman şişmez.
- **Plan 3 (Store/UI):** "Zengin ayna" = statik veriyle beslenen **bağlam kartı** bileşeni (canlı haber akışı değil). Veri kaynağı `holidays2026.ts` + küçük bir küratörlü olay listesi.
- **Tarihsel modlar:** Mekanik olay/sinyal tasarımı **sonraki dilim** — kendi spec'ini hak eder (olay kartı modeli, future-leak'in replay'de nasıl meşru kullanılacağı).

## 5. Vizyonun Açtığı Kozlar (teyit, değişmedi)

- **Adil lider tablosu:** Herkes aynı gerçek "şu an"a karşı oynadığı için sıralama doğal olarak anlamlı ("bu hafta oynayan herkese karşı sen"). Opt-in leaderboard ile birleşir.
- **Bedava olay takvimi:** Gerçeklik (Bayram/Fed/seçim) olay üretme yükünü kaldırır. Dezavantaj: bazı haftalar sıkıcı, dramayı kontrol edemezsin — kabul edilen bedel.
- **Ev/altın fantezisi:** Emlak kapsam dışı (illikit, sonraki katman) ama **gram altın (XAUGRAM) v1'de var** → Türk içgüdüsünün büyük kısmını karşılar.

## 6. Kapsam Dışı (bu doküman karar VERMEZ)

- Canlı haber akışı (RSS/API) — sonraki canlı-mod iterasyonu.
- Tarihsel modların mekanik olay/sinyal tasarımı — ayrı dilim + ayrı spec.
- Bağlam kartının görsel tasarımı + tam olay listesi — Plan 3.
- Leaderboard altyapısı — Dilim 4 / Supabase sprint'i.
