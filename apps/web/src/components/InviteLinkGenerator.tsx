'use client';

import { useState, useEffect } from 'react';
import { Link as LinkIcon, Copy, Trash2, Clock, Users, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

export interface GroupInvite {
  id: string;
  code: string;
  createdBy: string;
  createdAt: Date;
  expiresAt?: Date;
  maxUses?: number;
  usesCount: number;
  isRevoked: boolean;
}

interface InviteLinkGeneratorProps {
  conversationId: string;
  invites: GroupInvite[];
  onGenerate: (options: { expiresIn?: number; maxUses?: number }) => Promise<void>;
  onRevoke: (inviteId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function InviteLinkGenerator({
  conversationId,
  invites,
  onGenerate,
  onRevoke,
  onRefresh,
}: InviteLinkGeneratorProps) {
  const [expiresIn, setExpiresIn] = useState<number | undefined>(7 * 24 * 60 * 60 * 1000); // 7 jours
  const [maxUses, setMaxUses] = useState<number | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  
  // Rafraîchir les invites périodiquement
  useEffect(() => {
    const interval = setInterval(onRefresh, 30000); // Toutes les 30s
    return () => clearInterval(interval);
  }, [onRefresh]);
  
  // Générer un nouveau lien
  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      await onGenerate({
        expiresIn,
        maxUses,
      });
    } catch (error) {
      console.error('[InviteLinkGenerator] Failed to generate:', error);
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Copier le lien
  const copyInviteLink = (code: string) => {
    const url = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };
  
  // Révoquer
  const handleRevoke = async (inviteId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir révoquer ce lien d\'invitation ?')) {
      return;
    }
    
    try {
      await onRevoke(inviteId);
    } catch (error) {
      console.error('[InviteLinkGenerator] Failed to revoke:', error);
    }
  };
  
  // Filtrer invites actives
  const activeInvites = invites.filter((invite) => !invite.isRevoked);
  
  return (
    <div className="space-y-4">
      {/* Générateur */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <LinkIcon className="w-4 h-4" />
          Générer un lien d'invitation
        </h3>
        
        <div className="space-y-3">
          {/* Expiration */}
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Expiration
            </label>
            <select
              aria-label="Expiration"
              value={expiresIn || 'never'}
              onChange={(e) =>
                setExpiresIn(
                  e.target.value === 'never' ? undefined : Number(e.target.value)
                )
              }
              className="w-full px-3 py-2 bg-white dark:bg-gray-900 rounded-lg text-sm"
            >
              <option value="never">Jamais</option>
              <option value={60 * 60 * 1000}>1 heure</option>
              <option value={24 * 60 * 60 * 1000}>1 jour</option>
              <option value={7 * 24 * 60 * 60 * 1000}>7 jours</option>
              <option value={30 * 24 * 60 * 60 * 1000}>30 jours</option>
            </select>
          </div>
          {/* Max uses */}
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Nombre maximum d'utilisations
            </label>
            <select
              aria-label="Nombre maximum d'utilisations"
              value={maxUses || 'unlimited'}
              onChange={(e) =>
                setMaxUses(
                  e.target.value === 'unlimited' ? undefined : Number(e.target.value)
                )
              }
              className="w-full px-3 py-2 bg-white dark:bg-gray-900 rounded-lg text-sm"
            >
              <option value="unlimited">Illimité</option>
              <option value={1}>1 utilisation</option>
              <option value={5}>5 utilisations</option>
              <option value={10}>10 utilisations</option>
              <option value={25}>25 utilisations</option>
              <option value={50}>50 utilisations</option>
            </select>
          </div>
          
          {/* Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Génération...
              </>
            ) : (
              <>
                <LinkIcon className="w-4 h-4" />
                Générer le lien
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Liste des invites */}
      <div>
        <h3 className="text-sm font-semibold mb-2">
          Liens actifs ({activeInvites.length})
        </h3>
        
        {activeInvites.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            Aucun lien d'invitation actif
          </p>
        ) : (
          <div className="space-y-2">
            {activeInvites.map((invite) => (
              <InviteItem
                key={invite.id}
                invite={invite}
                onCopy={() => copyInviteLink(invite.code)}
                onRevoke={() => handleRevoke(invite.id)}
                isCopied={copiedCode === invite.code}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Invite item component
interface InviteItemProps {
  invite: GroupInvite;
  onCopy: () => void;
  onRevoke: () => void;
  isCopied: boolean;
}

function InviteItem({ invite, onCopy, onRevoke, isCopied }: InviteItemProps) {
  const isExpired = !!(invite.expiresAt && invite.expiresAt < new Date());
  const isMaxedOut = !!(invite.maxUses && invite.usesCount >= invite.maxUses);
  
  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="flex items-start justify-between mb-2">
        {/* Code */}
        <div className="flex-1 min-w-0">
          <code className="text-sm font-mono text-blue-600 dark:text-blue-400 block truncate">
            {window.location.origin}/join/{invite.code}
          </code>
          
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            {/* Expiration */}
            {invite.expiresAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {isExpired
                  ? 'Expiré'
                  : `Expire ${formatDistanceToNow(invite.expiresAt, {
                      addSuffix: true,
                      locale: fr,
                    })}`}
              </span>
            )}
            
            {/* Uses */}
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {invite.usesCount}
              {invite.maxUses ? `/${invite.maxUses}` : ''}
            </span>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={onCopy}
            disabled={isExpired || isMaxedOut}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            title="Copier le lien"
          >
            {isCopied ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
          
          <button
            onClick={onRevoke}
            className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-600"
            title="Révoquer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Warnings */}
      {isExpired && (
        <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
          ⚠️ Ce lien a expiré
        </div>
      )}
      
      {isMaxedOut && (
        <div className="text-xs text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded">
          ⚠️ Nombre maximum d'utilisations atteint
        </div>
      )}
    </div>
  );
}
