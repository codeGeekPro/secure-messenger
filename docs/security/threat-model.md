# Modèle de Menaces - Secure Messenger

## Objectifs de sécurité

### CIA Triad
- **Confidentialité :** Seuls expéditeur et destinataire peuvent lire les messages
- **Intégrité :** Messages non modifiables en transit ou au repos
- **Disponibilité :** Service accessible 99.9% du temps (SLO)

### Propriétés supplémentaires
- **Forward Secrecy :** Compromission clé présente n'expose pas messages passés
- **Future Secrecy :** Compromission clé présente n'expose pas messages futurs (ratcheting)
- **Deniability :** Expéditeur peut nier avoir envoyé un message (pas de signature vérifiable par tiers)
- **Anonymat réseau :** Métadonnées minimales (difficile à atteindre sans Tor/Mixnets)

## Acteurs de menace

### T1 : Attaquant passif réseau
- **Capacités :** Écoute trafic (MITM passif), logs FAI/ISP
- **Objectifs :** Lire contenu messages, métadonnées (qui parle à qui)
- **Probabilité :** Élevée (surveillance masse)
- **Impact :** Critique (vie privée)

### T2 : Attaquant actif réseau
- **Capacités :** MITM actif, modification paquets, replay attacks
- **Objectifs :** Injecter messages, usurper identité, DoS
- **Probabilité :** Moyenne (attaques ciblées, Wi-Fi publics)
- **Impact :** Élevé (intégrité, disponibilité)

### T3 : Compromission serveur
- **Capacités :** Accès base de données, logs, snapshots
- **Objectifs :** Exfiltration données, surveillance, backdoor
- **Probabilité :** Faible (avec bonnes pratiques DevSecOps)
- **Impact :** Critique (si E2E absent), Faible (avec E2E)

### T4 : Malware client
- **Capacités :** Keylogger, screenshot, accès mémoire, root/jailbreak
- **Objectifs :** Lire messages déchiffrés, voler clés privées
- **Probabilité :** Moyenne (phishing, spyware)
- **Impact :** Critique (device compromis = game over)

### T5 : Insider malveillant
- **Capacités :** Accès admin infra, code source, logs
- **Objectifs :** Backdoor, exfiltration, sabotage
- **Probabilité :** Faible (avec contrôles RH/techniques)
- **Impact :** Critique

### T6 : Réquisitions légales
- **Capacités :** Ordres judiciaires, subpoenas
- **Objectifs :** Accès données utilisateurs ciblés
- **Probabilité :** Variable (selon juridiction)
- **Impact :** Moyen (limité aux métadonnées si E2E)

## Analyse des menaces (STRIDE)

### Spoofing (Usurpation d'identité)
| Menace | Vecteur | Mitigation |
|--------|---------|------------|
| Usurpation user | Vol session token JWT | Expiration courte (15 min), refresh tokens, 2FA, device fingerprinting |
| Usurpation device | Vol identity key | Stockage sécurisé (Keychain iOS, Keystore Android), biométrie |
| Phishing | Faux domaine, fake app | Certificate pinning, app signatures, éducation users |

### Tampering (Modification)
| Menace | Vecteur | Mitigation |
|--------|---------|------------|
| Modification messages en transit | MITM | TLS 1.3, AEAD (ChaCha20-Poly1305), authentication tags |
| Modification DB serveur | Compromission RDS | E2E encryption (serveur voit seulement ciphertext), checksums |
| Modification code client | Malware, repackaging | Code signing, Integrity checks, Google Play Protect / Apple App Review |

### Repudiation (Répudiation)
| Menace | Vecteur | Mitigation |
|--------|---------|------------|
| Utilisateur nie avoir envoyé | Pas de signature persistante | Feature, pas bug (deniability) ; logs serveur pour audit interne uniquement |
| Serveur nie avoir reçu | Pas de receipts | Signed receipts (timestamp authority si besoin légal) |

### Information Disclosure (Divulgation)
| Menace | Vecteur | Mitigation |
|--------|---------|------------|
| Lecture messages | Compromission serveur | **E2E encryption**, aucun message en clair côté serveur |
| Métadonnées (qui parle à qui) | Logs serveur, traffic analysis | Minimisation logs, retention limitée (30j), eventual Mixnets |
| Backups non chiffrés | Snapshots RDS/S3 | Encryption at rest (AWS KMS), LUKS pour disques |

### Denial of Service (Déni de service)
| Menace | Vecteur | Mitigation |
|--------|---------|------------|
| Flood messages | Bot, spam | Rate limiting (20 msg/min), CAPTCHA, coût computationnel (PoW léger) |
| DDoS réseau | Botnets | CloudFlare / AWS Shield, auto-scaling, blacklisting IPs |
| Épuisement ressources DB | Requêtes coûteuses | Query timeouts, indexation, caching, throttling |

### Elevation of Privilege (Élévation de privilèges)
| Menace | Vecteur | Mitigation |
|--------|---------|------------|
| Escalade admin groupe | Exploitation bugs | Tests permissions rigoureux, RBAC granulaire, audit logs |
| Root device | Jailbreak/root | Détection (SafetyNet, jailbreak detection), warning users |
| Injection SQL/NoSQL | Input malveillant | Parameterized queries (Prisma), validation Zod, principe du moindre privilège |

## Contre-mesures par composant

### 1. Client (Mobile / Web)

