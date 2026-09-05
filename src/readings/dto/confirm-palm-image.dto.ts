import { Equals, IsString, MinLength } from 'class-validator';

export class ConfirmPalmImageDto {
  @IsString()
  @MinLength(1)
  key: string;

  // El consentimiento explícito antes de procesar imágenes (sección 17 del
  // plan) es obligatorio: solo se acepta `true`, nunca se asume por defecto.
  @Equals(true)
  consent: boolean;
}
