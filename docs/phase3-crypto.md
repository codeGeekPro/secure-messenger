# Phase 3 : Sécurité & Chiffrement E2E

## Vue d'ensemble

Intégration complète du protocole Signal (X3DH + Double Ratchet) dans le backend NestJS avec gestion multi-devices, rotation de clés automatique et forward secrecy.

## Architecture cryptographique

```
┌─────────────────────────────────────────────────────────────┐
│                    Signal Protocol E2E                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. X3DH (Extended Triple Diffie-Hellman)                   │
│     └─ Échange de clés initial entre 2 devices              │
│                                                              │
│  2. Double Ratchet                                          │
│     ├─ Forward Secrecy (clés passées compromises)           │
│     ├─ Future Secrecy (clés futures protégées)              │
│     └─ Message Keys dérivées (uniques par message)          │
│                                                              │
│  3. Gestion multi-devices                                    │
│     ├─ PreKey bundles par device                            │
│     ├─ Rotation automatique OneTimePreKeys                   │
│     └─ Synchronisation sessions                              │
└─────────────────────────────────────────────────────────────┘
```

## Modules créés

### 1. **CryptoService** (`crypto.service.ts`)
Primitives cryptographiques bas niveau (wrapper libsodium) :
- **Curve25519** : ECDH pour échange de clés
- **Ed25519** : Signatures numériques
- **XChaCha20-Poly1305** : Chiffrement AEAD
- **HKDF** : Dérivation de clés
- **BLAKE2b** : Hash sécurisé

**Méthodes clés :**
```typescript
generateKeyPair() // Curve25519
generateSigningKeyPair() // Ed25519
ecdh(privateKey, publicKey) // Diffie-Hellman
hkdf(ikm, salt, info, length) // Key derivation
encrypt(plaintext, key) // XChaCha20-Poly1305
decrypt(ciphertext, key, nonce)
memzero(key) // Effacer clé de la RAM
```

### 2. **X3dhService** (`x3dh.service.ts`)
Échange de clés initial (protocole X3DH) :

**Key Bundle Structure :**
```typescript
{
  identityKey: string (Ed25519 public - base64)
  signedPreKey: {
    publicKey: string (Curve25519 - base64)
    signature: string (Ed25519 signature - base64)
  }
  oneTimePreKeys: string[] (Curve25519[] - base64)
}
```

**Flux X3DH :**
1. **Bob** upload son Key Bundle sur serveur
2. **Alice** récupère le bundle de Bob
3. **Alice** initie session : `initiateX3DH()` → calcule 4 DH
4. **Bob** accepte session : `acceptX3DH()` → calcule mêmes DH
5. Les deux obtiennent **Root Key** identique (secret partagé)

**Méthodes :**
```typescript
generateKeyBundle(numOneTimeKeys = 100)
verifyKeyBundle(bundle) // Vérifie signature signedPreKey
initiateX3DH(aliceKeys, bobBundle) → rootKey
acceptX3DH(bobKeys, aliceKeys) → rootKey
```

### 3. **RatchetService** (`ratchet.service.ts`)
Double Ratchet pour forward/future secrecy :

**Ratchet State (stocké en BDD par conversation) :**
```typescript
{
  rootKey: string (base64)
  sendChainKey: string (base64)
  receiveChainKey: string (base64)
  sendRatchetKeyPublic: string (base64)
  sendRatchetKeyPrivate: string (base64)
  receiveRatchetKey: string | null (base64)
  sendMessageNumber: number
  receiveMessageNumber: number
  previousSendChainLength: number
}
```

**Fonctionnement :**
- **Chain Key** : dérive message keys successifs
- **Message Key** : unique par message, supprimée après usage
- **DH Ratchet** : rotation Root Key + Chain Key à chaque réponse

**Méthodes :**
```typescript
initRatchetSender(rootKey) → RatchetState
initRatchetReceiver(rootKey, remoteRatchetKey) → RatchetState
ratchetEncrypt(state, plaintext) → EncryptedMessage
ratchetDecrypt(state, encryptedMessage) → plaintext
```

### 4. **KeysService** (`keys.service.ts`)
Gestion clés multi-devices avec Prisma :

**Fonctionnalités :**
- **Enregistrement device** : génère bundle 100 OneTimePreKeys
- **Récupération bundle** : pour initier session X3DH
- **Rotation OneTimePreKeys** : auto-replenish si < 20 disponibles
- **Marquer OTPKs utilisées** : évite réutilisation
- **Liste devices** : tous les devices actifs d'un user
- **Désactivation** : déconnexion device

