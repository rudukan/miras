/** Lig işleminin sunucu damgası — istemci fiyatı ASLA göndermez, sunucununkini uygular. */
export interface StampRequest {
  readonly assetId: string;
  readonly side: 'buy' | 'sell';
  readonly units?: number;
  readonly amountUsd?: number;
}

export type StampResult =
  | { status: 'filled'; orderId: string; units: number; priceUsd: number }
  | { status: 'queued'; orderId: string };

/** `/api/trade` sarmalayıcısı. `newOrderId` idempotency anahtarını üretir (ağ tekrarında
 *  aynı anahtar gönderilirse sunucu çift işlem yaratmaz). */
export function createTradeStamper(
  fetchFn: typeof fetch,
  newOrderId: () => string,
): (req: StampRequest) => Promise<StampResult> {
  return async (req) => {
    // Alan sırası sabit tutulur (test JSON.stringify çıktısına birebir bakar):
    // assetId, side, units|amountUsd, clientOrderId.
    const payload = {
      assetId: req.assetId,
      side: req.side,
      ...(req.units !== undefined ? { units: req.units } : {}),
      ...(req.amountUsd !== undefined ? { amountUsd: req.amountUsd } : {}),
      clientOrderId: newOrderId(),
    };

    let res: Response;
    try {
      res = await fetchFn('/api/trade', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new Error('Lig işlemi gönderilemedi — bağlantı yok');
    }

    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(detail?.message ?? `Lig işlemi reddedildi (${res.status})`);
    }

    const data = (await res.json()) as {
      status: 'filled' | 'queued';
      orderId: string;
      units?: number;
      priceUsd?: number;
    };
    if (data.status === 'filled')
      return { status: 'filled', orderId: data.orderId, units: data.units!, priceUsd: data.priceUsd! };
    return { status: 'queued', orderId: data.orderId };
  };
}
