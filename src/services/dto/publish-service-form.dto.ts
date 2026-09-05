import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export class PublishServiceFormDto {
  @IsObject()
  schema: Record<string, unknown>;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
