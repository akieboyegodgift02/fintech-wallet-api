import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';
import { Wallet } from '../wallet/wallet.entity';
import { SignupDto } from './dto/signup.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private dataSource: DataSource,
  ) {}

  async signup(signupDto: SignupDto) {
    const { email, password } = signupDto;

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    // Hash password securely
    const hashedPassword = await bcrypt.hash(password, 10);

    // Use QueryRunner to ensure atomic User + Wallet creation
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Create User
      const user = queryRunner.manager.create(User, {
        email,
        passwordHash: hashedPassword,
      });
      await queryRunner.manager.save(user);

      // 2. Automatically provision default Wallet
      const wallet = queryRunner.manager.create(Wallet, {
        balance: 0.00,
        currency: 'USD',
        user: user,
      });
      await queryRunner.manager.save(wallet);

      // Commit transaction if both succeed
      await queryRunner.commitTransaction();

      return {
        message: 'Account created successfully with a default USD wallet',
        userId: user.id,
        email: user.email,
      };
    } catch (error) {
      // Rollback transaction on failure
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // Release query runner connection
      await queryRunner.release();
    }
  }
}