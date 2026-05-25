# Sprint 1 — Domain Katmani Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core domain layer — clock, deposit, FX engine — plus game state management and localStorage persistence. All domain logic is pure TypeScript with TDD. No UI in this sprint.

**Architecture:** Pure TS domain modules (`src/lib/domain/`) are stateless function libraries tested with Vitest. A single `GameState` type holds all game data. A Svelte 5 reactive store wraps it for UI reactivity. Persistence uses localStorage now, designed for Supabase migration later.

**Tech Stack:** TypeScript (strict), Vitest, Svelte 5 runes (`$state`), SvelteKit API routes

**Spec:** `docs/superpowers/specs/2026-05-25-sprint1-domain-design.md`

**Baseline:** 21 tests passing (`src/lib/domain/money.test.ts`)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/domain/types.ts` | Shared `GameMode` type |
| `src/lib/domain/time/clock.ts` | Game clock: create, advance, pause/resume, finished check |
| `src/lib/domain/time/clock.test.ts` | Clock TDD tests (~16 tests) |
| `src/lib/domain/deposit/deposit.ts` | Deposit: open, close, interest calculation with stopaj |
| `src/lib/domain/deposit/deposit.test.ts` | Deposit TDD tests (~12 tests) |
| `src/lib/domain/fx/engine.ts` | FX rate fetching with cache + fallback |
| `src/lib/domain/fx/engine.test.ts` | FX engine TDD tests (~5 tests) |
| `src/lib/api/yahoo.ts` | Yahoo Finance API client (calls SvelteKit proxy route) |
| `src/routes/api/yahoo/+server.ts` | Server-side Yahoo Finance proxy with 5s cache |
| `src/lib/stores/game-state.ts` | `GameState` type + `createInitialState` pure factory |
| `src/lib/stores/game-state.test.ts` | Game state factory tests (~4 tests) |
| `src/lib/stores/persistence.ts` | localStorage save/load/clear adapter |
| `src/lib/stores/persistence.test.ts` | Persistence TDD tests (~4 tests) |
| `src/lib/stores/game.svelte.ts` | Svelte 5 reactive store (thin wrapper over domain) |

### Existing Files (unchanged)

| File | Notes |
|------|-------|
| `src/lib/domain/money.ts` | Used by deposit, game-state. Already tested. |
| `src/lib/domain/money.test.ts` | 21 tests baseline. |

### Dependency Graph

```
types.ts <-- clock.ts <-- game-state.ts <-- persistence.ts
money.ts <-- deposit.ts ----^               game.svelte.ts --^
              engine.ts ----^
yahoo.ts <-- +server.ts (API route, independent)
```

No cycles. Each domain module depends only on `money.ts` and/or `types.ts`.

---

## Task 1: Shared Types + Clock Module

**Files:**
- Create: `src/lib/domain/types.ts`
- Create: `src/lib/domain/time/clock.ts`
- Create: `src/lib/domain/time/clock.test.ts`

- [ ] **Step 1: Create shared types**

```ts
// src/lib/domain/types.ts
export type GameMode = 'vasiyet' | 'canli' | 'kriz2001' | 'kur2018';
```

- [ ] **Step 2: Write clock tests**

```ts
// src/lib/domain/time/clock.test.ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/domain/time/clock.test.ts`
Expected: FAIL — `./clock` module not found

- [ ] **Step 4: Implement clock module**

```ts
// src/lib/domain/time/clock.ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/domain/time/clock.test.ts`
Expected: 16 tests PASS

- [ ] **Step 6: Run full suite to check no regressions**

Run: `npx vitest run`
Expected: money (21) + clock (16) = 37 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/domain/types.ts src/lib/domain/time/clock.ts src/lib/domain/time/clock.test.ts
git commit -m "feat(domain): add clock module with TDD — 16 tests

Implements GameClock: create, advance, pause/resume, isFinished.
Mode-based total days (365/90/30/45) and default speed (turn/realtime).
Pure immutable functions, no UI deps."
```

---

## Task 2: Deposit Module

**Files:**
- Create: `src/lib/domain/deposit/deposit.ts`
- Create: `src/lib/domain/deposit/deposit.test.ts`

- [ ] **Step 1: Write deposit tests**

```ts
// src/lib/domain/deposit/deposit.test.ts
import { describe, it, expect } from 'vitest';
import { tryM, usd } from '../money';
import {
  openDeposit, closeDeposit, isMatured,
  calculateGrossInterest, calculateNetInterest,
  WITHHOLDING_TAX
} from './deposit';

