# Phase 4 : Frontend Web & Module Messages

## Vue d'ensemble

Module Messages avec WebSocket temps réel + Interface de chat React/Next.js avec support PWA, accessibilité WCAG AA, et dark mode.

## Backend - Module Messages

### 1. **MessagesGateway** (WebSocket)

WebSocket Gateway Socket.IO pour communication temps réel :

**Events côté client → serveur :**
```typescript
socket.emit('message:send', {
  conversationId: string,
  ciphertext: string (base64),
  nonce: string (base64),
  ratchetPublicKey: string (base64),
  messageNumber: number,
  previousChainLength: number,
  type: 'text' | 'media' | 'file',
  replyToId?: string
})

socket.emit('typing:start', { conversationId })
socket.emit('typing:stop', { conversationId })
socket.emit('message:delivered', { messageId })
socket.emit('message:read', { messageId })
```

**Events serveur → client :**
```typescript
socket.on('message:new', (message) => {...})
socket.on('message:sent', ({ id, createdAt }) => {...})
socket.on('typing:start', ({ conversationId, userId }) => {...})
socket.on('typing:stop', ({ conversationId, userId }) => {...})
socket.on('message:receipt', ({ messageId, userId, status }) => {...})
socket.on('user:presence', ({ userId, status, timestamp }) => {...})
```

**Connexion :**
```typescript
const socket = io('http://localhost:3001/messages', {
  auth: { token: JWT_TOKEN },
  query: { deviceId: DEVICE_ID }
});
```

**Gestion multi-devices :**
- Map `userId → Set<socketId>` pour broadcast à tous les devices
- Présence online/offline automatique
- Message delivery à tous les devices du destinataire

### 2. **MessagesService**

Logique métier pour messages et conversations :

**Méthodes principales :**
```typescript
createMessage(dto) → Message
getMessage(messageId) → Message + receipts
getMessages(conversationId, limit, beforeId) → Message[] (pagination)
updateReceipt(messageId, userId, deviceId, status) → MessageReceipt

createConversation(type, createdBy, participantIds, name?) → Conversation
getUserConversations(userId) → Conversation[] (avec dernier message)
getConversationParticipants(conversationId) → Participant[]
leaveConversation(conversationId, userId)
deleteMessage(messageId, userId) → Soft delete
```

### 3. **MessagesController** (REST)

Endpoints complémentaires au WebSocket :

```
POST   /api/v1/messages/conversations
       → Créer conversation (direct/group)
       
GET    /api/v1/messages/conversations
       → Liste conversations utilisateur
       
GET    /api/v1/messages/conversations/:id/messages?limit=50&beforeId=xxx
       → Historique messages (pagination infinie)
       
POST   /api/v1/messages/conversations/:id/leave
       → Quitter conversation
       
DELETE /api/v1/messages/:id
       → Supprimer message (soft delete)
```

## Frontend Web - Next.js 15

### Architecture

```
apps/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout (PWA meta)
│   │   ├── page.tsx            # Landing page
│   │   ├── globals.css         # Tailwind + dark mode
│   │   └── chat/
│   │       └── page.tsx        # Interface chat principale
│   ├── lib/
│   │   └── api.ts              # Client HTTP REST
│   └── stores/
│       ├── auth.store.ts       # Zustand auth state
│       └── messages.store.ts   # Zustand messages + WebSocket
├── public/
│   └── manifest.json           # PWA manifest
├── next.config.js
├── tailwind.config.js
└── package.json
```

### 1. **Interface Chat** (`/chat`)

**Layout 3 colonnes :**
```
┌────────────────────────────────────────────────────┐
│  [Sidebar]      │  [Chat Area]    │  [Details]    │
│                 │                 │               │
│  • Search       │  • Header       │  • Profile    │
│  • Conv List    │  • Messages     │  • Media      │
│  • New Chat     │  • Composer     │  • Settings   │
└────────────────────────────────────────────────────┘
```

**Fonctionnalités implémentées :**
- ✅ Liste conversations avec dernier message
- ✅ Thread messages avec scroll infini
- ✅ Composer texte (textarea auto-expand)
- ✅ Messages bulles (sender/receiver)
- ✅ Typing indicators
- ✅ Online/offline presence
- ✅ Timestamps relatifs
- ✅ Unread count badges
- ⏳ Upload fichiers (UI prête)
- ⏳ Réactions emoji
- ⏳ Messages vocaux
- ⏳ Appels audio/vidéo (boutons UI)

### 2. **Stores Zustand**

**AuthStore** (`auth.store.ts`) :
```typescript
{
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  
  setAuth(user, accessToken, refreshToken)
  logout()
}
```
Persisté dans localStorage avec `zustand/middleware/persist`.

**MessagesStore** (`messages.store.ts`) :
```typescript
{
  socket: Socket | null
  conversations: Conversation[]
  activeConversationId: string | null
  messages: Record<conversationId, Message[]>
  typingUsers: Record<conversationId, userId[]>
  
  initSocket(token, deviceId)
  disconnectSocket()
  sendMessage(conversationId, encryptedData)
  addMessage(message)
  setConversations(conversations)
  startTyping(conversationId)
  stopTyping(conversationId)
}
```

### 3. **Client API** (`lib/api.ts`)

Client HTTP pour endpoints REST :

