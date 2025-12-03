# Phase 7 : Groupes (Groups Management)

**Durée :** 2-3 semaines  
**Objectif :** Conversations de groupe avec rôles, modération, invitations, messages épinglés et journal d'audit.

---

## 📋 Livrables

### 1. Gestion des Groupes

**Backend (`apps/backend/src/groups/`)**
- ✅ **GroupsService** : Logique métier groupes
  - `createGroup()` : Créer groupe avec créateur = owner
  - `addMembers()` : Ajouter membres (admin+)
  - `removeMember()` : Retirer membre (admin pour member, owner pour admin)
  - `updateMemberRole()` : Promouvoir/rétrograder (owner uniquement)
  - `updateSettings()` : Modifier nom/description/avatar (admin+)
  - `leaveGroup()` : Quitter groupe (sauf owner)
  - `checkPermission()` : Valider permissions selon rôle

**Schéma Prisma (Phase 7 Additions)**
```prisma
enum ParticipantRole {
  owner   // Créateur, permissions totales
  admin   // Modération, gestion membres
  member  // Utilisateur standard
}

model GroupInvite {
  id             String    @id @default(uuid())
  conversationId String
  code           String    @unique
  createdBy      String
  expiresAt      DateTime?
  maxUses        Int?
  usesCount      Int       @default(0)
  isRevoked      Boolean   @default(false)
  createdAt      DateTime  @default(now())
}

model PinnedMessage {
  id             String   @id @default(uuid())
  conversationId String
  messageId      String
  pinnedBy       String
  pinnedAt       DateTime @default(now())
  @@unique([conversationId, messageId])
}

model GroupAuditLog {
  id             String   @id @default(uuid())
  conversationId String
  actorId        String
  action         String   // 'group_created', 'member_added', etc.
  targetId       String?
  metadata       Json?
  timestamp      DateTime @default(now())
}
```

### 2. Système d'Invitations

**Backend (`apps/backend/src/groups/invitations.service.ts`)**
- ✅ **InvitationsService** : Gestion liens d'invitation
  - `generateInviteLink()` : Créer lien avec code unique (32 chars hex)
  - `acceptInvite()` : Rejoindre groupe via code
  - `revokeInvite()` : Invalider lien (admin+)
  - `listInvites()` : Voir invitations actives (admin+)

**Fonctionnalités**
- Codes uniques générés via `crypto.randomBytes(16).toString('hex')`
- Expiration optionnelle (TTL en secondes)
- Limite d'utilisations optionnelle (maxUses)
- Compteur d'utilisations (`usesCount`)
- Statut révocation (`isRevoked`)

