# Fundsroom ERP

> A production-grade Enterprise Resource Planning (ERP) platform built with the **PERN stack (PostgreSQL + Express.js + React.js + Node.js + Prisma)**, implementing an end-to-end industrial manufacturing and supply chain commercial workflow:  
> **Customer Enquiry → Sales Quotation → Sales Order → Concurrency-Safe Inventory Reservation → Complete Dispatch**.
>
> Developed as a **Full-Stack Developer Technical Case Study** to demonstrate enterprise relational database design, deterministic concurrency control, strict role-based access control, authoritative backend pricing, and automated integration test coverage.

---

## 1. Features

- **JWT Authentication**: Stateless session authentication with 24-hour expiration and Bearer token parsing.
- **Password Hashing**: Secure password management using `bcryptjs` with 10 salt rounds.
- **Role-Based Access Control (RBAC)**: Distinct authorization for `ADMIN` and `SALES_USER` enforced strictly at the backend API layer.
- **Customer Management**: Client directory with contact details, company information, and relational activity tracking.
- **Multi-Product Enquiry Intake**: Customer requirement intake supporting multiple line items with future required date validation.
- **Product Catalog Master**: Industrial catalog items with unique SKU codes, categories, units of measure, and base prices.
- **Real-Time Inventory Register**: Authoritative stock balance tracking physical, reserved, and damaged stock levels.
- **Quotation Management**: Commercial quote generation with draft, sent, accepted, and rejected state transitions.
- **Authoritative Backend Financial Calculations**: Server-side calculation of line amounts, discounts, GST, and grand total in INR (`₹`) with client tamper detection.
- **Quotation → Sales Order Conversion**: Gated conversion restricted strictly to `ACCEPTED` quotations with an atomic 1:1 relational constraint and enquiry status update to `WON`.
- **Concurrency-Safe Inventory Reservation**: PostgreSQL pessimistic row-level locking (`SELECT ... FOR UPDATE`) with deterministic ascending lock ordering (`ORDER BY product_id ASC`) preventing overselling and deadlocks.
- **Sales Order Cancellation & Stock Release**: Automatic release of reserved inventory back to the available pool when a confirmed order is cancelled.
- **Complete Dispatch Fulfillment**: Single complete fulfillment per sales order, atomically reducing both physical and reserved stock.
- **Validation & Error Handling**: Strict request schema validation via `Zod` and centralized error middleware preventing SQL leaks or stack trace exposure.
- **Durable PostgreSQL Idempotency**: Safe client retries with SHA-256 canonical hash verification preventing duplicate customer, enquiry, and quotation creations under network retries or concurrent bursts.
- **Automated Integration Test Suite**: 19 test suites comprising 170 passing automated tests covering all domain workflows, financial rules, concurrency, and edge cases.

---

## 2. Business Workflow

```text
Customer
   ↓
Enquiry (Multi-Product Line Items)
   ↓
Quotation (Authoritative Server Pricing)
   ↓
Accepted Quotation (Prerequisite Gate)
   ↓
Sales Order (Strict 1:1 Link, Enquiry Marked WON)
   ↓
Admin Confirmation
   ↓
Inventory Reservation (Reserved Stock Increments; Physical Stock Untouched)
   ↓
Dispatch (Physical & Reserved Stock Atomically Decrement; Order Marked DISPATCHED)
```

### Domain State Transitions:
1. **Enquiry**: `NEW` → `QUOTED` → `WON` (automatically upon Sales Order conversion) / `LOST`.
2. **Quotation**: `DRAFT` → `SENT` → `ACCEPTED` / `REJECTED`. Only `ACCEPTED` quotations may be converted into a Sales Order.
3. **Sales Order**: `PENDING` → `CONFIRMED` → `DISPATCHED` (terminal fulfillment).
4. **Cancellation Path**:
   - `PENDING` Sales Order → `CANCELLED` (no inventory change).
   - `CONFIRMED` Sales Order → `CANCELLED` (committed reserved inventory is atomically released back to available pool).
   - `DISPATCHED` Sales Order → Cancellation strictly rejected (`400 Bad Request`).

---

## 3. User Roles

