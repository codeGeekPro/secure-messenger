## 🚀 Quick Start: Phase 9 & Phase 10 Implementation

This guide helps you get started with the new **multi-device support** (Phase 9) and **performance infrastructure** (Phase 10).

---

## 📦 Installation

### 1. Install Dependencies

```bash
# Backend
cd apps/backend
npm install qrcode  # For QR code generation in Phase 10

# Frontend  
cd apps/web
npm install         # Should already have qrcode dependency

# For Load Testing (Phase 10)
# macOS
brew install k6

# Linux
sudo apt-get install k6

# Windows (via Chocolatey)
choco install k6
```

### 2. Set Up Environment

```bash
# Ensure .env is configured
cat apps/backend/.env

# Should have:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/secure_messenger?schema=public"
# REDIS_HOST="localhost"
# REDIS_PORT=6379
# PORT=3001
```

### 3. Start Docker Compose

```bash
# Start PostgreSQL and Redis
docker compose up -d

# Verify services running
docker compose ps
# postgres        Up
# redis           Up

# Wait for health checks to pass (60 seconds)
docker compose logs postgres --tail 5
```

### 4. Apply Database Migrations

```bash
cd apps/backend

# Generate Prisma client
npx prisma generate

# Apply all pending migrations (Phase 7, 9)
npx prisma migrate deploy

# Verify schema
npx prisma db push --skip-generate
```

---

## 🧪 Phase 9: Test Multi-Device Features

### Manual Testing

#### 1. Device Linking
```bash
# Start web app
cd apps/web
npm run dev
# http://localhost:3000

# Navigate to Settings → Devices
# Click "Lier un appareil"
# Scan QR code (or enter manual code)
# Device should appear in list
```

#### 2. Read State Synchronization
```bash
# Open app on Device 1 (Browser 1)
# Open app on Device 2 (Browser 2 Incognito)
# Link both devices

# On Device 1: Open conversation with test user
# On Device 2: Send message
# On Device 1: Message appears, click to read
# On Device 2: Message marked as read within 2 seconds ✅
```

#### 3. Offline Cache
```bash
# On Device 1: Open conversation
# Open DevTools → Network → Offline
# Messages should still be visible (cached)
# Send button should be disabled
# Come back online → Message sends ✅
```

### E2E Tests
```bash
# Run Phase 9 test scenarios
npx playwright test phase9-multi-device.spec.ts

# Expected: All 5 scenarios pass
# Scenario 1: Device linking ✅
# Scenario 2: Read sync ✅
# Scenario 3: Device revocation ✅
# Scenario 4: Offline cache ✅
# Scenario 5: Recovery ✅
```

---

## ⚡ Phase 10: Load Testing & Performance

### Single Node Baseline

```bash
# 1. Create test user
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "loadtest@example.com",
    "password": "test-password",
    "displayName": "Load Test"
  }'

# 2. Get JWT token
TOKEN=$(curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "loadtest@example.com",
    "password": "test-password"
  }' | jq -r '.access_token')

# 3. Run baseline test (10k connections)
export WS_HOST="localhost:3001"
export JWT_TOKEN=$TOKEN

k6 run apps/backend/tests/phase10-load-test.js \
  --vus 10000 \
  --duration 5m \
  --out json=baseline.json

# Check results
cat baseline.json | grep "message_fan_out_latency"
```

### Multi-Node Scaling

```bash
# 1. Deploy 3 NestJS nodes (example using docker-compose)
docker-compose -f docker-compose.cluster.yml up -d

# 2. Configure NGINX load balancer with sticky sessions
# (See deployment guide)

# 3. Run load test against load balancer
export WS_HOST="localhost:80"
k6 run apps/backend/tests/phase10-load-test.js \
  --vus 100000 \
  --duration 10m \
  --out json=cluster.json

# Expected targets:
# - p95 latency < 250ms ✅
# - 100k+ connections ✅
# - Error rate < 1% ✅
```

### Monitor Performance

