/**
 * Simülasyon koşucu altyapısı — SADECE test amaçlı, production bundle'a girmez.
 *
 * Sorumluluğu:
 * 1. Verilen strateji + seed + senaryo için 365 günlük oyunu koşturur.
 * 2. Her gün için FxEngine'den günlük oracle inşa eder (saf hesaplama, network YOK).
 * 3. Deposit/property dahil gerçek net serveti hesaplar (gameState.netWorthUsd
 *    bu ikisini saymaz — burada düzeltiriz).
 * 4. Son gün net serveti döndürür (USD Money).
 */

import { createFxEngine } from '../../src/lib/domain/fx/fx';
import type { FxEngine } from '../../src/lib/domain/fx/fx';
import type { UsdPriceOracle } from '../../src/lib/domain/fx/usdOracle';
import {
  createGameState,
  buyAsset,
  sellAsset,
  advanceTime,
  openDeposit,
  breakDeposit,
  netWorthUsd,
  STARTING_USD,
} from '../../src/lib/stores/gameState';
import type { GameState } from '../../src/lib/stores/gameState';
import { usd } from '../../src/lib/domain/money';
import { VASIYET_2025 } from '../../src/lib/data/macro2025';
import type { Scenario } from '../../src/lib/domain/scenario/types';
import { currentValueTry, isMatured, maturityNetValueTry, TERM_DAYS } from '../../src/lib/domain/deposit/deposit';

const DAY_MS = 86_400_000;
const SCENARIO = VASIYET_2025;

/**
 * Günlük USD oracle — FxEngine TRY fiyatlarını usdTry ile böler.
 * Kripto/altın/gümüş/BIST/EUR hepsi TRY cinsinden tanımlı → hepsi aynı çevrim.
 */
function buildDayOracle(engine: FxEngine, day: number): UsdPriceOracle {
  const usdTry = engine.usdTryForDay(day).amount;
  return {
    assetUsd(assetId: string) {
      const tryPrice = engine.assetPriceForDay(assetId, day).amount;
      return usd(tryPrice / usdTry);
    },
  };
}

/**
 * Gerçek net servet (USD): usdBalance + holdings + deposit (mark-to-market) + property (alım bedeli).
 * gameState.netWorthUsd deposit/property'yi saymaz — bu fonksiyon tam tabloyu verir.
 */
function fullNetWorthUsd(state: GameState, oracle: UsdPriceOracle, day: number, engine: FxEngine): number {
  // nakit + hisseler (gameState.netWorthUsd hesaplar)
  let total = netWorthUsd(state, oracle).amount;

  // aktif mevduat: birikmiş net faiz dahil TL değeri → USD
  if (state.deposit !== null) {
    const nowMs = day * DAY_MS;
    const usdTry = engine.usdTryForDay(day).amount;
    const tryVal = currentValueTry(state.deposit, nowMs).amount;
    total += tryVal / usdTry;
  }

  // emlaklar: alım bedeli TL sabit → güncel kurla USD
  if (state.properties.length > 0) {
    const usdTry = engine.usdTryForDay(day).amount;
    for (const p of state.properties) {
      total += p.priceTryAtBuy.amount / usdTry;
    }
  }

  return total;
}

/**
 * Kazanma eşiği: "hiçbir şey yapmama" taban çizgisi.
 * $1,000,000 × (1 + dailyInflation)^totalDays — hardcode edilmez.
 */
export function winThreshold(scenario: Scenario): number {
  const { dailyInflation } = scenario.data;
  const { totalDays } = scenario;
  return STARTING_USD * Math.pow(1 + dailyInflation, totalDays);
}

// ─── Strateji tipleri ─────────────────────────────────────────────────────────

export type StrategyFn = (
  state: GameState,
  day: number,
  engine: FxEngine,
) => GameState;

// ─── 4 Temsili Strateji ────────────────────────────────────────────────────────

/**
 * (a) BASELINE — tam pasif: sadece USD nakit tut, hiçbir şey yapma.
 * Sanity-check: kazanma oranı ~%0 olmalı (enflasyon barını geçemez).
 */
export const strategyBaseline: StrategyFn = (state) => state;

/**
 * (b) CONSERVATIVE — tamamen TL mevduat: başlangıçta %80 USD → TL yatır,
 * 32 günlük vadeyi düzenli yenileyerek devam et.
 */
export const strategyConservative: StrategyFn = (state, day, engine) => {
  const usdTry = engine.usdTryForDay(day).amount;
  const nowMs = day * DAY_MS;

  // Gün 1: ilk mevduatı aç
  if (day === 1 && state.deposit === null) {
    const depositUsd = state.usdBalance.amount * 0.80;
    return openDeposit(state, usdTry, depositUsd, nowMs);
  }

  // Vade dolduysa boz + hemen yeniden aç
  if (state.deposit !== null && isMatured(state.deposit, nowMs)) {
    const broken = breakDeposit(state, usdTry, nowMs);
    const depositUsd = broken.usdBalance.amount * 0.80;
    if (depositUsd > 0) {
      return openDeposit(broken, usdTry, depositUsd, nowMs);
    }
    return broken;
  }

  return state;
};

/**
 * (c) BALANCED — BIST ağırlıklı + küçük mevduat tamponu (CLAUDE.md'nin asıl denge hedefi).
 * Başlangıçta: %65 → 6 BIST hissesi (geniş sepet), %15 → mevduat, %20 → nakit tamponu.
 * BIST yüksek volatilitesi %30-70 pencereye kayma sağlar; küçük mevduat
 * riski biraz dengeler. Seed varyansına göre %30-70 aralığını hedefler.
 */
const BALANCED_BIST = ['THYAO', 'ASELS', 'KCHOL', 'YKBNK', 'BIMAS', 'TUPRS'] as const;

