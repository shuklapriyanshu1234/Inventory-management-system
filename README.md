# XYZ Retail Corporation - Retail Inventory Management System

A complete, production-ready, enterprise-grade Retail Inventory Management System built for XYZ Retail Corporation. Engineered to achieve **98% inventory accuracy**, **25% fewer stockouts**, **20% less overstock**, **95% order fulfillment rate**, and **99.9% uptime**.

---

## 1. System Architecture Overview

The system is structured as a full-stack monorepo:
- **Backend API Server**: Node.js, Express, TypeScript, Prisma ORM, JWT access & refresh authentication, Zod input validation schemas, Helmet, Rate Limiting, and CORS.
- **Database**: Prisma configured for dual-engine support: SQLite for seamless zero-config local run, and PostgreSQL for Docker/Kubernetes container deployments.
- **Real-Time Communication**: Server-Sent Events (SSE) broadcasting instantaneous stock level shifts, transfers, order status updates, and goods receipt notifications.
- **Frontend SPA**: Vanilla ES6+ TypeScript/JavaScript architecture with responsive CSS design tokens (supporting Light and Dark themes, tablet/mobile warehouse optimization, camera scanner, and printable thermal slips).
- **Integrations**: Swagger/OpenAPI documentation at `/api/docs`, HMAC-SHA256 signed webhooks with retry backoff, API key authentication, and adapters for SAP/NetSuite ERP and QuickBooks/Xero double-entry accounting ledger.

---

