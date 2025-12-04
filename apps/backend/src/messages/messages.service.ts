import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EphemeralService } from './ephemeral.service';
import { DevicesService } from '../devices/devices.service';

interface CreateMessageDto {
  conversationId: string;
  senderId: string;
  senderDeviceId?: string;
  ciphertext: Buffer;
  type: 'text' | 'media' | 'file' | 'call' | 'system';
  replyToId?: string;
  mediaKeys?: any;
  ttlSeconds?: number; // Phase 6: TTL pour messages éphémères
}

/**
 * Service de gestion des messages
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ephemeralService: EphemeralService,
    private devicesService: DevicesService,
  ) {}

  /**
   * Crée un nouveau message chiffré
   */
  async createMessage(dto: CreateMessageDto) {
    const message = await this.prisma.message.create({
      data: {
        conversationId: dto.conversationId,
        senderId: dto.senderId,
        senderDeviceId: dto.senderDeviceId,
        ciphertext: dto.ciphertext,
        type: dto.type,
        replyToId: dto.replyToId,
        mediaKeys: dto.mediaKeys,
      },
    });

    // Phase 6: Si TTL défini, activer l'auto-suppression
    if (dto.ttlSeconds) {
      await this.ephemeralService.setEphemeral(message.id, dto.ttlSeconds);
    }

    return this.prisma.message.findUnique({
      where: { id: message.id },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        receipts: true,
      },
    });
  }

  /**
   * Récupère un message par ID
   */
  async getMessage(messageId: string) {
    return this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        receipts: true,
      },
    });
  }

  /**
   * Récupère les messages d'une conversation (paginés)
   */
  async getMessages(conversationId: string, limit = 50, beforeId?: string) {
    return this.prisma.message.findMany({
      where: {
        conversationId,
        ...(beforeId && {
          createdAt: {
            lt: (
              await this.prisma.message.findUnique({
                where: { id: beforeId },
                select: { createdAt: true },
              })
            )?.createdAt,
          },
        }),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  /**
   * Met à jour le statut de lecture/livraison d'un message
   */
  async updateReceipt(
    messageId: string,
    userId: string,
    deviceId: string,
    status: 'sent' | 'delivered' | 'read'
  ) {
    return this.prisma.messageReceipt.upsert({
      where: {
        messageId_userId_deviceId: {
          messageId,
          userId,
          deviceId,
        },
      },
      update: {
        status,
        timestamp: new Date(),
      },
      create: {
        messageId,
        userId,
        deviceId,
        status,
      },
    });
  }

  /**
   * Récupère les participants d'une conversation
   */
  async getConversationParticipants(conversationId: string) {
    return this.prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        leftAt: null, // Actifs seulement
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  /**
   * Récupère les participants d'une conversation avec leurs devices actifs
   */
  async getConversationParticipantsWithDevices(conversationId: string) {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        leftAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            devices: {
              select: {
                id: true,
                type: true,
                identityKey: true,
              },
            },
          },
        },
      },
    });

    return participants.map((p) => ({
      userId: p.userId,
      role: p.role,
      user: {
        id: p.user?.id,
        displayName: p.user?.displayName,
        avatarUrl: p.user?.avatarUrl,
        devices: p.user?.devices,
      },
    }));
  }

  /**
   * Crée une nouvelle conversation
   */
  async createConversation(
    type: 'direct' | 'group',
    createdBy: string,
    participantIds: string[],
    name?: string,
    avatarUrl?: string
  ) {
    return this.prisma.conversation.create({
      data: {
        type,
        name,
        avatarUrl,
        createdBy,
        participants: {
          create: participantIds.map((userId) => ({
            userId,
            role: userId === createdBy ? 'owner' : 'member',
          })),
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
  }

  /**
   * Récupère les conversations d'un utilisateur
   */
  async getUserConversations(userId: string) {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: {
        userId,
        leftAt: null,
      },
      include: {
        conversation: {
          include: {
            participants: {
              where: {
                leftAt: null,
              },
              include: {
                user: {
                  select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    lastSeenAt: true,
                  },
                },
              },
            },
            messages: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 1,
              include: {
                sender: {
                  select: {
                    id: true,
                    displayName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        conversation: {
          lastMessageAt: 'desc',
        },
      },
    });

    return participants.map((p) => p.conversation);
  }

  /**
   * Marque un utilisateur comme ayant quitté la conversation
   */
  async leaveConversation(conversationId: string, userId: string) {
    return this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: {
        leftAt: new Date(),
      },
    });
  }

  /**
   * Supprime un message (soft delete)
   */
  async deleteMessage(messageId: string, userId: string) {
    // Vérifier que l'utilisateur est l'expéditeur
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true },
    });

    if (message?.senderId !== userId) {
      throw new Error('Unauthorized');
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async sendMessage(
    senderId: string,
    senderDeviceId: string,
    conversationId: string,
    ciphertext: Buffer,
    recipientId: string,
  ) {
    // 1. Get all devices for the recipient
    const recipientDevices = await this.devicesService.findUserDevices(
      recipientId,
    );

    if (recipientDevices.length === 0) {
      throw new NotFoundException('Recipient has no active devices.');
    }

    // 2. Fork the message: create a specific encrypted message for each device
    // The client is responsible for encrypting the message for each device
    // and we store the same payload for all devices for now.
    console.log(
      `Forking message for ${recipientDevices.length} devices of user ${recipientId}`,
    );

    // Create the message - the actual multi-device logic will be handled client-side
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        senderDeviceId,
        ciphertext,
        type: 'text',
      },
    });

    // TODO: Notify each device via WebSocket

    return message;
  }
}