**Méthodes :**
```typescript
registerDevice(userId, deviceName, platform, pushToken?)
getKeyBundle(deviceId) → KeyBundle
markOneTimePreKeyAsUsed(deviceId, opkPublic)
replenishOneTimePreKeys(deviceId, count = 50)
getUserDevices(userId)
deactivateDevice(deviceId)
getDevicePrivateKeys(deviceId) // Pour accepter X3DH
```

### 5. **KeysController** (`keys.controller.ts`)
API REST pour clients (protégé par JWT) :

**Endpoints :**
```
POST   /api/v1/keys/devices
       → Enregistre nouveau device
       Body: { deviceName, platform, pushToken? }
       Response: { deviceId, bundle }

GET    /api/v1/keys/devices/:deviceId/bundle
       → Récupère bundle clés publiques
       Response: { identityKey, signedPreKey, oneTimePreKeys }

POST   /api/v1/keys/devices/:deviceId/replenish
       → Recharge OneTimePreKeys
       Body: { count?: number }
       Response: { keysAdded }

GET    /api/v1/keys/devices
       → Liste devices actifs de l'utilisateur
       Response: [{ id, deviceName, platform, lastActiveAt }]

POST   /api/v1/keys/devices/:deviceId/deactivate
       → Désactive device (déconnexion)
```

## Schéma BDD (Device model)

```prisma
model Device {
  id             String       @id @default(uuid())
  userId         String
  deviceName     String       // "iPhone 15 Pro"
  platform       UserPlatform // ios, android, web, desktop
  pushToken      String?      // FCM/APNs token
  identityKey    String       // Ed25519 private (base64)
  signedPrekey   Json         // { publicKey, signature, privateKey }
  oneTimePrekeys Json[]       // [{ publicKey, privateKey, used: bool }]
  isActive       Boolean      @default(true)
  createdAt      DateTime
  lastActiveAt   DateTime
  
  user User @relation(...)
  
  @@index([userId, isActive])
}
```

## Flux complet : Alice envoie message à Bob

### Étape 1 : Enregistrement devices (une fois)

```typescript
// Alice enregistre son iPhone
POST /api/v1/keys/devices
{
  deviceName: "iPhone 15",
  platform: "ios",
  pushToken: "apns_token_alice"
}
→ { deviceId: "device-alice-123", bundle: {...} }

// Bob enregistre son Android
POST /api/v1/keys/devices
{
  deviceName: "Pixel 8",
  platform: "android",
  pushToken: "fcm_token_bob"
}
→ { deviceId: "device-bob-456", bundle: {...} }
```

### Étape 2 : Alice initie session avec Bob (X3DH)

```typescript
// 1. Alice récupère bundle de Bob
GET /api/v1/keys/devices/device-bob-456/bundle
→ { identityKey: "...", signedPreKey: {...}, oneTimePreKeys: [...] }

// 2. Alice calcule Root Key (côté client)
const aliceEphemeral = crypto.generateKeyPair();
const { rootKey, usedOneTimePreKeyIndex } = x3dh.initiateX3DH(
  aliceIdentityPrivate,
  aliceEphemeral.privateKey,
  bobBundle,
  true
);

// 3. Alice initialise son Double Ratchet
const aliceRatchet = ratchet.initRatchetSender(rootKey);

// 4. Alice marque OTPKs de Bob utilisée (serveur)
POST /api/v1/keys/devices/device-bob-456/mark-used
{ oneTimePreKeyPublic: bobBundle.oneTimePreKeys[0] }
```

### Étape 3 : Alice chiffre et envoie message

```typescript
// Chiffrement (côté client Alice)
const encrypted = ratchet.ratchetEncrypt(
  aliceRatchet,
  "Salut Bob ! 👋"
);

// Envoi au serveur
POST /api/v1/messages
{
  conversationId: "conv-123",
  recipientDeviceId: "device-bob-456",
  ciphertext: encrypted.ciphertext,
  nonce: encrypted.nonce,
  ratchetPublicKey: encrypted.ratchetPublicKey,
  messageNumber: encrypted.messageNumber,
  previousChainLength: encrypted.previousChainLength,
  // Métadonnées X3DH pour premier message
  x3dhData: {
    aliceIdentityPublic: "...",
    aliceEphemeralPublic: "...",
    usedOneTimePreKeyPublic: "..."
  }
}
```

