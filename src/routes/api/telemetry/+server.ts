import type { RequestHandler } from './$types';

export type TelemetryEvent = 'visit' | 'share_click' | 'share_done' | 'first_trade';

interface TelemetryPayload {
  playerId: string;
  event: TelemetryEvent;
  tsISO: string;
}

const VALID_EVENTS = new Set<TelemetryEvent>(['visit', 'share_click', 'share_done', 'first_trade']);

/** playerId whitelist: crypto.randomUUID() + 'restored'/'local-player' fallback'lerini karşılar;
 *  Discord mention (@), markdown (`), newline ve aşırı uzunluğu reddeder (güvenlik denetimi B1). */
const PLAYER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function isValidPayload(body: unknown): body is TelemetryPayload {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.playerId === 'string' &&
    PLAYER_ID_RE.test(b.playerId) &&
    typeof b.event === 'string' &&
    VALID_EVENTS.has(b.event as TelemetryEvent) &&
    typeof b.tsISO === 'string' &&
    !Number.isNaN(Date.parse(b.tsISO))
  );
}

/**
 * Vercel Hobby runtime logları ~1 saat saklanır → console.log tek başına yetmez.
 * TELEMETRY_WEBHOOK_URL varsa Discord'a fire-and-forget POST (await edilmez, hata yutulur).
 */
export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!isValidPayload(body)) return new Response(null, { status: 400 });

  console.log('[telemetry]', body.event, body.playerId, body.tsISO);

  const webhookUrl = process.env.TELEMETRY_WEBHOOK_URL;
  if (webhookUrl) {
    void fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: `[${body.event}] ${body.playerId} @ ${body.tsISO}`,
        allowed_mentions: { parse: [] },
      }),
    }).catch(() => {});
  }

  return new Response(null, { status: 204 });
};
