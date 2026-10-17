import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbUrl = configService.get<string>('DATABASE_URL') || process.env.DATABASE_URL;
        console.log('🔍 Database URL Loaded:', dbUrl ? 'SUCCESS ✅' : 'FAILED ❌');

        return {
          type: 'postgres',
          url: dbUrl,
          ssl: {
            rejectUnauthorized: false, // Required for Neon
          },
          autoLoadEntities: true,
          synchronize: true,
        };
      },
    }),
  ],
})
export class AppModule {}