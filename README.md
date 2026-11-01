# Fintech Wallet API

A fintech wallet backend built with **NestJS, TypeScript, PostgreSQL, and TypeORM**, exploring secure authentication, wallet management, financial transactions, and reliable backend architecture.

## Overview

Fintech Wallet API is a backend engineering project focused on implementing the foundations of a digital wallet system.

The application separates authentication, user data, and wallet operations into dedicated NestJS modules. It includes JWT authentication infrastructure, database entities for wallets and transactions, and request DTOs for deposits and transfers.

The project emphasizes correctness, security, and maintainable backend design.

## Tech Stack

| Category | Technology |
|---|---|
| Framework | NestJS 12 |
| Language | TypeScript |
| Database | PostgreSQL |
| ORM | TypeORM |
| Database Driver | `pg` |
| Authentication | JWT, Passport |
| Password Hashing | bcrypt |
| Validation | class-validator |
| Request Transformation | class-transformer |
| API Documentation | Swagger |
| Rate Limiting | @nestjs/throttler |
| Unit Testing | Jest |
| E2E Testing | Jest, Supertest |
| Test Database Tooling | SQLite |

## Project Structure

```text
src/
├── auth/
│   ├── dto/
│   │   └── signup.dto.ts
│   ├── auth.controller.ts
│   ├── auth.module.ts
│   ├── auth.service.ts
│   ├── jwt-auth.guard.ts
│   └── jwt.strategy.ts
├── users/
│   └── user.entity.ts
├── wallet/
│   ├── dto/
│   │   ├── deposit.dto.ts
│   │   └── transfer.dto.ts
│   ├── transaction.entity.ts
│   ├── wallet.controller.ts
│   ├── wallet.entity.ts
│   ├── wallet.module.ts
│   └── wallet.service.ts
├── app.controller.ts
├── app.module.ts
├── app.service.ts
└── main.ts

test/
├── app.e2e-spec.ts
└── wallet-flow.e2e-spec.ts
```

## Application Modules

### Authentication (`auth`)

Responsible for the application's authentication infrastructure.

- Signup request DTO.
- Authentication controller and service.
- JWT strategy.
- JWT authentication guard.
- Dedicated authentication module.

Password hashing and token issuance should be verified against the actual service implementation.

### Users (`users`)

Contains the user entity used to represent application users and their persisted data.

### Wallet (`wallet`)

Contains the core wallet-related components.

- Wallet entity.
- Transaction entity.
- Wallet controller and service.
- Deposit request DTO.
- Transfer request DTO.
- Wallet module.
- Unit tests for wallet service behavior.

The wallet module provides the foundation for deposit and transfer workflows. The exact transaction guarantees depend on the service implementation and database configuration.

## Getting Started

### Prerequisites

- Node.js compatible with the project's dependencies.
- npm.
- A PostgreSQL database.
- Git.

A hosted PostgreSQL instance, such as Neon, can be used for development.

### Installation

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/fintech-wallet-api.git
cd fintech-wallet-api
```

Install dependencies:

```bash
npm install
```

### Environment Variables

Create a `.env` file in the project root.

Example configuration:

```env
PORT=3000
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your_secure_jwt_secret
```

These variable names are examples. Check `app.module.ts`, `main.ts`, and the relevant configuration files to confirm the actual names and required settings.

Never commit `.env` files or production credentials to Git.

## Running the Application

Start the development server:

```bash
npm run start:dev
```

Build the application:

```bash
npm run build
```

Start the compiled application:

```bash
npm run start:prod
```

## Testing

Run unit tests:

```bash
npm run test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Generate test coverage:

```bash
npm run test:cov
```

Run end-to-end tests:

```bash
npm run test:e2e
```

The repository includes unit-test files for authentication and wallet services, alongside E2E test files for application and wallet-flow behavior.

Test coverage and passing status should be established by running the test suite.

## Financial Integrity

Financial operations require strict consistency guarantees. Important engineering concerns for this project include:

- **Atomic transactions:** Related database changes should succeed or fail together.
- **Concurrency control:** Concurrent deposits and transfers must not produce incorrect balances.
- **Balance invariants:** Wallet balances and transaction records must remain consistent.
- **Transfer validation:** Reject invalid amounts and unauthorized wallet operations.
- **Idempotency:** Protect against duplicate operations caused by request retries.
- **Transaction history:** Maintain reliable records for reconciliation and auditing.

These are key engineering goals. Their enforcement must be verified in the implementation and tests.

## Security Considerations

The project includes JWT and Passport dependencies, a JWT strategy, an authentication guard, bcrypt, request validation libraries, and throttling support.

For a real financial application, additional verification is required for:

- Authentication and resource-level authorization.
- Secure password storage and token handling.
- Rate limiting on sensitive endpoints.
- Protection against concurrent transaction races.
- Secure database configuration and secret management.
- Error handling and sensitive-data exposure.
- Financial reconciliation and auditability.

The presence of security-related dependencies does not by itself establish that every protection is correctly configured.

## Project Status

**Status:** Under development.

This project explores backend engineering practices for digital wallets, authentication, database persistence, and financial transaction workflows.

It is intended for learning and engineering development. It should not be considered production-ready for real customer funds without comprehensive testing, security review, operational safeguards, and applicable regulatory assessment.

## License

This repository is marked `UNLICENSED` in `package.json`. No open-source license has been granted.