Role permissions are enforced strictly at the backend API layer via [`rbac.middleware.ts`](backend/src/middlewares/rbac.middleware.ts), not merely hidden in the frontend UI.

### `ADMIN`:
- View all system records, product catalog, and live inventory balances.
- Confirm Sales Orders and atomically reserve inventory (`POST /api/sales-orders/:id/confirm`).
- Cancel Sales Orders and release reserved inventory (`POST /api/sales-orders/:id/cancel`).
- Process order dispatch and complete fulfillment (`POST /api/dispatches`).
- View operational idempotency metrics and trigger manual cleanup of expired keys (`/api/idempotency/*`).

### `SALES_USER`:
- View all system records, product catalog, and live inventory balances.
- Register new client companies (`POST /api/customers`).
- Create multi-product enquiries (`POST /api/enquiries`).
- Generate commercial quotations (`POST /api/quotations`).
- Update quotation statuses (`PATCH /api/quotations/:id/status`).
- Convert `ACCEPTED` quotations to Sales Orders (`POST /api/quotations/:id/convert`).
- **Restricted**: Cannot confirm sales orders, cancel sales orders, or process dispatches. Any attempt returns `403 Forbidden`.

---

## 4. Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend Framework** | React | 18.3.1 | Component-based user interface |
| **Frontend Tooling** | Vite | 5.4.11 | Fast HMR development server and production bundler |
| **Frontend Language** | TypeScript | 5.6.3 | Type-safe frontend codebase |
| **HTTP Client** | Axios | 1.7.9 | API client with Bearer token interceptor |
| **Icons & UI** | Lucide React | 0.468.0 | Consistent iconography |
| **Styling** | Vanilla CSS3 | — | Corporate design system with custom CSS tokens |
| **Backend Runtime** | Node.js | v20 LTS | Server execution environment |
| **Backend Framework** | Express.js | 4.19.2 | RESTful routing and middleware pipeline |
| **Backend Language** | TypeScript | 5.4.5 | Type-safe backend application logic |
| **Database & ORM** | PostgreSQL & Prisma | 17 / 5.22.0 | Relational database and type-safe query client |
| **Authentication** | jsonwebtoken | 9.0.2 | Stateless JWT token issuance and verification |
| **Password Hashing** | bcryptjs | 2.4.3 | One-way password hashing (10 salt rounds) |
| **Validation** | Zod | 3.23.8 | Strict schema validation for incoming HTTP payloads |
| **Security Headers** | Helmet | 7.1.0 | Standard HTTP security headers |
| **CORS** | cors | 2.8.5 | Cross-origin resource sharing control |
| **Testing** | Jest & Supertest | 29.7.0 / 7.0.0 | Integration test runner and HTTP assertions |

---

## 5. Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                      React 18 + Vite Frontend                           │
│  - TypeScript 5 & Modular Axios API Client (Bearer Interceptor)         │
│  - Role-Based UI Guarding & Demo Switcher (Admin / Sales User)          │
│  - Corporate Design System (Inter typography, CSS Variables)            │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTP / REST (/api)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Node.js + Express Backend                           │
│  - Middleware Pipeline: Helmet, CORS, Zod Schema Validation             │
│  - Authentication: JWT Bearer Verification (req.user)                   │
│  - Authorization: Strict RBAC Middleware (UserRole.ADMIN)               │
│  - Service Layer: Business Logic, Atomic Numbering, Authoritative Math │
│  - Centralized Error Handling: Sanitized AppError & Prisma Code Mappers │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Prisma ORM 5
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     PostgreSQL 17 Database                              │
│  - 12 Normalized Relational Domain Tables + 2 Infrastructure Tables     │
│  - Row-Level Locking (SELECT ... FOR UPDATE) in product_id ASC order    │
│  - Multi-Entity ACID Transactions via prisma.$transaction               │
│  - Database Check Constraints ensuring non-negative inventory balances  │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Authentication Flow**: User submits credentials to `POST /api/auth/login`. On validation against bcrypt hash, a signed JWT (24h expiry) is returned. Subsequent requests supply `Authorization: Bearer <token>`.
- **Request Validation**: Handled by reusable `validate(schema)` middleware powered by Zod before reaching controllers.
- **Service Layer & Transactions**: Operations coordinating multiple entities (conversion, reservation, dispatch, idempotency) are encapsulated in atomic `prisma.$transaction()` blocks.
- **Inventory Concurrency Protection**: High-contention operations use row-level locks sorted deterministically to eliminate deadlocks and prevent race conditions.

