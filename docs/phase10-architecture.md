# Phase 10 Architecture: Scaling to 100k Connections

## 🏗️ Multi-Node Cluster Architecture

```
                           ┌─────────────────────────────────────┐
                           │    Cloudflare CDN (Media)           │
                           │    - WebP compression               │
                           │    - Image resize (Sharp.js)        │
                           │    - Cache TTL 1 year               │
                           └────────────────┬────────────────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
              ┌─────▼────┐           ┌─────▼────┐           ┌─────▼────┐
              │  NGINX    │           │  NGINX   │           │  NGINX   │
              │Load       │           │Load      │           │Load      │
              │Balancer   │           │Balancer  │           │Balancer  │
              │(sticky    │           │(sticky   │           │(sticky   │
              │sessions)  │           │sessions) │           │sessions) │
              └─────┬────┘           └─────┬────┘           └─────┬────┘
                    │                      │                      │
        ┌───────────┴──────────────────────┼──────────────────────┴───────────┐
        │                                  │                                  │
   ┌────▼─────┐                      ┌────▼─────┐                      ┌────▼─────┐
   │NestJS    │                      │NestJS    │                      │NestJS    │
   │ Node 1   │                      │ Node 2   │                      │ Node 3   │
   │          │                      │          │                      │          │
   │ - WS     │                      │ - WS     │                      │ - WS     │
   │ - Auth   │                      │ - Auth   │                      │ - Auth   │
   │ - Crypto │◄────Redis Pub/Sub───►│ - Crypto │◄────Redis Pub/Sub───►│ - Crypto │
   │          │                      │          │                      │          │
   └────┬─────┘                      └────┬─────┘                      └────┬─────┘
        │                                 │                                 │
        └─────────────────────┬───────────┴────────────────────┬────────────┘
                              │                                │
                        ┌─────▼────────────────────────────────▼────┐
                        │                                           │
                        │  Shared Services                          │
                        │  ┌─────────────┐     ┌────────────────┐  │
                        │  │ PostgreSQL  │     │ Redis Cache    │  │
                        │  │ (Primary)   │     │ (Sessions)     │  │
                        │  │             │     │                │  │
                        │  │ Replicas:   │     │ Pub/Sub:       │  │
                        │  │ - Read 1    │     │ - Messages     │  │
                        │  │ - Read 2    │     │ - Presence     │  │
                        │  │ - Read 3    │     │ - Devices      │  │
                        │  └─────────────┘     │ - Events       │  │
                        │                      └────────────────┘  │
                        │                                           │
                        │  ┌──────────────────────────────────────┐ │
                        │  │ Prometheus + Grafana Monitoring      │ │
                        │  │ - WS connections: 100k/node target  │ │
                        │  │ - Fan-out latency p95 < 250ms       │ │
                        │  │ - Memory < 10KB/connection          │ │
                        │  │ - Error rate < 1%                   │ │
                        │  └──────────────────────────────────────┘ │
                        │                                           │
                        └───────────────────────────────────────────┘
```

## 🔄 Event Flow: Message Fan-Out

### Single Node (Before)
```
User A sends message in Conversation X
  ↓
Backend encrypts for User B
  ↓
Send via WebSocket to User B's connected device
  ↓
User B receives (Latency: ~100ms)
```

### Multi-Node Cluster (After)
```
User A (Node 1) sends message in Conversation X
  ↓
Node 1 encrypts for User B's devices
  ↓
Node 1 publishes to Redis: "conv:X:message"
  ↓
┌────────┬────────┬────────┐
│ Node 1 │ Node 2 │ Node 3 │
└────┬───┴────┬───┴────┬───┘
     │        │        │
User B's devices may be on any node
If Node 2 has User B's device:
  Node 2 subscribers to Redis channel
  Node 2 broadcasts via WS to User B
  ↓
User B receives (Latency: ~150-200ms)
  ├─ Redis pub/sub latency: ~10-20ms
  ├─ Network latency: ~30-50ms
  └─ WS delivery: ~50-100ms
```

