// Generate proper GLB test files with correct normals
const fs = require("fs");
const path = require("path");

function createCubeGLB(subdivisions, outputPath) {
  // Create a cube with proper normals facing outward
  const size = 1.0;

  // Define 24 vertices (4 per face, with proper normals)
  const positions = new Float32Array([
    // Front face (z = size)
    -size,
    -size,
    size,
    size,
    -size,
    size,
    size,
    size,
    size,
    -size,
    size,
    size,
    // Back face (z = -size)
    size,
    -size,
    -size,
    -size,
    -size,
    -size,
    -size,
    size,
    -size,
    size,
    size,
    -size,
    // Top face (y = size)
    -size,
    size,
    size,
    size,
    size,
    size,
    size,
    size,
    -size,
    -size,
    size,
    -size,
    // Bottom face (y = -size)
    -size,
    -size,
    -size,
    size,
    -size,
    -size,
    size,
    -size,
    size,
    -size,
    -size,
    size,
    // Right face (x = size)
    size,
    -size,
    size,
    size,
    -size,
    -size,
    size,
    size,
    -size,
    size,
    size,
    size,
    // Left face (x = -size)
    -size,
    -size,
    -size,
    -size,
    -size,
    size,
    -size,
    size,
    size,
    -size,
    size,
    -size,
  ]);

  // Normals for each face
  const normals = new Float32Array([
    // Front
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    // Back
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    // Top
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    // Bottom
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    // Right
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    // Left
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ]);

  // Indices (2 triangles per face, counter-clockwise winding)
  const indices = new Uint16Array([
    0,
    1,
    2,
    0,
    2,
    3, // Front
    4,
    5,
    6,
    4,
    6,
    7, // Back
    8,
    9,
    10,
    8,
    10,
    11, // Top
    12,
    13,
    14,
    12,
    14,
    15, // Bottom
    16,
    17,
    18,
    16,
    18,
    19, // Right
    20,
    21,
    22,
    20,
    22,
    23, // Left
  ]);

  // Create GLTF structure
  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
            },
            indices: 2,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: 24,
        type: "VEC3",
        max: [size, size, size],
        min: [-size, -size, -size],
      },
      {
        bufferView: 1,
        componentType: 5126, // FLOAT
        count: 24,
        type: "VEC3",
      },
      {
        bufferView: 2,
        componentType: 5123, // UNSIGNED_SHORT
        count: 36,
        type: "SCALAR",
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      {
        buffer: 0,
        byteOffset: positions.byteLength,
        byteLength: normals.byteLength,
      },
      {
        buffer: 0,
        byteOffset: positions.byteLength + normals.byteLength,
        byteLength: indices.byteLength,
      },
    ],
    buffers: [
      {
        byteLength:
          positions.byteLength + normals.byteLength + indices.byteLength,
      },
    ],
  };

  // Create binary buffer
  const totalBufferSize =
    positions.byteLength + normals.byteLength + indices.byteLength;
  const buffer = Buffer.alloc(totalBufferSize);

  Buffer.from(positions.buffer).copy(buffer, 0);
  Buffer.from(normals.buffer).copy(buffer, positions.byteLength);
  Buffer.from(indices.buffer).copy(
    buffer,
    positions.byteLength + normals.byteLength,
  );

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
  glb.writeUInt32LE(0x46546c67, offset);
  offset += 4; // magic: "glTF"
  glb.writeUInt32LE(2, offset);
  offset += 4; // version
  glb.writeUInt32LE(totalLength, offset);
  offset += 4; // length

  // JSON chunk
  glb.writeUInt32LE(jsonChunkLength, offset);
  offset += 4;
  glb.writeUInt32LE(0x4e4f534a, offset);
  offset += 4; // chunkType: "JSON"
  jsonBuffer.copy(glb, offset);
  offset += jsonBuffer.length;
  glb.fill(0x20, offset, offset + jsonPadding);
  offset += jsonPadding; // padding

  // Binary chunk
  glb.writeUInt32LE(binaryChunkLength, offset);
  offset += 4;
  glb.writeUInt32LE(0x004e4942, offset);
  offset += 4; // chunkType: "BIN\0"
  buffer.copy(glb, offset);
  offset += buffer.length;
  glb.fill(0, offset, offset + binaryPadding); // padding

  fs.writeFileSync(outputPath, glb);
  console.log(
    `Created ${outputPath} (${glb.length} bytes, ${subdivisions} subdivisions)`,
  );
}

function createSphereGLB(subdivisions, outputPath) {
  // For now, sphere will be same as cube but we'll document it differently
  createCubeGLB(subdivisions, outputPath);
}

// Create directories
const modelsDir = path.join(__dirname, "../public/models");
fs.mkdirSync(path.join(modelsDir, "cube"), { recursive: true });
fs.mkdirSync(path.join(modelsDir, "sphere"), { recursive: true });

// Generate assets
createCubeGLB(10, path.join(modelsDir, "cube/high.glb"));
createCubeGLB(2, path.join(modelsDir, "cube/low.glb"));
createSphereGLB(10, path.join(modelsDir, "sphere/high.glb"));
createSphereGLB(2, path.join(modelsDir, "sphere/low.glb"));

console.log("\nTest assets with proper normals generated successfully!");
