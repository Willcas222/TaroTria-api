import { buildShareImageSvg } from './share-image.renderer';

describe('buildShareImageSvg', () => {
  it('renders a 1080x1920 SVG containing the generic title, each card, and the disclaimer', () => {
    const svg = buildShareImageSvg({
      readingType: 'TAROT',
      title: 'Hice una lectura de tarot en TAROTRIA',
      cards: [
        {
          position: 'PAST',
          positionLabel: 'Pasado',
          cardName: 'El Sol',
          arcana: 'MAJOR',
          suit: null,
          orientation: 'UPRIGHT',
        },
        {
          position: 'PRESENT',
          positionLabel: 'Presente',
          cardName: 'La Torre',
          arcana: 'MAJOR',
          suit: null,
          orientation: 'REVERSED',
        },
      ],
      disclaimer: 'Las lecturas tienen fines de entretenimiento.',
      appHost: 'app.example.com',
    });

    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1920"');
    expect(svg).toContain('ORÁCULO TAROTRIA');
    expect(svg).toContain('Hice una lectura de tarot en TAROTRIA');
    expect(svg).toContain('El Sol');
    expect(svg).toContain('Derecha');
    expect(svg).toContain('La Torre');
    expect(svg).toContain('Invertida');
    expect(svg).toContain('Pasado');
    expect(svg).toContain('Presente');
    expect(svg).toContain('app.example.com');
    expect(svg).toContain('Las lecturas tienen fines de entretenimiento.');
  });

  it('never emits the AI-generated interpretation, only structural card data', () => {
    const svg = buildShareImageSvg({
      readingType: 'TAROT',
      title: 'Hice una lectura de tarot en TAROTRIA',
      cards: [
        {
          position: 'PAST',
          positionLabel: 'Pasado',
          cardName: 'El Sol',
          arcana: 'MAJOR',
          suit: null,
          orientation: 'UPRIGHT',
        },
      ],
      disclaimer: 'Las lecturas tienen fines de entretenimiento.',
      appHost: 'app.example.com',
    });

    expect(svg).not.toContain('pregunta');
    expect(svg).not.toContain('interpretation');
  });

  it('renders a generic placeholder instead of a card grid for a palm reading', () => {
    const svg = buildShareImageSvg({
      readingType: 'PALM',
      title: 'Hice una lectura de manos en TAROTRIA',
      cards: null,
      disclaimer: 'Las lecturas tienen fines de entretenimiento.',
      appHost: 'app.example.com',
    });

    expect(svg).toContain('Hice una lectura de manos en TAROTRIA');
    expect(svg).not.toContain('positionLabel');
  });

  it('escapes XML-sensitive characters in user-facing text so the SVG stays well-formed', () => {
    const svg = buildShareImageSvg({
      readingType: 'TAROT',
      title: 'Título con <script> & "comillas"',
      cards: [
        {
          position: 'PAST',
          positionLabel: 'Pasado <raro>',
          cardName: "Carta & 'especial'",
          arcana: 'MAJOR',
          suit: null,
          orientation: 'UPRIGHT',
        },
      ],
      disclaimer: 'Disclaimer normal.',
      appHost: 'app.example.com',
    });

    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&amp;');
  });
});