---

## 6. Database Design

The database schema is fully normalized into **12 domain business tables** and **2 supporting infrastructure tables**. The entire commercial lifecycle is modeled relationally with zero unstructured JSON workflow shortcuts:

### Domain Tables:
1. **`users`**: System user accounts, role (`ADMIN`, `SALES_USER`), and bcrypt password hash.
2. **`customers`**: Commercial clients with enterprise name, primary contact person, mobile, email, and city.
3. **`products`**: Sellable inventory catalog with unique SKU `code`, category, unit of measure, and base price.
4. **`inventories`**: Stock register for each product (`1:1` link), tracking `physical_quantity`, `reserved_quantity`, and `damaged_quantity`.
5. **`enquiries`**: Inbound customer requests with sequential numbering (`ENQ-YYYYMMDD-XXXX`) and required delivery dates.
6. **`enquiry_items`**: Line items per enquiry referencing products and quantities (`ON DELETE CASCADE`).
7. **`quotations`**: Commercial quotes referencing an enquiry and customer with sequential numbering (`QTN-YYYYMMDD-XXXX`) and authoritative totals.
8. **`quotation_items`**: Quotation line valuations detailing unit price, discount percentage, GST percentage, and line total.
9. **`sales_orders`**: Contractual orders with unique sequential numbering (`SO-YYYYMMDD-XXXX`). Linked **1:1** to `quotation_id` (`@unique`).
10. **`sales_order_items`**: Contracted line items per sales order.
11. **`dispatches`**: Physical shipment fulfillment with unique number (`DSP-YYYYMMDD-XXXX`), vehicle registration, and driver name. Linked **1:1** to `sales_order_id` (`@unique`).
12. **`dispatch_items`**: Physical product quantities fulfilled in the dispatch.

### Supporting Infrastructure Tables:
13. **`document_sequences`**: Atomic sequence allocation counters (`ENQ`, `QTN`, `SO`, `DSP`) for collision-free sequential business numbering under concurrency.
14. **`idempotency_keys`**: PostgreSQL-backed idempotency records storing request fingerprints (`key`, `userId`, `method`, `path`), execution status (`PROCESSING`, `COMPLETED`, `FAILED`), and stored responses.

- Detailed ER Diagram and schema documentation: [`docs/database/ER-Diagram.md`](docs/database/ER-Diagram.md).

---

## 7. Inventory Logic

Stock availability is calculated authoritatively using the formula:
$$\text{Available Quantity} = \text{Physical Quantity} - \text{Reserved Quantity} - \text{Damaged Quantity}$$

- `physical_quantity`: Stock physically held in the warehouse.
- `reserved_quantity`: Stock allocated to confirmed sales orders awaiting dispatch.
- `damaged_quantity`: Stock quarantined or unsellable.

### Inventory Lifecycle Operations:
- **Reservation (`POST /api/sales-orders/:id/confirm`)**:
  - `reserved_quantity` is incremented by order line quantities.
  - `physical_quantity` remains untouched.
  - Available stock decreases by the reserved quantity.
- **Dispatch (`POST /api/dispatches`)**:
  - `physical_quantity` is decremented by dispatched line quantities.
  - `reserved_quantity` is decremented by dispatched line quantities.
  - Available stock remains unchanged (the stock was already deducted from available at reservation).
- **Cancellation (`POST /api/sales-orders/:id/cancel`)**:
  - If the order was `CONFIRMED`: `reserved_quantity` is decremented, returning stock to the available pool.
  - If the order was `PENDING`: No inventory alteration occurs.
- **Database Concurrency & Check Constraints**:
  - Inventory rows are locked using `SELECT ... FOR UPDATE` ordered by `product_id ASC`.
  - Database check constraints enforce: `physical_quantity >= 0`, `reserved_quantity >= 0`, `damaged_quantity >= 0`, and `physical_quantity >= reserved_quantity`.

