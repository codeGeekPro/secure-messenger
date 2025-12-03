import { Injectable } from '@nestjs/common';
import { CryptoService } from './crypto.service';

/**
 * État du Double Ratchet (sérialisable pour BDD)
 */
export interface RatchetState {
  rootKey: string; // base64
  sendChainKey: string; // base64
  receiveChainKey: string; // base64
  sendRatchetKeyPublic: string; // base64
  sendRatchetKeyPrivate: string; // base64
  receiveRatchetKey: string | null; // base64
  sendMessageNumber: number;
  receiveMessageNumber: number;
  previousSendChainLength: number;
}

/**
 * Message chiffré
 */
export interface EncryptedMessage {
  ciphertext: string; // base64
  nonce: string; // base64
  ratchetPublicKey: string; // base64
  messageNumber: number;
  previousChainLength: number;
}

/**
 * Service Double Ratchet
 * Gère le chiffrement/déchiffrement avec forward secrecy
 */
@Injectable()
export class RatchetService {
  constructor(private readonly crypto: CryptoService) {}

  /**
   * Initialise le Double Ratchet (côté expéditeur initial)
   */
  initRatchetSender(rootKey: string): RatchetState {
    const rootKeyBytes = this.crypto.fromBase64(rootKey);
    const sendRatchetKey = this.crypto.generateKeyPair();

    // Dériver première chain key
    const sendChainKey = this.crypto.hkdf(
      rootKeyBytes,
      rootKeyBytes,
      'SEND_CHAIN',
      32
    );

    return {
      rootKey,
      sendChainKey: this.crypto.toBase64(sendChainKey),
      receiveChainKey: this.crypto.toBase64(new Uint8Array(32)),
      sendRatchetKeyPublic: this.crypto.toBase64(sendRatchetKey.publicKey),
      sendRatchetKeyPrivate: this.crypto.toBase64(sendRatchetKey.privateKey),
      receiveRatchetKey: null,
      sendMessageNumber: 0,
      receiveMessageNumber: 0,
      previousSendChainLength: 0,
    };
  }

  /**
   * Initialise le Double Ratchet (côté destinataire initial)
   */
  initRatchetReceiver(
    rootKey: string,
    remoteRatchetPublicKey: string
  ): RatchetState {
    const rootKeyBytes = this.crypto.fromBase64(rootKey);
    const sendRatchetKey = this.crypto.generateKeyPair();

    const receiveChainKey = this.crypto.hkdf(
      rootKeyBytes,
      rootKeyBytes,
      'RECEIVE_CHAIN',
      32
    );

    return {
      rootKey,
      sendChainKey: this.crypto.toBase64(new Uint8Array(32)),
      receiveChainKey: this.crypto.toBase64(receiveChainKey),
      sendRatchetKeyPublic: this.crypto.toBase64(sendRatchetKey.publicKey),
      sendRatchetKeyPrivate: this.crypto.toBase64(sendRatchetKey.privateKey),
      receiveRatchetKey: remoteRatchetPublicKey,
      sendMessageNumber: 0,
      receiveMessageNumber: 0,
      previousSendChainLength: 0,
    };
  }

  /**
   * Chiffre un message
   */
  ratchetEncrypt(state: RatchetState, plaintext: string): EncryptedMessage {
    const plaintextBytes = new TextEncoder().encode(plaintext);

    // Dériver message key
    const chainKeyBytes = this.crypto.fromBase64(state.sendChainKey);
    const { messageKey, nextChainKey } = this.deriveMessageKey(chainKeyBytes);

    // Chiffrer
    const { ciphertext, nonce } = this.crypto.encrypt(
      plaintextBytes,
      messageKey
    );

    // Nettoyer message key
    this.crypto.memzero(messageKey);

    const message: EncryptedMessage = {
      ciphertext: this.crypto.toBase64(ciphertext),
      nonce: this.crypto.toBase64(nonce),
      ratchetPublicKey: state.sendRatchetKeyPublic,
      messageNumber: state.sendMessageNumber,
      previousChainLength: state.previousSendChainLength,
    };

    // Mettre à jour état
    state.sendChainKey = this.crypto.toBase64(nextChainKey);
    state.sendMessageNumber++;

    return message;
  }

