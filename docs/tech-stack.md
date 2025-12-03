# Choix Technologiques - Secure Messenger

## Critères de sélection
1. **Maturité :** Écosystème robuste, communauté active
2. **Performance :** Latence faible, haute concurrence
3. **Sécurité :** Bibliothèques auditées, bonnes pratiques
4. **Scalabilité :** Horizontal scaling, cloud-native
5. **Maintenabilité :** Typage statique, tests, documentation
6. **Coûts :** Open-source ou pricing raisonnable

## Stack retenue

### Backend

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| **Runtime** | Node.js 20 LTS | Performance async I/O, écosystème riche, V8 optimisé |
| **Framework** | NestJS + TypeScript | Architecture modulaire, DI, génération OpenAPI, typage fort |
| **API** | REST + WebSocket | REST pour CRUD, WS pour temps réel (Socket.IO fallback) |
| **ORM** | Prisma | Type-safe, migrations versionnées, excellent DX |
| **Validation** | Zod | Schéma runtime avec inférence TypeScript |
| **Base de données** | PostgreSQL 16 | ACID, JSON support, extensions (pg_trgm pour recherche) |
| **Cache** | Redis 7 | Pub/Sub, rate limit, sessions, presence |
| **Recherche** | OpenSearch 2.x | Full-text, filtres, plus économique qu'Elastic |
| **Stockage médias** | MinIO / S3 | S3-compatible, chiffrement côté client, presigned URLs |
| **Files d'attente** | Redis Streams (MVP) → Kafka (scale) | Streaming persistant, fanout, scalabilité |

**Alternatives considérées :**
- Go (Fiber) : Performance brute mais écosystème moins mature pour crypto E2E
- Python (FastAPI) : Excellent DX mais moins performant pour WS à haute concurrence
- Java (Spring Boot) : Verbeux, cold start plus lent

### Temps réel & Appels

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| **WebSocket** | uWebSockets.js | Performance extrême (C++), backpressure natif |
| **Signaling** | Socket.IO (fallback) | Reconnexion automatique, multi-transport |
| **WebRTC** | mediasoup / LiveKit | SFU performant, support multi-codecs (VP8, H.264, Opus) |
| **TURN/STUN** | Coturn | Open-source, NAT traversal |

### Frontend Web

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| **Framework** | React 18 | Hooks, Concurrent, écosystème mature |
| **Build tool** | Vite | HMR ultra-rapide, ESM natif |
| **Langage** | TypeScript 5 | Type safety, refactoring sûr |
| **État global** | Zustand | Minimal, performant, pas de boilerplate |
| **Requêtes API** | TanStack Query v5 | Cache, retry, mutations, optimistic updates |
| **WebSocket** | Socket.IO client | Sync avec backend |
| **UI** | Tailwind CSS + Headless UI | Utility-first, a11y, responsive |
| **Formulaires** | React Hook Form + Zod | Performance, validation côté client |
| **E2E Crypto** | libsodium.js | Wasm, Signal Protocol (Double Ratchet + X3DH) |

**Alternatives considérées :**
- Vue 3 : Excellente réactivité mais écosystème crypto moins fourni
- Svelte : Bundle size minimal mais moins de libs E2E

### Mobile

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| **Framework** | React Native (Expo) | Code sharing avec Web (70%+), OTA updates |
| **Langage** | TypeScript | Cohérence avec backend/web |
| **Navigation** | React Navigation v6 | Standard RN, native perf |
| **État** | Zustand | Même lib que Web |
| **E2E Crypto** | react-native-libsodium | Binding natif optimisé |
| **Push** | Expo Notifications | Abstraction FCM/APNs |
| **Stockage local** | react-native-mmkv | Performance, encryption at rest |
| **WebRTC** | react-native-webrtc | Support complet audio/vidéo |

**Alternatives considérées :**
- Flutter : Performance native mais pas de code sharing avec Web/backend
- Native (Swift/Kotlin) : Performance ultime mais coûts dev 2x

### Sécurité

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| **Chiffrement E2E** | libsodium (NaCl) | Audité, facile d'usage, X25519 + XChaCha20-Poly1305 |
| **Protocole** | Signal Protocol (Double Ratchet + X3DH) | Standard industrie (WhatsApp, Signal) |
| **TLS** | TLS 1.3 | Forward secrecy, AEAD |
| **Certificats** | Let's Encrypt + cert-manager | Automatisation, gratuit |
| **Secrets** | AWS Secrets Manager / Vault | Rotation, audit |
| **SAST** | CodeQL, Semgrep | Détection vulnérabilités |
| **SCA** | Dependabot, Snyk | Scan dépendances |

### DevOps & Infrastructure

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| **Cloud** | AWS (multi-région) | Maturité, services managés (RDS, ElastiCache, S3) |
| **IaC** | Terraform | Multi-cloud, state management |
| **Orchestration** | Kubernetes (EKS) | Scaling horizontal, self-healing |
| **CI/CD** | GitHub Actions | Intégré, runners auto-scalés |
| **GitOps** | ArgoCD | Sync déclaratif, rollback facile |
| **Containers** | Docker + BuildKit | Cache layers, multi-stage builds |
| **Registre** | ECR | Intégré AWS, scan vulnérabilités |
| **Monitoring** | Prometheus + Grafana | Métriques, alertes, dashboards |
| **Logs** | Loki + Promtail | Lightweight, intégré Grafana |
| **Traces** | Tempo + OpenTelemetry | Tracing distribué, corrélation logs |
| **Alerting** | Alertmanager + PagerDuty | On-call, escalation |