---

## 8. Quotation Calculation

Quotation calculations are performed authoritatively on the backend using standard commercial INR (`₹`) Half-Up rounding:
$$\text{roundHalfUp}(n) = \frac{\text{Math.round}((n + \epsilon) \times 100)}{100}$$

### Line Item Calculations:
1. **Base Amount**: $\text{baseAmount} = \text{quantity} \times \text{unitPrice}$
2. **Discount Amount**: $\text{discountAmount} = \text{roundHalfUp}\left(\frac{\text{baseAmount} \times \text{discountPct}}{100}\right)$
3. **Net Amount**: $\text{netAmount} = \text{baseAmount} - \text{discountAmount}$
4. **GST Tax Amount**: $\text{gstAmount} = \text{roundHalfUp}\left(\frac{\text{netAmount} \times \text{gstPct}}{100}\right)$
5. **Line Total Amount**: $\text{lineAmount} = \text{netAmount} + \text{gstAmount}$

### Grand Totals:
- $\text{subtotal} = \sum \text{baseAmount}$
- $\text{totalDiscount} = \sum \text{discountAmount}$
- $\text{totalGst} = \sum \text{gstAmount}$
- $\text{grandTotal} = \sum \text{lineAmount}$

**Tamper Protection**: The backend does not blindly trust client-supplied totals. If a client transmits `clientGrandTotal` and it disagrees with the backend calculation by more than ₹0.05, the request is rejected with `400 Bad Request`.

---

## 9. API

| Method | Endpoint | Purpose | Required Role |
|---|---|---|:---:|
| **POST** | `/api/auth/login` | Sign in with email/password and receive JWT token | Public |
| **GET** | `/api/auth/me` | Retrieve authenticated user profile | Authenticated |
| **GET** | `/api/customers` | List all registered client companies | Authenticated |
| **GET** | `/api/customers/:id` | Get customer details by ID | Authenticated |
| **POST** | `/api/customers` | Register a new client company (supports `Idempotency-Key`) | Authenticated |
| **GET** | `/api/products` | List catalog products with live stock indicators | Authenticated |
| **GET** | `/api/products/:id` | Get single product SKU details | Authenticated |
| **GET** | `/api/inventory` | List complete stock balance register matrix | Authenticated |
| **GET** | `/api/enquiries` | List customer enquiries with status and line items | Authenticated |
| **GET** | `/api/enquiries/:id` | Get enquiry details with linked quotations | Authenticated |
| **POST** | `/api/enquiries` | Create multi-product enquiry (supports `Idempotency-Key`) | Authenticated |
| **PATCH**| `/api/enquiries/:id/status` | Update enquiry status (`NEW`, `QUOTED`, `WON`, `LOST`) | Authenticated |
| **GET** | `/api/quotations` | List quotations with financial totals | Authenticated |
| **GET** | `/api/quotations/:id` | Get quotation details with line pricing breakdown | Authenticated |
| **POST** | `/api/quotations` | Issue quotation with server-side math (supports `Idempotency-Key`) | Authenticated |
| **PATCH**| `/api/quotations/:id/status` | Accept or reject quotation (`ACCEPTED`, `REJECTED`) | Authenticated |
| **POST** | `/api/quotations/:id/convert` | Convert `ACCEPTED` quotation to `PENDING` Sales Order (1:1) | Authenticated |
| **GET** | `/api/sales-orders` | List sales orders with stock check indicators | Authenticated |
| **GET** | `/api/sales-orders/:id` | Get sales order details with items and dispatch info | Authenticated |
| **POST** | `/api/sales-orders/:id/confirm` | Concurrency-safe order confirmation & stock reservation | **ADMIN** |
| **POST** | `/api/sales-orders/:id/cancel` | Cancel order and release reserved stock to available pool | **ADMIN** |
| **GET** | `/api/dispatches` | List fulfilled shipment records | Authenticated |
| **GET** | `/api/dispatches/:id` | Get dispatch details by ID | Authenticated |
| **POST** | `/api/dispatches` | Execute complete order dispatch & deduct physical inventory | **ADMIN** |
| **GET** | `/api/health` | Public service health check | Public |
| **GET** | `/api/idempotency/stats` | View idempotency key metrics | **ADMIN** |
| **POST** | `/api/idempotency/cleanup` | Purge expired idempotency keys | **ADMIN** |

