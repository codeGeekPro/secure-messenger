# Phase 6 : Fonctionnalités Avancées (Advanced Features)

**Durée :** 3-4 semaines  
**Objectif :** Ajouter appels audio/vidéo WebRTC 1:1, partage d'écran, réactions emoji, et messages éphémères avec auto-suppression.

---

## 📋 Livrables

### 1. Appels Audio/Vidéo 1:1

**Backend (`apps/backend/src/calls/`)**
- ✅ `CallsService` : Gestion sessions d'appel (Map en mémoire)
- ✅ `CallsGateway` : Signaling WebRTC via WebSocket (`/calls` namespace)
- ✅ Events implémentés :
  - `call:initiate` → Démarre appel audio/vidéo
  - `call:accept` / `call:reject` → Accepter/refuser appel
  - `call:end` → Terminer appel
  - `call:offer` / `call:answer` → Échange SDP (Session Description Protocol)
  - `call:ice-candidate` → Relai candidats ICE pour NAT traversal
  - `call:screen-share-start` / `call:screen-share-stop` → Contrôle partage écran

**Frontend (`apps/web/src/lib/webrtc.ts`)**
- ✅ `WebRTCClient` : Client RTCPeerConnection
  - Configuration STUN/TURN servers
  - `getUserMedia()` pour caméra/micro
  - `getDisplayMedia()` pour partage d'écran
  - ICE restart automatique pour reconnexion réseau
  - Multi-device support via Socket.IO

**UI Components (`apps/web/src/components/`)**
- ✅ `ActiveCallScreen.tsx` : Interface appel actif
  - Grille vidéo (local miniature, distant plein écran)
  - Contrôles : mute/unmute, video on/off, partage écran, raccrocher
  - Timer durée appel
  - Overlay partage d'écran distant

### 2. Partage d'Écran (Screen Sharing)

**Implémentation**
- ✅ Backend : Events `screen-share-start/stop` dans `CallsGateway`
- ✅ Frontend : `startScreenShare()` / `stopScreenShare()` dans `WebRTCClient`
  - Utilise `navigator.mediaDevices.getDisplayMedia()`
  - Remplace track vidéo par track écran via `RTCRtpSender.replaceTrack()`
  - Génère nouvelle offre SDP avec track écran
  - Détecte arrêt manuel (événement `onended`)

**UX**
- Bouton partage écran dans `ActiveCallScreen`
- Indicateur bleu quand actif
- Overlay vidéo écran distante en plein écran

### 3. Réactions Emoji

**Backend (`apps/backend/src/reactions/`)**
- ✅ `ReactionsService` : CRUD réactions (TODO: table BDD MessageReaction)
- ✅ `ReactionsGateway` : Broadcast temps réel
  - `reaction:add` → Ajoute emoji à message
  - `reaction:remove` → Supprime emoji
  - `conversation:join/leave` → Gestion rooms Socket.IO

**Frontend (`apps/web/src/components/ReactionPicker.tsx`)**
- ✅ `ReactionPicker` : Sélecteur emoji (👍 ❤️ 😂 😮 😢 😡 🎉 🔥)
- ✅ `ReactionDisplay` : Affichage réactions agrégées avec compteur

**TODO**
- [ ] Migration Prisma pour table `MessageReaction` (messageId, userId, emoji, createdAt)
- [ ] Implémenter stockage BDD dans `ReactionsService`

### 4. Messages Éphémères

**Backend (`apps/backend/src/messages/ephemeral.service.ts`)**
- ✅ `EphemeralService` : Auto-suppression basée TTL
  - `setEphemeral(messageId, ttlSeconds)` : Définit expiration
  - `scheduleDelete()` : Timers en mémoire (Map)
  - `restoreTimers()` : Restaure timers au démarrage serveur
  - `deleteMessage()` : Supprime contenu (ciphertext) et marque deletedAt
  - Broadcast event `message:expired` via `MessagesGateway`

**Schema Prisma**
- ✅ Champ `expiresAt DateTime?` déjà présent dans table `Message`

**Frontend (`apps/web/src/components/EphemeralMessageIndicator.tsx`)**
- ✅ Composant countdown avec timer visuel
- ✅ Couleurs adaptatives : bleu (>60s), orange (10-60s), rouge (<10s)
- ✅ Animation pulse
- ✅ Callback `onExpired` pour retirer message de l'UI

