import { Injectable } from '@nestjs/common';
import * as prometheus from 'prom-client';

/**
 * Service de monitoring Prometheus pour Phase 10: Performance & Scalability
 * 
 * Métriques:
 * - WebSocket connections count
 * - Message fan-out latency (p50, p95, p99)
 * - Database query duration
 * - Redis cache hit/miss rate
 * - CPU/Memory usage
 * - Error rates by type
 */
@Injectable()
export class PrometheusService {
  private register: prometheus.Registry;

  // Counters
  private wsConnectionsCreated: prometheus.Counter;
  private wsConnectionsClosed: prometheus.Counter;
  private messagesReceived: prometheus.Counter;
  private messagesSent: prometheus.Counter;
  private errorsTotal: prometheus.Counter;

  // Gauges
  private wsConnectionsActive: prometheus.Gauge;
  private queueSize: prometheus.Gauge;
  private memoryUsage: prometheus.Gauge;
  private cpuUsage: prometheus.Gauge;

  // Histograms
  private messageFanOutLatency: prometheus.Histogram;
  private databaseQueryDuration: prometheus.Histogram;
  private encryptionDuration: prometheus.Histogram;

  constructor() {
    // Create custom registry
    this.register = new prometheus.Registry();

    // Default metrics (CPU, memory, etc.)
    prometheus.collectDefaultMetrics({ register: this.register });

    // Initialize counters
    this.wsConnectionsCreated = new prometheus.Counter({
      name: 'ws_connections_created_total',
      help: 'Total WebSocket connections created',
      labelNames: ['device_type'],
      registers: [this.register],
    });

    this.wsConnectionsClosed = new prometheus.Counter({
      name: 'ws_connections_closed_total',
      help: 'Total WebSocket connections closed',
      labelNames: ['reason'],
      registers: [this.register],
    });

    this.messagesReceived = new prometheus.Counter({
      name: 'messages_received_total',
      help: 'Total messages received',
      labelNames: ['type'],
      registers: [this.register],
    });

    this.messagesSent = new prometheus.Counter({
      name: 'messages_sent_total',
      help: 'Total messages sent',
      labelNames: ['type'],
      registers: [this.register],
    });

    this.errorsTotal = new prometheus.Counter({
      name: 'errors_total',
      help: 'Total errors',
      labelNames: ['type', 'endpoint'],
      registers: [this.register],
    });

    // Initialize gauges
    this.wsConnectionsActive = new prometheus.Gauge({
      name: 'ws_connections_active',
      help: 'Active WebSocket connections',
      labelNames: ['node_id'],
      registers: [this.register],
    });

    this.queueSize = new prometheus.Gauge({
      name: 'message_queue_size',
      help: 'Message queue size',
      registers: [this.register],
    });

    this.memoryUsage = new prometheus.Gauge({
      name: 'memory_usage_bytes',
      help: 'Memory usage in bytes',
      registers: [this.register],
    });

    this.cpuUsage = new prometheus.Gauge({
      name: 'cpu_usage_percent',
      help: 'CPU usage percentage',
      registers: [this.register],
    });

    // Initialize histograms
    this.messageFanOutLatency = new prometheus.Histogram({
      name: 'message_fan_out_latency_ms',
      help: 'Message fan-out latency in milliseconds',
      labelNames: ['device_count'],
      buckets: [50, 100, 150, 200, 250, 300, 400, 500],
      registers: [this.register],
    });

    this.databaseQueryDuration = new prometheus.Histogram({
      name: 'database_query_duration_ms',
      help: 'Database query duration in milliseconds',
      labelNames: ['operation'],
      buckets: [10, 50, 100, 200, 500, 1000],
      registers: [this.register],
    });

    this.encryptionDuration = new prometheus.Histogram({
      name: 'encryption_duration_ms',
      help: 'Encryption operation duration in milliseconds',
      labelNames: ['operation'],
      buckets: [1, 5, 10, 20, 50, 100],
      registers: [this.register],
    });
  }

  // ============================================================================
  // Counter Operations
  // ============================================================================

  incrementWsConnections(deviceType: string = 'unknown'): void {
    this.wsConnectionsCreated.inc({ device_type: deviceType });
  }

  decrementWsConnections(reason: string = 'unknown'): void {
    this.wsConnectionsClosed.inc({ reason });
  }

  incrementMessagesReceived(type: string = 'unknown'): void {
    this.messagesReceived.inc({ type });
  }

  incrementMessagesSent(type: string = 'unknown'): void {
    this.messagesSent.inc({ type });
  }

  incrementErrors(type: string, endpoint: string = 'unknown'): void {
    this.errorsTotal.inc({ type, endpoint });
  }

  // ============================================================================
  // Gauge Operations
  // ============================================================================

  setActiveConnections(count: number, nodeId: string = 'default'): void {
    this.wsConnectionsActive.set({ node_id: nodeId }, count);
  }

  setQueueSize(size: number): void {
    this.queueSize.set(size);
  }

  setMemoryUsage(bytes: number): void {
    this.memoryUsage.set(bytes);
  }

  setCpuUsage(percent: number): void {
    this.cpuUsage.set(percent);
  }

  // ============================================================================
  // Histogram Operations
  // ============================================================================

  recordFanOutLatency(latencyMs: number, deviceCount: number = 1): void {
    this.messageFanOutLatency.observe(
      { device_count: deviceCount.toString() },
      latencyMs
    );
  }

  recordDatabaseQueryDuration(
    latencyMs: number,
    operation: string = 'unknown'
  ): void {
    this.databaseQueryDuration.observe(
      { operation },
      latencyMs
    );
  }

  recordEncryptionDuration(
    latencyMs: number,
    operation: string = 'unknown'
  ): void {
    this.encryptionDuration.observe(
      { operation },
      latencyMs
    );
  }

  // ============================================================================
  // Monitoring
  // ============================================================================

  /**
   * Get current metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  /**
   * Get content type for Prometheus metrics endpoint
   */
  getContentType(): string {
    return this.register.contentType;
  }

  /**
   * Start monitoring system resources
   */
  startSystemMonitoring(interval: number = 5000): NodeJS.Timer {
    return setInterval(() => {
      const memUsage = process.memoryUsage();
      this.setMemoryUsage(memUsage.heapUsed);

      // CPU usage (simplified)
      const cpuUsage = process.cpuUsage();
      const totalCpuMs = (cpuUsage.user + cpuUsage.system) / 1000;
      this.setCpuUsage(Math.min(totalCpuMs, 100));
    }, interval);
  }
}
