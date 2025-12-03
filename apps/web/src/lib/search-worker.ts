/**
 * Web Worker pour indexation en arrière-plan
 * Phase 8: Performance - éviter blocage UI pendant indexation
 */

import { ClientSearchIndex } from './client-search';

interface WorkerMessage {
  type: 'INDEX_BATCH' | 'SEARCH' | 'CLEAR' | 'STATS';
  payload: any;
}

interface IndexBatchPayload {
  messages: Array<{
    id: string;
    conversationId: string;
    senderId: string;
    ciphertext: string; // Base64
    sharedKey: string; // Base64
    createdAt: string; // ISO date
    type: 'text' | 'media' | 'file';
  }>;
}

interface SearchPayload {
  query: string;
  options?: {
    conversationId?: string;
    senderId?: string;
    type?: 'text' | 'media' | 'file';
    after?: string; // ISO date
    before?: string; // ISO date
    caseSensitive?: boolean;
    withHighlights?: boolean;
  };
}

const searchIndex = new ClientSearchIndex();

// Gestion des messages du thread principal
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;
  
  try {
    switch (type) {
      case 'INDEX_BATCH': {
        const { messages } = payload as IndexBatchPayload;
        
        let indexed = 0;
        let failed = 0;
        
        for (const msg of messages) {
          try {
            // Convertir Base64 en Uint8Array
            const ciphertext = Uint8Array.from(
              atob(msg.ciphertext),
              (c) => c.charCodeAt(0)
            );
            const sharedKey = Uint8Array.from(
              atob(msg.sharedKey),
              (c) => c.charCodeAt(0)
            );
            
            searchIndex.addMessage(
              msg.id,
              msg.conversationId,
              msg.senderId,
              ciphertext,
              sharedKey,
              new Date(msg.createdAt),
              msg.type
            );
            
            indexed++;
          } catch (error) {
            console.error('[SearchWorker] Failed to index message:', error);
            failed++;
          }
        }
        
        self.postMessage({
          type: 'INDEX_BATCH_COMPLETE',
          payload: { indexed, failed, total: messages.length },
        });
        
        break;
      }
      
      case 'SEARCH': {
        const { query, options = {} } = payload as SearchPayload;
        
        // Convertir ISO dates en Date objects
        const searchOptions = {
          ...options,
          after: options.after ? new Date(options.after) : undefined,
          before: options.before ? new Date(options.before) : undefined,
        };
        
        const results = options.withHighlights
          ? searchIndex.searchWithHighlight(query, searchOptions)
          : searchIndex.search(query, searchOptions);
        
        self.postMessage({
          type: 'SEARCH_RESULTS',
          payload: { results, query },
        });
        
        break;
      }
      
      case 'CLEAR': {
        const { conversationId } = payload;
        
        if (conversationId) {
          searchIndex.clearConversation(conversationId);
        } else {
          searchIndex.clearAll();
        }
        
        self.postMessage({
          type: 'CLEAR_COMPLETE',
          payload: { conversationId },
        });
        
        break;
      }
      
      case 'STATS': {
        const stats = searchIndex.getStats();
        
        self.postMessage({
          type: 'STATS_RESULT',
          payload: stats,
        });
        
        break;
      }
      
      default:
        console.warn('[SearchWorker] Unknown message type:', type);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Unknown error',
        originalType: type,
      },
    });
  }
};

// Prêt à recevoir des commandes
self.postMessage({ type: 'READY' });
