import { Test, TestingModule } from '@nestjs/testing';
import { CryptoService } from '../crypto.service';
import { RatchetService } from '../ratchet.service';

describe('Ratchet Service - Basic Tests', () => {
  let cryptoService: CryptoService;
  let ratchetService: RatchetService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CryptoService, RatchetService],
    }).compile();

    cryptoService = module.get<CryptoService>(CryptoService);
    ratchetService = module.get<RatchetService>(RatchetService);

    await cryptoService.initCrypto();
  });

  it('should initialize sender ratchet', () => {
    const rootKey = cryptoService.toBase64(cryptoService.randomBytes(32));
    const aliceRatchet = ratchetService.initRatchetSender(rootKey);
    
    expect(aliceRatchet).toBeDefined();
    expect(aliceRatchet.sendRatchetKeyPublic).toBeDefined();
  });

  it('should initialize receiver ratchet', () => {
    const rootKey = cryptoService.toBase64(cryptoService.randomBytes(32));
    const aliceRatchet = ratchetService.initRatchetSender(rootKey);
    const bobRatchet = ratchetService.initRatchetReceiver(
      rootKey,
      aliceRatchet.sendRatchetKeyPublic
    );
    
    expect(bobRatchet).toBeDefined();
  });

  it('should encrypt and decrypt a simple message', () => {
    const rootKey = cryptoService.toBase64(cryptoService.randomBytes(32));
    const aliceRatchet = ratchetService.initRatchetSender(rootKey);
    const bobRatchet = ratchetService.initRatchetReceiver(
      rootKey,
      aliceRatchet.sendRatchetKeyPublic
    );

    const plaintext = 'Hello World';
    const encrypted = ratchetService.ratchetEncrypt(aliceRatchet, plaintext);
    
    console.log('Encrypted message:', encrypted);
    console.log('Alice chain key:', aliceRatchet.sendChainKey);
    console.log('Bob chain key:', bobRatchet.receiveChainKey);
    
    const decrypted = ratchetService.ratchetDecrypt(bobRatchet, encrypted);
    
    expect(decrypted).toBe(plaintext);
  });
});
