import http from 'k6/http';
import ws from 'k6/ws';
import { check, group, sleep } from 'k6';

/**
 * K6 Load Testing Script for Phase 10: Performance & Scalability
 * 
 * Tests:
 * - 100k concurrent WebSocket connections
 * - Message fan-out latency (p95 < 250ms)
 * - Memory and CPU under sustained load
 * 
 * Run: k6 run phase10-load-test.js --vus 100000 --duration 5m
 */

export const options = {
  stages: [
    { duration: '1m', target: 10000 }, // Ramp up to 10k users
    { duration: '2m', target: 100000 }, // Ramp up to 100k users
    { duration: '3m', target: 100000 }, // Stay at 100k
    { duration: '1m', target: 0 }, // Ramp down
  ],
  thresholds: {
    // WebSocket connection time < 500ms
    ws_connecting: ['p(95)<500'],
    // Message delivery latency p95 < 250ms
    'ws_message_latency{type:fan-out}': ['p(95)<250'],
    // Connection errors < 1%
    ws_errors: ['rate<0.01'],
    // HTTP request duration (auth) < 1s
    http_req_duration: ['p(95)<1000'],
  },
  ext: {
    // For gradual connection ramp-up to avoid overwhelming the server
    loadimpact: {
      name: 'Phase 10: Load Testing',
      projectID: 3491302,
      name: 'Secure Messenger - 100k WS Load Test',
    },
  },
};

// Global metrics
export const messageLatencies = [];
let connectedCount = 0;
let errorCount = 0;

/**
 * Test: Connect to WebSocket and maintain connection
 */
export default function () {
  const url = `ws://${__ENV.WS_HOST || 'localhost:3001'}/calls?token=${__ENV.JWT_TOKEN}`;
  const userId = `user-${__VU}-${__ITER}`;
  const deviceId = `device-${__VU}`;

  let wsConnected = false;
  const startTime = Date.now();

  const res = ws.connect(url, { tags: { name: 'MainWebSocket' } }, function (
    socket
  ) {
    wsConnected = true;
    connectedCount++;

    console.log(`[VU ${__VU}] Connected (total: ${connectedCount})`);

    // Listen for read-sync events
    socket.on('read-sync:update', (data) => {
      const latency = Date.now() - data.timestamp;
      messageLatencies.push(latency);

      check(latency, {
        'fan-out latency < 250ms': (l) => l < 250,
      });
    });

    // Listen for device events
    socket.on('device:linked', (data) => {
      console.log(
        `[VU ${__VU}] Device linked: ${data.deviceId}`
      );
    });

    // Send periodic heartbeats
    socket.on('open', () => {
      const heartbeatInterval = setInterval(() => {
        socket.send(
          JSON.stringify({
            type: 'ping',
            timestamp: Date.now(),
          })
        );
      }, 10000);

      // Simulate device events
      socket.emit('device:heartbeat', {
        deviceId,
        lastSeenAt: Date.now(),
      });

      // Simulate read-sync events (every 30 seconds)
      const syncInterval = setInterval(() => {
        socket.emit('read-sync:broadcast', {
          conversationId: `conv-${__VU}`,
          messageIds: Array.from({ length: 10 }, (_, i) => `msg-${i}`),
          timestamp: Date.now(),
        });
      }, 30000);

      socket.on('close', () => {
        clearInterval(heartbeatInterval);
        clearInterval(syncInterval);
      });
    });

    socket.on('error', (e) => {
      console.error(`[VU ${__VU}] WebSocket error: ${e}`);
      errorCount++;
    });

    // Keep connection open for test duration
    socket.on('message', (msg) => {
      // Handle incoming messages
    });

    // Simulate load: don't close immediately
    sleep(Math.random() * 60); // Random sleep 0-60s per VU
  });

  check(res, {
    'WebSocket connection status 101': (r) => r && r.status === 101,
    'Connected successfully': () => wsConnected,
  });
}

/**
 * Setup: Authenticate and get JWT token
 */
export function setup() {
  const authRes = http.post(
    `http://${__ENV.API_HOST || 'localhost:3001'}/auth/login`,
    JSON.stringify({
      email: 'test@example.com',
      password: 'test-password',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  check(authRes, {
    'auth status is 200': (r) => r.status === 200,
  });

  const token = authRes.json('access_token');
  return { token };
}

/**
 * Teardown: Report results
 */
export function teardown(data) {
  const avgLatency =
    messageLatencies.reduce((a, b) => a + b, 0) /
    (messageLatencies.length || 1);
  const p95Latency =
    messageLatencies.sort((a, b) => a - b)[
      Math.floor(messageLatencies.length * 0.95)
    ];
  const p99Latency =
    messageLatencies.sort((a, b) => a - b)[
      Math.floor(messageLatencies.length * 0.99)
    ];

  console.log(`
╔════════════════════════════════════════════════════════════╗
║         PHASE 10: LOAD TEST RESULTS                        ║
╠════════════════════════════════════════════════════════════╣
║ Total VUs (concurrent users): ${__VU}
║ Total Iterations: ${__ITER}
║ Connected: ${connectedCount}
║ Errors: ${errorCount}
║ Error Rate: ${((errorCount / (__VU * __ITER)) * 100).toFixed(2)}%
║
║ Message Fan-Out Latency:
║   Average: ${avgLatency.toFixed(2)}ms
║   p95: ${p95Latency?.toFixed(2) || 'N/A'}ms
║   p99: ${p99Latency?.toFixed(2) || 'N/A'}ms
║
║ Target (DoD):
║   - 100k connections: ${ connectedCount >= 100000 ? '✅ PASS' : '❌ FAIL'}
║   - p95 latency < 250ms: ${p95Latency < 250 ? '✅ PASS' : '❌ FAIL'}
╚════════════════════════════════════════════════════════════╝
  `);
}
