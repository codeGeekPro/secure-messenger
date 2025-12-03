# Politique de Chiffrement End-to-End - Secure Messenger

## Objectif

Garantir que **seuls l'expéditeur et le(s) destinataire(s)** peuvent lire le contenu des messages, même en cas de compromission du serveur.

## Protocole : Signal Protocol

### Composants

1. **X3DH (Extended Triple Diffie-Hellman)** : Échange de clés initial
2. **Double Ratchet** : Évolution continue des clés de session
3. **Sesame Algorithm** : Gestion des groupes (future)

### Primitives cryptographiques

| Fonction | Algorithme | Bibliothèque |
|----------|-----------|--------------|
| **ECDH** | Curve25519 | libsodium |
| **Chiffrement symétrique** | XChaCha20-Poly1305 | libsodium |
| **Signature** | Ed25519 | libsodium |
| **Hash** | BLAKE2b | libsodium |
| **KDF** | HKDF (HMAC-SHA256) | libsodium |

**Justification :**
- **Curve25519 :** Performance, sécurité prouvée, résistance side-channels
- **XChaCha20-Poly1305 :** AEAD (authenticated encryption), plus rapide qu'AES-GCM sur mobile
- **Ed25519 :** Signatures rapides, petites clés (32 bytes)

## Architecture des clés

### Hiérarchie

```
Identity Key (IK)
  └── Signed Prekey (SPK) + signature
      └── One-Time Prekeys (OPK) × N
          └── Ephemeral Key (EK) par session
              └── Root Key (RK)
                  └── Chain Keys (CK) → Message Keys (MK)
```

### Types de clés

| Clé | Durée de vie | Stockage | Rotation |
|-----|--------------|----------|----------|
| **Identity Key** | Permanent (sauf changement device) | Keychain/Keystore (hardware-backed) | Manuelle (changement device) |
| **Signed Prekey** | 1 semaine | Serveur + local | Automatique hebdomadaire |
| **One-Time Prekey** | Single-use | Serveur (pool de 100) | Automatique (refill si < 20) |
| **Ephemeral Key** | Single-use | Mémoire (session) | Par message initial |
| **Root Key** | Session | Mémoire | À chaque ratchet step |
| **Chain Key** | Session | Mémoire | Par message |
| **Message Key** | Single-use | Mémoire (deleted after decrypt) | Par message |

## X3DH : Échange de clés initial

### Étapes (Alice → Bob)

```
Phase Setup (Bob) :
1. Bob génère Identity Key (IK_B) : Ed25519 keypair
2. Bob génère Signed Prekey (SPK_B) : Curve25519 keypair
3. Bob signe SPK_B avec IK_B → signature
4. Bob génère pool de One-Time Prekeys (OPK_B) : 100× Curve25519 keypairs
5. Bob upload {IK_B_pub, SPK_B_pub, signature, [OPK_B_pub]} sur serveur

Phase Initiation (Alice) :
1. Alice récupère bundle de Bob depuis serveur
2. Alice vérifie signature de SPK_B avec IK_B_pub
3. Alice génère Ephemeral Key (EK_A) : Curve25519 keypair
4. Alice calcule 4 secrets ECDH :
   - DH1 = ECDH(IK_A, SPK_B)
   - DH2 = ECDH(EK_A, IK_B)
   - DH3 = ECDH(EK_A, SPK_B)
   - DH4 = ECDH(EK_A, OPK_B) [si OPK disponible]
5. Alice dérive Root Key : RK = KDF(DH1 || DH2 || DH3 || DH4)
6. Alice envoie message initial + {IK_A_pub, EK_A_pub, OPK_B_id}

Phase Réception (Bob) :
1. Bob récupère {IK_A_pub, EK_A_pub, OPK_B_id} depuis message
2. Bob calcule les mêmes secrets ECDH
3. Bob dérive Root Key (doit matcher Alice)
4. Bob supprime OPK_B utilisé du serveur (single-use)
5. Double Ratchet initialisé
```

### Propriétés de sécurité

- **Forward Secrecy :** Compromission IK future n'expose pas messages passés (grâce aux EK/OPK éphémères)
- **Deniability :** Alice ne peut prouver à un tiers que Bob a écrit un message (signatures éphémères)
- **Protection replay :** OPK single-use + message numbering

## Double Ratchet : Évolution des clés

### Principe

Deux ratchets parallèles :
1. **DH Ratchet :** Échange de clés Diffie-Hellman à chaque réponse
2. **Symmetric Ratchet :** Dérivation de clés symétriques (KDF)

### Visualisation

```
Alice                                      Bob
  │                                         │
  │ ─── Message 1 (CK_A_1 → MK_1) ────────>│
  │                                         │ Ratchet DH
  │<─── Message 2 (CK_B_1 → MK_2) ─────────┤
  │ Ratchet DH                              │
  │ ─── Message 3 (CK_A_2 → MK_3) ────────>│
  │                                         │
  │ Chaque message utilise une clé unique (MK)
  │ Forward & Future Secrecy garantis
```

