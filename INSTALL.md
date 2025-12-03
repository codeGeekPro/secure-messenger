# Guide d'installation - Phase 2

## Prérequis

### 1. Installer Docker Desktop (si pas déjà fait)

**Windows :**
1. Télécharger : https://www.docker.com/products/docker-desktop/
2. Installer Docker Desktop for Windows
3. Redémarrer l'ordinateur
4. Vérifier : `docker --version` et `docker compose version`

**Alternative sans Docker** : Installer PostgreSQL et Redis manuellement
- PostgreSQL 16 : https://www.postgresql.org/download/windows/
- Redis : https://redis.io/docs/latest/operate/oss_and_stack/install/install-redis/install-redis-on-windows/

### 2. Node.js et pnpm

```bash
# Vérifier Node.js (≥ 20)
node --version

# Vérifier pnpm (≥ 10)
pnpm --version

# Si pnpm n'est pas installé
npm install -g pnpm
```

## Installation du projet

### Étape 1 : Dépendances

```bash
cd "c:\Users\genie\Documents\Projet Java\Nouveau dossier\secure-messenger"
pnpm install
```

### Étape 2 : Bases de données

**Option A - Avec Docker (recommandé) :**

```bash
# Démarrer PostgreSQL et Redis
docker compose up -d

# Vérifier les logs
docker compose logs -f

# Arrêter
docker compose down
```

**Option B - Sans Docker (PostgreSQL et Redis locaux) :**

Modifiez `apps/backend/.env` avec vos paramètres locaux :
```
DATABASE_URL="postgresql://votre_user:votre_password@localhost:5432/secure_messenger?schema=public"
REDIS_HOST="localhost"
REDIS_PORT=6379
```

### Étape 3 : Prisma (migrations base de données)

```bash
cd apps/backend

# Générer le client Prisma
pnpm prisma generate

# Créer la base de données et appliquer migrations
pnpm prisma migrate dev --name init

# (Optionnel) Ouvrir Prisma Studio pour voir la BDD
pnpm prisma studio
```

### Étape 4 : Lancer le backend

```bash
# Depuis la racine du monorepo
pnpm dev

# OU directement dans apps/backend
cd apps/backend
pnpm dev
```

Le backend sera disponible sur : **http://localhost:3001/api/v1**

## Tester l'API

### 1. Inscription (OTP)

```bash
curl -X POST http://localhost:3001/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"+33612345678\",\"displayName\":\"Test User\"}"
```

Regardez les logs du terminal, vous verrez l'OTP (ex: `123456` pour le POC).

### 2. Vérification OTP

```bash
curl -X POST http://localhost:3001/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"+33612345678\",\"code\":\"123456\"}"
```

Vous recevrez un `accessToken` et un `refreshToken`.

### 3. Utiliser l'access token

```bash
curl -X GET http://localhost:3001/api/v1/users/me \
  -H "Authorization: Bearer VOTRE_ACCESS_TOKEN"
```

## Dépannage

### Erreur "docker compose not found"

Installez Docker Desktop ou utilisez PostgreSQL/Redis en local.

### Erreur connexion base de données

```bash
# Vérifier que PostgreSQL tourne
docker compose ps

# OU si local
pg_isready -h localhost -p 5432
```

### Erreur Prisma "P1001"

La base n'est pas accessible. Vérifiez `DATABASE_URL` dans `.env`.

### Port déjà utilisé

Si le port 3001, 5432 ou 6379 est déjà pris :

```bash
# Changer PORT dans apps/backend/.env
PORT=3002
```

## Structure créée

```
secure-messenger/
├── apps/
│   └── backend/
│       ├── src/
│       │   ├── auth/              ✅ Module Auth (JWT, OTP)
│       │   │   ├── auth.module.ts
│       │   │   ├── auth.service.ts
│       │   │   ├── auth.controller.ts
│       │   │   └── strategies/
│       │   │       └── jwt.strategy.ts
│       │   ├── common/            ✅ Services partagés
│       │   │   ├── prisma.service.ts
│       │   │   ├── decorators/
│       │   │   └── guards/
│       │   ├── main.ts
│       │   └── app.module.ts
│       ├── prisma/
│       │   └── schema.prisma      ✅ Schéma BDD complet
│       ├── .env                   ✅ Config environnement
│       └── package.json
├── packages/
│   └── types/                     ✅ Types partagés (Zod)
├── docker-compose.yml             ✅ PostgreSQL + Redis
├── pnpm-workspace.yaml            ✅ Config monorepo
└── turbo.json                     ✅ Config Turborepo
```

## Prochaines étapes

- [ ] Module Users (CRUD profil)
- [ ] Module Redis (cache, sessions)
- [ ] Tests unitaires (Jest)
- [ ] CI/CD GitHub Actions
- [ ] Frontend React (apps/web)

---
**Statut actuel** : ✅ Backend NestJS fonctionnel avec Auth  
**Dernière mise à jour** : 3 décembre 2025
