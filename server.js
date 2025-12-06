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

  // Initialize object count for this room
  const objects = objectSync.getRoomObjects(roomInfo.room);
  objectCount.set({ room: roomInfo.room }, objects.length);

  console.log(`Client ${clientId} connected. Total clients: ${clients.size}`);

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);

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
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  });

  ws.on("close", () => {
    const room = roomManager.removeUser(clientId);
    clients.delete(clientId);
    adaptiveStreaming.removeClient(clientId);
    foveatedStreaming.removeClient(clientId);

    // Update metrics
    wsConnections.set(clients.size);
    if (room) {
      const roomUsersList = roomManager.getRoomUsers(room) || [];
      roomUsers.set({ room: room }, roomUsersList.length);
    }
    bandwidthGauge.remove({ client_id: clientId });

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
