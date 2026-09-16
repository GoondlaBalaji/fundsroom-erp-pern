# Fundsroom ERP — PERN Full-Stack Technical Case Study

> A production-grade PERN full-stack Enterprise Resource Planning (ERP) platform implementing an end-to-end industrial manufacturing & supply chain workflow:
> **Customer Enquiry → Quotation → Sales Order → Concurrency-Safe Inventory Reservation → Complete Dispatch**.

---

## 1. Project Overview

Fundsroom ERP is built to demonstrate enterprise-grade engineering principles: relational database normalization, deterministic concurrency control via PostgreSQL row-level locking, role-based access control (RBAC), authoritative backend financial calculations, and responsive full-stack interfaces.

### Primary Domain Workflow:
```text
Customer Enquiry
       ↓
Sales Quotation (Authoritative INR Half-Up Pricing)
       ↓
Quotation Acceptance (Gate for Order Conversion)
       ↓
Sales Order Creation (Atomic 1:1 Link, Enquiry Marked WON)
       ↓
Admin Order Confirmation & Deterministic Inventory Reservation (FOR UPDATE locks)
       ↓
Single Complete Dispatch (1:1 Fulfillment, Decrements Physical & Reserved Quantities)
```

---

## 2. Core Modules

1. **Executive Dashboard**: KPI stat cards, operational funnel tracker, real-time inventory alerts, and recent sales order activity.
2. **Customer Master Directory**: Enterprise client registry with searchable contact details and relational activity counts.
3. **Product Catalog**: Sellable inventory SKUs with category filters, unit specifications, base pricing, and real-time inventory pills.
4. **Inventory Control Matrix**: Authoritative stock balance register enforcing the formula: `available = physical_quantity - reserved_quantity - damaged_quantity`.
5. **Customer Enquiries**: Multi-product requirement intake and specification tracking.
6. **Sales Quotations**: Quotation builder with margin/discount/GST calculation, client total validation, and conversion gating.
7. **Sales Orders**: Lifecycle management with live stock availability indicators, Admin-only confirmation/reservation, and cancellation with inventory release.
8. **Dispatch Register**: Order fulfillment tracker with vehicle/driver assignment and atomic inventory deduction.
9. **Authentication & RBAC**: JWT session management with role-based feature gating (`ADMIN` vs `SALES_USER`).

---

## 3. System Architecture

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
│  - Modular Route Architecture (8 domain modules)                        │
│  - Zod Request Schema Validation Middlewares                            │
│  - JWT Authentication & Strict RBAC Authorization Middlewares           │
│  - Centralized Sanitized Error Handling (AppError & Prisma code mappers)│
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Prisma ORM 5
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     PostgreSQL 17 Database                              │
│  - 12 Normalized Relational Business Tables                             │
│  - Pessimistic Row-Level Locking (SELECT ... FOR UPDATE)                │
│  - Deterministic Product ID Ascending Lock Ordering (Deadlock Safety)   │
│  - ACID Transactions for Quotation Conversion, Reservation & Dispatch   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript 5, Vite 5, Axios, Lucide React, Vanilla CSS3 tokens |
| **Backend** | Node.js (v20 LTS), Express 4, TypeScript 5, Zod 3, bcryptjs, jsonwebtoken, Helmet, CORS |
| **Database & ORM** | PostgreSQL 17, Prisma ORM 5 |
| **Testing** | Jest 29, ts-jest, Supertest |
| **CI/CD** | GitHub Actions (Ubuntu, Node.js 20, PostgreSQL 17 service container) |

---

## 5. Database Design (12 Business Tables)

The database schema adheres strictly to the approved 12-table domain model:

1. **`users`**: System accounts with bcrypt password hashes and roles (`ADMIN`, `SALES_USER`).
2. **`customers`**: Client companies, primary contacts, phone, email, and city.
3. **`products`**: Sellable catalog SKUs (`code` unique, `name`, `category`, `unit`, `base_price`).
4. **`inventories`**: Stock balances per product (`product_id` unique, `physical_quantity`, `reserved_quantity`, `damaged_quantity`).
5. **`enquiries`**: Inbound customer requests (`enquiry_number` unique, `status`: `NEW`, `QUOTED`, `WON`, `LOST`).
6. **`enquiry_items`**: Line items per enquiry (`product_id`, `quantity`).
7. **`quotations`**: Authoritative pricing records (`quotation_number` unique, `subtotal`, `total_discount`, `total_gst`, `grand_total`, `status`: `DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`).
8. **`quotation_items`**: Line item financials (`unit_price`, `discount_pct`, `gst_pct`, `base_amount`, `discount_amount`, `net_amount`, `gst_amount`, `line_amount`).
9. **`sales_orders`**: Converted orders (`order_number` unique, `quotation_id` unique [1:1 constraint], `status`: `PENDING`, `CONFIRMED`, `DISPATCHED`, `CANCELLED`).
10. **`sales_order_items`**: Ordered quantities and line valuations.
11. **`dispatches`**: Fulfilled shipments (`dispatch_number` unique, `sales_order_id` unique [1:1 constraint], `vehicle_number`, `driver_name`, `dispatched_by_id`).
12. **`dispatch_items`**: Actual physical products and quantities dispatched.