### Implémentation

```typescript
// Symmetric ratchet (dérivation de clé de message)
function ratchetChainKey(chainKey: Uint8Array): {
  newChainKey: Uint8Array;
  messageKey: Uint8Array;
} {
  const hmac = crypto_auth_hmacsha256;
  const newChainKey = hmac('CHAIN_KEY', chainKey);
  const messageKey = hmac('MESSAGE_KEY', chainKey);
  return { newChainKey, messageKey };
}

// DH ratchet (rotation clé racine)
function ratchetRootKey(
  rootKey: Uint8Array,
  dhOutput: Uint8Array
): { newRootKey: Uint8Array; newChainKey: Uint8Array } {
  const kdf = crypto_kdf_hkdf_sha256;
  const [newRootKey, newChainKey] = kdf(rootKey, dhOutput, 'ROOT_KEY_RATCHET');
  return { newRootKey, newChainKey };
}
```

## Chiffrement de messages

### Format de message

```typescript
interface EncryptedMessage {
  version: number;               // Protocol version (1)
  senderId: string;              // User ID
  senderDeviceId: string;        // Device ID
  recipientId: string;
  ephemeralPublicKey?: Uint8Array; // Pour X3DH initial uniquement
  messageNumber: number;         // Compteur anti-replay
  previousChainLength: number;   // Pour ratcheting
  ciphertext: Uint8Array;        // Encrypted payload
  mac: Uint8Array;               // HMAC-SHA256 (auth tag)
}
```

### Algorithme d'envoi

```typescript
async function encryptMessage(
  plaintext: string,
  recipientPublicKey: Uint8Array,
  sessionState: SessionState
): Promise<EncryptedMessage> {
  // 1. Ratchet si nécessaire
  if (sessionState.receivedMessage) {
    const dhOutput = crypto_scalarmult(
      sessionState.localPrivateKey,
      recipientPublicKey
    );
    const { newRootKey, newChainKey } = ratchetRootKey(
      sessionState.rootKey,
      dhOutput
    );
    sessionState.rootKey = newRootKey;
    sessionState.sendChainKey = newChainKey;
    sessionState.sendMessageNumber = 0;
  }

  // 2. Dériver clé de message
  const { newChainKey, messageKey } = ratchetChainKey(
    sessionState.sendChainKey
  );
  sessionState.sendChainKey = newChainKey;

  // 3. Chiffrer
  const nonce = crypto_secretbox_nonce();
  const ciphertext = crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    null, // Associated data (optionnel : metadata)
    nonce,
    messageKey
  );

  // 4. HMAC pour authentification
  const mac = crypto_auth_hmacsha256(ciphertext, messageKey);

  sessionState.sendMessageNumber++;

  return {
    version: 1,
    senderId: sessionState.localUserId,
    senderDeviceId: sessionState.localDeviceId,
    recipientId: sessionState.recipientUserId,
    messageNumber: sessionState.sendMessageNumber,
    previousChainLength: sessionState.receiveChainLength,
    ciphertext,
    mac
  };
}
```

### Algorithme de réception

```typescript
async function decryptMessage(
  encryptedMsg: EncryptedMessage,
  sessionState: SessionState
): Promise<string> {
  // 1. Vérifier HMAC
  const expectedMac = crypto_auth_hmacsha256(
    encryptedMsg.ciphertext,
    sessionState.receiveMessageKey
  );
  if (!crypto_auth_verify(expectedMac, encryptedMsg.mac)) {
    throw new Error('MAC verification failed');
  }

  // 2. Ratchet si nouveau DH public key
  if (encryptedMsg.ephemeralPublicKey) {
    const dhOutput = crypto_scalarmult(
      sessionState.localPrivateKey,
      encryptedMsg.ephemeralPublicKey
    );
    const { newRootKey, newChainKey } = ratchetRootKey(
      sessionState.rootKey,
      dhOutput
    );
    sessionState.rootKey = newRootKey;
    sessionState.receiveChainKey = newChainKey;
    sessionState.receiveMessageNumber = 0;
  }

  // 3. Dériver clé de message
  const { messageKey } = ratchetChainKey(sessionState.receiveChainKey);

  // 4. Déchiffrer
  const plaintext = crypto_aead_xchacha20poly1305_ietf_decrypt(
    encryptedMsg.ciphertext,
    null,
    sessionState.nonce,
    messageKey
  );

  // 5. Nettoyer clé de mémoire
  sodium_memzero(messageKey);
  sessionState.receiveMessageNumber++;

  return plaintext.toString('utf8');
}
```

## Gestion des groupes

### Approche 1 : Pairwise (MVP)

Chaque message de groupe est chiffré N fois (un par membre) avec session 1:1.

**Avantages :**
- Simple (réutilise Signal Protocol 1:1)
- Forward secrecy garanti

**Inconvénients :**
- O(N) coût par message (256 membres = 256× chiffrements)
- Bande passante élevée