## 2. Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    User ||--o{ AuditLog : records
    User ||--o{ StockMovement : authorizes
    User ||--o{ SalesOrder : creates
    User ||--o{ PurchaseOrder : creates
    User ||--o{ StockTransfer : requests
    User ||--o{ StockCount : conducts

    Category ||--o{ Product : classifies
    Product ||--o{ Stock : "stored at"
    Product ||--o{ StockMovement : ledger
    Product ||--o{ SalesOrderItem : contains
    Product ||--o{ PurchaseOrderItem : ordered_in
    Product ||--o{ StockTransferItem : transferred
    Product ||--o{ StockCountItem : counted

    Location ||--o{ Stock : holds
    Location ||--o{ StockMovement : tracks
    Location ||--o{ StockTransfer : "transfers from/to"
    Location ||--o{ SalesOrder : dispatches
    Location ||--o{ PurchaseOrder : receives

    Customer ||--o{ SalesOrder : places
    SalesOrder ||--o{ SalesOrderItem : lines
    SalesOrder ||--o{ OrderTimeline : stages

    Supplier ||--o{ PurchaseOrder : fulfills
    PurchaseOrder ||--o{ PurchaseOrderItem : lines

    Webhook ||--o{ WebhookDelivery : logs
```

---

## 3. Role-Based Permissions Matrix (RBAC)

The system enforces granular authorization middleware on every endpoint:

| Feature / Resource | Permission Key | Admin | Manager | Warehouse Staff | Sales |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **User Directory & Roles** | `users:read`, `users:write` | **Yes** | Read Only | No | No |
| **Security Audit Logs** | `audit:read` | **Yes** | **Yes** | No | No |
| **Product Catalog (Read)** | `products:read` | **Yes** | **Yes** | **Yes** | **Yes** |
| **Product CRUD & CSV** | `products:write` | **Yes** | **Yes** | No | No |
| **View Stock & Levels** | `inventory:read` | **Yes** | **Yes** | **Yes** | **Yes** |
| **Manual Adjustments** | `inventory:adjust` | **Yes** | **Yes** | **Yes** | No |
| **Inter-Facility Transfers**| `inventory:transfer` | **Yes** | **Yes** | **Yes** | No |
| **Create Sales Orders** | `orders:write` | **Yes** | **Yes** | No | **Yes** |
| **Fulfill Orders (Pick/Ship)**| `orders:fulfill` | **Yes** | **Yes** | **Yes** | No |
| **Create Purchase Orders**| `po:write` | **Yes** | **Yes** | No | No |
| **Receive PO Goods** | `po:receive` | **Yes** | **Yes** | **Yes** | No |
| **Dashboard & Forecast** | `reports:read` | **Yes** | **Yes** | **Yes** | **Yes** |
| **Export Reports / CSV** | `reports:export` | **Yes** | **Yes** | No | No |
| **API Keys & Webhooks** | `integrations:manage` | **Yes** | **Yes** | No | No |

---

## 4. Mapping 8 Core Feature Areas to Corporate Goals

1. **Product Catalog**: Centralized single source of truth eliminating data drift; supports SKU, barcodes, categories, and image uploads. *(Solves: Inaccurate manual data)*.
2. **Multi-Location Inventory Tracking**: Real-time cross-facility visibility (warehouses & stores) with atomic optimistic-concurrency adjustments, stock transfers, and physical cycle count variance reconciliation. *(Achieves: 98% inventory accuracy & zero lost updates)*.
3. **Order Management & Fulfillment**: Automatic stock reservation upon placement, stock deduction on shipment, backorder quantification, pick lists, and printable packing slips. *(Achieves: 95% order fulfillment rate & faster dispatch)*.
4. **Supplier Management**: Supplier performance metrics (fill rate, on-time delivery rate, lead time calculation) coupled with automated reorder drafting. *(Achieves: 25% fewer stockouts)*.
5. **Barcode & RFID Scanning**: USB scanner support, browser camera scanning via `Html5Qrcode`, barcode label generator, and hardware-agnostic RFID reader abstraction with a working simulated reader. *(Eliminates: Manual receiving and picking entry errors)*.
6. **Reporting & Predictive Analytics**: KPI dashboard (turnover, valuation, stock by facility), customizable report export (CSV/PDF), and 30-day moving average demand forecasting with safety-buffer reorder points. *(Achieves: 20% less overstock)*.
7. **User Management & Security**: JWT access/refresh tokens, token-based password reset, RBAC middleware, and immutable audit logs capturing actor, action, entity, IP, and payload diffs. *(Solves: Security compliance & accountability)*.
8. **Enterprise Integrations**: OpenAPI/Swagger UI at `/api/docs`, HMAC-SHA256 signed webhooks with exponential backoff retry, API key support, and ERP/Accounting adapters for SAP, NetSuite, and QuickBooks. *(Ensures: Seamless enterprise ecosystem interoperability)*.

---

## 5. Quick Start & Setup Instructions

### Prerequisites
- Node.js >= 18 (Node.js 20+ recommended)
- npm or pnpm

### Option A: Local Run (SQLite - Zero Configuration)
1. **Install Dependencies**:
   ```bash
   cd server
   npm install
   ```
2. **Initialize Database & Seed Data**:
   ```bash
   npx prisma db push
   npx tsx prisma/seed.ts
   ```
   *(Note: The seeder automatically migrates the prototype's `legacy_inventory.json` items into the database).*
3. **Start the Application**:
   ```bash
   npm start
   # Or for development with hot-reload:
   npm run dev
   ```
4. **Open in Browser**:
   - Web App UI: [http://localhost:4000](http://localhost:4000)
   - Interactive API Docs: [http://localhost:4000/api/docs](http://localhost:4000/api/docs)
   - Health Probe: [http://localhost:4000/health](http://localhost:4000/health)

### Option B: Docker & Docker Compose (PostgreSQL)
1. Run with Docker Compose:
   ```bash
   docker-compose up --build
   ```
2. The application will start on port `4000` with PostgreSQL on port `5432`.

---

## 6. Default Login Credentials

| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin** | `admin@xyzretail.com` | `Admin123!` |
| **Manager** | `manager@xyzretail.com` | `Admin123!` |
| **Warehouse Staff** | `warehouse@xyzretail.com` | `Admin123!` |
| **Sales** | `sales@xyzretail.com` | `Admin123!` |

*(An integration API key is also pre-seeded: `xyz_live_demokey_8899aabbccddeeff0011`)*.

---

## 7. Automated Test Suite

Run the automated test suite with:
```bash
cd server
npm test
```
The test suite covers:
- Authentication, JWT token verification, and RBAC permission enforcement.
- Optimistic concurrency safety, non-negative stock guards, and movement ledger integrity.
- Inter-facility stock transfers (source deduction & target receipt).
- Sales order lifecycle: placement reservation, backorders, and shipment deductions.
- Purchase order draft creation and goods receipt stock increments.

---

## 8. Assumptions & Notes
- **Prototype Migration**: The prototype `inventory.json` contained basic items (`id`, `name`, `quantity`, `price`). During migration, each item is assigned a standardized SKU (`SKU-LEGACY-<id>`), placed in category `General Merchandise`, assigned to `WH-MAIN`, cost is derived at a 40% margin assumption, and an initial audit ledger movement is recorded.
- **Email Service**: In compliance with the specification, password reset tokens and verification links are output to structured server console logs for local verification.
- **RFID Scanner**: Uses an abstract interface `IRFIDReader` with a fully functional `SimulatedRFIDReader` generating valid EPC-96 tags and signal strength metrics (RSSI), allowing production drivers for Zebra or Impinj hardware to plug in seamlessly.
