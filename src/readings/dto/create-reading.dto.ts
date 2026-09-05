import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateReadingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  serviceCode: string;
}
