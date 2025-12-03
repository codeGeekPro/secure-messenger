# Phase 9 : Support Multi-Appareils

**Durée estimée** : 2 semaines  
**Objectif** : Permettre à un utilisateur d'utiliser son compte sur plusieurs appareils (mobile, web, desktop) de manière synchronisée et sécurisée, tout en maintenant le chiffrement de bout en bout.

---

## 📋 Livrables

### 1. Synchronisation de l'État de Lecture
- **Problème** : Un message lu sur un appareil doit apparaître comme lu sur tous les autres appareils de l'utilisateur.
- **Solution** : Implémenter un "read receipt" de synchronisation que les appareils s'envoient entre eux via le serveur.

### 2. Gestion des Clés Multi-Appareils
- **Problème** : Les clés de chiffrement (X3DH, Double Ratchet) sont spécifiques à un appareil. Comment un nouvel appareil rejoint-il le "cercle de confiance" ?
- **Solution** :
  - **Device-to-Device Sync** : Le nouvel appareil génère ses propres clés et les partage avec un appareil existant via un canal sécurisé (ex: QR code).
  - **Key Backup (optionnel)** : Chiffrer les clés avec une passphrase et les stocker sur le serveur pour restauration.

### 3. Gestion des Conflits
- **Problème** : Un utilisateur modifie le nom d'un groupe sur deux appareils hors ligne. Quelle modification est conservée ?
- **Solution** : Stratégie "Last Write Wins" (LWW) basée sur un timestamp serveur. L'action avec le timestamp le plus récent écrase les autres.

### 4. Cache Hors Ligne
- **Problème** : L'application doit être consultable hors ligne.
- **Solution** : Utiliser IndexedDB sur le client web/mobile pour stocker les messages, conversations et clés déchiffrées.

---

## 🏗️ Architecture

### 1. Modèle de Données : La Table `Device`

La première étape est de pouvoir identifier chaque appareil unique appartenant à un utilisateur.

**`schema.prisma`**
```prisma
model User {
  // ...
  devices Device[]
}

model Device {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  name         String   // ex: "Chrome sur Windows"
  type         DeviceType // WEB, MOBILE, DESKTOP
  
  // Clés publiques pour ce device
  identityKey  Bytes    @map("identity_key")
  signedPreKey Bytes    @map("signed_pre_key")
  signature    Bytes    @map("signature")
  
  // Gestion de session
  lastSeen     DateTime @default(now()) @db.Timestamptz
  createdAt    DateTime @default(now()) @db.Timestamptz
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  oneTimeKeys OneTimeKey[]
  
  @@index([userId])
  @@map("devices")
}

model OneTimeKey {
  id        String @id @default(uuid()) @db.Uuid
  key       Bytes
  deviceId  String @map("device_id") @db.Uuid
  
  device Device @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  
  @@map("one_time_keys")
}

enum DeviceType {
  WEB
  MOBILE
  DESKTOP
}
```

### 2. Flux d'Ajout d'un Nouvel Appareil (Device Linking)

Ce flux est crucial pour la sécurité. Un appareil existant doit "approuver" un nouvel appareil.

1.  **Appareil A (existant, connecté)** :
    - L'utilisateur choisit "Lier un nouvel appareil".
    - L'appareil A génère un secret temporaire (`linking_secret`) et un QR code contenant ce secret.
    - L'appareil A écoute sur un canal WebSocket temporaire identifié par le `linking_secret`.

2.  **Appareil B (nouveau, non connecté)** :
    - Sur l'écran de login, l'utilisateur choisit "Lier un appareil".
    - L'appareil B scanne le QR code de l'appareil A.
    - L'appareil B génère ses propres clés (Identity, PreKeys).
    - L'appareil B envoie sa clé d'identité publique à l'appareil A via le canal WebSocket.

3.  **Synchronisation** :
    - L'appareil A reçoit la clé de B, la signe avec sa propre clé d'identité, et renvoie la signature à B.
    - L'appareil A envoie à B (via le canal sécurisé) les informations nécessaires :
      - Clés de chiffrement des conversations existantes.
      - Liste des contacts.
      - Méta-données des groupes.
    - L'appareil B s'enregistre auprès du serveur avec ses clés et la signature de A. Le serveur l'ajoute à la table `Device`.

### 3. Forking des Messages

Quand Alice envoie un message à Bob, elle doit le chiffrer pour *tous* les appareils actifs de Bob.

**Ancien flux** :
1. Alice demande au serveur la "pre-key bundle" de Bob.
2. Alice établit une session Signal (X3DH) avec Bob.
3. Alice envoie 1 message chiffré au serveur pour Bob.

