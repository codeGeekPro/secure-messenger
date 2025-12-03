# POC Chiffrement End-to-End (Signal Protocol)

## Objectif

Valider l'implémentation de **X3DH + Double Ratchet** en TypeScript avec libsodium, sur des messages courts (< 1 KB).

## Prérequis

```bash
npm install libsodium-wrappers
npm install --save-dev @types/libsodium-wrappers typescript ts-node
```

## Structure

```
poc-crypto/
├── package.json
├── tsconfig.json
├── src/
│   ├── crypto.ts          # Primitives (wrapping libsodium)
│   ├── x3dh.ts            # Échange de clés initial
│   ├── ratchet.ts         # Double Ratchet
│   ├── session.ts         # Gestion de session
│   └── demo.ts            # Démo Alice → Bob
└── tests/
    └── e2e.test.ts        # Tests unitaires
```

## Tests à valider

### Critères de succès

- [x] Génération clés (Identity, Signed Prekey, One-Time Prekeys)
- [x] X3DH complet (Alice initie avec Bob)
- [x] Envoi/réception de 100 messages consécutifs
- [x] Out-of-order delivery (messages reçus dans le désordre)
- [x] Rotation Signed Prekey (hebdomadaire)
- [x] Safety Number generation

### Métriques

- **Performance :** < 5ms par chiffrement/déchiffrement (Node.js, laptop)
- **Taille :** Overhead < 200 bytes par message
- **Mémoire :** Zeroing des clés après usage (vérif avec heap snapshot)

## Commandes

```bash
# Installation
cd poc-crypto
npm install

# Lancer POC
npm run demo

# Tests unitaires
npm test

# Tests avec coverage
npm run test:coverage
```

---
**Document owner :** Crypto Lead  
**Statut :** En développement
