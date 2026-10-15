# Prime Wash POS 🚗💧

An enterprise-grade, offline-first Point of Sale (POS) and management ecosystem engineered specifically for car wash and auto care centers. Built with a focus on fault tolerance, real-time data synchronization, and rigorous financial integrity.

**Developed by:** Medhat Elaraby | Machine Code

---

## 🏗️ Architecture & Tech Stack

This project utilizes a modern, serverless architecture to ensure high availability and zero maintenance overhead.

*   **Frontend:** React 18, TypeScript, Vite, Tailwind CSS.
*   **Routing:** Zero-Flicker HTML5 History API & Custom SPA Router.
*   **Backend / API:** Cloudflare Pages Functions (Edge Computing).
*   **Database:** Neon Serverless PostgreSQL (`@neondatabase/serverless`).
*   **Offline Persistence:** IndexedDB (`idb`) & LocalStorage.
*   **PWA:** Workbox with Background Sync & Silent Updates.

---

## ✨ Core Features

### 1. Offline-First Resilience
Engineered to survive network drops. Transactions, inventory deductions, and HR logs are instantly written to IndexedDB. A background synchronization engine (`SyncEngine`) queues mutations and executes FIFO reconciliation with the Neon database automatically once connectivity is restored.

### 2. Strict Financial Management & Z-Reports
Comprehensive shift lifecycle management. The system tracks expected cash mathematically based on gross sales and payment methods. Auto-closes stale shifts (>24h) and supports atomic admin overrides for actual cash variance auditing.

### 3. Granular Inventory (BOM) & Analytics
*   **Bill of Materials (BOM):** Deducts raw materials (e.g., grams of soap, ml of wax) incrementally per service rendered.
*   **P&L Dashboard:** Real-time Profit and Loss calculations protected against NaN/Infinity division edge cases.
*   **HR Payroll:** Real-time hourly wage calculation and attendance tracking.

### 4. Enterprise Security & Notifications
*   **Edge-Proxied Alerts:** Telegram API calls are securely proxied through Cloudflare Workers to prevent Bot Token leakage on the client.
*   **Admin Gate:** Secure, PIN-protected dashboard with robust session persistence and hash routing protection.
*   **Strict CORS:** API endpoints restricted strictly to production and local development origins.

---

## 🚀 Local Development Setup

### Prerequisites
*   Node.js (v18+)
*   npm or yarn
*   A Neon PostgreSQL Database
*   Cloudflare Wrangler CLI

### 1. Clone & Install
```bash
git clone https://github.com/medhat-oss/prime-wash-pos.git
cd prime-wash-pos/client
npm install
```

### 2. Environment Variables
Create a `.env` file in the `client` directory (for Vite) and `.dev.vars` in the root for Cloudflare Functions.

`.dev.vars` (Backend Secrets):
```env
DATABASE_URL="postgres://user:password@endpoint.neon.tech/neondb?sslmode=require"
TELEGRAM_BOT_TOKEN="your_bot_token"
TELEGRAM_CHAT_ID="your_chat_id"
```

### 3. Run Locally
```bash
# Starts Vite dev server + Wrangler local edge proxy
npm run dev
```

---

## 🛡️ Quality Assurance & Testing Notes
*   **State Management:** Verified zero-flicker routing preventing React hydration mismatches and session traps.
*   **Memory Safety:** Strict cleanup of interval timers and window event listeners to prevent memory leaks on 24/7 POS terminals.
*   **SQL Safety:** All aggregation queries utilize `COALESCE` to guarantee valid numerical casting for missing periods.

---

© 2026 Machine Code. All Rights Reserved.
