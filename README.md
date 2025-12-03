# Secure Messenger - Application de Messagerie Sécurisée

## Vue d'ensemble
Application de messagerie instantanée moderne avec chiffrement end-to-end, conversations en temps réel, appels audio/vidéo, et synchronisation multi-appareils.

## 🚀 Phase actuelle : Phase 7 - Groupes
**Durée :** 2-3 semaines  
**Objectif :** Conversations de groupe avec rôles, modération, invitations, messages épinglés

### ✅ Phases Complétées

#### Phase 1 : Planification & Architecture (✅ Terminée)
- Spécifications, architecture, schéma BDD, plan sécurité
- POC crypto validé (Double Ratchet + X3DH)

#### Phase 2 : Setup Projet (✅ Terminée)
- Monorepo Turborepo avec apps backend/web/mobile
- Infrastructure Docker (PostgreSQL, Redis)
- Configuration TypeScript et linters

#### Phase 3 : Cryptographie E2E (✅ Terminée)
- X3DH (Extended Triple Diffie-Hellman) pour établissement clés
- Double Ratchet (Signal Protocol) pour ratcheting
- Sealed Box (crypto_box_seal) pour chiffrement clé média

#### Phase 4 : Frontend Web (✅ Terminée)
- Interface Next.js 14 avec Tailwind CSS
- Conversations temps réel via Socket.IO
- Upload/download médias chiffrés

#### Phase 5 : Mobile & Média (✅ Terminée)
- App mobile Expo (iOS/Android) avec auth + chat
- API média complète (init, upload, complete, download)
- Certificate pinning (Android + iOS) + tests MITM

#### Phase 6 : Fonctionnalités Avancées (✅ Backend Complet)
- Appels WebRTC 1:1 avec signaling Socket.IO
- Partage d'écran (getDisplayMedia)
- Messages éphémères avec auto-suppression TTL
- Réactions emoji temps réel
- **Restant :** Intégration frontend, tests stabilité >30min

### 🔧 Phase 7 - Livrables (En cours)

#### ✅ Backend Groupes
- **GroupsService** : Gestion groupes et permissions
  - `createGroup()` : Créer avec créateur = owner
  - `addMembers()` / `removeMember()` : Modération (admin+)
  - `updateMemberRole()` : Promouvoir/rétrograder (owner)
  - `updateSettings()` : Modifier nom/description/avatar (admin+)
  - `checkPermission()` : Matrice permissions owner/admin/member

#### ✅ Système Invitations
- **InvitationsService** : Liens d'invitation
  - Codes uniques (32 chars hex via crypto.randomBytes)
  - Expiration optionnelle + limite utilisations
  - Révocation (admin+)
  - Compteur d'utilisations

#### ✅ Messages Épinglés
- `pinMessage()` / `unpinMessage()` : Admin+ uniquement
- Maximum 10 pins par groupe
- Ordre chronologique inversé

#### ✅ Journal d'Audit
- **GroupAuditLog** : Tracking toutes actions
  - Actions : created, members_added/removed, role_changed, settings_updated, pinned, invite_created/revoked
  - Métadonnées contextuelles (oldRole, newRole, memberCount)
  - Accès admin+ uniquement

#### ✅ Matrice Permissions
| Action                  | Owner | Admin | Member |
|-------------------------|-------|-------|--------|
| Ajouter membres         | ✅    | ✅    | ❌     |
| Retirer member          | ✅    | ✅    | ❌     |
| Retirer admin           | ✅    | ❌    | ❌     |
| Promouvoir admin        | ✅    | ❌    | ❌     |
| Modifier paramètres     | ✅    | ✅    | ❌     |
| Épingler messages       | ✅    | ✅    | ❌     |
| Créer invitations       | ✅    | ✅    | ❌     |
| Voir journal d'audit    | ✅    | ✅    | ❌     |

#### ✅ Documentation
- **`docs/phase7-groups.md`** : Architecture complète, flows, API

