import { detectHighRiskContent } from './risk-guardrail';

describe('detectHighRiskContent', () => {
  it('flags text mentioning suicide or self-harm', () => {
    expect(detectHighRiskContent('a veces pienso en suicidarme')).toBe(true);
    expect(detectHighRiskContent('quiero hacerme daño')).toBe(true);
    expect(detectHighRiskContent('ya no quiero vivir')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(detectHighRiskContent('QUIERO MORIR')).toBe(true);
  });

  it('does not flag an ordinary tarot question', () => {
    expect(
      detectHighRiskContent('¿Qué me depara el futuro en el trabajo?'),
    ).toBe(false);
  });
});