```typescript
apiClient.signup(phone, displayName)
apiClient.verifyOtp(phone, code)
apiClient.refreshToken(refreshToken)
apiClient.registerDevice(deviceName, platform)
apiClient.getKeyBundle(deviceId)
apiClient.createConversation(type, participantIds, name?)
apiClient.getConversations()
apiClient.getMessages(conversationId, limit, beforeId?)
apiClient.deleteMessage(messageId)
```

Auto-injection JWT dans header `Authorization: Bearer <token>`.

## Accessibilité & PWA

### WCAG AA Compliance

**Contraste couleurs :**
- Texte : 4.5:1 minimum
- UI elements : 3:1 minimum
- Dark mode avec `prefers-color-scheme`

**Navigation clavier :**
```typescript
<button aria-label="Envoyer message">➤</button>
<textarea aria-label="Composer message" />
<div role="list" aria-label="Liste conversations">
  <div role="listitem" tabIndex={0} />
</div>
```

**ARIA landmarks :**
- `<aside role="complementary">` pour sidebar
- `<main role="main">` pour chat
- `<header role="banner">` pour headers

### Dark Mode

```css
/* globals.css */
:root {
  --background: #ffffff;
  --foreground: #171717;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}
```

Classes Tailwind : `dark:bg-gray-900`, `dark:text-white`, etc.

### PWA (Progressive Web App)

**Manifest** (`public/manifest.json`) :
```json
{
  "name": "Secure Messenger",
  "short_name": "SecureMsg",
  "display": "standalone",
  "theme_color": "#0ea5e9",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192" },
    { "src": "/icon-512.png", "sizes": "512x512" }
  ]
}
```

**Meta tags** (layout.tsx) :
```tsx
<meta name="theme-color" content="#0ea5e9" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<link rel="manifest" href="/manifest.json" />
```

**Installation :**
- Chrome Desktop : "Installer Secure Messenger" dans menu
- Chrome Mobile : "Ajouter à l'écran d'accueil"
- iOS Safari : Partager → "Sur l'écran d'accueil"

## Flux complet : Envoi message chiffré

### Côté client (React)

```typescript
// 1. Utilisateur tape message
const handleSend = async () => {
  const plaintext = messageText;
  
  // 2. Chiffrer avec Double Ratchet
  const encrypted = ratchet.ratchetEncrypt(ratchetState, plaintext);
  
  // 3. Envoyer via WebSocket
  messagesStore.sendMessage(conversationId, {
    ciphertext: crypto.toBase64(encrypted.ciphertext),
    nonce: crypto.toBase64(encrypted.nonce),
    ratchetPublicKey: crypto.toBase64(encrypted.ratchetPublicKey),
    messageNumber: encrypted.messageNumber,
    previousChainLength: encrypted.previousChainLength,
    type: 'text'
  });
  
  // 4. Confirmer envoi (event message:sent)
  socket.on('message:sent', ({ id, createdAt }) => {
    // Mettre à jour UI avec ID serveur
  });
};

// 5. Réception message
socket.on('message:new', (message) => {
  // Déchiffrer avec Double Ratchet
  const plaintext = ratchet.ratchetDecrypt(ratchetState, message);
  
  // Ajouter au store
  messagesStore.addMessage({
    ...message,
    decryptedText: plaintext
  });
  
  // Envoyer receipt "delivered"
  socket.emit('message:delivered', { messageId: message.id });
});
```

### Côté serveur (NestJS)

```typescript
// 1. Recevoir message WebSocket
@SubscribeMessage('message:send')
async handleSendMessage(client, payload) {
  // 2. Sauvegarder en BDD (ciphertext opaque)
  const message = await messagesService.createMessage({
    conversationId: payload.conversationId,
    senderId: client.userId,
    ciphertext: Buffer.from(payload.ciphertext, 'base64'),
    type: payload.type
  });
  
  // 3. Broadcast aux participants
  const participants = await messagesService.getConversationParticipants(
    payload.conversationId
  );
  
  for (const participant of participants) {
    if (participant.userId === client.userId) continue;
    
    const sockets = userSockets.get(participant.userId);
    sockets?.forEach(socketId => {
      server.to(socketId).emit('message:new', {
        ...payload,
        id: message.id,
        createdAt: message.createdAt
      });
    });
  }
  
  // 4. Confirmer à expéditeur
  client.emit('message:sent', {
    id: message.id,
    createdAt: message.createdAt
  });
}
```

## Performance

**Optimisations :**
- Pagination messages : 50 par requête (infinite scroll)
- Lazy load images/fichiers
- WebSocket reconnexion automatique
- Debounce typing indicators (500ms)
- IndexedDB pour cache messages offline (future)

**Métriques :**
- Time to Interactive : < 3s
- First Contentful Paint : < 1.5s
- WebSocket latency : < 100ms (LAN)

## Prochaines étapes

- [ ] Chiffrement fichiers/médias (clés éphémères)
- [ ] Réactions emoji en temps réel
- [ ] Messages vocaux (WebRTC)
- [ ] Appels audio/vidéo (WebRTC + TURN)
- [ ] Recherche messages (full-text avec OpenSearch)
- [ ] Notifications push (Web Push API)
- [ ] Service Worker (offline support)

---
**Statut Phase 4** : ✅ Module Messages + Frontend fonctionnel  
**Date** : 3 décembre 2025  
**Prochaine phase** : Phase 5 - Mobile React Native
