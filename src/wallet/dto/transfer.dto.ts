import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class TransferDto {
  @IsUUID()
  sourceWalletId: string;

  @IsUUID()
  recipientWalletId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;
}