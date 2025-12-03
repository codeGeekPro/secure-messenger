# Phase 2 - Infrastructure Backend

## Date de début
3 décembre 2025

## Objectif
Mettre en place l'infrastructure backend complète avec services core (auth, users), base de données, cache, et CI/CD.

## Durée estimée
3-4 semaines

## Structure créée

```
secure-messenger/
├── apps/
│   └── backend/          # NestJS API
│       ├── src/
│       │   ├── main.ts
│       │   └── app.module.ts
│       ├── prisma/
│       │   └── schema.prisma
│       └── package.json
├── packages/
│   ├── types/            # Types partagés (Zod)
│   │   └── src/index.ts
│   └── config/           # Configs ESLint, TS
├── docker-compose.yml    # PostgreSQL + Redis
├── package.json          # Monorepo root
├── turbo.json            # Turborepo config
└── pnpm-workspace.yaml
```

## Installation

### 1. Installer les dépendances

```bash
pnpm install
```

### 2. Démarrer PostgreSQL et Redis

```bash
docker-compose up -d
```

### 3. Générer Prisma Client et migrer

```bash
cd apps/backend
pnpm prisma:generate
pnpm prisma:migrate
```

### 4. Lancer le backend

```bash
# Depuis la racine
pnpm dev

# Ou spécifiquement le backend
cd apps/backend
pnpm dev
```

Backend disponible sur : `http://localhost:3001/api/v1`

## Services Docker

- **PostgreSQL** : `localhost:5432`
  - User: `postgres`
  - Password: `postgres`
  - Database: `secure_messenger`

- **Redis** : `localhost:6379`

### Commandes Docker utiles

```bash
# Voir les logs
docker-compose logs -f postgres
docker-compose logs -f redis

# Arrêter les services
docker-compose down

# Arrêter et supprimer les volumes
docker-compose down -v
```

## Prochaines étapes

- [ ] Module Auth (JWT, OTP via Twilio)
- [ ] Module Users (CRUD, profil)
- [ ] Module Messages (WebSocket, E2E)
- [ ] Tests unitaires (Jest, >80% coverage)
- [ ] CI/CD GitHub Actions
- [ ] Docker build backend
- [ ] Déploiement staging (AWS ECS/EKS)

## Stack

- **Runtime** : Node.js 20
- **Framework** : NestJS 10
- **ORM** : Prisma 5
- **BDD** : PostgreSQL 16
- **Cache** : Redis 7
- **Package Manager** : pnpm 10
- **Monorepo** : Turborepo

---
**Statut** : ✅ Infrastructure de base créée  
**Prochaine action** : `pnpm install` puis modules Auth/Users
