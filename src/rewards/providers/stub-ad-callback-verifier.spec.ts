import { UnauthorizedException } from '@nestjs/common';
import { StubAdCallbackVerifier } from './stub-ad-callback-verifier';

describe('StubAdCallbackVerifier', () => {
  const configService = { get: jest.fn().mockReturnValue('correct-secret') };
  const verifier = new StubAdCallbackVerifier(configService as never);

  it('extracts the session id when the shared secret matches', () => {
    const result = verifier.verify({
      sessionId: 'session-1',
      secret: 'correct-secret',
    });

    expect(result).toEqual({ externalSessionId: 'session-1' });
  });

  it('rejects a callback with the wrong secret', () => {
    expect(() =>
      verifier.verify({ sessionId: 'session-1', secret: 'wrong-secret' }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a callback missing the session id', () => {
    expect(() => verifier.verify({ secret: 'correct-secret' })).toThrow(
      UnauthorizedException,
    );
  });
});
