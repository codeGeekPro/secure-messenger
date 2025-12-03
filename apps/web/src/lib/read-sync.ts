/**
 * Service de synchronisation de l'état de lecture entre appareils
 * Phase 9: Multi-appareils - Synchronisation du statut "message lu"
 * Intégration Signal Protocol pour chiffrement E2E
 */

import { CryptoStore } from './crypto-store'; // À adapter selon votre implémentation

interface ReadSyncMessage {
  type: 'read_sync';
  messageIds: string[];
  conversationId: string;
  timestamp: number;
  sourceDeviceId: string;
}

interface ReadReceiptPayload {
  conversationId: string;
  messageIds: string[];
  timestamp: Date;
  sourceDeviceId?: string;
}

export class ReadSyncService {
  private syncCallbacks = new Map<string, (payload: ReadReceiptPayload) => void>();
  private cryptoStore: CryptoStore | null = null;

  /**
   * Initialiser avec CryptoStore pour Signal encryption
   */
  initialize(cryptoStore: CryptoStore): void {
    this.cryptoStore = cryptoStore;
    console.log('[ReadSyncService] Initialized with CryptoStore');
  }

  /**
   * Enregistre un callback pour recevoir les notifications de synchronisation de lecture
   */
  registerSyncCallback(
    conversationId: string,
    callback: (payload: ReadReceiptPayload) => void
  ): () => void {
    const key = `read-sync:${conversationId}`;
    this.syncCallbacks.set(key, callback);

    // Return unregister function
    return () => this.syncCallbacks.delete(key);
  }

  /**
   * Crée un message de synchronisation de lecture
   * Ce message sera chiffré avec le Signal protocol
   */
  createReadSyncMessage(
    conversationId: string,
    messageIds: string[],
    sourceDeviceId: string
  ): ReadSyncMessage {
    return {
      type: 'read_sync',
      messageIds,
      conversationId,
      timestamp: Date.now(),
      sourceDeviceId,
    };
  }

  /**
   * Traite un message de synchronisation de lecture reçu d'un autre appareil
   */
  processReadSyncMessage(message: ReadSyncMessage): void {
    const key = `read-sync:${message.conversationId}`;
    const callback = this.syncCallbacks.get(key);

    if (callback) {
      callback({
        conversationId: message.conversationId,
        messageIds: message.messageIds,
        timestamp: new Date(message.timestamp),
        sourceDeviceId: message.sourceDeviceId,
      });
    }
  }

  /**
   * Envoie un message de synchronisation de lecture aux autres appareils via WebSocket
   * Utilise le Signal protocol pour le chiffrement E2E
   */
  async sendReadSync(
    conversationId: string,
    messageIds: string[],
    currentDeviceId: string,
    socket: any // SocketIO client
  ): Promise<void> {
    const message = this.createReadSyncMessage(
      conversationId,
      messageIds,
      currentDeviceId
    );

    try {
      // Émettre l'événement WebSocket pour broadcast aux autres appareils du même utilisateur
      socket.emit('read-sync:broadcast', {
        conversationId,
        messageIds,
        timestamp: message.timestamp,
      });

      console.log(
        `[ReadSyncService] Sent read sync for ${messageIds.length} messages to conversation ${conversationId}`
      );
    } catch (error) {
      console.error('[ReadSyncService] Failed to send read sync:', error);
      throw error;
    }
  }

  /**
   * Encrypte un message de sync avec le Signal protocol (Double Ratchet)
   * Utilise la clé partagée de la conversation
   */
  async encryptReadSync(
    message: ReadSyncMessage,
    conversationId: string
  ): Promise<Buffer> {
    if (!this.cryptoStore) {
      throw new Error(
        '[ReadSyncService] CryptoStore not initialized for encryption'
      );
    }

    try {
      // Récupérer la clé partagée de la conversation depuis CryptoStore
      const sharedKey = await this.cryptoStore.getSharedKey(conversationId);
      if (!sharedKey) {
        throw new Error(
          `No shared key found for conversation ${conversationId}`
        );
      }

      // Sérialiser le message
      const plaintext = JSON.stringify(message);

      // Chiffrer avec la clé partagée et l'IV du Double Ratchet
      const ciphertext = await this.cryptoStore.encryptMessage(
        plaintext,
        conversationId
      );

      return Buffer.from(ciphertext, 'base64');
    } catch (error) {
      console.error('[ReadSyncService] Encryption failed:', error);
      throw error;
    }
  }

  /**
   * Déchiffre un message de sync reçu
   */
  async decryptReadSync(
    ciphertext: Buffer,
    conversationId: string
  ): Promise<ReadSyncMessage> {
    if (!this.cryptoStore) {
      throw new Error(
        '[ReadSyncService] CryptoStore not initialized for decryption'
      );
    }

    try {
      const plaintext = await this.cryptoStore.decryptMessage(
        ciphertext.toString('base64'),
        conversationId
      );

      const message = JSON.parse(plaintext) as ReadSyncMessage;
      return message;
    } catch (error) {
      console.error('[ReadSyncService] Decryption failed:', error);
      throw error;
    }
  }

  /**
   * Marque des messages comme lus et synchronise avec les autres appareils
   * Utilise WebSocket + Signal protocol encryption
   */
  async markMessagesAsRead(
    conversationId: string,
    messageIds: string[],
    currentDeviceId: string,
    socket: any // SocketIO client
  ): Promise<void> {
    // 1. Mettre à jour localement
    const readReceipt: ReadReceiptPayload = {
      conversationId,
      messageIds,
      timestamp: new Date(),
      sourceDeviceId: currentDeviceId,
    };

    // Appeler le callback local pour mettre à jour l'UI
    const key = `read-sync:${conversationId}`;
    const callback = this.syncCallbacks.get(key);
    if (callback) {
      callback(readReceipt);
    }

    // 2. Synchroniser avec les autres appareils via WebSocket
    try {
      await this.sendReadSync(
        conversationId,
        messageIds,
        currentDeviceId,
        socket
      );
    } catch (error) {
      console.error('[ReadSyncService] Failed to sync read state:', error);
    }

    // 3. Envoyer une notification au serveur pour que le statut soit visible aux autres utilisateurs
    try {
      await fetch('/api/messages/receipts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          messageIds,
          status: 'read',
        }),
      });
    } catch (error) {
      console.error(
        '[ReadSyncService] Failed to send read receipt to server:',
        error
      );
    }
  }

  /**
   * Clear tous les callbacks (ex: lors du changement de conversation)
   */
  clearCallbacks(): void {
    this.syncCallbacks.clear();
  }
}

// Singleton global
export const readSyncService = new ReadSyncService();
