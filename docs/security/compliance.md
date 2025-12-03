# Conformité RGPD & Privacy - Secure Messenger

## Principes fondamentaux

### Privacy by Design & Default

L'application respecte les **7 principes fondamentaux** de Privacy by Design :

1. **Proactif, pas réactif :** Sécurité dès la conception
2. **Privacy par défaut :** Chiffrement E2E activé automatiquement
3. **Privacy intégré :** Pas de module séparé, c'est le cœur du système
4. **Fonctionnalité complète :** Sécurité sans sacrifier UX
5. **Sécurité bout-en-bout :** Du client au serveur
6. **Visibilité et transparence :** Politique claire, code ouvert (audit)
7. **Respect utilisateur :** Contrôle total sur ses données

## Données personnelles collectées

### Minimisation des données

Nous collectons **uniquement ce qui est strictement nécessaire** :

| Donnée | But | Base légale | Retention |
|--------|-----|-------------|-----------|
| **Téléphone ou email** | Authentification, récupération compte | Exécution contrat | Durée du compte |
| **Nom d'affichage** | Identification dans conversations | Exécution contrat | Durée du compte |
| **Photo de profil** | Personnalisation | Consentement | Jusqu'à suppression |
| **Messages (chiffrés)** | Délivrance du service | Exécution contrat | 1 an ou jusqu'à suppression |
| **Métadonnées (timestamp, IDs)** | Routage, sync | Intérêt légitime | 30 jours |
| **Logs serveur (IPs, endpoints)** | Sécurité, débogage | Intérêt légitime | 30 jours |
| **Données usage (analytics)** | Amélioration produit | Consentement (opt-in) | 6 mois anonymisées |

### Ce que nous NE collectons PAS

- ❌ **Contenu des messages** : Chiffré E2E, serveur ne peut pas lire
- ❌ **Contacts** : Uniquement hashés pour matching (optionnel)
- ❌ **Localisation** : Pas de géolocalisation en temps réel
- ❌ **Publicité / Tracking** : Aucun tracker tiers, pas de vente de données

## Droits des utilisateurs (RGPD Art. 15-22)

### 1. Droit d'accès (Art. 15)

**Requête :** "Quelles données avez-vous sur moi ?"  
**Réponse :** Export complet en 72h (format JSON)

```json
{
  "user": {
    "id": "uuid",
    "phone": "+33...",
    "display_name": "Alice",
    "created_at": "2025-01-15T10:00:00Z"
  },
  "conversations": [...],
  "messages": [
    {
      "id": "msg-uuid",
      "conversation_id": "conv-uuid",
      "ciphertext": "base64...", 
      "created_at": "2025-12-01T14:30:00Z"
    }
  ],
  "devices": [...],
  "contacts": [...]
}
```

**Note :** Messages restent chiffrés (E2E), user doit les déchiffrer côté client avec ses clés.

### 2. Droit de rectification (Art. 16)

**Workflow :**
1. User modifie nom/photo dans paramètres
2. Changements appliqués immédiatement
3. Sync sur tous devices

**API :** `PATCH /users/me`

### 3. Droit à l'effacement / "Droit à l'oubli" (Art. 17)

**Workflow suppression compte :**
```
1. User clique "Supprimer mon compte"
2. Confirmation (double opt-in, email/SMS)
3. Deletion cascade :
   - User, devices, sessions → Immédiat
   - Messages (où user est seul participant) → Immédiat
   - Messages (conversations partagées) → Flag "deleted_by_sender"
   - Médias (S3) → Suppression différée (30j, au cas où backup restore)
4. Email confirmation : "Compte supprimé"
```

**Exceptions légales (conservation temporaire) :**
- Logs de sécurité (incidents) : 1 an
- Données comptables/fiscales : Durée légale (5-10 ans selon pays)

### 4. Droit à la portabilité (Art. 20)

**Format :** JSON structuré (machine-readable)  
**Contenu :** Tous messages chiffrés + clés si user consent  
**Délai :** 30 jours max  
**API :** `GET /users/me/export`

### 5. Droit d'opposition (Art. 21)

**Cas d'usage :**
- Opposition au traitement pour marketing : Opt-out analytics
- Opposition à traitement automatisé : Pas de profiling automatique (N/A pour nous)

**Workflow :**
```
Paramètres → Confidentialité → "Désactiver analytics" → ON
```

### 6. Droit à la limitation du traitement (Art. 18)

**Cas :** User conteste l'exactitude de ses données  
**Action :** Flag compte "processing_limited", seules lectures autorisées

### 7. Notification en cas de violation (Art. 33-34)

**Délais :**
- **Autorité (CNIL) :** 72h après découverte
- **Users concernés :** Immédiat si risque élevé

**Communication :**
- Email + notification in-app
- Détails : Nature de la violation, données impactées, mesures prises

## Transferts internationaux

### Localisation des données

| Région | Stockage | Processing |
|--------|----------|-----------|
| **UE** | AWS Frankfurt (eu-central-1) | Oui |
| **US** | AWS Virginie (us-east-1) | Backup uniquement |

### Mécanismes de transfert légal

- **Clauses Contractuelles Types (CCT)** : Contrat AWS incluant CCT approuvées par Commission Européenne
- **Encryption at rest & in transit** : Même si serveur US compromis, messages restent chiffrés E2E

## Sous-traitants (GDPR Art. 28)

