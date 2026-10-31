import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { WalletModule } from './wallet/wallet.module';
import { User } from './users/user.entity';
import { Wallet } from './wallet/wallet.entity';
import { Transaction } from './wallet/transaction.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [User, Wallet, Transaction],
        synchronize: true,
        ssl: {
          rejectUnauthorized: false, // Required for cloud providers like Neon
        },
      }),
    }),
    AuthModule,
    WalletModule,
  ],
})
export class AppModule {}