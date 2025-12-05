const fs = require('fs');
const path = require('path');

// Generate minimal valid GLB files with different sizes
// GLB format: 12-byte header + JSON chunk + (optional) BIN chunk

function createGLB(name, vertexCount) {
  // Create a simple JSON structure for glTF
  const gltfJson = {
    asset: { version: "2.0", generator: "Custom Generator" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0 },
        mode: 4
      }]
    }],
    accessors: [{
      bufferView: 0,
      componentType: 5126,
      count: vertexCount,
      type: "VEC3",
      max: [1, 1, 1],
      min: [-1, -1, -1]
    }],
    bufferViews: [{
      buffer: 0,
      byteOffset: 0,
      byteLength: vertexCount * 12
    }],
    buffers: [{
      byteLength: vertexCount * 12
    }]
  };

  const jsonString = JSON.stringify(gltfJson);
  const jsonBuffer = Buffer.from(jsonString);

  // Pad JSON to 4-byte alignment
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  const paddedJsonLength = jsonBuffer.length + jsonPadding;

  // Create binary buffer (vertex data)
  const binLength = vertexCount * 12; // 3 floats per vertex
  const binBuffer = Buffer.alloc(binLength);

  // Fill with simple vertex data
  for (let i = 0; i < vertexCount; i++) {
    const offset = i * 12;
    binBuffer.writeFloatLE(Math.cos(i) * 0.5, offset);
    binBuffer.writeFloatLE(Math.sin(i) * 0.5, offset + 4);
    binBuffer.writeFloatLE((i % 2) * 0.5 - 0.25, offset + 8);
  }

  // Pad binary to 4-byte alignment
  const binPadding = (4 - (binLength % 4)) % 4;
  const paddedBinLength = binLength + binPadding;

  // Calculate total length
  const totalLength = 12 + // GLB header
                     8 + paddedJsonLength + // JSON chunk header + data
                     8 + paddedBinLength;   // BIN chunk header + data

  // Create GLB file
  const glb = Buffer.alloc(totalLength);
  let offset = 0;

  // GLB Header
  glb.writeUInt32LE(0x46546C67, offset); offset += 4; // magic: "glTF"
  glb.writeUInt32LE(2, offset); offset += 4;          // version: 2
  glb.writeUInt32LE(totalLength, offset); offset += 4; // length

  // JSON Chunk
  glb.writeUInt32LE(paddedJsonLength, offset); offset += 4; // chunk length
  glb.writeUInt32LE(0x4E4F534A, offset); offset += 4;      // chunk type: "JSON"
  jsonBuffer.copy(glb, offset); offset += jsonBuffer.length;
  // Add padding spaces
  for (let i = 0; i < jsonPadding; i++) {
    glb.writeUInt8(0x20, offset); offset += 1;
  }

  // BIN Chunk
  glb.writeUInt32LE(paddedBinLength, offset); offset += 4; // chunk length
  glb.writeUInt32LE(0x004E4942, offset); offset += 4;     // chunk type: "BIN\0"
  binBuffer.copy(glb, offset); offset += binLength;
  // Add padding zeros
  for (let i = 0; i < binPadding; i++) {
    glb.writeUInt8(0x00, offset); offset += 1;
  }

  return glb;
}

// Generate models
const modelsDir = path.join(__dirname, '../public/models');

// Cube models
const cubeHighGLB = createGLB('cube-high', 24); // High detail: 24 vertices
const cubeLowGLB = createGLB('cube-low', 8);    // Low detail: 8 vertices

fs.writeFileSync(path.join(modelsDir, 'cube/high.glb'), cubeHighGLB);
fs.writeFileSync(path.join(modelsDir, 'cube/low.glb'), cubeLowGLB);

// Sphere models
const sphereHighGLB = createGLB('sphere-high', 64); // High detail: 64 vertices
const sphereLowGLB = createGLB('sphere-low', 16);   // Low detail: 16 vertices

fs.writeFileSync(path.join(modelsDir, 'sphere/high.glb'), sphereHighGLB);
fs.writeFileSync(path.join(modelsDir, 'sphere/low.glb'), sphereLowGLB);

console.log('Generated GLB models:');
console.log('  cube/high.glb:', cubeHighGLB.length, 'bytes');
console.log('  cube/low.glb:', cubeLowGLB.length, 'bytes');
console.log('  sphere/high.glb:', sphereHighGLB.length, 'bytes');
console.log('  sphere/low.glb:', sphereLowGLB.length, 'bytes');
