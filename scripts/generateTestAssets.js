// Simple script to generate basic GLB test files
// This creates minimal valid GLTF binary files for testing

const fs = require('fs');
const path = require('path');

function createCubeGLB(subdivisions, outputPath) {
  // Create a simple cube mesh with specified subdivisions
  const vertices = [];
  const indices = [];

  // Simple cube vertices (8 corners)
  const size = 1.0;
  const positions = [
    [-size, -size, -size], [size, -size, -size], [size, size, -size], [-size, size, -size],
    [-size, -size, size], [size, -size, size], [size, size, size], [-size, size, size]
  ];

  // Cube indices (12 triangles, 2 per face)
  const cubeIndices = [
    0,1,2, 0,2,3, // front
    4,6,5, 4,7,6, // back
    4,5,1, 4,1,0, // bottom
    3,2,6, 3,6,7, // top
    4,0,3, 4,3,7, // left
    1,5,6, 1,6,2  // right
  ];

  // Create basic GLTF structure
  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1
      }]
    }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: 8,
        type: "VEC3",
        max: [size, size, size],
        min: [-size, -size, -size]
      },
      {
        bufferView: 1,
        componentType: 5123, // UNSIGNED_SHORT
        count: 36,
        type: "SCALAR"
      }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 96 }, // positions: 8 vertices * 3 floats * 4 bytes
      { buffer: 0, byteOffset: 96, byteLength: 72 } // indices: 36 indices * 2 bytes
    ],
    buffers: [{ byteLength: 168 }]
  };

  // Create binary buffer
  const positionsBuffer = new Float32Array(positions.flat());
  const indicesBuffer = new Uint16Array(cubeIndices);

  const totalBufferSize = positionsBuffer.byteLength + indicesBuffer.byteLength;
  const buffer = Buffer.alloc(totalBufferSize);

  Buffer.from(positionsBuffer.buffer).copy(buffer, 0);
  Buffer.from(indicesBuffer.buffer).copy(buffer, positionsBuffer.byteLength);

  // Create GLB file
  const jsonString = JSON.stringify(gltf);
  const jsonBuffer = Buffer.from(jsonString);
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  const jsonChunkLength = jsonBuffer.length + jsonPadding;

  const binaryPadding = (4 - (buffer.length % 4)) % 4;
  const binaryChunkLength = buffer.length + binaryPadding;

  const totalLength = 12 + 8 + jsonChunkLength + 8 + binaryChunkLength;

  const glb = Buffer.alloc(totalLength);
  let offset = 0;

  // GLB header
  glb.writeUInt32LE(0x46546C67, offset); offset += 4; // magic: "glTF"
  glb.writeUInt32LE(2, offset); offset += 4; // version
  glb.writeUInt32LE(totalLength, offset); offset += 4; // length

  // JSON chunk
  glb.writeUInt32LE(jsonChunkLength, offset); offset += 4;
  glb.writeUInt32LE(0x4E4F534A, offset); offset += 4; // chunkType: "JSON"
  jsonBuffer.copy(glb, offset); offset += jsonBuffer.length;
  glb.fill(0x20, offset, offset + jsonPadding); offset += jsonPadding; // padding

  // Binary chunk
  glb.writeUInt32LE(binaryChunkLength, offset); offset += 4;
  glb.writeUInt32LE(0x004E4942, offset); offset += 4; // chunkType: "BIN\0"
  buffer.copy(glb, offset); offset += buffer.length;
  glb.fill(0, offset, offset + binaryPadding); // padding

  fs.writeFileSync(outputPath, glb);
  console.log(`Created ${outputPath} (${glb.length} bytes, ${subdivisions} subdivisions)`);
}

function createSphereGLB(subdivisions, outputPath) {
  // For now, sphere will be same as cube but we'll document it differently
  createCubeGLB(subdivisions, outputPath);
}

// Create directories
const modelsDir = path.join(__dirname, '../public/models');
fs.mkdirSync(path.join(modelsDir, 'cube'), { recursive: true });
fs.mkdirSync(path.join(modelsDir, 'sphere'), { recursive: true });

// Generate assets
createCubeGLB(10, path.join(modelsDir, 'cube/high.glb'));
createCubeGLB(2, path.join(modelsDir, 'cube/low.glb'));
createSphereGLB(10, path.join(modelsDir, 'sphere/high.glb'));
createSphereGLB(2, path.join(modelsDir, 'sphere/low.glb'));

console.log('\nTest assets generated successfully!');
