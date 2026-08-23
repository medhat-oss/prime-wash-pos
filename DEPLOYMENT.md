# Car Wash ERP & POS - Production Deployment & Operations Guide
# دليل النشر والتشغيل السحابي لمنظومة إدارة مغسلة السيارات

This guide provides step-by-step instructions for deploying and running the **Car Wash ERP & POS** system in production using **Docker**, **Cloudflare**, and **Nginx**.

---

## 1. System Architecture Overview

```
               [ Clients / Cashiers / Admins ]
                             │
                             ▼
                 [ Cloudflare Edge CDN & WAF ]
              (SSL Full Strict + DDoS Mitigation)
                             │
                             ▼
              [ Nginx Reverse Proxy / Port 443 ]
          (Rate Limiting, Gzip, Asset Caching)
                             │
                             ▼
             [ Docker Container: carwash-erp-pos ]
         ┌───────────────────┴───────────────────┐
         │ Node.js 20 Express (Port 3000)        │
         │ ├─ React Vite Single Page App (SPA)   │
         │ ├─ REST API (/api/*)                  │
         │ └─ Local Uploads (/uploads/*)         │
         └───────────────────┬───────────────────┘
                             │
                             ▼
         [ PostgreSQL Database (Neon Serverless / Cloud DB) ]
```

---

## 2. Environment Variables Checklist (`.env`)

Create a `.env` file in the project root directory on the production server.

```bash
# ==============================================================================
# Database Configuration (PostgreSQL / Neon Serverless)
# ==============================================================================
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-sample-123456.us-east-1.aws.neon.tech/neondb?sslmode=require

# ==============================================================================
# Server & Environment
# ==============================================================================
PORT=3000
NODE_ENV=production

# ==============================================================================
# Security & Access Control
# ==============================================================================
# Master PIN required to access HR, Payroll, Tax Settings, and Admin Dashboard
ADMIN_PIN=1234

# Allowed CORS Origins (Set to your domain in production, or comma-separated)
CORS_ORIGIN=https://pos.yourdomain.com

# ==============================================================================
# Cloudinary Media Storage (Optional)
# If omitted, uploaded images and videos will be saved locally in /uploads/media
# ==============================================================================
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

---

## 3. Quick Deployment via Docker Compose

### Step 1: Clone Repository & Setup Environment
```bash
git clone <repository_url> /opt/carwash-erp
cd /opt/carwash-erp

# Copy and edit production environment variables
cp .env.example .env
nano .env
```

### Step 2: Initialize Database Schema & Seed Data
Before starting the app container for the first time, run database migrations:
```bash
# Run database schema migration
npm run db:migrate

# (Optional) Seed default services, raw materials, and sample employees
npm run db:seed
```

### Step 3: Build & Launch Docker Container
```bash
# Build multi-stage Docker image and start container in detached mode
docker compose up -d --build

# Verify container is running and healthy
docker compose ps

# Check live container application logs
docker compose logs -f app
```

---

## 4. Cloudflare Configuration Guide

### A. DNS Setup
1. In the **Cloudflare Dashboard** &rarr; **DNS** &rarr; **Records**:
   - Add an **A Record**: `pos.yourdomain.com` pointing to your server's public IP address.
   - Ensure the proxy status is **Proxied (Orange Cloud ☁️ Enabled)**.

### B. SSL/TLS Settings
1. Navigate to **SSL/TLS** &rarr; **Overview**:
   - Set encryption mode to **Full (Strict)**.
2. Under **SSL/TLS** &rarr; **Origin Server**:
   - Click **Create Certificate** (valid for 15 years).
   - Save the certificate to `/etc/ssl/certs/carwash.crt` on your server.
   - Save the private key to `/etc/ssl/private/carwash.key` on your server.
   - Set secure file permissions: `chmod 600 /etc/ssl/private/carwash.key`.

### C. Web Application Firewall (WAF) & Rate Limiting
1. Under **Security** &rarr; **WAF** &rarr; **Rate limiting rules**:
   - Create a rule to protect `/api/` endpoints:
     - Target: `URI Path starts with /api/`
     - Rate: `50 requests per 10 seconds per IP`
     - Action: `Block` or `Managed Challenge`
2. Enable **Bot Fight Mode** under **Security** &rarr; **Bots**.

---

## 5. Nginx Reverse Proxy Setup

Copy the provided [`nginx.conf`](file:///d:/%D9%85%D8%BA%D8%B3%D9%84%D8%A9/nginx.conf) to your server's Nginx configuration directory:

```bash
sudo cp nginx.conf /etc/nginx/sites-available/carwash.conf
sudo ln -s /etc/nginx/sites-available/carwash.conf /etc/nginx/sites-enabled/

# Test Nginx configuration syntax
sudo nginx -t

# Reload Nginx without dropping connections
sudo systemctl reload nginx
```

---

## 6. Cloudflare Deployment via Wrangler (Pages & Workers)

### 6.1 Frontend Deployment (Cloudflare Pages)
Deploy the optimized React Vite Single Page App to Cloudflare Pages edge CDN:

1. **Authenticate Wrangler**:
   ```bash
   npx wrangler login
   # Or export CLOUDFLARE_API_TOKEN in your CI/CD environment
   ```

2. **Build Production Assets**:
   ```bash
   npm --prefix client run build
   ```

3. **Deploy to Cloudflare Pages**:
   ```bash
   npx wrangler pages deploy client/dist --project-name prime-wash-pos
   # Or using the package script:
   npm run deploy:pages
   ```

### 6.2 Backend API Deployment (Cloudflare Workers)
Deploy the Express API backend to Cloudflare Workers with Node.js compatibility:

1. **Verify `wrangler.toml` Configuration**:
   ```toml
   name = "prime-wash-api"
   main = "src/server.ts"
   compatibility_date = "2024-09-23"
   compatibility_flags = ["nodejs_compat"]

   [vars]
   NODE_ENV = "production"
   ```

2. **Set Production Secrets**:
   ```bash
   npx wrangler secret put DATABASE_URL
   npx wrangler secret put ADMIN_PIN
   npx wrangler secret put CORS_ORIGIN
   ```

3. **Deploy Worker**:
   ```bash
   npx wrangler deploy
   # Or using the package script:
   npm run deploy:worker
   ```

---

## 7. Zero-Downtime Application Updates

To deploy new code changes without manual downtime:

```bash
cd /opt/carwash-erp

# Pull latest code
git pull origin main

# Rebuild container and restart
docker compose up -d --build --no-deps app

# Clean up dangling images
docker image prune -f
```

---

## 8. Backup & Data Protection Runbook

### Database Backups (Neon / PostgreSQL)
```bash
# Automated daily cron backup script:
pg_dump "$DATABASE_URL" | gzip > /backups/carwash_db_$(date +\%F).sql.gz
```

### Media Uploads Backup
```bash
# Backup persistent uploads volume:
tar -czvf /backups/carwash_uploads_$(date +\%F).tar.gz /opt/carwash-erp/uploads
```
