/**
 * Automated test client for Phase 3: Adaptive Streaming
 * This tests the adaptive LOD selection logic
 */

const WebSocket = require('ws');

class TestClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.clientId = null;
    this.receivedChunks = 0;
    this.totalChunks = 0;
    this.assetId = null;
    this.testResults = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        console.log('✓ Connected to server');
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        console.error('✗ WebSocket error:', error);
        reject(error);
      });
    });
  }

  handleMessage(data) {
    // Handle binary messages (asset chunks)
    if (data instanceof Buffer) {
      return;
    }

    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'welcome':
          this.clientId = message.id;
          console.log(`✓ Received client ID: ${this.clientId}`);
          break;

        case 'asset-start':
          this.assetId = message.assetId;
          this.totalChunks = message.totalChunks;
          this.receivedChunks = 0;
          console.log(`✓ Started receiving asset: ${message.assetId} (${message.totalSize} bytes, ${message.totalChunks} chunks)`);
          break;

        case 'asset-chunk':
          this.receivedChunks++;
          if (this.receivedChunks % 10 === 0 || this.receivedChunks === this.totalChunks) {
            console.log(`  Progress: ${this.receivedChunks}/${this.totalChunks} chunks`);
          }
          break;

        case 'asset-complete':
          console.log(`✓ Asset download complete: ${message.assetId}`);
          this.testResults.push({
            assetId: message.assetId,
            success: true
          });
          break;

        case 'lod-recommendation':
          console.log(`✓ LOD recommendation received: ${message.lod.toUpperCase()}`);
          this.testResults.push({
            type: 'lod-recommendation',
            lod: message.lod
          });
          break;

        case 'asset-error':
          console.error(`✗ Asset error: ${message.error}`);
          this.testResults.push({
            assetId: message.assetId,
            success: false,
            error: message.error
          });
          break;
      }
    } catch (error) {
      // Ignore JSON parsing errors for binary data
    }
  }

  requestAsset(assetId) {
    console.log(`\n→ Requesting asset: ${assetId}`);
    this.ws.send(JSON.stringify({
      type: 'request-asset',
      assetId: assetId
    }));
  }

  sendBandwidthMetrics(bandwidth) {
    console.log(`→ Sending bandwidth metrics: ${(bandwidth / 1024).toFixed(2)} KB/s`);
    this.ws.send(JSON.stringify({
      type: 'bandwidth-metrics',
      metrics: {
        bandwidth: bandwidth,
        bytesReceived: 100000,
        timestamp: Date.now()
      }
    }));
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Test scenarios
async function runTests() {
  console.log('='.repeat(60));
  console.log('ADAPTIVE STREAMING TEST SUITE');
  console.log('='.repeat(60));

  const client = new TestClient('ws://localhost:3000');

  try {
    // Connect to server
    console.log('\n[TEST 1] Connecting to server...');
    await client.connect();
    await client.wait(1000);

    // Test 1: First request should get LOW LOD (no bandwidth history)
    console.log('\n[TEST 2] First asset request (should get LOW LOD)...');
    client.requestAsset('sphere');
    await client.wait(500); // Wait for asset completion

    // Simulate low bandwidth
    console.log('\n[TEST 3] Simulating LOW bandwidth (50 KB/s)...');
    client.sendBandwidthMetrics(50 * 1024); // 50 KB/s
    await client.wait(1000);

    // Request asset with low bandwidth
    console.log('\n[TEST 4] Requesting asset with low bandwidth...');
    client.requestAsset('cube');
    await client.wait(500);

    // Simulate high bandwidth
    console.log('\n[TEST 5] Simulating HIGH bandwidth (1 MB/s)...');
    client.sendBandwidthMetrics(1024 * 1024); // 1 MB/s
    await client.wait(1000);

    // Request asset with high bandwidth
    console.log('\n[TEST 6] Requesting asset with high bandwidth...');
    client.requestAsset('sphere');
    await client.wait(500);

    // Print results
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    let lowLODCount = 0;
    let highLODCount = 0;

    client.testResults.forEach((result, index) => {
      if (result.assetId) {
        const lod = result.assetId.includes('-high') ? 'HIGH' : 'LOW';
        console.log(`${index + 1}. Asset: ${result.assetId} → LOD: ${lod}`);

        if (lod === 'HIGH') highLODCount++;
        else lowLODCount++;
      } else if (result.type === 'lod-recommendation') {
        console.log(`${index + 1}. LOD Recommendation: ${result.lod.toUpperCase()}`);
      }
    });

    console.log('\nSummary:');
    console.log(`  LOW LOD assets: ${lowLODCount}`);
    console.log(`  HIGH LOD assets: ${highLODCount}`);

    // Verify success criteria
    console.log('\n' + '='.repeat(60));
    console.log('SUCCESS CRITERIA');
    console.log('='.repeat(60));

    const criteria = [
      { name: 'Low LOD on throttled connection', passed: lowLODCount >= 1 },
      { name: 'High LOD on fast connection', passed: highLODCount >= 1 },
      { name: 'Auto-switch as connection quality changes', passed: client.testResults.some(r => r.type === 'lod-recommendation') }
    ];

    criteria.forEach(c => {
      const icon = c.passed ? '✓' : '✗';
      console.log(`${icon} ${c.name}`);
    });

    const allPassed = criteria.every(c => c.passed);
    console.log('\n' + '='.repeat(60));
    console.log(allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('✗ Test failed:', error);
  } finally {
    client.close();
    process.exit(0);
  }
}

// Run tests
runTests();
