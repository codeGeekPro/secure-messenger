'use client';

import { useState } from 'react';
import {
  Crown,
  Shield,
  User,
  MoreVertical,
  UserMinus,
  UserPlus,
  Ban,
} from 'lucide-react';

// ActionMenuButton component
interface ActionMenuButtonProps {
  title: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled: boolean;
  className?: string;
  children: React.ReactNode;
}

const ActionMenuButton: React.FC<ActionMenuButtonProps> = ({
  title,
  onClick,
  disabled,
  className,
  children,
}) => (
  <button
    title={title}
    onClick={onClick}
    disabled={disabled}
    className={className}
  >
    {children}
  </button>
);

export type MemberRole = 'owner' | 'admin' | 'member';

export interface GroupMember {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  role: MemberRole;
  joinedAt: Date;
}

interface MembersListProps {
  members: GroupMember[];
  currentUserId: string;
  currentUserRole: MemberRole;
  onPromote?: (memberId: string) => Promise<void>;
  onDemote?: (memberId: string) => Promise<void>;
  onRemove?: (memberId: string) => Promise<void>;
}

export function MembersList({
  members,
  currentUserId,
  currentUserRole,
  onPromote,
  onDemote,
  onRemove,
}: MembersListProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  
  // Permissions
  const canPromote = currentUserRole === 'owner';
  const canRemove = currentUserRole === 'owner' || currentUserRole === 'admin';
  
  // Toggle menu
  const toggleMenu = (memberId: string) => {
    setActiveMenu(activeMenu === memberId ? null : memberId);
  };
  
  // Close menu on outside click
  const closeMenu = () => setActiveMenu(null);
  
  // Actions
  const handlePromote = async (memberId: string) => {
    if (!onPromote) return;
    
    try {
      setLoading(memberId);
      await onPromote(memberId);
      closeMenu();
    } catch (error) {
      console.error('[MembersList] Failed to promote:', error);
    } finally {
      setLoading(null);
    }
  };
  
  const handleDemote = async (memberId: string) => {
    if (!onDemote) return;
    
    try {
      setLoading(memberId);
      await onDemote(memberId);
      closeMenu();
    } catch (error) {
      console.error('[MembersList] Failed to demote:', error);
    } finally {
      setLoading(null);
    }
  };
  
  const handleRemove = async (memberId: string, userName: string) => {
    if (!onRemove) return;
    
    if (!confirm(`Êtes-vous sûr de vouloir retirer ${userName} du groupe ?`)) {
      return;
    }
    
    try {
      setLoading(memberId);
      await onRemove(memberId);
      closeMenu();
    } catch (error) {
      console.error('[MembersList] Failed to remove:', error);
    } finally {
      setLoading(null);
    }
  };
  
  // Trier : owner > admin > member, puis par nom
  const sortedMembers = [...members].sort((a, b) => {
    const roleOrder = { owner: 0, admin: 1, member: 2 };
    const roleCompare = roleOrder[a.role] - roleOrder[b.role];
    if (roleCompare !== 0) return roleCompare;
    return a.userName.localeCompare(b.userName);
  });
  
  return (
    <div className="space-y-2" onClick={closeMenu}>
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
        {members.length} membre{members.length > 1 ? 's' : ''}
      </div>
      
      {sortedMembers.map((member) => {
        const isCurrentUser = member.userId === currentUserId;
        const canManage =
          !isCurrentUser &&
          ((canRemove && member.role === 'member') ||
            (canPromote && member.role !== 'owner'));
        
        return (
          <div
            key={member.id}
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Avatar */}
              {member.userAvatar ? (
                <img
                  src={member.userAvatar}
                  alt={member.userName}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium flex-shrink-0">
                  {member.userName[0]?.toUpperCase()}
                </div>
              )}
              
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">
                    {member.userName}
                  </span>
                  {isCurrentUser && (
                    <span className="text-xs text-gray-500">(vous)</span>
                  )}
                </div>
                
                {/* Role badge */}
                <div className="flex items-center gap-1 mt-1">
                  <RoleBadge role={member.role} />
                </div>
              </div>
            </div>
            
            {/* Actions menu */}
            {canManage && (
              <div className="relative">
                <ActionMenuButton
                  title="Ouvrir le menu d'actions"
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    toggleMenu(member.id);
                  }}
                  disabled={loading === member.id}
                  className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                >
                  <MoreVertical className="w-4 h-4" />
                </ActionMenuButton>
                
                {activeMenu === member.id && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                    {/* Promote */}
                    {canPromote && member.role === 'member' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePromote(member.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <Shield className="w-4 h-4" />
                        Promouvoir admin
                      </button>
                    )}
                    
                    {/* Demote */}
                    {canPromote && member.role === 'admin' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDemote(member.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <User className="w-4 h-4" />
                        Rétrograder en membre
                      </button>
                    )}
                    
                    {/* Remove */}
                    {canRemove && member.role !== 'admin' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(member.id, member.userName);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <UserMinus className="w-4 h-4" />
                        Retirer du groupe
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Role badge component
function RoleBadge({ role }: { role: MemberRole }) {
  const config = {
    owner: {
      icon: Crown,
      label: 'Propriétaire',
      className: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    },
    admin: {
      icon: Shield,
      label: 'Admin',
      className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    },
    member: {
      icon: User,
      label: 'Membre',
      className: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    },
  };
  
  const { icon: Icon, label, className } = config[role];
  
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
