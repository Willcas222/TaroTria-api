import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AdCallbackVerifier,
  VerifiedAdCompletion,
} from '../ad-callback-verifier.interface';

// Proveedor de prueba: simula lo que haría un verificador real (ayeT-Studios,
// AppLixir, etc.) validando una firma/secreto compartido, pero sin depender
// de ninguna cuenta ni credencial externa. El día que exista una cuenta real,
// se agrega un nuevo verifier (ej. AyetStudiosCallbackVerifier) que
// implemente esta misma interfaz -- RewardsService no cambia.
@Injectable()
export class StubAdCallbackVerifier implements AdCallbackVerifier {
  readonly providerName = 'stub';

  constructor(private readonly configService: ConfigService) {}

  verify(rawParams: Record<string, string>): VerifiedAdCompletion {
    const expectedSecret = this.configService.get<string>(
      'REWARDS_STUB_SECRET',
    );
    if (!rawParams.sessionId || rawParams.secret !== expectedSecret) {
      throw new UnauthorizedException(
        'Firma de callback de publicidad inválida.',
      );
    }

    return { externalSessionId: rawParams.sessionId };
  }
}
