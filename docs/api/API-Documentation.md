# Fundsroom ERP — REST API Documentation

> **Base URL**: `{{baseUrl}}` (Default: `http://localhost:5000/api`)  
> **Authentication**: Bearer Token (`Authorization: Bearer {{jwtToken}}`)  
> **Postman Collection**: [`docs/postman/Fundsroom-ERP.postman_collection.json`](../postman/Fundsroom-ERP.postman_collection.json)

---

## Overview

Fundsroom ERP exposes a RESTful API supporting an end-to-end industrial manufacturing and distribution workflow:
**Authentication → Customers → Multi-Product Enquiries → Quotations → Sales Orders → Inventory Reservation → Complete Dispatch**.

### Standard Response Envelope
All API responses follow a consistent JSON structure:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional human-readable confirmation message"
}
```

### Standard Error Response
```json
{
  "success": false,
  "error": {
    "message": "Descriptive error message",
    "details": null
  }
}
```

---

## 1. Authentication Endpoints

### 1.1 `POST /auth/login`
- **Purpose**: Authenticate user credentials and return a signed JWT token.
- **Auth Required**: No (Public)
- **Role Required**: Any
- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "email": "admin@fundsroom.com",
  "password": "AdminPassword@123"
}
```
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "{{jwtToken}}",
    "user": {
      "id": "u-uuid-001",
      "email": "admin@fundsroom.com",
      "fullName": "Vikram Mehta (Admin)",
      "role": "ADMIN"
    }
  }
}
```
- **Error Responses**:
  - `400 Bad Request`: Validation error (invalid email format, empty password).
  - `401 Unauthorized`: Invalid email or password.

---

### 1.2 `GET /auth/me`
- **Purpose**: Retrieve the profile of the currently authenticated user session.
- **Auth Required**: Yes (`Bearer {{jwtToken}}`)
- **Role Required**: Any authenticated role (`ADMIN`, `SALES_USER`)
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "u-uuid-001",
    "email": "admin@fundsroom.com",
    "fullName": "Vikram Mehta (Admin)",
    "role": "ADMIN"
  }
}
```
- **Error Responses**:
  - `401 Unauthorized`: Missing, expired, or invalid JWT token.

---

## 2. Products & Inventory Endpoints

### 2.1 `GET /products`
- **Purpose**: Retrieve all sellable catalog products with current stock indicators.
- **Auth Required**: Yes
- **Role Required**: Any
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "p-uuid-001",
      "code": "IND-VLV-001",
      "name": "High-Pressure Ball Valve 2 inch (SS 316)",
      "category": "Valves",
      "unit": "PCS",
      "basePrice": "4500.00",
      "inventory": {
        "physicalQuantity": 150,
        "reservedQuantity": 0,
        "damagedQuantity": 0,
        "availableQuantity": 150
      }
    }
  ]
}
```

---

### 2.2 `GET /products/:id`
- **Purpose**: Retrieve a single product by ID.
- **Auth Required**: Yes
- **Role Required**: Any
- **Success Response (200 OK)**: Single product object matching above schema.
- **Error Responses**:
  - `404 Not Found`: Product ID not found.

---

### 2.3 `GET /inventory`
- **Purpose**: Retrieve the complete stock balance matrix for all products.
- **Auth Required**: Yes
- **Role Required**: Any
- **Inventory Balance Formula**: `availableQuantity = physicalQuantity - reservedQuantity - damagedQuantity`
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "inv-uuid-001",
      "productId": "p-uuid-001",
      "physicalQuantity": 150,
      "reservedQuantity": 20,
      "damagedQuantity": 0,
      "availableQuantity": 130,
      "product": {
        "code": "IND-VLV-001",
        "name": "High-Pressure Ball Valve 2 inch (SS 316)"
      }
    }
  ]
}
```

---

## 3. Customer Endpoints

### 3.1 `GET /customers`
- **Purpose**: List all registered client companies.
- **Auth Required**: Yes
- **Role Required**: Any
- **Success Response (200 OK)**: Array of customer objects.

---

