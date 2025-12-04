import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * Service de gestion des messages éphémères (auto-suppression)
 */
@Injectable()
export class EphemeralService {
  private timers = new Map<string, NodeJS.Timeout>();
  private gatewayRef: any; // MessagesGateway injection circulaire évitée

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Injecte la référence au gateway pour broadcaster events
   */
  setGatewayRef(gateway: any) {
    this.gatewayRef = gateway;
  }

  /**
   * Définit un message comme éphémère avec TTL
   */
  async setEphemeral(messageId: string, ttlSeconds: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.prisma.message.update({
      where: { id: messageId },
      data: { expiresAt },
    });

    // Programmer la suppression auto
    this.scheduleDelete(messageId, ttlSeconds);
  }

  /**
   * Programme la suppression automatique d'un message
   */
  private scheduleDelete(messageId: string, ttlSeconds: number): void {
    // Annuler timer existant si présent
    if (this.timers.has(messageId)) {
      clearTimeout(this.timers.get(messageId));
    }

    const timer = setTimeout(async () => {
      await this.deleteMessage(messageId);
      this.timers.delete(messageId);
    }, ttlSeconds * 1000);

    this.timers.set(messageId, timer);
  }

  /**
   * Supprime un message éphémère expiré
   */
  private async deleteMessage(messageId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });

    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        ciphertext: Buffer.from(''), // Effacer contenu
      },
    });

    console.log(`[Ephemeral] Message ${messageId} auto-deleted`);

    // Broadcaster expiration aux clients connectés
    if (this.gatewayRef && message) {
      this.gatewayRef.broadcastMessageExpired(message.conversationId, messageId);
    }
  }

  /**
   * Restaure les timers de suppression au démarrage
   */
  async restoreTimers(): Promise<void> {
    const ephemeralMessages = await this.prisma.message.findMany({
      where: {
        expiresAt: {
          not: null,
          gt: new Date(),
        },
        deletedAt: null,
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });

    for (const message of ephemeralMessages) {
      const remainingTtl = Math.max(
        0,
        Math.floor(((message.expiresAt || new Date()).getTime() - Date.now()) / 1000)
      );

      if (remainingTtl > 0) {
        this.scheduleDelete(message.id, remainingTtl);
      } else {
        // Expiré pendant l'arrêt, supprimer immédiatement
        await this.deleteMessage(message.id);
      }
    }

    console.log(`[Ephemeral] Restored ${ephemeralMessages.length} timers`);
  }

  /**
   * Annule le timer d'un message éphémère
   */
  cancelTimer(messageId: string): void {
    const timer = this.timers.get(messageId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(messageId);
    }
  }

  /**
   * Temps restant avant expiration
   */
  async getTimeRemaining(messageId: string): Promise<number | null> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { expiresAt: true },
    });

    if (!message?.expiresAt) return null;

    const remaining = Math.max(
      0,
      Math.floor((message.expiresAt.getTime() - Date.now()) / 1000)
    );

    return remaining;
  }
}
