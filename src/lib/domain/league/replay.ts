/**
 * Lig skoru: $1M'dan başlayıp SUNUCU tarafından damgalanmış işlemleri yeniden oynatır ve
 * kapanış fiyatlarıyla değerler. `saves` payload'u burada HİÇ kullanılmaz — hile koruması
 * bunun üzerine kuruludur.
 *
 * CLAUDE.md esnetmesi (planda belgeli): bu domain modülü `stores/gameState`'ten import eder.
 * Gerekçe: istemcinin çalıştırdığı BİREBİR aynı reducer'lar kullanılmazsa sunucunun hesapladığı
 * skor ile oyuncunun ekranda gördüğü net servet yuvarlamada ayrışır. `gameState.ts` rune
 * içermeyen saf TS'tir.
 */
import {
  createGameState,
  buyAsset,
  sellAsset,
  netWorthPartsUsd,
  type GameState,
} from '../../stores/gameState';
import { usd } from '../money';
import type { UsdPriceOracle } from '../fx/usdOracle';

/** Sunucunun damgaladığı, gerçekleşmiş tek işlem. */
export interface StampedTrade {
  readonly assetId: string;
  readonly side: 'buy' | 'sell';
  readonly units: number;
  readonly priceUsd: number;
  /** Sunucu damga anı (epoch ms) — replay sırası bu alandan kurulur. */
  readonly ts: number;
}

export interface RejectedTrade {
  readonly trade: StampedTrade;
  readonly reason: string;
}

export interface ReplayResult {
  readonly state: GameState;
  readonly rejected: readonly RejectedTrade[];
}

export interface ReplayOptions {
  /** Oyuncu kimliği — yalnız GameState.playerId alanını doldurur, hesaba girmez. */
  readonly userId: string;
  /** Haftanın açılış anı (epoch ms) — GameState.createdAt damgası. */
  readonly startedAt: number;
}

/** Tek bir sabit fiyatı dönen oracle — reducer'ları damgalı fiyata zorlar. */
function fixedOracle(priceUsd: number): UsdPriceOracle {
  return { assetUsd: () => usd(priceUsd) };
}

/** Damgalı işlemleri ts sırasıyla oynatır. Bakiyeyi/pozisyonu aşan işlem REDDEDİLİR ve
 *  atlanır — döngü durmaz. Reddedilenler skora girmez; bu, `/api/trade`'deki teorik
 *  eşzamanlılık yarışının nihai kapanışıdır. */
export function replayTrades(
  trades: readonly StampedTrade[],
  opts: ReplayOptions,
): ReplayResult {
  let state = createGameState('canli', 0, opts.userId, opts.startedAt);
  const rejected: RejectedTrade[] = [];
  const ordered = [...trades].sort((a, b) => a.ts - b.ts);
  for (const trade of ordered) {
    try {
      const oracle = fixedOracle(trade.priceUsd);
      state =
        trade.side === 'buy'
          ? buyAsset(state, oracle, trade.assetId, trade.units)
          : sellAsset(state, oracle, trade.assetId, trade.units);
    } catch (e) {
      rejected.push({ trade, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { state, rejected };
}

/** Kapanış değerlemesi: nakit + fiyatlanabilen her pozisyon. Fiyatı olmayan pozisyon
 *  ATLANIR ve `complete=false` olur (kapanış işi bunu loglar, skoru yine de mühürler —
 *  eksik bir sembol yüzünden tüm haftayı iptal etmek daha kötü bir sonuç). */
export function valuate(
  state: GameState,
  closePricesUsd: Readonly<Record<string, number>>,
): { scoreUsd: number; complete: boolean } {
  const oracle: UsdPriceOracle = {
    assetUsd: (id) => {
      const p = closePricesUsd[id];
      if (p === undefined) throw new Error(`No close price: ${id}`);
      return usd(p);
    },
  };
  const parts = netWorthPartsUsd(state, oracle);
  return { scoreUsd: usd(parts.totalUsd).amount, complete: parts.complete };
}
