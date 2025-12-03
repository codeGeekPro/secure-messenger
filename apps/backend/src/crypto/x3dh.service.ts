import { Injectable } from '@nestjs/common';
import { CryptoService } from './crypto.service';

/**
 * Bundle de clés publiques (uploadé sur serveur)
 */
export interface KeyBundle {
  identityKey: string; // base64
  signedPreKey: {
    publicKey: string; // base64
    signature: string; // base64
  };
  oneTimePreKeys: string[]; // base64[]
}

/**
 * Service X3DH (Extended Triple Diffie-Hellman)
 * Gère l'échange de clés initial pour établir une session chiffrée
 */
@Injectable()
export class X3dhService {
  constructor(private readonly crypto: CryptoService) {}

  /**
   * Génère un bundle de clés pour un device
   */
  generateKeyBundle(numOneTimeKeys = 100): {
    bundle: KeyBundle;
    privateKeys: {
      identityKey: string; // base64
      signedPreKey: string; // base64
      oneTimePreKeys: string[]; // base64[]
    };
  } {
    // Identity Key (Ed25519 pour signatures)
    const identityKeyPair = this.crypto.generateSigningKeyPair();

    // Signed Prekey (Curve25519)
    const signedPreKeyPair = this.crypto.generateKeyPair();
    const signedPreKeySignature = this.crypto.sign(
      signedPreKeyPair.publicKey,
      identityKeyPair.privateKey
    );

    // One-Time Prekeys
    const oneTimePreKeys: string[] = [];
    const oneTimePreKeysPrivate: string[] = [];

    for (let i = 0; i < numOneTimeKeys; i++) {
      const opk = this.crypto.generateKeyPair();
      oneTimePreKeys.push(this.crypto.toBase64(opk.publicKey));
      oneTimePreKeysPrivate.push(this.crypto.toBase64(opk.privateKey));
    }

    return {
      bundle: {
        identityKey: this.crypto.toBase64(identityKeyPair.publicKey),
        signedPreKey: {
          publicKey: this.crypto.toBase64(signedPreKeyPair.publicKey),
          signature: this.crypto.toBase64(signedPreKeySignature),
        },
        oneTimePreKeys,
      },
      privateKeys: {
        identityKey: this.crypto.toBase64(identityKeyPair.privateKey),
        signedPreKey: this.crypto.toBase64(signedPreKeyPair.privateKey),
        oneTimePreKeys: oneTimePreKeysPrivate,
      },
    };
  }

  /**
   * Vérifie la signature du Signed Prekey
   */
  verifyKeyBundle(bundle: KeyBundle): boolean {
    const identityKey = this.crypto.fromBase64(bundle.identityKey);
    const signedPreKeyPublic = this.crypto.fromBase64(
      bundle.signedPreKey.publicKey
    );
    const signature = this.crypto.fromBase64(bundle.signedPreKey.signature);

    return this.crypto.verify(signedPreKeyPublic, signature, identityKey);
  }

  /**
   * X3DH : Alice initie session avec Bob
   * Retourne la Root Key partagée (base64)
   */
  initiateX3DH(
    aliceIdentityPrivate: string, // base64
    aliceEphemeralPrivate: string, // base64
    bobBundle: KeyBundle,
    useOneTimePreKey = true
  ): { rootKey: string; usedOneTimePreKeyIndex: number | null } {
    // Vérifier signature du bundle
    if (!this.verifyKeyBundle(bobBundle)) {
      throw new Error('Invalid key bundle signature');
    }

    const aliceIdPriv = this.crypto.fromBase64(aliceIdentityPrivate);
    const aliceEphPriv = this.crypto.fromBase64(aliceEphemeralPrivate);
    const bobIdPub = this.crypto.fromBase64(bobBundle.identityKey);
    const bobSpkPub = this.crypto.fromBase64(bobBundle.signedPreKey.publicKey);

    // DH1 = ECDH(IK_A, SPK_B)
    const dh1 = this.crypto.ecdh(aliceIdPriv, bobSpkPub);

    // DH2 = ECDH(EK_A, IK_B)
    const dh2 = this.crypto.ecdh(aliceEphPriv, bobIdPub);

    // DH3 = ECDH(EK_A, SPK_B)
    const dh3 = this.crypto.ecdh(aliceEphPriv, bobSpkPub);

    let sharedSecret: Uint8Array;
    let usedOneTimePreKeyIndex: number | null = null;

    if (useOneTimePreKey && bobBundle.oneTimePreKeys.length > 0) {
      // DH4 = ECDH(EK_A, OPK_B)
      const opkBase64 = bobBundle.oneTimePreKeys[0]; // Prendre le premier
      const opk = this.crypto.fromBase64(opkBase64);
      const dh4 = this.crypto.ecdh(aliceEphPriv, opk);

      sharedSecret = new Uint8Array([...dh1, ...dh2, ...dh3, ...dh4]);
      usedOneTimePreKeyIndex = 0;
    } else {
      sharedSecret = new Uint8Array([...dh1, ...dh2, ...dh3]);
    }

    // Dériver Root Key avec HKDF
    const rootKey = this.crypto.hkdf(
      sharedSecret,
      this.crypto.randomBytes(32),
      'X3DH_ROOT_KEY',
      32
    );

    // Nettoyer secrets
    this.crypto.memzero(sharedSecret);
    this.crypto.memzero(dh1);
    this.crypto.memzero(dh2);
    this.crypto.memzero(dh3);

    return {
      rootKey: this.crypto.toBase64(rootKey),
      usedOneTimePreKeyIndex,
    };
  }

  /**
   * X3DH : Bob accepte session depuis Alice
   */
  acceptX3DH(
    bobIdentityPrivate: string, // base64
    bobSignedPreKeyPrivate: string, // base64
    bobOneTimePreKeyPrivate: string | null, // base64
    aliceIdentityPublic: string, // base64
    aliceEphemeralPublic: string // base64
  ): string {
    const bobIdPriv = this.crypto.fromBase64(bobIdentityPrivate);
    const bobSpkPriv = this.crypto.fromBase64(bobSignedPreKeyPrivate);
    const aliceIdPub = this.crypto.fromBase64(aliceIdentityPublic);
    const aliceEphPub = this.crypto.fromBase64(aliceEphemeralPublic);

    // Calcul des mêmes DH que Alice, mais avec clés inversées
    const dh1 = this.crypto.ecdh(bobSpkPriv, aliceIdPub);
    const dh2 = this.crypto.ecdh(bobIdPriv, aliceEphPub);
    const dh3 = this.crypto.ecdh(bobSpkPriv, aliceEphPub);

    let sharedSecret: Uint8Array;

    if (bobOneTimePreKeyPrivate) {
      const bobOpkPriv = this.crypto.fromBase64(bobOneTimePreKeyPrivate);
      const dh4 = this.crypto.ecdh(bobOpkPriv, aliceEphPub);
      sharedSecret = new Uint8Array([...dh1, ...dh2, ...dh3, ...dh4]);
      this.crypto.memzero(dh4);
    } else {
      sharedSecret = new Uint8Array([...dh1, ...dh2, ...dh3]);
    }

    const rootKey = this.crypto.hkdf(
      sharedSecret,
      this.crypto.randomBytes(32),
      'X3DH_ROOT_KEY',
      32
    );

    // Nettoyer secrets
    this.crypto.memzero(sharedSecret);
    this.crypto.memzero(dh1);
    this.crypto.memzero(dh2);
    this.crypto.memzero(dh3);

    return this.crypto.toBase64(rootKey);
  }
}
