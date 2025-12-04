import { Injectable } from '@nestjs/common';
import sodium from 'libsodium-wrappers';

/**
 * Service bas niveau pour primitives cryptographiques
 * Wrapper autour de libsodium pour usage NestJS
 */
@Injectable()
export class CryptoService {
  private initialized = false;

  async onModuleInit() {
    await this.initCrypto();
  }

  /**
   * Initialise libsodium (doit être appelé avant toute opération crypto)
   */
  async initCrypto(): Promise<void> {
    if (!this.initialized) {
      await sodium.ready;
      this.initialized = true;
    }
  }

  /**
   * Génère une paire de clés Curve25519 pour ECDH
   */
  generateKeyPair(): {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  } {
    const keyPair = sodium.crypto_box_keypair();
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    };
  }

  /**
   * Génère une paire de clés Ed25519 pour signatures
   */
  generateSigningKeyPair(): {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  } {
    const keyPair = sodium.crypto_sign_keypair();
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    };
  }

  /**
   * Signe un message avec Ed25519
   */
  sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
    return sodium.crypto_sign_detached(message, privateKey);
  }

  /**
   * Vérifie une signature Ed25519
   */
  verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): boolean {
    return sodium.crypto_sign_verify_detached(signature, message, publicKey);
  }

  /**
   * Convertit une clé publique Ed25519 en Curve25519
   */
  convertPublicKeyToCurve25519(ed25519PublicKey: Uint8Array): Uint8Array {
    return sodium.crypto_sign_ed25519_pk_to_curve25519(ed25519PublicKey);
  }

  /**
   * Convertit une clé privée Ed25519 en Curve25519
   */
  convertPrivateKeyToCurve25519(ed25519PrivateKey: Uint8Array): Uint8Array {
    return sodium.crypto_sign_ed25519_sk_to_curve25519(ed25519PrivateKey);
  }

  /**
   * Calcule ECDH (Diffie-Hellman sur Curve25519)
   */
  ecdh(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
    // Ensure keys are the correct length for Curve25519 (32 bytes)
    if (privateKey.length !== 32) {
      throw new Error(`Invalid private key length: ${privateKey.length}, expected 32`);
    }
    if (publicKey.length !== 32) {
      throw new Error(`Invalid public key length: ${publicKey.length}, expected 32`);
    }
    return sodium.crypto_scalarmult(privateKey, publicKey);
  }

  /**
   * Dérive des clés avec HKDF (HMAC-based Key Derivation Function)
   */
  hkdf(
    inputKeyMaterial: Uint8Array,
    salt: Uint8Array,
    info: string,
    length: number
  ): Uint8Array {
    // Use crypto_generichash as an alternative to HMAC-SHA256 for key derivation
    const prk = sodium.crypto_generichash(32, inputKeyMaterial, salt);
    const infoBuffer = sodium.from_string(info);
    const combined = new Uint8Array([...prk, ...infoBuffer, 1]);
    const okm = sodium.crypto_generichash(length, combined, salt);
    return okm;
  }

  /**
   * Chiffre avec XChaCha20-Poly1305 (AEAD)
   */
  encrypt(
    plaintext: Uint8Array,
    key: Uint8Array,
    nonce?: Uint8Array
  ): { ciphertext: Uint8Array; nonce: Uint8Array } {
    const actualNonce =
      nonce ||
      sodium.randombytes_buf(
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
      );
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext,
      null,
      null,
      actualNonce,
      key
    );
    return { ciphertext, nonce: actualNonce };
  }

  /**
   * Déchiffre avec XChaCha20-Poly1305
   */
  decrypt(
    ciphertext: Uint8Array,
    key: Uint8Array,
    nonce: Uint8Array
  ): Uint8Array {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      null,
      nonce,
      key
    );
  }

  /**
   * Hash avec BLAKE2b
   */
  hash(data: Uint8Array): Uint8Array {
    return sodium.crypto_generichash(32, data);
  }

  /**
   * Efface une clé de la mémoire (sécurité)
   */
  memzero(key: Uint8Array): void {
    sodium.memzero(key);
  }

  /**
   * Génère bytes aléatoires
   */
  randomBytes(length: number): Uint8Array {
    return sodium.randombytes_buf(length);
  }

  /**
   * Encode Uint8Array en base64
   */
  toBase64(data: Uint8Array): string {
    return sodium.to_base64(data, sodium.base64_variants.ORIGINAL);
  }

  /**
   * Décode base64 en Uint8Array
   */
  fromBase64(data: string): Uint8Array {
    return sodium.from_base64(data, sodium.base64_variants.ORIGINAL);
  }

  /**
   * Encode Uint8Array en hex
   */
  toHex(data: Uint8Array): string {
    return sodium.to_hex(data);
  }

  /**
   * Décode hex en Uint8Array
   */
  fromHex(data: string): Uint8Array {
    return sodium.from_hex(data);
  }
}
