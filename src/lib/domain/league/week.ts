import { istanbulParts, newYorkParts } from '../calendar/calendar';
import { NYSE_HOLIDAYS_2026 } from '../calendar/nyseHolidays2026';

/** Cuma NYSE kapanışı: 16:00 America/New_York. DST iki yönde de denenir (EDT/EST). */
const NYSE_CLOSE_HOUR = 16;
const NY_CLOSE_CANDIDATE_OFFSETS = ['-04:00', '-05:00'];
/** NYSE'nin kapalı olduğu cumalarda kilit ölçeği: BIST kapanış sonrası tampon (spec kararı).
 *  BIST seansı 18:00'de biter; 18:00-18:15 arasında zaten işlem yapılamaz. */
const BIST_LOCK_CLOCK = '18:15:00';
/** Europe/Istanbul 2016'dan beri sabit UTC+3 — DST yok, literal offset güvenli. */
const IST_OFFSET = '+03:00';

/** 'YYYY-MM-DD' anahtarına gün ekler/çıkarır (saf takvim aritmetiği, tz-bağımsız). */
function addDaysToKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `at` anının içinde bulunduğu lig haftasının kimliği — o haftanın pazartesisi (İstanbul günü). */
export function leagueWeekKey(at: Date): string {
  const p = istanbulParts(at);
  return addDaysToKey(p.key, -(p.weekday - 1)); // weekday: 1=Pzt..7=Paz
}

/** Haftanın açılış anı: pazartesi 00:00 Europe/Istanbul. */
export function leagueWeekStart(at: Date): Date {
  return new Date(`${leagueWeekKey(at)}T00:00:00${IST_OFFSET}`);
}

/** Haftanın skor kilit anı. Normalde cuma NYSE kapanışı (DST-duyarlı); o cuma NYSE
 *  tatiliyse cuma 18:15 Europe/Istanbul. `weekKey` = pazartesi anahtarı. */
export function leagueLockMoment(weekKey: string): Date {
  const fridayKey = addDaysToKey(weekKey, 4);
  if (!NYSE_HOLIDAYS_2026.has(fridayKey)) {
    for (const offset of NY_CLOSE_CANDIDATE_OFFSETS) {
      const cand = new Date(`${fridayKey}T${String(NYSE_CLOSE_HOUR).padStart(2, '0')}:00:00${offset}`);
      const p = newYorkParts(cand);
      // Yanlış DST adayı geri okunduğunda 16:00'a denk gelmez — o adayı atla.
      if (p.key === fridayKey && p.hour === NYSE_CLOSE_HOUR && p.minute === 0) return cand;
    }
  }
  return new Date(`${fridayKey}T${BIST_LOCK_CLOCK}${IST_OFFSET}`);
}

/** Verilen anda lig işlemi (damgalı) kabul ediliyor mu? Kilit anından sonrası antrenmandır. */
export function isLeagueOpen(at: Date): boolean {
  return at.getTime() < leagueLockMoment(leagueWeekKey(at)).getTime();
}