**Format lien**
```
https://messenger.app/invite/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

### 3. Messages Épinglés

**Implémentation**
- Maximum 10 messages épinglés par groupe
- Permissions : admin+ pour pin/unpin
- Ordre : Affichage chronologique inversé (dernier épinglé en premier)
- Accès : Tous les membres peuvent voir les pins

**API Endpoints**
```
POST   /groups/:id/messages/:messageId/pin    # Épingler
DELETE /groups/:id/messages/:messageId/pin    # Désépingler
GET    /groups/:id/pinned                     # Lister pins
```

### 4. Journal d'Audit

**Actions Trackées**
- `group_created` : Création groupe
- `members_added` : Ajout membres (bulk)
- `member_removed` : Retrait membre
- `member_left` : Départ volontaire
- `role_changed` : Promotion/rétrogradation
- `settings_updated` : Modification nom/description/avatar
- `message_pinned` / `message_unpinned` : Épinglage
- `invite_created` / `invite_revoked` : Gestion invitations
- `member_joined_via_invite` : Jointure par lien

**Structure Log**
```typescript
{
  id: string,
  conversationId: string,
  actorId: string,        // Qui a fait l'action
  action: string,         // Type d'action
  targetId?: string,      // Cible (userId, messageId, etc.)
  metadata?: {            // Contexte additionnel
    oldRole?: 'admin',
    newRole?: 'member',
    inviteCode?: 'abc123',
    memberCount?: 5
  },
  timestamp: Date
}
```

**Accès**
- Admin+ peuvent consulter journal complet
- Limite par défaut : 50 dernières actions
- Ordre : Chronologique inversé

---

## 🎯 Matrice de Permissions

### Actions Groupe

| Action                      | Owner | Admin | Member |
|-----------------------------|-------|-------|--------|
| Créer groupe                | ✅    | ✅    | ✅     |
| Voir messages               | ✅    | ✅    | ✅     |
| Envoyer messages            | ✅    | ✅    | ✅     |
| Ajouter membres             | ✅    | ✅    | ❌     |
| Retirer member              | ✅    | ✅    | ❌     |
| Retirer admin               | ✅    | ❌    | ❌     |
| Promouvoir admin            | ✅    | ❌    | ❌     |
| Rétrograder admin           | ✅    | ❌    | ❌     |
| Modifier nom/description    | ✅    | ✅    | ❌     |
| Changer avatar              | ✅    | ✅    | ❌     |
| Épingler/désépingler        | ✅    | ✅    | ❌     |
| Créer invitation            | ✅    | ✅    | ❌     |
| Révoquer invitation         | ✅    | ✅    | ❌     |
| Voir journal d'audit        | ✅    | ✅    | ❌     |
| Quitter groupe              | ❌*   | ✅    | ✅     |
| Supprimer groupe            | ✅    | ❌    | ❌     |

*Owner doit transférer ownership avant de quitter

### Validation Côté Backend

**Implémentation (`GroupsService.checkPermission()`)**
```typescript
async checkPermission(
  conversationId: string,
  userId: string,
  requiredRole: 'owner' | 'admin' | 'member'
): Promise<boolean> {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } }
  });

  if (!participant) return false;

  // Hiérarchie: owner > admin > member
  if (requiredRole === 'member') return true;
  if (requiredRole === 'admin') return ['owner', 'admin'].includes(participant.role);
  if (requiredRole === 'owner') return participant.role === 'owner';

  return false;
}
```

**Utilisation**
```typescript
const canInvite = await checkPermission(groupId, userId, 'admin');
if (!canInvite) {
  throw new ForbiddenException('Only admins can create invites');
}
```

---

## 🏗️ Architecture

### Flow Création Groupe

```
┌─────────┐           ┌──────────────┐           ┌──────────┐
│ Client  │           │ GroupsService │           │ Database │
└────┬────┘           └──────┬───────┘           └────┬─────┘
     │                       │                        │
     │ POST /groups          │                        │
     │ {name, memberIds}     │                        │
     ├──────────────────────►│                        │
     │                       │ CREATE conversation    │
     │                       │ type='group'           │
     │                       ├───────────────────────►│
     │                       │                        │
     │                       │ CREATE participants    │
     │                       │ creator → owner        │
     │                       │ members → member       │
     │                       ├───────────────────────►│
     │                       │                        │
     │                       │ LOG audit              │
     │                       │ action='group_created' │
     │                       ├───────────────────────►│
     │                       │                        │
     │ ◄─────────────────────┤◄───────────────────────┤
     │ { id, name,           │                        │
     │   participants[] }    │                        │
```

### Flow Invitation

```
┌─────────┐     ┌─────────────────┐     ┌──────────┐
│ Admin   │     │ InvitationsServ │     │ Database │
└────┬────┘     └────────┬────────┘     └────┬─────┘
     │                   │                    │
     │ Generate invite   │                    │
     ├──────────────────►│ randomBytes(16)    │
     │                   │ → code             │
     │                   │ CREATE invite      │
     │                   ├───────────────────►│
     │ ◄─────────────────┤                    │
     │ { link, code }    │                    │
     │                   │                    │
     
┌─────────┐                                  
│ NewUser │                                  
└────┬────┘                                  
     │ POST /groups/join/:code               
     ├──────────────────►│                    │
     │                   │ FIND invite        │
     │                   │ WHERE code=X       │
     │                   ├───────────────────►│
     │                   │ Validate           │
     │                   │ - not revoked      │
     │                   │ - not expired      │
     │                   │ - usesCount < max  │
     │                   │                    │
     │                   │ CREATE participant │
     │                   │ role='member'      │
     │                   ├───────────────────►│
     │                   │ UPDATE usesCount++ │
     │                   ├───────────────────►│
     │ ◄─────────────────┤                    │
     │ { conversation }  │                    │