- Full API Specification: [`docs/api/API-Documentation.md`](docs/api/API-Documentation.md).
- Postman Collection: [`docs/postman/Fundsroom-ERP.postman_collection.json`](docs/postman/Fundsroom-ERP.postman_collection.json).

---

## 10. Authentication & Security

- **JWT Authentication**: Stateless authentication utilizing standard JSON Web Tokens signed with `HS256` and 24-hour expiration.
- **Bearer Token Handling**: Sent via `Authorization: Bearer <token>` and parsed by centralized auth middleware.
- **Password Hashing**: Stored using `bcryptjs` one-way hashing with 10 salt rounds.
- **Protected Routes**: Unauthenticated requests to private endpoints are rejected with `401 Unauthorized`.
- **Backend RBAC Enforcement**: Role authorization (`authorize(UserRole.ADMIN)`) is enforced at the controller level; unauthorized attempts yield `403 Forbidden`.
- **Input Validation**: Incoming request bodies and query parameters are strictly validated using Zod schemas before reaching business logic.
- **SQL Injection Defense**: Prisma ORM parameterized queries prevent SQL injection across all database interactions.
- **Error Sanitization**: Centralized error middleware ensures no raw database errors, stack traces, or credentials escape to clients.
- **Environment Isolation**: Sensitive configuration (database URL, JWT secret) is managed via environment variables with `.env` ignored in Git.

---

## 11. Project Structure

```text
fundsroom-erp-pern/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Automated CI workflow (Postgres 17 + Node 20)
│       └── cd.yml                 # Build validation workflow
├── backend/
│   ├── prisma/
│   │   ├── migrations/            # 4 SQL migrations
│   │   ├── schema.prisma          # PostgreSQL schema (12 domain + 2 infra tables)
│   │   └── seed.ts                # Database seeder (users, products, stock)
│   ├── src/
│   │   ├── config/                # Environment variables and Prisma client
│   │   ├── middlewares/           # Auth, RBAC, Validation, and Error middlewares
│   │   ├── modules/               # Domain modules:
│   │   │   ├── auth/              # Authentication & user profile
│   │   │   ├── customers/         # Customer directory
│   │   │   ├── dispatches/        # Dispatch fulfillment
│   │   │   ├── enquiries/         # Customer inquiries
│   │   │   ├── idempotency/       # Idempotency stats & cleanup
│   │   │   ├── inventory/         # Stock balance register
│   │   │   ├── products/          # Catalog master
│   │   │   ├── quotations/        # Quotations & calculations
│   │   │   └── sales-orders/      # Orders, reservation & cancellation
│   │   ├── utils/                 # Financial calculator, errors, sequence generator
│   │   ├── app.ts                 # Express application factory
│   │   └── server.ts              # HTTP server entry point
│   ├── tests/
│   │   ├── helpers.ts             # Test authentication tokens and fixtures
│   │   └── integration/           # 19 integration test suites (170 tests)
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/            # Header, Sidebar, Modal, KPI Cards
│   │   ├── pages/                 # Customers, Enquiries, Quotes, Orders, Dispatches
│   │   ├── services/              # Axios API client with auth interceptor
│   │   ├── types/                 # TypeScript domain interfaces
│   │   ├── App.tsx                # Main application component & tab router
│   │   └── index.css              # Corporate design system & CSS variables
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── docs/
│   ├── api/
│   │   └── API-Documentation.md   # Complete REST API reference
│   ├── database/
│   │   └── ER-Diagram.md          # PostgreSQL ER diagram & table specifications
│   └── postman/
│       └── Fundsroom-ERP.postman_collection.json # Exportable Postman collection
├── .gitignore
├── fundsroom_erp_postman_collection.json
└── README.md
```

---

## 12. Setup & Installation

### Prerequisites
- **Node.js**: v20 LTS or higher
- **PostgreSQL**: Version 16 or 17 running locally or via Docker
- **npm**: Version 9 or higher
- **Git**: Installed

