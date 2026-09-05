import { containsProhibitedContent } from './output-guardrail';

describe('containsProhibitedContent', () => {
  it('flags a fabricated medical diagnosis', () => {
    expect(
      containsProhibitedContent('Las cartas revelan que tienes cáncer.'),
    ).toBe(true);
  });

  it('flags advice to stop a medical treatment', () => {
    expect(
      containsProhibitedContent('Deberías dejar tu tratamiento cuanto antes.'),
    ).toBe(true);
  });

  it('flags a guaranteed future event', () => {
    expect(
      containsProhibitedContent('Es seguro que ocurrirá una tragedia.'),
    ).toBe(true);
  });

  it('flags absolute certainty language', () => {
    expect(
      containsProhibitedContent('Te garantizo que ganarás la lotería.'),
    ).toBe(true);
  });

  it('does not flag a normal, hedged tarot interpretation', () => {
    expect(
      containsProhibitedContent(
        'Esta carta invita a reflexionar sobre nuevos comienzos en tu vida profesional.',
      ),
    ).toBe(false);
  });
});
