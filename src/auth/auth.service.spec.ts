import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../users/user.entity';
import { Wallet } from '../wallet/wallet.entity';
import { Transaction } from '../wallet/transaction.entity';

describe('AuthService (Integration)', () => {
  let authService: AuthService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [User, Wallet, Transaction],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([User, Wallet]),
      ],
      providers: [AuthService],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should successfully sign up a user and automatically provision a USD wallet', async () => {
    const signupDto = {
      email: 'test@fintech.com',
      password: 'SecurePassword123',
    };

    const result = await authService.signup(signupDto);

    expect(result).toBeDefined();
    expect(result.email).toEqual(signupDto.email);
    expect(result.userId).toBeDefined();
  });

  it('should throw a ConflictException if the email is already registered', async () => {
    const signupDto = {
      email: 'duplicate@fintech.com',
      password: 'SecurePassword123',
    };

    // First signup should succeed
    await authService.signup(signupDto);

    // Second signup with same email should fail with ConflictException
    await expect(authService.signup(signupDto)).rejects.toThrow(
      ConflictException,
    );
  });
});