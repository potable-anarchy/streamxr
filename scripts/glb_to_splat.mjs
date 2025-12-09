#!/usr/bin/env node
/**
 * GLB to Gaussian Splat (.splat) converter
 *
 * Converts a GLB mesh (including Draco-compressed) to antimatter15/splat format.
 *
 * Format per splat (32 bytes):
 * - Position: 3 x float32 = 12 bytes
 * - Scale: 3 x float32 = 12 bytes
 * - Color (RGBA): 4 x uint8 = 4 bytes
 * - Rotation: 4 x uint8 = 4 bytes
 *
 * Usage:
 *   node glb_to_splat.mjs input.glb output.splat [--samples N]
 */

import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { createRequire } from 'module';
import { writeFileSync, statSync } from 'fs';
import { dirname, basename } from 'path';
import { fileURLToPath } from 'url';

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node glb_to_splat.mjs input.glb output.splat [--samples N]');
    process.exit(1);
}

const inputPath = args[0];
const outputPath = args[1];
let numSamples = 500000;

// Parse optional --samples argument
const samplesIdx = args.indexOf('--samples');
if (samplesIdx !== -1 && args[samplesIdx + 1]) {
    numSamples = parseInt(args[samplesIdx + 1], 10);
}

console.log(`Converting ${inputPath} to ${outputPath}`);
console.log(`Target samples: ${numSamples}`);

// Initialize GLTF I/O with Draco support
const io = new NodeIO()
    .registerExtensions(KHRONOS_EXTENSIONS)
    .registerDependencies({
        'draco3d.decoder': await draco3d.createDecoderModule(),
        'draco3d.encoder': await draco3d.createEncoderModule(),
    });

// Load the GLB document
console.log('Loading GLB...');
const document = await io.read(inputPath);
const root = document.getRoot();
const meshes = root.listMeshes();

console.log(`Found ${meshes.length} mesh(es)`);

// Collect all primitives (triangles)
const allVertices = [];
const allFaces = [];
const allColors = [];
const allNormals = [];
let vertexOffset = 0;

for (const mesh of meshes) {
    for (const primitive of mesh.listPrimitives()) {
        const posAccessor = primitive.getAttribute('POSITION');
        const normalAccessor = primitive.getAttribute('NORMAL');
        const colorAccessor = primitive.getAttribute('COLOR_0');
        const uvAccessor = primitive.getAttribute('TEXCOORD_0');
        const indices = primitive.getIndices();

        if (!posAccessor) continue;

        const positions = posAccessor.getArray();
        const posMin = posAccessor.getMin([]);
        const posMax = posAccessor.getMax([]);

        console.log(`  Primitive: ${posAccessor.getCount()} vertices`);
        console.log(`    Bounds: [${posMin.map(v => v.toFixed(3)).join(', ')}] to [${posMax.map(v => v.toFixed(3)).join(', ')}]`);

        // Extract vertex positions
        for (let i = 0; i < positions.length; i += 3) {
            allVertices.push([positions[i], positions[i + 1], positions[i + 2]]);
        }

        // Extract normals
        if (normalAccessor) {
            const normals = normalAccessor.getArray();
            for (let i = 0; i < normals.length; i += 3) {
                allNormals.push([normals[i], normals[i + 1], normals[i + 2]]);
            }
        }

        // Extract vertex colors or get material color
        let defaultColor = [180, 180, 180, 255];
        const material = primitive.getMaterial();
        if (material) {
            const baseColorFactor = material.getBaseColorFactor();
            if (baseColorFactor) {
                defaultColor = baseColorFactor.map(v => Math.round(v * 255));
            }
        }

        if (colorAccessor) {
            const colors = colorAccessor.getArray();
            const componentCount = colorAccessor.getElementSize();
            for (let i = 0; i < colors.length; i += componentCount) {
                const r = Math.round(colors[i] * 255);
                const g = Math.round(colors[i + 1] * 255);
                const b = Math.round(colors[i + 2] * 255);
                const a = componentCount > 3 ? Math.round(colors[i + 3] * 255) : 255;
                allColors.push([r, g, b, a]);
            }
        } else {
            // Use material color for all vertices
            for (let i = 0; i < positions.length / 3; i++) {
                allColors.push([...defaultColor]);
            }
        }

        // Extract face indices
        if (indices) {
            const indexArray = indices.getArray();
            for (let i = 0; i < indexArray.length; i += 3) {
                allFaces.push([
                    indexArray[i] + vertexOffset,
                    indexArray[i + 1] + vertexOffset,
                    indexArray[i + 2] + vertexOffset
                ]);
            }
        }

        vertexOffset += positions.length / 3;
    }
}

console.log(`Total vertices: ${allVertices.length}`);
console.log(`Total faces: ${allFaces.length}`);

// Calculate mesh bounds
let minBounds = [Infinity, Infinity, Infinity];
let maxBounds = [-Infinity, -Infinity, -Infinity];
for (const v of allVertices) {
    for (let i = 0; i < 3; i++) {
        minBounds[i] = Math.min(minBounds[i], v[i]);
        maxBounds[i] = Math.max(maxBounds[i], v[i]);
    }
}
const extent = maxBounds.map((max, i) => max - minBounds[i]);
const maxExtent = Math.max(...extent);

