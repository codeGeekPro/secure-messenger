import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CallsService } from './calls.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  deviceId?: string;
}

/**
 * WebSocket Gateway pour signaling WebRTC (appels audio/vidéo) et sync multi-device
 * 
 * Events:
 * - call:offer, call:answer, call:ice-candidate (WebRTC signaling)
 * - read-sync:* (État de lecture cross-device)
 * - device:* (Gestion des appareils multi-device)
 */
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/calls',
})
@UseGuards(JwtAuthGuard)
export class CallsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, Set<string>>();
  private userDevices = new Map<string, Map<string, string>>(); // userId -> (deviceId -> socketId)

  constructor(private readonly callsService: CallsService) {}

  handleConnection(client: AuthenticatedSocket) {
    // Authentification via JWT dans handshake
    const token = client.handshake.auth.token;
    // TODO: Valider token et extraire userId
    const userId = 'user-from-token'; // Placeholder
    client.userId = userId;

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);

    console.log(`[Calls] User ${userId} connected (socket ${client.id})`);
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (!client.userId) return;

    const sockets = this.userSockets.get(client.userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userSockets.delete(client.userId);
      }
    }

    // Terminer les appels actifs de cet utilisateur
    const activeCalls = this.callsService.getUserActiveCalls(client.userId);
    activeCalls.forEach((call) => {
      this.callsService.endCall(call.id);
      this.notifyCallEnded(call.id, 'disconnect');
    });

    console.log(`[Calls] User ${client.userId} disconnected (socket ${client.id})`);
  }

  /**
   * Initier un appel (client → serveur)
   */
  @SubscribeMessage('call:initiate')
  async handleInitiateCall(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: {
      conversationId: string;
      recipientId: string;
      type: 'audio' | 'video';
    }
  ) {
    const session = await this.callsService.initiateCall(
      payload.conversationId,
      client.userId || '',
      payload.recipientId,
      payload.type
    );

    // Notifier le destinataire
    const recipientSockets = this.userSockets.get(payload.recipientId);
    if (recipientSockets) {
      recipientSockets.forEach((socketId) => {
        this.server.to(socketId).emit('call:incoming', {
          callId: session.id,
          conversationId: payload.conversationId,
          initiatorId: client.userId,
          type: payload.type,
        });
      });
    }

    // Confirmer à l'initiateur
    client.emit('call:initiated', {
      callId: session.id,
      status: 'ringing',
    });
  }

  /**
   * Accepter un appel (client → serveur)
   */
  @SubscribeMessage('call:accept')
  async handleAcceptCall(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { callId: string }
  ) {
    const session = await this.callsService.acceptCall(payload.callId);
    if (!session) {
      client.emit('call:error', { error: 'Call not found' });
      return;
    }

    // Notifier l'initiateur que l'appel est accepté
    const initiatorSockets = this.userSockets.get(session.initiatorId);
    if (initiatorSockets) {
      initiatorSockets.forEach((socketId) => {
        this.server.to(socketId).emit('call:accepted', {
          callId: session.id,
        });
      });
    }

    client.emit('call:accepted', { callId: session.id });
  }

  /**
   * Rejeter un appel (client → serveur)
   */
  @SubscribeMessage('call:reject')
  async handleRejectCall(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { callId: string }
  ) {
    const session = await this.callsService.endCall(payload.callId);
    if (!session) return;

    // Notifier l'initiateur
    const initiatorSockets = this.userSockets.get(session.initiatorId);
    if (initiatorSockets) {
      initiatorSockets.forEach((socketId) => {
        this.server.to(socketId).emit('call:rejected', {
          callId: session.id,
        });
      });
    }
  }

  /**
   * Terminer un appel (client → serveur)
   */
  @SubscribeMessage('call:end')
  async handleEndCall(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { callId: string }
  ) {
    const session = await this.callsService.endCall(payload.callId);
    if (!session) return;

    this.notifyCallEnded(payload.callId, 'ended');
  }

  /**
   * Relayer SDP offer (WebRTC signaling)
   */
  @SubscribeMessage('call:offer')
  handleOffer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { callId: string; sdp: string }
  ) {
    const session = this.callsService.getActiveCall(payload.callId);
    if (!session) return;

    const recipientId =
      session.initiatorId === client.userId
        ? session.recipientId
        : session.initiatorId;

    const recipientSockets = this.userSockets.get(recipientId);
    if (recipientSockets) {
      recipientSockets.forEach((socketId) => {
        this.server.to(socketId).emit('call:offer', {
          callId: payload.callId,
          sdp: payload.sdp,
        });
      });
    }
  }

  /**
   * Relayer SDP answer (WebRTC signaling)
   */
  @SubscribeMessage('call:answer')
  handleAnswer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { callId: string; sdp: string }
  ) {
    const session = this.callsService.getActiveCall(payload.callId);
    if (!session) return;

    const recipientId =
      session.initiatorId === client.userId
        ? session.recipientId
        : session.initiatorId;

    const recipientSockets = this.userSockets.get(recipientId);
    if (recipientSockets) {
      recipientSockets.forEach((socketId) => {
        this.server.to(socketId).emit('call:answer', {
          callId: payload.callId,
          sdp: payload.sdp,
        });
      });
    }
  }

  /**
   * Relayer ICE candidate (WebRTC signaling)
   */
  @SubscribeMessage('call:ice-candidate')
  handleIceCandidate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { callId: string; candidate: any }
  ) {
    const session = this.callsService.getActiveCall(payload.callId);
    if (!session) return;

    const recipientId =
      session.initiatorId === client.userId
        ? session.recipientId
        : session.initiatorId;

    const recipientSockets = this.userSockets.get(recipientId);
    if (recipientSockets) {
      recipientSockets.forEach((socketId) => {
        this.server.to(socketId).emit('call:ice-candidate', {
          callId: payload.callId,
          candidate: payload.candidate,
        });
      });
    }
  }

  /**
   * Démarrage du partage d'écran
   */
  @SubscribeMessage('call:screen-share-start')
  handleScreenShareStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { callId: string; sdp: string }
  ) {
    const session = this.callsService.getActiveCall(payload.callId);
    if (!session) return;

    const recipientId =
      session.initiatorId === client.userId
        ? session.recipientId
        : session.initiatorId;

    const recipientSockets = this.userSockets.get(recipientId);
    if (recipientSockets) {
      recipientSockets.forEach((socketId) => {
        this.server.to(socketId).emit('call:screen-share-started', {
          callId: payload.callId,
          userId: client.userId,
          sdp: payload.sdp,
        });
      });
    }
  }

  /**
   * Arrêt du partage d'écran
   */
  @SubscribeMessage('call:screen-share-stop')
  handleScreenShareStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { callId: string }
  ) {
    const session = this.callsService.getActiveCall(payload.callId);
    if (!session) return;

    const recipientId =
      session.initiatorId === client.userId
        ? session.recipientId
        : session.initiatorId;

    const recipientSockets = this.userSockets.get(recipientId);
    if (recipientSockets) {
      recipientSockets.forEach((socketId) => {
        this.server.to(socketId).emit('call:screen-share-stopped', {
          callId: payload.callId,
          userId: client.userId,
        });
      });
    }
  }

  /**
   * Notifie la fin d'un appel à tous les participants
   */
  private notifyCallEnded(callId: string, reason: string) {
    this.server.to('/calls').emit('call:ended', { callId, reason });
  }

  // ============================================================================
  // MULTI-DEVICE SYNCHRONIZATION EVENTS
  // ============================================================================

  /**
   * Synchroniser l'état de lecture entre appareils
   * 
   * Payload: {
   *   conversationId: string,
   *   messageIds: string[],
   *   timestamp: number
   * }
   */
  @SubscribeMessage('read-sync:broadcast')
  handleReadSyncBroadcast(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: {
      conversationId: string;
      messageIds: string[];
      timestamp: number;
    }
  ) {
    if (!client.userId) return;

    // Envoyer à tous les appareils du même utilisateur (sauf l'émetteur)
    const userDevices = this.userDevices.get(client.userId);
    if (userDevices) {
      userDevices.forEach((socketId, deviceId) => {
        if (socketId !== client.id) {
          this.server.to(socketId).emit('read-sync:update', {
            conversationId: payload.conversationId,
            messageIds: payload.messageIds,
            timestamp: payload.timestamp,
            sourceDeviceId: client.deviceId || 'unknown',
          });
        }
      });
    }

    console.log(
      `[MultiDevice] Read sync for ${payload.conversationId} from user ${client.userId} (device: ${client.deviceId})`
    );
  }

  /**
   * Notifier un nouvel appareil lié à l'utilisateur
   */
  @SubscribeMessage('device:linked')
  handleDeviceLinked(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: {
      deviceId: string;
      name: string;
      type: 'WEB' | 'MOBILE' | 'DESKTOP';
    }
  ) {
    if (!client.userId) return;

    // Enregistrer le nouvel appareil
    if (!this.userDevices.has(client.userId)) {
      this.userDevices.set(client.userId, new Map());
    }
    this.userDevices
      .get(client.userId)!
      .set(payload.deviceId, client.id);

    // Notifier tous les appareils existants
    const userDevices = this.userDevices.get(client.userId);
    if (userDevices) {
      userDevices.forEach((socketId) => {
        if (socketId !== client.id) {
          this.server.to(socketId).emit('device:linked', {
            deviceId: payload.deviceId,
            name: payload.name,
            type: payload.type,
          });
        }
      });
    }

    console.log(
      `[MultiDevice] Device linked: user=${client.userId}, device=${payload.deviceId}, name=${payload.name}`
    );
  }

  /**
   * Notifier la révocation d'un appareil
   */
  @SubscribeMessage('device:revoked')
  handleDeviceRevoked(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: {
      deviceId: string;
    }
  ) {
    if (!client.userId) return;

    // Retirer l'appareil du tracking
    const userDevices = this.userDevices.get(client.userId);
    if (userDevices) {
      userDevices.delete(payload.deviceId);
    }

    // Notifier tous les appareils restants
    const devices = this.userDevices.get(client.userId);
    if (devices) {
      devices.forEach((socketId) => {
        this.server.to(socketId).emit('device:revoked', {
          deviceId: payload.deviceId,
        });
      });
    }

    console.log(
      `[MultiDevice] Device revoked: user=${client.userId}, device=${payload.deviceId}`
    );
  }

  /**
   * Heartbeat/Presence update depuis un appareil
   */
  @SubscribeMessage('device:heartbeat')
  handleDeviceHeartbeat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: {
      deviceId: string;
      lastSeenAt: number;
    }
  ) {
    if (!client.userId) return;

    // Mettre à jour le socket ID pour ce device
    if (!this.userDevices.has(client.userId)) {
      this.userDevices.set(client.userId, new Map());
    }
    this.userDevices
      .get(client.userId)!
      .set(payload.deviceId, client.id);

    // Diffuser la mise à jour à tous les appareils
    const userDevices = this.userDevices.get(client.userId);
    if (userDevices) {
      userDevices.forEach((socketId) => {
        if (socketId !== client.id) {
          this.server.to(socketId).emit('device:heartbeat', {
            deviceId: payload.deviceId,
            lastSeenAt: payload.lastSeenAt,
          });
        }
      });
    }
  }

  /**
   * Synchroniser le statut de l'utilisateur entre appareils
   * (ex: "typing", "recording", etc.)
   */
  @SubscribeMessage('presence:update')
  handlePresenceUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    payload: {
      conversationId: string;
      status: 'idle' | 'typing' | 'recording' | 'calling';
    }
  ) {
    if (!client.userId) return;

    // Envoyer à tous les appareils du même utilisateur
    const userDevices = this.userDevices.get(client.userId);
    if (userDevices) {
      userDevices.forEach((socketId, deviceId) => {
        if (socketId !== client.id) {
          this.server.to(socketId).emit('presence:update', {
            conversationId: payload.conversationId,
            status: payload.status,
            sourceDeviceId: client.deviceId || 'unknown',
          });
        }
      });
    }

    // Broadcast à la conversation pour les autres utilisateurs
    this.server.to(`conv:${payload.conversationId}`).emit('user:presence', {
      userId: client.userId,
      conversationId: payload.conversationId,
      status: payload.status,
    });
  }
}
