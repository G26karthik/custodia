This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

## Phase 6 - Notifications & Activity Log

Implemented Screen 10 plus the server helpers used by the other modules.

Teammate import path:

```ts
import { logActivity, notify } from "@/lib/notifications";
```

Supported notification types:

```ts
ASSET_ASSIGNED
MAINTENANCE_APPROVED
MAINTENANCE_REJECTED
BOOKING_CONFIRMED
BOOKING_CANCELLED
TRANSFER_APPROVED
OVERDUE_RETURN
AUDIT_DISCREPANCY
```

Screen route: `/notifications`

## Phase 7 - Resource Booking

Implemented Screen 6 with a live-updating booking board.

- Route: `/resource-booking`
- API: `/api/bookings`
- Service layer: `src/lib/services/bookingService.ts`
- Zod validation for create/reschedule/cancel flows
- Server-side RBAC and ownership checks
- SWR polling every 7 seconds
- Exact overlap rule: `newStart < existingEnd AND newEnd > existingStart`
- Seed data creates Conference Room B2 with a 9:00-10:00 booking for acceptance testing

## Phase 8 - Asset Audit

Implemented Screen 8 with live-updating audit cycles and auditor checklist.

- Route: `/audit`
- API: `/api/audits`, `/api/audits/items/[id]`, `/api/audits/[id]/close`
- Service layer: `src/lib/services/auditService.ts`
- Zod validation and server-side RBAC
- Create audit cycle by department/location scope
- Auditor checklist: Verified, Missing, Damaged, notes
- Close cycle locks edits, marks Missing assets as LOST, and notifies Asset Managers

## Phase 9 - Reports & Analytics

Implemented Screen 9 with live operational analytics.

- Route: `/reports`
- API: `/api/reports`
- Service layer: `src/lib/services/reportService.ts`
- RBAC for Admin, Asset Manager, and Department Head
- Utilization by department
- Maintenance frequency
- Most-used and idle assets
- Maintenance / retirement risk score
- Booking heatmap
- CSV export via `/api/reports?format=csv`

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