### Approche 2 : Sender Keys (future)

Un membre génère une **clé de groupe éphémère**, la distribue chiffrée à chaque membre, puis chiffre messages une seule fois.

**Avantages :**
- O(1) coût par message

**Inconvénients :**
- Forward secrecy plus faible (compromission clé groupe expose tous messages jusqu'à rotation)
- Complexité (gestion ajout/retrait membres)

**Implémentation future :** MLS (Messaging Layer Security, RFC 9420)

## Chiffrement des médias

### Workflow

```
1. Client génère clé AES-256 aléatoire
2. Client chiffre fichier (AES-GCM)
3. Client upload fichier chiffré sur S3 (presigned URL)
4. Client envoie message avec metadata :
   {
     url: "s3://bucket/file.enc",
     key: encrypt_with_session_key(aes_key),
     size: 12345,
     mimetype: "image/jpeg",
     hash: "sha256(plaintext)" // Pour vérif intégrité
   }
5. Destinataire download fichier chiffré
6. Destinataire déchiffre metadata (session key)
7. Destinataire déchiffre fichier (AES key)
```

### Avantages

- **Zéro accès serveur :** S3 contient seulement ciphertext
- **Intégrité :** Hash vérifie fichier non corrompu
- **Expiration :** Presigned URLs expirent (1h), auto-suppression S3 (30j)

## Gestion multi-appareils

### Device linking

```
Appareil principal (A)          Nouvel appareil (B)
       │                              │
       │ 1. Génère QR code            │
       │    (contient IK_A_pub)       │
       │<─────────────────────────────┤ Scan QR
       │                              │
       │ 2. Échange clés X3DH         │
       ├─────────────────────────────>│
       │                              │
       │ 3. Sync sessions via serveur │
       │    (chiffrées avec device key)│
       ├─────────────────────────────>│
       │                              │
       │ 4. B peut déchiffrer messages│
```

### Sync des clés

- Chaque device a sa propre **Identity Key**
- Messages chiffrés pour **tous les devices** du destinataire (fan-out côté serveur)
- Historique messages sync via chiffrement device-to-device

## Rotation des clés

| Clé | Fréquence | Déclencheur |
|-----|-----------|-------------|
| **Signed Prekey** | 1 semaine | Cron job serveur |
| **One-Time Prekeys** | On-demand | Pool < 20 |
| **Message Keys** | Chaque message | Automatique (ratchet) |
| **Identity Key** | Manuelle | Changement device, suspicion compromission |

### Rotation Identity Key (break glass)

```
1. User génère nouvelle IK
2. App notifie tous contacts (message système "Alice a changé sa clé")
3. Contacts re-vérifient Safety Number (optionnel)
4. Nouvelle X3DH pour toutes sessions actives
```

## Vérification de sécurité (Safety Numbers)

### Qu'est-ce que c'est ?

Un **hash des Identity Keys** d'Alice et Bob, affiché sous forme de QR code ou nombre à 12 chiffres.

### Workflow

```
Alice                                      Bob
  │                                         │
  │ 1. Ouvre profil Bob                     │
  │ 2. Affiche Safety Number                │
  │    (hash(IK_Alice || IK_Bob))           │
  │                                         │
  │<────────── Rencontre physique ─────────>│
  │                                         │
  │ 3. Compare QR codes ou nombres          │
  │    (scan mutuel)                        │
  │                                         │
  │ ✅ Match → Sécurité confirmée           │
  │ ❌ No match → MITM possible !           │
```

### Implémentation

```typescript
function generateSafetyNumber(
  localIdentityKey: Uint8Array,
  remoteIdentityKey: Uint8Array,
  localUserId: string,
  remoteUserId: string
): string {
  const combined = Buffer.concat([
    Buffer.from(localUserId),
    localIdentityKey,
    Buffer.from(remoteUserId),
    remoteIdentityKey
  ]);
  const hash = crypto_generichash(combined, null, 32);
  
  // Convertir en nombre à 12 chiffres
  const number = hash.readUInt32BE(0) % 1000000000000;
  return number.toString().padStart(12, '0');
}
```

## Tests et audit

### Tests unitaires

- Génération clés (format, longueur)
- X3DH complet (Alice↔Bob, avec/sans OPK)
- Double Ratchet (sequence de 100 messages)
- Out-of-order delivery (messages reçus dans le désordre)
- Rotation clés

### Tests d'intégration

- E2E complet (signup → message → decrypt)
- Multi-device (3 devices, sync)
- Groupes (10 membres)

### Audit externe

- **Fréquence :** Avant GA, puis annuel
- **Scope :** Implémentation libsodium, gestion clés, flux X3DH/Ratchet
- **Auditors :** NCC Group, Trail of Bits, Cure53

---
**Document owner :** Crypto Lead  
**Dernière révision :** 3 décembre 2025  
**Statut :** Draft → Revue sécurité + audit externe requis
