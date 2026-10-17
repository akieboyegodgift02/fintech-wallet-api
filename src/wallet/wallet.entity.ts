import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, OneToMany } from 'typeorm';
import type { User } from '../users/user.entity';
import type { Transaction } from './transaction.entity';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0.00 })
  balance: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ default: false })
  isLocked: boolean;

  @OneToOne('User', (user: User) => user.wallet, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @OneToMany('Transaction', (transaction: Transaction) => transaction.wallet)
  transactions: Transaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}