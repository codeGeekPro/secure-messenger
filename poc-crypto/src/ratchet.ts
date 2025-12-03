import { generateKeyPair, ecdh, hkdf, encrypt, decrypt, memzero } from './crypto';

/**
 * État du Double Ratchet
 */
export interface RatchetState {
  rootKey: Uint8Array;
  sendChainKey: Uint8Array;
  receiveChainKey: Uint8Array;
  sendRatchetKey: { publicKey: Uint8Array; privateKey: Uint8Array };
  receiveRatchetKey: Uint8Array | null;
  sendMessageNumber: number;
  receiveMessageNumber: number;
  previousSendChainLength: number;
}

/**
 * Message chiffré
 */
export interface EncryptedMessage {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  ratchetPublicKey: Uint8Array;
  messageNumber: number;
  previousChainLength: number;
}

/**
 * Initialise le Double Ratchet (côté expéditeur initial)
 */
export function initRatchetSender(rootKey: Uint8Array): RatchetState {
  const sendRatchetKey = generateKeyPair();

  // Dériver première chain key
  const sendChainKey = hkdf(rootKey, rootKey, 'SEND_CHAIN', 32);

  return {
    rootKey,
    sendChainKey,
    receiveChainKey: new Uint8Array(32),
    sendRatchetKey,
    receiveRatchetKey: null,
    sendMessageNumber: 0,
    receiveMessageNumber: 0,
    previousSendChainLength: 0,
  };
}

/**
 * Initialise le Double Ratchet (côté destinataire initial)
 */
export function initRatchetReceiver(
  rootKey: Uint8Array,
  remoteRatchetPublicKey: Uint8Array
): RatchetState {
  const sendRatchetKey = generateKeyPair();

  return {
    rootKey,
    sendChainKey: new Uint8Array(32),
    receiveChainKey: hkdf(rootKey, rootKey, 'RECEIVE_CHAIN', 32),
    sendRatchetKey,
    receiveRatchetKey: remoteRatchetPublicKey,
    sendMessageNumber: 0,
    receiveMessageNumber: 0,
    previousSendChainLength: 0,
  };
}

/**
 * Dérive une clé de message depuis une chain key
 */
function deriveMessageKey(chainKey: Uint8Array): {
  messageKey: Uint8Array;
  nextChainKey: Uint8Array;
} {
  const messageKey = hkdf(chainKey, chainKey, 'MESSAGE_KEY', 32);
  const nextChainKey = hkdf(chainKey, chainKey, 'CHAIN_KEY', 32);
  return { messageKey, nextChainKey };
}

/**
 * Ratchet DH (rotation Root Key + Chain Key)
 */
function dhRatchet(
  rootKey: Uint8Array,
  localPrivateKey: Uint8Array,
  remotePublicKey: Uint8Array
): { newRootKey: Uint8Array; newChainKey: Uint8Array } {
  const dhOutput = ecdh(localPrivateKey, remotePublicKey);
  const combined = new Uint8Array([...rootKey, ...dhOutput]);

  const newRootKey = hkdf(combined, rootKey, 'ROOT_KEY', 32);
  const newChainKey = hkdf(combined, rootKey, 'CHAIN_KEY', 32);

  return { newRootKey, newChainKey };
}

/**
 * Chiffre un message
 */
export function ratchetEncrypt(
  state: RatchetState,
  plaintext: string
): EncryptedMessage {
  const plaintextBytes = new TextEncoder().encode(plaintext);

  // Dériver message key
  const { messageKey, nextChainKey } = deriveMessageKey(state.sendChainKey);
  state.sendChainKey = nextChainKey;

  // Chiffrer
  const { ciphertext, nonce } = encrypt(plaintextBytes, messageKey);

  // Nettoyer message key
  memzero(messageKey);

  const message: EncryptedMessage = {
    ciphertext,
    nonce,
    ratchetPublicKey: state.sendRatchetKey.publicKey,
    messageNumber: state.sendMessageNumber,
    previousChainLength: state.previousSendChainLength,
  };

  state.sendMessageNumber++;

  return message;
}

/**
 * Déchiffre un message
 */
export function ratchetDecrypt(
  state: RatchetState,
  message: EncryptedMessage
): string {
  // Si nouvelle clé de ratchet reçue, faire DH ratchet
  if (
    !state.receiveRatchetKey ||
    !buffersEqual(state.receiveRatchetKey, message.ratchetPublicKey)
  ) {
    // Sauvegarder ancien send chain length
    state.previousSendChainLength = state.sendMessageNumber;

    // DH ratchet pour recevoir
    const { newRootKey, newChainKey } = dhRatchet(
      state.rootKey,
      state.sendRatchetKey.privateKey,
      message.ratchetPublicKey
    );

    state.rootKey = newRootKey;
    state.receiveChainKey = newChainKey;
    state.receiveRatchetKey = message.ratchetPublicKey;
    state.receiveMessageNumber = 0;

    // Puis DH ratchet pour envoyer
    const sendRatchetKey = generateKeyPair();
    const {
      newRootKey: newSendRootKey,
      newChainKey: newSendChainKey,
    } = dhRatchet(state.rootKey, sendRatchetKey.privateKey, message.ratchetPublicKey);

    state.rootKey = newSendRootKey;
    state.sendChainKey = newSendChainKey;
    state.sendRatchetKey = sendRatchetKey;
    state.sendMessageNumber = 0;
  }

  // Avancer receive chain jusqu'au message number
  let currentChainKey = state.receiveChainKey;
  for (let i = state.receiveMessageNumber; i < message.messageNumber; i++) {
    const { nextChainKey } = deriveMessageKey(currentChainKey);
    currentChainKey = nextChainKey;
  }

  // Dériver message key
  const { messageKey, nextChainKey } = deriveMessageKey(currentChainKey);
  state.receiveChainKey = nextChainKey;
  state.receiveMessageNumber = message.messageNumber + 1;

  // Déchiffrer
  const plaintextBytes = decrypt(message.ciphertext, messageKey, message.nonce);

  // Nettoyer message key
  memzero(messageKey);

  return new TextDecoder().decode(plaintextBytes);
}

/**
 * Compare deux Uint8Array
 */
function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
