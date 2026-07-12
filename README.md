# AssetFlow — Enterprise Asset Management & Resource Booking Platform

AssetFlow is a unified operability platform designed for enterprise asset lifecycle management, resource booking, auditing, real-time activity tracking, and operational analytics.

Designed for high performance, security, and strict data integrity under the assumed scale of **10,000+ concurrent users** and **1,000,000+ database records**.

---

## 🏗️ Architecture & Global Standards

Every route, page, and service in this codebase strictly adheres to the following corporate architecture rules:

1. **Modular Service Layer (Rule 4)**: All business logic is decoupled from Next.js route handlers and is housed within isolated, stateless service files under `src/lib/services/` (e.g., `asset-service.ts`, `maintenance-service.ts`, `bookingService.ts`, `auditService.ts`, `reportService.ts`, `dashboardService.ts`).
2. **Server-side RBAC (Rule 2)**: Fine-grained Role-Based Access Control is enforced on the database/service level for all mutations (blockers, registrations, overrides, approvals, updates) rather than relying solely on client-side button hiding.
3. **Zod Validation at Boundaries (Rule 3)**: Every API endpoint accepts structured payloads validated via Zod schemas, returning clean, descriptive validation errors without throwing raw server 500 crashes.
4. **Live Opera-polling (Rule 5)**: High-activity views (Kanban Board, Resource Booking calendar, Dashboard operational KPIs) use live-polling mechanisms (SWR / Interval) to keep concurrent user sessions synchronized.
5. **Unified Design System**: Sleek glassmorphic dark-theme UI styled using Tailwind CSS v4, Geist/Inter typography, and uniform responsive layout spacing across all 10 core views.

---

## 🗺️ Project Structure & Module Overview

| Phase | Module | Primary Path | API Endpoint | Service File |
|---|---|---|---|---|
| **Phase 1** | Auth, Session, Signup | `/login`, `/signup` | `/api/auth/*` | Inline + `src/lib/auth.ts` |
| **Phase 2** | Asset Registry | `/assets` | `/api/assets` | `src/lib/services/asset-service.ts` |
| **Phase 3** | Allocations & Transfers | `/assets` (Action Panel) | `/api/allocations`, `/api/transfers` | Inline transactional queries |
| **Phase 4** | Maintenance Kanban | `/maintenance` | `/api/maintenance` | `src/lib/services/maintenance-service.ts` |
| **Phase 5** | Standards & Audits Pass | Codebase-wide | Complete test suite | `src/scripts/test-phase-5-standards.ts` |
| **Phase 6** | Notifications & Activity | `/notifications` | `/api/notifications` | Inline + `src/lib/notifications.ts` |
| **Phase 7** | Resource Booking | `/resource-booking` | `/api/bookings` | `src/lib/services/bookingService.ts` |
| **Phase 8** | Asset Audit cycles | `/audit` | `/api/audits` | `src/lib/services/auditService.ts` |
| **Phase 9** | Reports & Analytics | `/reports` | `/api/reports` | `src/lib/services/reportService.ts` |
| **Phase 10**| Operational Live Dashboard| `/dashboard` | `/api/dashboard` | `src/lib/services/dashboardService.ts` |

---

## 🛢️ Database Schema & ER Diagram

The PostgreSQL database is organized with foreign keys enforcing referential integrity. Below is the structural schema layout:

```mermaid
erDiagram
    User {
        string id PK
        string name
        string email UK
        string passwordHash
        Role role
        Status status
        string departmentId FK
    }
    Department {
        string id PK
        string name
        string code UK
        string headId FK
        string parentId FK
        Status status
    }
    Category {
        string id PK
        string name UK
        json customFields
    }
    Asset {
        string id PK
        string assetTag UK
        string name
        string categoryId FK
        string serialNumber UK
        datetime acquisitionDate
        decimal acquisitionCost
        string condition
        string location
        string departmentId FK
        string photoUrl
        bool isBookable
        AssetStatus status
    }
    Allocation {
        string id PK
        string assetId FK
        string holderId FK
        string departmentId FK
        datetime allocatedAt
        datetime expectedReturnDate
        datetime returnedAt
        bool isActive
    }
    TransferRequest {
        string id PK
        string assetId FK
        string fromUserId FK
        string toUserId FK
        string reason
        TransferStatus status
    }
    MaintenanceRequest {
        string id PK
        string assetId FK
        string raisedById FK
        string issueDescription
        Priority priority
        MaintenanceStatus status
    }
    Booking {
        string id PK
        string assetId FK
        string bookedById FK
        datetime startTime
        datetime endTime
        string purpose
        BookingStatus status
    }
    AuditCycle {
        string id PK
        string name
        string scopeDeptId FK
        datetime startDate
        datetime endDate
        AuditStatus status
    }
    AuditItem {
        string id PK
        string auditCycleId FK
        string assetId FK
        VerificationStatus verification
    }
    Notification {
        string id PK
        string userId FK
        string type
        string message
        bool isRead
    }
    ActivityLog {
        string id PK
        string userId FK
        string action
        string entityType
        string entityId
        json details
    }

    User ||--o{ Allocation : "holds"
    User ||--o{ TransferRequest : "from/to"
    User ||--o{ Booking : "books"
    User ||--o{ MaintenanceRequest : "raises"
    User ||--o{ Notification : "receives"
    User ||--o{ ActivityLog : "performs"
    User }o--|| Department : "belongs to"
    Department ||--o{ Asset : "owns"
    Asset ||--o{ Allocation : "allocated via"
    Asset ||--o{ TransferRequest : "transferred via"
    Asset ||--o{ Booking : "booked as"
    Asset ||--o{ MaintenanceRequest : "maintained via"
    Asset ||--o{ AuditItem : "audited in"
    Category ||--o{ Asset : "categorizes"
    AuditCycle ||--o{ AuditItem : "contains"
    AuditCycle }o--|| Department : "scoped to"
```

---

## 🚀 Running Locally

### 1. Installation
Install dependencies:
```bash
npm install
```

### 2. Environment Setup
Create a `.env.local` file containing your PostgreSQL database URL:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:54322/assetflow"
```

### 3. Database Migration & Seed
Run Prisma migrations and seed the operational demo data:
```bash
npx prisma db push
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:54322/assetflow"; npx tsx src/scripts/seed.ts
```

*Note: Seeding creates an Admin account with the credentials:*
- **Email**: `admin@assetflow.com`
- **Password**: `AdminPassword123`

### 4. Running Dev Server
Launch Next.js in development mode:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🧪 Testing Suites

Run either script to validate business rules, integration compatibility, and security boundaries:

### A. Phase 5 Standards & Integration Test Suite
Validates modular services, RBAC, double-allocation blockers, maintenance transitions, and teammate notifications:
```bash
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:54322/assetflow"; npx tsx src/scripts/test-phase-5-standards.ts
```

### B. Pre-submission Hardening Test Suite
Validates Signup Zod checks, Allocations Return RBAC & Zod, and Overdue route access guards:
```bash
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:54322/assetflow"; npx tsx src/scripts/test-pre-submission.ts
```
