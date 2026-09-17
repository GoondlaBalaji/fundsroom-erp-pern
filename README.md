# Fundsroom ERP — PERN Full-Stack Technical Case Study

> A production-grade Enterprise Resource Planning (ERP) platform built with the **PERN stack (PostgreSQL + Express.js + React.js + Node.js + Prisma)**, implementing an end-to-end industrial manufacturing and supply chain workflow:  
> **Customer Enquiry → Sales Quotation → Sales Order → Concurrency-Safe Inventory Reservation → Complete Dispatch**.

---

## 1. Project Overview

Fundsroom ERP is engineered to demonstrate enterprise-grade software architecture:
- **Full Relational Normalization**: Exactly 12 normalized domain business tables in PostgreSQL with zero unstructured JSON blobs.
- **ACID Transactional Guarantees**: Multi-table state transitions executed atomically within Prisma transactions.
- **Pessimistic Concurrency Control**: Row-level locking (`SELECT ... FOR UPDATE`) in deterministic order (`product_id ASC`) to eliminate inventory race conditions, double reservations, and deadlocks.
- **Authoritative Backend Pricing**: All discounts, taxes, and valuations calculated strictly on the backend using half-up roundings in INR (`₹`), with client tamper detection.
- **Strict Role-Based Access Control (RBAC)**: Distinct permissions enforced at the API layer for `ADMIN` and `SALES_USER`.
- **Durable PostgreSQL Idempotency**: Safe client retries with hash-based duplicate prevention across customer, enquiry, and quotation creations.

```text
Customer Enquiry (Multi-Product Intake)
       ↓
Sales Quotation (Authoritative INR Half-Up Pricing)
       ↓
Quotation Acceptance (Gate for Order Conversion)
       ↓
Sales Order Creation (Atomic 1:1 Link, Enquiry Marked WON)
       ↓
Admin Order Confirmation & Deterministic Inventory Reservation (FOR UPDATE Locks)
       ↓
Single Complete Dispatch (1:1 Fulfillment, Decrements Physical & Reserved Stock)
```

---

## 2. Technology Stack

| Layer | Technologies Used | Description |
|---|---|---|
| **Frontend** | React 18, TypeScript 5, Vite 5, Axios, Lucide React, Vanilla CSS3 | Modular React application with responsive corporate design system and role switching |
| **Backend** | Node.js (v20 LTS), Express 4, TypeScript 5 | Modular route/service architecture with centralized error handling |
| **Database & ORM** | PostgreSQL 17, Prisma ORM 5 | 12 domain tables, check constraints, foreign keys, and atomic sequence counters |
| **Validation** | Zod 3 | Strict runtime schema validation for incoming requests and query params |
| **Authentication & Security** | JWT (jsonwebtoken), bcryptjs, Helmet, CORS | Password hashing with 10 salt rounds, stateless JWT bearer tokens (24h expiry) |
| **Testing** | Jest 29, ts-jest, Supertest | 19 integration test suites, 170 tests passing with zero mocks |
| **CI/CD** | GitHub Actions | Automated build, lint, database migrations, and integration test execution |

---

## 3. Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                      React 18 + Vite Frontend                           │
│  - TypeScript 5 & Modular API Client (Axios with Bearer Interceptor)    │
│  - Role-Based UI Guarding & Demo Switcher (Admin / Sales User)          │
│  - Responsive Corporate Design System (Inter typography, CSS Variables) │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTP / REST (/api)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Node.js + Express Backend                           │
│  - Modular Architecture: 9 Domain & Infrastructure Modules              │
│  - Zod Request Schema Validation Middlewares                            │
│  - JWT Authentication & Strict RBAC Authorization Middlewares           │
│  - Centralized Error Handling (Sanitizing database errors and stacks)   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Prisma ORM 5
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     PostgreSQL 17 Database                              │
│  - 12 Normalized Relational Business Tables + 2 Infrastructure Tables   │
│  - Pessimistic Row-Level Locking (SELECT ... FOR UPDATE)                │
│  - Deterministic Product ID Ascending Lock Ordering (Deadlock Safety)   │
│  - Multi-Entity ACID Transactions via prisma.$transaction               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Authentication & RBAC Flow
1. Client submits credentials to `POST /api/auth/login`.
2. Backend verifies bcrypt hash (10 salt rounds) and issues a signed JWT token containing `userId`, `email`, and `role`.
3. Client includes token in subsequent requests: `Authorization: Bearer <jwtToken>`.
4. `authenticate` middleware verifies token validity and attaches `req.user`.
5. `authorize(UserRole.ADMIN)` middleware inspects the authenticated role. Disallowed roles (`SALES_USER`) are rejected with `403 Forbidden`.

