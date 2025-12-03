# Architecture Système - Secure Messenger

## Vue d'ensemble

Architecture **client-serveur hybride** avec chiffrement end-to-end :
- Serveur : routage, stockage chiffré, synchronisation
- Clients : chiffrement/déchiffrement, logique métier

## Niveau 1 : Diagramme de contexte (C4)

```
┌─────────────────────────────────────────────────────────────┐
│                     Secure Messenger                        │
│                                                               │
│  [Application de messagerie sécurisée]                       │
│  Permet aux utilisateurs de communiquer en toute confiance  │
└─────────────────────────────────────────────────────────────┘
            │                      │                    │
            │                      │                    │
            ▼                      ▼                    ▼
     ┌──────────┐          ┌──────────┐         ┌──────────┐
     │   User   │          │   Admin  │         │ External │
     │  Mobile  │          │   Web    │         │   APIs   │
     └──────────┘          └──────────┘         └──────────┘
                                                   (Twilio,
                                                    FCM/APNs)
```

## Niveau 2 : Conteneurs

```
┌─────────────────────────────────────────────────────────────────┐
│                        Secure Messenger                         │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Web App    │  │  Mobile iOS  │  │Mobile Android│          │
│  │   (React)    │  │(React Native)│  │(React Native)│          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                    │
│         └─────────────────┴──────────────────┘                    │
│                           │                                       │
│                           │ HTTPS / WSS                           │
│                           ▼                                       │
│         ┌─────────────────────────────────┐                      │
│         │      API Gateway / LB           │                      │
│         │    (AWS ALB + CloudFront)       │                      │
│         └────────────┬────────────────────┘                      │
│                      │                                            │
│         ┌────────────┴────────────┐                              │
│         │                         │                              │
│         ▼                         ▼                              │
│  ┌──────────────┐       ┌─────────────────┐                     │
│  │  Backend API │       │  WebSocket GW   │                     │
│  │  (NestJS)    │       │ (uWebSockets.js)│                     │
│  │  REST/GraphQL│       │   Socket.IO     │                     │
│  └──────┬───────┘       └────────┬────────┘                     │
│         │                        │                               │
│         └────────────┬───────────┘                               │
│                      │                                            │
│         ┌────────────┴────────────────────────────┐              │
│         │                                          │              │
│         ▼                                          ▼              │
│  ┌──────────────┐                         ┌────────────────┐    │
│  │  PostgreSQL  │                         │     Redis      │    │
│  │   (RDS)      │                         │ (ElastiCache)  │    │
│  │  Messages,   │                         │ Pub/Sub, Cache │    │
│  │  Users, Keys │                         │   Sessions     │    │
│  └──────────────┘                         └────────────────┘    │
│                                                                   │
│  ┌──────────────┐       ┌──────────────┐  ┌────────────────┐   │
│  │  OpenSearch  │       │   S3/MinIO   │  │  WebRTC SFU    │   │
│  │  Full-text   │       │   Encrypted  │  │  (LiveKit/     │   │
│  │   Search     │       │   Media      │  │  mediasoup)    │   │
│  └──────────────┘       └──────────────┘  └────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

## Niveau 3 : Composants backend

```
Backend (NestJS)
├── API Gateway Module
│   ├── Auth Guard (JWT)
│   ├── Rate Limiter
│   └── Request Logger
├── User Module
│   ├── User Service
│   ├── Profile Service
│   └── Device Service (multi-device)
├── Auth Module
│   ├── OTP Service (Twilio)
│   ├── JWT Service
│   └── 2FA Service (TOTP)
├── Messaging Module
│   ├── Message Service
│   ├── Conversation Service
│   ├── E2E Key Exchange Service
│   └── Delivery Service (fanout)
├── Group Module
│   ├── Group Service
│   ├── Member Service
│   └── Permission Service
├── Media Module
│   ├── Upload Service (presigned URLs)
│   ├── Compression Service
│   └── Thumbnail Service
├── Search Module
│   ├── Indexer Service
│   └── Query Service (OpenSearch)
├── Notification Module
│   ├── Push Service (FCM/APNs)
│   └── Preference Service
├── Call Module
│   ├── Signaling Service
│   └── SFU Proxy (LiveKit)
└── Analytics Module
    ├── Event Tracker
    └── Metrics Collector
```

## Flux de données critiques

### 1. Envoi de message 1:1

```
Client A                    Backend                    Client B
   │                           │                          │
   │ 1. Chiffre msg (E2E)      │                          │
   ├──────────────────────────>│                          │
   │ POST /messages            │                          │
   │ {ciphertext, metadata}    │                          │
   │                           │                          │
   │                           │ 2. Valide & stocke       │
   │                           │    (PostgreSQL)          │
   │                           │                          │
   │<──────────────────────────┤                          │
   │ 200 OK {messageId}        │                          │
   │                           │                          │
   │                           │ 3. Fan-out (Redis Pub)   │
   │                           ├─────────────────────────>│
   │                           │ WS: new_message event    │
   │                           │                          │
   │                           │<─────────────────────────┤
   │                           │ ACK (message_delivered)  │
   │                           │                          │
   │                           │ 4. Push notification     │
   │                           │    (si offline)          │
   │                           ├─────────────────────────>│
   │                           │ FCM/APNs                 │
   │                           │                          │
   │                           │ 5. Update status         │
   │<──────────────────────────┤                          │
   │ WS: message_delivered     │                          │
