# Phase 8 : Recherche & Indexation

**Durée estimée** : 1–2 semaines  
**Objectif** : Implémenter un système de recherche performant compatible E2E avec indexation client-side

---

## 📋 Livrables

### 1. Indexation Full-Text
- ✅ Client-side indexing après déchiffrement
- ✅ Web Worker pour éviter blocage UI
- ✅ Index en mémoire avec Map/Set optimisées
- ✅ Export batch depuis backend (1000 messages/requête)

### 2. Filtres de Recherche
- ✅ Date range (après/avant)
- ✅ Type de message (text/media/file)
- ✅ Expéditeur (senderId)
- ✅ Conversation (conversationId)
- ✅ Case sensitive toggle

### 3. Surlignage Résultats
- ✅ Extraction de snippets avec contexte (50 chars avant/après)
- ✅ Highlighting avec `<mark>` tag
- ✅ Affichage max 3 highlights par message

### 4. Performance
- ⏳ p95 < 300ms sur 10M messages (tests en cours)
- ✅ Pagination avec curseur
- ⏳ Indexes PostgreSQL (créés mais non testés)

---

## 🏗️ Architecture

### Contrainte E2E Encryption

**Problème** : Le backend ne peut pas indexer le contenu chiffré (`ciphertext`).  
**Solution** : Approche hybride

```
┌─────────────────────────────────────────────┐
│              Backend (NestJS)               │
│                                             │
│  ✅ Recherche métadonnées                  │
│     - conversationId, senderId, type       │
│     - Date range (createdAt)               │
│     - Pagination curseur                   │
│                                             │
│  ✅ Export batch pour client               │
│     - GET /search/conversation-export      │
│     - Retourne ciphertext + metadata       │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│           Frontend (Next.js)                │
│                                             │
│  ✅ Déchiffrement messages                 │
│  ✅ Indexation locale (Map + Set)          │
│  ✅ Full-text search dans plaintext        │
│  ✅ Web Worker pour async indexing         │
│  ✅ UI avec SearchBar + Filters            │
└─────────────────────────────────────────────┘
```

### Flux de Recherche

1. **Indexation initiale** (au chargement conversation)
   - Backend : `GET /search/conversation-export?conversationId=X&batchSize=1000`
   - Worker : Déchiffre batch et ajoute à l'index
   - Répète jusqu'à tous les messages indexés

2. **Recherche utilisateur**
   - User : Tape "hello" dans SearchBar
   - Worker : `searchWithHighlight("hello", { conversationId, after, before })`
   - UI : Affiche résultats avec highlights

3. **Navigation résultat**
   - User : Clic sur résultat
   - App : Scroll vers message dans ChatScreen
   - Message : Highlight temporaire (flash jaune)

---

## 📊 Modèles de Données

### Backend : Message (existant)
```prisma
model Message {
  id              String   @id @default(uuid())
  conversationId  String
  senderId        String
  ciphertext      Bytes    // Contenu chiffré
  iv              Bytes
  createdAt       DateTime @default(now())
  type            MessageType
  
  @@index([conversationId, createdAt])
  @@index([senderId, createdAt])
}
```

**Indexes clés** :
- `(conversationId, createdAt)` : Recherche par conversation + tri chrono
- `(senderId, createdAt)` : Recherche par expéditeur

### Frontend : IndexedMessage
```typescript
interface IndexedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  plaintext: string;        // Déchiffré
  createdAt: Date;
  type: 'text' | 'media' | 'file';
}
```

**Structure index** :
```typescript
class ClientSearchIndex {
  private messages: Map<string, IndexedMessage>;
  private conversationIndex: Map<string, Set<string>>;
  
  search(query: string, options: SearchOptions): IndexedMessage[]
  searchWithHighlight(query: string): IndexedMessage & { highlights }[]
}
```

---

## 🔌 API Endpoints

### 1. Recherche Métadonnées
```http
GET /api/messages/search/messages
Query params:
  - q: string (optionnel, pour future extension)
  - conversationId: string
  - senderId: string (optionnel)
  - type: 'text' | 'media' | 'file' (optionnel)
  - after: ISO date (optionnel)
  - before: ISO date (optionnel)
  - limit: number (default 50, max 100)
  - cursor: string (pagination)

Response:
{
  messages: Message[],
  pagination: { nextCursor: string | null, hasMore: boolean }
}
```

### 2. Export pour Indexation
```http
GET /api/messages/search/conversation-export
Query params:
  - conversationId: string
  - batchSize: number (default 1000, max 1000)
  - offset: number (default 0)

Response:
{
  messages: Array<{
    id: string,
    conversationId: string,
    senderId: string,
    ciphertext: string (Base64),
    sharedKey: string (Base64),
    createdAt: string (ISO),
    type: 'text' | 'media' | 'file'
  }>,
  hasMore: boolean
}
```

