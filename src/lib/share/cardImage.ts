import type { ClosingCardModel } from '../components/closingCard';

/** 1080×1080 — WhatsApp/Instagram hedef kanal (kare paylaşım). */
export const CARD_SIZE = 1080;
const PAD = 64;

const FONT = '"JetBrains Mono"';

/** tailwind.config.ts → theme.extend.colors.term hex kopyası. Kaynak değişirse burası da güncellenmeli. */
export const TERM_COLORS = {
  bg: '#070a13',
  panel: '#0e1322',
  panelLight: '#141c30',
  border: '#1f2d4d',
  borderGlow: '#00ff66',
  green: '#00ff66',
  red: '#ff3366',
  amber: '#f59e0b',
  blue: '#00e1ff',
  violet: '#a855f7',
  text: '#a3b8cc',
} as const;

export type Primitive =
  | { type: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | {
      type: 'text';
      x: number;
      y: number;
      text: string;
      font: string;
      color: string;
      align: CanvasTextAlign;
    };

/** 'text-term-green' / 'bg-term-amber' → TERM_COLORS hex. Bilinmeyen anahtar → text (nötr). */
function classToHex(cls: string): string {
  const key = cls.replace(/^(bg|text)-term-/, '') as keyof typeof TERM_COLORS;
  return TERM_COLORS[key] ?? TERM_COLORS.text;
}

/** Uzun rakamlar (₺/yüksek $ tutarları) taşmasın diye küçük font. */
function headlineFontSize(value: string): number {
  return value.length > 12 ? 64 : 96;
}

/**
 * Kapanış kartı çizim talimatları — saf (canvas/document yok, node'da test edilebilir).
 * `drawCard` bunu sırayla `fillRect`/`fillText`'e çevirir.
 */
export function buildCardLayout(model: ClosingCardModel): Primitive[] {
  const primitives: Primitive[] = [];
  const cx = CARD_SIZE / 2;

  // Zemin
  primitives.push({ type: 'rect', x: 0, y: 0, w: CARD_SIZE, h: CARD_SIZE, fill: TERM_COLORS.bg });

  // Marka + gün başlığı
  primitives.push({
    type: 'text',
    x: PAD,
    y: 90,
    text: 'MİRAS — CANLI ÇEKİRDEK',
    font: `700 28px ${FONT}`,
    color: TERM_COLORS.blue,
    align: 'left',
  });
  primitives.push({
    type: 'text',
    x: cx,
    y: 180,
    text: `${model.dayLabel} · KAPANIŞ`,
    font: `700 40px ${FONT}`,
    color: TERM_COLORS.green,
    align: 'center',
  });

  // Tek vurgu — headline
  primitives.push({
    type: 'text',
    x: cx,
    y: 340,
    text: model.headlineLabel,
    font: `400 28px ${FONT}`,
    color: TERM_COLORS.text,
    align: 'center',
  });
  primitives.push({
    type: 'text',
    x: cx,
    y: 450,
    text: model.headlineValue,
    font: `700 ${headlineFontSize(model.headlineValue)}px ${FONT}`,
    color: classToHex(model.headlineClass),
    align: 'center',
  });

  // Dolar tutsaydın
  primitives.push({
    type: 'text',
    x: cx,
    y: 560,
    text: 'DOLAR TUTSAYDIN',
    font: `400 28px ${FONT}`,
    color: TERM_COLORS.text,
    align: 'center',
  });
  primitives.push({
    type: 'text',
    x: cx,
    y: 615,
    text: model.vsUsdHoldValue,
    font: `700 56px ${FONT}`,
    color: classToHex(model.vsUsdHoldClass),
    align: 'center',
  });

  // Dağılım barı + rozet
  const barX = PAD;
  const barY = 720;
  const barW = CARD_SIZE - 2 * PAD;
  const barH = 48;
  primitives.push({ type: 'rect', x: barX - 2, y: barY - 2, w: barW + 4, h: barH + 4, fill: TERM_COLORS.border });

  let segX = barX;
  for (const seg of model.segments) {
    const w = (seg.pct / 100) * barW;
    primitives.push({ type: 'rect', x: segX, y: barY, w, h: barH, fill: classToHex(seg.colorClass) });
    segX += w;
  }

  // Segment etiketleri (sol) + rozet (sağ)
  const legendY = barY + barH + 50;
  const legendText = model.segments.map((s) => `${s.label} ${Math.round(s.pct)}%`).join('   ');
  primitives.push({
    type: 'text',
    x: barX,
    y: legendY,
    text: legendText,
    font: `400 24px ${FONT}`,
    color: TERM_COLORS.text,
    align: 'left',
  });
  primitives.push({
    type: 'text',
    x: barX + barW,
    y: legendY,
    text: model.badge.toUpperCase(),
    font: `700 24px ${FONT}`,
    color: TERM_COLORS.green,
    align: 'right',
  });

  // Site URL (alt köşe)
  primitives.push({
    type: 'text',
    x: barX,
    y: CARD_SIZE - 110,
    text: 'miras-oyunu.vercel.app',
    font: `400 22px ${FONT}`,
    color: TERM_COLORS.text,
    align: 'left',
  });

  // Hukuk bandı — her zaman tam görünür
  primitives.push({ type: 'rect', x: 0, y: CARD_SIZE - 80, w: CARD_SIZE, h: 80, fill: TERM_COLORS.panel });
  primitives.push({
    type: 'text',
    x: cx,
    y: CARD_SIZE - 32,
    text: model.disclaimer,
    font: `700 26px ${FONT}`,
    color: TERM_COLORS.amber,
    align: 'center',
  });

  return primitives;
}

/** `buildCardLayout` çıktısını canvas'a çizer — ince, test edilmez (gerçek cihaz checklist). */
export async function drawCard(canvas: HTMLCanvasElement, primitives: Primitive[]): Promise<void> {
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  await document.fonts.ready;
  await Promise.all([
    document.fonts.load(`700 96px ${FONT}`),
    document.fonts.load(`700 56px ${FONT}`),
    document.fonts.load(`700 40px ${FONT}`),
    document.fonts.load(`400 28px ${FONT}`),
  ]);

  for (const p of primitives) {
    if (p.type === 'rect') {
      ctx.fillStyle = p.fill;
      ctx.fillRect(p.x, p.y, p.w, p.h);
    } else {
      ctx.fillStyle = p.color;
      ctx.font = p.font;
      ctx.textAlign = p.align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(p.text, p.x, p.y);
    }
  }
}
