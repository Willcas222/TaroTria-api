import {
  SHARE_IMAGE_HEIGHT_PX,
  SHARE_IMAGE_WIDTH_PX,
} from '../../sharing/sharing.constants';
import type { SanitizedReadingData } from '../../sharing/sharing.types';

// Paleta de marca TAROTRIA (ver GUIA_DE_MARCA_TAROTRIA.md y
// apps/web/src/app/globals.css) — la misma fuente de verdad que usa la card
// "Oráculo TAROTRIA" en React (OraculoShareCard), para que la imagen que ven
// WhatsApp/redes al abrir el enlace (og:image) luzca igual que la card viva
// que ve quien entra al enlace desde un navegador.
const BRAND = {
  midnight: '#11152b',
  twilight: '#2a2158',
  amethyst: '#6c4ab6',
  gold: '#d9b66f',
  pearl: '#f7f3ea',
  lavender: '#b9a7f8',
  muted: '#a9a4c0',
};

const ORIENTATION_LABELS: Record<string, string> = {
  UPRIGHT: 'Derecha',
  REVERSED: 'Invertida',
};

const SUIT_LABELS: Record<string, string> = {
  WANDS: 'Bastos',
  CUPS: 'Copas',
  SWORDS: 'Espadas',
  PENTACLES: 'Oros',
};

// Ilustración lineal de una palma, en los mismos paths que
// components/readings/hand-illustration.tsx — placeholder visual para
// lecturas de manos, ya que la foto real del usuario nunca se comparte
// públicamente (sección "resumen saneado" de la Fase 9).
const HAND_ILLUSTRATION_PATHS = [
  'M50 110 C 40 110, 35 90, 35 80 L 35 50 C 35 45, 30 45, 25 50 L 20 55 C 18 57, 15 55, 16 52 L 25 38 C 28 33, 33 35, 35 40 L 38 25 C 39 20, 44 20, 45 25 L 47 15 C 48 10, 53 10, 54 15 L 56 20 C 57 15, 62 15, 63 20 L 65 35 C 67 30, 72 32, 71 37 L 68 55 C 68 70, 60 110, 50 110 Z',
  'M30 65 Q 45 75 60 60',
  'M32 50 Q 50 55 62 45',
  'M48 85 Q 45 55 52 35',
];

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

// Réplica en SVG de los <Badge> de la card React (pill con texto centrado).
function renderChip(
  label: string,
  centerX: number,
  y: number,
  variant: 'solid' | 'outline',
): string {
  const width = 150;
  const height = 40;
  const x = centerX - width / 2;
  const fill = variant === 'solid' ? 'rgba(185,167,248,0.18)' : 'none';
  const stroke = variant === 'solid' ? 'none' : BRAND.gold;
  const textFill = variant === 'solid' ? BRAND.lavender : BRAND.pearl;
  return `
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-opacity="0.7"/>
    <text x="${centerX}" y="${y + 26}" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="${textFill}">${escapeXml(label)}</text>`;
}

function renderCardBox(
  card: NonNullable<SanitizedReadingData['cards']>[number],
  y: number,
): string {
  const orientationLabel =
    ORIENTATION_LABELS[card.orientation] ?? card.orientation;
  const suitLabel = card.suit ? (SUIT_LABELS[card.suit] ?? card.suit) : null;

  const chipY = y + 130;
  const chipsSvg = suitLabel
    ? `${renderChip(suitLabel, 540 - 78, chipY, 'solid')}${renderChip(orientationLabel, 540 + 78, chipY, 'outline')}`
    : renderChip(orientationLabel, 540, chipY, 'outline');

  return `
    <g>
      <rect x="90" y="${y}" width="900" height="200" rx="20" fill="rgba(17,21,43,0.45)" stroke="${BRAND.gold}" stroke-width="2" stroke-opacity="0.4"/>
      <text x="540" y="${y + 42}" text-anchor="middle" font-family="Georgia, serif" font-size="24" letter-spacing="2" fill="${BRAND.gold}">${escapeXml(card.positionLabel)}</text>
      <text x="540" y="${y + 92}" text-anchor="middle" font-family="Georgia, serif" font-size="36" font-weight="bold" fill="${BRAND.pearl}">${escapeXml(card.cardName)}</text>
      ${chipsSvg}
    </g>`;
}

function renderHandIllustration(): string {
  const paths = HAND_ILLUSTRATION_PATHS.map(
    (d, index) =>
      `<path d="${d}" stroke="${BRAND.gold}" stroke-width="${index === 0 ? 1.5 : 1}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${index === 0 ? 1 : 0.7}"/>`,
  ).join('');

  return `
    <g transform="translate(430, 600) scale(2.2)" filter="url(#goldGlow)">
      ${paths}
    </g>
    <text x="540" y="920" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="${BRAND.lavender}">Descubre tu reporte guiado</text>`;
}

export function buildShareImageSvg(
  data: SanitizedReadingData & { disclaimer: string; appHost: string },
): string {
  const width = SHARE_IMAGE_WIDTH_PX;
  const height = SHARE_IMAGE_HEIGHT_PX;

  const contentSvg = data.cards
    ? data.cards
        .map((card, index) => renderCardBox(card, 620 + index * 220))
        .join('')
    : renderHandIllustration();

  const disclaimerLines = wrapText(data.disclaimer, 60);
  const disclaimerSvg = disclaimerLines
    .map(
      (line, index) =>
        `<text x="${width / 2}" y="${1620 + index * 34}" text-anchor="middle" font-family="sans-serif" font-size="22" fill="${BRAND.muted}">${escapeXml(line)}</text>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND.midnight}"/>
      <stop offset="55%" stop-color="${BRAND.twilight}"/>
      <stop offset="100%" stop-color="${BRAND.amethyst}"/>
    </linearGradient>
    <linearGradient id="ctaFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgb(43,51,92)"/>
      <stop offset="100%" stop-color="rgb(24,28,58)"/>
    </linearGradient>
    <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="${BRAND.gold}" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="40" y="40" width="${width - 80}" height="${height - 80}" rx="24" fill="none" stroke="${BRAND.gold}" stroke-width="3" stroke-opacity="0.5"/>
  <rect x="64" y="64" width="${width - 128}" height="${height - 128}" rx="18" fill="none" stroke="${BRAND.gold}" stroke-width="1.5" stroke-opacity="0.2"/>

  <text x="${width / 2}" y="220" text-anchor="middle" font-family="Georgia, serif" font-size="56" letter-spacing="6" fill="${BRAND.gold}">ORÁCULO TAROTRIA</text>

  <text x="${width / 2}" y="420" text-anchor="middle" font-family="Georgia, serif" font-size="44" font-weight="bold" fill="${BRAND.pearl}">${escapeXml(data.title)}</text>

  ${contentSvg}

  <rect x="230" y="1400" width="620" height="100" rx="50" fill="url(#ctaFill)" stroke="${BRAND.gold}" stroke-width="2"/>
  <text x="${width / 2}" y="1462" text-anchor="middle" font-family="Georgia, serif" font-size="32" fill="${BRAND.pearl}">Descubre tu propia lectura</text>

  <text x="${width / 2}" y="1560" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="${BRAND.gold}">${escapeXml(data.appHost)}</text>

  ${disclaimerSvg}
</svg>`;
}
