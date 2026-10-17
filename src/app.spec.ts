import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { User } from './users/user.entity';
import { Wallet } from './wallet/wallet.entity';
import { Transaction } from './wallet/transaction.entity';

describe('AppModule Integration & Entities', () => {
  let appModule: TestingModule;

  beforeAll(async () => {
    appModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [User, Wallet, Transaction],
          synchronize: true,
        }),
      ],
    }).compile();
  }, 15000);

  afterAll(async () => {
    if (appModule) {
      await appModule.close();
    }
  });

  it('should compile the testing module successfully', () => {
    expect(appModule).toBeDefined();
  });

  it('should recognize the User, Wallet, and Transaction entities', () => {
    const dataSource = appModule.get(DataSource);
    expect(dataSource.hasMetadata(User)).toBe(true);
    expect(dataSource.hasMetadata(Wallet)).toBe(true);
    expect(dataSource.hasMetadata(Transaction)).toBe(true);
  });
});