---

## 4. Core Business Workflow

### 4.1 Customer & Enquiry Creation
- Sales users register client enterprises and create multi-product enquiries.
- Each enquiry requires a valid future date (`requiredDate >= today`) and line items with positive quantities.
- An atomic daily document number is assigned: `ENQ-YYYYMMDD-XXXX`.

### 4.2 Authoritative Sales Quotations
- Quotations are issued against valid enquiries (enquiries with status `WON` or `LOST` are strictly blocked).
- The backend authoritatively calculates line base amounts, discounts, GST, and grand total.
- **Tamper Protection**: If the client provides a `clientGrandTotal` that disagrees with the backend calculation by more than ₹0.05, the request is rejected with `400 Bad Request`.

### 4.3 Quotation Acceptance & Sales Order Conversion
- Only quotations in `ACCEPTED` status can be converted to a Sales Order (`DRAFT` or `REJECTED` quotes are rejected).
- Conversion is strictly **1:1** enforced by `@unique` on `sales_orders.quotation_id`. Re-converting returns `409 Conflict`.
- Upon successful conversion, the parent enquiry is atomically updated to status `WON`.

### 4.4 Admin Confirmation & Inventory Reservation
- Only users with the `ADMIN` role may confirm orders.
- Uses PostgreSQL pessimistic row-level locking:
  1. Locks the sales order row (`SELECT id, status FROM sales_orders WHERE id = $1 FOR UPDATE`).
  2. Acquires row locks on all involved inventory rows in ascending `product_id` order (`SELECT ... FROM inventories WHERE product_id = ANY(...) ORDER BY product_id ASC FOR UPDATE`).
  3. Verifies stock availability: `availableQuantity >= item.quantity`.
  4. If sufficient: Atomically increments `reservedQuantity` while `physicalQuantity` remains untouched.
  5. If insufficient: Rolls back transaction and returns `409 Conflict`.

### 4.5 Sales Order Cancellation & Stock Release
- If a `CONFIRMED` sales order is cancelled by Admin, the committed stock is automatically released back to the sellable pool (`reservedQuantity` decremented).
- If a `PENDING` sales order is cancelled, status changes to `CANCELLED` without stock alterations.
- Already `DISPATCHED` orders cannot be cancelled (`400 Bad Request`).

### 4.6 Single Complete Dispatch Fulfillment
- Dispatches are processed exclusively by Admin on `CONFIRMED` orders.
- Exactly **one complete dispatch** per order (`dispatches.sales_order_id` is `@unique`).
- Atomically decrements both `physicalQuantity` and `reservedQuantity`, and transitions the sales order to terminal `DISPATCHED`.

---

## 5. Roles & Permissions

| Feature / Action | `ADMIN` | `SALES_USER` | HTTP Status on Denial |
|---|:---:|:---:|:---:|
| View Dashboard & Product Catalog | ✅ | ✅ | 401 (if unauthenticated) |
| View Live Inventory Balances | ✅ | ✅ | 401 |
| Create Customers & Enquiries | ✅ | ✅ | 401 |
| Create & Transition Quotations | ✅ | ✅ | 401 |
| Convert Accepted Quotation to Sales Order | ✅ | ✅ | 401 |
| View Sales Orders & Dispatches | ✅ | ✅ | 401 |
| **Confirm Sales Order & Reserve Inventory** | ✅ | ❌ | **403 Forbidden** |
| **Cancel Sales Order (Stock Release)** | ✅ | ❌ | **403 Forbidden** |
| **Process Order Dispatch** | ✅ | ❌ | **403 Forbidden** |
| **Idempotency Cleanup & Statistics** | ✅ | ❌ | **403 Forbidden** |

