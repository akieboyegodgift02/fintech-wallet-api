import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { Wallet } from './wallet.entity';
import { Transaction } from './transaction.entity';
import { User } from '../users/user.entity';

describe('WalletService (Integration)', () => {
  let walletService: WalletService;
  let module: TestingModule;
  let dataSource: DataSource;
  let senderWallet: Wallet;
  let recipientWallet: Wallet;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [User, Wallet, Transaction],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Wallet, Transaction, User]),
      ],
      providers: [WalletService],
    }).compile();

    walletService = module.get<WalletService>(WalletService);
    dataSource = module.get<DataSource>(DataSource);
  }, 15000);

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  beforeEach(async () => {
    const transactionRepo = dataSource.getRepository(Transaction);
    const walletRepo = dataSource.getRepository(Wallet);
    const userRepo = dataSource.getRepository(User);

    await transactionRepo.clear();
    await walletRepo.clear();
    await userRepo.clear();

    const user1 = await userRepo.save({
      email: 'sender@fintech.com',
      passwordHash: 'hashedpassword',
    });

    const user2 = await userRepo.save({
      email: 'recipient@fintech.com',
      passwordHash: 'hashedpassword',
    });

    senderWallet = await walletRepo.save({
      balance: 500.00,
      currency: 'USD',
      userId: user1.id,
    });

    recipientWallet = await walletRepo.save({
      balance: 100.00,
      currency: 'USD',
      userId: user2.id,
    });
  });

  it('should successfully deposit funds into a wallet', async () => {
    const result = await walletService.deposit({
      walletId: senderWallet.id,
      amount: 250.50,
    });

    expect(result).toBeDefined();
    expect(Number(result.newBalance)).toEqual(750.50);
    expect(result.transactionReference).toBeDefined();
  });

  it('should throw NotFoundException if depositing to a non-existent wallet', async () => {
    await expect(
      walletService.deposit({
        walletId: '123e4567-e89b-12d3-a456-426614174000',
        amount: 100,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should successfully transfer funds between two wallets', async () => {
    const result = await walletService.transfer({
      sourceWalletId: senderWallet.id,
      recipientWalletId: recipientWallet.id,
      amount: 200.00,
    });

    expect(result).toBeDefined();
    expect(Number(result.sourceNewBalance)).toEqual(300.00);

    const updatedRecipient = await dataSource.getRepository(Wallet).findOne({
      where: { id: recipientWallet.id },
    });
    expect(Number(updatedRecipient.balance)).toEqual(300.00);
  });

  it('should reject a transfer if there are insufficient funds', async () => {
    await expect(
      walletService.transfer({
        sourceWalletId: senderWallet.id,
        recipientWalletId: recipientWallet.id,
        amount: 1000.00,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should prevent transferring funds to the same wallet', async () => {
    await expect(
      walletService.transfer({
        sourceWalletId: senderWallet.id,
        recipientWalletId: senderWallet.id,
        amount: 50,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});