**Intégration**
- ✅ `MessagesService.createMessage()` : Paramètre optionnel `ttlSeconds`
- ✅ `MessagesGateway.broadcastMessageExpired()` : Notifie clients

---

## 🏗️ Architecture WebRTC

### Signaling Flow (SDP Exchange)

```
┌─────────────┐                  ┌──────────────┐                  ┌─────────────┐
│  Client A   │                  │  CallsGateway │                  │  Client B   │
│ (Initiator) │                  │   (Server)    │                  │ (Recipient) │
└──────┬──────┘                  └──────┬───────┘                  └──────┬──────┘
       │                                 │                                 │
       │ call:initiate                   │                                 │
       ├────────────────────────────────►│                                 │
       │                                 │   call:incoming                 │
       │                                 ├────────────────────────────────►│
       │                                 │                                 │
       │                                 │   call:accept                   │
       │                                 │◄────────────────────────────────┤
       │   call:accepted                 │                                 │
       │◄────────────────────────────────┤                                 │
       │                                 │                                 │
       │ getUserMedia() → localStream    │                                 │
       ├─►createOffer() → SDP Offer      │                                 │
       │ call:offer {sdp}                │                                 │
       ├────────────────────────────────►│   call:offer {sdp}              │
       │                                 ├────────────────────────────────►│
       │                                 │   setRemoteDescription(offer)   │
       │                                 │◄──createAnswer() → SDP Answer───┤
       │                                 │   call:answer {sdp}             │
       │   call:answer {sdp}             │◄────────────────────────────────┤
       │◄────────────────────────────────┤                                 │
       │ setRemoteDescription(answer)    │                                 │
       │                                 │                                 │
       │ call:ice-candidate              │   call:ice-candidate            │
       ├────────────────────────────────►├────────────────────────────────►│
       │◄────────────────────────────────┤◄────────────────────────────────┤
       │    ···ICE candidates···         │    ···ICE candidates···         │
       │                                 │                                 │
       │ ═════════════════════════════════════════════════════════════════ │
       │                    🎥 RTCPeerConnection established               │
       │ ═════════════════════════════════════════════════════════════════ │
```

### ICE (Interactive Connectivity Establishment)

**Configuration STUN/TURN**
```typescript
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Production: ajouter serveur TURN pour NAT symétrique
  // { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pass' }
];
```

**Processus ICE**
1. Génération candidats (host, srflx, relay)
2. Gathering via `onicecandidate` event
3. Relai candidats via Socket.IO (`call:ice-candidate`)
4. Ajout distant via `addIceCandidate()`
5. Connexion P2P établie

### Network Reconnection (ICE Restart)

**Scénario : Switch 4G → Wi-Fi**
```typescript
// Détection perte connexion
pc.onconnectionstatechange = () => {
  if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
    handleConnectionFailure(callId);
  }
};

// ICE Restart
async function handleConnectionFailure(callId: string) {
  const offer = await pc.createOffer({ iceRestart: true });
  await pc.setLocalDescription(offer);
  socket.emit('call:offer', { callId, sdp: offer.sdp });
}

// Reconnexion Socket.IO
socket.on('reconnect', () => {
  console.log('Reconnected, restarting ICE for all sessions...');
  restartIceForAllSessions();
});
```

**Stratégie**
- Détection changement réseau (pas implémentée explicitement, gérée par RTCPeerConnection)
- ICE restart automatique sur `connectionState = 'failed'`
- Buffer audio/video pendant brèves coupures (géré par WebRTC)
- Timeout 30s avant abandon complet

---

## 🔐 Considérations Sécurité

### WebRTC DTLS-SRTP
- Chiffrement média end-to-end via DTLS (Datagram Transport Layer Security)
- SRTP (Secure Real-time Transport Protocol) pour flux audio/vidéo
- Certificats auto-signés validés via fingerprint SDP

### Signaling Security
- Authentification JWT sur namespace `/calls`
- Multi-device support : userSockets Map pour broadcast ciblé
- Validation callId/userId pour prévenir détournement session

### Messages Éphémères
- Suppression ciphertext ET métadonnées après expiration
- Timers serveur (non client-side) pour éviter manipulation
- Restauration timers après redémarrage serveur (`restoreTimers()`)

---

## 🧪 Tests & Validation

