import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  JoinColumn,
  OneToOne,
  Check,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Transaction } from './transaction.entity';
import { decimalTransformer } from '../common/decimal.transformer';

@Entity('wallets')
@Check('CHK_wallets_balance_non_negative', '"balance" >= 0')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0.0,
    transformer: decimalTransformer,
  })
  balance: number;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ default: false })
  isLocked: boolean;

  @OneToOne(() => User, (user) => user.wallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @OneToMany(() => Transaction, (transaction) => transaction.wallet)
  transactions: Transaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}