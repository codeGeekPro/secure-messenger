# Schéma de Base de Données - Secure Messenger

## Modèle Conceptuel (ERD)

```
┌─────────────┐         ┌─────────────────┐         ┌─────────────┐
│   Users     │1      * │   Devices       │         │  Contacts   │
│─────────────│─────────│─────────────────│         │─────────────│
│ id          │         │ id              │         │ user_id     │
│ phone       │         │ user_id (FK)    │         │ contact_id  │
│ email       │         │ device_name     │         │ nickname    │
│ username    │         │ platform        │         │ blocked     │
│ display_name│         │ push_token      │         └─────────────┘
│ avatar_url  │         │ identity_key    │                │
│ status_text │         │ signed_prekey   │                │
│ created_at  │         │ one_time_prekeys│                │
└──────┬──────┘         └─────────────────┘                │
       │                                                    │
       │ 1                                                  │
       │                                           ┌────────┴────────┐
       │ *                                         │      m:n         │
       │                                           └─────────────────┘
       │
       │
┌──────┴──────┐         ┌─────────────────┐
│Conversation │1      * │  Participants   │
│  Participants│─────────│─────────────────│
│─────────────│         │ conversation_id │
│conversation_│         │ user_id (FK)    │
│   id (FK)   │         │ role            │
│ user_id (FK)│         │ joined_at       │
│ role        │         │ left_at         │
│ joined_at   │         │ last_read_msg_id│
│ last_read_  │         └─────────────────┘
│  message_id │
└──────┬──────┘
       │
       │ belongs to
       │
       │ 1
       │
┌──────┴──────────┐         ┌─────────────────┐
│ Conversations   │1      * │    Messages     │
│─────────────────│─────────│─────────────────│
│ id              │         │ id              │
│ type            │         │ conversation_id │
│ name            │         │ sender_id (FK)  │
│ avatar_url      │         │ sender_device_id│
│ created_by (FK) │         │ ciphertext      │
│ created_at      │         │ type            │
└─────────────────┘         │ reply_to_id     │
                            │ media_keys      │
                            │ created_at      │
                            │ edited_at       │
                            │ deleted_at      │
                            │ expires_at      │
                            └────────┬────────┘
                                     │
                                     │ 1
                                     │
                                     │ *
                            ┌────────┴────────┐
                            │ Message Receipts│
                            │─────────────────│
                            │ message_id (FK) │
                            │ user_id (FK)    │
                            │ device_id (FK)  │
                            │ status          │
                            │ timestamp       │
                            └─────────────────┘

┌─────────────────┐
│     Calls       │
│─────────────────│
│ id              │
│ conversation_id │
│ initiator_id    │
│ type            │
│ status          │
│ started_at      │
│ ended_at        │
│ duration_secs   │
└─────────────────┘
```

## Scripts SQL (PostgreSQL 16)

### Schema initial

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy search

-- Create ENUM types
CREATE TYPE user_platform AS ENUM ('ios', 'android', 'web', 'desktop');
CREATE TYPE conversation_type AS ENUM ('direct', 'group');
CREATE TYPE participant_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE message_type AS ENUM ('text', 'media', 'file', 'call', 'system');
CREATE TYPE receipt_status AS ENUM ('sent', 'delivered', 'read');
CREATE TYPE call_type AS ENUM ('audio', 'video');
CREATE TYPE call_status AS ENUM ('ringing', 'active', 'ended', 'missed', 'declined');

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(255) UNIQUE,
  username VARCHAR(50) UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  status_text VARCHAR(200),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT chk_contact_method CHECK (
    phone IS NOT NULL OR email IS NOT NULL
  )
);

-- Indexes for users
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_last_seen ON users(last_seen_at);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Devices table (multi-device support)
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name VARCHAR(100) NOT NULL,
  platform user_platform NOT NULL,
  push_token TEXT,
  
  -- Crypto keys (X3DH)
  identity_key TEXT NOT NULL, -- X25519 public key (base64)
  signed_prekey JSONB NOT NULL, -- {key, signature, timestamp}
  one_time_prekeys JSONB[] DEFAULT '{}', -- Array of prekeys
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT uq_device_push_token UNIQUE(push_token)
);

