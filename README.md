# 💳 High-Concurrency Fintech Wallet & Payment API

A production-grade, fault-tolerant financial ledger and wallet service built with **NestJS**, **PostgreSQL**, **Redis**, and **BullMQ**. Designed to handle high-concurrency transactions, eliminate race conditions, and ensure absolute ACID compliance for digital asset management.

---

## 🚀 Architectural Highlights & Roadmap

* **Database & ACID Transactions:** Built with PostgreSQL and TypeORM, utilizing explicit database locks (`queryRunner`) to prevent double-spending and ledger inconsistencies during high-concurrency transfers.
* **Distributed Caching & Rate Limiting:** Powered by Redis to deliver sub-millisecond wallet balance lookups and secure endpoints against brute-force or DDoS attacks.
* **Asynchronous Message Queues:** Integrates **BullMQ** for reliable background job processing (e.g., transaction receipt generation, webhook dispatching, and audit logging).
* **Zero-Trust Security:** JWT authentication, bcrypt password hashing, and strict DTO validation pipes (`class-validator`).

---

## 🛠️ Tech Stack

* **Framework:** NestJS (Node.js framework emphasizing modularity and dependency injection)
* **Language:** TypeScript
* **Database:** PostgreSQL (Relational persistence & ACID transactions)
* **Caching & Queues:** Redis & BullMQ
* **ORM:** TypeORM

---

## ⚙️ Getting Started

### 1. Prerequisites
Ensure you have the following installed on your machine:
* Node.js (v18+ recommended)
* PostgreSQL
* Redis