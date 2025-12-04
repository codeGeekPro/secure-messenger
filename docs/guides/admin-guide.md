# Guide Administrateur - Secure Messenger

**Version**: 1.0.0  
**Date**: 4 décembre 2025  
**Public**: Administrateurs système et DevOps

---

## Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Installation & Déploiement](#installation--déploiement)
3. [Configuration](#configuration)
4. [Monitoring & Observabilité](#monitoring--observabilité)
5. [Backup & Restauration](#backup--restauration)
6. [Gestion des Utilisateurs](#gestion-des-utilisateurs)
7. [Modération](#modération)
8. [Sécurité](#sécurité)
9. [Performance & Scaling](#performance--scaling)
10. [Maintenance](#maintenance)
11. [Troubleshooting](#troubleshooting)

---

## Vue d'ensemble

### Architecture Système

```
┌─────────────────────────────────────────────────────┐
│                     Internet                        │
└─────────────────┬───────────────────────────────────┘
                  │
         ┌────────▼────────┐
         │   Load Balancer │
         │    (Nginx)      │
         └────────┬────────┘
                  │
      ┌───────────┴───────────┐
      │                       │
┌─────▼─────┐           ┌─────▼─────┐
│  Web App  │           │  Backend  │
│ (Next.js) │◄─────────►│ (NestJS)  │
└───────────┘           └─────┬─────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        ┌─────▼─────┐   ┌─────▼─────┐  ┌─────▼─────┐
        │PostgreSQL │   │   Redis   │  │   S3      │
        │  (Data)   │   │  (Cache)  │  │ (Médias)  │
        └───────────┘   └───────────┘  └───────────┘
```

### Composants Principaux

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| **Frontend Web** | Next.js 14 | Interface utilisateur web |
| **Mobile App** | React Native (Expo) | Applications iOS/Android |
| **Backend API** | NestJS + TypeScript | API REST + WebSocket |
| **Base de données** | PostgreSQL 16 | Stockage relationnel |
| **Cache** | Redis 7 | Sessions, pub/sub, cache |
| **Stockage** | S3 (AWS/MinIO) | Médias chiffrés |
| **Monitoring** | Prometheus + Grafana | Métriques et alertes |
| **Orchestration** | Kubernetes | Déploiement et scaling |

### Prérequis

**Infrastructure minimale** :
- 2 vCPUs, 4 GB RAM (dev/staging)
- 4 vCPUs, 8 GB RAM (production)
- 50 GB SSD minimum
- Bande passante : 100 Mbps

**Logiciels requis** :
- Docker 24+ et Docker Compose
- Kubernetes 1.28+ (production)
- PostgreSQL 16
- Redis 7
- Node.js 20+
- pnpm 8+

---

## Installation & Déploiement

### Déploiement Local (Dev)

#### 1. Cloner le Repository

```bash
git clone https://github.com/codeGeekPro/secure-messenger.git
cd secure-messenger
```

#### 2. Configuration Environnement

```bash
# Copier les fichiers d'exemple
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env

# Générer les secrets
openssl rand -hex 32  # JWT_SECRET
openssl rand -hex 32  # ENCRYPTION_KEY
```

#### 3. Démarrer les Services

```bash
# Infrastructure (PostgreSQL, Redis)
docker-compose up -d postgres redis

# Installer les dépendances
pnpm install

# Migrations de base de données
cd apps/backend
pnpm prisma migrate deploy
pnpm prisma db seed

# Démarrer les applications
pnpm dev
```

**URLs** :
- Frontend : http://localhost:3000
- Backend API : http://localhost:3001
- API Docs : http://localhost:3001/api/docs

### Déploiement Kubernetes (Production)

#### 1. Préparer le Cluster

```bash
# Créer le namespace
kubectl create namespace production

# Installer Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml

# Installer cert-manager (TLS)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

#### 2. Configurer les Secrets

```bash
# Secrets applicatifs
kubectl create secret generic app-secrets \
  --from-literal=database-url="postgresql://user:pass@postgres:5432/db" \
  --from-literal=redis-url="redis://redis:6379" \
  --from-literal=jwt-secret="$(openssl rand -hex 32)" \
  --from-literal=s3-access-key="YOUR_S3_KEY" \
  --from-literal=s3-secret-key="YOUR_S3_SECRET" \
  -n production

# Secrets de backup
kubectl create secret generic backup-secrets \
  --from-file=backup-encryption-key=<(openssl rand -hex 32) \
  -n production

# Secrets Grafana
kubectl create secret generic grafana-secrets \
  --from-literal=admin-user=admin \
  --from-literal=admin-password="$(openssl rand -base64 16)" \
  -n production
```

#### 3. Déployer l'Application

```bash
# Appliquer les manifests
kubectl apply -k k8s/overlays/production

# Vérifier le déploiement
kubectl get pods -n production
kubectl get svc -n production
kubectl get ingress -n production

# Attendre que tout soit prêt
kubectl wait --for=condition=available --timeout=5m \
  deployment/backend deployment/web -n production
```

#### 4. Configurer le DNS

Pointez vos domaines vers l'IP du Load Balancer :

```bash
# Récupérer l'IP externe
kubectl get svc -n ingress-nginx ingress-nginx-controller

# Créer les enregistrements DNS
secure-messenger.app        A    <EXTERNAL_IP>
api.secure-messenger.app    A    <EXTERNAL_IP>
*.secure-messenger.app      A    <EXTERNAL_IP>
```

### Déploiement avec CI/CD

#### GitHub Actions (Automatique)

**Workflow Staging** (branche `develop`) :
- Déclench automatiquement sur push
- Build, test, deploy vers staging
- URL : https://staging.secure-messenger.app

**Workflow Production** (manuel) :
```bash
# Déclencher un déploiement
gh workflow run deploy-production.yml -f version=v1.2.3

# Suivre le déploiement
gh run watch
```

**Blue/Green Deployment** :
- Déploiement sur couleur inactive (blue ou green)
- Tests de santé complets
- Switch du trafic instantané
- Rollback automatique en cas d'erreur

---

## Configuration

### Variables d'Environnement

#### Backend (`apps/backend/.env`)

```bash
# Base de données
DATABASE_URL="postgresql://user:pass@localhost:5432/securemessenger"
DATABASE_POOL_SIZE=20

# Redis
REDIS_URL="redis://localhost:6379"
REDIS_TTL=3600

# JWT
JWT_SECRET="your-256-bit-secret-key"
JWT_EXPIRATION="7d"
JWT_REFRESH_EXPIRATION="30d"

# S3/Stockage
S3_ENDPOINT="https://s3.amazonaws.com"
S3_BUCKET="secure-messenger-media"
S3_ACCESS_KEY="YOUR_ACCESS_KEY"
S3_SECRET_KEY="YOUR_SECRET_KEY"
S3_REGION="eu-west-1"

# WebSocket
WEBSOCKET_PORT=3001
WEBSOCKET_PATH="/ws"

# Limits
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100
MAX_FILE_SIZE=52428800  # 50 MB

# Encryption
MEDIA_ENCRYPTION_ALGORITHM="AES-256-GCM"

# Monitoring
PROMETHEUS_ENABLED=true
PROMETHEUS_PORT=9090
```

#### Frontend (`apps/web/.env`)

```bash
# API
NEXT_PUBLIC_API_URL="https://api.secure-messenger.app"
NEXT_PUBLIC_WS_URL="wss://api.secure-messenger.app"

# Features
NEXT_PUBLIC_ENABLE_GROUPS=true
NEXT_PUBLIC_ENABLE_CALLS=true
NEXT_PUBLIC_MAX_FILE_SIZE=52428800

# Analytics (optionnel)
NEXT_PUBLIC_ANALYTICS_ID=""

# Sentry (monitoring erreurs)
NEXT_PUBLIC_SENTRY_DSN=""
```

### Configuration PostgreSQL

#### Optimisations Performances

```sql
-- postgresql.conf

# Connexions
max_connections = 200
shared_buffers = 2GB

# Performance
effective_cache_size = 6GB
work_mem = 50MB
maintenance_work_mem = 512MB

# WAL (Write-Ahead Logging)
wal_level = replica
max_wal_size = 2GB
min_wal_size = 1GB

# Replication
archive_mode = on
archive_command = 'cp %p /var/lib/postgresql/wal_archive/%f'

# Checkpoints
checkpoint_timeout = 10min
checkpoint_completion_target = 0.9
```

#### Sauvegardes WAL (RPO ≤ 5 min)

```bash
# Activer l'archivage WAL
ALTER SYSTEM SET archive_mode = 'on';
ALTER SYSTEM SET archive_command = 'test ! -f /wal_archive/%f && cp %p /wal_archive/%f';

# Redémarrer PostgreSQL
pg_ctl restart
```

### Configuration Redis

```bash
# redis.conf

# Mémoire
maxmemory 1gb
maxmemory-policy allkeys-lru

# Persistence (optionnel pour cache)
save 900 1
save 300 10
save 60 10000

# Réplication (si nécessaire)
# replicaof <master-ip> 6379

# Sécurité
requirepass your-strong-redis-password
```

### Configuration Nginx (Reverse Proxy)

```nginx
# /etc/nginx/sites-available/secure-messenger

upstream backend {
    least_conn;
    server backend-1:3001;
    server backend-2:3001;
    server backend-3:3001;
}

upstream web {
    least_conn;
    server web-1:3000;
    server web-2:3000;
}

server {
    listen 443 ssl http2;
    server_name secure-messenger.app;

    ssl_certificate /etc/letsencrypt/live/secure-messenger.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/secure-messenger.app/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 50M;

    location / {
        proxy_pass http://web;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name api.secure-messenger.app;

    ssl_certificate /etc/letsencrypt/live/secure-messenger.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/secure-messenger.app/privkey.pem;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    location /metrics {
        deny all;
        return 403;
    }
}
```

---

## Monitoring & Observabilité

### Prometheus

#### Accès

```bash
# Port-forward (dev)
kubectl port-forward -n monitoring svc/prometheus 9090:9090

# Production
https://prometheus.secure-messenger.app
```

#### Métriques Clés

**Application** :
- `http_requests_total` : Nombre total de requêtes
- `http_request_duration_seconds` : Latence des requêtes
- `websocket_connections_active` : Connexions WebSocket actives
- `messages_sent_total` : Messages envoyés
- `messages_encrypted_total` : Messages chiffrés

**Infrastructure** :
- `process_cpu_seconds_total` : Utilisation CPU
- `process_resident_memory_bytes` : Utilisation mémoire
- `pg_stat_database_numbackends` : Connexions DB
- `redis_commands_processed_total` : Commandes Redis

#### Requêtes PromQL Utiles

```promql
# Taux de requêtes par seconde
rate(http_requests_total[5m])

# Taux d'erreur (%)
sum(rate(http_requests_total{status=~"5.."}[5m])) /
sum(rate(http_requests_total[5m])) * 100

# Latence P95
histogram_quantile(0.95,
  rate(http_request_duration_seconds_bucket[5m]))

# Connexions WebSocket
sum(websocket_connections_active)

# Utilisation CPU (%)
rate(process_cpu_seconds_total[5m]) * 100
```

### Grafana

#### Accès

```bash
# Credentials par défaut (à changer!)
Username: admin
Password: <voir secret K8s>

# URL
https://grafana.secure-messenger.app
```

#### Dashboards Principaux

**1. Application Overview**
- Request rate & error rate
- Response time (P50, P95, P99)
- WebSocket connections
- Messages per second
- CPU & Memory usage

**2. RTO/RPO Monitoring**
- Last successful backup
- Backup duration
- RPO status (≤ 5 min)
- Application uptime
- Recovery time estimate

**3. Infrastructure**
- Node metrics
- Pod status
- Database connections
- Cache hit rate
- Disk usage

#### Alertes Configurées

| Alerte | Condition | Sévérité | Action |
|--------|-----------|----------|--------|
| HighErrorRate | Taux erreur > 5% pendant 5min | Critical | Page on-call |
| ApplicationDown | Service down pendant 2min | Critical | Page on-call |
| HighResponseTime | P95 > 1s pendant 10min | Warning | Investigate |
| BackupFailed | Pas de backup depuis 10min | Critical | Page on-call |
| DiskSpaceLow | < 10% d'espace disque | Warning | Cleanup needed |

### Logs

#### Centralisation des Logs

**Stack ELK (Elasticsearch, Logstash, Kibana)** :

```bash
# Déployer ELK stack
kubectl apply -f k8s/logging/

# Accéder à Kibana
kubectl port-forward -n logging svc/kibana 5601:5601
```

**Requêtes Kibana Utiles** :

```
# Erreurs dans les 15 dernières minutes
level:error AND @timestamp:[now-15m TO now]

# Requêtes lentes (> 1s)
duration:>1000 AND path:/api/*

# Authentification échouée
message:"Authentication failed"

# Tentatives de connexion suspectes
ip:* AND failed_attempts:>5
```

#### Logs des Conteneurs

```bash
# Logs backend
kubectl logs -f deployment/backend -n production

# Logs avec filtrage
kubectl logs deployment/backend -n production | grep ERROR

# Logs de tous les pods d'un deployment
kubectl logs -l component=backend -n production --tail=100

# Logs d'un pod spécifique
kubectl logs backend-abc123-xyz -n production --since=1h
```

---

## Backup & Restauration

### Backups Automatisés

#### Configuration

Les backups sont automatisés via CronJob Kubernetes :

```bash
# Vérifier le CronJob
kubectl get cronjob -n production

# Voir l'historique des jobs
kubectl get jobs -n production -l app=backup

# Logs du dernier backup
kubectl logs -l app=backup -n production --tail=100
```

#### Fréquence et Rétention

- **Fréquence** : Toutes les 5 minutes (RPO ≤ 5 min)
- **Rétention locale** : 7 jours
- **Rétention S3** : 30 jours
- **Archivage long terme** : S3 Glacier (1 an)

#### Vérifier les Backups

```bash
# Lister les backups S3
aws s3 ls s3://secure-messenger-backups/database/

# Dernier backup
aws s3 cp s3://secure-messenger-backups/latest.json - | jq

# Vérifier l'intégrité
./scripts/backup/test-backup.sh
```

### Restauration Manuelle

#### Procédure Complète

**Étape 1 : Préparer la restauration**

```bash
# 1. Arrêter l'application
kubectl scale deployment/backend --replicas=0 -n production
kubectl scale deployment/web --replicas=0 -n production

# 2. Faire un backup de sécurité
./scripts/backup/backup.sh
```

**Étape 2 : Restaurer**

```bash
# Option A : Restaurer le dernier backup
export DATABASE_URL="postgresql://..."
export S3_BUCKET="s3://secure-messenger-backups"
export ENCRYPTION_KEY="/path/to/key"
./scripts/backup/restore.sh latest

# Option B : Restaurer un backup spécifique
./scripts/backup/restore.sh secure-messenger_20241204_120000.sql.gz.gpg
```

**Étape 3 : Vérifier et redémarrer**

```bash
# Vérifier l'intégrité
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM messages;"

# Migrations
cd apps/backend && pnpm prisma migrate deploy

# Redémarrer l'application
kubectl scale deployment/backend --replicas=3 -n production
kubectl scale deployment/web --replicas=2 -n production

# Vérifier la santé
kubectl get pods -n production
curl https://api.secure-messenger.app/health
```

#### Temps de Restauration (RTO)

| Taille DB | Temps Estimé | RTO Target |
|-----------|--------------|------------|
| < 1 GB | 5-10 min | ✅ |
| 1-10 GB | 15-25 min | ✅ |
| 10-50 GB | 25-40 min | ⚠️ |
| > 50 GB | 40-60 min | ❌ |

**Optimisations pour gros volumes** :
- Utiliser pg_restore avec `--jobs=4` (parallélisation)
- Restaurer sur SSD NVMe
- Augmenter `maintenance_work_mem`

### Disaster Recovery

#### Scénario : Perte Complète du Cluster

**Recovery Time : 20-30 minutes**

```bash
# 1. Provisionner nouveau cluster K8s
# (via Terraform, Ansible, ou manuellement)

# 2. Installer composants essentiels
kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f k8s/base/rbac.yaml

# 3. Créer les secrets
kubectl create secret generic app-secrets --from-env-file=secrets.env

# 4. Déployer infrastructure
kubectl apply -f k8s/base/postgres-deployment.yaml
kubectl apply -f k8s/base/redis-deployment.yaml

# 5. Restaurer la base de données
./scripts/backup/restore.sh latest

# 6. Déployer l'application
kubectl apply -k k8s/overlays/production

# 7. Update DNS (si IP différente)
# Pointer domaines vers nouvelle IP

# 8. Vérifier tout fonctionne
./scripts/health-check.sh
```

---

## Gestion des Utilisateurs

### Interface Admin

**Accès** : https://admin.secure-messenger.app

**Credentials** :
```bash
# Créer un compte admin
cd apps/backend
pnpm exec ts-node scripts/create-admin.ts \
  --email admin@secure-messenger.app \
  --password SecureP@ssw0rd! \
  --role ADMIN
```

### Opérations Utilisateurs

#### Rechercher un Utilisateur

```bash
# Via CLI
psql $DATABASE_URL <<EOF
SELECT id, email, name, created_at, last_active_at
FROM users
WHERE email = 'user@example.com';
EOF

# Via API
curl -X GET https://api.secure-messenger.app/admin/users/search?q=user@example.com \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

#### Suspendre un Compte

```sql
-- Suspendre
UPDATE users SET status = 'SUSPENDED', suspended_at = NOW()
WHERE email = 'spam@example.com';

-- Réactiver
UPDATE users SET status = 'ACTIVE', suspended_at = NULL
WHERE email = 'spam@example.com';
```

#### Supprimer un Compte (RGPD)

```bash
# Script de suppression GDPR
cd apps/backend
pnpm exec ts-node scripts/delete-user-gdpr.ts \
  --user-id abc123 \
  --reason "User request" \
  --confirm
```

**Ce qui est supprimé** :
- ✅ Données utilisateur (profil, email)
- ✅ Messages (remplacés par "Message supprimé")
- ✅ Médias (fichiers S3 supprimés)
- ✅ Clés de chiffrement
- ✅ Sessions et tokens
- ❌ Logs d'audit (conservés 90 jours)

#### Réinitialiser MDP (Support)

```bash
# Générer lien de réinitialisation
curl -X POST https://api.secure-messenger.app/admin/users/reset-password \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'

# Response contient le lien temporaire (valide 1h)
```

### Statistiques Utilisateurs

```sql
-- Utilisateurs actifs (7 derniers jours)
SELECT COUNT(*) as active_users
FROM users
WHERE last_active_at > NOW() - INTERVAL '7 days';

-- Nouveaux utilisateurs (aujourd'hui)
SELECT COUNT(*) as new_users_today
FROM users
WHERE created_at::date = CURRENT_DATE;

-- Top 10 utilisateurs (nb messages)
SELECT u.email, COUNT(m.id) as message_count
FROM users u
JOIN messages m ON m.sender_id = u.id
GROUP BY u.id
ORDER BY message_count DESC
LIMIT 10;

-- Utilisation stockage par utilisateur
SELECT u.email, SUM(mf.size) / 1024 / 1024 as size_mb
FROM users u
JOIN media_files mf ON mf.user_id = u.id
GROUP BY u.id
ORDER BY size_mb DESC
LIMIT 20;
```

---

## Modération

### Signalements

#### Voir les Signalements

```sql
SELECT 
  r.id,
  r.reason,
  r.created_at,
  u_reporter.email as reporter,
  u_reported.email as reported_user,
  r.status
FROM reports r
JOIN users u_reporter ON r.reporter_id = u_reporter.id
JOIN users u_reported ON r.reported_user_id = u_reported.id
WHERE r.status = 'PENDING'
ORDER BY r.created_at DESC;
```

#### Traiter un Signalement

**Workflow** :
1. Examiner le contenu signalé
2. Décider de l'action :
   - Warning (avertissement)
   - Temporary suspension (7-30 jours)
   - Permanent ban
   - No action (signalement injustifié)
3. Notifier l'utilisateur
4. Logger la décision

```bash
# Via API Admin
curl -X POST https://api.secure-messenger.app/admin/reports/123/resolve \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{
    "action": "TEMPORARY_SUSPENSION",
    "duration_days": 7,
    "reason": "Spam messages violating ToS",
    "notify_user": true
  }'
```

### Détection Automatique

#### Spam Detection

```typescript
// Règles anti-spam automatiques

// 1. Rate limiting agressif
- > 50 messages / minute → warning
- > 100 messages / minute → temporary block (1h)

// 2. Contenu dupliqué
- Même message à > 10 destinataires → flag for review

// 3. Nouveaux comptes
- Compte < 24h + > 20 messages → flag for review

// 4. Patterns suspects
- URLs raccourcies
- Mots-clés de phishing
- Schémas de spam connus
```

#### Surveillance Proactive

```bash
# Dashboard modération
https://admin.secure-messenger.app/moderation

# Métriques à surveiller
- Pics inhabituels de signalements
- Nouveaux comptes avec activité élevée
- Messages groupés identiques
- Tentatives de bypass de bans
```

### Actions Modération

#### Avertissement (Warning)

```bash
# Envoyer avertissement
curl -X POST https://api.secure-messenger.app/admin/users/warn \
  -d '{"user_id": "abc123", "reason": "Violation of ToS section 3.2"}'
```

#### Suspension Temporaire

```sql
UPDATE users
SET status = 'SUSPENDED',
    suspended_until = NOW() + INTERVAL '7 days',
    suspension_reason = 'Repeated spam'
WHERE id = 'user-id';
```

#### Ban Permanent

```sql
UPDATE users
SET status = 'BANNED',
    banned_at = NOW(),
    ban_reason = 'Harassment and threats'
WHERE id = 'user-id';

-- Bloquer aussi l'IP
INSERT INTO banned_ips (ip_address, reason)
VALUES ('1.2.3.4', 'Associated with banned user');
```

---

## Sécurité

### Audits de Sécurité

#### Logs d'Audit

```sql
-- Voir tous les événements de sécurité
SELECT *
FROM audit_logs
WHERE event_type IN ('LOGIN_FAILED', 'SUSPICIOUS_ACTIVITY', 'KEY_CHANGE')
ORDER BY created_at DESC
LIMIT 100;

-- Tentatives de connexion échouées par IP
SELECT ip_address, COUNT(*) as attempts
FROM audit_logs
WHERE event_type = 'LOGIN_FAILED'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY ip_address
HAVING COUNT(*) > 5
ORDER BY attempts DESC;
```

#### Scan de Vulnérabilités

```bash
# Scan des dépendances
pnpm audit
npm audit fix

# Scan des images Docker
trivy image ghcr.io/codegeekpro/secure-messenger/backend:latest

# Scan du code
# (intégré dans CI/CD)
```

### Gestion des Secrets

#### Rotation des Secrets

**JWT Secret** (tous les 90 jours) :

```bash
# 1. Générer nouveau secret
NEW_SECRET=$(openssl rand -hex 32)

# 2. Update K8s secret avec les deux (ancien + nouveau)
kubectl create secret generic app-secrets-new \
  --from-literal=jwt-secret="$NEW_SECRET" \
  --from-literal=jwt-secret-old="$OLD_SECRET" \
  -n production --dry-run=client -o yaml | kubectl apply -f -

# 3. Redéployer avec double validation (accepte ancien + nouveau)
kubectl rollout restart deployment/backend -n production

# 4. Après 24h, retirer l'ancien secret
kubectl create secret generic app-secrets \
  --from-literal=jwt-secret="$NEW_SECRET" \
  -n production --dry-run=client -o yaml | kubectl apply -f -
```

**Database Password** :

```bash
# 1. Créer nouveau user avec nouveau password
psql -c "CREATE USER securemsg_new WITH PASSWORD 'new-password';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE securemessenger TO securemsg_new;"

# 2. Update connection string
# 3. Redéployer
# 4. Supprimer ancien user après validation
psql -c "DROP USER securemsg_old;"
```

### Certificats TLS

#### Renouvellement Automatique

cert-manager gère le renouvellement auto Let's Encrypt.

**Vérifier expiration** :

```bash
# Via kubectl
kubectl get certificate -n production

# Manuellement
openssl s_client -connect secure-messenger.app:443 -servername secure-messenger.app \
  </dev/null 2>/dev/null | openssl x509 -noout -dates
```

#### Renouvellement Manuel

```bash
# Forcer renouvellement
kubectl annotate certificate secure-messenger-tls \
  cert-manager.io/issue-temporary-certificate="true" \
  -n production

# Vérifier
kubectl describe certificate secure-messenger-tls -n production
```

### Rate Limiting

**Configuration actuelle** :

```typescript
// apps/backend/src/common/guards/throttle.guard.ts

@ThrottlerGuard({
  // API générale
  default: {
    ttl: 60,      // 60 secondes
    limit: 100,   // 100 requêtes
  },
  
  // Authentification (plus strict)
  auth: {
    ttl: 60,
    limit: 10,
  },
  
  // Upload médias
  media: {
    ttl: 60,
    limit: 20,
  },
  
  // Messages
  messages: {
    ttl: 60,
    limit: 100,
  }
})
```

**Ajuster les limites** :

```bash
# Via environnement
export RATE_LIMIT_TTL=60
export RATE_LIMIT_MAX=200

# Redéployer
kubectl set env deployment/backend \
  RATE_LIMIT_MAX=200 \
  -n production
```

---

## Performance & Scaling

### Horizontal Scaling

#### Auto-scaling (HPA)

Configuré pour scaler automatiquement selon CPU/Memory :

```yaml
# Backend: 3-10 replicas
minReplicas: 3
maxReplicas: 10
metrics:
- CPU: 70%
- Memory: 80%

# Web: 2-6 replicas
minReplicas: 2
maxReplicas: 6
```

**Forcer un scaling manuel** :

```bash
# Scale up
kubectl scale deployment/backend --replicas=5 -n production

# Vérifier
kubectl get hpa -n production
kubectl top pods -n production
```

### Optimisations Base de Données

#### Indexes

```sql
-- Vérifier les tables sans indexes
SELECT schemaname, tablename, attname
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND tablename NOT IN (
    SELECT tablename FROM pg_indexes WHERE schemaname = 'public'
  );

-- Créer indexes manquants
CREATE INDEX CONCURRENTLY idx_messages_conversation
  ON messages(conversation_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_users_last_active
  ON users(last_active_at) WHERE status = 'ACTIVE';
```

#### Query Performance

```sql
-- Top 10 requêtes lentes
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Analyser une requête
EXPLAIN ANALYZE
SELECT * FROM messages WHERE conversation_id = 'xxx';
```

#### Connection Pooling

```bash
# PgBouncer pour pooling efficace
kubectl apply -f k8s/base/pgbouncer-deployment.yaml

# Configuration
[databases]
securemessenger = host=postgres port=5432 dbname=securemessenger

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
```

### Caching Strategy

#### Redis Cache

```typescript
// Stratégie de cache

// 1. User profiles (1h)
cache.set(`user:${userId}`, userData, 3600);

// 2. Conversation metadata (5 min)
cache.set(`conv:${convId}:meta`, metadata, 300);

// 3. Recent messages (1 min)
cache.set(`conv:${convId}:recent`, messages, 60);

// 4. Online status (30s)
cache.set(`user:${userId}:online`, true, 30);
```

**Monitoring du cache** :

```bash
# Redis CLI
kubectl exec -it redis-0 -n production -- redis-cli

# Stats
INFO stats

# Hit rate
INFO stats | grep keyspace_hits
INFO stats | grep keyspace_misses

# Memory usage
INFO memory
```

### CDN pour Médias

**Configuration CloudFront/CloudFlare** :

```bash
# 1. Créer distribution CDN
- Origin: s3://secure-messenger-media
- Cache Policy: CachingOptimized
- Origin Access Identity: Restricted

# 2. Update backend config
S3_CDN_URL="https://cdn.secure-messenger.app"

# 3. Médias servis via CDN
https://cdn.secure-messenger.app/media/{file-id}
```

---

## Maintenance

### Mises à Jour

#### Update de l'Application

```bash
# 1. Tester en staging
gh workflow run deploy-staging.yml

# 2. Valider staging
curl https://staging.secure-messenger.app/health

# 3. Déployer en production (blue/green)
gh workflow run deploy-production.yml -f version=v1.3.0

# 4. Surveiller
kubectl get pods -n production -w
```

#### Update de PostgreSQL

```bash
# 1. Backup complet
./scripts/backup/backup.sh

# 2. Créer instance PostgreSQL 16 → 17
# 3. Dump/Restore
pg_dumpall | psql -h new-postgres

# 4. Update connection strings
# 5. Switch traffic
# 6. Valider
# 7. Supprimer ancienne instance
```

#### Update de Kubernetes

```bash
# Plan de upgrade
kubectl version

# Upgrade control plane (via cloud provider)
# Puis upgrade nodes un par un

# Drain node
kubectl drain node-1 --ignore-daemonsets --delete-emptydir-data

# Upgrade node
# ...

# Uncordon
kubectl uncordon node-1

# Vérifier
kubectl get nodes
```

### Nettoyage

#### Anciens Médias

```bash
# Lister médias > 90 jours non référencés
psql $DATABASE_URL <<EOF
SELECT mf.s3_key, mf.size, mf.created_at
FROM media_files mf
LEFT JOIN messages m ON m.media_id = mf.id
WHERE mf.created_at < NOW() - INTERVAL '90 days'
  AND m.id IS NULL;
EOF

# Supprimer (avec confirmation)
./scripts/cleanup-old-media.sh --days 90 --dry-run
./scripts/cleanup-old-media.sh --days 90 --confirm
```

#### Logs Anciens

```bash
# Rotation automatique (logrotate)
/var/log/secure-messenger/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 root root
}

# Nettoyage manuel
find /var/log/secure-messenger -name "*.log" -mtime +30 -delete
```

#### Base de Données

```sql
-- Vacuum
VACUUM ANALYZE;

-- Reindex
REINDEX DATABASE securemessenger;

-- Cleanup deleted users (après 90 jours)
DELETE FROM users
WHERE status = 'DELETED'
  AND deleted_at < NOW() - INTERVAL '90 days';
```

---

## Troubleshooting

### Problèmes Courants

#### Application ne démarre pas

**Symptômes** : Pods en CrashLoopBackOff

```bash
# 1. Vérifier logs
kubectl logs backend-xxx -n production

# 2. Vérifier événements
kubectl describe pod backend-xxx -n production

# Causes communes :
# - DB connexion échouée → vérifier DATABASE_URL
# - Secrets manquants → vérifier kubectl get secrets
# - Migrations failed → exécuter manuellement
```

**Solution** :

```bash
# Exécuter migrations
kubectl exec -it backend-xxx -n production -- \
  npx prisma migrate deploy

# Redémarrer
kubectl rollout restart deployment/backend -n production
```

#### Performance Dégradée

**Symptômes** : Latence élevée, timeouts

```bash
# 1. Vérifier métriques
kubectl top pods -n production

# 2. Vérifier HPA
kubectl get hpa -n production

# 3. Vérifier DB
psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity;"
```

**Solutions** :
- Scale up si CPU/Memory élevés
- Vérifier slow queries
- Vérifier cache Redis (hit rate)
- Vérifier network (latency DB)

#### Websocket Déconnexions

**Symptômes** : Clients déconnectés fréquemment

```bash
# Vérifier logs
kubectl logs -l component=backend -n production | grep "websocket"

# Causes :
# - Load balancer timeout → augmenter timeout
# - Network instable → activer reconnection
# - Memory leak → vérifier memory usage
```

**Solution** :

```nginx
# Nginx config
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
```

#### Backup Échoue

**Symptômes** : Alert `BackupFailed`

```bash
# Vérifier logs job
kubectl logs -l app=backup -n production

# Causes :
# - S3 credentials → vérifier secret
# - Disk space → vérifier df -h
# - DB locked → vérifier locks
```

**Solution** :

```bash
# Ré-exécuter backup
kubectl create job --from=cronjob/postgres-backup manual-backup-$(date +%s)

# Vérifier réussite
kubectl logs job/manual-backup-xxx
```

### Commandes de Diagnostic

```bash
# Health check complet
./scripts/health-check.sh

# Vérifier connectivité DB
kubectl run pg-test --rm -it --image=postgres:16 -- \
  psql $DATABASE_URL -c "SELECT 1"

# Vérifier Redis
kubectl exec -it redis-0 -- redis-cli ping

# Test S3
aws s3 ls s3://secure-messenger-media/ --region eu-west-1

# Vérifier DNS
nslookup secure-messenger.app
dig secure-messenger.app

# Test ingress
curl -I https://secure-messenger.app
curl -I https://api.secure-messenger.app/health
```

---

## Annexes

### Checklist Déploiement Production

- [ ] DNS configuré et propagé
- [ ] Certificats TLS valides
- [ ] Secrets K8s créés
- [ ] Base de données initialisée
- [ ] Migrations appliquées
- [ ] Backup automatique fonctionnel
- [ ] Monitoring déployé (Prometheus + Grafana)
- [ ] Alertes configurées
- [ ] Load testing effectué
- [ ] Disaster recovery testé
- [ ] Documentation à jour
- [ ] Équipe formée

### Contacts Escalade

| Niveau | Équipe | Contact | Disponibilité |
|--------|--------|---------|---------------|
| L1 | Support | support@secure-messenger.app | 24/7 |
| L2 | DevOps | devops@secure-messenger.app | 24/7 on-call |
| L3 | Engineering | engineering@secure-messenger.app | Business hours |
| Security | InfoSec | security@secure-messenger.app | 24/7 urgent |

### Ressources

- **Documentation** : https://docs.secure-messenger.app
- **Status Page** : https://status.secure-messenger.app
- **Runbooks** : https://docs.secure-messenger.app/runbooks
- **API Docs** : https://api.secure-messenger.app/docs

---

**Version** : 1.0.0  
**Dernière mise à jour** : 4 décembre 2025  
**Prochaine révision** : 4 janvier 2026
