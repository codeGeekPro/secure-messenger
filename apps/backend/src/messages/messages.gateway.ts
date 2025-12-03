import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  deviceId?: string;
}

/**
 * WebSocket Gateway pour messages temps réel
 * Gère connexions, envoi/réception messages, typing indicators, presence
 */
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/messages',
})
@UseGuards(JwtAuthGuard)
export class MessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  // Map userId → Set<socketId> (multi-devices)
  private userSockets = new Map<string, Set<string>>();

  constructor(private readonly messagesService: MessagesService) {}

  /**
   * Client connecté
   */
  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extraire userId/deviceId depuis JWT (passé en query param)
      const token = client.handshake.auth.token;
      const user = await this.validateToken(token);

      if (!user) {
        client.disconnect();
        return;
      }

      client.userId = user.id;
      client.deviceId = client.handshake.query.deviceId as string;

      // Ajouter à la map
      if (!this.userSockets.has(user.id)) {
        this.userSockets.set(user.id, new Set());
      }
      this.userSockets.get(user.id).add(client.id);

      // Notifier présence online
      this.broadcastPresence(user.id, 'online');

      console.log(`User ${user.id} connected (socket ${client.id})`);
    } catch (error) {
      console.error('Connection error:', error);
      client.disconnect();
    }
  }

  /**
   * Client déconnecté
   */
  handleDisconnect(client: AuthenticatedSocket) {
    if (!client.userId) return;

    const sockets = this.userSockets.get(client.userId);
    if (sockets) {
      sockets.delete(client.id);

      // Si plus aucun device connecté, marquer offline
      if (sockets.size === 0) {
        this.userSockets.delete(client.userId);
        this.broadcastPresence(client.userId, 'offline');
      }
    }

    console.log(`User ${client.userId} disconnected (socket ${client.id})`);
  }

  /**
   * Client envoie message chiffré
   * @event message:send
   */
  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: {
      conversationId: string;
      ciphertext: string;
      nonce: string;
      ratchetPublicKey: string;
      messageNumber: number;
      previousChainLength: number;
      type: string;
      replyToId?: string;
      mediaKeys?: any;
    }
  ) {
    try {
      const message = await this.messagesService.createMessage({
        conversationId: payload.conversationId,
        senderId: client.userId,
        senderDeviceId: client.deviceId,
        ciphertext: Buffer.from(payload.ciphertext, 'base64'),
        type: payload.type as any,
        replyToId: payload.replyToId,
        mediaKeys: payload.mediaKeys,
      });

      // Récupérer participants conversation
      const participants =
        await this.messagesService.getConversationParticipants(
          payload.conversationId
        );

      // Envoyer à tous les participants (sauf expéditeur)
      for (const participant of participants) {
        if (participant.userId === client.userId) continue;

        const recipientSockets = this.userSockets.get(participant.userId);
        if (recipientSockets) {
          recipientSockets.forEach((socketId) => {
            this.server.to(socketId).emit('message:new', {
              id: message.id,
              conversationId: payload.conversationId,
              senderId: client.userId,
              senderDeviceId: client.deviceId,
              ciphertext: payload.ciphertext,
              nonce: payload.nonce,
              ratchetPublicKey: payload.ratchetPublicKey,
              messageNumber: payload.messageNumber,
              previousChainLength: payload.previousChainLength,
              type: payload.type,
              replyToId: payload.replyToId,
              mediaKeys: payload.mediaKeys,
              createdAt: message.createdAt,
            });
          });
        }
      }

      // Confirmer à l'expéditeur
      client.emit('message:sent', {
        id: message.id,
        conversationId: payload.conversationId,
        createdAt: message.createdAt,
      });
    } catch (error) {
      client.emit('message:error', {
        error: error.message,
      });
    }
  }

  /**
   * Client envoie typing indicator
   * @event typing:start
   */
  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string }
  ) {
    const participants =
      await this.messagesService.getConversationParticipants(
        payload.conversationId
      );

    for (const participant of participants) {
      if (participant.userId === client.userId) continue;

      const recipientSockets = this.userSockets.get(participant.userId);
      if (recipientSockets) {
        recipientSockets.forEach((socketId) => {
          this.server.to(socketId).emit('typing:start', {
            conversationId: payload.conversationId,
            userId: client.userId,
          });
        });
      }
    }
  }

  /**
   * Client arrête typing
   * @event typing:stop
   */
  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string }
  ) {
    const participants =
      await this.messagesService.getConversationParticipants(
        payload.conversationId
      );

    for (const participant of participants) {
      if (participant.userId === client.userId) continue;

      const recipientSockets = this.userSockets.get(participant.userId);
      if (recipientSockets) {
        recipientSockets.forEach((socketId) => {
          this.server.to(socketId).emit('typing:stop', {
            conversationId: payload.conversationId,
            userId: client.userId,
          });
        });
      }
    }
  }

  /**
   * Client confirme réception message
   * @event message:delivered
   */
  @SubscribeMessage('message:delivered')
  async handleMessageDelivered(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { messageId: string }
  ) {
    await this.messagesService.updateReceipt(
      payload.messageId,
      client.userId,
      client.deviceId,
      'delivered'
    );

    // Notifier expéditeur
    const message = await this.messagesService.getMessage(payload.messageId);
    const senderSockets = this.userSockets.get(message.senderId);

    if (senderSockets) {
      senderSockets.forEach((socketId) => {
        this.server.to(socketId).emit('message:receipt', {
          messageId: payload.messageId,
          userId: client.userId,
          status: 'delivered',
        });
      });
    }
  }

  /**
   * Client confirme lecture message
   * @event message:read
   */
  @SubscribeMessage('message:read')
  async handleMessageRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { messageId: string }
  ) {
    await this.messagesService.updateReceipt(
      payload.messageId,
      client.userId,
      client.deviceId,
      'read'
    );

    // Notifier expéditeur
    const message = await this.messagesService.getMessage(payload.messageId);
    const senderSockets = this.userSockets.get(message.senderId);

    if (senderSockets) {
      senderSockets.forEach((socketId) => {
        this.server.to(socketId).emit('message:receipt', {
          messageId: payload.messageId,
          userId: client.userId,
          status: 'read',
        });
      });
    }
  }

  /**
   * Broadcast présence utilisateur
   */
  private broadcastPresence(userId: string, status: 'online' | 'offline') {
    this.server.emit('user:presence', {
      userId,
      status,
      timestamp: new Date(),
    });
  }

  /**
   * Broadcast expiration message éphémère (Phase 6)
   */
  broadcastMessageExpired(conversationId: string, messageId: string) {
    this.server.emit('message:expired', {
      conversationId,
      messageId,
      timestamp: new Date(),
    });
  }

  /**
   * Valide JWT token (simplifié, à améliorer)
   */
  private async validateToken(token: string): Promise<{ id: string } | null> {
    // TODO: Utiliser JwtService pour décoder et valider
    // Pour l'instant, mock
    if (!token) return null;
    return { id: 'user-id-from-token' };
  }
}
