import { Test, TestingModule } from '@nestjs/testing';
import * as fc from 'fast-check';
import { CryptoService } from '../crypto.service';

describe('CryptoService - Fuzz Testing', () => {
  let service: CryptoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CryptoService],
    }).compile();

    service = module.get<CryptoService>(CryptoService);
    await service.onModuleInit();
  });

  describe('generateSigningKeyPair', () => {
    it('should always generate valid key pairs', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          const keyPair = service.generateSigningKeyPair();
          
          expect(keyPair).toHaveProperty('publicKey');
          expect(keyPair).toHaveProperty('privateKey');
          expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
          expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
          expect(keyPair.publicKey.length).toBe(32);
          expect(keyPair.privateKey.length).toBe(64);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('sign and verify', () => {
    it('should correctly sign and verify arbitrary messages', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 0, maxLength: 10000 }),
          async (message) => {
            const keyPair = await service.generateSigningKeyPair();
            const signature = await service.sign(message, keyPair.privateKey);
            const isValid = await service.verify(
              message,
              signature,
              keyPair.publicKey
            );
            
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject invalid signatures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 1000 }),
          fc.uint8Array({ minLength: 64, maxLength: 64 }),
          async (message, fakeSignature) => {
            const keyPair = await service.generateSigningKeyPair();
            const isValid = await service.verify(
              message,
              fakeSignature,
              keyPair.publicKey
            );
            
            // Une signature aléatoire devrait presque toujours être invalide
            expect(isValid).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('encrypt and decrypt', () => {
    it('should correctly encrypt and decrypt arbitrary plaintexts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 0, maxLength: 10000 }),
          async (plaintext) => {
            fc.pre(plaintext.length > 0); // Skip empty plaintexts
            
            const key = service.randomBytes(32);
            const encrypted = service.encrypt(plaintext, key);
            const decrypted = service.decrypt(
              encrypted.ciphertext,
              encrypted.nonce,
              key
            );
            
            expect(decrypted).toEqual(plaintext);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should produce different ciphertexts for same plaintext', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 100 }),
          async (plaintext) => {
            fc.pre(plaintext.length > 0); // Skip empty plaintexts
            
            const key = service.randomBytes(32);
            const encrypted1 = service.encrypt(plaintext, key);
            const encrypted2 = service.encrypt(plaintext, key);
            
            // Les nonces devraient être différents
            expect(encrypted1.nonce).not.toEqual(encrypted2.nonce);
            // Les ciphertexts devraient être différents
            expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
            
            // Mais les deux devraient se déchiffrer correctement
            const decrypted1 = await service.decrypt(
              encrypted1.ciphertext,
              encrypted1.nonce,
              key
            );
            const decrypted2 = await service.decrypt(
              encrypted2.ciphertext,
              encrypted2.nonce,
              key
            );
            
            expect(decrypted1).toEqual(plaintext);
            expect(decrypted2).toEqual(plaintext);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('ECDH key exchange', () => {
    it('should produce consistent shared secrets', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          // Alice génère ses clés
          const aliceKeys = await service.generateSigningKeyPair();
          const alicePrivateCurve = await service.convertPrivateKeyToCurve25519(
            aliceKeys.privateKey
          );
          const alicePublicCurve = await service.convertPublicKeyToCurve25519(
            aliceKeys.publicKey
          );

          // Bob génère ses clés
          const bobKeys = await service.generateSigningKeyPair();
          const bobPrivateCurve = await service.convertPrivateKeyToCurve25519(
            bobKeys.privateKey
          );
          const bobPublicCurve = await service.convertPublicKeyToCurve25519(
            bobKeys.publicKey
          );

          // Calcul du secret partagé
          const aliceShared = await service.ecdh(
            alicePrivateCurve,
            bobPublicCurve
          );
          const bobShared = await service.ecdh(bobPrivateCurve, alicePublicCurve);

          // Les secrets doivent être identiques
          expect(aliceShared).toEqual(bobShared);
          expect(aliceShared.length).toBe(32);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('HKDF key derivation', () => {
    it('should derive keys deterministically', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 32, maxLength: 32 }),
          fc.uint8Array({ minLength: 0, maxLength: 100 }),
          fc.string({ minLength: 0, maxLength: 100 }),
          async (ikm, salt, info) => {
            const key1 = await service.hkdf(ikm, salt, info, 32);
            const key2 = await service.hkdf(ikm, salt, info, 32);
            
            // Même entrée => même sortie
            expect(key1).toEqual(key2);
            expect(key1.length).toBe(32);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should produce different keys for different inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 32, maxLength: 32 }),
          fc.uint8Array({ minLength: 32, maxLength: 32 }),
          async (ikm1, ikm2) => {
            fc.pre(!areEqual(ikm1, ikm2)); // Précondition: ikm différents
            
            const salt = new Uint8Array(32);
            const info = 'test';
            
            const key1 = await service.hkdf(ikm1, salt, info, 32);
            const key2 = await service.hkdf(ikm2, salt, info, 32);
            
            // Entrées différentes => sorties différentes
            expect(key1).not.toEqual(key2);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('hash function', () => {
    it('should produce consistent hashes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 0, maxLength: 10000 }),
          async (data) => {
            const hash1 = await service.hash(data);
            const hash2 = await service.hash(data);
            
            expect(hash1).toEqual(hash2);
            expect(hash1.length).toBe(32); // SHA-256
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should produce different hashes for different inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 1000 }),
          fc.uint8Array({ minLength: 1, maxLength: 1000 }),
          async (data1, data2) => {
            fc.pre(!areEqual(data1, data2)); // Précondition
            
            const hash1 = await service.hash(data1);
            const hash2 = await service.hash(data2);
            
            expect(hash1).not.toEqual(hash2);
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});

// Fonction utilitaire pour comparer deux Uint8Array
function areEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
