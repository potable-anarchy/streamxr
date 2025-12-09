const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const promClient = require("prom-client");
const AssetManager = require("./lib/assetManager");
const AdaptiveStreamingManager = require("./lib/adaptiveStreaming");
const FoveatedStreamingManager = require("./lib/foveatedStreaming");
const RoomManager = require("./lib/roomManager");
const ObjectSync = require("./lib/objectSync");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Add WebXR permissions headers
app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "xr-spatial-tracking=(self)");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

app.use(express.static("public"));
app.use(express.json());
app.use(express.raw({ type: "model/gltf-binary", limit: "50mb" }));

// Prometheus metrics setup
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const wsConnections = new promClient.Gauge({
  name: "streamxr_websocket_connections",
  help: "Number of active WebSocket connections",
  registers: [register],
});

const roomUsers = new promClient.Gauge({
  name: "streamxr_room_users",
  help: "Number of users per room",
  labelNames: ["room"],
  registers: [register],
});

const assetRequests = new promClient.Counter({
  name: "streamxr_asset_requests_total",
  help: "Total number of asset requests",
  labelNames: ["asset", "lod"],
  registers: [register],
});

const assetBytesTransferred = new promClient.Counter({
  name: "streamxr_asset_bytes_transferred_total",
  help: "Total bytes transferred for assets",
  labelNames: ["asset"],
  registers: [register],
});

const bandwidthGauge = new promClient.Gauge({
  name: "streamxr_client_bandwidth_bps",
  help: "Client bandwidth in bits per second",
  labelNames: ["client_id"],
  registers: [register],
});

const objectCount = new promClient.Gauge({
  name: "streamxr_shared_objects_total",
  help: "Total number of shared objects",
  labelNames: ["room"],
  registers: [register],
});