### Step 1: Clone Repository
```bash
git clone https://github.com/GoondlaBalaji/fundsroom-erp-pern.git
cd fundsroom-erp-pern
```

### Step 2: Configure Environment Variables

#### Backend Environment:
```bash
cp backend/.env.example backend/.env
```
Edit `backend/.env` with your PostgreSQL database credentials:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/fundsroom_erp?schema=public"
JWT_SECRET="your_secure_random_jwt_secret_key"
PORT=5000
NODE_ENV="development"
FRONTEND_URL="http://localhost:5173"
IDEMPOTENCY_TTL_HOURS=24
```

#### Frontend Environment:
```bash
cp frontend/.env.example frontend/.env
```
Ensure `frontend/.env` contains:
```env
VITE_API_URL="/api"
```

---

## 13. Database Migration & Seed

Run the setup commands in the `backend` directory in this exact order:

```bash
cd backend
npm install

# 1. Generate Prisma Client
npx prisma generate

# 2. Deploy database migrations to PostgreSQL
npx prisma migrate deploy

# 3. Seed demo master data (users, catalog products, initial inventory)
npm run db:seed
```

---

## 14. Running the Application

The application requires running the backend and frontend in separate terminal windows:

### Terminal 1 — Backend Development Server:
```bash
cd backend
npm run dev
# Server running at: http://localhost:5000
```

### Terminal 2 — Frontend Development Server:
```bash
cd frontend
npm install
npm run dev
# Frontend running at: http://localhost:5173
```

Visit **`http://localhost:5173`** in your browser to interact with the application.

---

## 15. Test Credentials

The database seeder configures two test accounts:

| Role | Email | Password | Intended Workflow Permissions |
|---|---|---|---|
| **Admin** | `admin@fundsroom.com` | `AdminPassword@123` | Full access: View all, Confirm Orders, Reserve Stock, Cancel Orders, Dispatch |
| **Sales User** | `sales@fundsroom.com` | `SalesPassword@123` | Commercial access: Customers, Enquiries, Quotations, Convert Quotes to Orders |

*Tip: The frontend features a one-click demo credential switcher in the top navigation bar for seamless evaluation.*

---

## 16. Testing

The backend includes a comprehensive, 100% automated integration test suite running against real PostgreSQL database transactions:

```bash
cd backend
npm test
```

### Verified Test Results:
```text
Test Suites: 19 passed, 19 total
Tests:       170 passed, 170 total
Snapshots:   0 total
Time:        17.845 s
Ran all test suites.
```