### 3.2 `GET /customers/:id`
- **Purpose**: Retrieve customer details by ID, including activity history.
- **Auth Required**: Yes
- **Role Required**: Any
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "c-uuid-001",
    "companyName": "Larsen Heavy Engineering Ltd",
    "contactPerson": "Karan Saxena",
    "mobile": "+91 9876500112",
    "email": "ksaxena@larsenheavy.com",
    "city": "Chennai",
    "createdAt": "2026-09-17T02:17:39.076Z"
  }
}
```

---

### 3.3 `POST /customers`
- **Purpose**: Register a new client organization.
- **Auth Required**: Yes
- **Role Required**: Any (`ADMIN`, `SALES_USER`)
- **Optional Header**: `Idempotency-Key: <unique-client-key>`
- **Request Body**:
```json
{
  "companyName": "Larsen Heavy Engineering Ltd",
  "contactPerson": "Karan Saxena",
  "mobile": "+91 9876500112",
  "email": "ksaxena@larsenheavy.com",
  "city": "Chennai"
}
```
- **Success Response (201 Created)**:
```json
{
  "success": true,
  "message": "Customer created successfully",
  "data": {
    "id": "c-uuid-001",
    "companyName": "Larsen Heavy Engineering Ltd",
    "contactPerson": "Karan Saxena",
    "mobile": "+91 9876500112",
    "email": "ksaxena@larsenheavy.com",
    "city": "Chennai"
  }
}
```
- **Error Responses**:
  - `400 Bad Request`: Empty/whitespace strings, invalid phone number, malformed email.
  - `409 Conflict`: Reusing an `Idempotency-Key` with a different payload.

---

## 4. Enquiry Endpoints

### 4.1 `GET /enquiries`
- **Purpose**: List all customer enquiries with status, customer info, and line items.
- **Auth Required**: Yes
- **Role Required**: Any
- **Success Response (200 OK)**: Array of enquiry objects.

---

### 4.2 `GET /enquiries/:id`
- **Purpose**: Retrieve an enquiry by ID with customer, items, and linked quotations.
- **Auth Required**: Yes
- **Role Required**: Any

---

### 4.3 `POST /enquiries`
- **Purpose**: Create a new multi-product enquiry.
- **Auth Required**: Yes
- **Role Required**: Any (`ADMIN`, `SALES_USER`)
- **Optional Header**: `Idempotency-Key: <unique-client-key>`
- **Request Body**:
```json
{
  "customerId": "{{customerId}}",
  "requiredDate": "2026-10-15T00:00:00.000Z",
  "notes": "Urgent refinery plant expansion requirement",
  "items": [
    {
      "productId": "{{productId}}",
      "quantity": 15
    }
  ]
}
```
- **Success Response (201 Created)**:
```json
{
  "success": true,
  "message": "Enquiry created successfully",
  "data": {
    "id": "enq-uuid-001",
    "enquiryNumber": "ENQ-20260917-0001",
    "customerId": "{{customerId}}",
    "requiredDate": "2026-10-15T00:00:00.000Z",
    "status": "NEW",
    "notes": "Urgent refinery plant expansion requirement",
    "items": [
      {
        "id": "ei-uuid-001",
        "productId": "{{productId}}",
        "quantity": 15
      }
    ]
  }
}
```
- **Error Responses**:
  - `400 Bad Request`: `requiredDate` in the past, empty items array, non-positive quantity.
  - `404 Not Found`: Customer or Product ID does not exist.
  - `409 Conflict`: Idempotency key conflict with different payload.

---

### 4.4 `PATCH /enquiries/:id/status`
- **Purpose**: Manually update enquiry status (`NEW`, `QUOTED`, `WON`, `LOST`).
- **Auth Required**: Yes
- **Request Body**: `{ "status": "QUOTED" }`
- **Success Response (200 OK)**: Updated enquiry object.

---

## 5. Quotation Endpoints

### 5.1 `GET /quotations`
- **Purpose**: List all quotations with commercial valuations.
- **Auth Required**: Yes
- **Role Required**: Any

---

### 5.2 `GET /quotations/:id`
- **Purpose**: Retrieve quotation details with complete financial line item breakdown.
- **Auth Required**: Yes
- **Role Required**: Any

---

### 5.3 `POST /quotations`
- **Purpose**: Generate a quotation against an enquiry with authoritative server-side math.
- **Auth Required**: Yes
- **Role Required**: Any (`ADMIN`, `SALES_USER`)
- **Optional Header**: `Idempotency-Key: <unique-client-key>`
- **Authoritative Calculations**:
  - `baseAmount = quantity * unitPrice`
  - `discountAmount = roundHalfUp(baseAmount * discountPct / 100)`
  - `netAmount = baseAmount - discountAmount`
  - `gstAmount = roundHalfUp(netAmount * gstPct / 100)`
  - `lineAmount = netAmount + gstAmount`
  - `grandTotal = roundHalfUp(sum(lineAmounts))`
- **Request Body**:
```json
{
  "enquiryId": "{{enquiryId}}",
  "validUntil": "2026-10-30T00:00:00.000Z",
  "clientGrandTotal": 76995.00,
  "items": [
    {
      "productId": "{{productId}}",
      "quantity": 15,
      "unitPrice": 4500,
      "discountPct": 5,
      "gstPct": 18
    }
  ]
}
```
- **Success Response (201 Created)**:
```json
{
  "success": true,
  "message": "Quotation created successfully",
  "data": {
    "id": "qtn-uuid-001",
    "quotationNumber": "QTN-20260917-0001",
    "enquiryId": "{{enquiryId}}",
    "customerId": "{{customerId}}",
    "validUntil": "2026-10-30T00:00:00.000Z",
    "subtotal": "67500.00",
    "totalDiscount": "3375.00",
    "totalGst": "11542.50",
    "grandTotal": "75667.50",
    "status": "DRAFT",
    "items": [ ... ]
  }
}
```
- **Error Responses**:
  - `400 Bad Request`: Discrepancy between clientGrandTotal and authoritative backend calculation (> ₹0.05), or enquiry is already `WON`/`LOST`.
  - `404 Not Found`: Enquiry ID not found.

---

### 5.4 `PATCH /quotations/:id/status`
- **Purpose**: Transition quotation status (`DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`).
- **Auth Required**: Yes
- **Role Required**: Any
- **Request Body**: `{ "status": "ACCEPTED" }`
- **Success Response (200 OK)**: Updated quotation object.

---

### 5.5 `POST /quotations/:id/convert`
- **Purpose**: Convert an `ACCEPTED` quotation to a `PENDING` Sales Order.
- **Auth Required**: Yes
- **Role Required**: Any (`ADMIN`, `SALES_USER`)
- **Workflow Action**:
  - Requires quotation status to be `ACCEPTED`.
  - Enforces 1:1 conversion (`quotationId` unique on `sales_orders`).
  - Atomically marks the parent enquiry as `WON`.
- **Success Response (201 Created)**:
```json
{
  "success": true,
  "message": "Quotation successfully converted to Sales Order",
  "data": {
    "id": "so-uuid-001",
    "orderNumber": "SO-20260917-0001",
    "quotationId": "{{quotationId}}",
    "customerId": "{{customerId}}",
    "orderDate": "2026-09-17T07:18:41.033Z",
    "totalAmount": "75667.50",
    "status": "PENDING"
  }
}
```
- **Error Responses**:
  - `400 Bad Request`: Quotation is not in `ACCEPTED` status (e.g. `DRAFT` or `REJECTED`).
  - `409 Conflict`: Quotation has already been converted to a Sales Order.

---

## 6. Sales Order Endpoints

### 6.1 `GET /sales-orders`
- **Purpose**: List all Sales Orders with live stock availability verification.
- **Auth Required**: Yes
- **Role Required**: Any

---

### 6.2 `GET /sales-orders/:id`
- **Purpose**: Retrieve single order details including line items, stock checks, and dispatch status.
- **Auth Required**: Yes
- **Role Required**: Any

---

### 6.3 `POST /sales-orders/:id/confirm`
- **Purpose**: Admin confirmation and deterministic inventory reservation.
- **Auth Required**: Yes
- **Role Required**: `ADMIN` ONLY
- **Concurrency & Transaction Safety**:
  - Acquires row-level lock on the sales order (`SELECT ... FOR UPDATE`).
  - Acquires deterministic ascending row locks on all inventory rows (`ORDER BY product_id ASC FOR UPDATE`).
  - Verifies `available >= quantity` for all items.
  - Atomically increments `reservedQuantity`; `physicalQuantity` remains untouched.
  - Updates order status to `CONFIRMED`.
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Sales Order confirmed and inventory successfully reserved",
  "data": {
    "id": "{{salesOrderId}}",
    "orderNumber": "SO-20260917-0001",
    "status": "CONFIRMED",
    "confirmedAt": "2026-09-17T07:25:00.000Z"
  }
}
```
- **Error Responses**:
  - `403 Forbidden`: Caller does not have `ADMIN` role (`SALES_USER` rejected).
  - `409 Conflict`: Insufficient available stock or order is already `CONFIRMED`.
  - `400 Bad Request`: Order is `DISPATCHED` or `CANCELLED`.

