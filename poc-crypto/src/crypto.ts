import sodium from 'libsodium-wrappers';

/**
 * Initialise libsodium (doit être appelé avant toute opération crypto)
 */
export async function initCrypto(): Promise<void> {
  await sodium.ready;
}

/**
 * Génère une paire de clés Curve25519 pour ECDH
 */
export function generateKeyPair(): {
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
export function generateSigningKeyPair(): {
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
export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return sodium.crypto_sign_detached(message, privateKey);
}

/**
 * Vérifie une signature Ed25519
 */
export function verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  return sodium.crypto_sign_verify_detached(signature, message, publicKey);
}

/**
 * Calcule ECDH (Diffie-Hellman sur Curve25519)
 */
export function ecdh(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Uint8Array {
  return sodium.crypto_scalarmult(privateKey, publicKey);
}

/**
 * Dérive des clés avec HKDF (HMAC-based Key Derivation Function)
 */
export function hkdf(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  info: string,
  length: number
): Uint8Array {
  const prk = sodium.crypto_generichash(32, inputKeyMaterial, salt);
  const infoBuffer = sodium.from_string(info);
  const okm = sodium.crypto_generichash(
    length,
    new Uint8Array([...prk, ...infoBuffer, 1]),
    salt
  );
  return okm;
}

/**
 * Chiffre avec XChaCha20-Poly1305 (AEAD)
 */
export function encrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce?: Uint8Array
): { ciphertext: Uint8Array; nonce: Uint8Array } {
  const actualNonce =
    nonce || sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
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
export function decrypt(
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
export function hash(data: Uint8Array): Uint8Array {
  return sodium.crypto_generichash(32, data);
}

/**
 * Efface une clé de la mémoire (sécurité)
 */
export function memzero(key: Uint8Array): void {
  sodium.memzero(key);
}

/**
 * Génère bytes aléatoires
 */
export function randomBytes(length: number): Uint8Array {
  return sodium.randombytes_buf(length);
}
