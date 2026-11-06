
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import { User, UserStatus } from '../users/user.entity';
import { Wallet } from '../wallet/wallet.entity';
import { Transaction } from '../wallet/transaction.entity';

describe('AuthService (Integration)', () => {
  let authService: AuthService;
  let module: TestingModule;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const testEmail = 'test@fintech.com';
  const testPassword = 'SecurePassword123!';

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [User, Wallet, Transaction],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([User, Wallet, Transaction]),
        JwtModule.register({
          secret: 'test-secret-key',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      providers: [AuthService],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    dataSource = module.get<DataSource>(DataSource);
    jwtService = module.get<JwtService>(JwtService);
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
  });

  // ------------------------------
  // SIGNUP TESTS
  // ------------------------------

  it('should successfully sign up a user and provision a USD wallet', async () => {
    const result = await authService.signup({
      email: testEmail,
      password: testPassword,
    });

    expect(result).toBeDefined();
    expect(result.access_token).toBeDefined();
    expect(result.walletId).toBeDefined();

    const createdUser = await dataSource.getRepository(User).findOne({
      where: { email: testEmail },
    });

    expect(createdUser).toBeDefined();
    expect(createdUser.status).toBe(UserStatus.ACTIVE);

    const createdWallets = await dataSource.getRepository(Wallet).find({
      where: { userId: createdUser.id },
    });

    expect(createdWallets).toHaveLength(1);
    expect(createdWallets[0].id).toBe(result.walletId);
    expect(Number(createdWallets[0].balance)).toBe(0);
    expect(createdWallets[0].currency).toBe('USD');
  });

  it('should throw BadRequestException if the email is already registered', async () => {
    await authService.signup({
      email: 'duplicate@fintech.com',
      password: testPassword,
    });

    await expect(
      authService.signup({
        email: 'duplicate@fintech.com',
        password: 'AnotherPassword123!',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ------------------------------
  // LOGIN TESTS
  // ------------------------------

  it('should successfully log in with valid credentials', async () => {
    await authService.signup({
      email: testEmail,
      password: testPassword,
    });

    const result = await authService.login({
      email: testEmail,
      password: testPassword,
    });

    expect(result).toBeDefined();
    expect(result.access_token).toBeDefined();

    // Verify that the returned token is valid.
    const decodedToken = await jwtService.verifyAsync(
      result.access_token,
    );

    expect(decodedToken).toBeDefined();
  });

  it('should reject login with an incorrect password', async () => {
    await authService.signup({
      email: testEmail,
      password: testPassword,
    });

    await expect(
      authService.login({
        email: testEmail,
        password: 'WrongPassword!',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject login for an email that does not exist', async () => {
    await expect(
      authService.login({
        email: 'unknown@fintech.com',
        password: testPassword,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject login for a suspended account', async () => {
    await authService.signup({
      email: testEmail,
      password: testPassword,
    });

    await dataSource.getRepository(User).update(
      { email: testEmail },
      { status: UserStatus.SUSPENDED },
    );

    await expect(
      authService.login({
        email: testEmail,
        password: testPassword,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
