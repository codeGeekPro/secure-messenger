# Phase 6 : Commandes d'Installation et Setup

## 📦 Génération Client Prisma

Après ajout du modèle `MessageReaction` dans `schema.prisma`, générer le client Prisma :

```bash
cd apps/backend
npx prisma generate
```

## 🗄️ Migration Base de Données

Créer et appliquer la migration pour table `message_reactions` :

```bash
cd apps/backend

# Créer migration
npx prisma migrate dev --name add-message-reactions

# En production
npx prisma migrate deploy
```

## 🚀 Démarrage Services

### Backend

```bash
cd apps/backend
npm run start:dev
```

**Vérifier logs :**
- `[Ephemeral] Restored X timers` → Timers messages éphémères restaurés
- `[CallsGateway] WebSocket listening on /calls` → Signaling WebRTC prêt

### Frontend

```bash
cd apps/web
npm run dev
```

**Ports par défaut :**
- Frontend : http://localhost:3000
- Backend API : http://localhost:3001
- WebSocket Calls : ws://localhost:3001/calls
- WebSocket Messages : ws://localhost:3001/messages
- WebSocket Reactions : ws://localhost:3001/reactions

## 🧪 Tests Phase 6

### Tests Unitaires

```bash
# Backend
cd apps/backend
npm test -- --testPathPattern="calls|reactions|ephemeral"

# Frontend WebRTC
cd apps/web
npm test -- webrtc.test.ts
```

### Tests End-to-End (Playwright)

```bash
cd apps/web
npx playwright test tests/calls.spec.ts
```

### Test Stabilité Appels (Manuel)

1. Ouvrir 2 fenêtres browser (ou devices différents)
2. Se connecter avec 2 comptes différents
3. User A : Démarrer appel vidéo
4. User B : Accepter appel
5. Laisser tourner >30 minutes
6. **Pendant l'appel :**
   - Activer/désactiver micro et caméra
   - Partager écran (User A)
   - Switch réseau Wi-Fi ↔ 4G (mobile)
   - Vérifier reconnexion automatique

**Métriques attendues :**
- Aucune interruption audio/vidéo perceptible
- Reconnexion ICE < 5 secondes après changement réseau
- CPU usage < 30% en moyenne
- Latency < 150ms

### Test Messages Éphémères

```typescript
// Frontend console
const messageId = 'test-msg-id';
const ttl = 10; // 10 secondes

// Envoyer message éphémère
await sendMessage({ text: 'Test éphémère', ttlSeconds: ttl });

// Observer countdown dans UI
// Après 10s, message doit disparaître automatiquement
// Event WebSocket reçu: { type: 'message:expired', messageId }
```

### Test Réactions

```bash
# Backend logs
[ReactionsGateway] User abc-123 connected
[ReactionsService] Added reaction 👍 to message xyz-789
[ReactionsGateway] Broadcasting reaction:added to room conversation:conv-456
```

## 🐛 Debugging

### WebRTC Connection Issues

**Vérifier candidats ICE :**
```javascript
// Browser console
pc.onicecandidate = (event) => {
  if (event.candidate) {
    console.log('ICE Candidate:', event.candidate.type, event.candidate.address);
  }
};
```

**Types attendus :**
- `host` : Adresse locale
- `srflx` : Adresse publique via STUN
- `relay` : Via TURN (si configuré)

**Si pas de `srflx` :**
- Vérifier firewall bloque port UDP 19302
- Tester STUN server : `stun:stun.l.google.com:19302`

### Messages Éphémères ne s'auto-suppriment pas

**Vérifier serveur backend :**
```bash
# Logs au démarrage
[Ephemeral] Restored 5 timers

# Logs suppression
[Ephemeral] Message abc-123 auto-deleted
```

**Si timers non restaurés :**
- Vérifier champ `expiresAt` présent dans BDD
- Appeler `EphemeralService.restoreTimers()` manuellement

### Erreurs TypeScript Prisma

```bash
# Régénérer client après modifications schema.prisma
cd apps/backend
npx prisma generate

# Redémarrer TypeScript server (VS Code)
Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

## 📊 Monitoring Production

### Métriques Calls

```typescript
// Endpoint API pour stats
GET /calls/stats

Response:
{
  "activeCalls": 12,
  "averageDuration": "00:18:34",
  "totalCallsToday": 145,
  "failedConnectionRate": 0.02
}
```

### Logs Critiques

**Alerte si :**
- `failedConnectionRate > 5%` → Problème STUN/TURN
- `activeCalls > 100` → Scale horizontalement
- `[Ephemeral] Error deleting message` → Vérifier BDD connection

## 🔧 Configuration Production

### Variables d'environnement

```bash
# Backend .env.production
DATABASE_URL=postgresql://user:pass@prod-db:5432/messenger
STUN_SERVER=stun:stun.production.com:19302
TURN_SERVER=turn:turn.production.com:3478
TURN_USERNAME=prod-user
TURN_CREDENTIAL=secure-password
CORS_ORIGIN=https://messenger.production.com
```

### TURN Server (coturn)

**Installation Ubuntu :**
```bash
sudo apt update
sudo apt install coturn

# Enable service
sudo systemctl enable coturn
sudo systemctl start coturn
```

**Configuration `/etc/turnserver.conf` :**
```conf
listening-port=3478
fingerprint
lt-cred-mech
user=prod-user:secure-password
realm=turn.production.com

# TLS (recommandé)
cert=/etc/letsencrypt/live/turn.production.com/cert.pem
pkey=/etc/letsencrypt/live/turn.production.com/privkey.pem
```

**Test TURN :**
```bash
# Depuis client
turnutils_uclient -v -u prod-user -w secure-password turn.production.com
```

## 📚 Ressources

- **WebRTC Troubleshooting** : https://webrtc.github.io/samples/
- **ICE Test Tool** : https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
- **Coturn Documentation** : https://github.com/coturn/coturn

---

**Phase 6 Setup Complete** ✅
- Backend WebRTC signaling ready
- Frontend components implemented
- Database schema updated
- Tests prepared
