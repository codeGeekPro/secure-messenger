import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface CallSession {
  id: string;
  conversationId: string;
  initiatorId: string;
  recipientId: string;
  type: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended';
  startedAt?: Date;
  endedAt?: Date;
}

/**
 * Service de gestion des appels audio/vidéo
 */
@Injectable()
export class CallsService {
  private activeCalls = new Map<string, CallSession>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initie un nouvel appel
   */
  async initiateCall(
    conversationId: string,
    initiatorId: string,
    recipientId: string,
    type: 'audio' | 'video'
  ): Promise<CallSession> {
    const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const session: CallSession = {
      id: callId,
      conversationId,
      initiatorId,
      recipientId,
      type,
      status: 'ringing',
    };

    this.activeCalls.set(callId, session);

    // TODO: Stocker dans BDD pour historique
    // await this.prisma.call.create({ data: { ... } });

    return session;
  }

  /**
   * Accepte un appel en cours
   */
  async acceptCall(callId: string): Promise<CallSession | null> {
    const session = this.activeCalls.get(callId);
    if (!session) return null;

    session.status = 'active';
    session.startedAt = new Date();

    return session;
  }

  /**
   * Termine un appel
   */
  async endCall(callId: string): Promise<CallSession | null> {
    const session = this.activeCalls.get(callId);
    if (!session) return null;

    session.status = 'ended';
    session.endedAt = new Date();

    this.activeCalls.delete(callId);

    // TODO: Mettre à jour BDD avec durée, qualité, etc.

    return session;
  }

  /**
   * Récupère une session d'appel active
   */
  getActiveCall(callId: string): CallSession | null {
    return this.activeCalls.get(callId) || null;
  }

  /**
   * Liste les appels actifs d'un utilisateur
   */
  getUserActiveCalls(userId: string): CallSession[] {
    return Array.from(this.activeCalls.values()).filter(
      (call) =>
        (call.initiatorId === userId || call.recipientId === userId) &&
        call.status !== 'ended'
    );
  }
}
