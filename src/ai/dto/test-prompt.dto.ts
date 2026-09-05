import { IsObject, IsOptional, IsString } from 'class-validator';

export class TestPromptDto {
  @IsObject()
  variables: Record<string, string>;

  @IsOptional()
  @IsString()
  promptVersionId?: string;
}
