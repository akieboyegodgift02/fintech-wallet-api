import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { WalletModule } from './wallet/wallet.module';
import { User } from './users/user.entity';
import { Wallet } from './wallet/wallet.entity';
import { Transaction } from './wallet/transaction.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [User, Wallet, Transaction],
      synchronize: true, // Set to false in production
      ssl: { rejectUnauthorized: false }, // Required for Neon Cloud
    }),
    AuthModule,
    WalletModule,
  ],
})
export class AppModule {}