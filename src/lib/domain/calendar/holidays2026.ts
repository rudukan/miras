// 2026 Türkiye resmî tatil takvimi — BIST'in KAPALI olduğu günler.
// Tüm değerler Europe/Istanbul yerel tarihi, 'YYYY-MM-DD' formatında.
//
// Sabit (millî) tatiller kesindir. Dinî bayramlar (Ramazan/Kurban) lunar takvime
// bağlı olduğundan AŞAĞISI EN İYİ TAHMİNDİR — QUANT KALİBRASYON (spec §12):
// Diyanet resmî takviminden doğrula. Mekanizma tarihten bağımsız; sadece veri rafine edilir.
export const HOLIDAYS_2026: ReadonlySet<string> = new Set<string>([
  // — Sabit millî tatiller —
  '2026-01-01', // Yılbaşı
  '2026-04-23', // Ulusal Egemenlik ve Çocuk Bayramı
  '2026-05-01', // Emek ve Dayanışma Günü
  '2026-05-19', // Atatürk'ü Anma, Gençlik ve Spor Bayramı
  '2026-07-15', // Demokrasi ve Millî Birlik Günü
  '2026-08-30', // Zafer Bayramı
  '2026-10-29', // Cumhuriyet Bayramı

  // — Dinî bayramlar (TAHMİNİ — quant doğrula) —
  // Ramazan Bayramı (≈ 20–22 Mart 2026)
  '2026-03-20',
  '2026-03-21',
  '2026-03-22',
  // Kurban Bayramı (≈ 27–30 Mayıs 2026)
  '2026-05-27',
  '2026-05-28',
  '2026-05-29',
  '2026-05-30',
]);
