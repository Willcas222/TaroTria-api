import {
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  NotEquals,
} from 'class-validator';

export class AdjustWalletDto {
  @IsUUID()
  userId: string;

  @IsInt()
  @NotEquals(0)
  amount: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