console.log(`Mesh bounds: [${minBounds.map(v => v.toFixed(3))}] to [${maxBounds.map(v => v.toFixed(3))}]`);
console.log(`Mesh extent: ${maxExtent.toFixed(3)}`);

// Sample points uniformly from mesh surface
console.log(`Sampling ${numSamples} points from mesh surface...`);

function sampleTriangle(v0, v1, v2) {
    // Random barycentric coordinates
    let r1 = Math.random();
    let r2 = Math.random();
    if (r1 + r2 > 1) {
        r1 = 1 - r1;
        r2 = 1 - r2;
    }
    const r3 = 1 - r1 - r2;

    return [
        v0[0] * r1 + v1[0] * r2 + v2[0] * r3,
        v0[1] * r1 + v1[1] * r2 + v2[1] * r3,
        v0[2] * r1 + v1[2] * r2 + v2[2] * r3
    ];
}

function interpolateColor(c0, c1, c2, r1, r2) {
    const r3 = 1 - r1 - r2;
    return [
        Math.round(c0[0] * r1 + c1[0] * r2 + c2[0] * r3),
        Math.round(c0[1] * r1 + c1[1] * r2 + c2[1] * r3),
        Math.round(c0[2] * r1 + c1[2] * r2 + c2[2] * r3),
        Math.round(c0[3] * r1 + c1[3] * r2 + c2[3] * r3)
    ];
}

function triangleArea(v0, v1, v2) {
    const ax = v1[0] - v0[0], ay = v1[1] - v0[1], az = v1[2] - v0[2];
    const bx = v2[0] - v0[0], by = v2[1] - v0[1], bz = v2[2] - v0[2];
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
}

function faceNormal(v0, v1, v2) {
    const ax = v1[0] - v0[0], ay = v1[1] - v0[1], az = v1[2] - v0[2];
    const bx = v2[0] - v0[0], by = v2[1] - v0[1], bz = v2[2] - v0[2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len === 0) return [0, 0, 1];
    return [nx / len, ny / len, nz / len];
}

// Calculate face areas for weighted sampling
const faceAreas = allFaces.map(f => triangleArea(allVertices[f[0]], allVertices[f[1]], allVertices[f[2]]));
const totalArea = faceAreas.reduce((a, b) => a + b, 0);

// Build cumulative distribution for weighted random sampling
const cdf = new Float64Array(faceAreas.length);
cdf[0] = faceAreas[0] / totalArea;
for (let i = 1; i < faceAreas.length; i++) {
    cdf[i] = cdf[i - 1] + faceAreas[i] / totalArea;
}

// Binary search for face selection
function selectFace(r) {
    let lo = 0, hi = cdf.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < r) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

// Sample points
const sampledPositions = [];
const sampledColors = [];
const sampledNormals = [];

for (let i = 0; i < numSamples; i++) {
    const faceIdx = selectFace(Math.random());
    const face = allFaces[faceIdx];

    const v0 = allVertices[face[0]];
    const v1 = allVertices[face[1]];
    const v2 = allVertices[face[2]];

    // Random barycentric coordinates
    let r1 = Math.random();
    let r2 = Math.random();
    if (r1 + r2 > 1) {
        r1 = 1 - r1;
        r2 = 1 - r2;
    }

    // Position
    const pos = sampleTriangle(v0, v1, v2);
    sampledPositions.push(pos);

    // Color (interpolated or use material color)
    const c0 = allColors[face[0]] || [180, 180, 180, 255];
    const c1 = allColors[face[1]] || [180, 180, 180, 255];
    const c2 = allColors[face[2]] || [180, 180, 180, 255];
    sampledColors.push(interpolateColor(c0, c1, c2, r1, r2));

    // Normal
    if (allNormals.length > 0) {
        const n0 = allNormals[face[0]];
        const n1 = allNormals[face[1]];
        const n2 = allNormals[face[2]];
        if (n0 && n1 && n2) {
            const r3 = 1 - r1 - r2;
            const nx = n0[0] * r1 + n1[0] * r2 + n2[0] * r3;
            const ny = n0[1] * r1 + n1[1] * r2 + n2[1] * r3;
            const nz = n0[2] * r1 + n1[2] * r2 + n2[2] * r3;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (len > 0) {
                sampledNormals.push([nx / len, ny / len, nz / len]);
            } else {
                sampledNormals.push(faceNormal(v0, v1, v2));
            }
        } else {
            sampledNormals.push(faceNormal(v0, v1, v2));
        }
    } else {
        sampledNormals.push(faceNormal(v0, v1, v2));
    }
}

console.log(`Sampled ${sampledPositions.length} points`);