// Golden Signal 1: Latency - WebSocket message processing time
const messageLatency = new promClient.Histogram({
  name: "streamxr_message_duration_seconds",
  help: "WebSocket message processing duration in seconds",
  labelNames: ["message_type"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

// Golden Signal 2: Traffic - Already covered by wsConnections and assetRequests

// Golden Signal 3: Errors - WebSocket and asset errors
const errorCounter = new promClient.Counter({
  name: "streamxr_errors_total",
  help: "Total number of errors",
  labelNames: ["type", "operation"],
  registers: [register],
});

// Golden Signal 4: Saturation - Connection capacity utilization
const connectionSaturation = new promClient.Gauge({
  name: "streamxr_connection_saturation_ratio",
  help: "Ratio of active connections to maximum capacity (0-1)",
  registers: [register],
});

const MAX_CONNECTIONS = 100; // Configure based on server capacity

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

const clients = new Map();
const assetManager = new AssetManager();
const adaptiveStreaming = new AdaptiveStreamingManager();
const foveatedStreaming = new FoveatedStreamingManager();
const roomManager = new RoomManager();
const objectSync = new ObjectSync();

// Asset streaming configuration
const CHUNK_SIZE = 16 * 1024; // 16KB chunks

wss.on("connection", (ws) => {
  const clientId = generateId();
  clients.set(clientId, ws);

  const roomInfo = roomManager.addUser(clientId, ws);

  // Update metrics
  wsConnections.set(clients.size);
  const roomUsersList = roomManager.getRoomUsers(roomInfo.room) || [];
  roomUsers.set({ room: roomInfo.room }, roomUsersList.length); // getRoomUsers already includes current user

  // Update saturation (Golden Signal: Saturation)
  connectionSaturation.set(clients.size / MAX_CONNECTIONS);

  // Initialize object count for this room
  const objects = objectSync.getRoomObjects(roomInfo.room);
  objectCount.set({ room: roomInfo.room }, objects.length);

  console.log(`Client ${clientId} connected. Total clients: ${clients.size}`);

  ws.on("message", async (message) => {
    const startTime = Date.now();
    let messageType = "unknown";

    try {
      const data = JSON.parse(message);
      messageType = data.type || "unknown";

      if (data.type === "signal") {
        broadcastToOthers(clientId, {
          type: "signal",
          from: clientId,
          signal: data.signal,
        });
      } else if (data.type === "request_asset") {
        // Handle asset request with adaptive streaming
        await handleAssetRequest(clientId, ws, data.assetId, data.lod);
      } else if (data.type === "list_assets") {
        // Send list of available assets
        ws.send(
          JSON.stringify({
            type: "asset_list",
            assets: assetManager.listAssets(),
          }),
        );
      } else if (data.type === "bandwidth-metrics") {
        // Update client bandwidth metrics
        handleBandwidthMetrics(clientId, data.metrics);
      } else if (data.type === "head-tracking") {
        // Update client head tracking for foveated streaming
        handleHeadTracking(clientId, data);
      } else if (data.type === "position-update") {
        // Handle position updates for multiuser
        handlePositionUpdate(clientId, data);
      } else if (data.type === "get-room-objects") {
        // Get all objects in the room
        handleGetRoomObjects(ws, data.roomId);
      } else if (data.type === "create-object") {
        // Create a new shared object
        handleCreateObject(data.roomId, data.objectData);
      } else if (data.type === "update-object") {
        // Update an existing object
        handleUpdateObject(data.roomId, data.objectId, data.updates);
      } else if (data.type === "delete-object") {
        // Delete an object
        handleDeleteObject(data.roomId, data.objectId);
      } else if (data.type === "grab-object") {
        // Grab an object (acquire ownership)
        handleGrabObject(clientId, ws, data.roomId, data.objectId);
      } else if (data.type === "release-object") {
        // Release an object (give up ownership)
        handleReleaseObject(clientId, data.roomId, data.objectId);
      } else if (data.type === "move-object") {
        // Move an object (only if owned)
        handleMoveObject(
          clientId,
          data.roomId,
          data.objectId,
          data.position,
          data.rotation,
        );
      } else if (data.type === "set-simulation-mode") {
        // Handle bandwidth simulation toggle
        handleSimulationModeToggle(clientId, ws, data.enabled);
      } else if (data.type === "request_nerf") {
        // Handle NeRF/Gaussian Splat streaming request
        await handleNeRFRequest(clientId, ws, data.assetId, data.options);
      } else if (data.type === "set_render_mode") {
        // Handle render mode change for NeRF visualization
        handleSetRenderMode(clientId, ws, data.mode);
      }

      // Track message latency (Golden Signal: Latency)
      const duration = (Date.now() - startTime) / 1000;
      messageLatency.observe({ message_type: messageType }, duration);
    } catch (error) {
      console.error("Error parsing message:", error);

      // Track errors (Golden Signal: Errors)
      errorCounter.inc({ type: "message_parsing", operation: messageType });
    }
  });

  ws.on("close", () => {
    const room = roomManager.removeUser(clientId);
    clients.delete(clientId);
    adaptiveStreaming.removeClient(clientId);
    foveatedStreaming.removeClient(clientId);
    clientRenderModes.delete(clientId);

    // Release all objects owned by this user
    objectSync.releaseAllUserObjects(clientId);

    // Update metrics
    wsConnections.set(clients.size);
    if (room) {
      const roomUsersList = roomManager.getRoomUsers(room) || [];
      roomUsers.set({ room: room }, roomUsersList.length);
    }
    bandwidthGauge.remove({ client_id: clientId });

    // Update saturation (Golden Signal: Saturation)
    connectionSaturation.set(clients.size / MAX_CONNECTIONS);

    console.log(
      `Client ${clientId} disconnected. Total clients: ${clients.size}`,
    );

    broadcastToOthers(clientId, {
      type: "peer-disconnected",
      peerId: clientId,
    });
  });

  const userPosition = roomManager.getUserPosition(clientId);

  ws.send(
    JSON.stringify({
      type: "welcome",
      id: clientId,
      peers: roomInfo.users,
      color: userPosition.color,
      userPositions: roomManager.getAllUserPositions(),
    }),
  );

  broadcastToOthers(clientId, {
    type: "peer-connected",
    peerId: clientId,
    color: userPosition.color,
  });
});

async function handleAssetRequest(clientId, ws, assetId, requestedLod) {
  try {
    const startTime = Date.now();

    // Determine LOD - use adaptive selection if not specified
    let lod = requestedLod || "high";

    // Track asset request metric
    assetRequests.inc({ asset: assetId, lod: lod });

    // Apply foveated streaming first (takes priority over bandwidth-based adaptive streaming)
    // Default object position (can be extended to track multiple objects)
    const objectPosition = [0, 0, -2];
    const foveatedResult = foveatedStreaming.getAssetLOD(
      clientId,
      assetId,
      objectPosition,
    );

    if (!requestedLod) {
      // Check if foveated streaming wants to skip this asset
      if (foveatedResult.lod === "skip") {
        console.log(
          `Client ${clientId} requested ${assetId}, foveated streaming skipped (object not in view)`,
        );
        ws.send(
          JSON.stringify({
            type: "asset_skipped",
            assetId: assetId,
            reason: "Object not in view frustum",
          }),
        );
        return;
      }

      // Use foveated LOD if available, otherwise fall back to adaptive streaming
      if (foveatedResult.lod) {
        lod = foveatedResult.lod;
        console.log(
          `Client ${clientId} requested ${assetId}, foveated streaming selected ${lod} LOD`,
        );
      } else {
        // Fall back to bandwidth-based adaptive streaming
        const selectedAsset = adaptiveStreaming.selectLOD(clientId, assetId);
        lod = selectedAsset.endsWith("-high") ? "high" : "low";
        console.log(
          `Client ${clientId} requested ${assetId}, adaptive streaming selected ${lod} LOD`,
        );
      }
    } else {
      console.log(
        `Client ${clientId} requested asset: ${assetId} (LOD: ${lod})`,
      );
    }

    const assetBuffer = assetManager.getAsset(assetId, lod);

    // Send asset metadata first
    ws.send(
      JSON.stringify({
        type: "asset_metadata",
        assetId: assetId,
        lod: lod,
        size: assetBuffer.length,
        chunks: Math.ceil(assetBuffer.length / CHUNK_SIZE),
      }),
    );

    // Stream asset data in chunks
    let offset = 0;
    let chunkIndex = 0;

    while (offset < assetBuffer.length) {
      const chunkSize = Math.min(CHUNK_SIZE, assetBuffer.length - offset);
      const chunk = assetBuffer.slice(offset, offset + chunkSize);

      // Send chunk header as JSON
      ws.send(
        JSON.stringify({
          type: "asset_chunk",
          assetId: assetId,
          chunkIndex: chunkIndex,
          totalChunks: Math.ceil(assetBuffer.length / CHUNK_SIZE),
        }),
      );

      // Send binary chunk immediately after
      ws.send(chunk);

      offset += chunkSize;
      chunkIndex++;
    }

    // Send completion message
    ws.send(
      JSON.stringify({
        type: "asset_complete",
        assetId: assetId,
      }),
    );

    // Update bandwidth metrics based on transfer
    const transferDuration = Date.now() - startTime;
    adaptiveStreaming.updateMetrics(
      clientId,
      assetBuffer.length,
      transferDuration,
    );

    // Track bytes transferred
    assetBytesTransferred.inc({ asset: assetId }, assetBuffer.length);

    console.log(
      `Completed streaming asset ${assetId} (${lod}) to client ${clientId} in ${transferDuration}ms`,
    );
  } catch (error) {
    console.error(`Error streaming asset ${assetId}:`, error);

    // Track errors (Golden Signal: Errors)
    errorCounter.inc({ type: "asset_streaming", operation: assetId });

    ws.send(
      JSON.stringify({
        type: "asset_error",
        assetId: assetId,
        error: error.message,
      }),
    );
  }
}

function handleBandwidthMetrics(clientId, metrics) {
  console.log(`Received bandwidth metrics from client ${clientId}:`, metrics);

  // Update bandwidth gauge
  if (metrics.bandwidth) {
    bandwidthGauge.set({ client_id: clientId }, metrics.bandwidth * 8); // Convert bytes/s to bits/s
  }

  // Get recommended LOD based on client-reported metrics
  const recommendedLOD = adaptiveStreaming.getRecommendedLOD(clientId, metrics);

  // Send recommendation back to client
  const ws = clients.get(clientId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "lod-recommendation",
        lod: recommendedLOD,
      }),
    );
  }
}

