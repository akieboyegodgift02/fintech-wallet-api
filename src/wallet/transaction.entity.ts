import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Check,
  Index,
} from 'typeorm';
import type { Wallet } from './wallet.entity';
import { decimalTransformer } from '../common/decimal.transformer';

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRANSFER = 'TRANSFER',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

/** DEBIT = money left this wallet, CREDIT = money entered this wallet. */
export enum TransactionDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

@Entity('transactions')
@Check('CHK_transactions_amount_positive', '"amount" > 0')
@Index(['walletId', 'createdAt'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount: number;

  @Column({
    type: 'simple-enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({
    type: 'simple-enum',
    enum: TransactionDirection,
  })
  direction: TransactionDirection;

  @Column({
    type: 'simple-enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ unique: true })
  reference: string;

  // Pass 'Wallet' as a string to avoid circular initialization errors
  @ManyToOne('Wallet', (wallet: Wallet) => wallet.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

  /** The wallet this row belongs to (whose balance it changed). */
  @Column()
  walletId: string;

  /** The other wallet involved in a transfer. Null for deposits. */
  @Column({ nullable: true })
  counterpartyWalletId: string;

  /** This wallet's balance immediately after the transaction. */
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  balanceAfter: number;

  /** Shared by the debit and credit rows of one transfer. */
  @Column({ type: 'uuid', nullable: true })
  correlationId: string;

  @CreateDateColumn()
  createdAt: Date;
}