import type { GameMode } from '../types';

export type ClockSpeed = 'realtime' | 'turn';

export interface GameClock {
  readonly day: number;
  readonly totalDays: number;
  readonly speed: ClockSpeed;
  readonly paused: boolean;
}

const MODE_DAYS: Record<GameMode, number> = {
  vasiyet: 365,
  canli: 90,
  kriz2001: 30,
  kur2018: 45,
};

const MODE_DEFAULT_SPEED: Record<GameMode, ClockSpeed> = {
  vasiyet: 'turn',
  canli: 'realtime',
  kriz2001: 'realtime',
  kur2018: 'realtime',
};

export function getModeTotalDays(mode: GameMode): number {
  return MODE_DAYS[mode];
}

export function createClock(mode: GameMode): GameClock {
  return {
    day: 1,
    totalDays: MODE_DAYS[mode],
    speed: MODE_DEFAULT_SPEED[mode],
    paused: false,
  };
}

export function advanceDay(clock: GameClock): GameClock {
  if (clock.paused || isFinished(clock)) return clock;
  return { ...clock, day: clock.day + 1 };
}

export function pause(clock: GameClock): GameClock {
  return { ...clock, paused: true };
}

export function resume(clock: GameClock): GameClock {
  return { ...clock, paused: false };
}

export function isFinished(clock: GameClock): boolean {
  return clock.day >= clock.totalDays;
}
