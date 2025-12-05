#!/usr/bin/env node

/**
 * Test script for LOD generation
 * This script demonstrates uploading a high-quality asset and automatically
 * generating multiple LOD levels
 */

const fs = require('fs').promises;
const path = require('path');
const http = require('http');

const SERVER_URL = 'http://localhost:3000';

/**
 * Upload a GLB file to the server
 */
async function uploadAsset(assetId, glbPath) {
  console.log(`\n=== Testing LOD Generation ===`);
  console.log(`Asset ID: ${assetId}`);
  console.log(`Source file: ${glbPath}`);

  // Read the GLB file
  const glbBuffer = await fs.readFile(glbPath);
  console.log(`File size: ${glbBuffer.length} bytes`);

  // Upload to server
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/assets/upload?assetId=${encodeURIComponent(assetId)}`,
      method: 'POST',
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Length': glbBuffer.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          const result = JSON.parse(data);
          console.log(`\n✓ Upload successful!`);
          console.log(`  Generated LOD levels: ${result.lodLevels.join(', ')}`);
          console.log(`  LOD sizes:`);
          for (const [level, size] of Object.entries(result.sizes)) {
            console.log(`    ${level}: ${size} bytes`);
          }
          resolve(result);
        } else {
          reject(new Error(`Upload failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(glbBuffer);
    req.end();
  });
}

/**
 * List all assets on the server
 */
async function listAssets() {
  return new Promise((resolve, reject) => {
    http.get(`${SERVER_URL}/api/assets`, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          const result = JSON.parse(data);
          console.log(`\n=== Available Assets ===`);
          result.assets.forEach(asset => {
            console.log(`  ${asset.id}: ${asset.lods.join(', ')}`);
          });
          resolve(result);
        } else {
          reject(new Error(`Failed to list assets: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Get info about a specific asset
 */
async function getAssetInfo(assetId) {
  return new Promise((resolve, reject) => {
    http.get(`${SERVER_URL}/api/assets/${assetId}`, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          const result = JSON.parse(data);
          console.log(`\n=== Asset Info: ${assetId} ===`);
          console.log(`  LOD levels: ${result.lods.join(', ')}`);
          console.log(`  Sizes:`);
          for (const [level, size] of Object.entries(result.sizes)) {
            const percent = result.sizes.high ? ((size / result.sizes.high) * 100).toFixed(1) : '100.0';
            console.log(`    ${level}: ${size} bytes (${percent}% of high)`);
          }
          resolve(result);
        } else {
          reject(new Error(`Failed to get asset info: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Main test function
 */
async function main() {
  try {
    // Test with existing cube asset
    const cubeHighPath = path.join(__dirname, '../public/models/cube/high.glb');

    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║   Phase 7: Dynamic LOD Generation Test    ║');
    console.log('╚════════════════════════════════════════════╝');

    // Test 1: Upload a new asset
    console.log('\n[Test 1] Uploading high-quality asset...');
    await uploadAsset('test-cube', cubeHighPath);

    // Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 2: List all assets
    console.log('\n[Test 2] Listing all assets...');
    await listAssets();

    // Test 3: Get detailed asset info
    console.log('\n[Test 3] Getting asset details...');
    await getAssetInfo('test-cube');

    // Test 4: Try uploading the same asset again (should use cache)
    console.log('\n[Test 4] Re-uploading same asset (should use cache)...');
    await uploadAsset('test-cube-cached', cubeHighPath);

    // Test 5: List assets again
    console.log('\n[Test 5] Final asset list...');
    await listAssets();

    console.log('\n✓ All tests completed successfully!');
    console.log('\nYou can now:');
    console.log('  1. Open http://localhost:3000 in your browser');
    console.log('  2. The client will automatically load assets with adaptive LOD');
    console.log('  3. Check cache/lods/ directory for generated LOD files');

  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error('\nMake sure the server is running:');
    console.error('  npm start');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  main();
}

module.exports = { uploadAsset, listAssets, getAssetInfo };