## 📊 Performance Targets (DoD)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **WS Connections** | 100k per node | k6 load test with 100k VUs |
| **Fan-out Latency p95** | < 250ms | Histogram from message_fan_out_latency_ms |
| **Memory per Connection** | < 10KB | (Total memory - baseline) / active_connections |
| **Throughput** | 100k msg/sec | messages_sent_total / duration |
| **Error Rate** | < 1% | errors_total / total_events |
| **CPU Utilization** | < 80% | cpu_usage_percent metric |

## 🔐 Security in Scaling

### E2E Encryption Maintained
- Message encryption happens on **originating node**
- Redis Pub/Sub carries **ciphertext only**
- Per-device encryption keys fetched from PostgreSQL
- No plaintext exposed in transit

### Device Identification
- Each device has unique ID (from Prisma Device model)
- Message forking based on recipient's device list
- Sticky sessions ensure device affinity to node
- Revoked devices removed from session map

## 🚀 Deployment Strategy

### Phase 1: Single Node Baseline (Week 1)
```
1. Configure k6 load test
2. Run against single NestJS instance
3. Measure baseline latency (p95)
4. Target: 10k-20k concurrent connections
```

### Phase 2: Multi-Node Setup (Week 2)
```
1. Deploy 3 NestJS nodes behind NGINX
2. Enable Redis Pub/Sub in CallsGateway
3. Configure sticky sessions in NGINX
4. Run load test: ramp to 100k connections
5. Measure cross-node latency
6. Target: p95 < 250ms with 100k connections
```

### Phase 3: CDN & Monitoring (Week 3)
```
1. Integrate Cloudflare CDN for media
2. Configure image compression pipeline
3. Deploy Prometheus metrics collection
4. Set up Grafana dashboards
5. Configure alerting rules
6. Load test with realistic media workload
```

## 📈 Expected Results

| Component | Before | After | Improvement |
|-----------|--------|-------|-------------|
| **Max Connections** | 10k/node | 100k/node | **10x** |
| **Throughput** | 10k msg/sec | 100k msg/sec | **10x** |
| **Media Size** | 2.5MB avg | 500KB avg | **80% reduction** |
| **Fan-out p95** | 300ms | 250ms | **17% faster** |
| **Memory Efficient** | 50MB/1k conn | ~100MB/10k conn | **10% per conn** |

## 🛠️ Tooling

### Load Testing
- **k6**: Simulating 100k WebSocket connections
- **Metrics**: Custom histogram tracking fan-out latency
- **Reports**: JSON output for CI/CD integration

### Monitoring
- **Prometheus**: Scraping metrics from /metrics endpoint
- **Grafana**: Visualizing real-time dashboard
- **Alerts**: Automatic notifications on SLA violations

### Infrastructure
- **NGINX**: Load balancing with sticky sessions
- **Redis**: Pub/Sub for cross-node events
- **Cloudflare**: CDN with automatic image optimization
- **PostgreSQL**: Read replicas for scaling read operations

## ✅ DoD Acceptance Criteria

- [ ] k6 load test sustains 100k WS connections per node
- [ ] Message fan-out p95 latency < 250ms under load
- [ ] Memory usage stable (< 10KB per connection)
- [ ] Zero message loss in failure scenarios
- [ ] Prometheus metrics exposed and scraped correctly
- [ ] Grafana dashboard live with all panels
- [ ] Alert thresholds tested and working
- [ ] Performance report generated with recommendations
- [ ] Backup plan documented if scaling fails

## 📝 Notes

- Load tests use realistic E2E encrypted data
- Connection pools configured for multi-node
- Read replicas reduce write load on primary DB
- Redis acts as both cache and pub/sub broker
- Sticky sessions critical for device session affinity
- CDN caches immutable versioned assets (1 year TTL)