---

## 6. Authoritative Business Rules

### 6.1 Inventory Availability Formula
Stock availability is authoritatively determined by:
$$\text{Available Quantity} = \text{Physical Quantity} - \text{Reserved Quantity} - \text{Damaged Quantity}$$
- `physical_quantity`: Units physically located in the warehouse.
- `reserved_quantity`: Units committed to confirmed sales orders awaiting fulfillment.
- `damaged_quantity`: Quarantined / unsellable units.

### 6.2 Sales Order State Machine
```text
PENDING ────► CONFIRMED ────► DISPATCHED (Terminal)
   │               │
   ▼               ▼
CANCELLED      CANCELLED
(Terminal)     (Terminal, Releases Reserved Stock)
```
- **PENDING Cancellation**: No inventory was committed; status transitions to `CANCELLED` without stock alterations.
- **CONFIRMED Cancellation**: Releases committed inventory by atomically decrementing `reserved_quantity` under row-level locks.
- **DISPATCHED**: Terminal state. Cancellation is strictly rejected with HTTP 400.
- **CANCELLED**: Terminal state. Further transitions are rejected with HTTP 409.

### 6.3 Concurrency & Pessimistic Row-Level Locking
To eliminate race conditions, double reservations, and deadlocks under simultaneous requests:
1. **Sales Order Lock**: The sales order row is locked using `SELECT id, status, order_number FROM sales_orders WHERE id = $1 FOR UPDATE` prior to checking its status.
2. **Deterministic Inventory Locking**: Product inventory rows are sorted in ascending order by `product_id` and locked via `SELECT ... FROM inventories WHERE product_id = ANY(...) ORDER BY product_id ASC FOR UPDATE`.
3. **Availability Verification**: If any line item lacks sufficient available stock, the entire transaction rolls back cleanly with HTTP 409 Conflict.
4. **Atomic Reservation**: Reserved stock is incremented and status is updated to `CONFIRMED` in a single ACID transaction.

### 6.4 Monetary Precision & Calculation Rules
- **Currency**: INR (₹)
- **Precision**: 2 decimal places with HALF-UP rounding: `Math.round((num + Number.EPSILON) * 100) / 100`.
- **Backend Authority**: Backend recalculates all line and grand totals. The top-level `clientGrandTotal` is strictly verified against backend computations to prevent tampering.

### 6.5 Quotation-to-Order Conversion Gating
- Conversion to Sales Order is permitted **only** when the quotation is in `ACCEPTED` status.
- Atomically marks the originating enquiry as `WON`.
- Enforces 1:1 uniqueness via `@unique` on `sales_orders.quotation_id` to block duplicate conversions.

### 6.6 Dispatch Fulfillment
- Exactly **one complete dispatch** per sales order (`dispatches.sales_order_id` is unique).
- Partial dispatches are prohibited.
- Atomically decrements both `physical_quantity` and `reserved_quantity`.

---

## 7. Role-Based Access Control (RBAC)

| Capability / Action | `ADMIN` | `SALES_USER` |
|---|:---:|:---:|
| View Dashboard, Catalog & Inventory | ✅ | ✅ |
| Create Customers & Enquiries | ✅ | ✅ |
| Generate & Transition Quotations | ✅ | ✅ |
| Convert ACCEPTED Quotation to Sales Order | ✅ | ✅ |
| View Sales Orders & Dispatches | ✅ | ✅ |
| **Confirm Sales Order & Reserve Inventory** | ✅ | ❌ *(HTTP 403)* |
| **Cancel Sales Order (Release Stock)** | ✅ | ❌ *(HTTP 403)* |
| **Execute Order Dispatch** | ✅ | ❌ *(HTTP 403)* |

*Forbidden attempts by `SALES_USER` return standard HTTP 403 messages beginning with `Access denied: User role SALES_USER...`.*

---

## 8. Local Setup & Execution Guide

### Prerequisites
- Node.js 20 LTS or higher
- PostgreSQL 17 (or 16) running locally
- npm 9+

### 1. Clone & Configure Environment
```bash
git clone https://github.com/GoondlaBalaji/fundsroom-erp-pern.git
cd fundsroom-erp-pern

# Configure Backend environment
cp backend/.env.example backend/.env
# Edit backend/.env with your PostgreSQL credentials:
# DATABASE_URL="postgresql://postgres:password@localhost:5432/fundsroom_erp?schema=public"
# JWT_SECRET="your_secure_random_jwt_secret"
# PORT=5000

# Configure Frontend environment
cp frontend/.env.example frontend/.env
```