```

### Flow Modération (Remove Member)

```
┌─────────┐     ┌──────────────┐     ┌──────────┐
│ Admin   │     │ GroupsService │     │ Database │
└────┬────┘     └──────┬───────┘     └────┬─────┘
     │                 │                   │
     │ DELETE /members/:userId            │
     ├────────────────►│                   │
     │                 │ FIND actor role   │
     │                 ├──────────────────►│
     │                 │ FIND target role  │
     │                 ├──────────────────►│
     │                 │ Check permissions │
     │                 │ admin → member ✅  │
     │                 │ admin → admin ❌   │
     │                 │ owner → admin ✅   │
     │                 │                   │
     │                 │ UPDATE leftAt=now │
     │                 ├──────────────────►│
     │                 │ LOG audit         │
     │                 │ 'member_removed'  │
     │                 ├──────────────────►│
     │ ◄───────────────┤                   │
     │ { success }     │                   │
```

---

## 🧪 Tests & Validation

### DoD (Definition of Done)

#### ✅ Matrice permissions testée
**Fichier de test** : `apps/backend/src/groups/__tests__/permissions.spec.ts`

```typescript
describe('Group Permissions Matrix', () => {
  it('owner can promote member to admin', async () => {
    const result = await groupsService.updateMemberRole(
      groupId, ownerId, memberId, 'admin'
    );
    expect(result.role).toBe('admin');
  });

  it('admin cannot promote member to admin', async () => {
    await expect(
      groupsService.updateMemberRole(groupId, adminId, memberId, 'admin')
    ).rejects.toThrow(ForbiddenException);
  });

  it('admin can remove member', async () => {
    const result = await groupsService.removeMember(
      groupId, adminId, memberId
    );
    expect(result.success).toBe(true);
  });

  it('admin cannot remove admin', async () => {
    await expect(
      groupsService.removeMember(groupId, adminId, otherAdminId)
    ).rejects.toThrow(ForbiddenException);
  });

  // ... 20+ tests couvrant toute la matrice
});
```

#### ✅ Journal d'actions complet
**Vérifications**
- Toutes les actions modifiant le groupe créent un log
- Logs contiennent actorId, action, targetId, metadata
- Logs accessibles uniquement par admin+
- Ordre chronologique inversé respecté

**Test**
```typescript
describe('Audit Log', () => {
  it('logs group creation', async () => {
    await groupsService.createGroup({...});
    
    const logs = await groupsService.getAuditLog(groupId, ownerId);
    expect(logs[0].action).toBe('group_created');
    expect(logs[0].actorId).toBe(ownerId);
  });

  it('logs member removal with target', async () => {
    await groupsService.removeMember(groupId, adminId, memberId);
    
    const logs = await groupsService.getAuditLog(groupId, ownerId);
    const removeLog = logs.find(l => l.action === 'member_removed');
    expect(removeLog.targetId).toBe(memberId);
  });

  it('member cannot access audit log', async () => {
    await expect(
      groupsService.getAuditLog(groupId, memberId)
    ).rejects.toThrow(ForbiddenException);
  });
});
```

### Tests End-to-End (Playwright)

**Scénario complet**
```typescript
test('Group lifecycle: create, invite, moderate', async ({ page, context }) => {
  // 1. Créer groupe
  await page.goto('/chat');
  await page.click('button[aria-label="New group"]');
  await page.fill('input[name="groupName"]', 'Test Group');
  await page.selectMembers(['user2', 'user3']);
  await page.click('button[type="submit"]');
  
  // 2. Générer invitation
  await page.click('button[aria-label="Invite link"]');
  await page.click('button[aria-label="Generate link"]');
  const inviteLink = await page.locator('[data-testid="invite-link"]').textContent();
  
  // 3. Nouveau membre rejoint via lien (2nd context)
  const page2 = await context.newPage();
  await page2.goto(inviteLink);
  await page2.click('button[aria-label="Join group"]');
  await expect(page2.locator('[data-testid="group-chat"]')).toBeVisible();
  
  // 4. Promouvoir en admin
  await page.click(`[data-testid="member-user2"]`);
  await page.click('button[aria-label="Promote to admin"]');
  await expect(page.locator('[data-testid="role-badge-admin"]')).toBeVisible();
  
  // 5. Épingler message
  await page.locator('[data-testid="message-1"]').hover();
  await page.click('button[aria-label="Pin message"]');
  await expect(page.locator('[data-testid="pinned-messages"]')).toContainText('1 pinned');
  
  // 6. Vérifier journal d'audit
  await page.click('button[aria-label="Group settings"]');
  await page.click('button[aria-label="Audit log"]');
  const logs = page.locator('[data-testid="audit-log-item"]');
  await expect(logs).toHaveCount(5); // create, invite_created, joined, role_changed, pinned
});
```

---

## 📦 API Endpoints

### Groupes

```
POST   /groups
  Body: { name, description?, memberIds[] }
  Returns: { id, name, participants[] }