CREATE INDEX idx_devices_user ON devices(user_id);
CREATE INDEX idx_devices_active ON devices(user_id, is_active);

-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type conversation_type NOT NULL,
  name VARCHAR(100), -- NULL for direct chats
  avatar_url TEXT,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Conversation participants
CREATE TABLE conversation_participants (
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role participant_role DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  last_read_message_id UUID, -- For read receipts
  notifications_enabled BOOLEAN DEFAULT true,
  
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_participants_user ON conversation_participants(user_id);
CREATE INDEX idx_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX idx_participants_active ON conversation_participants(conversation_id, user_id) WHERE left_at IS NULL;

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  sender_device_id UUID REFERENCES devices(id),
  
  -- E2E encrypted content (opaque to server)
  ciphertext BYTEA NOT NULL,
  
  -- Metadata (non-sensitive)
  type message_type DEFAULT 'text',
  reply_to_id UUID REFERENCES messages(id),
  
  -- Media references (S3 keys + encryption metadata)
  media_keys JSONB, -- [{url, size, mimetype, encryption_key_hash}]
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- For ephemeral messages
  
  -- For idempotency
  idempotency_key VARCHAR(100) UNIQUE
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_reply_to ON messages(reply_to_id);
CREATE INDEX idx_messages_expires ON messages(expires_at) WHERE expires_at IS NOT NULL;

-- Trigger to update conversation last_message_at
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_last_message_trigger
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();

-- Message receipts (delivery and read status)
CREATE TABLE message_receipts (
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id),
  status receipt_status NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (message_id, user_id, device_id)
);

CREATE INDEX idx_receipts_message ON message_receipts(message_id);
CREATE INDEX idx_receipts_user ON message_receipts(user_id);

-- Contacts table
CREATE TABLE contacts (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  contact_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  nickname VARCHAR(100),
  blocked BOOLEAN DEFAULT false,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (user_id, contact_user_id),
  CONSTRAINT chk_no_self_contact CHECK (user_id != contact_user_id)
);

CREATE INDEX idx_contacts_user ON contacts(user_id);
CREATE INDEX idx_contacts_blocked ON contacts(user_id, blocked);

-- Calls table
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  initiator_id UUID NOT NULL REFERENCES users(id),
  type call_type NOT NULL,
  status call_status DEFAULT 'ringing',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INT,
  
  -- WebRTC metadata
  ice_servers JSONB,
  
  CONSTRAINT chk_duration CHECK (
    (ended_at IS NULL AND duration_seconds IS NULL) OR
    (ended_at IS NOT NULL AND duration_seconds >= 0)
  )
);

CREATE INDEX idx_calls_conversation ON calls(conversation_id);
CREATE INDEX idx_calls_initiator ON calls(initiator_id);
CREATE INDEX idx_calls_started ON calls(started_at DESC);

-- Call participants
CREATE TABLE call_participants (
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  
  PRIMARY KEY (call_id, user_id)
);

CREATE INDEX idx_call_participants_call ON call_participants(call_id);
```

### Fonctions utilitaires

```sql
-- Get unread message count for a user in a conversation
CREATE OR REPLACE FUNCTION get_unread_count(
  p_user_id UUID,
  p_conversation_id UUID
)
RETURNS INT AS $$
DECLARE
  last_read_id UUID;
  unread_count INT;