### 2. Backend Setup & Seeding
```bash
cd backend
npm install

# Push schema to PostgreSQL & generate Prisma client
npx prisma generate
npx prisma db push

# Seed master data (users, sample products, inventory, customers)
npm run db:seed
```

### 3. Run Backend Integration Tests
```bash
npm test
# Expected: 10/10 test suites passed, 28/28 tests passed
```

### 4. Start Development Servers
In terminal 1 (Backend):
```bash
cd backend
npm run dev
# Running on http://localhost:5000
```

In terminal 2 (Frontend):
```bash
cd frontend
npm install
npm run dev
# Running on http://localhost:5173
```

### 5. Build Frontend for Production
```bash
cd frontend
npm run build
# Compiles TypeScript and builds Vite bundle into frontend/dist
```

---

## 9. Environment Variables Reference

### Backend (`backend/.env`)
| Variable | Description | Default / Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection URI | `postgresql://postgres:pass@localhost:5432/fundsroom_erp?schema=public` |
| `JWT_SECRET` | Secret key for signing auth tokens | `super_secret_jwt_key_2026` |
| `PORT` | Express server port | `5000` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5173` |
| `NODE_ENV` | Environment mode | `development` / `production` / `test` |

### Frontend (`frontend/.env`)
| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | API base path | `/api` (proxied by Vite to port 5000) |

---

## 10. Demo Workflow & Evaluator Test Guide

For rapid demonstration, two pre-configured seed accounts are available:

| Role | Email | Password | Permissions |
|---|---|---|---|
| **Admin** | `admin@fundsroom.com` | `AdminPassword@123` | Full access (Confirmations, Cancellations, Dispatches) |
| **Sales User** | `sales@fundsroom.com` | `SalesPassword@123` | Commercial workflow (Customers, Enquiries, Quotations, Conversions) |

### End-to-End Walkthrough Scenario:
1. **Sign In**: Log in as `sales@fundsroom.com` (use the quick-fill button on the login screen).
2. **Create Customer**: Open **Customers** → click **Add Customer** → register a new client company.
3. **Log Enquiry**: Open **Enquiries** → click **Create Enquiry** → select client and 2 products (e.g. 10 units each).
4. **Issue Quotation**: Open **Quotations** → click **New Quotation** → choose the enquiry → observe live margin/tax calculation preview → submit.
5. **Accept & Convert**: In **Quotations**, open the quotation → click **Mark ACCEPTED** → click **Convert to Sales Order**. Observe that the enquiry automatically transitions to `WON` and a new Sales Order is created.
6. **Switch to Admin**: Click **Admin** on the demo role switcher in the sidebar.
7. **Confirm & Reserve Stock**: Open **Sales Orders** → view the pending order → observe live inventory checks → click **Confirm & Reserve**. Observe that inventory `reserved_quantity` increases.
8. **Complete Dispatch**: Open **Dispatches** → click **Process Dispatch** → select the confirmed order, enter vehicle and driver details → click **Confirm & Dispatch**. Observe that both `physical_quantity` and `reserved_quantity` decrement and the order transitions to `DISPATCHED`.
9. **Test Cancellation**: Create a second order, confirm it, and click **Cancel**. Observe that reserved stock is immediately released back into the sellable pool.

---

## 11. CI/CD Pipeline

The project includes an automated GitHub Actions CI/CD workflow defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) and [`.github/workflows/cd.yml`](.github/workflows/cd.yml):
- **Triggers**: On every `push` and `pull_request` to `main`, plus manual `workflow_dispatch`.
- **Database Isolation**: Spawns an isolated `postgres:17-alpine` service container.
- **Backend Job**: Generates Prisma Client, deploys schema with `prisma db push`, seeds test data, compiles TypeScript with `tsc`, and executes the complete 28-test Jest suite.
- **Frontend Job**: Installs dependencies with `npm ci` and runs the production build (`tsc && vite build`).
- **Deployment-Ready CD Job**: Builds production artifacts and validates configuration readiness.

---

## 12. Security Architecture

1. **Password Security**: Passwords hashed with `bcryptjs` (salt rounds: 10).
2. **Token Security**: Stateless JWTs signed with 24-hour expiration; Bearer tokens required on all protected endpoints.
3. **Parameter Tampering Protection**: Quotation calculations are computed authoritatively on the backend; client totals are validated against backend calculations.
4. **Data Sanitization & Headers**: Express protected by `helmet` security headers; Prisma prevents SQL injection through parameterized queries.
5. **Error Sanitization**: Centralized error middleware ensures no raw database errors, stack traces, or credentials escape to API clients.

---

## 13. Project Constraints & Assumptions

- **1:1 Complete Dispatch**: Each sales order is fulfilled through a single, complete dispatch. Split or partial dispatches are intentionally out of scope for this case study.
- **Terminal State Immobility**: Once an order reaches `DISPATCHED` or `CANCELLED`, no further state transitions or cancellations can be performed.
- **Fixed Roles**: RBAC strictly supports `ADMIN` and `SALES_USER`.