export const strategyBalanced: StrategyFn = (state, day, engine) => {
  const usdTry = engine.usdTryForDay(day).amount;
  const nowMs = day * DAY_MS;
  const oracle = buildDayOracle(engine, day);

  // Gün 1: portföy kur
  if (day === 1) {
    let s = state;
    const total = s.usdBalance.amount;
    const bistUsd = total * 0.65;   // büyük BIST bileşeni — volatility %30-70 pencereye taşır
    const depositUsd = total * 0.15; // küçük güvenlik tamponu
    const perStock = bistUsd / BALANCED_BIST.length;

    // BIST alımları
    for (const ticker of BALANCED_BIST) {
      const price = oracle.assetUsd(ticker).amount;
      if (price > 0) {
        const units = perStock / price;
        s = buyAsset(s, oracle, ticker, units);
      }
    }

    // Küçük mevduat tamponu
    if (depositUsd > 0 && s.usdBalance.amount >= depositUsd) {
      s = openDeposit(s, usdTry, depositUsd, nowMs);
    }

    return s;
  }

  // Mevduat vadesi dolduysa yenile (küçük tampon korunur)
  if (state.deposit !== null && isMatured(state.deposit, nowMs)) {
    const broken = breakDeposit(state, usdTry, nowMs);
    const depositUsd = broken.usdBalance.amount * 0.50;
    if (depositUsd > 1) {
      return openDeposit(broken, usdTry, depositUsd, nowMs);
    }
    return broken;
  }

  return state;
};

/**
 * (d) AGGRESSIVE — BIST + kripto ağırlıklı buy-and-hold, TAM YATIRIM (nakit tamponu yok).
 * Başlangıçta: %50 → BIST (geniş sepet), %50 → BTC+ETH — gerçek bir risk-arayan oyuncu
 * hiçbir payı boşta bırakmaz (önceki %30 atıl nakit, agresif stratejiyi haksız yere
 * cezalandırıyordu — mevduatla bile karşılaştırılamaz hale getiriyordu).
 * Kripto/BIST buy-and-hold; yıl sonu sat.
 */
const AGGRESSIVE_BIST = ['THYAO', 'ASELS', 'YKBNK', 'GUBRF', 'KCHOL'] as const;

export const strategyAggressive: StrategyFn = (state, day, engine) => {
  const oracle = buildDayOracle(engine, day);

  if (day === 1) {
    let s = state;
    const total = s.usdBalance.amount;
    const bistUsd = total * 0.50;
    const cryptoUsd = total * 0.50;
    const perBist = bistUsd / AGGRESSIVE_BIST.length;

    // BIST alımları
    for (const ticker of AGGRESSIVE_BIST) {
      const price = oracle.assetUsd(ticker).amount;
      if (price > 0) {
        const units = perBist / price;
        s = buyAsset(s, oracle, ticker, units);
      }
    }

    // Kripto: %50 BTC, %50 ETH
    const halfCrypto = cryptoUsd / 2;
    const btcPrice = oracle.assetUsd('BTC').amount;
    const ethPrice = oracle.assetUsd('ETH').amount;
    if (btcPrice > 0) s = buyAsset(s, oracle, 'BTC', halfCrypto / btcPrice);
    if (ethPrice > 0) s = buyAsset(s, oracle, 'ETH', halfCrypto / ethPrice);

    return s;
  }

  return state;
};

// ─── Ana koşucu ───────────────────────────────────────────────────────────────

export interface RunResult {
  finalNetWorthUsd: number;
  won: boolean;
}

/**
 * Tek bir oyun koşusu: verilen seed + strateji + senaryo ile 365 gün simüle et.
 */
export function runSimulation(seed: number, strategy: StrategyFn): RunResult {
  const engine = createFxEngine(SCENARIO, seed);
  const threshold = winThreshold(SCENARIO);

  let state = createGameState('vasiyet', seed, `sim-${seed}`, 0);

  for (let day = 1; day <= SCENARIO.totalDays; day++) {
    // 1. Strateji kararını ver (bu gün ne yapacağız?)
    state = strategy(state, day, engine);

    // 2. Günü ilerlet (son günde değil)
    if (day < SCENARIO.totalDays) {
      state = advanceTime(state, 1);
    }
  }

  // Son gün oracle
  const finalOracle = buildDayOracle(engine, SCENARIO.totalDays);
  const finalNetWorth = fullNetWorthUsd(state, finalOracle, SCENARIO.totalDays, engine);

  return {
    finalNetWorthUsd: finalNetWorth,
    won: finalNetWorth >= threshold,
  };
}

/**
 * 1000 seed üzerinde bir stratejiyi koştur, kazanma oranını (0-1) döndür.
 */
export function runWinnabilityTest(
  strategy: StrategyFn,
  runs = 1000,
): { winRate: number; meanFinalNetWorth: number; minNetWorth: number; maxNetWorth: number } {
  let wins = 0;
  let totalNetWorth = 0;
  let minNetWorth = Infinity;
  let maxNetWorth = -Infinity;

  for (let seed = 0; seed < runs; seed++) {
    const result = runSimulation(seed, strategy);
    if (result.won) wins++;
    totalNetWorth += result.finalNetWorthUsd;
    if (result.finalNetWorthUsd < minNetWorth) minNetWorth = result.finalNetWorthUsd;
    if (result.finalNetWorthUsd > maxNetWorth) maxNetWorth = result.finalNetWorthUsd;
  }

  return {
    winRate: wins / runs,
    meanFinalNetWorth: totalNetWorth / runs,
    minNetWorth,
    maxNetWorth,
  };
}

export { SCENARIO, buildDayOracle, fullNetWorthUsd };