BEGIN
  -- Get last read message ID
  SELECT last_read_message_id INTO last_read_id
  FROM conversation_participants
  WHERE user_id = p_user_id
    AND conversation_id = p_conversation_id;
  
  -- Count messages after last read
  SELECT COUNT(*) INTO unread_count
  FROM messages
  WHERE conversation_id = p_conversation_id
    AND created_at > (
      SELECT created_at FROM messages WHERE id = last_read_id
    )
    AND sender_id != p_user_id
    AND deleted_at IS NULL;
  
  RETURN COALESCE(unread_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Mark messages as read
CREATE OR REPLACE FUNCTION mark_messages_read(
  p_user_id UUID,
  p_device_id UUID,
  p_conversation_id UUID,
  p_up_to_message_id UUID
)
RETURNS VOID AS $$
BEGIN
  -- Update participant's last read message
  UPDATE conversation_participants
  SET last_read_message_id = p_up_to_message_id
  WHERE user_id = p_user_id
    AND conversation_id = p_conversation_id;
  
  -- Insert/update receipts
  INSERT INTO message_receipts (message_id, user_id, device_id, status)
  SELECT id, p_user_id, p_device_id, 'read'::receipt_status
  FROM messages
  WHERE conversation_id = p_conversation_id
    AND created_at <= (SELECT created_at FROM messages WHERE id = p_up_to_message_id)
    AND sender_id != p_user_id
  ON CONFLICT (message_id, user_id, device_id)
  DO UPDATE SET status = 'read', timestamp = NOW();
END;
$$ LANGUAGE plpgsql;

-- Clean up expired messages
CREATE OR REPLACE FUNCTION cleanup_expired_messages()
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  WITH deleted AS (
    DELETE FROM messages
    WHERE expires_at < NOW()
      AND deleted_at IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
```

### Migrations avec Prisma

```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String    @id @default(uuid()) @db.Uuid
  phone        String?   @unique @db.VarChar(20)
  email        String?   @unique @db.VarChar(255)
  username     String?   @unique @db.VarChar(50)
  displayName  String    @map("display_name") @db.VarChar(100)
  avatarUrl    String?   @map("avatar_url") @db.Text
  statusText   String?   @map("status_text") @db.VarChar(200)
  isActive     Boolean   @default(true) @map("is_active")
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  lastSeenAt   DateTime  @default(now()) @map("last_seen_at") @db.Timestamptz

  devices      Device[]
  messages     Message[]
  participants ConversationParticipant[]
  contacts     Contact[]                 @relation("UserContacts")
  contactOf    Contact[]                 @relation("ContactUser")

  @@map("users")
}

model Device {
  id              String   @id @default(uuid()) @db.Uuid
  userId          String   @map("user_id") @db.Uuid
  deviceName      String   @map("device_name") @db.VarChar(100)
  platform        Platform
  pushToken       String?  @unique @map("push_token") @db.Text
  identityKey     String   @map("identity_key") @db.Text
  signedPrekey    Json     @map("signed_prekey")
  oneTimePrekeys  Json[]   @default([]) @map("one_time_prekeys")
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  lastActiveAt    DateTime @default(now()) @map("last_active_at") @db.Timestamptz

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isActive])
  @@map("devices")
}

enum Platform {
  ios
  android
  web
  desktop

  @@map("user_platform")
}

// ... (autres modèles similaires)
```

## Optimisations

### Partitionnement (pour scale)

```sql
-- Partition messages par mois (range partitioning)
CREATE TABLE messages_partitioned (
  LIKE messages INCLUDING ALL
) PARTITION BY RANGE (created_at);

CREATE TABLE messages_2025_12 PARTITION OF messages_partitioned
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE TABLE messages_2026_01 PARTITION OF messages_partitioned
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- Auto-création de partitions via pg_partman
```

### Indexes composites

```sql
-- Recherche de conversations non lues
CREATE INDEX idx_unread_conversations
ON conversation_participants (user_id, last_read_message_id)
WHERE left_at IS NULL;

-- Recherche full-text sur usernames
CREATE INDEX idx_users_username_trgm
ON users USING gin (username gin_trgm_ops);
```

---
**Document owner :** DBA  
**Dernière révision :** 3 décembre 2025  
**Statut :** Validé
