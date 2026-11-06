import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User, UserStatus } from '../users/user.entity';
import { Wallet } from '../wallet/wallet.entity';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SignupDto } from './dto/signup.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    private jwtService: JwtService,
    private dataSource: DataSource,
  ) {}

  async signup(signupDto: SignupDto) {
    const { email, password } = signupDto;

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Use QueryRunner to ensure atomic user signup and default wallet provisioning
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = queryRunner.manager.create(User, {
        email,
        passwordHash,
      });
      const savedUser = await queryRunner.manager.save(user);

      // Auto-provision a default USD wallet for the new user
      const wallet = queryRunner.manager.create(Wallet, {
        balance: 0.00,
        currency: 'USD',
        userId: savedUser.id,
      });
      
      const savedWallet = await queryRunner.manager.save(wallet);

      await queryRunner.commitTransaction();

      // Generate JWT token upon successful signup
      const payload = { sub: savedUser.id, email: savedUser.email };
      const access_token = this.jwtService.sign(payload);

      return {
        message: 'Account created successfully with a default USD wallet',
        access_token,
        userId: savedUser.id,
        email: savedUser.email,
        walletId: savedWallet.id,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async login(loginDto: SignupDto) {
    const { email, password } = loginDto;

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Find the user's wallet ID
    const wallet = await this.walletRepository.findOne({ where: { userId: user.id } });

    const payload = { sub: user.id, email: user.email };
    const access_token = this.jwtService.sign(payload);

    return {
      message: 'Login successful',
      access_token,
      userId: user.id,
      email: user.email,
      walletId: wallet ? wallet.id : null,
    };
  }
}