### 3. Statistiques
```http
GET /api/messages/search/stats
Query params:
  - conversationId: string

Response:
{
  totalMessages: number,
  mediaMessages: number,
  textMessages: number,
  oldestMessage: ISO date,
  newestMessage: ISO date
}
```

---

## 🎨 Composants UI

### 1. SearchModal
**Fichier** : `apps/web/src/components/SearchModal.tsx`

**Responsabilités** :
- Gère le Web Worker (init/terminate)
- Charge messages pour indexation
- Affiche SearchBar + SearchResultsList
- Navigation résultats

**Shortcuts** :
- `Cmd+K` / `Ctrl+K` : Ouvrir modal
- `ESC` : Fermer modal
- `Enter` : Exécuter recherche

### 2. SearchBar
**Fichier** : `apps/web/src/components/SearchBar.tsx`

**Features** :
- Input avec autocomplete
- Recherches récentes (localStorage, max 10)
- Toggle filtres avancés
- Badge compteur filtres actifs

### 3. SearchResultsList
**Fichier** : `apps/web/src/components/SearchResultsList.tsx`

**Features** :
- Liste scrollable (max-height: 600px)
- Highlighting avec `<mark>`
- Type badge (text/media/file)
- Timestamp relatif ("il y a 2h")
- Empty state / Loading state

### 4. ClientSearchIndex
**Fichier** : `apps/web/src/lib/client-search.ts`

**Méthodes** :
```typescript
addMessage(id, conversationId, senderId, ciphertext, sharedKey, createdAt, type)
search(query, options): IndexedMessage[]
searchWithHighlight(query, options): Array<IndexedMessage & { highlights }>
clearConversation(conversationId)
clearAll()
getStats(): { totalMessages, conversations, memoryUsage }
```

### 5. SearchWorker
**Fichier** : `apps/web/src/lib/search-worker.ts`

**Messages** :
- `INDEX_BATCH` : Indexe un batch de messages
- `SEARCH` : Exécute une recherche
- `CLEAR` : Nettoie l'index
- `STATS` : Retourne statistiques

---

## ⚡ Optimisations Performance

### Backend

#### 1. Indexes PostgreSQL
```sql
-- Index composite pour recherche par conversation + tri date
CREATE INDEX idx_messages_conv_date 
ON "Message" (conversation_id, created_at DESC);

-- Index pour recherche par expéditeur
CREATE INDEX idx_messages_sender_date 
ON "Message" (sender_id, created_at DESC);

-- Index pour type de message
CREATE INDEX idx_messages_type 
ON "Message" (type);
```

#### 2. Pagination Curseur
```typescript
// Éviter OFFSET qui devient lent sur gros datasets
const messages = await prisma.message.findMany({
  where: { conversationId, createdAt: { lt: cursor } },
  orderBy: { createdAt: 'desc' },
  take: limit,
});
```

#### 3. Requêtes Optimisées
```typescript
// EXPLAIN ANALYZE pour vérifier plans d'exécution
await prisma.$queryRaw`
  EXPLAIN ANALYZE
  SELECT * FROM "Message" 
  WHERE conversation_id = ${conversationId}
  AND created_at > ${after}
  ORDER BY created_at DESC
  LIMIT 50
`;
```

### Frontend

#### 1. Web Worker
```typescript
// Éviter blocage UI pendant indexation
const worker = new Worker(new URL('./search-worker.ts', import.meta.url));
worker.postMessage({ type: 'INDEX_BATCH', payload: { messages } });
```

#### 2. Debouncing
```typescript
// Éviter recherches à chaque frappe
const debouncedSearch = useMemo(
  () => debounce((query) => handleSearch(query), 300),
  []
);
```

#### 3. Virtualisation (si > 10k résultats)
```typescript
// Utiliser react-window pour liste virtualisée
import { FixedSizeList } from 'react-window';
```

---

## 🧪 Tests

### Backend : Performance Tests

**Fichier** : `apps/backend/src/messages/tests/search.performance.spec.ts`

```typescript
describe('SearchService Performance', () => {
  let service: SearchService;
  
  beforeAll(async () => {
    // Seed 10M messages
    await seedMessages(10_000_000);
  });
  
  it('should return results in < 300ms (p95)', async () => {
    const latencies: number[] = [];
    
    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      await service.searchMessages(userId, { conversationId });
      latencies.push(Date.now() - start);
    }
    
    const p95 = percentile(latencies, 95);
    expect(p95).toBeLessThan(300);
  });
  
  it('should use indexes (EXPLAIN)', async () => {
    const explain = await prisma.$queryRaw`
      EXPLAIN ANALYZE
      SELECT * FROM "Message"
      WHERE conversation_id = 'test'
      ORDER BY created_at DESC
      LIMIT 50
    `;
    
    // Vérifier "Index Scan" présent
    expect(explain).toContain('Index Scan');
  });
});
```

### Frontend : Integration Tests

**Fichier** : `apps/web/src/__tests__/search.test.tsx`