describe('openDeposit', () => {
  it('creates with given parameters', () => {
    const d = openDeposit('d1', tryM(100_000), 30, 1, 0.42);
    expect(d.id).toBe('d1');
    expect(d.principal.amount).toBe(100_000);
    expect(d.principal.currency).toBe('TRY');
    expect(d.termDays).toBe(30);
    expect(d.openedDay).toBe(1);
    expect(d.annualRate).toBe(0.42);
  });
  it('rejects non-TRY principal', () => {
    expect(() => openDeposit('d1', usd(1000), 30, 1, 0.42))
      .toThrow('Deposit must be in TRY');
  });
  it('rejects zero principal', () => {
    expect(() => openDeposit('d1', tryM(0), 30, 1, 0.42))
      .toThrow('Principal must be positive');
  });
  it('rejects negative principal', () => {
    expect(() => openDeposit('d1', tryM(-100), 30, 1, 0.42))
      .toThrow('Principal must be positive');
  });
});

describe('isMatured', () => {
  // opened day 10, 30-day term -> matures at day 40
  const d = openDeposit('d1', tryM(100_000), 30, 10, 0.42);
  it('false before term ends', () => {
    expect(isMatured(d, 30)).toBe(false);
    expect(isMatured(d, 39)).toBe(false);
  });
  it('true on exact maturity day', () => {
    expect(isMatured(d, 40)).toBe(true);
  });
  it('true after maturity', () => {
    expect(isMatured(d, 50)).toBe(true);
  });
});

describe('calculateGrossInterest', () => {
  // 100,000 TRY at 42% annual for 30 days
  const d = openDeposit('d1', tryM(100_000), 30, 1, 0.42);
  it('zero before maturity', () => {
    expect(calculateGrossInterest(d, 15).amount).toBe(0);
  });
  it('correct 30-day calculation', () => {
    // 100,000 * 0.42 * (30/365) = 3,452.05
    const gross = calculateGrossInterest(d, 31);
    expect(gross.amount).toBeCloseTo(3452.05, 0);
    expect(gross.currency).toBe('TRY');
  });
});

describe('calculateNetInterest', () => {
  const d = openDeposit('d1', tryM(100_000), 30, 1, 0.42);
  it('applies 7.5% withholding tax (stopaj)', () => {
    // Gross 3,452.05 * (1 - 0.075) = 3,193.15
    const net = calculateNetInterest(d, 31);
    expect(net.amount).toBeCloseTo(3193.15, 0);
    expect(net.currency).toBe('TRY');
  });
  it('WITHHOLDING_TAX constant is 0.075', () => {
    expect(WITHHOLDING_TAX).toBe(0.075);
  });
});

describe('closeDeposit', () => {
  const d = openDeposit('d1', tryM(100_000), 30, 1, 0.42);
  it('early withdrawal = principal only, no interest', () => {
    const result = closeDeposit(d, 15);
    expect(result.amount).toBe(100_000);
    expect(result.currency).toBe('TRY');
  });
  it('matured = principal + net interest', () => {
    // 100,000 + 3,193.15 = 103,193.15
    const result = closeDeposit(d, 31);
    expect(result.amount).toBeCloseTo(103_193.15, 0);
    expect(result.currency).toBe('TRY');
  });
});

