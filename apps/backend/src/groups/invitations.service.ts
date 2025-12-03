import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { randomBytes } from 'crypto';

/**
 * Service de gestion des invitations groupes
 * Phase 7: Liens d'invitation avec expiration et limite d'utilisations
 */
@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Génère un lien d'invitation pour un groupe
   */
  async generateInviteLink(
    conversationId: string,
    creatorId: string,
    options?: {
      expiresIn?: number; // Durée en secondes
      maxUses?: number;
    }
  ) {
    // Vérifier permissions (admin+)
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: creatorId,
        },
      },
    });

    if (!participant || !['owner', 'admin'].includes(participant.role)) {
      throw new ForbiddenException('Only admins can create invite links');
    }

    // Générer code unique
    const code = randomBytes(16).toString('hex');

    const expiresAt = options?.expiresIn
      ? new Date(Date.now() + options.expiresIn * 1000)
      : null;

    const invite = await this.prisma.groupInvite.create({
      data: {
        conversationId,
        code,
        createdBy: creatorId,
        expiresAt,
        maxUses: options?.maxUses,
      },
    });

    // Log création invitation
    await this.logAuditAction(conversationId, creatorId, 'invite_created', null, {
      code,
      expiresAt: expiresAt?.toISOString(),
      maxUses: options?.maxUses,
    });

    return {
      id: invite.id,
      code: invite.code,
      link: `https://messenger.app/invite/${invite.code}`,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
    };
  }

  /**
   * Accepte une invitation et rejoint le groupe
   */
  async acceptInvite(code: string, userId: string) {
    const invite = await this.prisma.groupInvite.findUnique({
      where: { code },
      include: {
        conversation: true,
      },
    });

    if (!invite) {
      throw new NotFoundException('Invalid invite code');
    }

    // Vérifications validité
    if (invite.isRevoked) {
      throw new ForbiddenException('This invite has been revoked');
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new ForbiddenException('This invite has expired');
    }

    if (invite.maxUses && invite.usesCount >= invite.maxUses) {
      throw new ForbiddenException('This invite has reached maximum uses');
    }

    // Vérifier si déjà membre
    const existingParticipant = await this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId: invite.conversationId,
        userId,
        leftAt: null,
      },
    });

    if (existingParticipant) {
      throw new ForbiddenException('Already a member of this group');
    }

    // Rejoindre le groupe
    await this.prisma.conversationParticipant.create({
      data: {
        conversationId: invite.conversationId,
        userId,
        role: 'member',
      },
    });

    // Incrémenter compteur utilisations
    await this.prisma.groupInvite.update({
      where: { id: invite.id },
      data: { usesCount: { increment: 1 } },
    });

    // Log jointure via invitation
    await this.logAuditAction(
      invite.conversationId,
      userId,
      'member_joined_via_invite',
      userId,
      { inviteCode: code }
    );

    return {
      success: true,
      conversation: invite.conversation,
    };
  }

  /**
   * Révoque une invitation (admin+)
   */
  async revokeInvite(inviteId: string, actorId: string) {
    const invite = await this.prisma.groupInvite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    // Vérifier permissions
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: invite.conversationId,
          userId: actorId,
        },
      },
    });

    if (!participant || !['owner', 'admin'].includes(participant.role)) {
      throw new ForbiddenException('Only admins can revoke invites');
    }

    // Marquer comme révoquée
    await this.prisma.groupInvite.update({
      where: { id: inviteId },
      data: { isRevoked: true },
    });

    // Log révocation
    await this.logAuditAction(
      invite.conversationId,
      actorId,
      'invite_revoked',
      null,
      { inviteId, code: invite.code }
    );

    return { success: true };
  }

  /**
   * Liste les invitations actives d'un groupe
   */
  async listInvites(conversationId: string, actorId: string) {
    // Vérifier permissions
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: actorId,
        },
      },
    });

    if (!participant || !['owner', 'admin'].includes(participant.role)) {
      throw new ForbiddenException('Only admins can view invites');
    }

    return this.prisma.groupInvite.findMany({
      where: {
        conversationId,
        isRevoked: false,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Log action dans journal d'audit
   */
  private async logAuditAction(
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
}
