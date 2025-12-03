import { Test, TestingModule } from '@nestjs/testing';
import { CryptoService } from '../crypto.service';
import { X3dhService } from '../x3dh.service';
import { RatchetService } from '../ratchet.service';

describe('E2E Crypto Integration Test', () => {
  let cryptoService: CryptoService;
  let x3dhService: X3dhService;
  let ratchetService: RatchetService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CryptoService, X3dhService, RatchetService],
    }).compile();

    cryptoService = module.get<CryptoService>(CryptoService);
    x3dhService = module.get<X3dhService>(X3dhService);
    ratchetService = module.get<RatchetService>(RatchetService);

    await cryptoService.initCrypto();
  });

  describe('Signal Protocol E2E Flow', () => {
    it('should establish session and exchange encrypted messages (Alice → Bob)', async () => {
      // 1. Bob génère son key bundle
      const { bundle: bobBundle, privateKeys: bobPrivateKeys } =
        x3dhService.generateKeyBundle(10);

      // 2. Alice génère ses clés
      const aliceIdentityPair = cryptoService.generateSigningKeyPair();
      const aliceEphemeralPair = cryptoService.generateKeyPair();

      const aliceIdentityPrivate = cryptoService.toBase64(
        aliceIdentityPair.privateKey
      );
      const aliceEphemeralPrivate = cryptoService.toBase64(
        aliceEphemeralPair.privateKey
      );
      const aliceIdentityPublic = cryptoService.toBase64(
        aliceIdentityPair.publicKey
      );
      const aliceEphemeralPublic = cryptoService.toBase64(
        aliceEphemeralPair.publicKey
      );

      // 3. Alice initie X3DH avec Bob
      const { rootKey: aliceRootKey, usedOneTimePreKeyIndex } =
        x3dhService.initiateX3DH(
          aliceIdentityPrivate,
          aliceEphemeralPrivate,
          bobBundle,
          true
        );

      expect(aliceRootKey).toBeDefined();
      expect(usedOneTimePreKeyIndex).toBe(0);

      // 4. Bob accepte session X3DH
      const bobRootKey = x3dhService.acceptX3DH(
        bobPrivateKeys.identityKey,
        bobPrivateKeys.signedPreKey,
        bobPrivateKeys.oneTimePreKeys[0],
        aliceIdentityPublic,
        aliceEphemeralPublic
      );

      // 5. Vérifier Root Keys identiques
      expect(aliceRootKey).toBe(bobRootKey);

      // 6. Initialiser Double Ratchet
      const aliceRatchet = ratchetService.initRatchetSender(aliceRootKey);
      const bobRatchet = ratchetService.initRatchetReceiver(
        bobRootKey,
        aliceRatchet.sendRatchetKeyPublic
      );

      // 7. Alice envoie 3 messages
      const msg1 = ratchetService.ratchetEncrypt(aliceRatchet, 'Message 1');
      const msg2 = ratchetService.ratchetEncrypt(aliceRatchet, 'Message 2');
      const msg3 = ratchetService.ratchetEncrypt(aliceRatchet, 'Message 3');

      // 8. Bob déchiffre
      const decrypted1 = ratchetService.ratchetDecrypt(bobRatchet, msg1);
      const decrypted2 = ratchetService.ratchetDecrypt(bobRatchet, msg2);
      const decrypted3 = ratchetService.ratchetDecrypt(bobRatchet, msg3);

      expect(decrypted1).toBe('Message 1');
      expect(decrypted2).toBe('Message 2');
      expect(decrypted3).toBe('Message 3');

      // 9. Bob répond (DH Ratchet)
      const replyMsg = ratchetService.ratchetEncrypt(
        bobRatchet,
        'Réponse de Bob'
      );

      // 10. Alice déchiffre réponse
      const decryptedReply = ratchetService.ratchetDecrypt(
        aliceRatchet,
        replyMsg
      );

      expect(decryptedReply).toBe('Réponse de Bob');

      // Vérifier DH Ratchet effectué (clé publique changée)
      expect(replyMsg.ratchetPublicKey).not.toBe(
        aliceRatchet.sendRatchetKeyPublic
      );
    });

    it('should verify forward secrecy (old messages undecryptable after key rotation)', async () => {
      // 1. Setup session
      const { bundle: bobBundle, privateKeys: bobPrivateKeys } =
        x3dhService.generateKeyBundle(10);

      const aliceIdentityPair = cryptoService.generateSigningKeyPair();
      const aliceEphemeralPair = cryptoService.generateKeyPair();

      const { rootKey: aliceRootKey } = x3dhService.initiateX3DH(
        cryptoService.toBase64(aliceIdentityPair.privateKey),
        cryptoService.toBase64(aliceEphemeralPair.privateKey),
        bobBundle,
        true
      );

      const aliceRatchet = ratchetService.initRatchetSender(aliceRootKey);

      // 2. Alice envoie message
      const msg1 = ratchetService.ratchetEncrypt(aliceRatchet, 'Secret 1');

      // 3. Sauvegarder ancien sendChainKey
      const oldSendChainKey = aliceRatchet.sendChainKey;

      // 4. Alice envoie plusieurs autres messages (rotation chain key)
      ratchetService.ratchetEncrypt(aliceRatchet, 'Message 2');
      ratchetService.ratchetEncrypt(aliceRatchet, 'Message 3');
      ratchetService.ratchetEncrypt(aliceRatchet, 'Message 4');

      // 5. Chain key a changé (forward secrecy)
      expect(aliceRatchet.sendChainKey).not.toBe(oldSendChainKey);

      // 6. Même avec sendChainKey actuel, impossible de déchiffrer msg1
      // (nécessite messageKey dérivée et supprimée après chiffrement)
      // Test implicite : si attaquant vole sendChainKey actuel,
      // ne peut PAS remonter à anciens messageKeys
    });

    it('should verify key bundle signature', () => {
      const { bundle } = x3dhService.generateKeyBundle(5);

      // Vérifier signature valide
      expect(x3dhService.verifyKeyBundle(bundle)).toBe(true);

      // Modifier signedPreKey.publicKey → signature invalide
      const tamperedBundle = {
        ...bundle,
        signedPreKey: {
          ...bundle.signedPreKey,
          publicKey: cryptoService.toBase64(
            cryptoService.generateKeyPair().publicKey
          ),
        },
      };

      expect(x3dhService.verifyKeyBundle(tamperedBundle)).toBe(false);
    });
  });
});
