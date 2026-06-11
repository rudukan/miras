export type TelemetryEvent = 'visit' | 'share_click' | 'share_done';

const TELEMETRY_URL = '/api/telemetry';
const LAST_VISIT_KEY = 'miras.lastVisitPing';

/** Sunucuya event gönderir — sendBeacon → fetch keepalive; hatalar sessiz (best-effort). */
export function sendTelemetry(playerId: string, event: TelemetryEvent): void {
  const payload = JSON.stringify({ playerId, event, tsISO: new Date().toISOString() });

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    if (navigator.sendBeacon(TELEMETRY_URL, blob)) return;
  }

  void fetch(TELEMETRY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

/** Günde bir kez 'visit' pingi — İstanbul takvim gününe (todayKey) göre. */
export function pingDailyVisit(storage: Storage, playerId: string, todayKey: string): void {
  if (storage.getItem(LAST_VISIT_KEY) === todayKey) return;
  sendTelemetry(playerId, 'visit');
  storage.setItem(LAST_VISIT_KEY, todayKey);
}
