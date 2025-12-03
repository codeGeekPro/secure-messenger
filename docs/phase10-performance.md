# Phase 10: Performance & Scalabilité (2–3 semaines)

## 🎯 Livrables

### 1. Tests de Charge (Load Testing)
- **k6 Script**: Simulation 100k connexions WebSocket par nœud
- **Métriques Mesurées**:
  - Fan-out latency p95 < 250ms
  - Message delivery reliability > 99.9%
  - Memory footprint per connection < 10KB
  - CPU utilization tracking

### 2. Plan Scale-Out & Clustering
- **Redis Pub/Sub** pour broadcast multi-nœud
- **Sticky Sessions** pour WebSocket connections
- **Load Balancer** configuration (NGINX)
- **Horizontal scaling** architecture diagram

### 3. CDN & Compression Médias
- **Cloudflare/AWS CloudFront** integration
- **Sharp.js** pour resize images (thumbnails, previews)
- **WebP compression** (75% size reduction)
- **Media caching strategy** (1 year for versioned assets)

### 4. Monitoring & Alerting
- **Prometheus metrics** export
- **Grafana dashboards**:
  - WebSocket connections count
  - Message fan-out latency (p50, p95, p99)
  - Database query performance
  - Redis memory usage
  - CPU/Memory per node
- **Alert Rules**:
  - p95 latency > 300ms
  - Error rate > 1%
  - Memory > 80%
  - DB connection pool exhaustion

## 🏗️ Architecture Distribuée

### Avant (Single Node)
```
Client -> NestJS (WS) -> PostgreSQL
         \-> Redis
```

### Après (Multi-Node)
```
Clients -> Load Balancer (NGINX)
           |-- Node 1 (WS) ---|
           |-- Node 2 (WS) |---|-- Redis Pub/Sub --|-- PostgreSQL
           |-- Node 3 (WS) ---|                      |-- Elasticsearch (future)
                                                     |-- S3/CDN (media)
```

## 📊 Performance Targets

| Métrique | Target | Actual |
|----------|--------|--------|
| **WS Connections/Node** | 100k | TBD |
| **Message Fan-out p95** | < 250ms | TBD |
| **Message Delivery SLA** | 99.9% | TBD |
| **Memory/Connection** | < 10KB | TBD |
| **Throughput** | 100k msg/sec | TBD |

## 🚀 Implementation Steps

### Week 1: Load Testing & Baseline
1. Set up k6 testing framework
2. Create realistic load scenarios (100k WS, 10k msg/sec)
3. Measure current single-node performance
4. Generate baseline report

### Week 2: Scale-Out Architecture
1. Implement Redis Pub/Sub for broadcast
2. Configure sticky session load balancer
3. Add health checks & auto-recovery
4. Deploy multi-node cluster locally
5. Retest with cluster setup

### Week 3: Media Optimization & Monitoring
1. Integrate CDN (Cloudflare)
2. Implement image compression pipeline
3. Set up Prometheus + Grafana
4. Create alerting rules
5. Performance report with recommendations

## 📈 Expected Improvements

| Component | Before | After | Gain |
|-----------|--------|-------|------|
| **Throughput** | 10k msg/sec | 100k msg/sec | 10x |
| **Connections** | 10k/node | 100k/node | 10x |
| **Media Size** | 2.5MB avg | 500KB avg | 80% reduction |
| **Fan-out Latency** | p95 300ms | p95 250ms | 17% improvement |

## 🔐 Security Considerations
- E2E encryption remains in effect
- Media encrypted at rest (KMS)
- Rate limiting per user/device
- DDoS protection (Cloudflare)
- Connection auth tokens (JWT + device signature)

## ✅ DoD: Acceptance Criteria
- ✅ 100k WS connections sustained per node
- ✅ Message fan-out p95 < 250ms with 10 devices per user
- ✅ Memory usage stable under sustained load
- ✅ Zero message loss in failure scenarios
- ✅ Automated scaling triggers at 80% capacity
- ✅ Complete monitoring dashboard live
- ✅ Load test report with recommendations

## 📝 Notes
- All load tests use E2E encrypted data
- Testing environment mirrors production
- Gradual rollout strategy for multi-node deployment
- Fallback to single-node if cluster has issues
