'use client';

import { useEffect, useRef } from 'react';
import { FileText, Image, File as FileIcon, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

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

interface SearchResultsListProps {
  results: SearchResult[];
  query: string;
  isLoading: boolean;
  onResultClick: (result: SearchResult) => void;
}

export function SearchResultsList({
  results,
  query,
  isLoading,
  onResultClick,
}: SearchResultsListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  
  // Scroll to top on new results
  useEffect(() => {
    listRef.current?.scrollTo(0, 0);
  }, [results]);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <FileText className="w-12 h-12 mb-2 opacity-50" />
        <p className="text-sm">Aucun résultat pour "{query}"</p>
        <p className="text-xs mt-1">Essayez d'autres termes de recherche</p>
      </div>
    );
  }
  
  return (
    <div
      ref={listRef}
      className="space-y-2 overflow-y-auto max-h-[600px] pr-2"
    >
      <div className="text-xs text-gray-500 mb-3">
        {results.length} résultat{results.length > 1 ? 's' : ''} trouvé{results.length > 1 ? 's' : ''}
      </div>
      
      {results.map((result) => (
        <SearchResultItem
          key={result.id}
          result={result}
          query={query}
          onClick={() => onResultClick(result)}
        />
      ))}
    </div>
  );
}

interface SearchResultItemProps {
  result: SearchResult;
  query: string;
  onClick: () => void;
}

function SearchResultItem({ result, query, onClick }: SearchResultItemProps) {
  // Icône selon le type
  const TypeIcon = {
    text: FileText,
    media: Image,
    file: FileIcon,
  }[result.type];
  
  // Highlighter le texte
  const highlightText = (text: string, searchQuery: string) => {
    if (!searchQuery) return text;
    
    const parts = text.split(new RegExp(`(${searchQuery})`, 'gi'));
    
    return parts.map((part, index) =>
      part.toLowerCase() === searchQuery.toLowerCase() ? (
        <mark
          key={index}
          className="bg-yellow-200 dark:bg-yellow-800 text-current font-semibold"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };
  
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* Icône type */}
        <div className="flex-shrink-0 mt-1">
          <TypeIcon className="w-5 h-5 text-gray-500" />
        </div>
        
        {/* Contenu */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <User className="w-3 h-3 text-gray-500" />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {result.senderName || 'Utilisateur'}
            </span>
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(result.createdAt, {
                addSuffix: true,
                locale: fr,
              })}
            </span>
          </div>
          
          {/* Highlights ou texte complet */}
          {result.highlights && result.highlights.length > 0 ? (
            <div className="space-y-1">
              {result.highlights.map((highlight, index) => (
                <p
                  key={index}
                  className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2"
                >
                  {highlightText(highlight, query)}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-3">
              {highlightText(result.plaintext, query)}
            </p>
          )}
          
          {/* Type badge */}
          <div className="mt-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {result.type === 'text' && 'Texte'}
              {result.type === 'media' && 'Média'}
              {result.type === 'file' && 'Fichier'}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

// Empty state
export function SearchEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
      <FileText className="w-16 h-16 mb-4 opacity-30" />
      <h3 className="text-lg font-medium mb-1">Rechercher des messages</h3>
      <p className="text-sm text-center max-w-xs">
        Utilisez la barre de recherche ci-dessus pour trouver des messages dans
        vos conversations
      </p>
    </div>
  );
}

// Loading state
export function SearchLoadingState() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 bg-gray-300 dark:bg-gray-700 rounded"></div>
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-24"></div>
              <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-full"></div>
              <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