---

### 6.4 `POST /sales-orders/:id/cancel`
- **Purpose**: Cancel a Sales Order.
- **Auth Required**: Yes
- **Role Required**: `ADMIN` ONLY
- **Inventory Behavior**:
  - If status was `CONFIRMED`: Atomically releases reserved stock back to available pool (`reservedQuantity` decremented).
  - If status was `PENDING`: Marks `CANCELLED` without stock change.
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Sales Order cancelled successfully and reserved inventory released",
  "data": {
    "id": "{{salesOrderId}}",
    "status": "CANCELLED"
  }
}
```
- **Error Responses**:
  - `400 Bad Request`: Order is in terminal `DISPATCHED` state.
  - `409 Conflict`: Order is already `CANCELLED`.

---

## 7. Dispatch Endpoints

### 7.1 `GET /dispatches`
- **Purpose**: List all dispatches with shipment logistics and item details.
- **Auth Required**: Yes
- **Role Required**: Any

---

### 7.2 `GET /dispatches/:id`
- **Purpose**: Retrieve a single dispatch record by ID.
- **Auth Required**: Yes
- **Role Required**: Any

---

### 7.3 `POST /dispatches`
- **Purpose**: Process complete order fulfillment and dispatch.
- **Auth Required**: Yes
- **Role Required**: `ADMIN` ONLY
- **Fulfillment Rules**:
  - Sales Order must be in `CONFIRMED` status.
  - Exactly one complete dispatch per order (1:1 constraint via `@unique` on `salesOrderId`).
  - Atomically decrements both `physicalQuantity` and `reservedQuantity`.
  - Sets order status to terminal `DISPATCHED`.
- **Request Body**:
```json
{
  "salesOrderId": "{{salesOrderId}}",
  "vehicleNumber": "MH-12-TX-9999",
  "driverName": "Suresh Patil"
}
```
- **Success Response (201 Created)**:
```json
{
  "success": true,
  "message": "Dispatch completed and inventory deducted successfully",
  "data": {
    "id": "dsp-uuid-001",
    "dispatchNumber": "DSP-20260917-0001",
    "salesOrderId": "{{salesOrderId}}",
    "vehicleNumber": "MH-12-TX-9999",
    "driverName": "Suresh Patil",
    "dispatchDate": "2026-09-17T07:30:00.000Z"
  }
}
```
- **Error Responses**:
  - `400 Bad Request`: Order is not `CONFIRMED` (e.g. `PENDING` or `CANCELLED`).
  - `409 Conflict`: Order has already been dispatched.
  - `403 Forbidden`: `SALES_USER` attempted dispatch.

---

## 8. Operational & Health Endpoints

### 8.1 `GET /health`
- **Purpose**: Public system health check.
- **Auth Required**: No (Public)
- **Success Response (200 OK)**:
```json
{
  "status": "ok",
  "timestamp": "2026-09-17T07:22:47.000Z"
}
```

---

### 8.2 `GET /idempotency/stats`
- **Purpose**: Retrieve operational metrics for idempotency records.
- **Auth Required**: Yes
- **Role Required**: `ADMIN` ONLY
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "completed": 45,
    "processing": 0,
    "failed": 2,
    "expired": 5,
    "total": 47
  }
}
```

---

### 8.3 `POST /idempotency/cleanup`
- **Purpose**: Purge expired idempotency keys past their TTL.
- **Auth Required**: Yes
- **Role Required**: `ADMIN` ONLY
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Cleaned up 5 expired idempotency record(s)",
  "data": {
    "deletedCount": 5
  }
}
```