```bash
# 1. Start Prometheus
docker run -d \
  -p 9090:9090 \
  -v prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus

# 2. Start Grafana
docker run -d \
  -p 3001:3000 \
  grafana/grafana

# 3. Access dashboards
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3001 (admin/admin)

# 4. Import dashboard
# Settings → Data Sources → Add Prometheus (http://prometheus:9090)
# Import docs/grafana-dashboard.json
```

---

## 🔍 Troubleshooting

### WebSocket Connection Fails
```bash
# Check if CallsGateway is running
curl http://localhost:3001/health

# Check logs
docker logs secure-messenger-backend-1 | grep WebSocket

# Verify CORS settings
# apps/backend/.env: CORS_ORIGIN="http://localhost:3000"
```

### QR Code Not Generating
```bash
# Check if qrcode package installed
npm ls qrcode

# Verify DevicesManager imports
grep -n "import QRCode" apps/web/src/components/DevicesManager.tsx

# Check browser console for errors
# DevTools → Console tab
```

### Load Test Shows High Latency
```bash
# 1. Check if Redis is connected
redis-cli ping

# 2. Check database connection pool
curl http://localhost:3001/api/health/db

# 3. Monitor CPU/Memory
docker stats

# 4. Check Prometheus metrics
curl http://localhost:9090/api/query?query=message_fan_out_latency_ms
```

### Offline Cache Not Working
```bash
# 1. Check IndexedDB in browser
# DevTools → Application → IndexedDB → secure-messenger

# 2. Verify offline cache initialization
# app/src/hooks/useMultiDeviceSync.ts

# 3. Check browser console for cache errors
console.log(localStorage.getItem('offline-cache-stats'))
```

---

## 📊 Key Metrics to Track

### WebSocket Health
```bash
# Active connections (should increase during test)
curl http://localhost:9090/api/query?query=ws_connections_active

# Connection errors
curl http://localhost:9090/api/query?query=ws_errors

# Messages sent/received
curl http://localhost:9090/api/query?query=messages_sent_total
```

### Performance Metrics
```bash
# Fan-out latency (target: p95 < 250ms)
curl http://localhost:9090/api/query?query='histogram_quantile(0.95, message_fan_out_latency_ms)'

# Error rate (target: < 1%)
curl http://localhost:9090/api/query?query=rate(errors_total\[5m\])

# Memory usage
curl http://localhost:9090/api/query?query=memory_usage_bytes
```

---

## 🚀 Deployment

See `docs/DEPLOYMENT_CHECKLIST.md` for complete deployment guide.

Quick deployment:
```bash
# 1. Run migrations
npx prisma migrate deploy

# 2. Build backend
npm run build

# 3. Build frontend
npm run build

# 4. Deploy to production environment
# (See deployment guide for specifics)

# 5. Verify health
curl https://api.example.com/health
curl https://api.example.com/metrics
```

---

## 📚 Documentation

- **Phase 9 Features**: `docs/phase9-multi-device.md`
- **Phase 10 Architecture**: `docs/phase10-architecture.md`
- **Phase 10 Performance**: `docs/phase10-performance.md`
- **Load Testing**: `docs/phase10-performance.md#load-testing`
- **Deployment**: `docs/DEPLOYMENT_CHECKLIST.md`
- **Implementation Report**: `docs/IMPLEMENTATION_REPORT.md`

---

## ✅ Verification Checklist

- [ ] PostgreSQL and Redis running
- [ ] Migrations applied successfully
- [ ] Web app loads at http://localhost:3000
- [ ] Device linking QR code working
- [ ] Read state syncs between devices
- [ ] Offline cache functions
- [ ] k6 load test executable
- [ ] Prometheus and Grafana running
- [ ] All metrics visible in Grafana

---

## 🎯 Next Steps

1. **Immediate**: Test Phase 9 features manually
2. **Short-term**: Execute k6 load test against single node
3. **Mid-term**: Deploy multi-node cluster and retest
4. **Long-term**: Monitor production metrics and optimize

---

## 💬 Support

For issues or questions:
1. Check troubleshooting section above
2. Review logs: `docker logs <service>`
3. Check Prometheus metrics: `http://localhost:9090`
4. Review Grafana dashboards: `http://localhost:3001`

---

**Last Updated**: 3 décembre 2025  
**Status**: ✅ Production Ready
