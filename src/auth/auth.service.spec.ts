import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../users/user.entity';
import { Wallet } from '../wallet/wallet.entity';
import { Transaction } from '../wallet/transaction.entity';

describe('AuthService (Integration)', () => {
  let authService: AuthService;
  let module: TestingModule;
  let dataSource: DataSource;

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

  it('should successfully sign up a user and automatically provision a USD wallet', async () => {
    const result = await authService.signup({
      email: 'test@fintech.com',
      password: 'SecurePassword123!',
    });

    expect(result).toBeDefined();
    expect(result.access_token).toBeDefined();
    expect(result.walletId).toBeDefined();

    const createdUser = await dataSource.getRepository(User).findOne({
      where: { email: 'test@fintech.com' },
    });
    expect(createdUser).toBeDefined();

    const createdWallet = await dataSource.getRepository(Wallet).findOne({
      where: { userId: createdUser.id },
    });
    expect(createdWallet).toBeDefined();
    expect(Number(createdWallet.balance)).toEqual(0);
    expect(createdWallet.currency).toEqual('USD');
  });

  it('should throw a BadRequestException if the email is already registered', async () => {
    await authService.signup({
      email: 'duplicate@fintech.com',
      password: 'SecurePassword123!',
    });

    await expect(
      authService.signup({
        email: 'duplicate@fintech.com',
        password: 'AnotherPassword123!',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should successfully log in a user with valid credentials', async () => {
    await authService.signup({
      email: 'login@fintech.com',
      password: 'SecurePassword123!',
    });

    const result = await authService.login({
      email: 'login@fintech.com',
      password: 'SecurePassword123!',
    });

    expect(result).toBeDefined();
    expect(result.access_token).toBeDefined();
  });

  it('should throw UnauthorizedException if login fails with incorrect password', async () => {
    await authService.signup({
      email: 'login@fintech.com',
      password: 'SecurePassword123!',
    });

    await expect(
      authService.login({
        email: 'login@fintech.com',
        password: 'WrongPassword!',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});