---

## 6. Database Schema & Relational Design

The system consists of **12 normalized business tables** and **2 infrastructure tables** in PostgreSQL:

- Detailed ER Diagram and schema documentation: [`docs/database/ER-Diagram.md`](docs/database/ER-Diagram.md).

```mermaid
erDiagram
    users ||--o{ enquiries : "creates"
    users ||--o{ quotations : "creates"
    users ||--o{ sales_orders : "confirms"
    users ||--o{ dispatches : "executes"

    customers ||--o{ enquiries : "places"
    customers ||--o{ quotations : "receives"
    customers ||--o{ sales_orders : "orders"

    products ||--|| inventories : "tracks (1:1)"
    products ||--o{ enquiry_items : "contains"
    products ||--o{ quotation_items : "contains"
    products ||--o{ sales_order_items : "contains"
    products ||--o{ dispatch_items : "contains"

    enquiries ||--o{ enquiry_items : "contains line items"
    enquiries ||--o{ quotations : "referenced by"

    quotations ||--o{ quotation_items : "contains line items"
    quotations ||--|| sales_orders : "converts to 1:1"

    sales_orders ||--o{ sales_order_items : "contains line items"
    sales_orders ||--|| dispatches : "fulfilled by 1:1"

    dispatches ||--o{ dispatch_items : "contains line items"
```

### Table Summary:
1. `users`: Internal accounts with bcrypt password hashes and roles (`ADMIN`, `SALES_USER`).
2. `customers`: Commercial enterprise directory.
3. `products`: Industrial sellable catalog items.
4. `inventories`: Real-time stock register (`physical_quantity`, `reserved_quantity`, `damaged_quantity`).
5. `enquiries`: Multi-product customer intake (`NEW`, `QUOTED`, `WON`, `LOST`).
6. `enquiry_items`: Line items for enquiries.
7. `quotations`: Commercial quotes with authoritative tax/discount calculations.
8. `quotation_items`: Detailed quotation line valuations.
9. `sales_orders`: Converted orders (`PENDING`, `CONFIRMED`, `DISPATCHED`, `CANCELLED`).
10. `sales_order_items`: Contracted order line items.
11. `dispatches`: Logistics fulfillment records with vehicle registration and driver info.
12. `dispatch_items`: Physical goods dispatched.
13. `document_sequences`: Atomic sequence allocation table for document numbering.
14. `idempotency_keys`: PostgreSQL-backed durable idempotency store.

---

## 7. Project Setup & Local Execution

### Prerequisites
- **Node.js**: v20 LTS or higher
- **PostgreSQL**: 16 or 17 running locally or via Docker
- **npm**: 9+

### Step 1: Clone Repository & Configure Environment
```bash
git clone https://github.com/GoondlaBalaji/fundsroom-erp-pern.git
cd fundsroom-erp-pern

# Setup Backend Environment
cp backend/.env.example backend/.env

# Setup Frontend Environment
cp frontend/.env.example frontend/.env
```

### Step 2: Configure Database & Seed Master Data
Edit `backend/.env` to configure your PostgreSQL credentials:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/fundsroom_erp?schema=public"
JWT_SECRET="your_secure_random_jwt_secret_key"
PORT=5000
NODE_ENV="development"
```

Run database migrations and seed default users and industrial products:
```bash
cd backend
npm install

# Deploy schema to PostgreSQL and generate Prisma Client
npx prisma generate
npx prisma migrate deploy

