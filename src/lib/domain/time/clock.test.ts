import { describe, it, expect } from 'vitest';
import {
  createClock, advanceDay, pause, resume,
  isFinished, getModeTotalDays
} from './clock';

describe('getModeTotalDays', () => {
  it('vasiyet = 365', () => {
    expect(getModeTotalDays('vasiyet')).toBe(365);
  });
  it('canli = 90', () => {
    expect(getModeTotalDays('canli')).toBe(90);
  });
  it('kriz2001 = 30', () => {
    expect(getModeTotalDays('kriz2001')).toBe(30);
  });
  it('kur2018 = 45', () => {
    expect(getModeTotalDays('kur2018')).toBe(45);
  });
});

describe('createClock', () => {
  it('starts at day 1', () => {
    const clock = createClock('vasiyet');
    expect(clock.day).toBe(1);
    expect(clock.totalDays).toBe(365);
    expect(clock.paused).toBe(false);
  });
  it('vasiyet defaults to turn speed', () => {
    expect(createClock('vasiyet').speed).toBe('turn');
  });
  it('canli defaults to realtime speed', () => {
    expect(createClock('canli').speed).toBe('realtime');
  });
  it('kriz2001 defaults to realtime speed', () => {
    expect(createClock('kriz2001').speed).toBe('realtime');
  });
});

describe('advanceDay', () => {
  it('increments day by 1', () => {
    const next = advanceDay(createClock('vasiyet'));
    expect(next.day).toBe(2);
  });
  it('returns new object (immutable)', () => {
    const clock = createClock('vasiyet');
    const next = advanceDay(clock);
    expect(next).not.toBe(clock);
    expect(clock.day).toBe(1); // original unchanged
  });
  it('does not advance when paused', () => {
    const paused = pause(createClock('vasiyet'));
    const result = advanceDay(paused);
    expect(result.day).toBe(1);
    expect(result).toBe(paused); // same ref = no change
  });
  it('does not advance past totalDays', () => {
    const atEnd = { ...createClock('kriz2001'), day: 30 };
    const result = advanceDay(atEnd);
    expect(result.day).toBe(30);
    expect(result).toBe(atEnd);
  });
});

describe('pause / resume', () => {
  it('pause sets paused true', () => {
    expect(pause(createClock('vasiyet')).paused).toBe(true);
  });
  it('resume sets paused false', () => {
    const p = pause(createClock('vasiyet'));
    expect(resume(p).paused).toBe(false);
  });
});

describe('isFinished', () => {
  it('false on day 1', () => {
    expect(isFinished(createClock('vasiyet'))).toBe(false);
  });
  it('true when day equals totalDays', () => {
    expect(isFinished({ ...createClock('kriz2001'), day: 30 })).toBe(true);
  });
  it('true when day exceeds totalDays', () => {
    expect(isFinished({ ...createClock('kriz2001'), day: 31 })).toBe(true);
  });
});
