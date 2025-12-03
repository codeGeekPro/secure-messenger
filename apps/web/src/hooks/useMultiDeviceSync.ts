import { useEffect, useCallback, useRef } from 'react';
import { readSyncService } from '../lib/read-sync';
import { offlineCacheService } from '../lib/offline-cache';

interface UseMultiDeviceSyncProps {
  conversationId: string;
  currentDeviceId?: string;
  onReadSync?: (messageIds: string[]) => void;
  enabled?: boolean;
}

/**
 * Hook pour gérer la synchronisation multi-appareils
 * Phase 9: Multi-appareils - Synchronisation de l'état et cache hors ligne
 */
export function useMultiDeviceSync({
  conversationId,
  currentDeviceId,
  onReadSync,
  enabled = true,
}: UseMultiDeviceSyncProps) {
  const unregisterSyncRef = useRef<(() => void) | null>(null);
  const unregisterOnlineRef = useRef<(() => void) | null>(null);

  // Initialiser le cache au montage
  useEffect(() => {
    if (!enabled) return;

    const initCache = async () => {
      try {
        await offlineCacheService.init();
        console.log('[useMultiDeviceSync] Offline cache initialized');
      } catch (error) {
        console.error('[useMultiDeviceSync] Failed to init cache:', error);
      }
    };

    initCache();
  }, [enabled]);

  // Enregistrer callback pour la synchronisation de lecture
  useEffect(() => {
    if (!enabled) return;

    unregisterSyncRef.current = readSyncService.registerSyncCallback(
      conversationId,
      (payload) => {
        console.log('[useMultiDeviceSync] Read sync received:', payload);
        onReadSync?.(payload.messageIds);
      }
    );

    return () => {
      unregisterSyncRef.current?.();
    };
  }, [conversationId, onReadSync, enabled]);

  // Écouter les changements de connexion
  useEffect(() => {
    if (!enabled) return;

    unregisterOnlineRef.current = offlineCacheService.onOnlineStatusChange(
      (isOnline) => {
        console.log(`[useMultiDeviceSync] Status changed: ${isOnline ? 'online' : 'offline'}`);

        if (isOnline) {
          // Quand on passe en ligne, synchroniser les changements
          syncOfflineChanges();
        }
      }
    );

    return () => {
      unregisterOnlineRef.current?.();
    };
  }, [enabled]);

  /**
   * Marquer des messages comme lus et synchroniser
   */
  const markMessagesAsRead = useCallback(
    async (messageIds: string[]) => {
      if (!currentDeviceId) return;

      try {
        // Pour MVP, on assume que l'encryption est gérée par le CryptoStore
        // En production, il faudrait vraiment chiffrer avec les clés Signal
        const dummyEncryption = async (msg: any) => Buffer.from(JSON.stringify(msg));

        await readSyncService.markMessagesAsRead(
          conversationId,
          messageIds,
          currentDeviceId,
          dummyEncryption
        );
      } catch (error) {
        console.error('[useMultiDeviceSync] Failed to mark as read:', error);
      }
    },
    [conversationId, currentDeviceId]
  );

  /**
   * Mettre en cache les messages
   */
  const cacheMessages = useCallback(
    async (messages: any[]) => {
      try {
        await offlineCacheService.cacheMessagesBatch(
          messages.map((msg) => ({
            id: msg.id,
            conversationId,
            senderId: msg.senderId,
            plaintext: msg.plaintext || '',
            createdAt: new Date(msg.createdAt),
            type: msg.type || 'text',
            reactions: msg.reactions,
            replyToId: msg.replyToId,
          }))
        );
      } catch (error) {
        console.error('[useMultiDeviceSync] Failed to cache messages:', error);
      }
    },
    [conversationId]
  );

  /**
   * Récupérer les messages du cache
   */
  const getCachedMessages = useCallback(async () => {
    try {
      return await offlineCacheService.getCachedMessages(conversationId);
    } catch (error) {
      console.error('[useMultiDeviceSync] Failed to get cached messages:', error);
      return [];
    }
  }, [conversationId]);

  /**
   * Synchroniser les changements hors ligne
   */
  const syncOfflineChanges = useCallback(async () => {
    try {
      const stats = await offlineCacheService.getCacheStats();
      console.log('[useMultiDeviceSync] Cache stats:', stats);

      // TODO: Envoyer les messages en attente au serveur
      // TODO: Envoyer les receipts en attente
    } catch (error) {
      console.error('[useMultiDeviceSync] Failed to sync offline changes:', error);
    }
  }, []);

  /**
   * Vider le cache
   */
  const clearCache = useCallback(async () => {
    try {
      await offlineCacheService.clearCache();
      console.log('[useMultiDeviceSync] Cache cleared');
    } catch (error) {
      console.error('[useMultiDeviceSync] Failed to clear cache:', error);
    }
  }, []);

  return {
    markMessagesAsRead,
    cacheMessages,
    getCachedMessages,
    syncOfflineChanges,
    clearCache,
  };
}
