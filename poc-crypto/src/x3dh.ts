import {
  generateKeyPair,
  generateSigningKeyPair,
  sign,
  verify,
  ecdh,
  hkdf,
  randomBytes,
} from './crypto';

/**
 * Bundle de clés publiques (uploadé sur serveur)
 */
export interface KeyBundle {
  identityKey: Uint8Array;
  signedPreKey: {
    publicKey: Uint8Array;
    signature: Uint8Array;
  };
  oneTimePreKeys: Uint8Array[];
}

/**
 * Génère un bundle de clés pour un utilisateur
 */
export function generateKeyBundle(numOneTimeKeys = 100): {
  bundle: KeyBundle;
  privateKeys: {
    identityKey: Uint8Array;
    signedPreKey: Uint8Array;
    oneTimePreKeys: Uint8Array[];
  };
} {
  // Identity Key (Ed25519 pour signatures)
  const identityKeyPair = generateSigningKeyPair();

  // Signed Prekey (Curve25519)
  const signedPreKeyPair = generateKeyPair();
  const signedPreKeySignature = sign(
    signedPreKeyPair.publicKey,
    identityKeyPair.privateKey
  );

  // One-Time Prekeys
  const oneTimePreKeys: Uint8Array[] = [];
  const oneTimePreKeysPrivate: Uint8Array[] = [];

  for (let i = 0; i < numOneTimeKeys; i++) {
    const opk = generateKeyPair();
    oneTimePreKeys.push(opk.publicKey);
    oneTimePreKeysPrivate.push(opk.privateKey);
  }

  return {
    bundle: {
      identityKey: identityKeyPair.publicKey,
      signedPreKey: {
        publicKey: signedPreKeyPair.publicKey,
        signature: signedPreKeySignature,
      },
      oneTimePreKeys,
    },
    privateKeys: {
      identityKey: identityKeyPair.privateKey,
      signedPreKey: signedPreKeyPair.privateKey,
      oneTimePreKeys: oneTimePreKeysPrivate,
    },
  };
}

/**
 * Vérifie la signature du Signed Prekey
 */
export function verifyKeyBundle(bundle: KeyBundle): boolean {
  return verify(
    bundle.signedPreKey.publicKey,
    bundle.signedPreKey.signature,
    bundle.identityKey
  );
}

/**
 * X3DH : Alice initie session avec Bob
 * Retourne la Root Key partagée
 */
export function initiateX3DH(
  aliceIdentityPrivate: Uint8Array,
  aliceEphemeralPrivate: Uint8Array,
  bobBundle: KeyBundle,
  useOneTimePreKey = true
): Uint8Array {
  // Vérifier signature du bundle
  if (!verifyKeyBundle(bobBundle)) {
    throw new Error('Invalid key bundle signature');
  }

  // Convertir Identity Key Ed25519 → Curve25519 (pour ECDH)
  // Note: Dans une vraie implem, il faut 2 Identity Keys (sign + DH)
  // Ici simplifié pour POC

  // DH1 = ECDH(IK_A, SPK_B)
  const dh1 = ecdh(aliceIdentityPrivate, bobBundle.signedPreKey.publicKey);

  // DH2 = ECDH(EK_A, IK_B)
  const dh2 = ecdh(aliceEphemeralPrivate, bobBundle.identityKey);

  // DH3 = ECDH(EK_A, SPK_B)
  const dh3 = ecdh(aliceEphemeralPrivate, bobBundle.signedPreKey.publicKey);

  let sharedSecret: Uint8Array;

  if (useOneTimePreKey && bobBundle.oneTimePreKeys.length > 0) {
    // DH4 = ECDH(EK_A, OPK_B)
    const opk = bobBundle.oneTimePreKeys[0]; // Prendre le premier
    const dh4 = ecdh(aliceEphemeralPrivate, opk);

    // Combiner tous les DH
    sharedSecret = new Uint8Array([...dh1, ...dh2, ...dh3, ...dh4]);
  } else {
    sharedSecret = new Uint8Array([...dh1, ...dh2, ...dh3]);
  }

  // Dériver Root Key avec HKDF
  const rootKey = hkdf(sharedSecret, randomBytes(32), 'X3DH_ROOT_KEY', 32);

  return rootKey;
}

/**
 * X3DH : Bob accepte session depuis Alice
 */
export function acceptX3DH(
  bobIdentityPrivate: Uint8Array,
  bobSignedPreKeyPrivate: Uint8Array,
  bobOneTimePreKeyPrivate: Uint8Array | null,
  aliceIdentityPublic: Uint8Array,
  aliceEphemeralPublic: Uint8Array
): Uint8Array {
  // Calcul des mêmes DH que Alice, mais avec clés inversées
  const dh1 = ecdh(bobSignedPreKeyPrivate, aliceIdentityPublic);
  const dh2 = ecdh(bobIdentityPrivate, aliceEphemeralPublic);
  const dh3 = ecdh(bobSignedPreKeyPrivate, aliceEphemeralPublic);

  let sharedSecret: Uint8Array;

  if (bobOneTimePreKeyPrivate) {
    const dh4 = ecdh(bobOneTimePreKeyPrivate, aliceEphemeralPublic);
    sharedSecret = new Uint8Array([...dh1, ...dh2, ...dh3, ...dh4]);
  } else {
    sharedSecret = new Uint8Array([...dh1, ...dh2, ...dh3]);
  }

  const rootKey = hkdf(sharedSecret, randomBytes(32), 'X3DH_ROOT_KEY', 32);

  return rootKey;
}
