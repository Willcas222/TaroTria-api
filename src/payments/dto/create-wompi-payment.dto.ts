import { IsString, MinLength } from 'class-validator';

export class CreateWompiPaymentDto {
  @IsString()
  @MinLength(1)
  orderId: string;
}
