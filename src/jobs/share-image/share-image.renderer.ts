import {
  SHARE_IMAGE_HEIGHT_PX,
  SHARE_IMAGE_WIDTH_PX,
} from '../../sharing/sharing.constants';
import type { SanitizedReadingData } from '../../sharing/sharing.types';

const ORIENTATION_LABELS: Record<string, string> = {
  UPRIGHT: 'Derecha',
  REVERSED: 'Invertida',
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// SVG no envuelve texto solo: partir a mano asumiendo un ancho de carácter
// aproximado para el tamaño de fuente dado — suficiente para el disclaimer
// fijo, que no cambia de contenido.
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function renderCardBox(
  card: NonNullable<SanitizedReadingData['cards']>[number],
  y: number,
): string {
  const orientation = ORIENTATION_LABELS[card.orientation] ?? card.orientation;
  return `
    <g>
      <rect x="90" y="${y}" width="900" height="180" rx="16" fill="rgba(255,255,255,0.06)" stroke="#c9a84c" stroke-width="2"/>
      <text x="540" y="${y + 55}" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#c9a84c">${escapeXml(card.positionLabel)}</text>
      <text x="540" y="${y + 105}" text-anchor="middle" font-family="Georgia, serif" font-size="38" font-weight="bold" fill="#ffffff">${escapeXml(card.cardName)}</text>
      <text x="540" y="${y + 150}" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#d8cdee">${escapeXml(orientation)}</text>
    </g>`;
}

export function buildShareImageSvg(
  data: SanitizedReadingData & { disclaimer: string; appHost: string },
): string {
  const width = SHARE_IMAGE_WIDTH_PX;
  const height = SHARE_IMAGE_HEIGHT_PX;

  const cardsSvg = data.cards
    ? data.cards
        .map((card, index) => renderCardBox(card, 620 + index * 220))
        .join('')
    : `<text x="${width / 2}" y="850" text-anchor="middle" font-family="Georgia, serif" font-size="32" fill="#d8cdee">Descubre tu reporte guiado</text>`;

  const disclaimerLines = wrapText(data.disclaimer, 60);
  const disclaimerSvg = disclaimerLines
    .map(
      (line, index) =>
        `<text x="${width / 2}" y="${1650 + index * 34}" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#a89bc4">${escapeXml(line)}</text>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#150826"/>
      <stop offset="100%" stop-color="#2c1454"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="40" y="40" width="${width - 80}" height="${height - 80}" rx="24" fill="none" stroke="#c9a84c" stroke-width="3" opacity="0.5"/>

  <text x="${width / 2}" y="220" text-anchor="middle" font-family="Georgia, serif" font-size="56" letter-spacing="6" fill="#c9a84c">ORÁCULO TAROTRIA</text>

  <text x="${width / 2}" y="420" text-anchor="middle" font-family="Georgia, serif" font-size="44" font-weight="bold" fill="#ffffff">${escapeXml(data.title)}</text>

  ${cardsSvg}

  <text x="${width / 2}" y="1520" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#ffffff">Descubre tu propia lectura</text>
  <text x="${width / 2}" y="1568" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#c9a84c">${escapeXml(data.appHost)}</text>

  ${disclaimerSvg}
</svg>`;
}
