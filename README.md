# Prime Wash POS — Cloud-Native High-Throughput POS & ERP System

[![Runtime](https://img.shields.io/badge/Runtime-Cloudflare_Pages_%2B_Functions-F38020?logo=cloudflare)](https://pages.cloudflare.com)
[![Database](https://img.shields.io/badge/Database-Neon_Serverless_PostgreSQL-00E599?logo=postgresql)](https://neon.tech)
[![Frontend](https://img.shields.io/badge/Frontend-React_18_%2B_Vite_%2B_PWA-61DAFB?logo=react)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript_Strict-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Offline](https://img.shields.io/badge/Architecture-Offline--First_%26_Event--Driven-8A2BE2)](#offline-first-sync-engine)

Prime Wash is an enterprise-grade, offline-first Point of Sale (POS) and Enterprise Resource Planning (ERP) platform architected for automotive service centers. Built specifically to handle zero-network blackouts, atomic inventory deduction at gram-level precision, and sub-16ms tactile input responsiveness.

---

## 🏛️ System Architecture Overview

The system employs a Hybrid Edge-Compute Topology:

```mermaid
graph TD
    Client["Client PWA (Tablets, POS Terminals, Mobile)"]
    
    subgraph Edge Layer ["Cloudflare Global Anycast Edge"]
        CF_Pages["Cloudflare Pages (Static SPA Assets & Workbox SW)"]
        CF_Func["Cloudflare Functions /api/* (V8 Isolates)"]
    end
    
    subgraph Data Tier ["Serverless Data Plane"]
        Neon_Pooler["Neon Connection Pooler (PgBouncer)"]
        Neon_DB["Neon PostgreSQL (Storage Engine)"]
    end
    
    subgraph Local Tier ["Client-Side Isolation"]
        IndexedDB["IndexedDB (Outbox Sync Queue)"]
        LocalStorage["Encrypted Session & Telemetry Storage"]
    end

    Client -->|Hydrate SPA & Cache| CF_Pages
    Client -->|Zero-Latency Read/Write| IndexedDB
    Client -->|REST API over TLS 1.3| CF_Func
    IndexedDB -->|Atomic Sync Engine| CF_Func
    CF_Func -->|Pooled SQL over WebSocket/TCP| Neon_Pooler
    Neon_Pooler --> Neon_DB
```

---

## ⚡ Core Engineering Highlights

### 1. Offline-First Sync Engine & Resilience
- **Persistent Outbox Model:** Transactions, service orders, and cashier logs are immutably written to local IndexedDB stores first.
- **Bi-Directional Conflict Resolution:** Uses deterministic UUIDs (`shift_code`, `order_id`) combined with monotonic timestamps and device identifiers (`cw_device_id`).
- **Atomic Drain Mechanism:** Automatic network telemetry listeners (`navigator.onLine`, `visibilitychange`) trigger exponential-backoff queue flushing without blocking the UI thread.

### 2. Multi-Terminal Concurrency & Anti-Collision Sentinel
- **Single-Active-Shift Invariant:** Strictly prevents split-brain shift sessions across multi-terminal setups.
- **Session Takeover Protocol (Hijack Sentinel):** Heartbeat-driven terminal ownership checks verify terminal authority. When a shift is claimed by another terminal, the background sentinel initiates immediate screen security lockouts.
- **Role-Gated Identity Verification:** Cryptographically decoupled PIN verification preventing role swap collisions between Cashier, Worker, and Manager tiers.

### 3. Sub-16ms Input Latency & Rendering Isolation
- **Compositor Layer Promotion:** Service and product cards leverage hardware acceleration (`transform-gpu`, CSS `contain: layout style paint`) eliminating layout shifts.
- **Micro-Decoupled Telemetry:** Status badges and heartbeat sentinels communicate via detached DOM CustomEvents, completely bypassing top-level React component tree re-rendering.
- **Code-Splitting Strategy:** Monolithic bundle slashed using `React.lazy()` and chunk vendor splitting, ensuring cold boot POS load times under 800ms.

### 4. Gram-Level Atomic BOM Inventory Deduction
- Real-time Bill of Materials (BOM) recalculations execute inside transactional boundaries with `FOR UPDATE` row-level locks, preventing inventory discrepancies under simultaneous checkout requests.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Edge & Compute** | Cloudflare Pages, Cloudflare Workers Functions, Node.js (Enterprise Server fallback) |
| **Database & ORM** | Neon Serverless PostgreSQL, Prisma / Raw Pooled SQL (`@neondatabase/serverless`) |
| **Frontend Core** | React 18, TypeScript (Strict Mode), Vite, Tailwind CSS |
| **PWA & Offline** | Workbox, IndexedDB (`idb`), Service Worker Offline Fallback |
| **Hardware Integration** | Web Thermal Printer API (80mm ESC/POS Raw & Raster Generation) |
| **Design System** | Fully responsive RTL-native UI (Tajawal Typography), Dual Color Palettes (Emerald / Carmine) |

---

## 🚀 Quick Start & Local Development

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0
- Cloudflare Wrangler CLI (`npm i -g wrangler`)
- Neon PostgreSQL connection URI

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/your-org/prime-wash-pos.git
cd prime-wash-pos

# Install dependencies (Root & Client)
npm install
npm --prefix client install
```

### 2. Environment Setup
Create a `.env` file in the root directory:
```env
DATABASE_URL=postgresql://user:password@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
PORT=3000
NODE_ENV=development
```

### 3. Development Server
```bash
# Launch POS Frontend client with HMR
npm run client:dev

# Launch full Edge-emulated stack
npx wrangler pages dev client/dist
```

### 4. Production Build & Deployment
```bash
# Typecheck & bundle optimized assets
npm run --prefix client build

# Deploy to Cloudflare Pages Edge
npx wrangler pages deploy client/dist --project-name prime-wash-pos
```
