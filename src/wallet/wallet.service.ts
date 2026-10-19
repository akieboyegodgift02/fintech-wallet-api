import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Wallet } from './wallet.entity';
import { Transaction, TransactionType, TransactionStatus } from './transaction.entity';
import { DepositDto } from './dto/deposit.dto';
import { TransferDto } from './dto/transfer.dto';
import * as crypto from 'crypto';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    private dataSource: DataSource,
  ) {}

  private getLockOption(driverType: string) {
    // Pessimistic locking is supported on PostgreSQL/CockroachDB, but not SQLite in tests
    return driverType === 'postgres' || driverType === 'cockroachdb' || driverType === 'aurora-postgres'
      ? { lock: { mode: 'pessimistic_write' as const } }
      : {};
  }

  async deposit(depositDto: DepositDto) {
    const { walletId, amount } = depositDto;
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const driverType = queryRunner.connection.driver.options.type;
      const lockOption = this.getLockOption(driverType);

      // 1. Find and lock wallet
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { id: walletId },
        ...lockOption,
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.isLocked) {
        throw new BadRequestException('Wallet is locked for security reasons');
      }

      // 2. Update balance
      wallet.balance = Number(wallet.balance) + Number(amount);
      await queryRunner.manager.save(wallet);

      // 3. Record immutable transaction log
      const transaction = queryRunner.manager.create(Transaction, {
        amount,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.SUCCESS,
        reference: `DEP-${crypto.randomUUID()}`,
        walletId: wallet.id,
      });
      await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();

      return {
        message: 'Deposit successful',
        newBalance: wallet.balance,
        transactionReference: transaction.reference,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async transfer(transferDto: TransferDto) {
    const { sourceWalletId, recipientWalletId, amount } = transferDto;

    if (sourceWalletId === recipientWalletId) {
      throw new BadRequestException('Cannot transfer funds to the same wallet');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const driverType = queryRunner.connection.driver.options.type;
      const lockOption = this.getLockOption(driverType);

      const [firstId, secondId] = [sourceWalletId, recipientWalletId].sort();

      const firstWallet = await queryRunner.manager.findOne(Wallet, {
        where: { id: firstId },
        ...lockOption,
      });

      const secondWallet = await queryRunner.manager.findOne(Wallet, {
        where: { id: secondId },
        ...lockOption,
      });

      const sourceWallet = sourceWalletId === firstId ? firstWallet : secondWallet;
      const recipientWallet = recipientWalletId === firstId ? firstWallet : secondWallet;

      if (!sourceWallet || !recipientWallet) {
        throw new NotFoundException('Source or recipient wallet not found');
      }

      if (sourceWallet.isLocked || recipientWallet.isLocked) {
        throw new BadRequestException('One or both wallets are locked');
      }

      if (Number(sourceWallet.balance) < Number(amount)) {
        throw new BadRequestException('Insufficient funds');
      }

      // Execute transfer
      sourceWallet.balance = Number(sourceWallet.balance) - Number(amount);
      recipientWallet.balance = Number(recipientWallet.balance) + Number(amount);

      await queryRunner.manager.save(sourceWallet);
      await queryRunner.manager.save(recipientWallet);

      // Log transaction for sender
      const senderTx = queryRunner.manager.create(Transaction, {
        amount,
        type: TransactionType.TRANSFER,
        status: TransactionStatus.SUCCESS,
        reference: `TRF-OUT-${crypto.randomUUID()}`,
        walletId: sourceWallet.id,
        recipientWalletId: recipientWallet.id,
      });
      await queryRunner.manager.save(senderTx);

      await queryRunner.commitTransaction();

      return {
        message: 'Transfer successful',
        sourceNewBalance: sourceWallet.balance,
        reference: senderTx.reference,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}