```

**Notes :**
- Serveur ne voit que `ciphertext` (blob)
- Métadonnées minimales : `sender_id`, `recipient_id`, `timestamp`, `message_id`
- Client B déchiffre côté local

### 2. Échange de clés initial (X3DH)

```
Client A                    Backend                    Client B
   │                           │                          │
   │ 1. Récupère bundle clés B │                          │
   ├──────────────────────────>│                          │
   │ GET /users/{B}/keys       │                          │
   │                           │                          │
   │<──────────────────────────┤                          │
   │ {identity_key, signed_    │                          │
   │  prekey, one_time_prekeys}│                          │
   │                           │                          │
   │ 2. Génère shared secret   │                          │
   │    (ECDH)                 │                          │
   │                           │                          │
   │ 3. Envoie message initial │                          │
   ├──────────────────────────>│                          │
   │ + ephemeral_key           │                          │
   │                           │                          │
   │                           │ 4. Forward à B           │
   │                           ├─────────────────────────>│
   │                           │                          │
   │                           │ 5. B calcule shared      │
   │                           │    secret (ECDH)         │
   │                           │                          │
   │                           │ 6. Répond (chiffré)      │
   │                           │<─────────────────────────┤
   │                           │                          │
   │<──────────────────────────┤                          │
   │ → Double Ratchet initialisé                          │
```

### 3. Synchronisation multi-appareils

```
Mobile                      Backend                    Desktop
   │                           │                          │
   │ 1. Envoie msg             │                          │
   ├──────────────────────────>│                          │
   │                           │                          │
   │                           │ 2. Stocke + fan-out      │
   │                           │                          │
   │                           │ 3. Notif tous devices    │
   │<──────────────────────────┤─────────────────────────>│
   │ WS: new_message           │ WS: new_message          │
   │                           │                          │
   │ 4. Marque "lu" (mobile)   │                          │
   ├──────────────────────────>│                          │
   │ PUT /messages/{id}/read   │                          │
   │                           │                          │
   │                           │ 5. Sync état lu          │
   │                           ├─────────────────────────>│
   │                           │ WS: message_read_update  │
   │                           │                          │
   │                           │ 6. Desktop affiche badge │
   │                           │    updated               │
```

**Gestion conflits :**
- **Last-write-wins** pour état "lu"
- **Vector clocks** pour messages (détection doublons)
- **Curseurs de sync** par device

### 4. Appel audio/vidéo

```
Caller                      Backend                    Callee
   │                           │                          │
   │ 1. Initie appel           │                          │
   ├──────────────────────────>│                          │
   │ POST /calls               │                          │
   │                           │                          │
   │                           │ 2. Signaling             │
   │                           ├─────────────────────────>│
   │                           │ WS: incoming_call        │
   │                           │                          │
   │                           │<─────────────────────────┤
   │                           │ accept_call              │
   │                           │                          │
   │                           │ 3. Échange ICE candidates│
   │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─>│
   │   STUN/TURN (Coturn)      │                          │
   │                           │                          │
   │ 4. Connexion P2P établie (si possible)               │
   │<══════════════════════════════════════════════════════>│
   │   WebRTC (DTLS-SRTP)                                 │
   │                                                        │
   │ OU 5. Via SFU (si NAT strict)                        │
   │<─────────────────────────>│<─────────────────────────┤
   │      Encrypted RTP        │      Encrypted RTP        │
   │                           │                          │
```

**Notes :**
- **P2P préféré** (latence minimale)
- **SFU fallback** pour NAT strict ou groupes
- **Chiffrement :** DTLS-SRTP (WebRTC natif)

## Modèle de données (PostgreSQL)

### Schéma relationnel

```sql
-- Users
users (
  id UUID PRIMARY KEY,
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(255) UNIQUE,
  username VARCHAR(50) UNIQUE,
  display_name VARCHAR(100),
  avatar_url TEXT,
  status_text VARCHAR(200),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
);

-- Devices (multi-device support)
devices (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_name VARCHAR(100),
  platform ENUM('ios', 'android', 'web', 'desktop'),
  push_token TEXT,
  identity_key TEXT NOT NULL, -- X25519 public key
  signed_prekey JSONB NOT NULL,
  one_time_prekeys JSONB[], -- Array de prekeys
  created_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ
);
CREATE INDEX idx_devices_user ON devices(user_id);

