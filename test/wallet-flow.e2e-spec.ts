
import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';

import { AppModule } from './../src/app.module';

describe('Fintech Wallet API (E2E)', () => {
  let app: INestApplication;

  let senderAccessToken: string;
  let recipientAccessToken: string;

  let senderWalletId: string;
  let recipientWalletId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 10000);

  // ------------------------------
  // ACCOUNT CREATION
  // ------------------------------

  it('/auth/signup (POST) - Create Sender Account', async () => {
    const uniqueEmail = `sender_${Date.now()}@fintech.com`;

    const response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'SecurePassword123!',
      })
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
      .send({
        email: uniqueEmail,
        password: 'SecurePassword123!',
      })
      .expect(201);

    expect(response.body.access_token).toBeDefined();
    expect(response.body.walletId).toBeDefined();

    recipientAccessToken = response.body.access_token;
    recipientWalletId = response.body.walletId;
  });

  // ------------------------------
  // AUTHENTICATION TESTS
  // ------------------------------

  it('/wallet/deposit (POST) - Reject unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .post('/wallet/deposit')
      .send({
        walletId: senderWalletId,
        amount: 100,
      })
      .expect(401);
  });

  // ------------------------------
  // WALLET OWNERSHIP TESTS
  // ------------------------------

  it('/wallet/deposit (POST) - Prevent depositing into another users wallet', async () => {
    await request(app.getHttpServer())
      .post('/wallet/deposit')
      .set('Authorization', `Bearer ${recipientAccessToken}`)
      .send({
        walletId: senderWalletId,
        amount: 100,
      })
      .expect(404);
  });

  it('/wallet/transfer (POST) - Prevent transferring from another users wallet', async () => {
    await request(app.getHttpServer())
      .post('/wallet/transfer')
      .set('Authorization', `Bearer ${recipientAccessToken}`)
      .send({
        sourceWalletId: senderWalletId,
        recipientWalletId: recipientWalletId,
        amount: 50,
      })
      .expect(404);
  });

  // ------------------------------
  // DEPOSIT TEST
  // ------------------------------

  it('/wallet/deposit (POST) - Deposit Funds', async () => {
    const response = await request(app.getHttpServer())
      .post('/wallet/deposit')
      .set('Authorization', `Bearer ${senderAccessToken}`)
      .send({
        walletId: senderWalletId,
        amount: 1000,
      })
      .expect(200);

    expect(Number(response.body.newBalance)).toBe(1000);
    expect(response.body.transactionReference).toBeDefined();
  });

  // ------------------------------
  // TRANSFER TEST
  // ------------------------------

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

    expect(Number(response.body.sourceNewBalance)).toBe(700);
    expect(response.body.reference).toBeDefined();
  });
});
