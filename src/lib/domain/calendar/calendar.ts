import type { AssetCategory } from '../scenario/types';
import { HOLIDAYS_2026 } from './holidays2026';
import { NYSE_HOLIDAYS_2026 } from './nyseHolidays2026';

export interface IstanbulParts {
  readonly key: string;     // 'YYYY-MM-DD' (Europe/Istanbul yerel tarihi)
  readonly weekday: number; // 1=Pazartesi .. 7=Pazar
  readonly hour: number;    // 0..23 (Istanbul yerel saati)
  readonly minute: number;  // 0..59
}

const DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Istanbul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Bir `Date` anını Europe/Istanbul yerel parçalarına böler (tz-bağımsız, deterministik). */
export function istanbulParts(at: Date): IstanbulParts {
  const key = DATE_FMT.format(at); // 'YYYY-MM-DD'
  const [hh, mm] = TIME_FMT.format(at).split(':'); // 'HH:MM'
  // weekday'i key'den saf tarih olarak hesapla (UTC gün = JS gün-of-week 0=Paz..6=Cmt)
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
  return {
    key,
    weekday: dow === 0 ? 7 : dow, // 1=Pzt..7=Paz
    hour: Number(hh),
    minute: Number(mm),
  };
}

/** Verilen an Europe/Istanbul'da bir TR resmî tatiline mi düşüyor? */
export function isHoliday(at: Date): boolean {
  return HOLIDAYS_2026.has(istanbulParts(at).key);
}

const NY_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const NY_TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Bir `Date` anını America/New_York yerel parçalarına böler (DST otomatik — Intl hallediyor). */
export function newYorkParts(at: Date): IstanbulParts {
  const key = NY_DATE_FMT.format(at); // 'YYYY-MM-DD'
  const [hh, mm] = NY_TIME_FMT.format(at).split(':'); // 'HH:MM'
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
  return {
    key,
    weekday: dow === 0 ? 7 : dow, // 1=Pzt..7=Paz
    hour: Number(hh),
    minute: Number(mm),
  };
}

const BIST_OPEN_HOUR = 10;   // 10:00 (Europe/Istanbul) — seans başlangıcı (dahil)
const BIST_CLOSE_HOUR = 18;  // 18:00 — seans bitişi (hariç)
const NYSE_OPEN_HOUR = 9;    // 9:30 (America/New_York) — seans başlangıcı (dahil)
const NYSE_OPEN_MINUTE = 30;
const NYSE_CLOSE_HOUR = 16;  // 16:00 — seans bitişi (hariç)

/** Verilen kategori, verilen anda işleme açık mı?
 *  Kripto/döviz/emtia v1'de her zaman açık; BIST hafta içi 10:00–18:00 (Istanbul) ve tatil değil;
 *  ABD hisseleri hafta içi 9:30–16:00 (New York, DST-duyarlı) ve NYSE tatili değil. */
export function isMarketOpen(category: AssetCategory, at: Date): boolean {
  if (category === 'us') {
    const p = newYorkParts(at);
    if (p.weekday >= 6) return false;                 // Cmt(6)/Paz(7)
    if (NYSE_HOLIDAYS_2026.has(p.key)) return false;   // NYSE resmî tatili
    const afterOpen = p.hour > NYSE_OPEN_HOUR || (p.hour === NYSE_OPEN_HOUR && p.minute >= NYSE_OPEN_MINUTE);
    return afterOpen && p.hour < NYSE_CLOSE_HOUR;
  }
  if (category !== 'bist') return true;
  const p = istanbulParts(at);
  if (p.weekday >= 6) return false;            // Cmt(6)/Paz(7)
  if (HOLIDAYS_2026.has(p.key)) return false;  // resmî tatil
  if (p.hour < BIST_OPEN_HOUR) return false;   // açılış öncesi
  if (p.hour >= BIST_CLOSE_HOUR) return false; // kapanış ve sonrası
  return true;
}

const DAY_MS = 86_400_000;
const MAX_LOOKAHEAD_DAYS = 14;

/** Verilen andan itibaren piyasanın açık olacağı bir sonraki anı döndürür.
 *  Şu an açıksa `at`'ı aynen döndürür. BIST dışı kategoriler hep açık → `at`.
 *  (Istanbul sabit UTC+3 olduğundan günün açılışı 10:00+03:00 olarak kurulur.) */
export function nextMarketOpen(category: AssetCategory, at: Date): Date {
  if (category !== 'bist') return at;
  if (isMarketOpen(category, at)) return at;
  for (let i = 0; i <= MAX_LOOKAHEAD_DAYS; i++) {
    const probeKey = istanbulParts(new Date(at.getTime() + i * DAY_MS)).key;
    const openAt = new Date(`${probeKey}T10:00:00+03:00`); // o günün açılış anı
    if (openAt.getTime() < at.getTime()) continue;          // açılışı geçmiş günü atla
    if (isMarketOpen('bist', openAt)) return openAt;        // hafta içi + tatil değil
  }
  return at; // güvenlik (14 gün içinde mutlaka açık seans var)
}
