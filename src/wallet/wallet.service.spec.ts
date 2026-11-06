import 'dotenv/config';
import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { WalletService } from './wallet.service';
import { Wallet } from './wallet.entity';
import {
  Transaction,
  TransactionDirection,
  TransactionType,
} from './transaction.entity';
import { User, UserStatus } from '../users/user.entity';

// Remote database (Neon) is slower than localhost, so allow more time per test.
jest.setTimeout(30000);

describe('WalletService (Integration)', () => {
  let walletService: WalletService;
  let module: TestingModule;
  let dataSource: DataSource;

  let senderWallet: Wallet;
  let recipientWallet: Wallet;

  let senderUserId: string;
  let recipientUserId: string;

  beforeAll(async () => {
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;

    if (!testDatabaseUrl) {
      throw new Error(
        'TEST_DATABASE_URL is not set. Add it to your .env file (use a separate Neon branch).',
      );
    }

    // Safety: dropSchema deletes EVERYTHING in the target database,
    // so refuse to run if the test URL points at your main database.
    const mainUrl = process.env.DATABASE_URL;
    if (
      mainUrl &&
      new URL(mainUrl).hostname === new URL(testDatabaseUrl).hostname
    ) {
      throw new Error(
        'TEST_DATABASE_URL points at the same database as DATABASE_URL. Use a separate Neon branch.',
      );
    }

    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: testDatabaseUrl,
          entities: [User, Wallet, Transaction],
          dropSchema: true, // start from empty tables on every run
          synchronize: true, // then rebuild them from the entities
          ssl: { rejectUnauthorized: false },
          retryAttempts: 1,
          retryDelay: 500,
        }),
        TypeOrmModule.forFeature([Wallet, Transaction, User]),
      ],
      providers: [WalletService],
    }).compile();

    walletService = module.get(WalletService);
    dataSource = module.get(DataSource);
  }, 60000);

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  beforeEach(async () => {
    // Wipe all three tables in one query (CASCADE handles foreign keys).
    const tables = [Transaction, Wallet, User]
      .map((entity) => `"${dataSource.getMetadata(entity).tableName}"`)
      .join(', ');

    await dataSource.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);

    // Seed with batched saves to keep round trips to Neon low.
    const [user1, user2] = await dataSource.getRepository(User).save([
      {
        email: 'sender@fintech.com',
        passwordHash: 'hashedpassword',
        status: UserStatus.ACTIVE,
      },
      {
        email: 'recipient@fintech.com',
        passwordHash: 'hashedpassword',
        status: UserStatus.ACTIVE,
      },
    ]);

    senderUserId = user1.id;
    recipientUserId = user2.id;

    [senderWallet, recipientWallet] = await dataSource
      .getRepository(Wallet)
      .save([
        {
          balance: 500.0,
          currency: 'USD',
          isLocked: false,
          userId: senderUserId,
        },
        {
          balance: 100.0,
          currency: 'USD',
          isLocked: false,
          userId: recipientUserId,
        },
      ]);
  });

  // ---------------------------------------------------------------
  // DEPOSIT TESTS
  // ---------------------------------------------------------------

  it('should successfully deposit funds into a wallet', async () => {
    const result = await walletService.deposit(
      { walletId: senderWallet.id, amount: 250.5 },
      senderUserId,
    );

    expect(result).toBeDefined();
    expect(result.newBalance).toEqual(750.5);
    expect(result.transactionReference).toBeDefined();

    const updatedWallet = await dataSource
      .getRepository(Wallet)
      .findOne({ where: { id: senderWallet.id } });

    expect(Number(updatedWallet.balance)).toEqual(750.5);
  });

  it('should reject a deposit into another user wallet', async () => {
    await expect(
      walletService.deposit(
        { walletId: recipientWallet.id, amount: 100 },
        senderUserId,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when depositing into a non-existent wallet', async () => {
    await expect(
      walletService.deposit(
        { walletId: '123e4567-e89b-12d3-a456-426614174000', amount: 100 },
        senderUserId,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should reject deposits into a locked wallet', async () => {
    await dataSource
      .getRepository(Wallet)
      .update(senderWallet.id, { isLocked: true });

    await expect(
      walletService.deposit(
        { walletId: senderWallet.id, amount: 100 },
        senderUserId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject a deposit with a zero or negative amount', async () => {
    await expect(
      walletService.deposit(
        { walletId: senderWallet.id, amount: -50 },
        senderUserId,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      walletService.deposit(
        { walletId: senderWallet.id, amount: 0 },
        senderUserId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ---------------------------------------------------------------
  // TRANSFER TESTS
  // ---------------------------------------------------------------

  it('should successfully transfer funds between two wallets', async () => {
    const result = await walletService.transfer(
      {
        sourceWalletId: senderWallet.id,
        recipientWalletId: recipientWallet.id,
        amount: 200.0,
      },
      senderUserId,
    );

    expect(result).toBeDefined();
    expect(result.sourceNewBalance).toEqual(300.0);
    expect(result.reference).toBeDefined();

    const updatedRecipient = await dataSource
      .getRepository(Wallet)
      .findOne({ where: { id: recipientWallet.id } });

    expect(Number(updatedRecipient.balance)).toEqual(300.0);
  });

  // UPDATED: now checks direction, counterparty, balanceAfter and correlationId.
  it('should record a debit for the sender and a credit for the recipient', async () => {
    await walletService.transfer(
      {
        sourceWalletId: senderWallet.id,
        recipientWalletId: recipientWallet.id,
        amount: 50,
      },
      senderUserId,
    );

    const transactionRepository = dataSource.getRepository(Transaction);

    const senderRows = await transactionRepository.find({
      where: { walletId: senderWallet.id },
    });
    const recipientRows = await transactionRepository.find({
      where: { walletId: recipientWallet.id },
    });

    expect(senderRows).toHaveLength(1);
    expect(recipientRows).toHaveLength(1);

    const [debit] = senderRows;
    const [credit] = recipientRows;

    expect(debit.type).toEqual(TransactionType.TRANSFER);
    expect(debit.direction).toEqual(TransactionDirection.DEBIT);
    expect(debit.counterpartyWalletId).toEqual(recipientWallet.id);
    expect(debit.balanceAfter).toEqual(450);

    expect(credit.type).toEqual(TransactionType.TRANSFER);
    expect(credit.direction).toEqual(TransactionDirection.CREDIT);
    expect(credit.counterpartyWalletId).toEqual(senderWallet.id);
    expect(credit.balanceAfter).toEqual(150);

    expect(debit.correlationId).toBeTruthy();
    expect(debit.correlationId).toEqual(credit.correlationId);
  });

  it('should reject a transfer from a wallet not owned by the user', async () => {
    await expect(
      walletService.transfer(
        {
          sourceWalletId: recipientWallet.id,
          recipientWalletId: senderWallet.id,
          amount: 50,
        },
        senderUserId,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException if the recipient wallet does not exist', async () => {
    await expect(
      walletService.transfer(
        {
          sourceWalletId: senderWallet.id,
          recipientWalletId: '123e4567-e89b-12d3-a456-426614174000',
          amount: 50,
        },
        senderUserId,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should reject a transfer if there are insufficient funds', async () => {
    await expect(
      walletService.transfer(
        {
          sourceWalletId: senderWallet.id,
          recipientWalletId: recipientWallet.id,
          amount: 1000.0,
        },
        senderUserId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject a transfer with a zero or negative amount', async () => {
    await expect(
      walletService.transfer(
        {
          sourceWalletId: senderWallet.id,
          recipientWalletId: recipientWallet.id,
          amount: -50,
        },
        senderUserId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should prevent transferring funds to the same wallet', async () => {
    await expect(
      walletService.transfer(
        {
          sourceWalletId: senderWallet.id,
          recipientWalletId: senderWallet.id,
          amount: 50,
        },
        senderUserId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject transfers between wallets with different currencies', async () => {
    await dataSource
      .getRepository(Wallet)
      .update(recipientWallet.id, { currency: 'EUR' });

    await expect(
      walletService.transfer(
        {
          sourceWalletId: senderWallet.id,
          recipientWalletId: recipientWallet.id,
          amount: 50,
        },
        senderUserId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject transfers from a locked source wallet', async () => {
    await dataSource
      .getRepository(Wallet)
      .update(senderWallet.id, { isLocked: true });

    await expect(
      walletService.transfer(
        {
          sourceWalletId: senderWallet.id,
          recipientWalletId: recipientWallet.id,
          amount: 50,
        },
        senderUserId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject transfers into a locked recipient wallet', async () => {
    await dataSource
      .getRepository(Wallet)
      .update(recipientWallet.id, { isLocked: true });

    await expect(
      walletService.transfer(
        {
          sourceWalletId: senderWallet.id,
          recipientWalletId: recipientWallet.id,
          amount: 50,
        },
        senderUserId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should preserve both wallet balances when a transfer fails', async () => {
    await expect(
      walletService.transfer(
        {
          sourceWalletId: senderWallet.id,
          recipientWalletId: recipientWallet.id,
          amount: 1000,
        },
        senderUserId,
      ),
    ).rejects.toThrow(BadRequestException);

    const updatedSender = await dataSource
      .getRepository(Wallet)
      .findOne({ where: { id: senderWallet.id } });

    const updatedRecipient = await dataSource
      .getRepository(Wallet)
      .findOne({ where: { id: recipientWallet.id } });

    expect(Number(updatedSender.balance)).toEqual(500.0);
    expect(Number(updatedRecipient.balance)).toEqual(100.0);
  });

  // ---------------------------------------------------------------
  // INTEGRITY TESTS (NEW)
  // ---------------------------------------------------------------

  // NEW 1: atomicity. A failure AFTER both balances changed must undo everything.
  it('should roll back everything if a transfer fails halfway through', async () => {
    const originalSave = EntityManager.prototype.save;
    let saveCalls = 0;

    // Inside transfer(), save() runs in this order:
    // 1) source wallet, 2) recipient wallet, 3) debit row, 4) credit row.
    // Fail on the 3rd call: both balances were already changed in memory
    // and written, but the ledger row is not.
    const spy: any = jest.spyOn(EntityManager.prototype as any, 'save');
    spy.mockImplementation(function (this: any, ...args: any[]) {
      saveCalls++;
      if (saveCalls === 3) {
        return Promise.reject(new Error('simulated failure'));
      }
      return (originalSave as any).apply(this, args);
    });

    try {
      await expect(
        walletService.transfer(
          {
            sourceWalletId: senderWallet.id,
            recipientWalletId: recipientWallet.id,
            amount: 200,
          },
          senderUserId,
        ),
      ).rejects.toThrow('simulated failure');
    } finally {
      spy.mockRestore();
    }

    const sender = await dataSource
      .getRepository(Wallet)
      .findOne({ where: { id: senderWallet.id } });
    const recipient = await dataSource
      .getRepository(Wallet)
      .findOne({ where: { id: recipientWallet.id } });

    expect(Number(sender.balance)).toEqual(500);
    expect(Number(recipient.balance)).toEqual(100);
    expect(await dataSource.getRepository(Transaction).count()).toEqual(0);
  });

  // NEW 2: concurrency. Simultaneous transfers must never spend the same money twice.
  it('should never overspend when many transfers run at the same time', async () => {
    const attempts = 8; // 8 x 100 requested, but only 500 is available

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () =>
        walletService.transfer(
          {
            sourceWalletId: senderWallet.id,
            recipientWalletId: recipientWallet.id,
            amount: 100,
          },
          senderUserId,
        ),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult[];

    expect(succeeded).toHaveLength(5);
    expect(failed).toHaveLength(3);
    failed.forEach((f) => expect(f.reason).toBeInstanceOf(BadRequestException));

    const sender = await dataSource
      .getRepository(Wallet)
      .findOne({ where: { id: senderWallet.id } });
    const recipient = await dataSource
      .getRepository(Wallet)
      .findOne({ where: { id: recipientWallet.id } });

    expect(Number(sender.balance)).toEqual(0);
    expect(Number(recipient.balance)).toEqual(600);
    // No money created or destroyed.
    expect(Number(sender.balance) + Number(recipient.balance)).toEqual(600);
  }, 120000);

  // NEW 3: deadlock safety. Opposite-direction transfers at the same time must all finish.
  it('should handle opposite transfers at the same time without deadlocking', async () => {
    const calls = [];

    for (let i = 0; i < 4; i++) {
      calls.push(
        walletService.transfer(
          {
            sourceWalletId: senderWallet.id,
            recipientWalletId: recipientWallet.id,
            amount: 10,
          },
          senderUserId,
        ),
      );
      calls.push(
        walletService.transfer(
          {
            sourceWalletId: recipientWallet.id,
            recipientWalletId: senderWallet.id,
            amount: 10,
          },
          recipientUserId,
        ),
      );
    }

    const results = await Promise.allSettled(calls);

    results.forEach((r) => expect(r.status).toEqual('fulfilled'));

    const sender = await dataSource
      .getRepository(Wallet)
      .findOne({ where: { id: senderWallet.id } });
    const recipient = await dataSource
      .getRepository(Wallet)
      .findOne({ where: { id: recipientWallet.id } });

    // 4 transfers each way of 10 cancel out.
    expect(Number(sender.balance)).toEqual(500);
    expect(Number(recipient.balance)).toEqual(100);
  }, 120000);

  // NEW 4: balance consistency. Each balance must equal its starting balance
  // plus the net of its ledger (credits minus debits).
  it('should keep wallet balances consistent with the ledger', async () => {
    await walletService.deposit(
      { walletId: senderWallet.id, amount: 75.25 },
      senderUserId,
    );
    await walletService.transfer(
      {
        sourceWalletId: senderWallet.id,
        recipientWalletId: recipientWallet.id,
        amount: 120.1,
      },
      senderUserId,
    );
    await walletService.transfer(
      {
        sourceWalletId: recipientWallet.id,
        recipientWalletId: senderWallet.id,
        amount: 30.05,
      },
      recipientUserId,
    );

    const startingBalances = {
      [senderWallet.id]: 500,
      [recipientWallet.id]: 100,
    };

    for (const wallet of [senderWallet, recipientWallet]) {
      const stored = await dataSource
        .getRepository(Wallet)
        .findOne({ where: { id: wallet.id } });

      const [{ net }] = await dataSource.query(
        `SELECT COALESCE(SUM(CASE WHEN "direction" = 'CREDIT' THEN "amount" ELSE -"amount" END), 0) AS net
         FROM "transactions"
         WHERE "walletId" = $1 AND "status" = 'SUCCESS'`,
        [wallet.id],
      );

      const expectedCents = Math.round(
        (Number(stored.balance) - startingBalances[wallet.id]) * 100,
      );

      expect(expectedCents).toEqual(Math.round(Number(net) * 100));
    }
  });

  // NEW 5: the database itself must refuse a negative balance, even if code has a bug.
  it('should let the database reject a negative wallet balance', async () => {
    await expect(
      dataSource.query(`UPDATE "wallets" SET "balance" = -1 WHERE "id" = $1`, [
        senderWallet.id,
      ]),
    ).rejects.toThrow();
  });
});