// Convert normal to quaternion rotation
function normalToQuaternion(normal) {
    const up = [0, 0, 1];
    const dot = normal[0] * up[0] + normal[1] * up[1] + normal[2] * up[2];

    if (Math.abs(dot) > 0.9999) {
        if (dot > 0) return [1, 0, 0, 0]; // Identity
        return [0, 1, 0, 0]; // 180 around X
    }

    // Cross product
    const ax = up[1] * normal[2] - up[2] * normal[1];
    const ay = up[2] * normal[0] - up[0] * normal[2];
    const az = up[0] * normal[1] - up[1] * normal[0];
    const axisLen = Math.sqrt(ax * ax + ay * ay + az * az);

    if (axisLen === 0) return [1, 0, 0, 0];

    const axis = [ax / axisLen, ay / axisLen, az / axisLen];
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);

    return [Math.cos(halfAngle), axis[0] * s, axis[1] * s, axis[2] * s];
}

// Calculate gaussian scale based on mesh size and sample density
const baseScale = maxExtent * 0.003; // Small relative to mesh size

console.log(`Base gaussian scale: ${baseScale.toFixed(6)}`);

// Prepare splat data
const splats = [];
for (let i = 0; i < sampledPositions.length; i++) {
    const pos = sampledPositions[i];
    const color = sampledColors[i];
    const normal = sampledNormals[i];
    const rotation = normalToQuaternion(normal);

    // Scale: slightly flattened disks oriented along surface
    const scale = [baseScale, baseScale, baseScale * 0.3];

    // Importance for sorting (larger/more opaque first)
    const importance = scale[0] * scale[1] * scale[2] * (color[3] / 255);

    splats.push({ pos, scale, color, rotation, importance });
}

// Sort by importance (descending) for front-to-back rendering
splats.sort((a, b) => b.importance - a.importance);

// Write splat file
console.log('Writing splat file...');

const buffer = Buffer.alloc(32 * splats.length);
let offset = 0;

for (const splat of splats) {
    // Position: 3 x float32 (12 bytes)
    buffer.writeFloatLE(splat.pos[0], offset);
    buffer.writeFloatLE(splat.pos[1], offset + 4);
    buffer.writeFloatLE(splat.pos[2], offset + 8);

    // Scale: 3 x float32 (12 bytes)
    buffer.writeFloatLE(splat.scale[0], offset + 12);
    buffer.writeFloatLE(splat.scale[1], offset + 16);
    buffer.writeFloatLE(splat.scale[2], offset + 20);

    // Color: 4 x uint8 (4 bytes)
    buffer.writeUInt8(Math.max(0, Math.min(255, splat.color[0])), offset + 24);
    buffer.writeUInt8(Math.max(0, Math.min(255, splat.color[1])), offset + 25);
    buffer.writeUInt8(Math.max(0, Math.min(255, splat.color[2])), offset + 26);
    buffer.writeUInt8(Math.max(0, Math.min(255, splat.color[3])), offset + 27);

    // Rotation: 4 x uint8 (normalized quaternion)
    const rot = splat.rotation;
    const rotLen = Math.sqrt(rot[0] * rot[0] + rot[1] * rot[1] + rot[2] * rot[2] + rot[3] * rot[3]);
    const rotNorm = rotLen > 0 ? rot.map(v => v / rotLen) : [1, 0, 0, 0];

    buffer.writeUInt8(Math.max(0, Math.min(255, Math.round(rotNorm[0] * 128 + 128))), offset + 28);
    buffer.writeUInt8(Math.max(0, Math.min(255, Math.round(rotNorm[1] * 128 + 128))), offset + 29);
    buffer.writeUInt8(Math.max(0, Math.min(255, Math.round(rotNorm[2] * 128 + 128))), offset + 30);
    buffer.writeUInt8(Math.max(0, Math.min(255, Math.round(rotNorm[3] * 128 + 128))), offset + 31);

    offset += 32;
}

writeFileSync(outputPath, buffer);

const fileSize = statSync(outputPath).size;
console.log(`\nConversion complete!`);
console.log(`  Splats: ${splats.length.toLocaleString()}`);
console.log(`  File size: ${fileSize.toLocaleString()} bytes (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);

// Write manifest
const manifestPath = dirname(outputPath) + '/manifest.json';
const manifest = {
    version: '1.0',
    format: 'splat',
    formatVersion: 'antimatter15-v1',
    pointCount: splats.length,
    bounds: {
        min: minBounds,
        max: maxBounds,
        center: minBounds.map((min, i) => (min + maxBounds[i]) / 2),
        extent: extent
    },
    fileSize: fileSize,
    fileSizeMB: parseFloat((fileSize / (1024 * 1024)).toFixed(2)),
    files: [{
        name: basename(outputPath),
        size: fileSize,
        type: 'gaussian-splat'
    }],
    bytesPerSplat: 32,
    attributes: {
        position: { offset: 0, size: 12, type: 'float32x3' },
        scale: { offset: 12, size: 12, type: 'float32x3' },
        color: { offset: 24, size: 4, type: 'uint8x4' },
        rotation: { offset: 28, size: 4, type: 'uint8x4' }
    }
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`  Manifest: ${manifestPath}`);
