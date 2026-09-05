import { IsObject } from 'class-validator';

export class UpdateReadingInputsDto {
  @IsObject()
  answers: Record<string, unknown>;
}
