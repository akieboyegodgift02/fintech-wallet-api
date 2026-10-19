import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class DepositDto {
  @IsUUID()
  walletId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;
}