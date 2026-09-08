import { IsString, MinLength } from 'class-validator';

export class CreateWompiPaymentDto {
  @IsString()
  @MinLength(1)
  orderId: string;
}

export class ConfirmWompiPaymentDto {
  @IsString()
  @MinLength(1)
  orderId: string;

  @IsString()
  @MinLength(1)
  transactionId: string;
}