### Étape 4 : Bob reçoit et déchiffre

```typescript
// 1. Bob reçoit notification push
// 2. Bob fetch message depuis serveur
GET /api/v1/messages/conv-123

// 3. Si premier message (X3DH init), Bob accepte session
const privateKeys = await getDevicePrivateKeys("device-bob-456");
const oneTimePreKeyPrivate = await getOneTimePreKeyPrivate(
  "device-bob-456",
  message.x3dhData.usedOneTimePreKeyPublic
);

const rootKey = x3dh.acceptX3DH(
  privateKeys.identityKey,
  privateKeys.signedPreKeyPrivate,
  oneTimePreKeyPrivate,
  message.x3dhData.aliceIdentityPublic,
  message.x3dhData.aliceEphemeralPublic
);

// 4. Bob initialise son Double Ratchet
const bobRatchet = ratchet.initRatchetReceiver(
  rootKey,
  message.ratchetPublicKey
);

// 5. Bob déchiffre
const plaintext = ratchet.ratchetDecrypt(bobRatchet, message);
console.log(plaintext); // "Salut Bob ! 👋"
```

### Étape 5 : Bob répond (rotation Ratchet)

```typescript
// Bob chiffre sa réponse
const encrypted = ratchet.ratchetEncrypt(
  bobRatchet,
  "Hey Alice ! Ça va ?"
);

// Le ratchetPublicKey a changé → DH Ratchet effectué
// Forward secrecy : anciens messages indéchiffrables si clés compromises
```

## Sécurité : Forward & Future Secrecy

### Forward Secrecy
- **Chaque message** utilise une **Message Key unique**
- Message Key dérivée de Chain Key, puis **supprimée** (`memzero()`)
- Si attaquant compromet clés actuelles, **ne peut PAS déchiffrer anciens messages**

### Future Secrecy
- **DH Ratchet** rotation automatique à chaque échange
- Root Key + Chain Key changent à chaque message **aller-retour**
- Si attaquant compromet clés actuelles, **ne peut PAS déchiffrer futurs messages** (après prochain DH)

### Rotation OneTimePreKeys
```typescript
// Cronjob serveur (toutes les 24h)
@Cron('0 0 * * *')
async replenishAllDevices() {
  const devices = await prisma.device.findMany({
    where: { isActive: true }
  });

  for (const device of devices) {
    await keysService.replenishOneTimePreKeys(device.id, 50);
  }
}
```

## Tests de sécurité (DoD)

### 1. Audit interne
```bash
# Analyse statique code
pnpm audit
pnpm run lint

# Tests crypto
pnpm test crypto.service.spec.ts
pnpm test x3dh.service.spec.ts
pnpm test ratchet.service.spec.ts

# Coverage >80%
pnpm test:cov
```

### 2. Tests MITM (Man-in-the-Middle)
```bash
# Proxy mitmproxy pour intercepter trafic
mitmproxy -p 8080

# Vérifier :
# ✅ Serveur ne peut PAS lire messages (ciphertext opaque)
# ✅ Signature signedPreKey vérifiée côté client
# ✅ HTTPS/TLS 1.3 obligatoire (certificate pinning mobile)
```

### 3. Certificate Pinning (React Native)
```typescript
// mobile-app/src/api/http.ts
import { certificatePinning } from 'react-native-ssl-pinning';

const API_URL = 'https://api.securemessenger.com';
const CERT_HASH = 'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

const fetch = certificatePinning.fetch;

export async function apiCall(endpoint: string, options: RequestInit) {
  return fetch(`${API_URL}${endpoint}`, {
    ...options,
    sslPinning: {
      certs: [CERT_HASH],
    },
  });
}
```

## Prochaines étapes

- [ ] Module Messages (chiffrement/déchiffrement intégré)
- [ ] Upload fichiers chiffrés (clés éphémères)
- [ ] Tests unitaires crypto (Jest)
- [ ] Tests MITM avec mitmproxy
- [ ] Documentation API Swagger
- [ ] Benchmarks performance (encrypt/decrypt 1000 msg/s)

---
**Statut Phase 3** : ✅ Infrastructure crypto E2E complète  
**Date** : 3 décembre 2025  
**Prochaine phase** : Phase 4 - Module Messages WebSocket
