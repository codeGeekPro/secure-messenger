import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

interface CreateGroupDto {
  name: string;
  description?: string;
  creatorId: string;
  memberIds: string[];
}

interface UpdateGroupDto {
  name?: string;
  description?: string;
  avatarUrl?: string;
}

/**
 * Service de gestion des groupes
 * Phase 7: Création, rôles, modération, invitations, pins
 */
@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crée un nouveau groupe avec créateur comme owner
   */
  async createGroup(dto: CreateGroupDto) {
    const group = await this.prisma.conversation.create({
      data: {
        type: 'group',
        name: dto.name,
        description: dto.description,
        createdBy: dto.creatorId,
        participants: {
          create: [
            // Créateur = owner
            {
              userId: dto.creatorId,
              role: 'owner',
            },
            // Membres initiaux = member
            ...dto.memberIds.map((userId) => ({
              userId,
              role: 'member' as const,
            })),
          ],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // Log création groupe
    await this.logAction(group.id, dto.creatorId, 'group_created', null, {
      name: dto.name,
      memberCount: dto.memberIds.length + 1,
    });

    return group;
  }

  /**
   * Vérifie si utilisateur a une permission dans le groupe
   */
  async checkPermission(
    conversationId: string,
    userId: string,
    requiredRole: 'owner' | 'admin' | 'member'
  ): Promise<boolean> {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      select: { role: true },
    });

    if (!participant) return false;

    // Hiérarchie: owner > admin > member
    if (requiredRole === 'member') return true;
    if (requiredRole === 'admin') return ['owner', 'admin'].includes(participant.role);
    if (requiredRole === 'owner') return participant.role === 'owner';

    return false;
  }

  /**
   * Ajoute des membres au groupe (admin+)
   */
  async addMembers(
    conversationId: string,
    actorId: string,
    memberIds: string[]
  ) {
    // Vérifier permissions
    const canInvite = await this.checkPermission(conversationId, actorId, 'admin');
    if (!canInvite) {
      throw new ForbiddenException('Only admins can add members');
    }

    const newMembers = await this.prisma.conversationParticipant.createMany({
      data: memberIds.map((userId) => ({
        conversationId,
        userId,
        role: 'member',
      })),
      skipDuplicates: true,
    });

    // Log ajout membres
    await this.logAction(conversationId, actorId, 'members_added', null, {
      memberIds,
      count: newMembers.count,
    });

    return newMembers;
  }

  /**
   * Retire un membre du groupe (admin+, owner pour admins)
   */
  async removeMember(
    conversationId: string,
    actorId: string,
    targetUserId: string
  ) {
    // Récupérer rôles
    const [actor, target] = await Promise.all([
      this.prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId: actorId } },
      }),
      this.prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId: targetUserId } },
      }),
    ]);

    if (!actor || !target) {
      throw new NotFoundException('Participant not found');
    }

    // Permissions: admin peut retirer member, owner peut retirer admin/member
    const canRemove =
      (actor.role === 'admin' && target.role === 'member') ||
      (actor.role === 'owner' && target.role !== 'owner');

    if (!canRemove) {
      throw new ForbiddenException('Insufficient permissions to remove this member');
    }

    // Marquer comme parti
    await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId, userId: targetUserId },
      },
      data: { leftAt: new Date() },
    });

    // Log retrait
    await this.logAction(conversationId, actorId, 'member_removed', targetUserId);

    return { success: true };
  }

  /**
   * Met à jour le rôle d'un membre (owner uniquement)
   */
  async updateMemberRole(
    conversationId: string,
    actorId: string,
    targetUserId: string,
    newRole: 'admin' | 'member'
  ) {
    const isOwner = await this.checkPermission(conversationId, actorId, 'owner');
    if (!isOwner) {
      throw new ForbiddenException('Only owners can change roles');
    }

    const updated = await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId, userId: targetUserId },
      },
      data: { role: newRole },
    });

    // Log changement rôle
    await this.logAction(conversationId, actorId, 'role_changed', targetUserId, {
      newRole,
    });

    return updated;
  }

  /**
   * Met à jour les paramètres du groupe (admin+)
   */
  async updateSettings(
    conversationId: string,
    actorId: string,
    updates: UpdateGroupDto
  ) {
    const canUpdate = await this.checkPermission(conversationId, actorId, 'admin');
    if (!canUpdate) {
      throw new ForbiddenException('Only admins can update group settings');
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: updates,
    });

    // Log modification
    await this.logAction(conversationId, actorId, 'settings_updated', null, updates);

    return updated;
  }

  /**
   * Épingle un message (admin+)
   */
  async pinMessage(
    conversationId: string,
    messageId: string,
    actorId: string
  ) {
    const canPin = await this.checkPermission(conversationId, actorId, 'admin');
    if (!canPin) {
      throw new ForbiddenException('Only admins can pin messages');
    }

    const pinned = await this.prisma.pinnedMessage.upsert({
      where: {
        conversationId_messageId: {
          conversationId,
          messageId,
        },
      },
      update: {},
      create: {
        conversationId,
        messageId,
        pinnedBy: actorId,
      },
    });

    // Log pin
    await this.logAction(conversationId, actorId, 'message_pinned', messageId);

    return pinned;
  }

  /**
   * Désépingle un message (admin+)
   */
  async unpinMessage(
    conversationId: string,
    messageId: string,
    actorId: string
  ) {
    const canUnpin = await this.checkPermission(conversationId, actorId, 'admin');
    if (!canUnpin) {
      throw new ForbiddenException('Only admins can unpin messages');
    }

    await this.prisma.pinnedMessage.delete({
      where: {
        conversationId_messageId: {
          conversationId,
          messageId,
        },
      },
    });

    // Log unpin
    await this.logAction(conversationId, actorId, 'message_unpinned', messageId);

    return { success: true };
  }

  /**
   * Liste les messages épinglés
   */
  async getPinnedMessages(conversationId: string) {
    return this.prisma.pinnedMessage.findMany({
      where: { conversationId },
      orderBy: { pinnedAt: 'desc' },
      take: 10,
    });
  }

  /**
   * Récupère le journal d'audit (admin+)
   */
  async getAuditLog(conversationId: string, actorId: string, limit = 50) {
    const canView = await this.checkPermission(conversationId, actorId, 'admin');
    if (!canView) {
      throw new ForbiddenException('Only admins can view audit log');
    }

    return this.prisma.groupAuditLog.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Enregistre une action dans le journal d'audit
   */
  private async logAction(
    conversationId: string,
    actorId: string,
    action: string,
    targetId?: string | null,
    metadata?: any
  ) {
    await this.prisma.groupAuditLog.create({
      data: {
        conversationId,
        actorId,
        action,
        targetId,
        metadata,
      },
    });
  }

  /**
   * Quitte le groupe (member uniquement, owner doit transférer ownership)
   */
  async leaveGroup(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!participant) {
      throw new NotFoundException('Not a member of this group');
    }

    if (participant.role === 'owner') {
      throw new ForbiddenException('Owner must transfer ownership before leaving');
    }

    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { leftAt: new Date() },
    });

    // Log départ
    await this.logAction(conversationId, userId, 'member_left', userId);

    return { success: true };
  }
}
