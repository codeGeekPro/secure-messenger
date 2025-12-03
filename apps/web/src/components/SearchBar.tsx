'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Filter, Clock } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string, filters: SearchFilters) => void;
  onClear: () => void;
  placeholder?: string;
}

export interface SearchFilters {
  conversationId?: string;
  senderId?: string;
  type?: 'text' | 'media' | 'file';
  after?: Date;
  before?: Date;
  caseSensitive?: boolean;
}

export function SearchBar({ onSearch, onClear, placeholder }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Charger recherches récentes
  useEffect(() => {
    const stored = localStorage.getItem('recentSearches');
    if (stored) {
      setRecentSearches(JSON.parse(stored));
    }
  }, []);
  
  // Sauvegarder recherches récentes
  const saveToRecent = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    const updated = [
      searchQuery,
      ...recentSearches.filter((q) => q !== searchQuery),
    ].slice(0, 10); // Max 10 récentes
    
    setRecentSearches(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
  }, [recentSearches]);
  
  // Exécuter recherche
  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    
    saveToRecent(query);
    onSearch(query, filters);
    setShowRecent(false);
  }, [query, filters, onSearch, saveToRecent]);
  
  // Clear recherche
  const handleClear = useCallback(() => {
    setQuery('');
    setFilters({});
    setShowRecent(false);
    onClear();
    inputRef.current?.focus();
  }, [onClear]);
  
  // Enter pour rechercher
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape') {
      handleClear();
    }
  };
  
  // Sélectionner recherche récente
  const selectRecent = (recentQuery: string) => {
    setQuery(recentQuery);
    setShowRecent(false);
    onSearch(recentQuery, filters);
  };
  
  // Toggle filtres
  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };
  
  // Update filtre
  const updateFilter = <K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };
  
  // Compter filtres actifs
  const activeFiltersCount = Object.values(filters).filter(Boolean).length;
  
  return (
    <div className="relative">
      {/* Barre de recherche */}
      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2">
        <Search className="w-5 h-5 text-gray-500" />
        
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowRecent(true)}
          onBlur={() => setTimeout(() => setShowRecent(false), 200)}
          placeholder={placeholder || 'Rechercher des messages...'}
          className="flex-1 bg-transparent outline-none text-sm"
        />
        
        {query && (
          <button
            onClick={handleClear}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        )}
        
        <button
          onClick={toggleFilters}
          className={`p-1 rounded relative ${
            showFilters
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-600'
              : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500'
          }`}
        >
          <Filter className="w-4 h-4" />
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>
      
      {/* Recherches récentes */}
      {showRecent && recentSearches.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
          <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-500">Recherches récentes</span>
          </div>
          
          <div className="max-h-48 overflow-y-auto">
            {recentSearches.map((recentQuery, index) => (
              <button
                key={index}
                onClick={() => selectRecent(recentQuery)}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {recentQuery}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Panneau filtres */}
      {showFilters && (
        <div className="absolute top-full mt-2 w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10 p-4">
          <h3 className="text-sm font-semibold mb-3">Filtres de recherche</h3>
          
          <div className="space-y-3">
            {/* Type de message */}
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                Type de message
              </label>
              <select
                value={filters.type || ''}
                onChange={(e) =>
                  updateFilter(
                    'type',
                    e.target.value as 'text' | 'media' | 'file' | undefined
                  )
                }
                className="w-full px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded text-sm"
              >
                <option value="">Tous</option>
                <option value="text">Texte</option>
                <option value="media">Média</option>
                <option value="file">Fichier</option>
              </select>
            </div>
            
            {/* Date après */}
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                Après le
              </label>
              <input
                type="date"
                value={
                  filters.after
                    ? filters.after.toISOString().split('T')[0]
                    : ''
                }
                onChange={(e) =>
                  updateFilter('after', e.target.value ? new Date(e.target.value) : undefined)
                }
                className="w-full px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded text-sm"
              />
            </div>
            
            {/* Date avant */}
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                Avant le
              </label>
              <input
                type="date"
                value={
                  filters.before
                    ? filters.before.toISOString().split('T')[0]
                    : ''
                }
                onChange={(e) =>
                  updateFilter('before', e.target.value ? new Date(e.target.value) : undefined)
                }
                className="w-full px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded text-sm"
              />
            </div>
            
            {/* Case sensitive */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="caseSensitive"
                checked={filters.caseSensitive || false}
                onChange={(e) => updateFilter('caseSensitive', e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="caseSensitive" className="text-sm">
                Sensible à la casse
              </label>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setFilters({})}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              Réinitialiser
            </button>
            <button
              onClick={() => {
                setShowFilters(false);
                if (query) handleSearch();
              }}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Appliquer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
