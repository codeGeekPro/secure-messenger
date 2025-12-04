import { decrypt } from './crypto';

/**
 * Client-side search index pour messages E2E
 * Phase 8: Indexation locale après déchiffrement
 * 
 * Note: En E2E, la recherche full-text doit se faire côté client
 * car le serveur ne voit que le ciphertext.
 */

interface IndexedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  plaintext: string;
  createdAt: Date;
  type: 'text' | 'media' | 'file';
}

interface SearchOptions {
  conversationId?: string;
  senderId?: string;
  type?: 'text' | 'media' | 'file';
  after?: Date;
  before?: Date;
  caseSensitive?: boolean;
}

export class ClientSearchIndex {
  private messages: Map<string, IndexedMessage> = new Map();
  private conversationIndex: Map<string, Set<string>> = new Map();
  
  /**
   * Ajoute un message à l'index après déchiffrement
   */
  async addMessage(
    id: string,
    conversationId: string,
    senderId: string,
    ciphertext: Uint8Array,
    sharedKey: Uint8Array,
    createdAt: Date,
    type: 'text' | 'media' | 'file'
  ) {
    try {
      const plaintext = await decrypt(ciphertext, sharedKey);
      
      const indexed: IndexedMessage = {
        id,
        conversationId,
        senderId,
        plaintext,
        createdAt,
        type,
      };
      
      this.messages.set(id, indexed);
      
      // Index par conversation
      if (!this.conversationIndex.has(conversationId)) {
        this.conversationIndex.set(conversationId, new Set());
      }
      this.conversationIndex.get(conversationId)!.add(id);
    } catch (error) {
      console.error('[ClientSearchIndex] Failed to decrypt message:', error);
    }
  }
  
  /**
   * Recherche full-text dans les messages déchiffrés
   */
  search(query: string, options: SearchOptions = {}): IndexedMessage[] {
    const normalizedQuery = options.caseSensitive 
      ? query 
      : query.toLowerCase();
    
    const results: IndexedMessage[] = [];
    
    // Filtrer par conversation si spécifié
    let messageIds: string[];
    if (options.conversationId) {
      messageIds = Array.from(
        this.conversationIndex.get(options.conversationId) || []
      );
    } else {
      messageIds = Array.from(this.messages.keys());
    }
    
    for (const messageId of messageIds) {
      const message = this.messages.get(messageId);
      if (!message) continue;
      
      // Filtres métadonnées
      if (options.senderId && message.senderId !== options.senderId) continue;
      if (options.type && message.type !== options.type) continue;
      if (options.after && message.createdAt < options.after) continue;
      if (options.before && message.createdAt > options.before) continue;
      
      // Recherche textuelle
      const plaintext = options.caseSensitive
        ? message.plaintext
        : message.plaintext.toLowerCase();
      
      if (plaintext.includes(normalizedQuery)) {
        results.push(message);
      }
    }
    
    // Trier par date décroissante
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  /**
   * Recherche avec surlignage des matches
   */
  searchWithHighlight(
    query: string,
    options: SearchOptions = {}
  ): Array<IndexedMessage & { highlights: string[] }> {
    const results = this.search(query, options);
    const normalizedQuery = options.caseSensitive ? query : query.toLowerCase();
    
    return results.map((message) => {
      const highlights = this.extractHighlights(
        message.plaintext,
        normalizedQuery,
        options.caseSensitive || false
      );
      
      return { ...message, highlights };
    });
  }
  
  /**
   * Extrait les snippets avec le terme recherché
   */
  private extractHighlights(
    text: string,
    query: string,
    caseSensitive: boolean,
    contextLength = 50
  ): string[] {
    const searchText = caseSensitive ? text : text.toLowerCase();
    const highlights: string[] = [];
    
    let index = searchText.indexOf(query);
    while (index !== -1 && highlights.length < 3) {
      const start = Math.max(0, index - contextLength);
      const end = Math.min(text.length, index + query.length + contextLength);
      
      let snippet = text.substring(start, end);
      if (start > 0) snippet = '...' + snippet;
      if (end < text.length) snippet = snippet + '...';
      
      highlights.push(snippet);
      
      index = searchText.indexOf(query, index + 1);
    }
    
    return highlights;
  }
  
  /**
   * Recherche avancée avec opérateurs booléens
   */
  advancedSearch(
    expression: string,
    options: SearchOptions = {}
  ): IndexedMessage[] {
    // Parse expression (AND, OR, NOT)
    // Exemple: "hello AND world" ou "foo NOT bar"
    
    const tokens = expression.split(/\s+(AND|OR|NOT)\s+/i);
    
    if (tokens.length === 1) {
      // Recherche simple
      return this.search(tokens[0], options);
    }
    
    // Pour MVP, implémenter uniquement AND
    if (expression.includes(' AND ')) {
      const terms = expression.split(/\s+AND\s+/i);
      let results = this.search(terms[0], options);
      
      for (let i = 1; i < terms.length; i++) {
        const termResults = new Set(
          this.search(terms[i], options).map((m) => m.id)
        );
        results = results.filter((m) => termResults.has(m.id));
      }
      
      return results;
    }
    
    // OR
    if (expression.includes(' OR ')) {
      const terms = expression.split(/\s+OR\s+/i);
      const allResults = new Map<string, IndexedMessage>();
      
      for (const term of terms) {
        const termResults = this.search(term, options);
        termResults.forEach((m) => allResults.set(m.id, m));
      }
      
      return Array.from(allResults.values()).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
    }
    
    // Fallback recherche simple
    return this.search(expression, options);
  }
  
  /**
   * Nettoie l'index pour une conversation
   */
  clearConversation(conversationId: string) {
    const messageIds = this.conversationIndex.get(conversationId) || new Set();
    messageIds.forEach((id) => this.messages.delete(id));
    this.conversationIndex.delete(conversationId);
  }
  
  /**
   * Nettoie tout l'index
   */
  clearAll() {
    this.messages.clear();
    this.conversationIndex.clear();
  }
  
  /**
   * Statistiques index
   */
  getStats() {
    return {
      totalMessages: this.messages.size,
      conversations: this.conversationIndex.size,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }
  
  /**
   * Estime l'utilisation mémoire (approximation)
   */
  private estimateMemoryUsage(): string {
    let bytes = 0;
    this.messages.forEach((msg) => {
      bytes += msg.plaintext.length * 2; // UTF-16
      bytes += 32; // UUID
      bytes += 8; // Date
    });
    
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  }
}

// Singleton global pour l'app
export const globalSearchIndex = new ClientSearchIndex();