| Sous-traitant | Service | Localisation | DPA signé ? |
|---------------|---------|--------------|-------------|
| AWS | Hébergement | EU (primaire) | ✅ Oui |
| Twilio | SMS OTP | US (SCC) | ✅ Oui |
| SendGrid | Email transac. | US (SCC) | ✅ Oui |
| Sentry | Crash reports | US | ✅ Oui (anonymisé) |

**DPA (Data Processing Agreement) :** Contrat garantissant conformité RGPD du sous-traitant.

## Consentement (Art. 7)

### Quand requis ?

- **Création compte :** Consentement conditions d'utilisation + politique confidentialité (checkbox explicite, pré-coché interdit)
- **Analytics opt-in :** Désactivé par défaut, user doit activer
- **Marketing :** Opt-in email/push pour nouveautés (séparé du compte)

### Retrait du consentement

Aussi facile que de le donner :  
`Paramètres → Confidentialité → Désactiver [X]`

## DPIA (Data Protection Impact Assessment)

### Quand réalisé ?

- **Avant lancement** : Pour features "à haut risque" (appels, géolocalisation future)
- **Annuellement** : Revue complète

### Contenu DPIA

1. **Description traitement** : Flux de données, finalités
2. **Nécessité et proportionnalité** : Justification collecte
3. **Risques pour droits users** : Compromission, surveillance
4. **Mesures de mitigation** : E2E, anonymisation, accès restreint

**Résultat :** Validation par DPO (Data Protection Officer)

## Registre des activités de traitement (Art. 30)

Obligatoire pour organisations > 250 employés OU traitement sensible.

**Contenu :**

| Traitement | Finalité | Catégories de données | Durée retention | Destinataires |
|------------|----------|-----------------------|-----------------|---------------|
| Authentification | Accès service | Téléphone/email, OTP | Session (15 min) | User, backend |
| Messagerie | Communication | Messages chiffrés, timestamps | 1 an | Expéditeur, destinataire(s) |
| Appels | Communication temps réel | Signaling metadata | Durée appel | Participants |
| Logs sécurité | Détection incidents | IP, User-Agent, endpoints | 30 jours | Admin sécurité |

## Mesures de sécurité (Art. 32)

### Techniques

- **Chiffrement :** E2E (Signal Protocol), TLS 1.3, encryption at rest (KMS)
- **Pseudonymisation :** User IDs (UUIDs) au lieu de noms dans logs
- **Contrôle d'accès :** RBAC strict, principe du moindre privilège
- **Audit trails :** Logs immuables (CloudWatch Logs Insights)

### Organisationnelles

- **Politique sécurité** : Documentée, approuvée direction
- **Formation équipe** : RGPD awareness, secure coding
- **Tests réguliers** : Pentests annuels, audits trimestriels
- **Plan de continuité** : Backups, disaster recovery

## Droits spécifiques mineurs (< 16 ans)

- **Consentement parental** : Requis si user < 16 ans (Art. 8)
- **Vérification âge** : Déclaration lors signup (honor system MVP, vérif future via ID)
- **Suppression facilitée** : Procédure simplifiée pour mineurs

## Cookies & Trackers

### Web App

**Cookies strictement nécessaires (pas de consentement requis) :**
- Session cookie (JWT) : Authentification
- Préférences (thème, langue) : Local storage

**Cookies analytics (opt-in requis) :**
- Aucun par défaut
- Si user active analytics : Matomo (self-hosted, anonymisé)

**Banner cookies :**
```
"Nous utilisons uniquement des cookies essentiels pour le fonctionnement 
de l'application. Aucun tracker publicitaire."
[En savoir plus] [OK]
```

### Mobile Apps

- Pas de cookies (apps natives)
- Tracking ads désactivé (ATT iOS toujours "Do Not Track", Google Ads SDK non inclus)

## Politique de confidentialité

### Accessibilité

- URL dédiée : `https://securemessenger.app/privacy`
- Langue : FR, EN, ES
- Version datée : "Dernière mise à jour : 3 décembre 2025"
- Notifications changements : Email users + banner in-app (30j avant application)

### Structure

1. Introduction (résumé exécutif)
2. Données collectées
3. Finalités et bases légales
4. Partage avec tiers (sous-traitants)
5. Droits RGPD
6. Sécurité
7. Transferts internationaux
8. Cookies
9. Contact DPO
10. Modifications politique

## Contact DPO

**Email :** dpo@securemessenger.app  
**Délai réponse :** 5 jours ouvrés (max 30j légal)  
**Formulaire Web :** Intégré dans app (`Paramètres → Aide → Mes données`)

## Checklist conformité

### Avant lancement

- [x] Politique de confidentialité rédigée et validée
- [x] CGU (Terms of Service) incluant clause RGPD
- [x] Formulaire consentement explicite (signup)
- [x] API export/suppression données
- [x] DPIA réalisée
- [x] DPA signés avec sous-traitants
- [x] Registre des traitements à jour
- [ ] DPO désigné (externe accepté si < 50 employés)
- [ ] Tests droits RGPD (export, suppression)
- [ ] Formation équipe RGPD

### Post-lancement

- [ ] Audits annuels conformité
- [ ] Revue politique confidentialité (si changements produit)
- [ ] Monitoring violations de données (alertes auto)
- [ ] Reporting annuel CNIL (si requis)

---
**Document owner :** DPO / Legal  
**Dernière révision :** 3 décembre 2025  
**Statut :** Draft → Revue légale requise
