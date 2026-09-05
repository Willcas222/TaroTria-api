import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePromptDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;

  @IsString()
  @MinLength(1)
  systemPrompt: string;

  @IsString()
  @MinLength(1)
  userPromptTemplate: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  model: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOutputTokens?: number;

  @IsObject()
  outputSchema: Record<string, unknown>;
}
