'use client';

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { SearchBar, SearchFilters } from './SearchBar';
import { SearchResultsList, SearchEmptyState } from './SearchResultsList';

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  ciphertext: string; // Base64
  createdAt: string; // ISO
  type: 'text' | 'media' | 'file';
}

interface SearchResult {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  plaintext: string;
  createdAt: Date;
  type: 'text' | 'media' | 'file';
  highlights?: string[];
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResultClick: (messageId: string, conversationId: string) => void;
  currentConversationId?: string;
}

export function SearchModal({
  isOpen,
  onClose,
  onResultClick,
  currentConversationId,
}: SearchModalProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [worker, setWorker] = useState<Worker | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState({ indexed: 0, total: 0 });
  
  // Initialiser le worker
  useEffect(() => {
    if (isOpen && !worker) {
      const searchWorker = new Worker(
        new URL('../lib/search-worker.ts', import.meta.url)
      );
      
      searchWorker.onmessage = (event) => {
        const { type, payload } = event.data;
        
        switch (type) {
          case 'READY':
            console.log('[SearchModal] Worker ready');
            break;
            
          case 'INDEX_BATCH_COMPLETE':
            setIndexProgress({
              indexed: payload.indexed,
              total: payload.total,
            });
            break;
            
          case 'SEARCH_RESULTS':
            setResults(
              payload.results.map((r: any) => ({
                ...r,
                createdAt: new Date(r.createdAt),
              }))
            );
            setIsLoading(false);
            break;
            
          case 'ERROR':
            console.error('[SearchModal] Worker error:', payload.error);
            setIsLoading(false);
            break;
        }
      };
      
      setWorker(searchWorker);
      
      // Charger les messages pour indexation
      loadMessagesForIndexing(searchWorker);
    }
    
    return () => {
      if (worker && !isOpen) {
        worker.terminate();
        setWorker(null);
      }
    };
  }, [isOpen]);
  
  // Charger les messages depuis le backend pour indexation
  const loadMessagesForIndexing = async (searchWorker: Worker) => {
    try {
      setIsIndexing(true);
      
      // Récupérer les messages de la conversation courante
      const conversationId = currentConversationId;
      if (!conversationId) return;
      
      const response = await fetch(
        `/api/search/conversation-export?conversationId=${conversationId}&batchSize=1000`
      );
      
      if (!response.ok) throw new Error('Failed to fetch messages');
      
      const { messages } = await response.json();
      
      // Envoyer au worker pour indexation
      searchWorker.postMessage({
        type: 'INDEX_BATCH',
        payload: { messages },
      });
      
      setIsIndexing(false);
    } catch (error) {
      console.error('[SearchModal] Failed to load messages:', error);
      setIsIndexing(false);
    }
  };
  
  // Rechercher
  const handleSearch = useCallback(
    (searchQuery: string, filters: SearchFilters) => {
      if (!worker || !searchQuery.trim()) return;
      
      setIsLoading(true);
      setQuery(searchQuery);
      
      worker.postMessage({
        type: 'SEARCH',
        payload: {
          query: searchQuery,
          options: {
            ...filters,
            conversationId: currentConversationId,
            withHighlights: true,
            after: filters.after?.toISOString(),
            before: filters.before?.toISOString(),
          },
        },
      });
    },
    [worker, currentConversationId]
  );
  
  // Clear résultats
  const handleClear = useCallback(() => {
    setResults([]);
    setQuery('');
  }, []);
  
  // Clic sur résultat
  const handleResultClick = (result: SearchResult) => {
    onResultClick(result.id, result.conversationId);
    onClose();
  };
  
  // Fermeture avec ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl mt-20 mx-4">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="border-b border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Rechercher</h2>
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <SearchBar
              onSearch={handleSearch}
              onClear={handleClear}
              placeholder="Rechercher dans la conversation..."
            />
            
            {/* Progression indexation */}
            {isIndexing && (
              <div className="mt-2 text-xs text-gray-500">
                Indexation en cours... {indexProgress.indexed}/{indexProgress.total}
              </div>
            )}
          </div>
          
          {/* Résultats */}
          <div className="p-4 max-h-[500px] overflow-y-auto">
            {query ? (
              <SearchResultsList
                results={results}
                query={query}
                isLoading={isLoading}
                onResultClick={handleResultClick}
              />
            ) : (
              <SearchEmptyState />
            )}
          </div>
          
          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-3 text-xs text-gray-500 text-center">
            Appuyez sur <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">ESC</kbd> pour fermer
          </div>
        </div>
      </div>
    </div>
  );
}