```typescript
describe('SearchModal', () => {
  it('should index messages in worker', async () => {
    render(<SearchModal isOpen={true} />);
    
    // Attendre indexation
    await waitFor(() => {
      expect(screen.queryByText('Indexation en cours')).not.toBeInTheDocument();
    });
  });
  
  it('should highlight matches', async () => {
    render(<SearchModal isOpen={true} />);
    
    const input = screen.getByPlaceholderText('Rechercher');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    await waitFor(() => {
      const highlights = screen.getAllByRole('mark');
      expect(highlights.length).toBeGreaterThan(0);
    });
  });
});
```

### E2E : Playwright

**Fichier** : `apps/web/e2e/search.spec.ts`

```typescript
test('full search flow', async ({ page }) => {
  // Login + ouvrir conversation
  await page.goto('/chat/conv-123');
  
  // Ouvrir search modal
  await page.keyboard.press('Meta+K');
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  
  // Rechercher
  await page.fill('input[placeholder*="Rechercher"]', 'test message');
  await page.keyboard.press('Enter');
  
  // Vérifier résultats
  await expect(page.locator('text=résultats trouvés')).toBeVisible();
  
  // Cliquer résultat
  await page.click('button:has-text("test message")');
  
  // Vérifier navigation
  await expect(page.locator('.message.highlighted')).toBeVisible();
});
```

---

## 📈 DoD (Definition of Done)

### Critères

- [x] **Backend SearchService** : Endpoints métadonnées + export créés
- [x] **ClientSearchIndex** : Index local fonctionnel avec search/highlight
- [x] **Web Worker** : Indexation async sans blocage UI
- [x] **UI Composants** : SearchBar, ResultsList, Modal créés
- [x] **Filtres** : Date range, type, sender, conversation
- [x] **Highlighting** : Snippets avec `<mark>` tag
- [ ] **Tests Performance** : p95 < 300ms validé sur 10M messages
- [ ] **Tests E2E** : Scénario complet Playwright
- [ ] **Documentation** : README + inline comments

### Validation Performance

**Commande** :
```bash
# Seed database
npm run seed:messages -- --count=10000000

# Run performance tests
npm test search.performance.spec.ts

# Résultat attendu :
# ✓ p50: 45ms
# ✓ p95: 280ms ← DoD
# ✓ p99: 450ms
```

**Métriques** :
| Métrique | Target | Actuel | Status |
|----------|--------|--------|--------|
| p50      | < 100ms | ⏳ TBD | ⏳     |
| p95      | < 300ms | ⏳ TBD | ⏳     |
| p99      | < 500ms | ⏳ TBD | ⏳     |

---

## 🔐 Sécurité

### 1. Authorization
```typescript
// Vérifier que user a accès à la conversation
const participant = await prisma.conversationParticipant.findUnique({
  where: {
    conversationId_userId: { conversationId, userId },
  },
});

if (!participant) {
  throw new ForbiddenException('Access denied');
}
```

### 2. Rate Limiting
```typescript
// Limiter requêtes search (éviter scraping)
@Throttle({ default: { limit: 20, ttl: 60000 } }) // 20/min
@Get('/search/messages')
async search() { ... }
```

### 3. Sanitization
```typescript
// Échapper caractères spéciaux dans query
const sanitized = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

---

## 🚀 Déploiement

### Backend

1. **Migration** (déjà créée en Phase 7, indexes ajoutés)
```bash
cd apps/backend
npx prisma migrate deploy
```

2. **Restart services**
```bash
docker-compose restart backend
```

### Frontend

1. **Build Next.js**
```bash
cd apps/web
npm run build
```

2. **Vérifier Web Worker**
```bash
# Worker doit être dans _next/static/chunks/
ls .next/static/chunks/search-worker*
```

---

## 📚 Références

- [Web Workers MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [PostgreSQL Full-Text Search](https://www.postgresql.org/docs/current/textsearch.html)
- [Next.js Web Workers](https://nextjs.org/docs/app/building-your-application/optimizing/web-workers)
- [Fuse.js Fuzzy Search](https://fusejs.io/)

---

## 🔮 Améliorations Futures

### Phase 8.1 : Fuzzy Search
- Intégrer Fuse.js pour tolérance fautes frappe
- Score de pertinence (TF-IDF)
- Suggestions "Vouliez-vous dire..."

### Phase 8.2 : Redis Cache
- Cache résultats fréquents (hot queries)
- Invalidation cache sur nouveaux messages
- TTL 5 minutes

### Phase 8.3 : Elasticsearch
- Migration vers Elasticsearch si > 100M messages
- Analyzers linguistiques (stemming français)
- Aggregations faceted search

### Phase 8.4 : Search Analytics
- Tracking queries populaires
- A/B testing ranking algorithms
- Métriques engagement (CTR résultats)

---

**Status** : ✅ Backend complet | ✅ Frontend UI créé | ⏳ Tests performance en attente
