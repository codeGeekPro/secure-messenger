import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * Service de gestion des réactions sur messages
 */
@Injectable()
export class ReactionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ajoute une réaction à un message
   */
  async addReaction(messageId: string, userId: string, emoji: string) {
    // Upsert pour éviter doublons (contrainte unique messageId+userId+emoji)
    return this.prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji,
        },
      },
      update: {},
      create: {
        messageId,
        userId,
        emoji,
      },
    });
  }

  /**
   * Supprime une réaction d'un message
   */
  async removeReaction(messageId: string, userId: string, emoji: string) {
    try {
      await this.prisma.messageReaction.delete({
        where: {
          messageId_userId_emoji: {
            messageId,
            userId,
            emoji,
          },
        },
      });
      return { success: true };
    } catch (error) {
      // Réaction n'existe pas
      return { success: false };
    }
  }

  /**
   * Liste les réactions d'un message (agrégées par emoji)
   */
  async getMessageReactions(messageId: string) {
    const reactions = await this.prisma.messageReaction.findMany({
      where: { messageId },
      select: {
        emoji: true,
        userId: true,
        createdAt: true,
      },
    });

    // Agréger par emoji
    const aggregated = reactions.reduce((acc, reaction) => {
      const existing = acc.find((r) => r.emoji === reaction.emoji);
      if (existing) {
        existing.count++;
        existing.userIds.push(reaction.userId);
      } else {
        acc.push({
          emoji: reaction.emoji,
          count: 1,
          userIds: [reaction.userId],
        });
      }
      return acc;
    }, [] as Array<{ emoji: string; count: number; userIds: string[] }>);

    return aggregated;
  }
}
