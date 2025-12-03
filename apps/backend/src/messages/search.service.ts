import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

interface SearchFilters {
  query?: string;
  conversationId?: string;
  senderId?: string;
  type?: 'text' | 'media' | 'file';
  after?: Date;
  before?: Date;
}

/**
 * Service de recherche messages
 * Phase 8: Full-text search avec filtres avancés
 * 
 * Note E2E: Dans un système chiffré end-to-end, la recherche full-text
 * doit se faire côté client après déchiffrement. Ce service est pour
 * recherche par métadonnées (date, expéditeur, type).
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recherche messages par métadonnées
   * (Pas de recherche full-text sur ciphertext en E2E)
   */
  async searchMessages(
    userId: string,
    filters: SearchFilters,
    limit = 50,
    cursor?: string
  ) {
    // Récupérer les conversations accessibles par l'utilisateur
    const userConversations = await this.prisma.conversationParticipant.findMany({
      where: {
        userId,
        leftAt: null,
      },
      select: { conversationId: true },
    });

    const conversationIds = userConversations.map((c) => c.conversationId);

    // Build query
    const where: any = {
      conversationId: filters.conversationId
        ? filters.conversationId
        : { in: conversationIds },
      deletedAt: null,
    };

    if (filters.senderId) {
      where.senderId = filters.senderId;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.after || filters.before) {
      where.createdAt = {};
      if (filters.after) where.createdAt.gte = filters.after;
      if (filters.before) where.createdAt.lte = filters.before;
    }

    // Cursor pagination
    const messages = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        conversation: {
          select: {
            id: true,
            type: true,
            name: true,
          },
        },
      },
    });

    const hasMore = messages.length > limit;
    const results = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    return {
      results,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Recherche par métadonnées média
   */
  async searchMediaMessages(
    userId: string,
    conversationId?: string,
    limit = 50,
    cursor?: string
  ) {
    return this.searchMessages(
      userId,
      {
        conversationId,
        type: 'media',
      },
      limit,
      cursor
    );
  }

  /**
   * Statistiques de recherche (pour analytics)
   */
  async getSearchStats(userId: string, conversationId?: string) {
    const userConversations = await this.prisma.conversationParticipant.findMany({
      where: {
        userId,
        leftAt: null,
        ...(conversationId ? { conversationId } : {}),
      },
      select: { conversationId: true },
    });

    const conversationIds = userConversations.map((c) => c.conversationId);

    const [totalMessages, mediaMessages, textMessages] = await Promise.all([
      this.prisma.message.count({
        where: {
          conversationId: { in: conversationIds },
          deletedAt: null,
        },
      }),
      this.prisma.message.count({
        where: {
          conversationId: { in: conversationIds },
          type: 'media',
          deletedAt: null,
        },
      }),
      this.prisma.message.count({
        where: {
          conversationId: { in: conversationIds },
          type: 'text',
          deletedAt: null,
        },
      }),
    ]);

    return {
      totalMessages,
      mediaMessages,
      textMessages,
    };
  }

  /**
   * Recherche messages d'un utilisateur spécifique
   */
  async searchMessagesBySender(
    userId: string,
    senderId: string,
    conversationId?: string,
    limit = 50
  ) {
    return this.searchMessages(
      userId,
      {
        senderId,
        conversationId,
      },
      limit
    );
  }

  /**
   * Recherche messages dans une plage de dates
   */
  async searchMessagesByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    conversationId?: string,
    limit = 50
  ) {
    return this.searchMessages(
      userId,
      {
        conversationId,
        after: startDate,
        before: endDate,
      },
      limit
    );
  }

  /**
   * Pour recherche full-text côté client (après déchiffrement)
   * Retourne tous les messages d'une conversation pour indexation locale
   */
  async getAllMessagesForClientSearch(
    userId: string,
    conversationId: string,
    batchSize = 1000,
    offset = 0
  ) {
    // Vérifier que l'utilisateur est membre
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!participant || participant.leftAt !== null) {
      throw new Error('Not a member of this conversation');
    }

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        // Uniquement messages après jointure
        createdAt: {
          gte: participant.joinedAt,
        },
      },
      orderBy: { createdAt: 'asc' },
      skip: offset,
      take: batchSize,
      select: {
        id: true,
        ciphertext: true,
        type: true,
        senderId: true,
        createdAt: true,
      },
    });

    const total = await this.prisma.message.count({
      where: {
        conversationId,
        deletedAt: null,
        createdAt: {
          gte: participant.joinedAt,
        },
      },
    });

    return {
      messages,
      total,
      hasMore: offset + batchSize < total,
    };
  }
}
