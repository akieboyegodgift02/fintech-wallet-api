import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { DepositDto } from './dto/deposit.dto';
import { TransferDto } from './dto/transfer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallet')
@UseGuards(JwtAuthGuard) // Protects all routes in this controller
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('deposit')
  @ApiOperation({ summary: 'Deposit funds into a wallet' })
  @HttpCode(HttpStatus.OK)
  async deposit(@Body() depositDto: DepositDto, @Req() req) {
    return this.walletService.deposit(
      depositDto,
      req.user.userId,
    );
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Max five transfer attempts per minute
  @Post('transfer')
  @ApiOperation({ summary: 'Transfer funds between two wallets atomically' })
  @HttpCode(HttpStatus.OK)
  async transfer(@Body() transferDto: TransferDto, @Req() req) {
    return this.walletService.transfer(
      transferDto,
      req.user.userId,
    );
  }
}