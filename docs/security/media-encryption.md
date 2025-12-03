# Chiffrement des fichiers/médias (clés éphémères)

Objectif: garantir la confidentialité des pièces jointes via chiffrement côté client avec des **clés éphémères** (32 octets) et **chunking**.

## Vue d'ensemble

- Génération **fileKey** aléatoire (client), jamais stockée côté serveur
- Chiffrement par **chunks** avec XChaCha20-Poly1305 (AEAD)
- **Nonce unique** par chunk (stocké côté serveur, non secret)
- Upload via API `POST /media/upload` (ciphertext base64)
- Téléchargement via API `GET /media/download/:mediaId/:chunkIndex`
- Métadonnées (mimeType, chunkSize, chunkCount) stockées côté serveur
- `mediaKeys` dans `Message` contient `mediaId`, métadonnées et `encryptedFileKeys` (clé éphémère enveloppée par destinataire)

## API

- `POST /media/init` → `{ mediaId, fileKey, chunkSize }` (fileKey générée côté serveur et transmise au client; ne transite jamais en clair vers d'autres destinataires)
- `POST /media/upload` → `{ mediaId, chunkIndex, ciphertextBase64, nonceBase64 }`
- `POST /media/complete` → `{ mediaId, chunkCount }`
- `GET  /media/download/:mediaId/:chunkIndex` → `{ ciphertextBase64, nonceBase64, mimeType }`

Toutes les routes sont protégées par JWT. Le téléchargement vérifie que le requester est **participant** de la conversation.

## Flux Client

1. `init` → reçoit `mediaId` + `fileKey`
2. Découpe le fichier en `chunkSize` (p.ex. 1 Mo)
3. Pour chaque chunk:
   - Génère nonce aléatoire (24 bytes)
   - Chiffre avec XChaCha20-Poly1305
   - Upload `{ mediaId, chunkIndex, ciphertextBase64, nonceBase64 }`
4. `complete` avec `chunkCount`
5. Envoie le message avec `mediaKeys`:
   - `mediaId`, `filename`, `mimeType`, `chunkCount`
   - `encryptedFileKeys`: tableau de `{ deviceId, scheme, ciphertextBase64 }`
   - Ne jamais inclure `fileKey` en clair côté message diffusé

### Durcissement (Double Ratchet)

1. Maintenir un état Double Ratchet par device côté client (web/mobile), établi via X3DH.
2. Exposer côté API participants les devices actifs et clés publiques pour l’établissement/renouvellement de sessions.
3. À l’envoi, chiffrer `fileKey` par device via Ratchet, placer les enveloppes dans `encryptedFileKeys`.
4. À la réception, déchiffrer l’enveloppe pour récupérer `fileKey`, puis télécharger et déchiffrer les chunks.
5. Transition possible: utiliser `crypto_box_seal` (sealed box) jusqu’à disponibilité Ratchet côté client.

## Sécurité

- **Zero-knowledge** serveur: aucune clé (fileKey) persistée
- **Intégrité**: Poly1305 (AEAD) détecte toute altération
- **Accès contrôlé**: téléchargement autorisé uniquement aux participants
- **Forward secrecy**: `fileKey` unique par fichier + sessions E2E pour `mediaKeys`

## Tests à réaliser

- Chiffrement/Déchiffrement round-trip (1000 chunks)
- Nonce unique par chunk (pas de réutilisation)
- Accès refusé pour non-participant
- Upload incomplet → téléchargement partiel géré