### Automated Coverage Summary:
- **Quotation Calculations & Tamper Protection** ([`quotation-calculation.test.ts`](backend/tests/integration/quotation-calculation.test.ts)): Validates line amounts, discounts, GST, and grand total; rejects tampered client totals.
- **Quotation Status Restrictions** ([`quotation-conversion.test.ts`](backend/tests/integration/quotation-conversion.test.ts)): Blocks conversion of `DRAFT` or `REJECTED` quotes; converts only `ACCEPTED` quotes.
- **Duplicate Sales Order Prevention** ([`duplicate-order.test.ts`](backend/tests/integration/duplicate-order.test.ts)): Enforces strict 1:1 conversion; rejects re-conversion attempts with `409 Conflict`.
- **Inventory Reservation Limits** ([`inventory-reservation.test.ts`](backend/tests/integration/inventory-reservation.test.ts)): Blocks confirmation when requested quantity exceeds available stock; verifies physical quantity is unchanged while reserved increases.
- **Concurrent Reservation Safety** ([`concurrency-reservation.test.ts`](backend/tests/integration/concurrency-reservation.test.ts)): Validates simultaneous competing orders; exactly one order succeeds and one is rejected without negative stock.
- **Same-Order Concurrent Confirmation** ([`same-order-concurrency.test.ts`](backend/tests/integration/same-order-concurrency.test.ts)): Prevents double-confirmation on the same order when confirmed simultaneously.
- **RBAC Authorization Enforcement** ([`rbac-authorization.test.ts`](backend/tests/integration/rbac-authorization.test.ts)): Blocks `SALES_USER` from confirming orders or dispatching (`403 Forbidden`); rejects unauthenticated requests (`401 Unauthorized`).
- **Authentication Workflow** ([`auth-workflow.test.ts`](backend/tests/integration/auth-workflow.test.ts)): Validates credentials, rejects bad passwords, verifies JWT profile retrieval.
- **Dispatch Fulfillment** ([`dispatch-workflow.test.ts`](backend/tests/integration/dispatch-workflow.test.ts)): Verifies atomic deduction of both physical and reserved stock; rejects duplicate dispatches.
- **Cancellation & Stock Release** ([`order-cancellation.test.ts`](backend/tests/integration/order-cancellation.test.ts)): Releases reserved inventory on cancellation of confirmed orders; blocks cancellation of dispatched orders.
- **Business Edge-Case Input Hardening** ([`final-input-edge-case-hardening.test.ts`](backend/tests/integration/final-input-edge-case-hardening.test.ts)): Whitespace-only string rejection, Indian mobile format validation, past delivery date rejection, unclamped negative inventory math.
- **PostgreSQL Idempotency** ([`idempotency-foundation.test.ts`](backend/tests/integration/idempotency-foundation.test.ts), [`customer-idempotency.test.ts`](backend/tests/integration/customer-idempotency.test.ts), [`enquiry-idempotency.test.ts`](backend/tests/integration/enquiry-idempotency.test.ts), [`quotation-idempotency.test.ts`](backend/tests/integration/quotation-idempotency.test.ts), [`phase-2b5-concurrency-failure.test.ts`](backend/tests/integration/phase-2b5-concurrency-failure.test.ts), [`phase-2b6-operational-hardening.test.ts`](backend/tests/integration/phase-2b6-operational-hardening.test.ts)): Verifies SHA-256 canonical payload hashing, response replay without duplication, 10 concurrent requests creating 1 entity, and TTL cleanup.

---

## 17. API Documentation

Detailed REST API documentation and exportable Postman collections are included:
- **API Documentation Markdown**: [`docs/api/API-Documentation.md`](docs/api/API-Documentation.md)
- **Postman Collection JSON**: [`docs/postman/Fundsroom-ERP.postman_collection.json`](docs/postman/Fundsroom-ERP.postman_collection.json)

### Importing and Running in Postman:
1. Open Postman → Click **Import** → Choose [`docs/postman/Fundsroom-ERP.postman_collection.json`](docs/postman/Fundsroom-ERP.postman_collection.json).
2. The collection variables (`baseUrl`, `jwtToken`, `adminToken`, `salesToken`) are pre-configured.
3. Run **1. Authentication → Login as Admin** or **Login as Sales User**.
4. The test script automatically saves the returned JWT to `{{jwtToken}}`.
5. Execute requests sequentially across Customers, Enquiries, Quotations, Orders, and Dispatches.

---

## 18. Database ER Diagram

The database schema and relational design are documented in:
- **Entity-Relationship Diagram**: [`docs/database/ER-Diagram.md`](docs/database/ER-Diagram.md)

This document contains a complete Mermaid ER diagram and table specifications reflecting the active PostgreSQL schema in `backend/prisma/schema.prisma`.

---

## 19. Demo Video

> **Demo Video**: [Demo video link will be added before final submission.]

### Recommended 5-Minute Demonstration Sequence:
1. **0:00 - 0:45 | Login as SALES_USER & Commercial Intake**:
   - Sign in as `sales@fundsroom.com`.
   - Open **Customers** → Add client (*Apex Heavy Industries Ltd*).
   - Open **Enquiries** → Create multi-product inquiry for 10 Valves and 5 Pumps.
2. **0:45 - 1:45 | Quotation & Sales Order Conversion**:
   - Open **Quotations** → New Quotation against the inquiry.
   - Enter 5% discount and 18% GST → show authoritative server-calculated INR totals.
   - Click **Submit** → Click **Mark ACCEPTED**.
   - Click **Convert to Sales Order** → show parent enquiry marked `WON` and Sales Order created.
