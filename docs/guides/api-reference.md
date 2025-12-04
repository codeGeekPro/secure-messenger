# API Reference - Secure Messenger

**Version**: 1.0.0  
**Base URL**: `https://api.secure-messenger.app`  
**Date**: 4 décembre 2025

---

## Table des Matières

1. [Introduction](#introduction)
2. [Authentification](#authentification)
3. [Endpoints REST](#endpoints-rest)
4. [WebSocket API](#websocket-api)
5. [Rate Limiting](#rate-limiting)
6. [Erreurs](#erreurs)
7. [Exemples](#exemples)

---

## Introduction

### Protocoles

- **REST API**: HTTP/HTTPS pour opérations CRUD
- **WebSocket**: Temps réel (messages, présence, appels)

### Formats

- **Request**: `application/json`
- **Response**: `application/json`
- **Media**: `multipart/form-data`

### Versioning

API versionnée via header:
```http
API-Version: 1.0
```

---

## Authentification

### Register

**POST** `/auth/register`

```json
{
  "email": "user@example.com",
  "password": "SecureP@ss123",
  "name": "John Doe"
}
```

**Response 201**:
```json
{
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "tokens": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresIn": 604800
  }
}
```

### Login

**POST** `/auth/login`

```json
{
  "email": "user@example.com",
  "password": "SecureP@ss123"
}
```

### Refresh Token

**POST** `/auth/refresh`

```json
{
  "refreshToken": "eyJhbGc..."
}
```

### Headers

```http
Authorization: Bearer <accessToken>
```

---

## Endpoints REST

### Users

#### Get Current User

**GET** `/users/me`

**Response 200**:
```json
{
  "id": "user-123",
  "email": "user@example.com",
  "name": "John Doe",
  "avatar": "https://cdn.../avatar.jpg",
  "publicKey": "base64...",
  "createdAt": "2025-12-04T10:00:00Z"
}
```

#### Update Profile

**PATCH** `/users/me`

```json
{
  "name": "John Smith",
  "bio": "Software Engineer"
}
```

#### Search Users

**GET** `/users/search?q=john`

**Response 200**:
```json
{
  "users": [
    {
      "id": "user-456",
      "name": "John Smith",
      "email": "john@example.com",
      "avatar": "..."
    }
  ],
  "total": 1
}
```

### Conversations

#### List Conversations

**GET** `/conversations?limit=20&offset=0`

**Response 200**:
```json
{
  "conversations": [
    {
      "id": "conv-123",
      "type": "DIRECT",
      "participants": [...],
      "lastMessage": {
        "content": "Hello!",
        "sentAt": "2025-12-04T10:30:00Z"
      },
      "unreadCount": 3
    }
  ],
  "total": 15
}
```

#### Create Conversation

**POST** `/conversations`

```json
{
  "participantIds": ["user-456"],
  "type": "DIRECT"
}
```

#### Get Conversation

**GET** `/conversations/:id`

### Messages

#### List Messages

**GET** `/conversations/:id/messages?limit=50&before=msg-id`

**Response 200**:
```json
{
  "messages": [
    {
      "id": "msg-123",
      "conversationId": "conv-123",
      "senderId": "user-123",
      "content": "encrypted_content_base64",
      "type": "TEXT",
      "sentAt": "2025-12-04T10:30:00Z",
      "reactions": [
        {"emoji": "👍", "userId": "user-456"}
      ]
    }
  ],
  "hasMore": true
}
```

#### Send Message

**POST** `/conversations/:id/messages`

```json
{
  "content": "encrypted_content_base64",
  "type": "TEXT",
  "replyToId": "msg-122"
}
```

#### Delete Message

**DELETE** `/messages/:id`

Query params:
- `forEveryone=true`: Delete for all participants

### Media

#### Init Upload

**POST** `/media/init`

```json
{
  "filename": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 2048576,
  "conversationId": "conv-123"
}
```

**Response 200**:
```json
{
  "uploadId": "upload-123",
  "uploadUrl": "https://s3.../upload",
  "mediaId": "media-123"
}
```

#### Complete Upload

**POST** `/media/:id/complete`

```json
{
  "uploadId": "upload-123"
}
```

#### Download Media

**GET** `/media/:id/download`

Returns presigned S3 URL:
```json
{
  "url": "https://s3.../media?signature=...",
  "expiresIn": 3600
}
```

### Groups

#### Create Group

**POST** `/groups`

```json
{
  "name": "Team Project",
  "description": "Project discussion",
  "memberIds": ["user-456", "user-789"]
}
```

#### Add Members

**POST** `/groups/:id/members`

```json
{
  "userIds": ["user-999"]
}
```

#### Update Member Role

**PATCH** `/groups/:id/members/:userId`

```json
{
  "role": "ADMIN"
}
```

#### Create Invite Link

**POST** `/groups/:id/invites`

```json
{
  "expiresIn": 86400,
  "maxUses": 10
}
```

**Response 201**:
```json
{
  "inviteCode": "abc123xyz",
  "inviteUrl": "https://secure-messenger.app/invite/abc123xyz",
  "expiresAt": "2025-12-05T10:00:00Z"
}
```

### Calls

#### Start Call

**POST** `/calls`

```json
{
  "conversationId": "conv-123",
  "type": "VIDEO"
}
```

**Response 201**:
```json
{
  "callId": "call-123",
  "roomId": "room-xyz",
  "iceServers": [
    {
      "urls": "stun:stun.l.google.com:19302"
    }
  ]
}
```

#### End Call

**DELETE** `/calls/:id`

### Devices

#### List Devices

**GET** `/devices`

**Response 200**:
```json
{
  "devices": [
    {
      "id": "device-123",
      "name": "iPhone 15",
      "type": "MOBILE",
      "lastActive": "2025-12-04T10:00:00Z",
      "current": true
    }
  ]
}
```

#### Remove Device

**DELETE** `/devices/:id`

---

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('wss://api.secure-messenger.app/ws');

ws.onopen = () => {
  // Authenticate
  ws.send(JSON.stringify({
    type: 'authenticate',
    token: 'Bearer eyJhbGc...'
  }));
};
```

### Message Format

```json
{
  "type": "event_type",
  "data": { ... },
  "timestamp": "2025-12-04T10:00:00Z"
}
```

### Events (Client → Server)

#### Message Send

```json
{
  "type": "message.send",
  "data": {
    "conversationId": "conv-123",
    "content": "encrypted_base64",
    "type": "TEXT"
  }
}
```

#### Typing Indicator

```json
{
  "type": "typing.start",
  "data": {
    "conversationId": "conv-123"
  }
}
```

#### Presence Update

```json
{
  "type": "presence.update",
  "data": {
    "status": "ONLINE"
  }
}
```

### Events (Server → Client)

#### Message Received

```json
{
  "type": "message.new",
  "data": {
    "id": "msg-123",
    "conversationId": "conv-123",
    "senderId": "user-456",
    "content": "encrypted_base64",
    "sentAt": "2025-12-04T10:30:00Z"
  }
}
```

#### Typing Indicator

```json
{
  "type": "typing.start",
  "data": {
    "conversationId": "conv-123",
    "userId": "user-456"
  }
}
```

#### Presence Change

```json
{
  "type": "presence.changed",
  "data": {
    "userId": "user-456",
    "status": "ONLINE",
    "lastSeen": "2025-12-04T10:00:00Z"
  }
}
```

#### Call Offer

```json
{
  "type": "call.offer",
  "data": {
    "callId": "call-123",
    "fromUserId": "user-456",
    "sdp": "v=0...",
    "type": "VIDEO"
  }
}
```

#### Call Answer

```json
{
  "type": "call.answer",
  "data": {
    "callId": "call-123",
    "sdp": "v=0..."
  }
}
```

#### ICE Candidate

```json
{
  "type": "call.icecandidate",
  "data": {
    "callId": "call-123",
    "candidate": "..."
  }
}
```

---

## Rate Limiting

### Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/auth/*` | 10 req | 1 min |
| `/messages` | 100 req | 1 min |
| `/media/*` | 20 req | 1 min |
| Global | 100 req | 1 min |

### Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1701691200
```

### Response 429

```json
{
  "statusCode": 429,
  "message": "Too many requests",
  "retryAfter": 60
}
```

---

## Erreurs

### Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### Codes HTTP

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

## Exemples

### cURL

```bash
# Login
curl -X POST https://api.secure-messenger.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass"}'

# Get conversations
curl https://api.secure-messenger.app/conversations \
  -H "Authorization: Bearer TOKEN"

# Send message
curl -X POST https://api.secure-messenger.app/conversations/conv-123/messages \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"encrypted_base64","type":"TEXT"}'
```

### JavaScript (fetch)

```javascript
// Login
const loginResponse = await fetch('https://api.secure-messenger.app/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'pass'
  })
});
const { tokens } = await loginResponse.json();

// Send message
const messageResponse = await fetch(
  'https://api.secure-messenger.app/conversations/conv-123/messages',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokens.accessToken}`
    },
    body: JSON.stringify({
      content: 'encrypted_base64',
      type: 'TEXT'
    })
  }
);
```

### TypeScript SDK

```typescript
import { SecureMessengerClient } from '@secure-messenger/sdk';

const client = new SecureMessengerClient({
  baseURL: 'https://api.secure-messenger.app',
  accessToken: 'your_token'
});

// Send message
const message = await client.messages.send('conv-123', {
  content: encryptedContent,
  type: 'TEXT'
});

// Listen for messages
client.on('message.new', (message) => {
  console.log('New message:', message);
});
```

---

**Documentation générée automatiquement depuis le code source.**  
**Version**: 1.0.0  
**Dernière mise à jour**: 4 décembre 2025
