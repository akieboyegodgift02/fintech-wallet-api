import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Fintech Wallet API (E2E)', () => {
  let app: INestApplication;
  let senderAccessToken: string;
  let senderWalletId: string;
  let recipientWalletId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  }, 30000); // Increase timeout to 30 seconds for cold start

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 10000);

  it('/auth/signup (POST) - Create Sender Account', async () => {
    const uniqueEmail = `sender_${Date.now()}@fintech.com`;
    const response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: uniqueEmail, password: 'SecurePassword123!' })
      .expect(201);

    expect(response.body.access_token).toBeDefined();
    expect(response.body.walletId).toBeDefined();

    senderAccessToken = response.body.access_token;
    senderWalletId = response.body.walletId;
  });

  it('/auth/signup (POST) - Create Recipient Account', async () => {
    const uniqueEmail = `recipient_${Date.now()}@fintech.com`;
    const response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: uniqueEmail, password: 'SecurePassword123!' })
      .expect(201);

    expect(response.body.walletId).toBeDefined();
    recipientWalletId = response.body.walletId;
  });

  it('/wallet/deposit (POST) - Deposit Funds', async () => {
    const response = await request(app.getHttpServer())
      .post('/wallet/deposit')
      .set('Authorization', `Bearer ${senderAccessToken}`)
      .send({ walletId: senderWalletId, amount: 1000 })
      .expect(200);

    expect(response.body.newBalance).toEqual(1000);
  });

  it('/wallet/transfer (POST) - Transfer Funds Between Wallets', async () => {
    const response = await request(app.getHttpServer())
      .post('/wallet/transfer')
      .set('Authorization', `Bearer ${senderAccessToken}`)
      .send({
        sourceWalletId: senderWalletId,
        recipientWalletId: recipientWalletId,
        amount: 300,
      })
      .expect(200);

    expect(response.body.sourceNewBalance).toEqual(700);
  });
});