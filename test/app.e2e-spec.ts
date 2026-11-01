import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('App E2E Security & Health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 10000);

  it('/wallet/deposit (POST) without token should return 401 Unauthorized', () => {
    return request(app.getHttpServer())
      .post('/wallet/deposit')
      .send({ walletId: '123e4567-e89b-12d3-a456-426614174000', amount: 100 })
      .expect(401);
  });
});