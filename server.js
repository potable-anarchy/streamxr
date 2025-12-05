const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const AssetManager = require('./lib/assetManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

const clients = new Map();
const assetManager = new AssetManager(path.join(__dirname, 'public'));

// Asset streaming configuration
const CHUNK_SIZE = 16 * 1024; // 16KB chunks

wss.on('connection', (ws) => {
  const clientId = generateId();
  clients.set(clientId, ws);

  console.log(`Client ${clientId} connected. Total clients: ${clients.size}`);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'signal') {
        broadcastToOthers(clientId, {
          type: 'signal',
          from: clientId,
          signal: data.signal
        });
      } else if (data.type === 'request-asset') {
        // Handle asset request
        await handleAssetRequest(clientId, ws, data.assetId);
      } else if (data.type === 'list-assets') {
        // Send list of available assets
        ws.send(JSON.stringify({
          type: 'asset-list',
          assets: assetManager.listAssets()
        }));
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    console.log(`Client ${clientId} disconnected. Total clients: ${clients.size}`);

    broadcastToOthers(clientId, {
      type: 'peer-disconnected',
      peerId: clientId
    });
  });

  ws.send(JSON.stringify({
    type: 'welcome',
    id: clientId,
    peers: Array.from(clients.keys()).filter(id => id !== clientId)
  }));

  broadcastToOthers(clientId, {
    type: 'peer-connected',
    peerId: clientId
  });
});

async function handleAssetRequest(clientId, ws, assetId) {
  try {
    console.log(`Client ${clientId} requested asset: ${assetId}`);

    const assetData = await assetManager.loadAssetData(assetId);

    // Send asset metadata first
    ws.send(JSON.stringify({
      type: 'asset-start',
      assetId: assetData.id,
      totalSize: assetData.size,
      totalChunks: Math.ceil(assetData.size / CHUNK_SIZE)
    }));

    // Stream asset data in chunks
    let offset = 0;
    let chunkIndex = 0;

    while (offset < assetData.size) {
      const chunkSize = Math.min(CHUNK_SIZE, assetData.size - offset);
      const chunk = assetData.data.slice(offset, offset + chunkSize);

      // Send chunk metadata as JSON, followed by binary data
      const chunkInfo = {
        type: 'asset-chunk',
        assetId: assetData.id,
        chunkIndex: chunkIndex,
        chunkSize: chunkSize,
        offset: offset
      };

      // Send metadata
      ws.send(JSON.stringify(chunkInfo));

      // Send binary chunk
      ws.send(chunk);

      offset += chunkSize;
      chunkIndex++;

      console.log(`Sent chunk ${chunkIndex} of ${assetId} (${chunkSize} bytes)`);
    }

    // Send completion message
    ws.send(JSON.stringify({
      type: 'asset-complete',
      assetId: assetData.id
    }));

    console.log(`Completed streaming asset ${assetId} to client ${clientId}`);

  } catch (error) {
    console.error(`Error streaming asset ${assetId}:`, error);

    ws.send(JSON.stringify({
      type: 'asset-error',
      assetId: assetId,
      error: error.message
    }));
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