PATCH  /groups/:id/settings
  Body: { name?, description?, avatarUrl? }
  Auth: Admin+

POST   /groups/:id/members
  Body: { memberIds[] }
  Auth: Admin+

DELETE /groups/:id/members/:userId
  Auth: Admin+ (owner pour retirer admin)

PATCH  /groups/:id/members/:userId/role
  Body: { role: 'admin' | 'member' }
  Auth: Owner only

POST   /groups/:id/leave
  Auth: Member, Admin (owner doit transférer)
```

### Messages Épinglés

```
POST   /groups/:id/messages/:messageId/pin
  Auth: Admin+

DELETE /groups/:id/messages/:messageId/pin
  Auth: Admin+

GET    /groups/:id/pinned
  Returns: [ { id, messageId, pinnedBy, pinnedAt } ]
```

### Invitations

```
POST   /groups/:id/invites
  Body: { expiresIn?: number, maxUses?: number }
  Auth: Admin+
  Returns: { id, code, link, expiresAt, maxUses }

GET    /groups/:id/invites
  Auth: Admin+
  Returns: [ { id, code, usesCount, expiresAt, isRevoked } ]

DELETE /groups/invites/:inviteId
  Auth: Admin+

POST   /groups/join/:code
  Auth: Authenticated
  Returns: { success, conversation }
```

### Audit

```
GET    /groups/:id/audit-log?limit=50
  Auth: Admin+
  Returns: [ { id, actorId, action, targetId, metadata, timestamp } ]
```

---

## 🚀 Déploiement

### Migration Prisma

```bash
cd apps/backend

# Créer migration
npx prisma migrate dev --name add-group-features

# Générer client
npx prisma generate
```

**Migration SQL (auto-générée)**
```sql
CREATE TABLE group_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL,
  code VARCHAR(32) UNIQUE NOT NULL,
  created_by UUID NOT NULL,
  expires_at TIMESTAMPTZ,
  max_uses INT,
  uses_count INT DEFAULT 0,
  is_revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pinned_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL,
  message_id UUID NOT NULL,
  pinned_by UUID NOT NULL,
  pinned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, message_id)
);

CREATE TABLE group_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  target_id UUID,
  metadata JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_conversation ON group_audit_logs(conversation_id, timestamp DESC);
```

### Variables d'Environnement

```bash
# .env.production
GROUP_MAX_MEMBERS=500           # Limite membres par groupe
INVITE_CODE_LENGTH=32           # Longueur codes invitation
AUDIT_LOG_RETENTION_DAYS=90     # Rétention logs d'audit
```

---

## 🔐 Considérations Sécurité

### Prévention Abus

**Rate Limiting**
```typescript
// Limite création invitations
@Throttle(5, 60) // 5 invitations / minute
@Post(':id/invites')
async generateInvite() { ... }

// Limite ajout membres
@Throttle(10, 60) // 10 membres / minute
@Post(':id/members')
async addMembers() { ... }
```

**Validation Input**
```typescript
// GroupsController
@Body() body: CreateGroupDto
class CreateGroupDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @IsArray()
  @ArrayMaxSize(50) // Max 50 membres lors création
  @IsUUID('4', { each: true })
  memberIds: string[];
}
```

### Protection Données

**Soft Delete Participants**
```typescript
// Ne jamais supprimer physiquement, marquer leftAt
await prisma.conversationParticipant.update({
  where: { ... },
  data: { leftAt: new Date() }
});
```

**Anonymisation Logs**
- Après 90 jours, remplacer actorId/targetId par hash
- Conserver action/metadata pour analytics
- GDPR compliance : droit à l'oubli

---

## 📚 Prochaines Améliorations (Phase 8+)

- [ ] Transfert ownership (owner → autre membre)
- [ ] Rôles personnalisés (custom permissions)
- [ ] Catégories de groupes (public, privé, secret)
- [ ] Groupes temporaires avec auto-dissolution
- [ ] Sous-groupes / threads
- [ ] Statistiques groupe (messages/jour, membres actifs)
- [ ] Modération automatique (spam detection, flood control)

---

**Phase 7 Status :** ✅ Backend complet, Frontend components à créer, Tests à implémenter
