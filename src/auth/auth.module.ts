import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from '../users/user.entity';
import { Wallet } from '../wallet/wallet.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Wallet])],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}