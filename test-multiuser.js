#!/usr/bin/env node

/**
 * Multi-user connection simulator for StreamXR
 * Simulates N clients connecting and sending head tracking data
 */

const WebSocket = require('ws');

const SERVER_URL = process.env.SERVER_URL || 'wss://streamxr.brad-dougherty.com';
const NUM_CLIENTS = parseInt(process.env.NUM_CLIENTS) || 4;
const UPDATE_INTERVAL = 100; // ms between head tracking updates

class SimulatedClient {
  constructor(id) {
    this.id = id;
    this.ws = null;
    this.position = [Math.random() * 10 - 5, Math.random() * 2, Math.random() * 10 - 5];
    this.rotation = [0, Math.random() * Math.PI * 2, 0];
    this.connected = false;
  }

  connect() {
    console.log(`[Client ${this.id}] Connecting to ${SERVER_URL}...`);
    this.ws = new WebSocket(SERVER_URL);

    this.ws.on('open', () => {
      this.connected = true;
      console.log(`[Client ${this.id}] ✓ Connected`);
      this.startHeadTracking();
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'user-joined' || msg.type === 'user-left') {
          console.log(`[Client ${this.id}] ${msg.type}: ${msg.userId}`);
        }
      } catch (e) {
        // Binary data, ignore
      }
    });

    this.ws.on('error', (error) => {
      console.error(`[Client ${this.id}] ✗ Error:`, error.message);
    });

    this.ws.on('close', () => {
      this.connected = false;
      console.log(`[Client ${this.id}] Disconnected`);
    });
  }

  startHeadTracking() {
    this.trackingInterval = setInterval(() => {
      if (!this.connected || this.ws.readyState !== WebSocket.OPEN) {
        clearInterval(this.trackingInterval);
        return;
      }

      // Simulate slight head movement
      this.rotation[1] += (Math.random() - 0.5) * 0.1;

      const headTrackingData = {
        type: 'head-tracking',
        position: this.position,
        rotation: this.rotation,
        quaternion: [0, 0, 0, 1],
        timestamp: Date.now()
      };

      this.ws.send(JSON.stringify(headTrackingData));
    }, UPDATE_INTERVAL);
  }

  disconnect() {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Main
console.log(`\n🚀 StreamXR Multi-User Connection Simulator`);
console.log(`Server: ${SERVER_URL}`);
console.log(`Clients: ${NUM_CLIENTS}\n`);

const clients = [];

// Connect all clients with slight delay
for (let i = 0; i < NUM_CLIENTS; i++) {
  setTimeout(() => {
    const client = new SimulatedClient(i + 1);
    clients.push(client);
    client.connect();
  }, i * 500); // Stagger connections by 500ms
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n📊 Disconnecting all clients...');
  clients.forEach(client => client.disconnect());
  setTimeout(() => {
    console.log('✓ All clients disconnected\n');
    process.exit(0);
  }, 1000);
});

// Keep alive
console.log('Press Ctrl+C to disconnect all clients and exit\n');
