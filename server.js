const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const AssetManager = require("./lib/assetManager");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

const clients = new Map();
const assetManager = new AssetManager();

// Asset streaming configuration
const CHUNK_SIZE = 16 * 1024; // 16KB chunks

wss.on("connection", (ws) => {
  const clientId = generateId();
  clients.set(clientId, ws);

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
        // Handle asset request
        await handleAssetRequest(
          clientId,
          ws,
          data.assetId,
          data.lod || "high",
        );
      } else if (data.type === "list_assets") {
        // Send list of available assets
        ws.send(
          JSON.stringify({
            type: "asset_list",
            assets: assetManager.listAssets(),
          }),
        );
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  });

  ws.on("close", () => {
    clients.delete(clientId);
    console.log(
      `Client ${clientId} disconnected. Total clients: ${clients.size}`,
    );

    broadcastToOthers(clientId, {
      type: "peer-disconnected",
      peerId: clientId,
    });
  });

  ws.send(
    JSON.stringify({
      type: "welcome",
      id: clientId,
      peers: Array.from(clients.keys()).filter((id) => id !== clientId),
    }),
  );

  broadcastToOthers(clientId, {
    type: "peer-connected",
    peerId: clientId,
  });
});

async function handleAssetRequest(clientId, ws, assetId, lod = "high") {
  try {
    console.log(`Client ${clientId} requested asset: ${assetId} (LOD: ${lod})`);

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

    console.log(`Completed streaming asset ${assetId} to client ${clientId}`);
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

function broadcastToOthers(excludeId, message) {
  const messageStr = JSON.stringify(message);
  clients.forEach((client, id) => {
    if (id !== excludeId && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
