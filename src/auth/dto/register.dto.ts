import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72)
  password: string;

  // Id del ShareLink desde el que llegó este visitante (sección "CTA y
  // atribución de adquisición" de la Fase 9). Opaco y opcional: si no existe
  // o ya no es válido, el registro sigue igual — nunca bloquea el registro.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  referralToken?: string;
}
