# Faz 1 — GO/NO-GO Deneyi Runbook'u (10-15 Kullanıcı)

Bağlam ve kilitli kararlar: [docs/superpowers/specs/2026-07-17-faz1-hazirlik-design.md](superpowers/specs/2026-07-17-faz1-hazirlik-design.md)

Tek soru: **Gerçek bir kullanıcı, yardımsız, oyunu anlıyor ve haftalık ligde oynamak istiyor mu?**

---

## 0. Testçi Havuzu

- **10-15 kişi**, en az **3-4 "yabancı"** (arkadaşın arkadaşı — arkadaşlar fazla naziktir, ölçümü öldürür).
- Karışık finans-okuryazarlığı: kur/enflasyon takip eden meraklılar + tamamen acemiler. Onboarding
  ancak acemide gerçekten test edilir.
- **Fikir sorma, davranış ölç.** Moderatörlü seansta "beğendin mi?" YASAK. Anket anonim.

## 1. Erişim ve Pencere

- Prod URL (`miras-one.vercel.app`) — ayrı staging kurulmaz, telemetri prod'da toplanır.
- ~1 hafta davet penceresi + her testçi için kendi katılımından itibaren D1/D7 ölçümü →
  toplam ~2 hafta.

## 2. Moderatörlü Seans Protokolü (3-4 kişi, ~30-40 dk)

- Ekran paylaşımı + think-aloud (sesli düşünme).
- **Görev tabanlı, yardım YOK.** Açılış cümlesi: *"Linki aç, sana hiçbir şey anlatmayacağım,
  sesli düşün."*
- Soru gelirse moderatör cevaplamaz: *"Sen ne yapardın?"* diye geri sorar. Yardım = ölçüm ölür.
- Not alınacak davranışsal anlar:
  1. Karşılama ekranını geçti mi, ne kadar sürede?
  2. İlk işlemi (al/sat/mevduat) **yardımsız** yapabildi mi, kaç dakikada?
  3. Net servet panelini doğru okudu mu (sordurma — panele bakarken "şu an ne kadar kazandın/
     kaybettin" diye sor, cevabı doğrula)?
  4. Nerede takıldı (varsa) — ekran + saniye + kendi sözleriyle ne dedi?
- Sonda (anlama/niyet) soruları **yalnız seans sonunda** sorulur, görev sırasında değil.

## 3. Anket (10+ kişi, anonim, ≤10 soru)

1. *"Oyunun amacını 1 cümlede yaz."* (açık uçlu — anlamayı KANITLAT, sorma)
2. *"Haftalık lig olsa oynar mıydın? Neden?"* (niyet + gerekçe)
3. *"Nerede takıldın / kafan karıştı?"* (açık uçlu)
4. *"Verinin gecikmeli olduğunu fark ettin mi?"* (Bölüm 3 veri dilinin işe yarayıp
   yaramadığını doğrudan test eder)
5-10. (opsiyonel ek sorular — demografi/cihaz/finansal-okuryazarlık öz-değerlendirmesi gibi,
   toplamı 10'u geçmeyecek şekilde)

## 4. GO/NO-GO Rubriği

| Kapı | Kriter | Sonuç |
|------|--------|-------|
| **Teknik (sert, ikili)** | Sıfır kritik hata: veri kaybı, yanlış para hesabı, crash | Herhangi biri → **NO-GO** (taviz yok) |
| **Anlama** | Seansların ≥3/4'ünde ilk işlem **yardımsız**; ankette çoğunluk amacı doğru yazıyor | Sistematik aynı-noktada takılma → **ITERATE** |
| **Niyet** | Çoğunluk (≈≥%60) "ligde oynardım" — nedeni **oyunun kendisi** ("arkadaşım yaptı" değil) | Düşükse → **ITERATE/NO-GO** |
| **Funnel** (`visit → first_trade` + D1, ham SQL — bkz. spec §1.6) | **Yalnız sanity.** | Nitel okumayla çelişirse uyarı işareti; tek başına kapı DEĞİL |

Eşikler "insan" kriterleri, sert nicel değil — N=10-15'te saf yüzde istatistiksel olarak
dürüst değil (her kişi ≈%7-10 temsil eder).

## 5. Sonuç Şablonu

Deney bitince şunu doldur ve `memory.md`'ye (proje hafızası) işle:

```
Tarih: ____
Katılımcı sayısı: ___ (moderatörlü: ___, yalnız anket: ___)
Teknik kapı: GEÇTİ / NO-GO (varsa hangi hata)
Anlama: ___/4 seansta yardımsız ilk işlem; ankette amacı doğru yazan: ___/___
Niyet: "ligde oynardım" diyen: ___/___ (gerekçe özeti: ____)
Funnel (sanity): visit=___ first_trade=___ D1=___
Takılma noktaları (adım + kaç kişi): ____
HÜKÜM: GO / ITERATE / NO-GO
Gerekçe (2-3 cümle): ____
```