#### Stockage clés privées
- **iOS :** Keychain avec `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- **Android :** Keystore avec hardware-backed keys (TEE/SE)
- **Web :** IndexedDB chiffré (WebCrypto), prompt utilisateur pour mot de passe maître

#### Chiffrement E2E
- **Protocole :** Signal Protocol (Double Ratchet + X3DH)
- **Primitives :** Curve25519 (ECDH), XChaCha20-Poly1305 (AEAD), HMAC-SHA256
- **Bibliothèque :** libsodium (audité, open-source)

#### Protection mémoire
- Zeroing buffers après usage (`sodium_memzero`)
- Pas de logs contenant clés ou messages déchiffrés
- Obfuscation code (ProGuard, R8) contre reverse engineering basique

#### Certificate pinning
- Public keys des serveurs hard-codés dans l'app
- Backup pins (rotation sans update app)
- Fallback vers validation CA standard si pinning échoue (avec alerte)

### 2. Backend

#### Authentification
- **JWT :** RS256, expiration 15 min, issuer vérifié
- **Refresh tokens :** Stockés dans Redis avec rotation, révocables
- **2FA :** TOTP (RFC 6238), backup codes
- **Device binding :** Fingerprint (IP, User-Agent, TLS fingerprint)

#### Rate limiting
```typescript
// Exemple : Sliding window avec Redis
const rateLimiter = new RateLimiter({
  points: 20, // Nombre de messages
  duration: 60, // Par minute
  blockDuration: 300, // Ban 5 min si dépassé
  keyPrefix: 'rate_limit:msg'
});
```

#### Secrets management
- Variables sensibles dans AWS Secrets Manager / Vault
- Rotation automatique tous les 90 jours
- Accès via IAM roles (pas de credentials hard-codés)

#### Logs sécurisés
- **Pas de PII :** Jamais de contenu messages, tokens, clés
- **Champs loggés :** User ID hashé, timestamps, endpoints, erreurs
- **Retention :** 30 jours (compliance RGPD)
- **Encryption :** Logs chiffrés au repos (CloudWatch Logs KMS)

### 3. Infrastructure

#### Réseau
- **TLS 1.3 obligatoire :** Forward secrecy (ECDHE)
- **HSTS :** Header Strict-Transport-Security avec preload
- **CSP :** Content-Security-Policy strict (no inline scripts)
- **Security headers :** X-Frame-Options, X-Content-Type-Options

#### Bases de données
- **Encryption at rest :** RDS avec KMS, clés rotées
- **Encryption in transit :** TLS entre app et RDS
- **Principe du moindre privilège :** App user ne peut pas DROP tables
- **Backups chiffrés :** S3 avec SSE-KMS, cross-region replication

#### Containers / K8s
- **Images scannées :** Trivy, Snyk (vulnérabilités CVE)
- **Non-root containers :** USER directive dans Dockerfile
- **Network policies :** Pod-to-pod communication restreinte
- **Secrets :** Sealed Secrets ou External Secrets Operator

### 4. DevSecOps

#### SAST (Static Analysis)
- **Outils :** CodeQL, Semgrep, ESLint security plugins
- **Frequency :** Chaque commit (GitHub Actions)
- **Blocage :** High/Critical vulnérabilités bloquent merge

#### SCA (Software Composition Analysis)
- **Outils :** Dependabot, Snyk, OWASP Dependency-Check
- **Alertes :** Vulnérabilités dans dépendances (npm, pip)
- **Auto-fix :** PR automatiques pour patches mineurs

#### DAST (Dynamic Analysis)
- **Outils :** OWASP ZAP, Burp Suite
- **Cibles :** Environnements staging
- **Tests :** Injection SQL, XSS, CSRF, auth bypass

#### Secrets scanning
- **Outils :** Trufflehog, Gitleaks
- **Pre-commit hooks :** Bloque commit si secret détecté
- **GitHub :** Secret scanning activé

#### Penetration testing
- **Fréquence :** Annuel (externe), trimestriel (interne)
- **Scope :** E2E crypto, auth, API, infra
- **Bug bounty :** Programme HackerOne (post-GA)

## Plan de réponse aux incidents

### Détection
- **Alertes :** Anomalies (Prometheus rules, Datadog monitors)
- **SIEM :** Logs agrégés, corrélation d'événements
- **Honeypots :** Fake endpoints pour détecter scans

### Réponse
1. **Containment :** Isolation des systèmes compromis
2. **Éradication :** Patch vulnérabilités, rotation secrets
3. **Recovery :** Restauration depuis backups sains
4. **Post-mortem :** Analyse root cause, amélioration continue

### Communication
- **Interne :** On-call via PagerDuty, escalation CTO
- **Externe :** Notification users si données sensibles exposées (RGPD, 72h)
- **Transparence :** Blog post public (post-résolution)

## Conformité

### RGPD
- **Privacy by Design :** E2E par défaut, minimisation données
- **Droits users :** Export, suppression, rectification (API self-service)
- **DPO :** Data Protection Officer désigné
- **DPIA :** Data Protection Impact Assessment pour features sensibles

### CCPA / CPRA
- **Do Not Sell :** Pas de vente données (business model non-pub)
- **Opt-out :** Analytics désactivables

### ISO 27001
- **Politique sécurité :** Documentée, approuvée direction
- **Audits :** Annuels (certif externe)

---
**Document owner :** CISO  
**Dernière révision :** 3 décembre 2025  
**Statut :** Draft → Revue sécurité