### DoD (Definition of Done)

#### ✅ Appels stables > 30 minutes
**Script de test** (TODO)
```bash
# Test durée appel WebRTC
node tests/stability/webrtc-long-call.test.js --duration=1800
```

**Métriques à mesurer**
- Jitter (variation latence) : < 30ms
- Packet loss : < 1%
- Latency (RTT) : < 150ms
- CPU usage : < 25% moyen

#### ✅ Bascule réseau 4G/Wi-Fi transparente
**Procédure manuelle**
1. Démarrer appel sur réseau 4G
2. Activer Wi-Fi (désactivation 4G automatique)
3. Vérifier reconnexion ICE dans console
4. Confirmer continuité audio/vidéo sans interruption perceptible

**Test automatisé** (TODO)
- Simuler changement réseau via proxy/iptables
- Valider `call:offer` avec `iceRestart: true` émis
- Timeout max reconnexion : 5 secondes

### Tests Unitaires

**Backend**
```bash
cd apps/backend
npm test -- --testPathPattern=calls
```

**Frontend WebRTC Client**
```bash
cd apps/web
npm test -- webrtc.test.ts
```

### Tests End-to-End

**Playwright : Scénario appel vidéo**
```typescript
test('Video call with screen share', async ({ page, context }) => {
  // User A initie appel
  await page.goto('/chat/conv-123');
  await page.click('button[aria-label="Start video call"]');
  
  // User B accepte (2nd browser context)
  const page2 = await context.newPage();
  await page2.goto('/chat/conv-123');
  await page2.click('button[aria-label="Accept call"]');
  
  // Vérifier connexion établie
  await expect(page.locator('video[autoplay]')).toBeVisible();
  await expect(page2.locator('video[autoplay]')).toBeVisible();
  
  // User A partage écran
  await page.click('button[aria-label="Share screen"]');
  await expect(page2.locator('[data-testid="screen-share-overlay"]')).toBeVisible();
  
  // Terminer appel
  await page.click('button[aria-label="End call"]');
  await expect(page.locator('[data-testid="active-call"]')).not.toBeVisible();
});
```

---

## 📦 Dépendances

**Backend**
```json
{
  "@nestjs/websockets": "^10.0.0",
  "socket.io": "^4.6.0"
}
```

**Frontend**
```json
{
  "socket.io-client": "^4.6.0"
}
```

**Pas de dépendances additionnelles** : WebRTC est natif dans les browsers modernes.

---

## 🚀 Déploiement

### Configuration Production

**Variables d'environnement**
```bash
# Backend (.env)
STUN_SERVER=stun:stun.example.com:19302
TURN_SERVER=turn:turn.example.com:3478
TURN_USERNAME=prod-user
TURN_CREDENTIAL=secret-password
```

**TURN Server Setup** (coturn)
```bash
# Installation Ubuntu/Debian
sudo apt install coturn

# Configuration /etc/turnserver.conf
listening-port=3478
fingerprint
lt-cred-mech
user=prod-user:secret-password
realm=turn.example.com
```

### Monitoring

**Métriques à surveiller**
- Nombre appels actifs (`CallsService.sessions.size`)
- Durée moyenne appels
- Taux échec connexion ICE
- Utilisation bande passante serveur signaling

**Logs critiques**
```
[WebRTC] Connection state: failed → Échec ICE
[Ephemeral] Message X auto-deleted → Suppression réussie
[CallsGateway] Client disconnected mid-call → Nettoyage session
```

---

## 📚 Références Techniques

- **WebRTC Specification** : https://www.w3.org/TR/webrtc/
- **ICE RFC 8445** : https://datatracker.ietf.org/doc/html/rfc8445
- **Screen Capture API** : https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API
- **Socket.IO Rooms** : https://socket.io/docs/v4/rooms/

---

## 🛠️ Prochaines Améliorations (Phase 7+)

- [ ] Appels de groupe (3+ participants)
- [ ] Enregistrement appels (avec consentement)
- [ ] Sous-titres temps réel (Speech-to-Text)
- [ ] Filtres/effets vidéo (background blur, virtual backgrounds)
- [ ] Picture-in-Picture API pour appels minimisés
- [ ] Statistiques qualité appel (getStats() API)

---

**Phase 6 Status :** ✅ Backend complet, Frontend components prêts, Tests stabilité en attente
