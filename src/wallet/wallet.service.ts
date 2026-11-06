import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import * as crypto from 'crypto';

import { Wallet } from './wallet.entity';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
  TransactionDirection,
} from './transaction.entity';

import { DepositDto } from './dto/deposit.dto';
import { TransferDto } from './dto/transfer.dto';

/**
 * Money math is done in whole cents (integers) to avoid
 * floating-point errors like 0.1 + 0.2 = 0.30000000000000004.
 */
const toCents = (value: number | string): number =>
  Math.round(Number(value) * 100);

const fromCents = (cents: number): number => cents / 100;

/** Postgres error codes that are safe to retry: deadlock, serialization failure. */
const RETRYABLE_PG_CODES = ['40P01', '40001'];
const MAX_ATTEMPTS = 3;

@Injectable()
export class WalletService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * PostgreSQL supports pessimistic row-level locking.
   * Other databases (e.g. SQLite) do not support this TypeORM option.
   */
  private getLockOption() {
    const driverType = this.dataSource.options.type as string;

    return driverType === 'postgres' ||
      driverType === 'cockroachdb' ||
      driverType === 'aurora-postgres'
      ? { lock: { mode: 'pessimistic_write' as const } }
      : {};
  }

  /**
   * Runs `work` inside one database transaction (commit on success,
   * rollback on any error) and retries it if Postgres reports a
   * deadlock or serialization failure.
   */
  private async runInTransaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.dataSource.transaction(work);
      } catch (error) {
        const pgError = error as
          | { code?: string; driverError?: { code?: string } }
          | undefined;
        const code = pgError?.code ?? pgError?.driverError?.code;
        const retryable = RETRYABLE_PG_CODES.includes(code);

        if (!retryable || attempt >= MAX_ATTEMPTS) {
          throw error;
        }

        // Small randomized pause so retrying transactions do not collide again.
        await new Promise((resolve) =>
          setTimeout(resolve, 50 * attempt + Math.random() * 50),
        );
      }
    }
  }

  /**
   * Amount must be a positive number with at most 2 decimal places.
   * Without this, a negative amount could drain a wallet.
   */
  private assertValidAmount(amount: number | string): void {
    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
      throw new BadRequestException(
        'Amount cannot have more than 2 decimal places',
      );
    }
  }

  /**
   * Deposit funds into a wallet owned by the authenticated user.
   *
   * IMPORTANT:
   * This currently credits the wallet directly.
   * A production deposit must first verify successful payment
   * through a trusted payment provider.
   */
  async deposit(depositDto: DepositDto, userId: string) {
    const { walletId, amount } = depositDto;

    this.assertValidAmount(amount);

    return this.runInTransaction(async (manager) => {
      // Find and lock the wallet belonging to this user.
      const wallet = await manager.findOne(Wallet, {
        where: { id: walletId, userId },
        ...this.getLockOption(),
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.isLocked) {
        throw new BadRequestException('Wallet is locked for security reasons');
      }

      const newBalance = fromCents(toCents(wallet.balance) + toCents(amount));
      wallet.balance = newBalance;

      await manager.save(wallet);

      const transaction = manager.create(Transaction, {
        amount,
        type: TransactionType.DEPOSIT,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.SUCCESS,
        reference: `DEP-${crypto.randomUUID()}`,
        walletId: wallet.id,
        balanceAfter: newBalance,
      });

      await manager.save(transaction);

      return {
        message: 'Deposit successful',
        newBalance,
        transactionReference: transaction.reference,
      };
    });
  }

  /**
   * Transfer funds between two different wallets.
   *
   * The authenticated user must own the source wallet.
   * The recipient wallet can belong to another user.
   * Both wallets get a ledger row: a DEBIT for the sender and a CREDIT
   * for the recipient, linked by the same correlationId.
   */
  async transfer(transferDto: TransferDto, userId: string) {
    const { sourceWalletId, recipientWalletId, amount } = transferDto;

    this.assertValidAmount(amount);

    if (sourceWalletId === recipientWalletId) {
      throw new BadRequestException('Cannot transfer funds to the same wallet');
    }

    return this.runInTransaction(async (manager) => {
      const lockOption = this.getLockOption();

      // Always lock wallets in the same order to prevent deadlocks
      // between opposite transfers (A to B and B to A at the same time).
      const [firstId, secondId] = [sourceWalletId, recipientWalletId].sort();

      // The source wallet must belong to the authenticated user.
      const firstWallet = await manager.findOne(Wallet, {
        where:
          firstId === sourceWalletId
            ? { id: firstId, userId }
            : { id: firstId },
        ...lockOption,
      });

      const secondWallet = await manager.findOne(Wallet, {
        where:
          secondId === sourceWalletId
            ? { id: secondId, userId }
            : { id: secondId },
        ...lockOption,
      });

      // Restore the original sender/recipient roles.
      const sourceWallet =
        sourceWalletId === firstId ? firstWallet : secondWallet;

      const recipientWallet =
        recipientWalletId === firstId ? firstWallet : secondWallet;

      if (!sourceWallet || !recipientWallet) {
        throw new NotFoundException('Source or recipient wallet not found');
      }

      if (sourceWallet.isLocked || recipientWallet.isLocked) {
        throw new BadRequestException('One or both wallets are locked');
      }

      if (sourceWallet.currency !== recipientWallet.currency) {
        throw new BadRequestException(
          'Cannot transfer between wallets with different currencies',
        );
      }

      const amountCents = toCents(amount);

      if (toCents(sourceWallet.balance) < amountCents) {
        throw new BadRequestException('Insufficient funds');
      }

      const sourceNewBalance = fromCents(
        toCents(sourceWallet.balance) - amountCents,
      );
      const recipientNewBalance = fromCents(
        toCents(recipientWallet.balance) + amountCents,
      );

      sourceWallet.balance = sourceNewBalance;
      recipientWallet.balance = recipientNewBalance;

      await manager.save(sourceWallet);
      await manager.save(recipientWallet);

      const correlationId = crypto.randomUUID();

      // Sender's ledger row: money going out.
      const outgoing = manager.create(Transaction, {
        amount,
        type: TransactionType.TRANSFER,
        direction: TransactionDirection.DEBIT,
        status: TransactionStatus.SUCCESS,
        reference: `TRF-OUT-${correlationId}`,
        walletId: sourceWallet.id,
        counterpartyWalletId: recipientWallet.id,
        balanceAfter: sourceNewBalance,
        correlationId,
      });

      // Recipient's ledger row: money coming in.
      const incoming = manager.create(Transaction, {
        amount,
        type: TransactionType.TRANSFER,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.SUCCESS,
        reference: `TRF-IN-${correlationId}`,
        walletId: recipientWallet.id,
        counterpartyWalletId: sourceWallet.id,
        balanceAfter: recipientNewBalance,
        correlationId,
      });

      await manager.save(outgoing);
      await manager.save(incoming);

      return {
        message: 'Transfer successful',
        sourceNewBalance,
        reference: outgoing.reference,
      };
    });
  }
}