  /**
   * Déchiffre un message
   */
  ratchetDecrypt(state: RatchetState, message: EncryptedMessage): string {
    // Si nouvelle clé de ratchet reçue, faire DH ratchet
    if (
      !state.receiveRatchetKey ||
      state.receiveRatchetKey !== message.ratchetPublicKey
    ) {
      // Sauvegarder ancien send chain length
      state.previousSendChainLength = state.sendMessageNumber;

      const rootKeyBytes = this.crypto.fromBase64(state.rootKey);
      const sendRatchetPrivBytes = this.crypto.fromBase64(
        state.sendRatchetKeyPrivate
      );
      const remoteRatchetPubBytes = this.crypto.fromBase64(
        message.ratchetPublicKey
      );

      // DH ratchet pour recevoir
      const { newRootKey, newChainKey } = this.dhRatchet(
        rootKeyBytes,
        sendRatchetPrivBytes,
        remoteRatchetPubBytes
      );

      state.rootKey = this.crypto.toBase64(newRootKey);
      state.receiveChainKey = this.crypto.toBase64(newChainKey);
      state.receiveRatchetKey = message.ratchetPublicKey;
      state.receiveMessageNumber = 0;

      // Puis DH ratchet pour envoyer
      const sendRatchetKey = this.crypto.generateKeyPair();
      const {
        newRootKey: newSendRootKey,
        newChainKey: newSendChainKey,
      } = this.dhRatchet(
        newRootKey,
        sendRatchetKey.privateKey,
        remoteRatchetPubBytes
      );

      state.rootKey = this.crypto.toBase64(newSendRootKey);
      state.sendChainKey = this.crypto.toBase64(newSendChainKey);
      state.sendRatchetKeyPublic = this.crypto.toBase64(
        sendRatchetKey.publicKey
      );
      state.sendRatchetKeyPrivate = this.crypto.toBase64(
        sendRatchetKey.privateKey
      );
      state.sendMessageNumber = 0;
    }

    // Avancer receive chain jusqu'au message number
    let currentChainKey = this.crypto.fromBase64(state.receiveChainKey);
    for (let i = state.receiveMessageNumber; i < message.messageNumber; i++) {
      const { nextChainKey } = this.deriveMessageKey(currentChainKey);
      currentChainKey = nextChainKey;
    }

    // Dériver message key
    const { messageKey, nextChainKey } = this.deriveMessageKey(currentChainKey);

    // Déchiffrer
    const ciphertextBytes = this.crypto.fromBase64(message.ciphertext);
    const nonceBytes = this.crypto.fromBase64(message.nonce);
    const plaintextBytes = this.crypto.decrypt(
      ciphertextBytes,
      messageKey,
      nonceBytes
    );

    // Nettoyer message key
    this.crypto.memzero(messageKey);

    // Mettre à jour état
    state.receiveChainKey = this.crypto.toBase64(nextChainKey);
    state.receiveMessageNumber = message.messageNumber + 1;

    return new TextDecoder().decode(plaintextBytes);
  }

  /**
   * Dérive une clé de message depuis une chain key
   */
  private deriveMessageKey(chainKey: Uint8Array): {
    messageKey: Uint8Array;
    nextChainKey: Uint8Array;
  } {
    const messageKey = this.crypto.hkdf(chainKey, chainKey, 'MESSAGE_KEY', 32);
    const nextChainKey = this.crypto.hkdf(chainKey, chainKey, 'CHAIN_KEY', 32);
    return { messageKey, nextChainKey };
  }

  /**
   * Ratchet DH (rotation Root Key + Chain Key)
   */
  private dhRatchet(
    rootKey: Uint8Array,
    localPrivateKey: Uint8Array,
    remotePublicKey: Uint8Array
  ): { newRootKey: Uint8Array; newChainKey: Uint8Array } {
    const dhOutput = this.crypto.ecdh(localPrivateKey, remotePublicKey);
    const combined = new Uint8Array([...rootKey, ...dhOutput]);

    const newRootKey = this.crypto.hkdf(combined, rootKey, 'ROOT_KEY', 32);
    const newChainKey = this.crypto.hkdf(combined, rootKey, 'CHAIN_KEY', 32);

    // Nettoyer
    this.crypto.memzero(dhOutput);
    this.crypto.memzero(combined);

    return { newRootKey, newChainKey };
  }
}