### Observabilité

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| **APM** | OpenTelemetry | Standard, vendor-neutral, auto-instrumentation |
| **Métriques** | Prometheus | Pull model, PromQL puissant |
| **Dashboards** | Grafana | Visualisation riche, plugins |
| **Logs structurés** | Pino (Node.js) | JSON, performance, correlation IDs |
| **Uptime** | UptimeRobot / Pingdom | Monitoring externe, SLA |
| **Crash reporting** | Sentry | Stack traces, breadcrumbs, release tracking |

### Bases de données

| Usage | Technologie | Justification |
|-------|-------------|---------------|
| **Primaire** | PostgreSQL 16 (RDS Multi-AZ) | Transactions ACID, JSON, extensions |
| **Cache** | Redis 7 (ElastiCache) | Pub/Sub, TTL, data structures |
| **Recherche** | OpenSearch (managed) | Full-text, aggregations |
| **Backup** | AWS Backup + pg_dump | PITR, cross-region |

### Tests

| Type | Outil | Justification |
|------|-------|---------------|
| **Unit** | Jest + ts-jest | Fast, mocking, coverage |
| **Integration** | Supertest + Testcontainers | Tests API + DB réels |
| **E2E** | Playwright | Multi-browser, mobile emulation, retry |
| **Load** | k6 | Scripting JS, métriques détaillées |
| **Chaos** | Chaos Mesh (K8s) | Injection pannes, latence |
| **Security** | OWASP ZAP | DAST automatisé |

## Architecture des dépôts

### Monorepo
**Outil :** Turborepo ou Nx

**Structure :**
```
secure-messenger/
├── apps/
│   ├── backend/           # NestJS API + WS
│   ├── web/              # React Web
│   ├── mobile/           # React Native (Expo)
│   └── docs/             # Docusaurus
├── packages/
│   ├── types/            # Types partagés TypeScript
│   ├── crypto/           # Lib E2E (isomorphe)
│   ├── ui/               # Composants UI partagés
│   └── config/           # ESLint, Prettier, TS configs
├── tools/
│   └── scripts/          # Migrations, seed
└── infrastructure/       # Terraform, K8s manifests
```

**Avantages :**
- Partage de code (types, crypto, UI)
- Build incrémental
- Tests atomiques
- Versions coordonnées

## Justifications des choix clés

### Pourquoi Node.js et pas Go/Rust ?
- **Écosystème crypto :** libsodium bindings matures, Signal Protocol JS
- **Partage de code :** Types et validation partagés avec frontend
- **Productivité :** Équipe plus large, recrutement facile
- **Performance :** Suffisante avec uWS pour 100k connexions/nœud

### Pourquoi React Native et pas Flutter ?
- **Partage de code :** 70% code partagé avec Web (hooks, logique métier)
- **Écosystème :** Plus de libs crypto natives (libsodium, WebRTC)
- **Maturité :** Apps production critiques (Discord, Shopify, MS Teams)

### Pourquoi PostgreSQL et pas MongoDB ?
- **ACID :** Garanties transactionnelles (envoi message + mise à jour compteurs)
- **Schéma :** Relations claires (users, conversations, messages)
- **JSON :** Support natif pour métadonnées flexibles
- **Recherche :** Extensions pg_trgm pour fuzzy search

### Pourquoi OpenSearch et pas Elasticsearch ?
- **Coûts :** Open-source sans restrictions (fork AWS d'Elastic)
- **Features :** Équivalent pour use case full-text
- **Gestion :** AWS OpenSearch Service managé

### Pourquoi libsodium et pas OpenSSL ?
- **Simplicité :** API high-level, less footguns
- **Performance :** Optimisations SIMD
- **Audit :** Largement audité, base de NaCl
- **Portabilité :** Wasm pour Web, natif pour mobile

## Coûts estimés (AWS)

| Service | Configuration | Coût mensuel (USD) |
|---------|---------------|-------------------|
| **RDS PostgreSQL** | db.r6g.xlarge Multi-AZ | ~$500 |
| **ElastiCache Redis** | cache.r6g.large (2 nœuds) | ~$250 |
| **OpenSearch** | r6g.large.search (2 nœuds) | ~$300 |
| **EKS cluster** | Control plane + 6 nœuds m6g.xlarge | ~$600 |
| **S3** | 50 TB stockage + transfert | ~$1,200 |
| **CloudFront CDN** | 10 TB transfert | ~$850 |
| **Backup** | Snapshots RDS + S3 | ~$100 |
| **Monitoring** | Grafana Cloud / Datadog | ~$200 |
| **Secrets Manager** | 50 secrets | ~$25 |
| **Route53 + ACM** | DNS + certs | ~$10 |
| **Total infrastructure** | | **~$4,035/mois** |
| **Coût par MAU** | 1M MAU | **~$0.004/MAU** |

**Notes :**
- Coûts dev/staging à ajouter (~30% prod)
- Réductions possibles : Reserved Instances (-40%), Spot Instances pour workers
- Scaling : Linéaire jusqu'à 5M MAU, puis économies d'échelle

## Alternatives économiques (Bootstrap)

Pour lancement avec budget limité :
- **Cloud :** Hetzner Cloud (~1/3 prix AWS)
- **DB :** PostgreSQL auto-managé (Patroni HA)
- **Cache :** Redis auto-managé (Sentinel)
- **Monitoring :** Prometheus/Grafana auto-hébergé
- **CDN :** Cloudflare Free/Pro

**Coût estimé :** ~$500-800/mois (10k-50k MAU)

## Migration future

Si croissance forte :
- **Sharding DB :** Citus ou Vitess
- **Kafka :** Remplacement Redis Streams
- **Multi-région :** Active-active (CRDT pour conflits)
- **Edge computing :** Cloudflare Workers pour API gateway

---
**Document owner :** Tech Lead  
**Dernière révision :** 3 décembre 2025  
**Statut :** Validé
