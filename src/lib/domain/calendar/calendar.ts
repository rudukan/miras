import { HOLIDAYS_2026 } from './holidays2026';

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