# Seed initial users, catalog products, and inventory
npm run db:seed
```

### Step 3: Run Backend Automated Tests
Execute the complete integration test suite:
```bash
cd backend
npm test
```
*Expected Output*: **19/19 test suites passed, 170/170 tests passing (0 failures)**.

### Step 4: Start Backend Development Server
```bash
cd backend
npm run dev
# Server starts at http://localhost:5000
```

### Step 5: Start Frontend Development Server
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
# Frontend runs at http://localhost:5173
```

### Step 6: Production Build Validation
```bash
# Build backend
cd backend
npm run build

# Build frontend
cd frontend
npm run build
```

---

## 8. Environment Variables Reference

### Backend (`backend/.env`)
| Variable | Required | Description | Safe Default / Example |
|---|:---:|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection URI | `postgresql://postgres:pass@localhost:5432/fundsroom_erp?schema=public` |
| `JWT_SECRET` | Yes | Secret key for signing auth tokens | `super_secret_jwt_key_2026` |
| `PORT` | No | Express HTTP port | `5000` |
| `NODE_ENV` | No | Execution mode | `development` / `production` / `test` |
| `FRONTEND_URL` | No | CORS allowed origin | `http://localhost:5173` |
| `IDEMPOTENCY_TTL_HOURS` | No | TTL for idempotency records | `24` |

### Frontend (`frontend/.env`)
| Variable | Required | Description | Default |
|---|:---:|---|---|
| `VITE_API_URL` | Yes | API base URL | `/api` |

---

## 9. Seed Test Credentials

The database seed provides two pre-configured accounts:

| Role | Email | Password | Allowed Capabilities |
|---|---|---|---|
| **Admin** | `admin@fundsroom.com` | `AdminPassword@123` | Full access: View all, Confirm Orders, Reserve Inventory, Cancel Orders, Dispatch |
| **Sales User** | `sales@fundsroom.com` | `SalesPassword@123` | Commercial access: Customers, Enquiries, Quotations, Convert Quotes to Orders |

*Note: The frontend UI features a one-click demo credential switcher for seamless evaluator testing.*

---

## 10. Automated Test Suite

Fundsroom ERP features a comprehensive, 100% automated test suite built with **Jest and Supertest**. Tests run against real PostgreSQL database transactions:

```bash
cd backend
npm test
```

### Test Coverage Highlights (19 Suites / 170 Passing Tests):
1. **Quotation Calculation & Tamper Protection** ([`quotation-calculation.test.ts`](backend/tests/integration/quotation-calculation.test.ts)):
   - Verifies base amount, discount, GST, and grand total calculations.
   - Rejects mismatched `clientGrandTotal` (> ₹0.05 discrepancy).
2. **Quotation Status Rules & Conversion** ([`quotation-conversion.test.ts`](backend/tests/integration/quotation-conversion.test.ts)):
   - Rejects conversion of `DRAFT` or `REJECTED` quotations.
   - Allows conversion only when quotation is `ACCEPTED`.
3. **Duplicate Sales Order Prevention** ([`duplicate-order.test.ts`](backend/tests/integration/duplicate-order.test.ts)):
   - Verifies strict 1:1 quotation-to-order conversion.
   - Rejects subsequent conversion attempts with `409 Conflict`.
4. **Inventory Reservation & Limits** ([`inventory-reservation.test.ts`](backend/tests/integration/inventory-reservation.test.ts)):
   - Rejects confirmation when requested quantity exceeds available stock.
   - Confirms order and increments `reservedQuantity` while `physicalQuantity` stays unchanged.
5. **RBAC Authorization Enforcement** ([`rbac-authorization.test.ts`](backend/tests/integration/rbac-authorization.test.ts)):
   - Blocks `SALES_USER` from confirming sales orders (`403 Forbidden`).
   - Blocks `SALES_USER` from executing dispatches (`403 Forbidden`).
   - Rejects unauthenticated requests (`401 Unauthorized`).
