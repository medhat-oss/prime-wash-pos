# Changelog - Prime Wash POS Architecture Overhaul

All notable changes, architectural enhancements, verified features, and edge-case protections in this release are documented below.

---

## [v2.0.0] - 2026-08-23

### Major Architecture Overhaul: Offline-First Hybrid Persistence & Real-Time Reactive State

#### 1. Core Storage & Event Bus Layer
- **Transaction Storage Engine (`transactionStorage.ts`):**
  - Manages employee financial adjustments (`cw_employee_transactions`) and settled payout archives (`cw_payroll_payouts`).
  - Full CRUD operations with reactive event broadcasting: `cw_transactions_updated`, `cw_payroll_updated`, and `cw_expenses_updated`.
- **Services & BOM Storage Engine (`serviceStorage.ts`):**
  - Manages custom wash packages (`cw_custom_services`) with attached Bill-of-Materials (BOM) raw material recipe mappings.
  - Computes live estimated recipe costs dynamically based on current inventory gram unit costs (`cw_inventory_items`).
  - Dispatches `cw_services_updated` and `cw_inventory_updated`.
- **Attendance & Shift Ledger Engine (`attendanceStorage.ts`):**
  - Implements historical shift logging in `cw_attendance_records`.
  - Shift duration math calculates exact elapsed time, daily standard threshold ($8.0\text{h}$ default or custom target), overtime hours, and lost/deducted hours.
  - Dispatches `cw_attendance_updated` across components upon every check-in, check-out, and auto-clock-in.
- **Inventory BOM Stock Deduction (`inventoryStorage.ts`):**
  - Connects `deductBomInventory()` directly to `getStoredServices()`.
  - Accurately deducts raw materials in grams (shampoo, wax, air freshener, tire polish) during POS checkout.

#### 2. Hybrid API Client & Cloudflare Pages Fallbacks
- **Base64 / DataURL Media Upload Fallback (`client.ts`):**
  - `uploadApi.uploadMedia` intercepts HTTP 405 (static hosting) and network errors, automatically converting uploaded images and videos to Base64 DataURLs via `FileReader`.
- **Services API Fallback:**
  - `servicesApi.getAll`, `create`, `update`, `delete`, `setRecipes`, and `getRecipes` read and persist through `serviceStorage.ts`.
- **HR & Real-Time Payroll API:**
  - `hrApi.getAttendance`, `recordAttendance`, `deleteAttendance`, `createTransaction`, `getTransactions`, `deleteTransaction`, `calculatePayroll`, `payoutSalary`, and `getPayouts` dynamically compute shift breakdown, paid rest days, bonuses, penalties, advances, and net payouts locally with debt rollover support.

#### 3. Real-Time UI Synchronization & Headcount Badges
- **Reactive Navbar Headcount (`Navbar.tsx`):**
  - Subscribes to `cw_attendance_updated` and `storage`.
  - Displays a live badge (`X/Y حاضر` with pulsating emerald indicator) next to the "تسجيل حضور" button that updates instantly whenever any employee clocks in or out.
- **Dynamic OverviewTab Metrics (`OverviewTab.tsx`):**
  - Subscribes to all event channels (`cw_attendance_updated`, `cw_services_updated`, `cw_transactions_updated`, `cw_payroll_updated`, `cw_inventory_updated`).
  - Re-evaluates active vs. attended headcount dynamically on the Overview KPI cards in real-time.

#### 4. HR Payroll & Services Management Enhancements
- **Dynamic Net Salary Formula:**
  $$\text{Net} = (\text{Attended Hours Pay} + \text{Paid Weekly Off} + \text{Overtime Pay} + \text{Bonuses}) - (\text{Hours Deductions} + \text{Penalties} + \text{Advances})$$
- **Debt Rollover Protection (ترحيل المديونية):**
  - If financial adjustments exceed gross earnings ($\text{Net} < 0$), payout is capped at $0.00\text{ EGP}$ in treasury cash ledger, and the negative balance is automatically rolled over as an advance transaction (`سلفة مرحلة`) for the next payroll cycle.
- **Attendance & Transaction Multi-Criteria Filters:**
  - Filter attendance by employee and specific date.
  - Filter transactions by employee, transaction type (*سلفة / مكافأة / خصم*), and settlement status (*معلقة / تمت التسوية بالمسير*).
- **Deletion Actions & Safe Modals:**
  - Added delete actions with confirmation modals for individual shift records and financial transactions.

#### 5. Edge-Case Protections & Verification
- **Staff Deletion & Orphan Handling:** Deleting a staff member cleans up active shifts in `cw_active_attendance_logs`, decrements Navbar headcount, and preserves frozen snapshots of `employee_name` on historical transactions to prevent UI null pointer crashes.
- **Low-Stock & Zero-Stock Prevention:** Low-stock threshold detection triggers visual warnings; zero-stock handling clamps remaining stock at `0.00g` (`Math.max(0, ...)`), avoiding negative inventory balances.
- **Unit Cost Re-valuation:** Modifying raw material unit costs immediately recalculates estimated BOM costs across all wash packages.
- **Cloudflare Pages SPA Routing:** Configured `_redirects` (`/* /index.html 200`) in `client/dist/` to prevent 404 errors on deep routes.

---

## Verification Test Results

- **End-to-End Sanity Suite (`npm run test:sanity`):** 25 / 25 Tests Passed (100%).
- **Edge-Cases & Compatibility Suite (`npm run test:edge-cases`):** 17 / 17 Tests Passed (100%).
- **Total Combined Tests:** 42 / 42 Tests Passed (100% Reliability).
- **TypeScript Production Build (`tsc && vite build`):** 0 Errors, 0 Warnings.
- **Cloudflare Pages Deployment:** Successfully deployed to production at `https://prime-wash-pos.pages.dev`.
