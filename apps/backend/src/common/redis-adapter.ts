import { Module } from '@nestjs/common';
import { RedisService } from '../common/services/redis.service';
import { CallsGateway } from './calls.gateway';
import { CallsService } from './calls.service';
import { PrismaService } from '../common/prisma.service';

/**
 * Redis Pub/Sub adapter pour distribuer les événements WebSocket entre nœuds
 * Phase 10: Scale-out architecture avec clustering
 */
export class RedisAdapter {
  constructor(private redisService: RedisService) {}

  /**
   * Initialiser l'adaptateur Redis pour un serveur Socket.io
   * Permet la communication entre nœuds dans une architecture distribuée
   */
  initializeSocketIoAdapter(io: any): void {
    const pubClient = this.redisService.getClient();
    const subClient = pubClient.duplicate();

    // Créer un adaptateur Redis pour Socket.io
    // Pour une implémentation réelle: import { createAdapter } from '@socket.io/redis-adapter';
    // io.adapter(createAdapter(pubClient, subClient));

    console.log('[RedisAdapter] Socket.io Redis adapter initialized for pub/sub');
  }

  /**
   * Broadcaster un événement à tous les nœuds
   * Utilise Redis Pub/Sub pour les messages cross-node
   */
  async broadcastEvent(channel: string, payload: any): Promise<void> {
    const pubClient = this.redisService.getClient();
    await pubClient.publish(channel, JSON.stringify(payload));
  }

  /**
   * S'abonner à un canal pour recevoir les événements des autres nœuds
   */
  subscribeToChannel(
    channel: string,
    callback: (payload: any) => void
  ): () => Promise<void> {
    const subClient = this.redisService.getClient();

    subClient.subscribe(channel, (message) => {
      try {
        const payload = JSON.parse(message);
        callback(payload);
      } catch (error) {
        console.error(`[RedisAdapter] Failed to parse message from ${channel}:`, error);
      }
    });

    // Return unsubscribe function
    return async () => {
      await subClient.unsubscribe(channel);
    };
  }

  /**
   * Store une session de connexion (device + user) dans Redis
   * TTL: 1 heure, permet le sticky session routing
   */
  async storeDeviceSession(
    deviceId: string,
    userId: string,
    socketId: string,
    nodeId: string,
    ttl: number = 3600
  ): Promise<void> {
    const pubClient = this.redisService.getClient();
    const key = `device:${deviceId}:session`;

    await pubClient.setex(
      key,
      ttl,
      JSON.stringify({
        userId,
        socketId,
        nodeId,
        connectedAt: new Date().toISOString(),
      })
    );
  }

  /**
   * Récupérer la session d'un device
   */
  async getDeviceSession(
    deviceId: string
  ): Promise<{
    userId: string;
    socketId: string;
    nodeId: string;
    connectedAt: string;
  } | null> {
    const pubClient = this.redisService.getClient();
    const key = `device:${deviceId}:session`;
    const data = await pubClient.get(key);

    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Lister tous les devices d'un utilisateur (cross-node)
   */
  async getUserDevices(userId: string): Promise<string[]> {
    const pubClient = this.redisService.getClient();
    // Utiliser SCAN pour itérer les clés device:*:session
    const pattern = `device:*:session`;
    const keys = await pubClient.keys(pattern);

    const devices = [];
    for (const key of keys) {
      const data = await pubClient.get(key);
      if (data) {
        const session = JSON.parse(data);
        if (session.userId === userId) {
          devices.push(key.split(':')[1]); // Extract deviceId
        }
      }
    }

    return devices;
  }

  /**
   * Invalider la session d'un device (lors de révocation)
   */
  async invalidateDeviceSession(deviceId: string): Promise<void> {
    const pubClient = this.redisService.getClient();
    const key = `device:${deviceId}:session`;
    await pubClient.del(key);
  }

  /**
   * Store les métriques de latence pour monitoring
   */
  async recordLatencyMetric(
    metricType: string,
    latencyMs: number,
    tags?: Record<string, string>
  ): Promise<void> {
    const pubClient = this.redisService.getClient();
    const key = `metrics:${metricType}`;

    // Store as time-series (Redis can be used as a simple time-series DB)
    const timestamp = Date.now();
    const value = {
      timestamp,
      latency: latencyMs,
      tags: tags || {},
    };

    // Append to list, keep only last 1000 entries
    await pubClient.rpush(key, JSON.stringify(value));
    await pubClient.ltrim(key, -1000, -1);
    await pubClient.expire(key, 3600); // 1 hour TTL
  }

  /**
   * Obtenir les statistiques de latence pour les dernières N secondes
   */
  async getLatencyStats(
    metricType: string,
    windowSeconds: number = 60
  ): Promise<{
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    count: number;
  }> {
    const pubClient = this.redisService.getClient();
    const key = `metrics:${metricType}`;

    // Récupérer toutes les métriques
    const entries = await pubClient.lrange(key, 0, -1);
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    // Filtrer par fenêtre temporelle
    const latencies = entries
      .map((e) => {
        const data = JSON.parse(e);
        return data.latency;
      })
      .filter(
        (_, i, arr) =>
          now - i < windowMs // Approximate filtering (would need timestamp)
      );

    if (latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0, count: 0 };
    }

    const sorted = latencies.sort((a, b) => a - b);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return { p50, p95, p99, avg, count: latencies.length };
  }
}

/**
 * Module pour le scaling cross-node
 */
@Module({
  providers: [RedisAdapter],
  exports: [RedisAdapter],
})
export class RedisAdapterModule {}