describe('90-day deposit', () => {
  const d = openDeposit('d2', tryM(500_000), 90, 1, 0.42);
  it('correct gross for 90 days', () => {
    // 500,000 * 0.42 * (90/365) = 51,780.82
    const gross = calculateGrossInterest(d, 91);
    expect(gross.amount).toBeCloseTo(51_780.82, 0);
  });
  it('correct close amount for 90 days', () => {
    // Net: 51,780.82 * 0.925 = 47,897.26
    // Close: 500,000 + 47,897.26 = 547,897.26
    const result = closeDeposit(d, 91);
    expect(result.amount).toBeCloseTo(547_897.26, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/domain/deposit/deposit.test.ts`
Expected: FAIL — `./deposit` module not found

- [ ] **Step 3: Implement deposit module**

```ts
// src/lib/domain/deposit/deposit.ts
import type { Money } from '../money';
import { tryM, multiply, add } from '../money';

export interface Deposit {
  readonly id: string;
  readonly principal: Money;
  readonly termDays: 30 | 90 | 180;
  readonly openedDay: number;
  readonly annualRate: number;
}

export const WITHHOLDING_TAX = 0.075;

export function openDeposit(
  id: string,
  principal: Money,
  termDays: 30 | 90 | 180,
  currentDay: number,
  rate: number,
): Deposit {
  if (principal.currency !== 'TRY') throw new Error('Deposit must be in TRY');
  if (principal.amount <= 0) throw new Error('Principal must be positive');
  return { id, principal, termDays, openedDay: currentDay, annualRate: rate };
}

export function isMatured(deposit: Deposit, currentDay: number): boolean {
  return currentDay >= deposit.openedDay + deposit.termDays;
}

export function calculateGrossInterest(deposit: Deposit, currentDay: number): Money {
  if (!isMatured(deposit, currentDay)) return tryM(0);
  const dayFraction = deposit.termDays / 365;
  return multiply(deposit.principal, deposit.annualRate * dayFraction);
}

export function calculateNetInterest(deposit: Deposit, currentDay: number): Money {
  const gross = calculateGrossInterest(deposit, currentDay);
  return multiply(gross, 1 - WITHHOLDING_TAX);
}

export function closeDeposit(deposit: Deposit, currentDay: number): Money {
  if (!isMatured(deposit, currentDay)) return deposit.principal;
  return add(deposit.principal, calculateNetInterest(deposit, currentDay));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/domain/deposit/deposit.test.ts`
Expected: 12 tests PASS

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: money (21) + clock (16) + deposit (12) = 49 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/deposit/deposit.ts src/lib/domain/deposit/deposit.test.ts
git commit -m "feat(domain): add deposit module with TDD — 12 tests

Simple interest model: %42 annual, %7.5 stopaj, early exit = principal only.
30/90/180 day terms. Pure functions, Money type throughout."
```

---

## Task 3: FX Engine

**Files:**
- Create: `src/lib/domain/fx/engine.ts`
- Create: `src/lib/domain/fx/engine.test.ts`

- [ ] **Step 1: Write FX engine tests**

```ts
// src/lib/domain/fx/engine.test.ts
import { describe, it, expect } from 'vitest';
import { createFxEngine, DEFAULT_RATE } from './engine';

describe('DEFAULT_RATE', () => {
  it('is 32.00', () => {
    expect(DEFAULT_RATE).toBe(32.00);
  });
});

describe('createFxEngine', () => {
  it('returns fetched rate on success', async () => {
    const engine = createFxEngine(async () => 34.50);
    expect(await engine.getRate()).toBe(34.50);
  });

  it('returns DEFAULT_RATE on first fetch failure', async () => {
    const engine = createFxEngine(async () => { throw new Error('network'); });
    expect(await engine.getRate()).toBe(DEFAULT_RATE);
  });

  it('caches last successful rate for fallback', async () => {
    let call = 0;
    const engine = createFxEngine(async () => {
      call++;
      if (call === 1) return 35.00;
      throw new Error('down');
    });
    expect(await engine.getRate()).toBe(35.00); // first: success
    expect(await engine.getRate()).toBe(35.00); // second: fails, uses cache
  });

  it('getLastKnownRate starts at DEFAULT_RATE', () => {
    const engine = createFxEngine(async () => 34.50);
    expect(engine.getLastKnownRate()).toBe(DEFAULT_RATE);
  });

  it('getLastKnownRate updates after fetch', async () => {
    const engine = createFxEngine(async () => 35.10);
    await engine.getRate();
    expect(engine.getLastKnownRate()).toBe(35.10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/domain/fx/engine.test.ts`
Expected: FAIL — `./engine` module not found

- [ ] **Step 3: Implement FX engine**

```ts
// src/lib/domain/fx/engine.ts
export const DEFAULT_RATE = 32.00;

export interface FxEngine {
  getRate(): Promise<number>;
  getLastKnownRate(): number;
}

export function createFxEngine(
  fetcher: () => Promise<number>,
): FxEngine {
  let lastKnownRate = DEFAULT_RATE;

  return {
    async getRate(): Promise<number> {
      try {
        const rate = await fetcher();
        lastKnownRate = rate;
        return rate;
      } catch {
        return lastKnownRate;
      }
    },
    getLastKnownRate(): number {
      return lastKnownRate;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/domain/fx/engine.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: money (21) + clock (16) + deposit (12) + fx (5) = 54 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/fx/engine.ts src/lib/domain/fx/engine.test.ts
git commit -m "feat(domain): add FX engine with TDD — 5 tests

Factory pattern: createFxEngine(fetcher) returns cached rate with fallback.
DEFAULT_RATE 32.00 TRY. Network failures return last known rate."
```

---

## Task 4: Yahoo API Route + Client

**Files:**
- Create: `src/routes/api/yahoo/+server.ts`
- Create: `src/lib/api/yahoo.ts`

No TDD for this task — it's I/O code (network proxy). Tested via integration.

- [ ] **Step 1: Create SvelteKit API proxy route**

Reference `legacy/server.js` for Yahoo Finance URL patterns. The route fetches server-side (no CORS issues) and caches for 5 seconds.

```ts
// src/routes/api/yahoo/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

let cachedRate: number | null = null;
let cacheTime = 0;
const CACHE_TTL = 5000;

export const GET: RequestHandler = async () => {
  const now = Date.now();
  if (cachedRate !== null && now - cacheTime < CACHE_TTL) {
    return json({ rate: cachedRate, cached: true });
  }

  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/USDTRY=X?interval=1d&range=1d';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const data = await res.json();
    const rate = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof rate !== 'number') throw new Error('Invalid rate data');
    cachedRate = rate;
    cacheTime = now;
    return json({ rate, cached: false });
  } catch (err) {
    if (cachedRate !== null) {
      return json({ rate: cachedRate, cached: true, stale: true });
    }
    return json({ rate: null, error: String(err) }, { status: 502 });
  }
};
```

- [ ] **Step 2: Create API client**

```ts
// src/lib/api/yahoo.ts
export async function fetchUsdTryRate(): Promise<number> {
  const res = await fetch('/api/yahoo');
  if (!res.ok) throw new Error(`Yahoo API error: ${res.status}`);
  const data: { rate: number | null; error?: string } = await res.json();
  if (data.rate === null) throw new Error(data.error ?? 'Rate unavailable');
  return data.rate;
}
```

- [ ] **Step 3: Verify build passes**

Run: `npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json`
Expected: No errors (type check passes)

- [ ] **Step 4: Run full test suite (no regressions)**

Run: `npx vitest run`
Expected: 54 tests PASS (unchanged)

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/yahoo/+server.ts src/lib/api/yahoo.ts
git commit -m "feat(api): add Yahoo Finance USD/TRY proxy route

Server-side proxy with 5s cache. Returns { rate, cached } JSON.
Graceful fallback: stale cache on error, 502 if no cache.
Client function fetchUsdTryRate() for FX engine consumption."
```

---

## Task 5: Game State

**Files:**
- Create: `src/lib/stores/game-state.ts`
- Create: `src/lib/stores/game-state.test.ts`

GameState is a plain TS type + factory function. Separated from Svelte reactive store for testability.

- [ ] **Step 1: Write game state tests**

```ts
// src/lib/stores/game-state.test.ts
import { describe, it, expect } from 'vitest';
import { createInitialState, DEPOSIT_ANNUAL_RATE } from './game-state';

describe('createInitialState', () => {
  it('creates vasiyet mode with correct defaults', () => {
    const s = createInitialState('vasiyet', 'player-1');
    expect(s.playerId).toBe('player-1');
    expect(s.mode).toBe('vasiyet');
    expect(s.clock.day).toBe(1);
    expect(s.clock.totalDays).toBe(365);
    expect(s.clock.speed).toBe('turn');
    expect(s.usdBalance.amount).toBe(1_000_000);
    expect(s.usdBalance.currency).toBe('USD');
    expect(s.tryBalance.amount).toBe(0);
    expect(s.tryBalance.currency).toBe('TRY');
    expect(s.deposits).toEqual([]);
    expect(s.fxRate).toBe(32.00);
  });

  it('creates canli mode with 90 days', () => {
    const s = createInitialState('canli', 'p2');
    expect(s.clock.totalDays).toBe(90);
    expect(s.clock.speed).toBe('realtime');
  });

  it('is JSON-serializable (no circular refs, no functions)', () => {
    const s = createInitialState('vasiyet', 'p1');
    const json = JSON.stringify(s);
    const parsed = JSON.parse(json);
    expect(parsed.usdBalance.amount).toBe(1_000_000);
    expect(parsed.clock.day).toBe(1);
    expect(parsed.deposits).toEqual([]);
  });

  it('DEPOSIT_ANNUAL_RATE is 0.42', () => {
    expect(DEPOSIT_ANNUAL_RATE).toBe(0.42);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/stores/game-state.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement game state**

```ts
// src/lib/stores/game-state.ts
import type { GameMode } from '$lib/domain/types';
import type { GameClock } from '$lib/domain/time/clock';
import { createClock } from '$lib/domain/time/clock';
import type { Deposit } from '$lib/domain/deposit/deposit';
import type { Money } from '$lib/domain/money';
import { usd, tryM } from '$lib/domain/money';
import { DEFAULT_RATE } from '$lib/domain/fx/engine';

export const DEPOSIT_ANNUAL_RATE = 0.42;

export interface GameState {
  playerId: string;
  mode: GameMode;
  clock: GameClock;
  usdBalance: Money;
  tryBalance: Money;
  deposits: Deposit[];
  fxRate: number;
  createdAt: number;
  updatedAt: number;
}

export function createInitialState(mode: GameMode, playerId: string): GameState {
  return {
    playerId,
    mode,
    clock: createClock(mode),
    usdBalance: usd(1_000_000),
    tryBalance: tryM(0),
    deposits: [],
    fxRate: DEFAULT_RATE,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/stores/game-state.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: money (21) + clock (16) + deposit (12) + fx (5) + game-state (4) = 58 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/stores/game-state.ts src/lib/stores/game-state.test.ts
git commit -m "feat(stores): add GameState type + createInitialState — 4 tests

Pure factory function. $1M USD start, FX rate 32.00 fallback.
JSON-serializable (no circular refs). Ready for Svelte store wrapper."
```

---

## Task 6: Persistence Adapter

**Files:**
- Create: `src/lib/stores/persistence.ts`
- Create: `src/lib/stores/persistence.test.ts`

- [ ] **Step 1: Write persistence tests**

```ts
// src/lib/stores/persistence.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { save, load, clear, STORAGE_KEY } from './persistence';
import { createInitialState } from './game-state';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
});

describe('persistence', () => {
  it('save + load round-trip preserves state', () => {
    const state = createInitialState('vasiyet', 'p1');
    save(state);
    const loaded = load();
    expect(loaded).not.toBeNull();
    expect(loaded!.playerId).toBe('p1');
    expect(loaded!.usdBalance.amount).toBe(1_000_000);
    expect(loaded!.clock.day).toBe(1);
  });

  it('load returns null when no saved state', () => {
    expect(load()).toBeNull();
  });

  it('load returns null for corrupted JSON', () => {
    storage.set(STORAGE_KEY, '{{{invalid json!!!');
    expect(load()).toBeNull();
  });

  it('clear removes saved state', () => {
    save(createInitialState('vasiyet', 'p1'));
    clear();
    expect(load()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/stores/persistence.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement persistence**

```ts
// src/lib/stores/persistence.ts
import type { GameState } from './game-state';

export const STORAGE_KEY = 'miras-game-state';

export function save(state: GameState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function load(): GameState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

export function clear(): void {
  localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/stores/persistence.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: money (21) + clock (16) + deposit (12) + fx (5) + game-state (4) + persistence (4) = 62 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/stores/persistence.ts src/lib/stores/persistence.test.ts
git commit -m "feat(stores): add localStorage persistence — 4 tests

save/load/clear adapter. Handles missing keys, corrupted JSON.
STORAGE_KEY = 'miras-game-state'. Supabase-ready: only this file changes on migration."
```

---

## Task 7: Reactive Game Store + Final Verification

**Files:**
- Create: `src/lib/stores/game.svelte.ts`

No unit tests for this file — it's a thin Svelte 5 reactive wrapper over tested domain functions. The domain layer IS the test boundary. UI testing comes in Sprint 1B.

**Important:** This file MUST use `.svelte.ts` extension (not `.ts`) to enable Svelte 5 runes (`$state`).

- [ ] **Step 1: Create reactive game store**

```ts
// src/lib/stores/game.svelte.ts
import type { GameMode } from '$lib/domain/types';
import { advanceDay, pause as clockPause, resume as clockResume, isFinished } from '$lib/domain/time/clock';
import { openDeposit, closeDeposit } from '$lib/domain/deposit/deposit';
import { usd, tryM, subtract, add, toTRY, toUSD, gte } from '$lib/domain/money';
import { createInitialState, DEPOSIT_ANNUAL_RATE, type GameState } from './game-state';
import { save, load, clear } from './persistence';

function createGameStore() {
  let state = $state<GameState | null>(null);
  let idCounter = $state(0);

  function nextId(): string {
    idCounter++;
    return `dep-${idCounter}`;
  }

  return {
    get state() { return state; },
    get isGameOver() { return state ? isFinished(state.clock) : false; },

    startGame(mode: GameMode, playerId?: string) {
      state = createInitialState(mode, playerId ?? crypto.randomUUID());
    },

    loadGame() {
      state = load();
    },

    saveGame() {
      if (state) save(state);
    },

    resetGame() {
      state = null;
      clear();
    },

    tick() {
      if (!state || isFinished(state.clock)) return;
      state.clock = advanceDay(state.clock);
      state.updatedAt = Date.now();
    },

    pauseGame() {
      if (!state) return;
      state.clock = clockPause(state.clock);
    },

    resumeGame() {
      if (!state) return;
      state.clock = clockResume(state.clock);
    },

    updateFxRate(rate: number) {
      if (!state) return;
      state.fxRate = rate;
      state.updatedAt = Date.now();
    },

    exchangeToTRY(usdAmount: number) {
      if (!state) return;
      const amount = usd(usdAmount);
      if (!gte(state.usdBalance, amount)) return;
      state.usdBalance = subtract(state.usdBalance, amount);
      state.tryBalance = add(state.tryBalance, toTRY(amount, state.fxRate));
      state.updatedAt = Date.now();
    },

    exchangeToUSD(tryAmount: number) {
      if (!state) return;
      const amount = tryM(tryAmount);
      if (!gte(state.tryBalance, amount)) return;
      state.tryBalance = subtract(state.tryBalance, amount);
      state.usdBalance = add(state.usdBalance, toUSD(amount, state.fxRate));
      state.updatedAt = Date.now();
    },

    openNewDeposit(tryAmount: number, termDays: 30 | 90 | 180) {
      if (!state) return;
      const principal = tryM(tryAmount);
      if (!gte(state.tryBalance, principal)) return;
      state.tryBalance = subtract(state.tryBalance, principal);
      const deposit = openDeposit(
        nextId(),
        principal,
        termDays,
        state.clock.day,
        DEPOSIT_ANNUAL_RATE,
      );
      state.deposits = [...state.deposits, deposit];
      state.updatedAt = Date.now();
    },

    closeExistingDeposit(depositId: string) {
      if (!state) return;
      const deposit = state.deposits.find(d => d.id === depositId);
      if (!deposit) return;
      const proceeds = closeDeposit(deposit, state.clock.day);
      state.tryBalance = add(state.tryBalance, proceeds);
      state.deposits = state.deposits.filter(d => d.id !== depositId);
      state.updatedAt = Date.now();
    },
  };
}

export const game = createGameStore();
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json`
Expected: No errors

- [ ] **Step 3: Run full test suite — final verification**

Run: `npx vitest run`
Expected: **62 tests PASS** across 6 test files:
- `money.test.ts` — 21
- `clock.test.ts` — 16
- `deposit.test.ts` — 12
- `engine.test.ts` — 5
- `game-state.test.ts` — 4
- `persistence.test.ts` — 4

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/game.svelte.ts
git commit -m "feat(stores): add Svelte 5 reactive game store

Thin wrapper over domain functions using \$state rune.
Exposes: startGame, tick, pause/resume, FX update,
currency exchange, deposit open/close, persistence.
62 total tests passing."
```

- [ ] **Step 6: Final full verification**

Run: `npm run test && npm run build`
Expected: All 62 tests pass, build succeeds. Sprint 1 domain layer complete.