-- Conversations
conversations (
  id UUID PRIMARY KEY,
  type ENUM('direct', 'group'),
  name VARCHAR(100), -- NULL pour direct
  avatar_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Participants
conversation_participants (
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role ENUM('owner', 'admin', 'member'),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  last_read_message_id UUID,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_participants_user ON conversation_participants(user_id);

-- Messages
messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id),
  sender_device_id UUID REFERENCES devices(id),
  
  -- E2E encrypted content
  ciphertext BYTEA NOT NULL, -- Encrypted message body
  
  -- Metadata (non-sensitive)
  type ENUM('text', 'media', 'file', 'call', 'system'),
  reply_to_id UUID REFERENCES messages(id),
  
  -- Media references (encrypted)
  media_keys JSONB, -- {url: S3 key, size, mimetype, encryption_key}
  
  -- Delivery tracking
  created_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ -- For ephemeral messages
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- Message receipts (who read what)
message_receipts (
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id),
  status ENUM('sent', 'delivered', 'read'),
  timestamp TIMESTAMPTZ,
  PRIMARY KEY (message_id, user_id, device_id)
);

-- Calls
calls (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  initiator_id UUID REFERENCES users(id),
  type ENUM('audio', 'video'),
  status ENUM('ringing', 'active', 'ended', 'missed'),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INT
);

-- Contacts
contacts (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  contact_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  nickname VARCHAR(100),
  blocked BOOLEAN DEFAULT false,
  added_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, contact_user_id)
);
```

### Indexation pour recherche (OpenSearch)

```json
{
  "messages_index": {
    "mappings": {
      "properties": {
        "message_id": {"type": "keyword"},
        "conversation_id": {"type": "keyword"},
        "sender_id": {"type": "keyword"},
        "sender_name": {"type": "text"},
        "text": {"type": "text", "analyzer": "standard"},
        "created_at": {"type": "date"},
        "media_type": {"type": "keyword"}
      }
    }
  }
}
```

**Note :** Texte chiffré côté client → indexation côté client aussi (ou métadonnées uniquement côté serveur).

## Scalabilité

### Horizontal scaling

| Composant | Stratégie | Limite |
|-----------|-----------|--------|
| **Backend API** | Stateless, load-balanced | ~10k req/s/pod |
| **WebSocket GW** | Sticky sessions (Redis), sharding par user_id | 100k conn/pod |
| **PostgreSQL** | Read replicas, Citus (sharding) | 50k TPS |
| **Redis** | Cluster mode, partitioning | 1M ops/s |
| **OpenSearch** | Sharding, replicas | 10k queries/s |
| **S3** | Natif distribué | Illimité |

### Partitionnement (sharding)

**PostgreSQL :**
- **Shard key :** `conversation_id` (messages, participants)
- **Range-based :** Par date (archives anciennes)
- **Tool :** Citus extension

**Redis :**
- **Pub/Sub :** Channel par conversation (`conv:{id}`)
- **Cache :** Clé par user (`user:{id}:profile`)

## Résilience

### Stratégies

1. **Retry avec backoff exponentiel**
   - Clients retry automatique (TanStack Query)
   - Idempotency keys (header `Idempotency-Key`)

2. **Circuit breakers**
   - Opossum (Node.js)
   - Dégradation gracieuse (cache local)

3. **Rate limiting**
   - Redis sliding window
   - Par user : 20 msg/min, 100 req/min

4. **Timeouts**
   - API : 5s
   - WebSocket ping/pong : 30s
   - Appels : 60s établissement

5. **Backups**
   - PostgreSQL : PITR (Point-in-Time Recovery)
   - S3 : Versioning + lifecycle policies

## Sécurité réseau

### Zones

```
┌─────────────────────────────────────────────┐
│            Public Zone (DMZ)                │
│  ┌──────────────┐      ┌──────────────┐    │
│  │   ALB/CF     │      │   TURN       │    │
│  └──────┬───────┘      └──────┬───────┘    │
└─────────┼─────────────────────┼─────────────┘
          │                     │
┌─────────┼─────────────────────┼─────────────┐
│         │   Private Zone      │             │
│  ┌──────▼───────┐      ┌──────▼───────┐    │
│  │   Backend    │      │   WebRTC     │    │
│  │   (EKS)      │      │   SFU        │    │
│  └──────┬───────┘      └──────────────┘    │
│         │                                   │
│  ┌──────▼───────┐      ┌──────────────┐    │
│  │     RDS      │      │   Redis      │    │
│  └──────────────┘      └──────────────┘    │
└───────────────────────────────────────────────┘
```

### Règles firewall (Security Groups)

- **ALB :** Ingress 443 (HTTPS), 80 (redirect)
- **Backend pods :** Ingress from ALB only (port 3000)
- **RDS :** Ingress from backend pods only (port 5432)
- **Redis :** Ingress from backend pods only (port 6379)
- **Egress :** HTTPS vers APIs externes (Twilio, FCM), S3

---
**Document owner :** Architecte  
**Dernière révision :** 3 décembre 2025  
**Statut :** Draft → Revue pair
