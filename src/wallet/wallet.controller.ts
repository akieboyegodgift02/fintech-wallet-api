import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { DepositDto } from './dto/deposit.dto';
import { TransferDto } from './dto/transfer.dto';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  async deposit(@Body() depositDto: DepositDto) {
    return this.walletService.deposit(depositDto);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  async transfer(@Body() transferDto: TransferDto) {
    return this.walletService.transfer(transferDto);
  }
}