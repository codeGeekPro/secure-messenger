'use client';

import { useState } from 'react';
import { X, Users, Image as ImageIcon } from 'lucide-react';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: GroupFormData) => Promise<void>;
  availableUsers: Array<{ id: string; name: string; avatar?: string }>;
}

export interface GroupFormData {
  name: string;
  description?: string;
  avatarUrl?: string;
  memberIds: string[];
}

export function CreateGroupModal({
  isOpen,
  onClose,
  onSubmit,
  availableUsers,
}: CreateGroupModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filtrer users selon recherche
  const filteredUsers = availableUsers.filter((user) =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Toggle member
  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };
  
  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || selectedMembers.size === 0) return;
    
    try {
      setIsSubmitting(true);
      
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        avatarUrl: avatarUrl.trim() || undefined,
        memberIds: Array.from(selectedMembers),
      });
      
      // Reset & close
      setName('');
      setDescription('');
      setAvatarUrl('');
      setSelectedMembers(new Set());
      onClose();
    } catch (error) {
      console.error('[CreateGroupModal] Failed to create group:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-white dark:bg-gray-900 rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Créer un groupe</h2>
          </div>
          
          <button
            onClick={onClose}
            title="Fermer"
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Group name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Nom du groupe <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mon super groupe"
              maxLength={100}
              required
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <p className="text-xs text-gray-500 mt-1">{name.length}/100</p>
          </div>
          
          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Description (optionnel)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="À propos de ce groupe..."
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">{description.length}/500</p>
          </div>
          
          {/* Avatar URL */}
          <div>
            <label className="block text-sm font-medium mb-1">
              URL de l'avatar (optionnel)
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
                className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              {avatarUrl && (
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <img
                    src={avatarUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>
          </div>
          
          {/* Members selection */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Membres <span className="text-red-500">*</span>{' '}
              <span className="text-gray-500 font-normal">
                ({selectedMembers.size} sélectionné{selectedMembers.size > 1 ? 's' : ''})
              </span>
            </label>
            
            {/* Search */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un utilisateur..."
              className="w-full px-3 py-2 mb-2 bg-gray-100 dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            
            {/* User list */}
            <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
              {filteredUsers.length === 0 ? (
                <p className="p-3 text-sm text-gray-500 text-center">
                  Aucun utilisateur trouvé
                </p>
              ) : (
                filteredUsers.map((user) => (
                  <label
                    key={user.id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.has(user.id)}
                      onChange={() => toggleMember(user.id)}
                      className="w-4 h-4"
                    />
                    
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
                        {user.name[0]?.toUpperCase()}
                      </div>
                    )}
                    
                    <span className="text-sm">{user.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg disabled:opacity-50"
            >
              Annuler
            </button>
            
            <button
              type="submit"
              disabled={!name.trim() || selectedMembers.size === 0 || isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Création...
                </>
              ) : (
                'Créer le groupe'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
