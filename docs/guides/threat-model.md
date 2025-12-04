# Threat Model - Secure Messenger

**Version**: 1.0.0  
**Date**: 4 décembre 2025  
**Auteur**: Équipe Sécurité

## Table des matières

1. [Introduction](#introduction)
2. [Méthodologie](#méthodologie)
3. [Acteurs de menace](#acteurs-de-menace)
4. [Surfaces d'attaque](#surfaces-dattaque)
5. [Analyse STRIDE](#analyse-stride)
6. [Scénarios de menace](#scénarios-de-menace)
7. [Contre-mesures](#contre-mesures)
8. [Tests de sécurité](#tests-de-sécurité)
9. [Conformité](#conformité)
10. [Références](#références)

---

## Introduction

### Objectifs

Ce threat model identifie et analyse les menaces de sécurité pesant sur **Secure Messenger**, une application de messagerie sécurisée end-to-end. Il guide:

- **Développeurs**: Concevoir des features sécurisées
- **Ops/DevOps**: Déployer et monitorer avec vigilance
- **RSSI**: Valider la conformité et auditer
- **Product**: Prioriser les corrections de sécurité

### Périmètre

- **Applications**: Web, mobile (iOS/Android)
- **Backend**: API REST/WebSocket, base de données
- **Infrastructure**: Kubernetes, PostgreSQL, Redis, S3
- **Cryptographie**: E2EE (X3DH + Double Ratchet), TLS
- **Tiers**: CDN, monitoring, alerting

### Hypothèses

- Attaquant peut contrôler le réseau (MITM)
- Attaquant peut compromettre un device (malware, vol)
- Serveur est **trusted but curious** (honnête mais curieux)
- Backend peut être compromis (0-day, insider threat)

---

## Méthodologie

### STRIDE

Nous utilisons la méthodologie **STRIDE** de Microsoft pour classifier les menaces:

| Catégorie | Définition | Propriété violée |
|-----------|------------|------------------|
| **S**poofing | Usurpation d'identité | Authentification |
| **T**ampering | Altération de données | Intégrité |
| **R**epudiation | Répudiation d'actions | Non-répudiation |
| **I**nformation Disclosure | Divulgation d'informations | Confidentialité |
| **D**enial of Service | Déni de service | Disponibilité |
| **E**levation of Privilege | Élévation de privilèges | Autorisation |

### Processus

1. **Identifier les assets** (données, services, users)
2. **Mapper les surfaces d'attaque** (entrées/sorties)
3. **Lister les menaces** avec STRIDE
4. **Évaluer le risque** (probabilité × impact)
5. **Définir les contre-mesures** (mitigate, accept, transfer)
6. **Valider par des tests** (pentests, scans)

---

## Acteurs de menace

### Threat Actors

| Acteur | Motivation | Capacités | Cibles |
|--------|------------|-----------|--------|
| **Attaquant externe** | Curiosité, profit, déstabilisation | Scripts, exploits publics | Serveurs, CDN, DNS |
| **Attaquant avancé (APT)** | Espionnage, sabotage | 0-days, MITM, social engineering | Utilisateurs ciblés, crypto |
| **Insider malveillant** | Profit, vengeance | Accès admin, base de données | Données chiffrées, logs |
| **Malware sur device** | Vol de données | Keylogger, screenshots | Clés E2EE, conversations |
| **Service provider** | Surveillance, business | Accès infrastructure | Métadonnées, graphes sociaux |
| **Régulateur/Gouvernement** | Surveillance légale | Warrants, backdoors | Identités, communications |

### Risk Appetite

- **P0 (Critique)**: Compromission E2EE, vol de clés privées, perte de données
- **P1 (Majeur)**: Divulgation métadonnées, déni de service prolongé
- **P2 (Mineur)**: Fuites d'infos publiques, DoS temporaire
- **P3 (Info)**: Énumération d'utilisateurs, fingerprinting

---

## Surfaces d'attaque

### 1. Clients (Web/Mobile)

**Entrées**:
- Messages/médias reçus (chiffrés)
- Notifications push (FCM/APNS)
- WebSocket events
- Deep links / QR codes
- Fichiers importés

**Sorties**:
- API calls (REST/WebSocket)
- Logs locaux
- Stockage local (IndexedDB, Keychain)
- Partage avec autres apps

**Menaces**:
- XSS, CSRF (web)
- Malware, jailbreak (mobile)
- Vol de device
- Man-in-the-App (proxy SSL)

### 2. Backend (API)

**Entrées**:
- Requêtes HTTP/WebSocket
- Uploads de médias
- Webhooks (si présents)
- Commandes admin

**Sorties**:
- Réponses JSON
- Push notifications
- Logs (Grafana/Loki)
- Métriques (Prometheus)

**Menaces**:
- Injection SQL/NoSQL
- API abuse (rate limiting)
- Authentication bypass
- Escalation de privilèges

### 3. Infrastructure

**Composants**:
- Kubernetes (pods, secrets)
- PostgreSQL (données chiffrées)
- Redis (sessions, cache)
- S3 (médias chiffrés)
- CDN (assets publics)

**Menaces**:
- Compromission de secrets K8s
- Injection de conteneurs malveillants
- Accès non autorisé à la DB
- Fuite de backups

### 4. Réseau

**Protocoles**:
- TLS 1.3 (client ↔ backend)
- WebSocket over TLS
- gRPC (si microservices)

**Menaces**:
- MITM (attaque sur TLS)
- Certificate pinning bypass
- DNS spoofing/hijacking
- DDoS (L3/L4/L7)

---

## Analyse STRIDE

### Spoofing (Usurpation d'identité)

| ID | Menace | Impact | Probabilité | Risque | Contre-mesure |
|----|--------|--------|-------------|--------|---------------|
| S1 | Usurpation de compte utilisateur | Critique | Moyen | **P0** | MFA obligatoire, JWT courts (15 min) |
| S2 | Falsification de device ID | Majeur | Moyen | **P1** | Device attestation (SafetyNet/DeviceCheck) |
| S3 | Spoofing de serveur (phishing) | Critique | Faible | **P1** | Certificate pinning, domain validation |
| S4 | Replay d'ancien JWT | Majeur | Faible | **P2** | Nonce + timestamp, blacklist sur logout |

### Tampering (Altération de données)

| ID | Menace | Impact | Probabilité | Risque | Contre-mesure |
|----|--------|--------|-------------|--------|---------------|
| T1 | Modification de messages E2EE | Critique | Très faible | **P1** | MAC (HMAC-SHA256) dans Double Ratchet |
| T2 | Altération de métadonnées (sender, timestamp) | Majeur | Moyen | **P1** | Signature côté serveur, audit logs |
| T3 | Injection SQL dans API | Critique | Faible | **P1** | Prisma ORM (requêtes paramétrées) |
| T4 | Modification de code client (MITM) | Critique | Faible | **P1** | Certificate pinning, Subresource Integrity |

### Repudiation (Répudiation d'actions)

| ID | Menace | Impact | Probabilité | Risque | Contre-mesure |
|----|--------|--------|-------------|--------|---------------|
| R1 | Utilisateur nie avoir envoyé un message | Mineur | Élevé | **P2** | Signature E2EE (non-répudiation cryptographique) |
| R2 | Admin nie avoir supprimé un compte | Majeur | Faible | **P2** | Audit logs immuables, SIEM |
| R3 | Absence de preuves pour incident forensics | Majeur | Moyen | **P1** | Logs centralisés (Loki), retention 90j |

### Information Disclosure (Divulgation d'informations)

| ID | Menace | Impact | Probabilité | Risque | Contre-mesure |
|----|--------|--------|-------------|--------|---------------|
| I1 | Lecture de messages en clair | **Critique** | Très faible | **P0** | E2EE (X3DH + Double Ratchet), zero-knowledge server |
| I2 | Fuite de clés privées E2EE | **Critique** | Faible | **P0** | Keychain/Keystore, pas de backup plaintext |
| I3 | Divulgation de métadonnées (graphe social) | Majeur | Élevé | **P1** | Sealed sender, padding de trafic |
| I4 | Accès non autorisé à la DB | Critique | Faible | **P0** | Encryption at rest (AES-256), RBAC strict |
| I5 | Logs contiennent des données sensibles | Majeur | Moyen | **P1** | Scrubbing (PII removed), GDPR compliance |
| I6 | Énumération d'utilisateurs (by phone/email) | Mineur | Élevé | **P2** | Rate limiting, CAPTCHAs |

### Denial of Service (Déni de service)

| ID | Menace | Impact | Probabilité | Risque | Contre-mesure |
|----|--------|--------|-------------|--------|---------------|
| D1 | DDoS L7 (API flooding) | Majeur | Moyen | **P1** | Rate limiting (10-100 req/min), CDN WAF |
| D2 | WebSocket flooding (spam messages) | Majeur | Moyen | **P1** | Rate limiting (1 msg/sec), ban temporaire |
| D3 | Épuisement de la DB (requêtes lentes) | Critique | Faible | **P1** | Query timeout (5s), connection pooling |
| D4 | Remplissage de stockage (uploads massifs) | Majeur | Moyen | **P2** | Quotas (100 MB/user), cleanup automatique |

### Elevation of Privilege (Élévation de privilèges)

| ID | Menace | Impact | Probabilité | Risque | Contre-mesure |
|----|--------|--------|-------------|--------|---------------|
| E1 | User escalade vers admin | Critique | Faible | **P0** | RBAC strict, least privilege, audit logs |
| E2 | Accès à conversations d'autrui | Critique | Faible | **P0** | Validation ownership (userId === conversation.userId) |
| E3 | Injection de code dans backend | Critique | Très faible | **P1** | Input validation, CSP, sandboxing |
| E4 | Compromission de secrets K8s | Critique | Faible | **P0** | Secret encryption, rotation 90j, RBAC |

---

## Scénarios de menace

### Scénario 1: Compromission de device utilisateur

**Attaquant**: Malware/spyware sur smartphone

**Objectif**: Voler les clés E2EE et lire les conversations

**Vecteur d'attaque**:
1. User installe une app malveillante (trojan)
2. Malware obtient root/jailbreak
3. Accès au Keychain/Keystore → clés privées E2EE
4. Exfiltration des clés vers C2 server

**Impact**: 
- ⚠️ **Critique** (P0)
- Perte de confidentialité des messages passés et futurs
- Compromission de l'identité utilisateur

**Contre-mesures**:
- ✅ **Stockage sécurisé**: Keychain (iOS), Keystore (Android)
- ✅ **Device attestation**: SafetyNet/DeviceCheck (détecte root)
- ✅ **Perfect Forward Secrecy**: Rotation fréquente des clés de session
- ✅ **Alerts**: Détection de nouveau device → notification push
- 🔄 **Recommandations**:
  - Implémenter device fingerprinting (hardware-backed keys)
  - Exiger re-authentification pour actions sensibles
  - Wipe data on device compromise (remote wipe)

### Scénario 2: MITM sur le réseau

**Attaquant**: Réseau public compromis (café, aéroport)

**Objectif**: Intercepter le trafic et récupérer des tokens

**Vecteur d'attaque**:
1. User se connecte à un WiFi public malveillant
2. Attaquant effectue un MITM avec un faux certificat TLS
3. Si pas de certificate pinning → accepté par le client
4. Interception des JWT, messages chiffrés (inutiles sans clés)

**Impact**:
- ⚠️ **Majeur** (P1)
- Vol de JWT → usurpation temporaire (15 min)
- Métadonnées exposées (qui parle à qui, quand)
- Messages restent chiffrés E2EE (safe)

**Contre-mesures**:
- ✅ **Certificate pinning**: Seuls les certificats légitimes acceptés
- ✅ **TLS 1.3**: Forward secrecy, anti-downgrade
- ✅ **JWT courts**: 15 min (refresh token 7j dans HttpOnly cookie)
- ✅ **HSTS**: Force HTTPS, pas de fallback HTTP
- 🔄 **Recommandations**:
  - Monitorer les tentatives de certificate pinning failure
  - Alerter l'utilisateur si connexion suspecte

### Scénario 3: Compromission du backend

**Attaquant**: APT avec 0-day ou insider malveillant

**Objectif**: Accéder à la base de données et exfiltrer les données

**Vecteur d'attaque**:
1. Exploit d'une vulnérabilité backend (RCE)
2. Escalation vers PostgreSQL (credentials leakés)
3. Accès aux tables `users`, `messages`, `media`
4. Exfiltration de la DB (encrypted at rest)

**Impact**:
- ⚠️ **Critique** (P0)
- Métadonnées exposées (userIds, timestamps, relations)
- Messages chiffrés E2EE → inutilisables sans clés privées users
- Risque de déni de service (DB wiped)

**Contre-mesures**:
- ✅ **Encryption at rest**: AES-256-GCM (PostgreSQL)
- ✅ **Zero-knowledge server**: Pas de clés privées stockées
- ✅ **RBAC**: Accès DB limité aux pods backend
- ✅ **Audit logs**: Toutes les requêtes DB loggées
- ✅ **Intrusion Detection**: Falco (K8s), Wazuh (HIDS)
- 🔄 **Recommandations**:
  - Implémenter database firewall (règles strictes)
  - Segmentation réseau (backend ≠ DB)
  - Regular pentests + bug bounty

### Scénario 4: Social engineering (phishing)

**Attaquant**: Phisher avec domaine similaire (secure-messanger.com)

**Objectif**: Voler les credentials utilisateur

**Vecteur d'attaque**:
1. Email/SMS de phishing avec lien vers faux site
2. User entre email + password
3. Attaquant récupère les credentials
4. Connexion au vrai service → MFA requis
5. Attaquant demande code MFA via faux formulaire

**Impact**:
- ⚠️ **Majeur** (P1)
- Compromission de compte si MFA bypassé
- Accès aux conversations, contacts, groupes

**Contre-mesures**:
- ✅ **MFA obligatoire**: TOTP (RFC 6238)
- ✅ **FIDO2/WebAuthn**: Résistant au phishing (challenge cryptographique)
- ✅ **Email verification**: Alerte sur nouvelle connexion
- ✅ **Education**: Avertissements dans l'app
- 🔄 **Recommandations**:
  - Enregistrer le domaine officiel (HSTS preload)
  - Détecter les tentatives de login suspectes (IP, geolocation)

### Scénario 5: DDoS sur l'infrastructure

**Attaquant**: Botnet (Mirai, etc.)

**Objectif**: Rendre l'application indisponible

**Vecteur d'attaque**:
1. DDoS L3/L4 (UDP flood, SYN flood)
2. DDoS L7 (HTTP GET flood sur `/api/messages`)
3. Saturation du backend, DB, WebSocket

**Impact**:
- ⚠️ **Majeur** (P1)
- Indisponibilité temporaire (< 1h cible)
- Perte de revenus, mécontentement utilisateurs

**Contre-mesures**:
- ✅ **CDN WAF**: Cloudflare, Fastly (anti-DDoS L7)
- ✅ **Rate limiting**: 10-100 req/min/user
- ✅ **Auto-scaling**: HPA (CPU > 70% → +2 pods)
- ✅ **Circuit breaker**: Fallback graceful si DB surchargée
- 🔄 **Recommandations**:
  - Contracter un service anti-DDoS dédié (Cloudflare Magic Transit)
  - Tester la résilience (chaos engineering, load tests)

---

## Contre-mesures

### Défense en profondeur (Defense in Depth)

| Couche | Contrôles de sécurité |
|--------|----------------------|
| **1. Utilisateur** | Education, MFA, device security |
| **2. Application** | Input validation, output encoding, E2EE |
| **3. API** | Authentication (JWT), authorization (RBAC), rate limiting |
| **4. Backend** | Least privilege, secrets management, audit logs |
| **5. Base de données** | Encryption at rest, parameterized queries, backups |
| **6. Infrastructure** | Network segmentation, firewalls, IDS/IPS |
| **7. Physique** | Data centers sécurisés (cloud provider) |

### Matrice de conformité

| Menace | Implémenté | Testé | Documenté | Référence |
|--------|------------|-------|-----------|-----------|
| E2EE (I1) | ✅ | ✅ | ✅ | `docs/security/encryption.md` |
| Certificate pinning (S3) | ✅ | ✅ | ✅ | `docs/security/certificate-pinning.md` |
| MFA (S1) | ✅ | ✅ | ✅ | `apps/backend/src/auth/` |
| Rate limiting (D1) | ✅ | ✅ | ✅ | `apps/backend/src/common/guards/throttle.guard.ts` |
| Encryption at rest (I4) | ✅ | ✅ | ✅ | `k8s/base/postgres-secret.yaml` |
| Audit logs (R3) | ✅ | ✅ | ✅ | `apps/backend/src/common/interceptors/logging.interceptor.ts` |
| Device attestation (S2) | ⏳ | ❌ | ❌ | **TODO Phase 14** |
| FIDO2/WebAuthn (S1) | ⏳ | ❌ | ❌ | **TODO Phase 14** |

---

## Tests de sécurité

### 1. Static Application Security Testing (SAST)

**Outils**:
- **CodeQL** (GitHub Advanced Security): Analyse du code source
- **Semgrep**: Détection de patterns dangereux
- **npm audit** / **yarn audit**: Vulnérabilités dependencies

**Fréquence**: À chaque commit (CI/CD)

**Résultats attendus**: 0 vulnérabilités High/Critical

### 2. Dynamic Application Security Testing (DAST)

**Outils**:
- **OWASP ZAP**: Scan automatisé du frontend/backend
- **Burp Suite**: Tests manuels (injection, XSS, CSRF)
- **Nuclei**: Templates de tests pour vulns connues

**Fréquence**: Hebdomadaire (staging), avant chaque release (prod)

**Checklist**:
- [ ] Injection (SQL, NoSQL, command)
- [ ] XSS (reflected, stored, DOM-based)
- [ ] CSRF (tokens validés)
- [ ] Authentication bypass
- [ ] Broken access control

### 3. Penetration Testing

**Scope**:
- **Web app**: Next.js frontend, API backend
- **Mobile apps**: iOS/Android APK/IPA
- **Infrastructure**: Kubernetes, PostgreSQL

**Méthodologie**: OWASP WSTG (Web Security Testing Guide)

**Fréquence**: Trimestrielle (Q1, Q2, Q3, Q4)

**Livrables**:
- Rapport de pentest avec CVSS scores
- Plan de remédiation (P0 → 7j, P1 → 30j)
- Retest après corrections

### 4. Cryptographic Review

**Scope**:
- Implémentation X3DH + Double Ratchet
- Gestion des clés (génération, stockage, rotation)
- TLS configuration (ciphers, protocols)

**Méthodologie**: Audit par un cryptographe externe

**Fréquence**: Annuelle

**Checklist**:
- [ ] Randomness (CSPRNGs)
- [ ] Key derivation (HKDF)
- [ ] Perfect Forward Secrecy
- [ ] Post-Compromise Security
- [ ] Resistance aux timing attacks

### 5. Bug Bounty Program

**Plateforme**: HackerOne / BugCrowd

**Rewards**:
- **Critical**: $5,000 - $10,000 (E2EE compromise, RCE)
- **High**: $2,000 - $5,000 (Authentication bypass, data leak)
- **Medium**: $500 - $2,000 (XSS, CSRF, DoS)
- **Low**: $100 - $500 (Info disclosure, enum)

**Scope in**: Web, mobile, API, infrastructure (staging)

**Scope out**: Social engineering, physical attacks, third-party services

---

## Conformité

### Réglementations

| Réglementation | Exigences | Statut | Référence |
|----------------|-----------|--------|-----------|
| **GDPR** | Consentement, droit à l'oubli, portabilité | ✅ | `docs/security/compliance.md` |
| **eIDAS** | Signature électronique, identification | ⏳ | TODO (si UE) |
| **HIPAA** | Encryption, audit logs | ✅ | Si santé (optionnel) |
| **SOC 2 Type II** | Security controls audit | ⏳ | TODO (croissance) |

### Certifications

- **ISO 27001**: Management de la sécurité de l'information
- **ISO 27017**: Cloud security
- **CSA STAR**: Cloud Security Alliance

---

## Références

### Standards

- **OWASP Top 10 (2021)**: https://owasp.org/Top10/
- **OWASP Mobile Top 10**: https://owasp.org/www-project-mobile-top-10/
- **CWE Top 25**: https://cwe.mitre.org/top25/
- **NIST Cybersecurity Framework**: https://www.nist.gov/cyberframework

### Cryptographie

- **Signal Protocol**: https://signal.org/docs/
- **X3DH**: https://signal.org/docs/specifications/x3dh/
- **Double Ratchet**: https://signal.org/docs/specifications/doubleratchet/
- **RFC 7748**: Curve25519 (Ed25519)

### Documentation interne

- `docs/security/encryption.md` - Architecture E2EE
- `docs/security/certificate-pinning.md` - Implémentation pinning
- `docs/security/compliance.md` - GDPR, HIPAA
- `docs/guides/incident-runbook.md` - Response aux incidents
- `docs/phase12-devops.md` - Infrastructure security

---

## Changelog

| Version | Date | Auteur | Changements |
|---------|------|--------|-------------|
| 1.0.0 | 2025-12-04 | Équipe Sécurité | Création initiale |

---

**Note**: Ce threat model est un document vivant, mis à jour à chaque nouvelle feature ou incident de sécurité. Toute modification doit être revue par le RSSI.
