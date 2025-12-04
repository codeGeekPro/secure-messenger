# Developer Guide - Secure Messenger

**Version**: 1.0.0  
**Date**: 4 décembre 2025  
**Équipe**: Engineering

## Table des matières

1. [Introduction](#introduction)
2. [Architecture](#architecture)
3. [Setup environnement](#setup-environnement)
4. [Conventions de code](#conventions-de-code)
5. [Workflow Git](#workflow-git)
6. [Tests](#tests)
7. [Debugging](#debugging)
8. [Performance](#performance)
9. [Sécurité](#sécurité)
10. [Contribution](#contribution)

---

## Introduction

### Bienvenue

Bienvenue dans l'équipe **Secure Messenger**! Ce guide vous aidera à:

- 🏗️ Comprendre l'architecture du projet
- 💻 Configurer votre environnement de développement
- ✅ Suivre les best practices
- 🤝 Contribuer efficacement au codebase

### Prérequis

| Technologie | Version minimale | Commande vérification |
|-------------|------------------|----------------------|
| Node.js | 20.x LTS | `node --version` |
| pnpm | 8.x | `pnpm --version` |
| Docker | 24.x | `docker --version` |
| PostgreSQL | 15.x | `psql --version` |
| Git | 2.40+ | `git --version` |

### Ressources

- **Documentation**: `/docs/`
- **Specs techniques**: `docs/specs.md`
- **API Reference**: `docs/guides/api-reference.md`
- **Slack**: `#secure-messenger-dev`
- **Jira**: https://jira.example.com/projects/SM

---

## Architecture

### Vue d'ensemble

**Monorepo structure** (Turborepo):

```
secure-messenger/
├── apps/
│   ├── backend/         # NestJS API (REST + WebSocket)
│   ├── web/             # Next.js frontend (React + TypeScript)
│   └── mobile/          # React Native (iOS + Android)
├── packages/
│   └── types/           # Types TypeScript partagés
├── k8s/                 # Manifests Kubernetes
├── scripts/             # Scripts utilitaires
└── docs/                # Documentation
```

### Stack technique

| Couche | Technologies |
|--------|--------------|
| **Frontend Web** | Next.js 14, React 18, TypeScript, TailwindCSS, ShadCN/UI |
| **Frontend Mobile** | React Native 0.73, Expo, TypeScript |
| **Backend** | NestJS 10, TypeScript, Prisma ORM, PostgreSQL 15 |
| **Temps réel** | Socket.IO (WebSocket) |
| **Cache** | Redis 7 |
| **Storage** | S3-compatible (MinIO/AWS) |
| **Cryptographie** | libsignal-protocol-typescript, WebCrypto API |
| **Tests** | Jest, Playwright, React Testing Library |
| **CI/CD** | GitHub Actions, Docker, Kubernetes |
| **Monitoring** | Prometheus, Grafana, Loki |

### Architecture applicative

```mermaid
graph TB
    subgraph Clients
        WEB[Next.js Web]
        MOBILE[React Native]
    end
    
    subgraph Backend
        API[NestJS API]
        WS[WebSocket Server]
        QUEUE[Bull Queue]
    end
    
    subgraph Data
        POSTGRES[(PostgreSQL)]
        REDIS[(Redis)]
        S3[S3 Storage]
    end
    
    WEB -->|HTTPS/WSS| API
    MOBILE -->|HTTPS/WSS| API
    API --> WS
    API --> POSTGRES
    API --> REDIS
    API --> S3
    WS --> REDIS
    QUEUE --> POSTGRES
```

### Modules backend

| Module | Responsabilité | Dépendances |
|--------|----------------|-------------|
| `auth` | Authentification (JWT, MFA) | `users`, `prisma` |
| `users` | Gestion des utilisateurs | `prisma`, `crypto` |
| `conversations` | Conversations 1-1 et groupes | `users`, `messages` |
| `messages` | Envoi/réception messages | `crypto`, `websocket` |
| `media` | Upload/download médias | `s3`, `crypto` |
| `calls` | Signaling WebRTC | `websocket` |
| `devices` | Multi-device management | `users`, `crypto` |
| `crypto` | Key exchange (X3DH) | `libsignal` |

---

## Setup environnement

### 1. Cloner le repo

```bash
git clone https://github.com/your-org/secure-messenger.git
cd secure-messenger
```

### 2. Installer les dépendances

```bash
# Installer pnpm globalement (si pas déjà fait)
npm install -g pnpm

# Installer toutes les dépendances (monorepo)
pnpm install
```

### 3. Variables d'environnement

**Backend** (`apps/backend/.env`):

```bash
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/secure_messenger_dev"

# Redis
REDIS_HOST="localhost"
REDIS_PORT=6379

# JWT
JWT_SECRET="your-super-secret-key-change-me"
JWT_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_IN="7d"

# S3
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="secure-messenger-media-dev"

# WebSocket
WS_PORT=3001

# SMTP (emails)
SMTP_HOST="smtp.mailtrap.io"
SMTP_PORT=2525
SMTP_USER="your-username"
SMTP_PASS="your-password"
```

**Web** (`apps/web/.env.local`):

```bash
NEXT_PUBLIC_API_URL="http://localhost:3000"
NEXT_PUBLIC_WS_URL="ws://localhost:3001"
```

**Mobile** (`apps/mobile/.env`):

```bash
API_URL="http://192.168.1.100:3000"  # IP de votre machine
WS_URL="ws://192.168.1.100:3001"
```

### 4. Base de données

```bash
# Démarrer PostgreSQL + Redis avec Docker
docker-compose up -d postgres redis minio

# Appliquer les migrations Prisma
cd apps/backend
pnpm prisma migrate dev

# Seed initial (données de test)
pnpm prisma db seed
```

### 5. Lancer les applications

**Backend**:
```bash
cd apps/backend
pnpm dev  # Port 3000 (API) + 3001 (WebSocket)
```

**Web**:
```bash
cd apps/web
pnpm dev  # Port 3002
```

**Mobile** (iOS):
```bash
cd apps/mobile
pnpm ios  # Ouvre le simulateur iOS
```

**Mobile** (Android):
```bash
cd apps/mobile
pnpm android  # Lance l'émulateur Android
```

### 6. Vérification

- **Backend health check**: http://localhost:3000/health
- **Web app**: http://localhost:3002
- **API docs** (Swagger): http://localhost:3000/api-docs
- **Prisma Studio**: `cd apps/backend && pnpm prisma studio`

---

## Conventions de code

### TypeScript

**Style guide**: Basé sur [Airbnb TypeScript Style Guide](https://github.com/airbnb/javascript)

```typescript
// ✅ Bon: Types explicites
interface User {
  id: string;
  email: string;
  createdAt: Date;
}

function getUser(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

// ❌ Mauvais: Types implicites (any)
function getUser(id) {
  return prisma.user.findUnique({ where: { id } });
}
```

**Naming conventions**:

| Type | Convention | Exemple |
|------|------------|---------|
| Variables | camelCase | `userName`, `messageCount` |
| Constantes | UPPER_SNAKE_CASE | `MAX_FILE_SIZE`, `API_URL` |
| Classes | PascalCase | `UserService`, `MessageController` |
| Interfaces | PascalCase + I prefix | `IUser`, `IMessageRepository` |
| Types | PascalCase | `MessageType`, `CallStatus` |
| Fichiers | kebab-case | `user-service.ts`, `message.controller.ts` |

### Imports

**Ordre des imports**:

```typescript
// 1. Node modules
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// 2. Internal packages
import { User } from '@secure-messenger/types';

// 3. Local imports (relatifs)
import { CreateUserDto } from './dto/create-user.dto';
import { hashPassword } from '../utils/crypto';

// 4. Types
import type { UserProfile } from './types';
```

### Commentaires

```typescript
/**
 * Crée un nouveau message E2EE
 * 
 * @param conversationId - ID de la conversation
 * @param encryptedContent - Contenu chiffré (E2EE)
 * @param senderId - ID de l'expéditeur
 * @returns Message créé avec métadonnées
 * @throws {NotFoundException} Si conversation inexistante
 * @throws {ForbiddenException} Si sender pas membre
 */
async createMessage(
  conversationId: string,
  encryptedContent: string,
  senderId: string
): Promise<Message> {
  // Vérifier que le sender est membre de la conversation
  const membership = await this.checkMembership(conversationId, senderId);
  
  if (!membership) {
    throw new ForbiddenException('Not a member of this conversation');
  }

  // Créer le message
  return this.prisma.message.create({
    data: {
      conversationId,
      senderId,
      encryptedContent,
      timestamp: new Date(),
    },
  });
}
```

### Linting & formatting

**ESLint** (`.eslintrc.js`):

```javascript
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
```

**Prettier** (`.prettierrc`):

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

**Commandes**:

```bash
# Lint
pnpm lint           # Vérifier tous les packages
pnpm lint:fix       # Auto-fix les erreurs

# Format
pnpm format         # Formatter avec Prettier
```

---

## Workflow Git

### Branches

| Branch | Usage | Protection |
|--------|-------|------------|
| `main` | Production | ✅ Protected (PR required) |
| `develop` | Développement | ✅ Protected (PR required) |
| `feature/*` | Nouvelles features | ❌ |
| `fix/*` | Bug fixes | ❌ |
| `hotfix/*` | Fixes critiques prod | ❌ |

### Nommage de branches

```bash
# Feature
git checkout -b feature/add-video-calls

# Bug fix
git checkout -b fix/message-not-decrypting

# Hotfix (depuis main)
git checkout -b hotfix/security-patch-jwt
```

### Commits

**Format**: [Conventional Commits](https://www.conventionalcommits.org/)

```bash
type(scope): description

[optional body]

[optional footer]
```

**Types**:
- `feat`: Nouvelle feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (pas de changement de code)
- `refactor`: Refactoring
- `test`: Ajout/modification de tests
- `chore`: Maintenance (dépendances, config)
- `perf`: Amélioration de performance
- `ci`: CI/CD

**Exemples**:

```bash
feat(messages): add E2EE encryption with Double Ratchet

Implements Signal protocol for end-to-end encryption.
- X3DH key exchange
- Double Ratchet for message keys
- Crypto storage in IndexedDB

Closes #123
```

```bash
fix(auth): prevent JWT replay attacks

Add nonce to JWT claims and validate on each request.

BREAKING CHANGE: Old tokens will be invalidated.
```

### Pull Requests

**Template**:

```markdown
## Description
Brève description des changements.

## Type de changement
- [ ] Bug fix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change

## Checklist
- [ ] Code suit les conventions du projet
- [ ] Auto-review effectué
- [ ] Commentaires ajoutés (si code complexe)
- [ ] Documentation mise à jour
- [ ] Tests ajoutés (couverture ≥ 80%)
- [ ] Tests passent localement
- [ ] Pas de warnings ESLint

## Screenshots (si UI)
```

**Review checklist**:

- ✅ Code propre et lisible
- ✅ Pas de hardcoded secrets
- ✅ Gestion d'erreurs adéquate
- ✅ Tests suffisants (unit + integration)
- ✅ Performance (pas de N+1 queries)
- ✅ Sécurité (input validation, injection)
- ✅ Docs à jour

---

## Tests

### Stratégie

| Type | Outil | Couverture cible | Exemples |
|------|-------|------------------|----------|
| **Unit** | Jest | 80% | Services, utils, crypto |
| **Integration** | Jest + Supertest | 70% | API endpoints, DB |
| **E2E** | Playwright | Critical paths | Login, send message |
| **Snapshot** | Jest | UI components | React components |

### Tests unitaires (Backend)

**Exemple** (`user.service.spec.ts`):

```typescript
import { Test } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UserService', () => {
  let service: UserService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UserService, PrismaService],
    }).compile();

    service = module.get<UserService>(UserService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('createUser', () => {
    it('should hash password before saving', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'plaintext123',
      };

      const user = await service.createUser(userData);

      expect(user.password).not.toBe('plaintext123');
      expect(user.password).toMatch(/^\$2[aby]\$/); // bcrypt hash
    });

    it('should throw if email already exists', async () => {
      await service.createUser({ email: 'dup@example.com', password: 'pass' });

      await expect(
        service.createUser({ email: 'dup@example.com', password: 'pass2' })
      ).rejects.toThrow('Email already exists');
    });
  });
});
```

**Commandes**:

```bash
# Tous les tests
pnpm test

# Un fichier spécifique
pnpm test user.service

# Watch mode
pnpm test:watch

# Coverage
pnpm test:cov
```

### Tests d'intégration (Backend)

**Exemple** (`messages.e2e-spec.ts`):

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Messages (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    // Login pour obtenir un token
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    authToken = loginRes.body.accessToken;
  });

  it('/messages (POST) should create a message', async () => {
    const res = await request(app.getHttpServer())
      .post('/messages')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        conversationId: 'conv-123',
        encryptedContent: 'encrypted-blob',
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.encryptedContent).toBe('encrypted-blob');
  });

  afterAll(async () => {
    await app.close();
  });
});
```

### Tests E2E (Frontend)

**Playwright** (`tests/e2e/login.spec.ts`):

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login flow', () => {
  test('should login successfully', async ({ page }) => {
    await page.goto('http://localhost:3002/login');

    // Remplir le formulaire
    await page.fill('input[name="email"]', 'alice@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Vérifier redirection vers /conversations
    await expect(page).toHaveURL(/\/conversations/);
    await expect(page.locator('text=Conversations')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('http://localhost:3002/login');

    await page.fill('input[name="email"]', 'wrong@example.com');
    await page.fill('input[name="password"]', 'wrongpass');
    await page.click('button[type="submit"]');

    // Vérifier message d'erreur
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });
});
```

**Commandes**:

```bash
cd apps/web

# Lancer Playwright
pnpm e2e             # Headless
pnpm e2e:ui          # UI mode (debug)
pnpm e2e:debug       # Debug mode (pas à pas)
```

### Tests composants React

**React Testing Library** (`Message.test.tsx`):

```typescript
import { render, screen } from '@testing-library/react';
import { Message } from './Message';

describe('Message component', () => {
  it('should render message content', () => {
    render(
      <Message
        content="Hello world"
        sender="Alice"
        timestamp={new Date('2025-01-01')}
      />
    );

    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('should show encrypted badge', () => {
    render(<Message content="Secret" sender="Bob" isEncrypted />);

    expect(screen.getByLabelText('Encrypted')).toBeInTheDocument();
  });
});
```

---

## Debugging

### Backend (NestJS)

**VS Code** (`launch.json`):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["run", "start:debug"],
      "cwd": "${workspaceFolder}/apps/backend",
      "console": "integratedTerminal",
      "restart": true,
      "protocol": "inspector",
      "sourceMaps": true,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

**Commandes**:
```bash
cd apps/backend
pnpm start:debug  # Port 9229 (debugger)
```

### Frontend (Next.js)

**Browser DevTools**:
- **React DevTools**: Inspecter components
- **Network tab**: Vérifier API calls
- **Application tab**: IndexedDB (crypto keys)

**Console logging**:

```typescript
// Development only
if (process.env.NODE_ENV === 'development') {
  console.log('Debug:', { userId, conversationId });
}
```

### Mobile (React Native)

**React Native Debugger**:

```bash
# Installer
brew install --cask react-native-debugger

# Lancer
open "rndebugger://set-debugger-loc?host=localhost&port=8081"
```

**Flipper** (recommandé):

```bash
# Démarrer Flipper
npx flipper-server

# Features: Network inspector, Logs, Layout inspector
```

### Database (PostgreSQL)

**Prisma Studio** (GUI):

```bash
cd apps/backend
pnpm prisma studio  # http://localhost:5555
```

**psql** (CLI):

```bash
psql -h localhost -U postgres -d secure_messenger_dev

# Requêtes utiles
\dt                          -- Lister les tables
\d users                     -- Schema de la table users
SELECT * FROM messages LIMIT 10;
```

---

## Performance

### Profiling backend

**Clinic.js**:

```bash
npm install -g clinic

cd apps/backend
clinic doctor -- node dist/main.js
clinic flame -- node dist/main.js
```

**Indicateurs clés**:
- **Response time**: < 200ms (P95)
- **Throughput**: > 1000 req/s
- **Memory usage**: < 512 MB (idle)
- **CPU usage**: < 50% (steady state)

### Optimisations courantes

**1. N+1 queries**:

```typescript
// ❌ Mauvais: N+1 queries
const users = await prisma.user.findMany();
for (const user of users) {
  user.conversations = await prisma.conversation.findMany({
    where: { participants: { some: { id: user.id } } },
  });
}

// ✅ Bon: Eager loading
const users = await prisma.user.findMany({
  include: {
    conversations: true,
  },
});
```

**2. Pagination**:

```typescript
// ✅ Toujours paginer les listes
async getMessages(conversationId: string, page = 1, limit = 50) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { timestamp: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });
}
```

**3. Caching (Redis)**:

```typescript
async getUserProfile(userId: string): Promise<User> {
  // Check cache
  const cached = await this.redis.get(`user:${userId}`);
  if (cached) return JSON.parse(cached);

  // Fetch from DB
  const user = await this.prisma.user.findUnique({ where: { id: userId } });

  // Cache for 5 minutes
  await this.redis.setex(`user:${userId}`, 300, JSON.stringify(user));

  return user;
}
```

### Bundle size (Frontend)

```bash
cd apps/web

# Analyser le bundle
pnpm build
pnpm analyze  # Ouvre un rapport visuel

# Optimisations:
# - Dynamic imports (lazy loading)
# - Tree shaking
# - Image optimization (next/image)
```

---

## Sécurité

### Checklist développeur

Avant chaque PR, vérifier:

- [ ] **Pas de secrets hardcodés** (tokens, keys, passwords)
- [ ] **Input validation** (DTO avec class-validator)
- [ ] **Output encoding** (éviter XSS)
- [ ] **Authentication** (JWT valide)
- [ ] **Authorization** (RBAC checks)
- [ ] **Rate limiting** (endpoints sensibles)
- [ ] **SQL injection** (Prisma ORM utilisé correctement)
- [ ] **CSRF protection** (tokens CSRF si formulaires)
- [ ] **Logs sanitisés** (pas de PII)

### Exemples sécurisés

**Input validation**:

```typescript
import { IsEmail, IsStrongPassword, Length } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsStrongPassword({
    minLength: 12,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1,
  })
  password: string;

  @Length(2, 50)
  displayName: string;
}
```

**Authorization guard**:

```typescript
@Injectable()
export class ConversationOwnerGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user.id;
    const conversationId = request.params.id;

    // Vérifier que l'user est participant
    const membership = await this.prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
    });

    return !!membership;
  }
}

// Usage dans un controller
@UseGuards(JwtAuthGuard, ConversationOwnerGuard)
@Get('conversations/:id')
async getConversation(@Param('id') id: string) {
  // Authorized access only
}
```

### Secrets management

**Développement**:
- Utiliser `.env` (jamais commité)
- `.env.example` avec des valeurs de démo

**Production**:
- Kubernetes Secrets (encrypted at rest)
- AWS Secrets Manager / HashiCorp Vault
- Rotation automatique (90 jours)

```bash
# Créer un secret K8s
kubectl create secret generic backend-secrets \
  --from-literal=JWT_SECRET=$(openssl rand -base64 32) \
  --from-literal=DATABASE_URL="postgresql://..." \
  -n secure-messenger
```

---

## Contribution

### Processus

1. **Choisir une issue** (Jira, GitHub Issues)
   - Label `good first issue` pour débuter
   - Assigner l'issue à vous

2. **Créer une branche**:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/my-new-feature
   ```

3. **Développer**:
   - Respecter les conventions
   - Ajouter des tests
   - Commiter régulièrement (petits commits atomiques)

4. **Tester localement**:
   ```bash
   pnpm lint
   pnpm test
   pnpm build
   ```

5. **Push & PR**:
   ```bash
   git push origin feature/my-new-feature
   ```
   - Créer une Pull Request sur GitHub
   - Remplir le template
   - Demander review (≥ 2 reviewers)

6. **Itérer**:
   - Répondre aux commentaires
   - Faire les modifications demandées
   - Re-request review

7. **Merge**:
   - Squash & merge (pour un historique propre)
   - Delete branch après merge

### Code review

**En tant que reviewer**:

- ✅ Soyez constructif et bienveillant
- ✅ Expliquez le "pourquoi", pas juste le "quoi"
- ✅ Distinguez: `nit:` (optionnel) vs blocant
- ✅ Approuver si > 90% satisfaisant (ne pas bloquer sur des détails)

**Exemple de commentaire**:

```
nit: Consider using `Promise.all` here for better performance.

const [users, conversations] = await Promise.all([
  getUsersAsync(),
  getConversationsAsync(),
]);

This runs both queries in parallel instead of sequentially.
```

### Communication

**Daily standup** (async sur Slack):
- 📅 Hier: Ce que j'ai fait
- 📅 Aujourd'hui: Ce que je vais faire
- 🚧 Blockers: Ce qui me bloque (si applicable)

**RFC (Request for Comments)**:

Pour des changements majeurs (architecture, breaking changes):

1. Créer un document `docs/rfcs/001-my-proposal.md`
2. Décrire: Problème, solution proposée, alternatives, trade-offs
3. Partager sur Slack pour feedback
4. Itérer jusqu'à consensus
5. Implémenter après approbation

---

## FAQ Développeurs

### Q: Comment ajouter une nouvelle dépendance?

**A**: Utiliser `pnpm add` dans le workspace concerné:

```bash
cd apps/backend
pnpm add zod  # Dépendance de prod

cd apps/web
pnpm add -D @types/node  # DevDependency
```

Pour une dépendance partagée (tout le monorepo):

```bash
pnpm add -w <package>  # Root workspace
```

### Q: Comment migrer la base de données?

**A**: Utiliser Prisma Migrate:

```bash
cd apps/backend

# Créer une migration
pnpm prisma migrate dev --name add_user_bio

# Appliquer en production
pnpm prisma migrate deploy
```

### Q: Comment débuguer le WebSocket?

**A**: Utiliser `wscat` (CLI) ou browser DevTools:

```bash
# CLI
npm install -g wscat
wscat -c ws://localhost:3001 -H "Authorization: Bearer YOUR_JWT"

# Envoyer un message
> {"type": "message.send", "data": {"conversationId": "123", "content": "..."}}
```

**Browser**:

```javascript
const ws = new WebSocket('ws://localhost:3001');
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'YOUR_JWT',
  }));
};
ws.onmessage = (event) => console.log('Received:', event.data);
```

### Q: Comment tester l'E2EE localement?

**A**: Utiliser deux navigateurs/users différents:

1. Chrome: Login comme Alice
2. Firefox: Login comme Bob
3. Alice envoie un message à Bob
4. Vérifier dans DevTools → Application → IndexedDB:
   - `signalProtocolStore` contient les clés
   - Messages dans la DB sont chiffrés (blob)

### Q: Comment contribuer à la documentation?

**A**: Les docs sont dans `/docs`. Pour modifier:

```bash
vim docs/guides/developer-guide.md
git commit -m "docs: update developer guide with FAQ"
git push
```

Les docs sont versionnées avec le code. Toute PR modifiant une feature doit aussi mettre à jour la doc.

---

## Ressources utiles

### Liens internes

- [Specs techniques](../specs.md)
- [Architecture database](../architecture/database-schema.md)
- [Crypto implementation](../security/encryption.md)
- [API Reference](./api-reference.md)
- [Threat Model](./threat-model.md)

### Ressources externes

- **NestJS**: https://docs.nestjs.com/
- **Next.js**: https://nextjs.org/docs
- **Prisma**: https://www.prisma.io/docs
- **React Native**: https://reactnative.dev/docs
- **Signal Protocol**: https://signal.org/docs/
- **TypeScript**: https://www.typescriptlang.org/docs

### Outils recommandés

| Outil | Usage |
|-------|-------|
| **VS Code** | IDE principal (extensions: Prisma, ESLint, Prettier) |
| **Postman/Insomnia** | Tester l'API REST |
| **DBeaver** | Client PostgreSQL (GUI) |
| **Flipper** | Debugger React Native |
| **Docker Desktop** | Containers locaux |

---

## Changelog

| Version | Date | Auteur | Changements |
|---------|------|--------|-------------|
| 1.0.0 | 2025-12-04 | Engineering Team | Création initiale |

---

**Questions?** Contactez l'équipe sur Slack: `#secure-messenger-dev` 🚀
