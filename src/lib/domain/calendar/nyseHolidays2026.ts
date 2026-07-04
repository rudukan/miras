// 2026 NYSE resmî tatil takvimi — NYSE'nin TAM GÜN kapalı olduğu günler.
// Tüm değerler America/New_York yerel tarihi, 'YYYY-MM-DD' formatında.
// Yarım-gün erken kapanışlar (Şükran ertesi, Noel arifesi vb.) KAPSAM DIŞI — v1 sade.
//
// Tarihler node ile çapraz doğrulandı (gün-isim kontrolü): MLK/Washington/Memorial/Labor
// "n'inci Pazartesi" kuralına uyuyor, Good Friday (3 Nisan) Paskalya 5 Nisan 2026'nın
// iki gün öncesi, 4 Temmuz 2026 Cumartesi'ye denk geldiği için gözlemlenen tatil 3 Temmuz'a kaymış.
export const NYSE_HOLIDAYS_2026: ReadonlySet<string> = new Set<string>([
  '2026-01-01', // New Year's Day
  '2026-01-19', // Martin Luther King Jr. Day
  '2026-02-16', // Washington's Birthday
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (gözlemlenen — 4 Temmuz Cumartesi'ye denk geliyor)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving Day
  '2026-12-25', // Christmas Day
]);