function handleSimulationModeToggle(clientId, ws, enabled) {
  console.log(`Client ${clientId} set simulation mode to: ${enabled}`);

  // Update adaptive streaming manager
  adaptiveStreaming.setSimulationMode(clientId, enabled);

  // Send confirmation and LOD recommendation back to client
  const recommendedLOD = enabled ? 'low' : adaptiveStreaming.getRecommendedLOD(clientId, {});

  ws.send(
    JSON.stringify({
      type: "simulation-mode-changed",
      enabled: enabled,
      lod: recommendedLOD,
    })
  );

  // If simulation is disabled, send an updated LOD recommendation
  if (!enabled) {
    ws.send(
      JSON.stringify({
        type: "lod-recommendation",
        lod: recommendedLOD,
      })
    );
  }
}

// NeRF/Gaussian Splat streaming configuration
const NERF_CHUNK_SIZE = 16 * 1024; // 16KB chunks for splat data

// Client render mode tracking
const clientRenderModes = new Map();

/**
 * Handle NeRF/Gaussian Splat streaming request
 * Streams splat data in 16KB chunks with metadata
 * @param {string} clientId - Client identifier
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} assetId - NeRF asset identifier
 * @param {Object} options - Optional streaming options (quality, region, etc.)
 */
async function handleNeRFRequest(clientId, ws, assetId, options = {}) {
  const startTime = Date.now();

  try {
    console.log(`Client ${clientId} requested NeRF asset: ${assetId}`);

    // Track NeRF asset request
    assetRequests.inc({ asset: assetId, lod: options.quality || 'high' });

    // Get NeRF/splat data from asset manager
    // For now, we'll look for .ply or .splat files in the asset directory
    const splatData = await getNeRFSplatData(assetId, options);

    if (!splatData) {
      ws.send(JSON.stringify({
        type: 'nerf_error',
        assetId: assetId,
        error: `NeRF asset not found: ${assetId}`,
      }));
      errorCounter.inc({ type: 'nerf_streaming', operation: assetId });
      return;
    }

    // Calculate chunk information
    const totalChunks = Math.ceil(splatData.buffer.length / NERF_CHUNK_SIZE);

    // Send metadata first
    ws.send(JSON.stringify({
      type: 'nerf_metadata',
      assetId: assetId,
      format: splatData.format, // 'ply', 'splat', or 'gaussian'
      size: splatData.buffer.length,
      chunks: totalChunks,
      splatCount: splatData.splatCount || null,
      boundingBox: splatData.boundingBox || null,
      quality: options.quality || 'high',
    }));

    // Stream splat data in 16KB chunks
    let offset = 0;
    let chunkIndex = 0;

    while (offset < splatData.buffer.length) {
      // Check if client is still connected
      if (ws.readyState !== WebSocket.OPEN) {
        console.log(`Client ${clientId} disconnected during NeRF streaming`);
        return;
      }

      const chunkSize = Math.min(NERF_CHUNK_SIZE, splatData.buffer.length - offset);
      const chunk = splatData.buffer.slice(offset, offset + chunkSize);

      // Send chunk header as JSON
      ws.send(JSON.stringify({
        type: 'nerf_chunk',
        assetId: assetId,
        chunkIndex: chunkIndex,
        totalChunks: totalChunks,
        offset: offset,
        size: chunkSize,
      }));

      // Send binary chunk immediately after
      ws.send(chunk);

      offset += chunkSize;
      chunkIndex++;

      // Optional: Add small delay between chunks to prevent overwhelming slow clients
      if (options.throttle && chunkIndex % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    // Send completion message
    ws.send(JSON.stringify({
      type: 'nerf_complete',
      assetId: assetId,
      totalSize: splatData.buffer.length,
      chunksTransferred: chunkIndex,
    }));

    // Track transfer metrics
    const transferDuration = Date.now() - startTime;
    adaptiveStreaming.updateMetrics(clientId, splatData.buffer.length, transferDuration);
    assetBytesTransferred.inc({ asset: assetId }, splatData.buffer.length);

    console.log(`Completed NeRF streaming ${assetId} to client ${clientId} in ${transferDuration}ms (${splatData.buffer.length} bytes, ${chunkIndex} chunks)`);

  } catch (error) {
    console.error(`Error streaming NeRF asset ${assetId}:`, error);

    // Track errors
    errorCounter.inc({ type: 'nerf_streaming', operation: assetId });

    ws.send(JSON.stringify({
      type: 'nerf_error',
      assetId: assetId,
      error: error.message,
    }));
  }
}

/**
 * Get NeRF/Gaussian Splat data from asset storage
 * @param {string} assetId - Asset identifier
 * @param {Object} options - Quality and format options
 * @returns {Object|null} Splat data with buffer and metadata
 */
async function getNeRFSplatData(assetId, options = {}) {
  const fs = require('fs');
  const modelsDir = path.join(__dirname, 'public/models');
  const assetDir = path.join(modelsDir, assetId);

  // Check if asset directory exists
  if (!fs.existsSync(assetDir)) {
    return null;
  }

  // Look for splat files in order of preference
  const splatExtensions = ['.splat', '.ply', '.gaussian'];
  const qualityLevels = options.quality === 'low' ? ['low', 'medium', 'high'] :
                        options.quality === 'medium' ? ['medium', 'high', 'low'] :
                        ['high', 'medium', 'low'];

  let splatFile = null;
  let format = null;

  // Try to find splat file with quality prefix
  for (const quality of qualityLevels) {
    for (const ext of splatExtensions) {
      const filePath = path.join(assetDir, `${quality}${ext}`);
      if (fs.existsSync(filePath)) {
        splatFile = filePath;
        format = ext.substring(1); // Remove the dot
        break;
      }
    }
    if (splatFile) break;
  }

  // Fallback: look for any splat file without quality prefix
  if (!splatFile) {
    for (const ext of splatExtensions) {
      const filePath = path.join(assetDir, `splats${ext}`);
      if (fs.existsSync(filePath)) {
        splatFile = filePath;
        format = ext.substring(1);
        break;
      }
    }
  }

  // Fallback: look in splat/ subdirectory with asset name
  if (!splatFile) {
    const splatDir = path.join(assetDir, 'splat');
    if (fs.existsSync(splatDir)) {
      for (const ext of splatExtensions) {
        const filePath = path.join(splatDir, `${assetId}${ext}`);
        if (fs.existsSync(filePath)) {
          splatFile = filePath;
          format = ext.substring(1);
          break;
        }
      }
    }
  }

  if (!splatFile) {
    // No splat file found - generate mock data for testing
    // In production, this would return null
    console.log(`No splat file found for ${assetId}, generating mock splat data`);
    return generateMockSplatData(assetId);
  }

  // Read the splat file
  const buffer = fs.readFileSync(splatFile);

  // Parse basic metadata based on format
  const metadata = parseSplatMetadata(buffer, format);

  return {
    buffer: buffer,
    format: format,
    splatCount: metadata.splatCount,
    boundingBox: metadata.boundingBox,
  };
}

/**
 * Parse basic metadata from splat data
 * @param {Buffer} buffer - Splat data buffer
 * @param {string} format - File format
 * @returns {Object} Metadata
 */
function parseSplatMetadata(buffer, format) {
  const metadata = {
    splatCount: 0,
    boundingBox: null,
  };

  if (format === 'ply') {
    // Basic PLY header parsing to extract vertex count
    const headerEnd = buffer.indexOf(Buffer.from('end_header'));
    if (headerEnd !== -1) {
      const header = buffer.slice(0, headerEnd).toString('utf8');
      const vertexMatch = header.match(/element vertex (\d+)/);
      if (vertexMatch) {
        metadata.splatCount = parseInt(vertexMatch[1], 10);
      }
    }
  } else if (format === 'splat') {
    // Assume 32 bytes per splat (position + color + scale + rotation)
    metadata.splatCount = Math.floor(buffer.length / 32);
  } else if (format === 'gaussian') {
    // Gaussian splatting format - varies by implementation
    // This is a simplified estimate
    metadata.splatCount = Math.floor(buffer.length / 62);
  }

  return metadata;
}

/**
 * Generate mock splat data for testing when no real splat file exists
 * @param {string} assetId - Asset identifier
 * @returns {Object} Mock splat data
 */
function generateMockSplatData(assetId) {
  // Generate a small mock splat buffer for testing
  // In production, this would not be used
  const mockSplatCount = 1000;
  const bytesPerSplat = 32; // position (12) + color (4) + scale (12) + rotation (4)
  const mockBuffer = Buffer.alloc(mockSplatCount * bytesPerSplat);

  // Fill with random-ish data
  for (let i = 0; i < mockSplatCount; i++) {
    const offset = i * bytesPerSplat;

    // Position (3 floats)
    mockBuffer.writeFloatLE((Math.random() - 0.5) * 4, offset);
    mockBuffer.writeFloatLE((Math.random() - 0.5) * 4, offset + 4);
    mockBuffer.writeFloatLE((Math.random() - 0.5) * 4 - 2, offset + 8);

    // Color (RGBA bytes)
    mockBuffer.writeUInt8(Math.floor(Math.random() * 255), offset + 12);
    mockBuffer.writeUInt8(Math.floor(Math.random() * 255), offset + 13);
    mockBuffer.writeUInt8(Math.floor(Math.random() * 255), offset + 14);
    mockBuffer.writeUInt8(255, offset + 15); // Alpha

    // Scale (3 floats)
    mockBuffer.writeFloatLE(0.1 + Math.random() * 0.1, offset + 16);
    mockBuffer.writeFloatLE(0.1 + Math.random() * 0.1, offset + 20);
    mockBuffer.writeFloatLE(0.1 + Math.random() * 0.1, offset + 24);

    // Rotation (quaternion w component only for simplicity)
    mockBuffer.writeFloatLE(1.0, offset + 28);
  }

  return {
    buffer: mockBuffer,
    format: 'splat',
    splatCount: mockSplatCount,
    boundingBox: {
      min: [-2, -2, -4],
      max: [2, 2, 0],
    },
  };
}

/**
 * Handle render mode change for NeRF visualization
 * @param {string} clientId - Client identifier
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} mode - Render mode (e.g., 'splat', 'point', 'mesh', 'hybrid')
 */
function handleSetRenderMode(clientId, ws, mode) {
  const validModes = ['splat', 'point', 'mesh', 'hybrid', 'wireframe'];

  if (!validModes.includes(mode)) {
    ws.send(JSON.stringify({
      type: 'nerf_error',
      error: `Invalid render mode: ${mode}. Valid modes: ${validModes.join(', ')}`,
    }));
    return;
  }

  // Store client's render mode preference
  clientRenderModes.set(clientId, mode);

  console.log(`Client ${clientId} set render mode to: ${mode}`);

  // Confirm the mode change to client
  ws.send(JSON.stringify({
    type: 'render_mode_changed',
    mode: mode,
  }));

  // Broadcast to other users in the same room (optional - for collaborative viewing)
  broadcastToRoom(clientId, {
    type: 'peer_render_mode',
    userId: clientId,
    mode: mode,
  });
}

function handleHeadTracking(clientId, data) {
  // Update foveated streaming with client view data
  foveatedStreaming.updateClientView(clientId, {
    position: data.position,
    rotation: data.rotation,
    quaternion: data.quaternion,
    fov: data.fov,
  });

  // Update room manager with position for multiuser support
  roomManager.updateUserPosition(clientId, {
    position: data.position,
    rotation: data.rotation,
    quaternion: data.quaternion,
  });

  // Broadcast position to other users in the same room
  broadcastToRoom(clientId, {
    type: "user-position",
    userId: clientId,
    position: data.position,
    rotation: data.rotation,
    quaternion: data.quaternion,
  });
}

function handlePositionUpdate(clientId, data) {
  // Update user position in room manager
  roomManager.updateUserPosition(clientId, {
    position: data.position,
    rotation: data.rotation,
    quaternion: data.quaternion,
  });

  // Broadcast to other users in the same room
  broadcastToRoom(clientId, {
    type: "user-position",
    userId: clientId,
    position: data.position,
    rotation: data.rotation,
    quaternion: data.quaternion,
  });
}

function broadcastToOthers(excludeId, message) {
  const messageStr = JSON.stringify(message);
  clients.forEach((client, id) => {
    if (id !== excludeId && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

function broadcastToRoom(excludeId, message) {
  const usersInRoom = roomManager.getUsersInSameRoom(excludeId);
  const messageStr = JSON.stringify(message);

  usersInRoom.forEach((userId) => {
    const client = clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

// Object Synchronization Handlers

function handleGetRoomObjects(ws, roomId) {
  const objects = objectSync.getRoomObjects(roomId);

  ws.send(
    JSON.stringify({
      type: "room-objects",
      objects: objects,
    }),
  );

  console.log(`Sent ${objects.length} objects in room ${roomId} to client`);
}

function handleCreateObject(roomId, objectData) {
  try {
    const createdObject = objectSync.createObject(roomId, objectData);

    // Update object count metric
    const objects = objectSync.getRoomObjects(roomId);
    objectCount.set({ room: roomId }, objects.length);

    // Broadcast to all clients
    broadcastToAll({
      type: "object-created",
      object: createdObject,
    });

    console.log(`Object ${createdObject.id} created in room ${roomId}`);
  } catch (error) {
    console.error("Error creating object:", error);
  }
}

function handleUpdateObject(roomId, objectId, updates) {
  try {
    const updatedObject = objectSync.updateObject(roomId, objectId, updates);

    // Broadcast to all clients
    broadcastToAll({
      type: "object-updated",
      object: updatedObject,
    });

    console.log(`Object ${objectId} updated in room ${roomId}`);
  } catch (error) {
    console.error("Error updating object:", error);
  }
}

function handleDeleteObject(roomId, objectId) {
  try {
    const deleted = objectSync.deleteObject(roomId, objectId);

    if (deleted) {
      // Update object count metric
      const objects = objectSync.getRoomObjects(roomId);
      objectCount.set({ room: roomId }, objects.length);

      // Broadcast to all clients
      broadcastToAll({
        type: "object-deleted",
        objectId: objectId,
      });

      console.log(`Object ${objectId} deleted from room ${roomId}`);
    }
  } catch (error) {
    console.error("Error deleting object:", error);
  }
}

function handleGrabObject(userId, ws, roomId, objectId) {
  try {
    const result = objectSync.grabObject(roomId, objectId, userId);

    if (result.success) {
      // Broadcast to all clients that this object is now grabbed
      broadcastToAll({
        type: "object-grabbed",
        objectId: objectId,
        userId: userId,
        object: result.object,
      });

      console.log(
        `User ${userId} grabbed object ${objectId} in room ${roomId}`,
      );
    } else {
      // Send failure message back to requesting user
      ws.send(
        JSON.stringify({
          type: "grab-failed",
          objectId: objectId,
          ownedBy: result.ownedBy,
          message: "Object is currently owned by another user",
        }),
      );
    }
  } catch (error) {
    console.error("Error grabbing object:", error);
    ws.send(
      JSON.stringify({
        type: "error",
        message: error.message,
      }),
    );
  }
}

function handleReleaseObject(userId, roomId, objectId) {
  try {
    const released = objectSync.releaseObject(roomId, objectId, userId);

    if (released) {
      // Broadcast to all clients that this object is now released
      broadcastToAll({
        type: "object-released",
        objectId: objectId,
        userId: userId,
      });

      console.log(
        `User ${userId} released object ${objectId} in room ${roomId}`,
      );
    }
  } catch (error) {
    console.error("Error releasing object:", error);
  }
}

function handleMoveObject(userId, roomId, objectId, position, rotation) {
  try {
    const object = objectSync.getObject(roomId, objectId);

    if (!object) {
      console.error(`Object ${objectId} not found in room ${roomId}`);
      return;
    }

    // Check if user owns this object
    if (object.ownedBy !== userId) {
      console.warn(
        `User ${userId} tried to move object ${objectId} but doesn't own it`,
      );
      return;
    }

    // Update the object position
    const updates = {};
    if (position) updates.position = position;
    if (rotation) updates.rotation = rotation;

    const updatedObject = objectSync.updateObject(roomId, objectId, updates);

    // Refresh the ownership timeout
    objectSync.refreshOwnership(objectId, userId);

    // Broadcast the updated position to all other clients
    broadcastToOthers(userId, {
      type: "object-moved",
      objectId: objectId,
      position: updatedObject.position,
      rotation: updatedObject.rotation,
      userId: userId,
    });
  } catch (error) {
    console.error("Error moving object:", error);
  }
}

// REST API endpoints for asset upload

/**
 * POST /api/assets/upload
 * Upload a high-quality GLB asset and auto-generate LOD levels
 * Body: raw binary GLB data
 * Query: ?assetId=<unique-id>
 */
app.post("/api/assets/upload", async (req, res) => {
  try {
    const assetId = req.query.assetId;

    if (!assetId) {
      return res.status(400).json({ error: "Missing assetId query parameter" });
    }

    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: "Missing GLB file data" });
    }

    console.log(`\n=== Asset Upload Request ===`);
    console.log(`Asset ID: ${assetId}`);
    console.log(`File size: ${req.body.length} bytes`);

    // Upload asset and generate LODs
    const result = await assetManager.uploadAsset(assetId, req.body);

    console.log(`=== Upload Complete ===\n`);

    res.json({
      success: true,
      ...result,
    });

    // Notify all connected clients about new asset
    broadcastToAll({
      type: "asset_uploaded",
      assetId: result.assetId,
      lodLevels: result.lodLevels,
    });
  } catch (error) {
    console.error("Asset upload error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/assets
 * List all available assets
 */
app.get("/api/assets", (req, res) => {
  const assets = assetManager.listAssets();
  res.json({ assets });
});

/**
 * GET /api/assets/:assetId
 * Get information about a specific asset
 */
app.get("/api/assets/:assetId", (req, res) => {
  const assetInfo = assetManager.getAssetInfo(req.params.assetId);

  if (!assetInfo) {
    return res.status(404).json({ error: "Asset not found" });
  }

  res.json(assetInfo);
});

/**
 * DELETE /api/assets/:assetId
 * Remove an asset and its cached LODs
 */
app.delete("/api/assets/:assetId", async (req, res) => {
  try {
    await assetManager.removeAsset(req.params.assetId);

    res.json({
      success: true,
      message: `Asset ${req.params.assetId} removed`,
    });

    // Notify all connected clients
    broadcastToAll({
      type: "asset_removed",
      assetId: req.params.assetId,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

function broadcastToAll(message) {
  const messageStr = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

const PORT = process.env.PORT || 3000;

// Initialize asset manager and start server
(async () => {
  try {
    await assetManager.init();
    console.log("Asset manager initialized");

    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(
        `Upload assets via: POST http://localhost:${PORT}/api/assets/upload?assetId=<id>`,
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();