6. **Concurrent Inventory Reservation Safety** ([`concurrency-reservation.test.ts`](backend/tests/integration/concurrency-reservation.test.ts)):
   - Simultaneously confirms competing orders under race conditions; exactly one succeeds and one is rejected.
7. **Same-Order Concurrent Confirmation** ([`same-order-concurrency.test.ts`](backend/tests/integration/same-order-concurrency.test.ts)):
   - Validates that concurrent confirmation attempts on the same order result in exactly one success.
8. **Sales Order Cancellation & Stock Release** ([`order-cancellation.test.ts`](backend/tests/integration/order-cancellation.test.ts)):
   - Verifies that cancelling a confirmed order releases reserved stock back to available pool.
   - Rejects cancellation of dispatched orders (`400 Bad Request`).
9. **Dispatch Workflow & Stock Deduction** ([`dispatch-workflow.test.ts`](backend/tests/integration/dispatch-workflow.test.ts)):
   - Verifies atomic decrement of both physical and reserved stock upon dispatch.
   - Rejects duplicate dispatch attempts on the same order (`409 Conflict`).
10. **Business Edge Cases & Input Hardening** ([`final-input-edge-case-hardening.test.ts`](backend/tests/integration/final-input-edge-case-hardening.test.ts)):
    - Whitespace trimming, Indian mobile validation, past requiredDate prevention, unclamped inventory math.
11. **Durable PostgreSQL Idempotency** ([`idempotency-foundation.test.ts`](backend/tests/integration/idempotency-foundation.test.ts), [`customer-idempotency.test.ts`](backend/tests/integration/customer-idempotency.test.ts), [`enquiry-idempotency.test.ts`](backend/tests/integration/enquiry-idempotency.test.ts), [`quotation-idempotency.test.ts`](backend/tests/integration/quotation-idempotency.test.ts), [`phase-2b5-concurrency-failure.test.ts`](backend/tests/integration/phase-2b5-concurrency-failure.test.ts), [`phase-2b6-operational-hardening.test.ts`](backend/tests/integration/phase-2b6-operational-hardening.test.ts)):
    - Hash determinism, key collisions, retry replaying original response, concurrency stress tests (10 identical requests -> 1 entity).

---

## 11. API Documentation & Postman Collection

Complete REST API documentation and exportable Postman collections are provided:
- **API Documentation**: [`docs/api/API-Documentation.md`](docs/api/API-Documentation.md)
- **Postman Collection**: [`docs/postman/Fundsroom-ERP.postman_collection.json`](docs/postman/Fundsroom-ERP.postman_collection.json)

### How to Use the Postman Collection:
1. Open Postman → Click **Import** → Select `docs/postman/Fundsroom-ERP.postman_collection.json`.
2. The collection variables (`baseUrl`, `jwtToken`, `adminToken`, `salesToken`) are pre-configured.
3. Run the **1. Authentication → Login as Admin** or **Login as Sales User** request.
4. The post-response script automatically saves the token to the collection variable `jwtToken`.
5. Execute requests sequentially to trace the complete workflow: Customers → Enquiries → Quotations → Sales Orders → Dispatches.

---

## 12. 5-Minute Demonstration Walkthrough Script

