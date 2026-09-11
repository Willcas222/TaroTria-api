// Abstracción del proveedor de anuncios recompensados en el backend (sección
// 2 del documento: "la arquitectura debe permitir sustituir o agregar
// posteriormente otros proveedores... sin modificar la lógica principal").
//
// El backend nunca llama directamente al SDK del proveedor (eso vive en el
// frontend, sección 2 también). Su única responsabilidad es verificar que un
// callback entrante realmente viene del proveedor (firma/secreto) y extraer
// el id de sesión que nosotros mismos generamos al crear el RewardSession.
export interface VerifiedAdCompletion {
  externalSessionId: string;
}

export interface AdCallbackVerifier {
  readonly providerName: string;
  // Lanza UnauthorizedException si la firma/secreto no es válida.
  verify(rawParams: Record<string, string>): VerifiedAdCompletion;
}

export const AD_CALLBACK_VERIFIERS = Symbol('AD_CALLBACK_VERIFIERS');