**Nouveau flux** :
1. Alice demande au serveur les "pre-key bundles" pour *tous les appareils* de Bob (Bob-Device1, Bob-Device2, ...).
2. Alice établit une session Signal distincte pour chaque appareil de Bob.
3. Alice chiffre le message pour chaque session et envoie N messages chiffrés au serveur, chacun destiné à un appareil spécifique.
   ```json
   // Exemple de payload
   {
     "recipientId": "bob-user-id",
     "messages": [
       { "deviceId": "bob-device-1-id", "ciphertext": "..." },
       { "deviceId": "bob-device-2-id", "ciphertext": "..." }
     ]
   }
   ```
4. Le serveur stocke chaque message chiffré et le livre à l'appareil correspondant quand il se connecte.

### 4. Synchronisation de l'État de Lecture (Read Receipts)

Pour éviter de casser le chiffrement E2E, l'état de lecture ne peut pas être une simple colonne `is_read` dans la base de données. La synchronisation doit se faire entre les appareils d'un même utilisateur.

1.  **User-A-Device-1** lit un message de Bob.
2.  **User-A-Device-1** envoie un message spécial chiffré, de type `read_sync`, à **User-A-Device-2** (et autres appareils). Ce message est envoyé via le serveur comme un message normal.
    - Le contenu du message est simple : `{ "type": "read_sync", "messageIds": ["..."], "conversationId": "..." }`.
3.  **User-A-Device-2** reçoit et déchiffre ce message. Il met à jour son UI pour marquer le message comme lu.

---

## 🔌 API Endpoints

### `POST /auth/devices/link`
- **Rôle** : Initier le processus de liaison.
- **Payload** : `{}` (authentifié par JWT de l'appareil existant).
- **Réponse** : `{ linkingSecret: string, expiresAt: ISO_date }`.

### `GET /users/:userId/devices`
- **Rôle** : Obtenir la liste des appareils et leurs pre-key bundles pour un utilisateur.
- **Réponse** :
  ```json
  [
    {
      "deviceId": "...",
      "identityKey": "...",
      "signedPreKey": "...",
      "signature": "...",
      "oneTimeKey": "..." // Une seule clé est fournie
    }
  ]
  ```

### `POST /auth/devices/register`
- **Rôle** : Enregistrer un nouvel appareil.
- **Payload** :
  ```json
  {
    "name": "Chrome sur Windows",
    "type": "WEB",
    "identityKey": "...",
    "signedPreKey": "...",
    "signature": "...",
    "linkingSignature": "..." // Signature de l'appareil existant
  }
  ```

---

## ⚡ Optimisations et Sécurité

- **Nettoyage des appareils** : Le serveur doit supprimer les appareils inactifs depuis plus de 6 mois pour éviter d'envoyer des messages à des appareils "morts".
- **Limite d'appareils** : Limiter à 5-10 appareils par utilisateur pour éviter les abus.
- **Vérification de sécurité** : Les utilisateurs peuvent voir la liste de leurs appareils connectés et les déconnecter à distance. Chaque appareil a une "empreinte de sécurité" (hash de sa clé d'identité) pour vérification manuelle.

---

## 🧪 Tests (DoD)

### Scénarios à Valider

1.  **Ajout d'un appareil** :
    - [ ] Lier un appareil web à un appareil mobile via QR code.
    - [ ] Le nouvel appareil reçoit l'historique des conversations (méta-données, pas les messages).
    - [ ] Le nouvel appareil peut envoyer et recevoir de nouveaux messages.

2.  **Suppression d'un appareil** :
    - [ ] Déconnecter un appareil depuis un autre.
    - [ ] L'appareil déconnecté ne peut plus accéder au compte.
    - [ ] Les autres utilisateurs ne lui envoient plus de messages.

3.  **Récupération de compte (hors périmètre Phase 9, mais à considérer)** :
    - Si l'utilisateur perd tous ses appareils, comment récupère-t-il son compte ?
    - **Solution future** : "Secure Value Recovery" ou "Key Backup" avec une passphrase forte.

4.  **Synchronisation cross-device** :
    - [ ] Envoyer un message depuis l'appareil A, le recevoir sur B et C.
    - [ ] Lire un message sur B, il doit apparaître comme lu sur A et C en quelques secondes.
    - [ ] Changer le nom d'un groupe sur A, le changement doit se propager sur B et C.

---

## 📚 Plan d'Implémentation

1.  **Backend** :
    - [ ] Mettre à jour `schema.prisma` avec les modèles `Device` et `OneTimeKey`.
    - [ ] Générer et appliquer la migration.
    - [ ] Modifier `KeysService` pour gérer les clés par appareil.
    - [ ] Modifier `MessagesService` pour le forking des messages.
    - [ ] Implémenter les nouveaux endpoints d'API (`/devices/...`).

2.  **Frontend (Web)** :
    - [ ] Créer l'UI pour la gestion des appareils (liste, ajout, suppression).
    - [ ] Implémenter le flux de scan de QR code.
    - [ ] Gérer la logique de synchronisation des "read receipts".
    - [ ] Adapter le `CryptoStore` pour gérer les sessions multiples (une par appareil de chaque contact).
