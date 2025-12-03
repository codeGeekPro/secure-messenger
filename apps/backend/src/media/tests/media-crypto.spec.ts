import { CryptoService } from '../../crypto/crypto.service';

describe('Media encryption (ephemeral keys) - unit', () => {
  const crypto = new CryptoService();

  beforeAll(async () => {
    await crypto.initCrypto();
  });

  it('encrypts/decrypts chunks with unique nonces', () => {
    // Simuler un fichier de 2.5 Mo
    const size = 2.5 * 1024 * 1024;
    const file = crypto.randomBytes(size);
    const chunkSize = 256 * 1024; // 256 Ko

    // Clé fichier éphémère
    const fileKey = crypto.randomBytes(32);

    // Découpage
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < file.length; i += chunkSize) {
      chunks.push(file.slice(i, i + chunkSize));
    }

    const nonces: string[] = [];
    const ciphertexts: Uint8Array[] = [];

    // Chiffrement
    for (const chunk of chunks) {
      const { ciphertext, nonce } = crypto.encrypt(chunk, fileKey);
      // Nonce doit être unique
      const nB64 = crypto.toBase64(nonce);
      expect(nonces.includes(nB64)).toBe(false);
      nonces.push(nB64);
      ciphertexts.push(ciphertext);
    }

    // Déchiffrement
    const reassembled: number[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const pt = crypto.decrypt(ciphertexts[i], fileKey, crypto.fromBase64(nonces[i]));
      reassembled.push(...Array.from(pt));
    }

    expect(Buffer.from(reassembled)).toEqual(Buffer.from(file));
  });
});