| Time | Workflow Phase | Action / Demonstration Points | Role |
|---|---|---|---|
| **0:00 - 0:45** | **Login & Commercial Intake** | Sign in as `sales@fundsroom.com`. Navigate to **Customers** and create a client (*Apex Heavy Industries*). Open **Enquiries** and create a multi-product inquiry for 10 Valves and 5 Pumps. | `SALES_USER` |
| **0:45 - 1:45** | **Quotation & Conversion** | Open **Quotations** → New Quotation. Apply 5% discount and 18% GST; observe authoritative INR calculation. Submit quote, click **Mark ACCEPTED**, and convert to Sales Order. Show parent enquiry marked `WON`. | `SALES_USER` |
| **1:45 - 2:45** | **Order Confirmation & Stock Reservation** | Switch role to `admin@fundsroom.com` via demo switcher. Open **Sales Orders** → View stock availability check. Click **Confirm & Reserve Stock**. Show `reserved_quantity` incremented in inventory without changing `physical_quantity`. | `ADMIN` |
| **2:45 - 3:45** | **Complete Dispatch Fulfillment** | Open **Dispatches** → Click **Process Dispatch**. Input vehicle (`MH-12-TX-9999`) and driver name. Confirm fulfillment. Show both `physical_quantity` and `reserved_quantity` decremented atomically. Order status is now terminal `DISPATCHED`. | `ADMIN` |
| **3:45 - 4:45** | **Order Cancellation & Stock Release** | Convert a second quote to an order, confirm it, and then click **Cancel Order**. Show that reserved inventory is immediately returned to the sellable pool. | `ADMIN` |
| **4:45 - 5:00** | **Automated Test Suite** | Show terminal executing `npm test`: all 19 suites and 170 tests passing. | Technical Proof |

---

## 13. Project Structure

```text
fundsroom-erp-pern/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Automated CI workflow
│       └── cd.yml                 # Production build and readiness check
├── backend/
│   ├── prisma/
│   │   ├── migrations/            # 4 SQL migrations
│   │   ├── schema.prisma          # PostgreSQL schema (12 domain tables)
│   │   └── seed.ts                # Database seeder (users, products, stock)
│   ├── src/
│   │   ├── config/                # Environment config & Prisma client instance
│   │   ├── middlewares/           # Auth, RBAC, Validation, and Error handling
│   │   ├── modules/               # Domain modules:
│   │   │   ├── auth/              # JWT login and profile
│   │   │   ├── customers/         # Customer directory
│   │   │   ├── dispatches/        # Dispatch logistics
│   │   │   ├── enquiries/         # Multi-product customer intake
│   │   │   ├── idempotency/       # Idempotency stats & cleanup
│   │   │   ├── inventory/         # Stock balance register
│   │   │   ├── products/          # Catalog master
│   │   │   ├── quotations/        # Quotation math and conversion
│   │   │   └── sales-orders/      # Order confirmation & cancellation
│   │   ├── utils/                 # Financial calculator, errors, sequence generator
│   │   ├── app.ts                 # Express application factory
│   │   └── server.ts              # HTTP entry point
│   ├── tests/
│   │   ├── helpers.ts             # Test tokens and setup helpers
│   │   └── integration/           # 19 integration test suites (170 tests)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/            # Header, Sidebar, Modal, KPI Cards
│   │   ├── pages/                 # Customers, Enquiries, Quotations, Orders, Dispatches
│   │   ├── services/              # Axios API client with auth interceptor
│   │   ├── types/                 # TypeScript domain interfaces
│   │   ├── App.tsx                # Main application component & routing
│   │   └── index.css              # Corporate design system & CSS variables
│   ├── vite.config.ts
│   └── package.json
├── docs/
│   ├── api/
│   │   └── API-Documentation.md   # Complete REST API specification
│   ├── database/
│   │   └── ER-Diagram.md          # PostgreSQL ER diagram & table definitions
│   └── postman/
│       └── Fundsroom-ERP.postman_collection.json # Ready-to-import collection
└── README.md
```

---

## 14. Security & Hardening Details

1. **Password Hashing**: Passwords stored as one-way bcrypt hashes (10 rounds).
2. **Stateless JWT**: Tokens signed with `HS256`, 24-hour expiration, validated on every protected route.
3. **Backend Authoritative Pricing**: Calculation tampering is actively prevented; all totals calculated server-side.
4. **SQL Injection Prevention**: Prisma ORM parameterized queries used across all operations.
5. **Secure HTTP Headers**: Configured with `helmet` for defense against clickjacking, sniffing, and XSS.
6. **Sanitized Errors**: Centralized error middleware ensures no raw SQL queries, stack traces, or credentials are leaked to clients.