### 🔜 Restants Phase 7
- [ ] Composants UI frontend (CreateGroupModal, MembersList, InviteLinkGenerator)
- [ ] Intégration chat groupes (badges rôles, actions modération)
- [ ] Tests matrice permissions (20+ tests unitaires)
- [ ] Tests E2E : créer groupe, inviter, promouvoir, retirer, pin

### Critères d'acceptation Phase 7 (DoD)
- Matrice permissions testée (tous rôles, toutes actions)
- Journal d'audit complet (toutes actions trackées)
- Liens d'invitation fonctionnels (expiration + limite uses)
- Messages épinglés visibles par tous les membres
- Messages éphémères s'auto-suppriment après TTL
- Réactions emoji affichées en temps réel

## 📦 Installation Rapide

### Prérequis
```bash
node >= 18.x
npm >= 9.x
Docker Desktop (PostgreSQL + Redis)
```

### Setup Initial
```bash
# Cloner repo
git clone <repo-url>
cd secure-messenger

# Installer dépendances
npm install

# Démarrer services Docker
docker-compose up -d

# Générer client Prisma (Phase 6)
cd apps/backend
npx prisma generate
npx prisma migrate dev

# Démarrer backend
npm run dev:backend

# Démarrer frontend (terminal 2)
npm run dev:web
```

### Ports par défaut
- Frontend : http://localhost:3000
- Backend API : http://localhost:3001
- WebSocket Calls : ws://localhost:3001/calls
- WebSocket Messages : ws://localhost:3001/messages

## 🧪 Tests Phase 6

### Test Appel Vidéo
1. Ouvrir 2 fenêtres browser (User A et B)
2. Se connecter avec comptes différents
3. User A : Démarrer appel vidéo depuis chat
4. User B : Accepter appel
5. Tester : mute/unmute, video on/off, partage écran

### Test Messages Éphémères
```javascript
// Envoyer message avec TTL 10 secondes
sendMessage({ text: 'Test', ttlSeconds: 10 });
// Observer countdown dans UI
// Vérifier disparition automatique après 10s
```

### Commandes POC Crypto

```bash
cd poc-crypto
npm install
npm run demo
```

### Prochaines actions

1. **Designer UX/UI :** Créer wireframes dans Figma (voir `docs/wireframes/README.md`)
2. **Tech Lead :** Valider POC crypto avec équipe sécurité
3. **Équipe :** Revue des documents Phase 1 (architecture, sécurité, specs)
4. **Gate Go/No-Go :** Meeting vendredi pour décision Phase 2

## Structure du projet
```
secure-messenger/
├── docs/
│   ├── specs.md                    # Spécifications fonctionnelles
│   ├── tech-stack.md               # Choix technologiques
│   ├── nfr-kpis.md                 # NFR et KPIs
│   ├── risks-mitigations.md        # Analyse de risques
│   ├── roadmap.md                  # Planning et jalons
│   ├── architecture/
│   │   ├── overview.md             # Architecture logique
│   │   ├── deployment.md           # Architecture physique
│   │   ├── database-schema.md      # Modèle de données
│   │   └── diagrams/               # Diagrammes C4, séquence
│   ├── security/
│   │   ├── threat-model.md         # Modèle de menaces
│   │   ├── encryption.md           # Politique E2E
│   │   └── compliance.md           # RGPD, DLP
│   └── wireframes/                 # Maquettes UX
├── poc-crypto/                     # POC chiffrement E2E
└── README.md
```

## Prochaines étapes
1. Compléter les spécifications fonctionnelles
2. Définir l'architecture détaillée
3. Valider le POC crypto
4. Gate Go/No-Go avant Phase 2

## Timeline globale
**Durée totale estimée :** 6-9 mois avec équipe de 5-8 développeurs

---
**Date de création :** 3 décembre 2025  
**Dernière mise à jour :** 3 décembre 2025
