import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ReactionsService } from './reactions.service';

/**
 * Gateway WebSocket pour les réactions temps réel
 */
@WebSocketGateway({ namespace: '/reactions', cors: { origin: '*' } })
@UseGuards(JwtAuthGuard)
export class ReactionsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  // Map userId → Set<socketId>
  private userSockets = new Map<string, Set<string>>();

  constructor(private readonly reactionsService: ReactionsService) {}

  handleConnection(client: Socket) {
    const userId = client.handshake.auth?.userId;
    if (!userId) {
      client.disconnect();
      return;
    }

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(client.id);
    console.log(`[ReactionsGateway] User ${userId} connected (${client.id})`);
  }

  handleDisconnect(client: Socket) {
    const userId = client.handshake.auth?.userId;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId).delete(client.id);
      if (this.userSockets.get(userId).size === 0) {
        this.userSockets.delete(userId);
      }
    }
    console.log(`[ReactionsGateway] Client ${client.id} disconnected`);
  }

  /**
   * Ajout réaction
   */
  @SubscribeMessage('reaction:add')
  async handleAddReaction(
    @MessageBody()
    data: {
      conversationId: string;
      messageId: string;
      emoji: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.handshake.auth?.userId;
    if (!userId) return;

    const reaction = await this.reactionsService.addReaction(
      data.messageId,
      userId,
      data.emoji,
    );

    // Broadcast à tous les participants de la conversation
    this.server
      .to(`conversation:${data.conversationId}`)
      .emit('reaction:added', {
        conversationId: data.conversationId,
        messageId: data.messageId,
        userId,
        emoji: data.emoji,
        createdAt: reaction.createdAt,
      });
  }

  /**
   * Suppression réaction
   */
  @SubscribeMessage('reaction:remove')
  async handleRemoveReaction(
    @MessageBody()
    data: {
      conversationId: string;
      messageId: string;
      emoji: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.handshake.auth?.userId;
    if (!userId) return;

    await this.reactionsService.removeReaction(data.messageId, userId, data.emoji);

    // Broadcast
    this.server
      .to(`conversation:${data.conversationId}`)
      .emit('reaction:removed', {
        conversationId: data.conversationId,
        messageId: data.messageId,
        userId,
        emoji: data.emoji,
      });
  }

  /**
   * Rejoint une room conversation pour recevoir les réactions
   */
  @SubscribeMessage('conversation:join')
  handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`conversation:${data.conversationId}`);
  }

  /**
   * Quitte une room conversation
   */
  @SubscribeMessage('conversation:leave')
  handleLeaveConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`conversation:${data.conversationId}`);
  }
}