3. **1:45 - 2:45 | Admin Order Confirmation & Inventory Reservation**:
   - Switch role to `admin@fundsroom.com` using the demo switcher in top bar.
   - Open **Sales Orders** → View real-time inventory availability check.
   - Click **Confirm & Reserve Stock** → Show that `reserved_quantity` increases in inventory while `physical_quantity` is untouched.
4. **2:45 - 3:45 | Dispatch Fulfillment & Stock Deduction**:
   - Open **Dispatches** → Click **Process Dispatch**.
   - Input vehicle registration (`MH-12-TX-9999`) and driver name (*Suresh Patil*).
   - Confirm dispatch → Show both `physical_quantity` and `reserved_quantity` decremented atomically. Order status is now terminal `DISPATCHED`.
5. **3:45 - 4:30 | Cancellation & Stock Release**:
   - Create a second order, confirm it, then click **Cancel Order**.
   - Show that reserved stock is immediately released back to the available pool.
6. **4:30 - 5:00 | Automated Test Suite Validation**:
   - Run `npm test` in the backend terminal window to demonstrate all 19 test suites and 170 tests passing with 0 failures.

---

## 20. Case Study Compliance

| Evaluation Requirement | Status | Evidence in Codebase |
|---|:---:|---|
| **PERN Stack** | **PASS** | PostgreSQL 17, Express 4, React 18, Node.js 20 LTS, Prisma ORM 5 |
| **JWT Authentication** | **PASS** | `POST /api/auth/login`, stateless JWT bearer tokens with 24h expiry |
| **Password Hashing** | **PASS** | `bcryptjs` with 10 salt rounds in database seed and auth controller |
| **Backend RBAC** | **PASS** | `authorize(UserRole.ADMIN)` middleware on confirm, cancel, dispatch endpoints |
| **Customer Enquiry** | **PASS** | `POST /api/enquiries` with atomic numbering `ENQ-YYYYMMDD-XXXX` |
| **Multiple Enquiry Products** | **PASS** | Relational `enquiry_items` table linked to products with quantity validation |
| **Product Master** | **PASS** | Catalog SKUs with unique code, unit, base price, and 1:1 inventory relation |
| **Inventory Register** | **PASS** | `available = physical - reserved - damaged` with database check constraints |
| **Quotation Management** | **PASS** | `POST /api/quotations` with DRAFT, SENT, ACCEPTED, REJECTED lifecycle |
| **Backend Calculation** | **PASS** | Authoritative Half-Up INR rounding; client total discrepancy > ₹0.05 rejected |
| **Sales Order Conversion** | **PASS** | `POST /api/quotations/:id/convert` restricted to `ACCEPTED` status; marks enquiry `WON` |
| **Duplicate Order Protection** | **PASS** | `@unique` constraint on `sales_orders.quotation_id` strictly blocks duplicate conversion |
| **Inventory Reservation** | **PASS** | Confirmed orders increment `reserved_quantity`; physical stock stays untouched |
| **Concurrency Protection** | **PASS** | `SELECT ... FOR UPDATE` with `ORDER BY product_id ASC` in `order.service.ts` |
| **Dispatch Fulfillment** | **PASS** | 1:1 dispatch decrements physical and reserved stock; sets terminal `DISPATCHED` |
| **PostgreSQL Relational Design** | **PASS** | 12 domain tables with foreign keys and check constraints; zero JSON workflow blobs |
| **REST APIs** | **PASS** | Standard HTTP methods (`GET`, `POST`, `PATCH`), consistent response envelope |
| **Automated Tests** | **PASS** | 19 integration test suites, 170 tests passing (0 failures) |
| **Professional README** | **PASS** | Comprehensive setup, architecture, workflow, credentials, and demo script |
| **Database ER Diagram** | **PASS** | Standalone [`docs/database/ER-Diagram.md`](docs/database/ER-Diagram.md) matching Prisma schema |
| **API Documentation** | **PASS** | Markdown API reference and exportable Postman collection in `docs/` |
| **Demo Readiness** | **PASS** | Seed demo accounts, UI credential switcher, and 5-minute video walkthrough script |

---

## 21. AI Usage

AI tools were used as development assistance for implementation, debugging, documentation, and testing. The final architecture, business rules, database design, API behavior, and implementation were reviewed and validated as part of the development process.
