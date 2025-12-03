/**
 * Service de cache IndexedDB pour support hors ligne
 * Phase 9: Multi-appareils - Cache hors ligne
 */

export interface CachedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  plaintext: string;
  createdAt: Date;
  type: 'text' | 'media' | 'file';
  reactions?: Array<{ emoji: string; userId: string }>;
  replyToId?: string;
}

export interface CachedConversation {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  avatarUrl?: string;
  participants: Array<{ userId: string; userName: string; role: string }>;
  lastMessageAt: Date;
  unreadCount: number;
}

export interface CachedDecryptionKey {
  conversationId: string;
  sharedKey: string; // Base64
  iv?: string; // Base64
}

const DB_NAME = 'secure-messenger';
const DB_VERSION = 1;

const STORES = {
  messages: 'messages',
  conversations: 'conversations',
  keys: 'decryption_keys',
  metadata: 'metadata',
};

export class OfflineCacheService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Messages store
        if (!db.objectStoreNames.contains(STORES.messages)) {
          const messageStore = db.createObjectStore(STORES.messages, { keyPath: 'id' });
          messageStore.createIndex('conversationId', 'conversationId', { unique: false });
          messageStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Conversations store
        if (!db.objectStoreNames.contains(STORES.conversations)) {
          db.createObjectStore(STORES.conversations, { keyPath: 'id' });
        }

        // Decryption keys store
        if (!db.objectStoreNames.contains(STORES.keys)) {
          const keyStore = db.createObjectStore(STORES.keys, { keyPath: 'conversationId' });
          keyStore.createIndex('conversationId', 'conversationId', { unique: true });
        }

        // Metadata store
        if (!db.objectStoreNames.contains(STORES.metadata)) {
          db.createObjectStore(STORES.metadata, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Sauvegarde un message en cache
   */
  async cacheMessage(message: CachedMessage): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.messages], 'readwrite');
      const store = tx.objectStore(STORES.messages);
      const request = store.put(message);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Sauvegarde plusieurs messages en batch
   */
  async cacheMessagesBatch(messages: CachedMessage[]): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.messages], 'readwrite');
      const store = tx.objectStore(STORES.messages);

      messages.forEach((msg) => {
        store.put(msg);
      });

      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
    });
  }

  /**
   * Récupère les messages d'une conversation depuis le cache
   */
  async getCachedMessages(conversationId: string, limit = 50): Promise<CachedMessage[]> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.messages], 'readonly');
      const store = tx.objectStore(STORES.messages);
      const index = store.index('conversationId');
      const range = IDBKeyRange.only(conversationId);
      const request = index.getAll(range, limit);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Sauvegarde une conversation en cache
   */
  async cacheConversation(conversation: CachedConversation): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.conversations], 'readwrite');
      const store = tx.objectStore(STORES.conversations);
      const request = store.put(conversation);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Récupère toutes les conversations du cache
   */
  async getCachedConversations(): Promise<CachedConversation[]> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.conversations], 'readonly');
      const store = tx.objectStore(STORES.conversations);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Sauvegarde une clé de déchiffrement
   */
  async cacheDecryptionKey(key: CachedDecryptionKey): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.keys], 'readwrite');
      const store = tx.objectStore(STORES.keys);
      const request = store.put(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Récupère une clé de déchiffrement
   */
  async getDecryptionKey(conversationId: string): Promise<CachedDecryptionKey | undefined> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORES.keys], 'readonly');
      const store = tx.objectStore(STORES.keys);
      const request = store.get(conversationId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Récupère la taille du cache
   */
  async getCacheStats(): Promise<{ messages: number; conversations: number; sizeBytes: number }> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const messagesTx = this.db!.transaction([STORES.messages], 'readonly');
      const messagesStore = messagesTx.objectStore(STORES.messages);
      const messagesRequest = messagesStore.count();

      const convTx = this.db!.transaction([STORES.conversations], 'readonly');
      const convStore = convTx.objectStore(STORES.conversations);
      const convRequest = convStore.count();

      let messagesCount = 0;
      let conversationsCount = 0;

      messagesRequest.onsuccess = () => (messagesCount = messagesRequest.result);
      messagesRequest.onerror = () => reject(messagesRequest.error);

      convRequest.onsuccess = () => (conversationsCount = convRequest.result);
      convRequest.onerror = () => reject(convRequest.error);

      messagesTx.oncomplete = () => {
        convTx.oncomplete = () => {
          // Rough estimate: 1KB per message, 2KB per conversation
          const sizeBytes = messagesCount * 1024 + conversationsCount * 2048;
          resolve({
            messages: messagesCount,
            conversations: conversationsCount,
            sizeBytes,
          });
        };
      };
    });
  }

  /**
   * Vide le cache
   */
  async clearCache(): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(
        [STORES.messages, STORES.conversations, STORES.keys],
        'readwrite'
      );

      tx.objectStore(STORES.messages).clear();
      tx.objectStore(STORES.conversations).clear();
      tx.objectStore(STORES.keys).clear();

      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
    });
  }

  /**
   * Détecte si on est en ligne/hors ligne et agit en conséquence
   */
  onOnlineStatusChange(callback: (isOnline: boolean) => void): () => void {
    const handleOnline = () => callback(true);
    const handleOffline = () => callback(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }
}

// Singleton global
export const offlineCacheService = new OfflineCacheService();
