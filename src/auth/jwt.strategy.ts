import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../users/user.entity';

interface JwtPayload {
  sub: string;
  email?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly usersRepository: Repository<User>;

  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    usersRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });

    this.usersRepository = usersRepository;
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is inactive or unavailable');
    }

    return {
      userId: user.id,
      email: user.email,
    };
  }
}