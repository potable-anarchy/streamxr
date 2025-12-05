/**
 * Test script for foveated streaming functionality
 */

const FoveatedStreamingManager = require('./lib/foveatedStreaming');

const foveated = new FoveatedStreamingManager();

console.log('\n=== Foveated Streaming Test ===\n');

// Test 1: Object directly in front (should be high LOD)
console.log('Test 1: Object directly in front of viewer');
foveated.updateClientView('client1', {
  position: [0, 0, 0],
  rotation: [0, 0, 0],  // Looking forward (-Z direction)
  quaternion: [0, 0, 0, 1],
  fov: 75
});

const result1 = foveated.getAssetLOD('client1', 'cube', [0, 0, -5]);
console.log(`  Position: [0, 0, -5]`);
console.log(`  Result: LOD=${result1.lod}, shouldStream=${result1.shouldStream}`);
console.log(`  Expected: LOD=high (object is directly in front)\n`);

// Test 2: Object to the side (should be low LOD or skip)
console.log('Test 2: Object 45 degrees to the side');
const result2 = foveated.getAssetLOD('client1', 'cube', [5, 0, -5]);
console.log(`  Position: [5, 0, -5]`);
console.log(`  Result: LOD=${result2.lod}, shouldStream=${result2.shouldStream}`);
console.log(`  Expected: LOD=low (object in periphery)\n`);

// Test 3: Object behind viewer (should skip)
console.log('Test 3: Object behind viewer');
const result3 = foveated.getAssetLOD('client1', 'cube', [0, 0, 5]);
console.log(`  Position: [0, 0, 5]`);
console.log(`  Result: LOD=${result3.lod}, shouldStream=${result3.shouldStream}`);
console.log(`  Expected: LOD=skip (object is behind)\n`);

// Test 4: Viewer rotated 90 degrees, object to original front
console.log('Test 4: Viewer rotated 90° left, object at original front');
foveated.updateClientView('client1', {
  position: [0, 0, 0],
  rotation: [0, Math.PI / 2, 0],  // Rotated 90° to the left
  quaternion: [0, 0.7071, 0, 0.7071],
  fov: 75
});

const result4 = foveated.getAssetLOD('client1', 'cube', [0, 0, -5]);
console.log(`  Viewer rotation: 90° left`);
console.log(`  Object position: [0, 0, -5]`);
console.log(`  Result: LOD=${result4.lod}, shouldStream=${result4.shouldStream}`);
console.log(`  Expected: LOD=skip (object is now to the right side)\n`);

// Test 5: Object in new front direction after rotation
console.log('Test 5: Object in front after 90° rotation');
const result5 = foveated.getAssetLOD('client1', 'cube', [5, 0, 0]);
console.log(`  Viewer rotation: 90° left`);
console.log(`  Object position: [5, 0, 0]`);
console.log(`  Result: LOD=${result5.lod}, shouldStream=${result5.shouldStream}`);
console.log(`  Expected: LOD=high (object is now in front)\n`);

// Test 6: View frustum calculation stats
console.log('Test 6: Statistics');
const stats = foveated.getStats();
console.log(`  Active clients: ${stats.activeClients}`);
console.log(`  Scene objects: ${stats.sceneObjects}`);
console.log(`  Foveal zone: ±${stats.zones.FOVEAL}°`);
console.log(`  Peripheral zone: ±${stats.zones.PERIPHERAL}°`);
console.log(`  Far peripheral zone: ±${stats.zones.FAR_PERIPHERAL}°\n`);

console.log('=== Tests Complete ===\n');
