# Runbook Incidents - Secure Messenger

**Version**: 1.0.0  
**Date**: 4 décembre 2025  
**Public**: Équipes On-Call & DevOps

---

## Table des Matières

1. [Procédure Générale](#procédure-générale)
2. [Incidents Critiques](#incidents-critiques)
3. [Incidents Majeurs](#incidents-majeurs)
4. [Incidents Mineurs](#incidents-mineurs)
5. [Post-Mortem](#post-mortem)

---

## Procédure Générale

### Classification des Incidents

| Sévérité | Impact | Exemples | SLA Response |
|----------|--------|----------|--------------|
| **P0 - Critical** | Service down, perte de données | Application inaccessible, DB corrompue | 15 min |
| **P1 - High** | Dégradation majeure | Latence élevée, fonctionnalité cassée | 1h |
| **P2 - Medium** | Dégradation mineure | Bugs UI, ralentissements | 4h |
| **P3 - Low** | Impact minimal | Logs errors, cosmétique | 24h |

### Workflow d'Incident

```
1. DÉTECTION
   ↓
2. ESCALADE (si nécessaire)
   ↓
3. INVESTIGATION
   ↓
4. MITIGATION (fix temporaire)
   ↓
5. RÉSOLUTION (fix permanent)
   ↓
6. POST-MORTEM
```

### Escalade

**Niveaux** :
- **L1** : Support (vérifications basiques)
- **L2** : DevOps/SRE (infrastructure, déploiements)
- **L3** : Engineering (bugs applicatifs, architecture)
- **Security** : Incidents de sécurité

**Contacts** :
```
L1 Support:    support@secure-messenger.app
L2 DevOps:     devops-oncall@secure-messenger.app (+33 X XX XX XX XX)
L3 Engineering: engineering@secure-messenger.app
Security:      security@secure-messenger.app (24/7 urgent)
```

### Outils

- **Alerting** : Prometheus Alertmanager, PagerDuty
- **Monitoring** : Grafana (https://grafana.secure-messenger.app)
- **Logs** : Kibana (https://kibana.secure-messenger.app)
- **Chat** : Slack (#incidents-war-room)
- **Status** : https://status.secure-messenger.app

---

## Incidents Critiques

### 🔴 P0-01: Application Down (Backend)

**Symptômes** :
- Alert : `ApplicationDown`
- Health check échoué : https://api.secure-messenger.app/health returns 5xx
- Utilisateurs rapportent "Cannot connect"

#### Investigation

**Étape 1** : Vérifier les pods

```bash
# Check pods status
kubectl get pods -n production -l component=backend

# Common states:
# - CrashLoopBackOff: App crashes au démarrage
# - ImagePullBackOff: Impossible de pull l'image Docker
# - Error: Erreur non spécifique
```

**Étape 2** : Consulter les logs

```bash
# Recent logs
kubectl logs deployment/backend -n production --tail=100

# Look for:
# - Database connection errors
# - Out of memory errors
# - Uncaught exceptions
# - Port binding errors
```

**Étape 3** : Vérifier les dépendances

```bash
# Database
kubectl exec -it postgres-0 -n production -- psql -c "SELECT 1"

# Redis
kubectl exec -it redis-0 -n production -- redis-cli ping

# S3
aws s3 ls s3://secure-messenger-media/ --region eu-west-1
```

#### Mitigation

**Scenario A : Pod crash (OOM, bug)** 

```bash
# Rollback au déploiement précédent
kubectl rollout undo deployment/backend -n production

# Vérifier
kubectl rollout status deployment/backend -n production
```

**Scenario B : Database down**

```bash
# Check DB status
kubectl get pods -l app=postgres -n production

# Si pod down, restart
kubectl delete pod postgres-0 -n production

# Si DB corrompue, restore depuis backup
./scripts/backup/restore.sh latest
```

**Scenario C : Blue/Green issue**

```bash
# Revenir à l'ancienne couleur
OLD_COLOR=$(kubectl get svc backend -n production -o jsonpath='{.spec.selector.color}')
NEW_COLOR=$([ "$OLD_COLOR" = "blue" ] && echo "green" || echo "blue")

kubectl patch svc backend -n production \
  -p "{\"spec\":{\"selector\":{\"color\":\"$NEW_COLOR\"}}}"
```

#### Communication

```
# Post sur status page
Title: Service Disruption - API Unavailable
Status: Investigating
Message: We are currently investigating connectivity issues 
         with our API. We'll provide updates every 15 minutes.
```

#### Résolution

Une fois mitigé, identifier la cause racine :
- Review code changes récents
- Analyze logs complets
- Check monitoring metrics pré-incident
- Créer bug ticket
- Planifier fix permanent

---

### 🔴 P0-02: Database Corruption

**Symptômes** :
- Errors: "relation does not exist"
- Data inconsistencies
- Queries échouent

#### Investigation

```bash
# Check DB health
psql $DATABASE_URL <<EOF
SELECT datname, pg_database_size(datname)/1024/1024 as size_mb
FROM pg_database;

-- Check for corruption
SELECT * FROM pg_stat_database_conflicts;
EOF
```

#### Mitigation

**URGENT : Basculer en read-only**

```bash
# Empêcher écritures
psql $DATABASE_URL -c "ALTER DATABASE securemessenger SET default_transaction_read_only = on;"

# Notifier utilisateurs
# "Service en mode lecture seule temporairement"
```

#### Résolution

```bash
# 1. Stop application
kubectl scale deployment/backend --replicas=0 -n production

# 2. Restore dernier backup sain
./scripts/backup/restore.sh <backup-avant-corruption>

# 3. Vérifier intégrité
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM messages;"

# 4. Run migrations si nécessaire
cd apps/backend && npx prisma migrate deploy

# 5. Restart application
kubectl scale deployment/backend --replicas=3 -n production

# 6. Vérifier
curl https://api.secure-messenger.app/health
```

**RTO Target** : 30 minutes maximum

---

### 🔴 P0-03: Security Breach

**Symptômes** :
- Alert : `SuspiciousActivity`
- Unauthorized access detected
- Data exfiltration suspected

#### Investigation

**IMMÉDIAT** :

```bash
# 1. Isoler le système
kubectl scale deployment/backend --replicas=0 -n production

# 2. Préserver les preuves
# - Snapshot des VMs
# - Dump logs complets
# - Copie base de données

kubectl exec postgres-0 -n production -- \
  pg_dumpall > /forensics/db-dump-$(date +%s).sql

kubectl logs deployment/backend -n production --since=24h \
  > /forensics/backend-logs-$(date +%s).log
```

#### Mitigation

```bash
# 1. Révoquer tous les tokens
psql $DATABASE_URL -c "DELETE FROM sessions;"
psql $DATABASE_URL -c "DELETE FROM refresh_tokens;"

# 2. Changer tous les secrets
# - Database passwords
# - JWT secrets
# - API keys
# - Encryption keys (rotation urgente)

# 3. Activer 2FA forcé pour tous
psql $DATABASE_URL -c "UPDATE users SET force_2fa = true;"

# 4. Notify users
# Email : "Security Incident - Action Required"
```

#### Communication

```
# Public statement
Title: Security Incident - Service Temporarily Unavailable
Status: Investigating

We have detected suspicious activity and have temporarily
taken our systems offline as a precaution while we investigate.

Your data security is our top priority. We will provide updates
every 30 minutes.

Recommended actions:
- Change your password immediately once service is restored
- Enable 2FA (we will enforce this)
- Review account activity

Contact: security@secure-messenger.app
```

#### Résolution

**Ne pas rush** : Mieux vaut prendre le temps de sécuriser correctement.

1. Investigation forensique complète
2. Identifier vecteur d'attaque
3. Patcher vulnérabilité
4. Security audit complet
5. Redéploiement from scratch si nécessaire
6. Communication transparente avec users

**Post-incident** :
- Rapport détaillé à la CNIL (si données personnelles exposées)
- Notification utilisateurs affectés
- Audit de sécurité externe
- Amélioration des contrôles

---

## Incidents Majeurs

### 🟠 P1-01: High Latency

**Symptômes** :
- Alert : `HighResponseTime`
- P95 latency > 1s
- Users report "slow"

#### Investigation

```bash
# 1. Check load
kubectl top pods -n production

# 2. Check database
psql $DATABASE_URL <<EOF
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
EOF

# 3. Check cache hit rate
kubectl exec redis-0 -n production -- redis-cli INFO stats | grep keyspace
```

#### Mitigation

**Quick wins** :

```bash
# Scale up if CPU/Memory high
kubectl scale deployment/backend --replicas=6 -n production

# Clear cache if stale
kubectl exec redis-0 -n production -- redis-cli FLUSHDB

# Kill slow queries
psql $DATABASE_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '30 seconds';"
```

#### Résolution

- Optimize slow queries (add indexes)
- Review recent code changes
- Increase resources if needed
- Implement better caching

---

### 🟠 P1-02: WebSocket Disconnections

**Symptômes** :
- Alert : `HighWebSocketDisconnectRate`
- Users report "Connection lost"
- Messages not delivered

#### Investigation

```bash
# Check WS connections
kubectl logs deployment/backend -n production | grep "websocket" | tail -100

# Common causes:
# - Load balancer timeout
# - Memory leaks
# - Network issues
# - Too many connections per pod
```

#### Mitigation

```bash
# Increase timeout (Nginx Ingress)
kubectl annotate ingress secure-messenger \
  nginx.ingress.kubernetes.io/proxy-read-timeout="3600" \
  -n production --overwrite

# Restart pods (rolling)
kubectl rollout restart deployment/backend -n production
```

---

## Incidents Mineurs

### 🟡 P2-01: Backup Failed

**Symptômes** :
- Alert : `BackupFailed`
- RPO at risk (> 5 min since last backup)

#### Investigation

```bash
# Check backup job logs
kubectl logs -l app=backup -n production --tail=50

# Common causes:
# - S3 credentials expired
# - Disk space full
# - Database locked
```

#### Mitigation

```bash
# Manual backup now
kubectl create job --from=cronjob/postgres-backup manual-backup-$(date +%s) -n production

# Verify
kubectl logs job/manual-backup-xxx -n production
```

---

### 🟡 P2-02: High Error Rate (Non-Critical)

**Symptômes** :
- Alert : `ErrorRateElevated`
- 1-5% error rate (non-bloquant)

#### Investigation

```bash
# Group errors by type
kubectl logs deployment/backend -n production | grep ERROR | \
  awk '{print $NF}' | sort | uniq -c | sort -rn
```

#### Mitigation

- If specific endpoint: disable temporarily
- If specific user: investigate abuse
- If 3rd party service down: implement fallback

---

## Post-Mortem

### Template

```markdown
# Post-Mortem: [Incident Title]

**Date**: YYYY-MM-DD
**Duration**: Xh Xmin
**Severity**: P0/P1/P2
**Impact**: Number of users affected, revenue lost, etc.

## Summary

Brief description of what happened.

## Timeline

| Time | Event |
|------|-------|
| 10:00 | Alert triggered |
| 10:05 | On-call engineer notified |
| 10:15 | Investigation started |
| 10:30 | Root cause identified |
| 10:45 | Mitigation deployed |
| 11:00 | Service restored |

## Root Cause

Detailed explanation of what caused the incident.

## Resolution

What was done to fix it.

## Impact

- Users affected: X
- Duration: X minutes
- Data lost: None/Some
- Revenue impact: $X

## Action Items

- [ ] Fix XYZ (Owner: @person, Due: YYYY-MM-DD)
- [ ] Improve monitoring for ABC (Owner: @person)
- [ ] Update runbook with learnings (Owner: @person)
- [ ] Add tests to prevent recurrence (Owner: @person)

## Lessons Learned

What went well:
- Quick detection
- Good communication

What could be improved:
- Faster rollback procedure
- Better monitoring alerts

## Follow-up

Next review: YYYY-MM-DD
```

### Process

1. **Draft** : Within 24h après résolution
2. **Review** : Team review meeting
3. **Blameless** : Focus sur le système, pas les personnes
4. **Action items** : Owners et deadlines
5. **Follow-up** : Track jusqu'à completion

---

## Annexes

### Quick Commands

```bash
# Emergency scale down
kubectl scale deployment/backend --replicas=0 -n production

# Force rollback
kubectl rollout undo deployment/backend -n production

# Emergency maintenance mode
kubectl apply -f k8s/maintenance-mode.yaml

# Check all alerts
curl -s http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.state=="firing")'

# Top resource consumers
kubectl top pods -n production --sort-by=memory
kubectl top pods -n production --sort-by=cpu
```

### War Room Checklist

- [ ] Incident logged in tracker
- [ ] Status page updated
- [ ] Stakeholders notified
- [ ] Investigation started
- [ ] Regular updates (every 15-30 min)
- [ ] Mitigation deployed
- [ ] Resolution confirmed
- [ ] Post-mortem scheduled

---

**Version** : 1.0.0  
**Dernière mise à jour** : 4 décembre 2025  
**Propriétaire** : DevOps Team
