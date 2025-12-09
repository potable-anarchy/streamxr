let scene, camera, renderer, cube;
let ws;
let clientId;
let clientColor;
let peers = new Map();
let gltfLoader;

// WebSocket reconnection state
let wsReconnection = {
  attempts: 0,
  maxAttempts: 10,
  baseDelay: 1000, // Start with 1 second
  maxDelay: 30000, // Cap at 30 seconds
  isReconnecting: false,
  connectionTimeout: null,
};

// Detect iOS Safari for platform-specific handling
const isIOSSafari =
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  /Safari/.test(navigator.userAgent) &&
  !/CriOS|FxiOS|OPiOS/.test(navigator.userAgent);

// Multiuser state
let avatars = new Map(); // Store avatar meshes for other users
let userPositions = new Map(); // Store positions of other users

// Shared objects state
let sharedObjects = new Map(); // objectId -> THREE.Mesh
let roomId = "default"; // Default room

// Asset streaming state
let assetStreams = new Map(); // Track incoming asset streams
let expectingBinaryChunk = false; // Global flag for next binary message

// Bandwidth monitoring
let bandwidthMonitor = {
  downloadStart: 0,
  bytesReceived: 0,
  currentBandwidth: 0,
  lastReportTime: 0,
  reportInterval: 2000, // Report every 2 seconds
  recommendedLOD: "low",
};

// Bandwidth simulation state
let bandwidthSimulation = {
  enabled: true, // Start in LOW bandwidth mode by default
  forcedLOD: "low", // Force LOW LOD on startup
};

// NeRF streaming state
let nerfStreams = new Map(); // Track incoming NeRF data streams (assetId -> stream data)

// Head tracking state
let headTracking = {
  enabled: false,
  lastSentTime: 0,
  sendInterval: 100, // Send head position every 100ms (10 FPS)
  normalInterval: 100, // Normal mode: 10 FPS
  slowInterval: 200, // Slow mode: 5 FPS
};

// Bandwidth simulation state
let simulationMode = {
  enabled: false,
  artificialLatency: 100, // 100ms artificial delay when enabled
};

// Network stats state
let networkStats = {
  updateInterval: 500, // Update every 500ms
  lastUpdateTime: 0,
  frameCount: 0,
  lastFpsTime: 0,
  fps: 0,
  latency: 0,
  lastPingTime: 0,
  pingInterval: 2000, // Ping server every 2 seconds
  totalDataTransferred: 0, // Total bytes transferred
};

// Render mode state
let renderMode = "glb"; // 'glb' or 'nerf'
let gaussianRenderer = null; // GaussianSplatRenderer instance
let nerfAvailable = false; // Whether NeRF data is available from server

// Shared transform for both GLB and NeRF (keeps them in sync)
let sharedTransform = {
  position: { x: 0, y: 0, z: -2 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1.5, y: 1.5, z: 1.5 },
  // NeRF-specific rotation offset (if needed to match GLB orientation)
  nerfRotationOffset: { x: Math.PI, y: Math.PI, z: 0 }, // 180° X and Y rotation
};

function initThreeJS() {
  const container = document.getElementById("canvas-container");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  );
  camera.position.z = 5;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  // Initialize DRACOLoader
  const dracoLoader = new THREE.DRACOLoader();
  dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");

  // Initialize GLTFLoader with DRACO support
  gltfLoader = new THREE.GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0x4caf50,
    roughness: 0.5,
    metalness: 0.5,
  });
  cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);

  window.addEventListener("resize", onWindowResize);

  // Use setAnimationLoop for XR compatibility
  renderer.setAnimationLoop(animate);
}

function animate() {
  // Update FPS counter for network stats
  updateFpsCounter();

  // Model rotation disabled - model is now static
  // if (cube && !grabbedObject) {
  //   cube.rotation.x += 0.01;
  //   cube.rotation.y += 0.01;
  // }

  // Send head tracking data periodically
  sendHeadTrackingData();

  // Update hand tracking
  updateHandIndicators();
  updateGrabbedObject();

  // Update Gaussian Splat renderer when in NeRF mode
  if (renderMode === "nerf" && gaussianRenderer) {
    gaussianRenderer.update();
  }

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}`;

  console.log(
    `[WebSocket] Attempting connection to ${wsUrl} (attempt ${wsReconnection.attempts + 1}/${wsReconnection.maxAttempts})`,
  );
  if (isIOSSafari) {
    console.log("[WebSocket] iOS Safari detected - using extended timeout");
  }

  try {
    ws = new WebSocket(wsUrl);
  } catch (error) {
    console.error("[WebSocket] Failed to create WebSocket:", error);
    scheduleReconnect();
    return;
  }

  // Set binary type to arraybuffer for easier handling
  ws.binaryType = "arraybuffer";

  // Set connection timeout (iOS Safari needs more time)
  const timeoutDuration = isIOSSafari ? 10000 : 5000;
  wsReconnection.connectionTimeout = setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      console.error(
        `[WebSocket] Connection timeout after ${timeoutDuration}ms`,
      );
      ws.close();
    }
  }, timeoutDuration);

  ws.onopen = () => {
    console.log("[WebSocket] Connected successfully");
    updateStatus("ws-status", "Connected", "connected");

    // Clear connection timeout
    if (wsReconnection.connectionTimeout) {
      clearTimeout(wsReconnection.connectionTimeout);
      wsReconnection.connectionTimeout = null;
    }

    // Reset reconnection state on successful connection
    wsReconnection.attempts = 0;
    wsReconnection.isReconnecting = false;
  };

  ws.onmessage = (event) => {
    // Check if this is binary data
    if (event.data instanceof ArrayBuffer) {
      console.log("Received binary data, size:", event.data.byteLength);
      // Try NeRF chunk handler first, then fall back to asset chunk handler
      if (!handleNeRFChunkData(event.data)) {
        handleAssetChunkData(event.data);
      }
    } else {
      // Handle JSON messages
      try {
        const data = JSON.parse(event.data);
        handleSignalingMessage(data);
      } catch (error) {
        console.error("Error parsing JSON message:", error, event.data);
      }
    }
  };

  ws.onclose = (event) => {
    console.log(
      `[WebSocket] Disconnected (code: ${event.code}, reason: ${event.reason || "none"})`,
    );
    updateStatus("ws-status", "Disconnected", "disconnected");

    // Clean up peer connections
    peers.forEach((peer) => peer.destroy());
    peers.clear();
    updatePeerCount();

    // Attempt reconnection
    scheduleReconnect();
  };

  ws.onerror = (error) => {
    console.error("[WebSocket] Error:", error);
    // Note: onerror is always followed by onclose, so reconnection is handled there
  };
}

function scheduleReconnect() {
  // Don't reconnect if already reconnecting or max attempts reached
  if (wsReconnection.isReconnecting) {
    console.log("[WebSocket] Reconnection already scheduled");
    return;
  }

  if (wsReconnection.attempts >= wsReconnection.maxAttempts) {
    console.error(
      `[WebSocket] Max reconnection attempts (${wsReconnection.maxAttempts}) reached. Please refresh the page.`,
    );
    updateStatus("ws-status", "Failed (refresh page)", "disconnected");
    return;
  }

  wsReconnection.isReconnecting = true;
  wsReconnection.attempts++;

  // Exponential backoff: delay = baseDelay * 2^attempts (capped at maxDelay)
  const delay = Math.min(
    wsReconnection.baseDelay * Math.pow(2, wsReconnection.attempts - 1),
    wsReconnection.maxDelay,
  );

  console.log(`[WebSocket] Reconnecting in ${delay}ms...`);
  updateStatus(
    "ws-status",
    `Reconnecting (${wsReconnection.attempts}/${wsReconnection.maxAttempts})...`,
    "pending",
  );

  setTimeout(() => {
    wsReconnection.isReconnecting = false;
    initWebSocket();
  }, delay);
}

function handleSignalingMessage(data) {
  console.log("Received message type:", data.type);

  switch (data.type) {
    case "welcome":
      clientId = data.id;
      clientColor = data.color;
      document.getElementById("client-id").textContent = clientId.substring(
        0,
        8,
      );
      console.log("Client ID:", clientId, "Color:", clientColor);

      data.peers.forEach((peerId) => {
        createPeerConnection(peerId, true);
      });

      // Create avatars for existing users
      if (data.userPositions) {
        Object.keys(data.userPositions).forEach((userId) => {
          if (userId !== clientId) {
            const userData = data.userPositions[userId];
            createAvatar(userId, userData.color);
            updateAvatarPosition(userId, userData);
          }
        });
      }

      // Request asset list to check for NeRF availability
      requestAssetList();

      // Request an asset after connection (adaptive streaming will select LOD)
      setTimeout(() => requestAsset("helmet"), 1000);

      // Request existing objects in the room
      requestRoomObjects();
      break;

    case "peer-connected":
      console.log("Peer connected:", data.peerId);
      createAvatar(data.peerId, data.color);
      break;

    case "peer-disconnected":
      console.log("Peer disconnected:", data.peerId);
      if (peers.has(data.peerId)) {
        peers.get(data.peerId).destroy();
        peers.delete(data.peerId);
        updatePeerCount();
      }
      removeAvatar(data.peerId);
      break;

    case "user-position":
      updateAvatarPosition(data.userId, {
        position: data.position,
        rotation: data.rotation,
        quaternion: data.quaternion,
      });
      break;

    case "signal":
      if (!peers.has(data.from)) {
        createPeerConnection(data.from, false);
      }
      peers.get(data.from).signal(data.signal);
      break;

    case "asset_metadata":
      handleAssetStart(data);
      break;

    case "asset_chunk":
      handleAssetChunkMetadata(data);
      break;

    case "asset_complete":
      handleAssetComplete(data);
      break;

    case "asset_error":
      console.error("Asset error:", data.error);
      updateStatus("binary-status", "Error: " + data.error, "disconnected");
      break;

    case "asset_list":
      console.log("Available assets:", data.assets);
      // Check if helmet asset has NeRF available
      handleAssetList(data.assets);
      break;

    case "lod-recommendation":
      handleLODRecommendation(data.lod);
      break;

    case "simulation-mode-changed":
      handleSimulationModeChanged(data.enabled, data.lod);
      break;

    case "room-objects":
      handleRoomObjects(data.objects);
      break;

    case "object-created":
      handleObjectCreated(data.object);
      break;

    case "object-updated":
      handleObjectUpdated(data.object);
      break;

    case "object-deleted":
      handleObjectDeleted(data.objectId);
      break;

    case "nerf_metadata":
      handleNeRFMetadata(data);
      break;

    case "nerf_chunk":
      handleNeRFChunk(data);
      break;

    case "nerf_complete":
      handleNeRFComplete(data);
      break;

    case "nerf_error":
      handleNeRFError(data);
      break;

    case "pong":
      handlePong(data);
      break;

    default:
      console.warn("Unknown message type:", data.type);
  }
}

function createPeerConnection(peerId, initiator) {
  console.log(
    `Creating peer connection with ${peerId}, initiator: ${initiator}`,
  );

  const peer = new SimplePeer({
    initiator: initiator,
    trickle: true,
  });

  peer.on("signal", (signal) => {
    ws.send(
      JSON.stringify({
        type: "signal",
        signal: signal,
      }),
    );
  });

  peer.on("connect", () => {
    console.log(`WebRTC connected to peer ${peerId}`);
    updatePeerCount();
    sendBinaryData(peer);
  });

  peer.on("data", (data) => {
    console.log(`Received data from ${peerId}:`, data);
    handleBinaryData(data);
  });

  peer.on("close", () => {
    console.log(`Peer ${peerId} closed`);
    peers.delete(peerId);
    updatePeerCount();
  });

  peer.on("error", (err) => {
    console.error(`Peer ${peerId} error:`, err);
  });

  peers.set(peerId, peer);
}

function sendBinaryData(peer) {
  const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  console.log("Sending binary data:", testData);
  peer.send(testData);

  const array = new Float32Array([1.5, 2.5, 3.5, 4.5]);
  peer.send(array);

  updateStatus("binary-status", "Sent", "connected");
}

function handleBinaryData(data) {
  if (data instanceof ArrayBuffer) {
    const view = new Uint8Array(data);
    console.log("Received binary data (ArrayBuffer):", view);
    updateStatus("binary-status", "Received", "connected");
    trackDataReceived(data.byteLength);
  } else if (data instanceof Uint8Array) {
    console.log("Received binary data (Uint8Array):", data);
    updateStatus("binary-status", "Received", "connected");
    trackDataReceived(data.length);
  } else {
    console.log("Received data:", data);
  }
}

function updatePeerCount() {
  document.getElementById("peer-count").textContent = peers.size;
}

function updateStatus(elementId, text, className) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = text;
    element.className = className;
  }
}

// Avatar management functions

function createAvatar(userId, color) {
  if (avatars.has(userId)) {
    console.log("Avatar already exists for user:", userId);
    return;
  }

  // AVATARS DISABLED - Uncomment below to re-enable
  console.log("Avatar creation disabled - skipping user:", userId);
  avatars.set(userId, null);
  return;

  /* DISABLED AVATAR CODE
  console.log("Creating avatar for user:", userId, "with color:", color);

  const avatarGroup = new THREE.Group();

  // Create a simple avatar (sphere for head, cylinder for body)
  const headGeometry = new THREE.SphereGeometry(0.2, 16, 16);
  const headMaterial = new THREE.MeshStandardMaterial({
    color: color || 0xff6b6b,
    roughness: 0.5,
    metalness: 0.3,
  });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 0.3;

  const bodyGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.5, 16);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: color || 0xff6b6b,
    roughness: 0.5,
    metalness: 0.3,
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = -0.05;

  // Add a small indicator above the avatar
  const indicatorGeometry = new THREE.ConeGeometry(0.1, 0.2, 8);
  const indicatorMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
  });
  const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
  indicator.position.y = 0.7;
  indicator.rotation.x = Math.PI;

  avatarGroup.add(head);
  avatarGroup.add(body);
  avatarGroup.add(indicator);

  avatarGroup.userData.userId = userId;
  avatarGroup.userData.color = color;

  scene.add(avatarGroup);
  avatars.set(userId, avatarGroup);

  console.log("Avatar created and added to scene for user:", userId);
  */
}

function removeAvatar(userId) {
  const avatar = avatars.get(userId);
  if (avatar) {
    scene.remove(avatar);
    avatars.delete(userId);
    userPositions.delete(userId);
    console.log("Avatar removed for user:", userId);
  }
}

function updateAvatarPosition(userId, positionData) {
  // Store position data
  userPositions.set(userId, positionData);

  const avatar = avatars.get(userId);
  if (!avatar) {
    return;
  }

  if (positionData.position) {
    avatar.position.set(
      positionData.position[0],
      positionData.position[1],
      positionData.position[2],
    );
  }

  if (positionData.quaternion) {
    avatar.quaternion.set(
      positionData.quaternion[0],
      positionData.quaternion[1],
      positionData.quaternion[2],
      positionData.quaternion[3],
    );
  } else if (positionData.rotation) {
    avatar.rotation.set(
      positionData.rotation[0],
      positionData.rotation[1],
      positionData.rotation[2],
    );
  }
}

// Asset Streaming Functions

function requestAssetList() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log("Requesting asset list...");
    ws.send(JSON.stringify({ type: "list_assets" }));
  }
}

function requestAsset(assetId, lod = null) {
  if (!assetId) {
    console.error("requestAsset called with undefined assetId");
    return;
  }

  // Override LOD if bandwidth simulation is enabled
  if (bandwidthSimulation.enabled && bandwidthSimulation.forcedLOD) {
    lod = bandwidthSimulation.forcedLOD;
    console.log(`Bandwidth simulation active - forcing LOD: ${lod}`);
  }

  console.log("Requesting asset:", assetId, lod ? `LOD: ${lod}` : "(adaptive)");
  ws.send(
    JSON.stringify({
      type: "request_asset",
      assetId: assetId,
      lod: lod, // null means use adaptive streaming
    }),
  );
  updateStatus("binary-status", "Requesting...", "pending");
}

function handleAssetStart(data) {
  console.log(
    `Starting asset download: ${data.assetId}, LOD: ${data.lod}, size: ${data.size} bytes, chunks: ${data.chunks}`,
  );

  assetStreams.set(data.assetId, {
    assetId: data.assetId,
    lod: data.lod,
    totalSize: data.size,
    totalChunks: data.chunks,
    receivedChunks: 0,
    chunks: [],
    currentOffset: 0,
  });

  // Start bandwidth monitoring
  bandwidthMonitor.downloadStart = Date.now();
  bandwidthMonitor.bytesReceived = 0;

  updateStatus("binary-status", `Downloading (0/${data.chunks})`, "pending");
}

function handleAssetChunkMetadata(data) {
  const stream = assetStreams.get(data.assetId);
  if (!stream) {
    console.error("Received chunk metadata for unknown asset:", data.assetId);
    return;
  }

  // Store that we're expecting a binary chunk next
  stream.expectingChunk = true;
  stream.currentChunkIndex = data.chunkIndex;
  expectingBinaryChunk = true;

  console.log(
    `Expecting binary chunk ${data.chunkIndex}/${data.totalChunks} for ${data.assetId}`,
  );
}

function handleAssetChunkData(arrayBuffer) {
  if (!expectingBinaryChunk) {
    console.error("Received unexpected binary data");
    return;
  }

  // Find the stream that is expecting a chunk
  let targetStream = null;
  let targetAssetId = null;

  for (const [assetId, stream] of assetStreams) {
    if (stream.expectingChunk) {
      targetStream = stream;
      targetAssetId = assetId;
      break;
    }
  }

  if (!targetStream) {
    console.error("Received binary chunk but no stream is expecting it");
    expectingBinaryChunk = false;
    return;
  }

  const chunkData = new Uint8Array(arrayBuffer);

  // Store the chunk
  targetStream.chunks.push(chunkData);
  targetStream.receivedChunks++;

  // Update bandwidth monitoring
  bandwidthMonitor.bytesReceived += chunkData.length;
  updateBandwidthMetrics();

  // Track total data for stats overlay
  trackDataReceived(chunkData.length);

  console.log(
    `Received chunk ${targetStream.receivedChunks}/${targetStream.totalChunks} for ${targetAssetId} (${chunkData.length} bytes)`,
  );

  // Reset flags
  targetStream.expectingChunk = false;
  expectingBinaryChunk = false;

  // Update status
  updateStatus(
    "binary-status",
    `Downloading (${targetStream.receivedChunks}/${targetStream.totalChunks})`,
    "pending",
  );
}

function handleAssetComplete(data) {
  const stream = assetStreams.get(data.assetId);
  if (!stream) {
    console.error("Received completion for unknown asset:", data.assetId);
    return;
  }

  console.log(
    `Asset download complete: ${data.assetId}, received ${stream.receivedChunks} chunks`,
  );

  // Combine all chunks into single buffer
  let totalLength = 0;
  stream.chunks.forEach((chunk) => (totalLength += chunk.length));

  const combinedBuffer = new Uint8Array(totalLength);
  let offset = 0;
  stream.chunks.forEach((chunk) => {
    combinedBuffer.set(chunk, offset);
    offset += chunk.length;
  });

  console.log(`Combined buffer size: ${combinedBuffer.length} bytes`);

  // Create blob from combined buffer
  const blob = new Blob([combinedBuffer], { type: "model/gltf-binary" });
  const url = URL.createObjectURL(blob);

  // Load the GLB model
  loadGLBModel(url, data.assetId, stream.lod);

  // Clean up
  assetStreams.delete(data.assetId);
}

function loadGLBModel(url, assetId, lod) {
  console.log("Loading GLB model:", assetId, "LOD:", lod, "from URL:", url);
  updateStatus("binary-status", "Loading GLB...", "pending");

  gltfLoader.load(
    url,
    (gltf) => {
      console.log("GLB model loaded successfully:", assetId);

      // Remove the old cube
      if (cube) {
        scene.remove(cube);
      }

      // Add the loaded model to the scene
      const model = gltf.scene;
      // Use shared transform to keep GLB and NeRF in sync
      model.position.set(
        sharedTransform.position.x,
        sharedTransform.position.y,
        sharedTransform.position.z,
      );
      model.rotation.set(
        sharedTransform.rotation.x,
        sharedTransform.rotation.y,
        sharedTransform.rotation.z,
      );
      model.scale.set(
        sharedTransform.scale.x,
        sharedTransform.scale.y,
        sharedTransform.scale.z,
      );

      // Store asset metadata for adaptive streaming
      model.userData.assetId = assetId;
      model.userData.lod = lod;

      scene.add(model);

      // Store reference for animation
      cube = model;

      console.log("Model added to scene");
      updateStatus("binary-status", "GLB Loaded!", "connected");
      URL.revokeObjectURL(url);
    },
    (progress) => {
      console.log("Loading progress:", progress);
    },
    (error) => {
      console.error("Error loading GLB model:", error);
      updateStatus("binary-status", "Load Error", "disconnected");
      URL.revokeObjectURL(url);
    },
  );
}

// NeRF/Gaussian Splat Streaming Functions

/**
 * Request a NeRF/Gaussian Splat asset from the server
 * @param {string} assetId - The asset identifier (e.g., 'helmet', 'room')
 */
function requestNeRF(assetId) {
  if (!assetId) {
    console.error("[NeRF] requestNeRF called with undefined assetId");
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error("[NeRF] Cannot request NeRF: WebSocket not connected");
    return;
  }

  console.log("[NeRF] Requesting NeRF asset:", assetId);

  ws.send(
    JSON.stringify({
      type: "request_nerf",
      assetId: assetId,
    }),
  );

  updateStatus("binary-status", "Requesting NeRF...", "pending");
}

/**
 * Handle NeRF metadata message from server
 * Initializes the stream state for receiving chunks
 * @param {Object} data - Metadata including assetId, format, size, chunks
 */
function handleNeRFMetadata(data) {
  console.log(
    `[NeRF] Starting NeRF download: ${data.assetId}, format: ${data.format}, size: ${data.size} bytes, chunks: ${data.chunks}`,
  );

  // Initialize stream state for this NeRF asset
  nerfStreams.set(data.assetId, {
    assetId: data.assetId,
    format: data.format,
    totalSize: data.size,
    totalChunks: data.chunks,
    receivedChunks: 0,
    chunks: [],
    expectingChunk: false,
    currentChunkIndex: 0,
  });

  // Start bandwidth monitoring for this download
  bandwidthMonitor.downloadStart = Date.now();
  bandwidthMonitor.bytesReceived = 0;

  updateStatus("binary-status", `NeRF: (0/${data.chunks})`, "pending");
}

/**
 * Handle NeRF chunk metadata - indicates binary data is coming next
 * @param {Object} data - Chunk metadata including assetId, chunkIndex, totalChunks
 */
function handleNeRFChunk(data) {
  const stream = nerfStreams.get(data.assetId);
  if (!stream) {
    console.error(
      "[NeRF] Received chunk for unknown NeRF asset:",
      data.assetId,
    );
    return;
  }

  // Mark that we're expecting binary chunk data next
  stream.expectingChunk = true;
  stream.currentChunkIndex = data.chunkIndex;

  console.log(
    `[NeRF] Expecting binary chunk ${data.chunkIndex + 1}/${data.totalChunks} for ${data.assetId}`,
  );
}

/**
 * Handle binary NeRF chunk data
 * Called from WebSocket onmessage when binary data is received
 * @param {ArrayBuffer} arrayBuffer - The raw chunk data
 */
function handleNeRFChunkData(arrayBuffer) {
  // Find the stream that is expecting a chunk
  let targetStream = null;
  let targetAssetId = null;

  for (const [assetId, stream] of nerfStreams) {
    if (stream.expectingChunk) {
      targetStream = stream;
      targetAssetId = assetId;
      break;
    }
  }

  if (!targetStream) {
    // Not a NeRF chunk, might be asset chunk - let existing handler try
    return false;
  }

  const chunkData = new Uint8Array(arrayBuffer);

  // Store the chunk
  targetStream.chunks.push(chunkData);
  targetStream.receivedChunks++;

  // Update bandwidth monitoring
  bandwidthMonitor.bytesReceived += chunkData.length;
  updateBandwidthMetrics();

  // Track total data for stats overlay
  trackDataReceived(chunkData.length);

  console.log(
    `[NeRF] Received chunk ${targetStream.receivedChunks}/${targetStream.totalChunks} for ${targetAssetId} (${chunkData.length} bytes)`,
  );

  // Reset expecting flag
  targetStream.expectingChunk = false;

  // Update status
  updateStatus(
    "binary-status",
    `NeRF: (${targetStream.receivedChunks}/${targetStream.totalChunks})`,
    "pending",
  );

  return true; // Indicate we handled the data
}

/**
 * Handle NeRF download complete message
 * Combines chunks and loads the Gaussian Splat model
 * @param {Object} data - Completion data including assetId
 */
function handleNeRFComplete(data) {
  const stream = nerfStreams.get(data.assetId);
  if (!stream) {
    console.error(
      "[NeRF] Received completion for unknown NeRF asset:",
      data.assetId,
    );
    return;
  }

  console.log(
    `[NeRF] Download complete: ${data.assetId}, received ${stream.receivedChunks} chunks`,
  );

  // Combine all chunks into single buffer
  let totalLength = 0;
  stream.chunks.forEach((chunk) => (totalLength += chunk.length));

  const combinedBuffer = new Uint8Array(totalLength);
  let offset = 0;
  stream.chunks.forEach((chunk) => {
    combinedBuffer.set(chunk, offset);
    offset += chunk.length;
  });

  console.log(`[NeRF] Combined buffer size: ${combinedBuffer.length} bytes`);

  // Create blob from combined buffer
  const mimeType = getMimeTypeForFormat(stream.format);
  const blob = new Blob([combinedBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);

  // Load the Gaussian Splat model
  loadNeRFModel(url, data.assetId, stream.format);

  // Clean up stream state
  nerfStreams.delete(data.assetId);
}

/**
 * Handle NeRF streaming error from server
 * @param {Object} data - Error data including assetId and error message
 */
function handleNeRFError(data) {
  console.error(`[NeRF] Error streaming ${data.assetId}:`, data.error);

  // Clean up any partial stream state
  if (data.assetId) {
    nerfStreams.delete(data.assetId);
  }

  // Disable NeRF button and show error state
  updateNeRFButtonState(false);

  // Auto-switch to GLB mode on error
  if (renderMode === "nerf") {
    console.log("[NeRF] Auto-switching to GLB mode due to error");
    setRenderMode("glb");
  }

  updateStatus("binary-status", "NeRF Error: " + data.error, "disconnected");
}

/**
 * Get MIME type for NeRF format
 * @param {string} format - File format (splat, ply, ksplat)
 * @returns {string} MIME type
 */
function getMimeTypeForFormat(format) {
  switch (format) {
    case "splat":
      return "application/octet-stream";
    case "ply":
      return "application/x-ply";
    case "ksplat":
      return "application/octet-stream";
    default:
      return "application/octet-stream";
  }
}

/**
 * Load a NeRF/Gaussian Splat model from URL
 * @param {string} url - Blob URL to the splat data
 * @param {string} assetId - Asset identifier
 * @param {string} format - File format (splat, ply, ksplat)
 */
function loadNeRFModel(url, assetId, format) {
  console.log(
    "[NeRF] Loading Gaussian Splat model:",
    assetId,
    "format:",
    format,
  );
  updateStatus("binary-status", "Loading NeRF...", "pending");

  // Initialize GaussianSplatRenderer if not already created
  if (!gaussianRenderer) {
    gaussianRenderer = new GaussianSplatRenderer(scene, camera, renderer);
    console.log("[NeRF] GaussianSplatRenderer initialized");
  }

  // Load the splat model
  gaussianRenderer
    .loadSplat(url, {
      onProgress: (progress) => {
        const percent = Math.round(progress * 100);
        updateStatus("binary-status", `NeRF: ${percent}%`, "pending");
      },
      onLoad: (splatMesh) => {
        console.log("[NeRF] Gaussian Splat loaded successfully:", assetId);

        // Enable the NeRF button now that model is loaded
        updateNeRFButtonState(true);

        // Use shared transform to keep GLB and NeRF in sync
        gaussianRenderer.setPosition(
          sharedTransform.position.x,
          sharedTransform.position.y,
          sharedTransform.position.z,
        );
        gaussianRenderer.setRotation(
          sharedTransform.rotation.x + sharedTransform.nerfRotationOffset.x,
          sharedTransform.rotation.y + sharedTransform.nerfRotationOffset.y,
          sharedTransform.rotation.z + sharedTransform.nerfRotationOffset.z,
        );
        gaussianRenderer.setScale(
          sharedTransform.scale.x,
          sharedTransform.scale.y,
          sharedTransform.scale.z,
        );

        // Initially hide the splat mesh (user must click NeRF button to view)
        if (splatMesh) {
          splatMesh.visible = false;
          splatMesh.userData = {
            assetId: assetId,
            format: format,
            renderMode: "nerf",
          };
        }

        updateStatus("binary-status", "NeRF Ready", "connected");
        updateModeButtons();
        URL.revokeObjectURL(url);
      },
      onError: (error) => {
        console.error("[NeRF] Failed to load Gaussian Splat:", error);
        updateStatus("binary-status", "NeRF Load Error", "disconnected");
        updateNeRFButtonState(false);
        // Auto-switch to GLB mode on load error
        if (renderMode === "nerf") {
          setRenderMode("glb");
        }
        URL.revokeObjectURL(url);
      },
    })
    .catch((error) => {
      console.error("[NeRF] Error in loadSplat:", error);
      updateStatus("binary-status", "NeRF Load Error", "disconnected");
      updateNeRFButtonState(false);
      // Auto-switch to GLB mode on catch error
      if (renderMode === "nerf") {
        setRenderMode("glb");
      }
      URL.revokeObjectURL(url);
    });
}

/**
 * Toggle between mesh and NeRF render modes
 * @returns {string} The new render mode
 */
function toggleRenderMode() {
  if (renderMode === "mesh") {
    renderMode = "nerf";
    console.log("[NeRF] Switched to NeRF render mode");
  } else {
    renderMode = "mesh";
    console.log("[NeRF] Switched to mesh render mode");
  }
  return renderMode;
}

/**
 * Get current render mode
 * @returns {string} Current render mode ('mesh' or 'nerf')
 */
function getRenderMode() {
  return renderMode;
}

// Bandwidth monitoring functions

function updateBandwidthMetrics() {
  const now = Date.now();
  const elapsed = now - bandwidthMonitor.downloadStart;

  if (elapsed > 0) {
    // Calculate current bandwidth in bytes per second
    bandwidthMonitor.currentBandwidth =
      (bandwidthMonitor.bytesReceived / elapsed) * 1000;

    // Report to server periodically
    if (
      now - bandwidthMonitor.lastReportTime >
      bandwidthMonitor.reportInterval
    ) {
      sendBandwidthMetrics();
      bandwidthMonitor.lastReportTime = now;
    }
  }
}

function sendBandwidthMetrics() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const metrics = {
    bandwidth: bandwidthMonitor.currentBandwidth,
    bytesReceived: bandwidthMonitor.bytesReceived,
    timestamp: Date.now(),
  };

  ws.send(
    JSON.stringify({
      type: "bandwidth-metrics",
      metrics: metrics,
    }),
  );

  console.log(
    `Sent bandwidth metrics: ${(bandwidthMonitor.currentBandwidth / 1024).toFixed(2)} KB/s`,
  );
}

function handleLODRecommendation(lod) {
  console.log(`Server recommends LOD: ${lod}`);
  bandwidthMonitor.recommendedLOD = lod;

  // Update UI to show current LOD (unless simulation is active)
  updateLODIndicator();

  // Don't auto-switch LOD if bandwidth simulation is active
  if (bandwidthSimulation.enabled) {
    console.log(
      "Bandwidth simulation active - ignoring server LOD recommendation",
    );
    return;
  }

  // Auto-request new asset if LOD changed significantly
  const currentAsset = getCurrentAssetLOD();
  if (currentAsset && currentAsset.base && currentAsset.lod !== lod) {
    console.log(
      `LOD changed from ${currentAsset.lod} to ${lod}, requesting new asset...`,
    );
    setTimeout(() => requestAsset(currentAsset.base), 3000);
  }
}

function getCurrentAssetLOD() {
  // Track currently loaded asset
  if (cube && cube.userData) {
    return {
      base: cube.userData.assetId,
      lod: cube.userData.lod || "low",
    };
  }
  return null;
}

// Head tracking functions

/**
 * Send head/camera tracking data to server for foveated streaming
 */
function sendHeadTrackingData() {
  // Only send if WebSocket is connected and enough time has passed
  const now = Date.now();
  if (
    !ws ||
    ws.readyState !== WebSocket.OPEN ||
    now - headTracking.lastSentTime < headTracking.sendInterval
  ) {
    return;
  }

  headTracking.lastSentTime = now;

  // Get camera position and rotation
  const position = [camera.position.x, camera.position.y, camera.position.z];

  // Get camera rotation as Euler angles (in radians)
  const rotation = [camera.rotation.x, camera.rotation.y, camera.rotation.z];

  // Get camera quaternion (more accurate for 3D rotations)
  const quaternion = [
    camera.quaternion.x,
    camera.quaternion.y,
    camera.quaternion.z,
    camera.quaternion.w,
  ];

  const trackingData = {
    type: "head-tracking",
    position: position,
    rotation: rotation,
    quaternion: quaternion,
    fov: camera.fov,
    timestamp: now,
  };

  // Use simulated latency wrapper if in simulation mode
  if (simulationMode.enabled) {
    sendWithSimulatedLatency(trackingData);
  } else {
    ws.send(JSON.stringify(trackingData));
  }
}

/**
 * Enable head tracking for foveated streaming
 */
function enableHeadTracking() {
  headTracking.enabled = true;
  console.log("Head tracking enabled for foveated streaming");
}

/**
 * Disable head tracking
 */
function disableHeadTracking() {
  headTracking.enabled = false;
  console.log("Head tracking disabled");
}

/**
 * Initialize WebXR support for VR/AR head tracking
 * This enables more accurate head tracking in XR mode
 */
function initWebXR() {
  if (!navigator.xr) {
    console.log("WebXR not supported in this browser");
    return;
  }

  console.log("Checking WebXR support...");

  // Check for VR support first
  navigator.xr
    .isSessionSupported("immersive-vr")
    .then((vrSupported) => {
      console.log("VR supported:", vrSupported);

      // Check for AR support (Vision Pro and AR devices)
      navigator.xr
        .isSessionSupported("immersive-ar")
        .then((arSupported) => {
          console.log("AR supported:", arSupported);

          if (vrSupported) {
            console.log("Adding VR button");
            addXRButton("Enter VR", () => enterVR("immersive-vr"), "20px");
          }

          if (arSupported) {
            console.log("Adding AR button");
            addXRButton(
              "Enter AR",
              () => enterVR("immersive-ar"),
              vrSupported ? "140px" : "20px",
            );
          }

          if (!vrSupported && !arSupported) {
            console.log(
              "Neither VR nor AR supported, using desktop head tracking",
            );
          }
        })
        .catch((error) => {
          console.error("Error checking AR support:", error);
        });
    })
    .catch((error) => {
      console.error("Error checking VR support:", error);
    });
}

function addXRButton(text, onClick, leftPosition) {
  const button = document.createElement("button");
  button.textContent = text;
  button.style.position = "absolute";
  button.style.bottom = "20px";
  button.style.left = leftPosition;
  button.style.zIndex = "999";
  button.style.padding = "10px 20px";
  button.style.fontSize = "16px";
  button.onclick = onClick;
  document.body.appendChild(button);
}

/**
 * Enter VR/AR mode with WebXR and hand tracking support
 */
async function enterVR(mode = "immersive-vr") {
  try {
    console.log(`Requesting ${mode} session...`);

    // Request XR session with hand tracking support
    const sessionInit = {
      optionalFeatures: ["local-floor", "hand-tracking", "layers"],
    };

    const session = await navigator.xr.requestSession(mode, sessionInit);

    console.log(`Session created, setting up renderer...`);
    renderer.xr.enabled = true;
    await renderer.xr.setSession(session);

    console.log(`Entered ${mode} mode successfully`);

    // For AR mode, make scene background transparent
    if (mode === "immersive-ar") {
      scene.background = null;
      console.log("AR mode: scene background set to transparent");
    }

    // Enable head tracking for XR
    enableHeadTracking();

    // Setup XR controllers and hand tracking
    setupXRControllers();

    // Monitor input sources for hand tracking
    session.addEventListener("inputsourceschange", (event) => {
      console.log("Input sources changed");
      event.added.forEach((source) => {
        console.log(
          "New input source:",
          source.handedness,
          source.targetRayMode,
        );
        if (source.hand) {
          console.log("Hand tracking available for:", source.handedness);
        }
      });
      event.removed.forEach((source) => {
        console.log("Removed input source:", source.handedness);
      });
    });

    session.addEventListener("end", () => {
      console.log(`${mode} session ended`);
      renderer.xr.enabled = false;
      disableHeadTracking();

      // Restore scene background
      scene.background = new THREE.Color(0x1a1a2e);

      // Clean up hand tracking
      handInputSources.clear();
      handIndicators.forEach((indicator, controller) => {
        removeHandIndicator(controller);
      });
      handControllers = [];
      grabbedObject = null;
      grabbingHand = null;
    });

    console.log("Hand tracking initialized");
  } catch (error) {
    console.error(`Failed to enter ${mode}:`, error);
    alert(
      `Failed to start ${mode} session: ${error.message}\n\nTry reloading the page.`,
    );
  }
}

/**
 * Enable basic camera controls for testing head tracking without VR
 */
function enableCameraControls() {
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };

  renderer.domElement.addEventListener("mousedown", (e) => {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  renderer.domElement.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;

    // Rotate camera
    camera.rotation.y += deltaX * 0.005;
    camera.rotation.x += deltaY * 0.005;

    // Clamp pitch to prevent flipping
    camera.rotation.x = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, camera.rotation.x),
    );

    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  renderer.domElement.addEventListener("mouseup", () => {
    isDragging = false;
  });

  // WASD movement
  const keys = {};
  document.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
  });

  document.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // Update camera position based on keys
  setInterval(() => {
    const moveSpeed = 0.1;
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);

    forward.applyQuaternion(camera.quaternion);
    right.applyQuaternion(camera.quaternion);

    if (keys["w"]) camera.position.add(forward.multiplyScalar(moveSpeed));
    if (keys["s"]) camera.position.add(forward.multiplyScalar(-moveSpeed));
    if (keys["a"]) camera.position.add(right.multiplyScalar(-moveSpeed));
    if (keys["d"]) camera.position.add(right.multiplyScalar(moveSpeed));
  }, 16);

  console.log("Camera controls enabled (WASD + mouse drag)");
}

// Object Synchronization Functions

/**
 * Request all existing objects in the room
 */
function requestRoomObjects() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  ws.send(
    JSON.stringify({
      type: "get-room-objects",
      roomId: roomId,
    }),
  );
}

/**
 * Handle receiving all objects in the room
 */
function handleRoomObjects(objects) {
  console.log(`Received ${objects.length} objects in room ${roomId}`);

  objects.forEach((objectData) => {
    createLocalObject(objectData);
  });
}

/**
 * Spawn a new object in the scene and sync to server
 */
function spawnObject(type = "cube", position = null) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn("Cannot spawn object: WebSocket not connected");
    return;
  }

  // Use random position if not specified
  if (!position) {
    position = [
      (Math.random() - 0.5) * 10, // x: -5 to 5
      Math.random() * 3 + 0.5, // y: 0.5 to 3.5
      (Math.random() - 0.5) * 10 - 2, // z: -7 to 3
    ];
  }

  const objectData = {
    type: type,
    position: position,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: Math.random() * 0xffffff,
    createdBy: clientId,
  };

  ws.send(
    JSON.stringify({
      type: "create-object",
      roomId: roomId,
      objectData: objectData,
    }),
  );
}

/**
 * Handle object creation event from server
 */
function handleObjectCreated(objectData) {
  console.log("Object created:", objectData);
  createLocalObject(objectData);
}

/**
 * Create local THREE.js object from server data
 */
function createLocalObject(objectData) {
  // Don't create if already exists
  if (sharedObjects.has(objectData.id)) {
    console.log("Object already exists:", objectData.id);
    return;
  }

  let geometry;
  switch (objectData.type) {
    case "sphere":
      geometry = new THREE.SphereGeometry(0.5, 32, 32);
      break;
    case "cone":
      geometry = new THREE.ConeGeometry(0.5, 1, 32);
      break;
    case "cube":
    default:
      geometry = new THREE.BoxGeometry(1, 1, 1);
  }

  const material = new THREE.MeshStandardMaterial({
    color: objectData.color,
    roughness: 0.5,
    metalness: 0.3,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...objectData.position);
  mesh.rotation.set(...objectData.rotation);
  mesh.scale.set(...objectData.scale);

  // Store object ID for reference
  mesh.userData.objectId = objectData.id;
  mesh.userData.type = objectData.type;

  scene.add(mesh);
  sharedObjects.set(objectData.id, mesh);

  console.log(`Created local object ${objectData.id} at`, objectData.position);
}

/**
 * Update object position (called during drag or manipulation)
 */
function updateObjectPosition(
  objectId,
  position,
  rotation = null,
  scale = null,
) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const updateData = { position };
  if (rotation) updateData.rotation = rotation;
  if (scale) updateData.scale = scale;

  ws.send(
    JSON.stringify({
      type: "update-object",
      roomId: roomId,
      objectId: objectId,
      updates: updateData,
    }),
  );
}

/**
 * Handle object update event from server
 */
function handleObjectUpdated(objectData) {
  const mesh = sharedObjects.get(objectData.id);
  if (!mesh) {
    console.warn("Updated object not found locally:", objectData.id);
    return;
  }

  // Update mesh position/rotation/scale
  mesh.position.set(...objectData.position);
  mesh.rotation.set(...objectData.rotation);
  mesh.scale.set(...objectData.scale);

  if (objectData.color !== undefined) {
    mesh.material.color.setHex(objectData.color);
  }
}

/**
 * Delete an object
 */
function deleteObject(objectId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  ws.send(
    JSON.stringify({
      type: "delete-object",
      roomId: roomId,
      objectId: objectId,
    }),
  );
}

/**
 * Handle object deletion event from server
 */
function handleObjectDeleted(objectId) {
  const mesh = sharedObjects.get(objectId);
  if (!mesh) {
    console.warn("Deleted object not found locally:", objectId);
    return;
  }

  scene.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose();
  sharedObjects.delete(objectId);

  console.log("Deleted object:", objectId);
}

function handleObjectGrabbed(objectId, userId, objectData) {
  const mesh = sharedObjects.get(objectId);
  if (!mesh) {
    console.warn("Grabbed object not found locally:", objectId);
    return;
  }

  // Store ownership information on the mesh
  mesh.userData.ownedBy = userId;

  // Visual indication: Add highlight if owned by another user
  if (userId !== clientId) {
    addOwnershipIndicator(mesh, userId);
  }

  console.log(`Object ${objectId} grabbed by user ${userId}`);
}

function handleObjectReleased(objectId, userId) {
  const mesh = sharedObjects.get(objectId);
  if (!mesh) {
    console.warn("Released object not found locally:", objectId);
    return;
  }

  // Clear ownership
  mesh.userData.ownedBy = null;

  // Remove ownership indicator
  removeOwnershipIndicator(mesh);

  console.log(`Object ${objectId} released by user ${userId}`);
}

function handleObjectMoved(objectId, position, rotation) {
  const mesh = sharedObjects.get(objectId);
  if (!mesh) {
    console.warn("Moved object not found locally:", objectId);
    return;
  }

  // Don't update if we're currently grabbing this object
  if (grabbedObject && grabbedObject.objectId === objectId) {
    return;
  }

  // Update position and rotation
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
}

function addOwnershipIndicator(mesh, userId) {
  // Remove existing indicator if any
  removeOwnershipIndicator(mesh);

  // Get user color from avatars
  const avatar = avatars.get(userId);
  const userColor = avatar ? avatar.userData.color : 0xff0000;

  // Create a wireframe box around the object
  const box = new THREE.BoxHelper(mesh, userColor);
  box.name = "ownershipIndicator";
  scene.add(box);
  mesh.userData.ownershipIndicator = box;
}

function removeOwnershipIndicator(mesh) {
  if (mesh.userData.ownershipIndicator) {
    scene.remove(mesh.userData.ownershipIndicator);
    mesh.userData.ownershipIndicator.dispose();
    delete mesh.userData.ownershipIndicator;
  }
}

// XR Controller Input and Hand Tracking

// Hand tracking state
let handControllers = [];
let handInputSources = new Map();
let grabbedObject = null;
let grabbingHand = null;
let handIndicators = new Map();

/**
 * Setup XR controllers for object spawning and hand tracking
 */
function setupXRControllers() {
  if (!renderer.xr || !renderer.xr.enabled) {
    console.log("XR not enabled, skipping controller setup");
    return;
  }

  // Controller 1
  const controller1 = renderer.xr.getController(0);
  controller1.addEventListener("selectstart", onSelectStart);
  controller1.addEventListener("selectend", onSelectEnd);
  controller1.addEventListener("connected", onControllerConnected);
  controller1.addEventListener("disconnected", onControllerDisconnected);
  scene.add(controller1);
  handControllers.push(controller1);

  // Controller 2
  const controller2 = renderer.xr.getController(1);
  controller2.addEventListener("selectstart", onSelectStart);
  controller2.addEventListener("selectend", onSelectEnd);
  controller2.addEventListener("connected", onControllerConnected);
  controller2.addEventListener("disconnected", onControllerDisconnected);
  scene.add(controller2);
  handControllers.push(controller2);

  console.log("XR controllers setup complete");
}

/**
 * Handle controller connection event
 */
function onControllerConnected(event) {
  const controller = event.target;
  const inputSource = event.data;

  console.log(
    "Controller connected:",
    inputSource.handedness,
    inputSource.targetRayMode,
  );

  // Check if this is a hand input source
  if (inputSource.hand) {
    console.log("Hand tracking input detected:", inputSource.handedness);
    handInputSources.set(controller, inputSource);
    createHandIndicator(controller, inputSource.handedness);
  } else {
    console.log("Standard controller detected:", inputSource.handedness);
  }

  // Store input source reference
  controller.userData.inputSource = inputSource;
}

/**
 * Handle controller disconnection event
 */
function onControllerDisconnected(event) {
  const controller = event.target;
  const inputSource = controller.userData.inputSource;

  if (inputSource) {
    console.log("Controller disconnected:", inputSource.handedness);
    handInputSources.delete(controller);
    removeHandIndicator(controller);
  }
}

/**
 * Create visual indicator for hand position
 */
function createHandIndicator(controller, handedness) {
  // Create a small sphere to represent hand position
  const geometry = new THREE.SphereGeometry(0.05, 16, 16);
  const material = new THREE.MeshStandardMaterial({
    color: handedness === "left" ? 0x00ffff : 0xff00ff,
    emissive: handedness === "left" ? 0x00ffff : 0xff00ff,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.7,
  });

  const indicator = new THREE.Mesh(geometry, material);
  controller.add(indicator);
  handIndicators.set(controller, indicator);

  console.log(`Hand indicator created for ${handedness} hand`);
}

/**
 * Remove hand indicator
 */
function removeHandIndicator(controller) {
  const indicator = handIndicators.get(controller);
  if (indicator) {
    controller.remove(indicator);
    indicator.geometry.dispose();
    indicator.material.dispose();
    handIndicators.delete(controller);
  }
}

/**
 * Update hand indicators based on proximity to grabbable objects
 */
function updateHandIndicators() {
  handIndicators.forEach((indicator, controller) => {
    const nearbyObject = getNearbyGrabbableObject(controller);

    if (nearbyObject && !grabbedObject) {
      // Highlight when near grabbable object
      indicator.material.emissiveIntensity = 1.0;
      indicator.scale.set(1.5, 1.5, 1.5);

      // Also highlight the object
      if (nearbyObject.userData.originalColor === undefined) {
        nearbyObject.userData.originalColor =
          nearbyObject.material.color.getHex();
      }
      nearbyObject.material.emissive.setHex(0xffff00);
      nearbyObject.material.emissiveIntensity = 0.3;
    } else {
      // Reset to normal
      indicator.material.emissiveIntensity = 0.5;
      indicator.scale.set(1, 1, 1);
    }
  });

  // Reset highlighting for objects not near any hand
  if (!grabbedObject) {
    sharedObjects.forEach((object) => {
      let isNearAnyHand = false;
      handControllers.forEach((controller) => {
        if (getNearbyGrabbableObject(controller) === object) {
          isNearAnyHand = true;
        }
      });

      if (!isNearAnyHand && object.userData.originalColor !== undefined) {
        object.material.emissive.setHex(0x000000);
        object.material.emissiveIntensity = 0;
      }
    });

    // Also check the main cube
    if (cube && cube.isMesh) {
      let isNearAnyHand = false;
      handControllers.forEach((controller) => {
        if (getNearbyGrabbableObject(controller) === cube) {
          isNearAnyHand = true;
        }
      });

      if (!isNearAnyHand && cube.userData.originalColor !== undefined) {
        cube.material.emissive.setHex(0x000000);
        cube.material.emissiveIntensity = 0;
      }
    }
  }
}

/**
 * Get nearby grabbable object for a controller
 */
function getNearbyGrabbableObject(controller) {
  const controllerPos = new THREE.Vector3();
  controller.getWorldPosition(controllerPos);

  const grabDistance = 0.3; // Maximum distance to grab

  // Check main cube
  if (cube && cube.isMesh) {
    const cubePos = new THREE.Vector3();
    cube.getWorldPosition(cubePos);
    if (controllerPos.distanceTo(cubePos) < grabDistance) {
      return cube;
    }
  }

  // Check shared objects
  for (const [id, object] of sharedObjects) {
    const objPos = new THREE.Vector3();
    object.getWorldPosition(objPos);
    if (controllerPos.distanceTo(objPos) < grabDistance) {
      return object;
    }
  }

  return null;
}

function onSelectStart(event) {
  const controller = event.target;

  // Check if this is a hand input source
  const inputSource = handInputSources.get(controller);

  if (inputSource && inputSource.hand) {
    // Hand tracking: try to grab nearby object
    handleHandGrab(controller);
  } else {
    // Standard controller: use raycast to grab or spawn
    const controllerPos = new THREE.Vector3();
    controller.getWorldPosition(controllerPos);

    // Create a raycaster from controller
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    const raycaster = new THREE.Raycaster();
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    // Check if we're pointing at a shared object
    const objectMeshes = Array.from(sharedObjects.values());
    const intersects = raycaster.intersectObjects(objectMeshes, false);

    if (intersects.length > 0) {
      // Try to grab the closest object
      const targetMesh = intersects[0].object;
      const objectId = targetMesh.userData.objectId;

      // Check if object is already owned by someone else
      if (
        targetMesh.userData.ownedBy &&
        targetMesh.userData.ownedBy !== clientId
      ) {
        console.log("Object is already grabbed by another user");
        return;
      }

      // Send grab request to server
      ws.send(
        JSON.stringify({
          type: "grab-object",
          roomId: roomId,
          objectId: objectId,
        }),
      );

      // Store grabbed object locally
      grabbedObject = {
        objectId: objectId,
        mesh: targetMesh,
        controller: controller,
      };

      // Calculate offset from controller to object
      grabOffset.copy(targetMesh.position).sub(controllerPos);

      console.log(`Grabbed object ${objectId}`);
    } else {
      // No object hit, spawn a new cube at controller position
      spawnObject("cube", [controllerPos.x, controllerPos.y, controllerPos.z]);
    }
  }
}

function onSelectEnd(event) {
  const controller = event.target;

  // Release grabbed object
  if (grabbedObject) {
    // Check if this is the hand tracking or controller that grabbed it
    if (grabbingHand === controller) {
      // Hand tracking release
      releaseGrabbedObject();
    } else if (grabbedObject.controller === controller) {
      // Standard controller release - send to server
      ws.send(
        JSON.stringify({
          type: "release-object",
          roomId: roomId,
          objectId: grabbedObject.objectId,
        }),
      );
      console.log(`Released object ${grabbedObject.objectId}`);
      grabbedObject = null;
    }
  }
}

/**
 * Handle hand grab gesture
 */
function handleHandGrab(controller) {
  if (grabbedObject) {
    console.log("Already holding an object");
    return;
  }

  const nearbyObject = getNearbyGrabbableObject(controller);

  if (nearbyObject) {
    grabbedObject = nearbyObject;
    grabbingHand = controller;

    // Store offset between hand and object
    const handPos = new THREE.Vector3();
    controller.getWorldPosition(handPos);

    const objectPos = new THREE.Vector3();
    nearbyObject.getWorldPosition(objectPos);

    controller.userData.grabOffset = objectPos.clone().sub(handPos);

    // Visual feedback
    nearbyObject.material.emissive.setHex(0x00ff00);
    nearbyObject.material.emissiveIntensity = 0.5;

    console.log(
      "Grabbed object:",
      nearbyObject.userData.objectId || "main cube",
    );
  }
}

/**
 * Release grabbed object
 */
function releaseGrabbedObject() {
  if (!grabbedObject) return;

  // Reset visual feedback
  if (grabbedObject.userData.originalColor !== undefined) {
    grabbedObject.material.emissive.setHex(0x000000);
    grabbedObject.material.emissiveIntensity = 0;
  }

  console.log(
    "Released object:",
    grabbedObject.userData.objectId || "main cube",
  );

  // Sync position to server if it's a shared object
  if (grabbedObject.userData.objectId) {
    const pos = grabbedObject.position;
    const rot = grabbedObject.rotation;
    updateObjectPosition(
      grabbedObject.userData.objectId,
      [pos.x, pos.y, pos.z],
      [rot.x, rot.y, rot.z],
    );
  }

  grabbedObject = null;
  grabbingHand = null;
}

/**
 * Update grabbed object position based on hand movement
 */
function updateGrabbedObject() {
  if (!grabbedObject || !grabbingHand) return;

  const handPos = new THREE.Vector3();
  grabbingHand.getWorldPosition(handPos);

  // Apply stored offset
  const grabOffset = grabbingHand.userData.grabOffset || new THREE.Vector3();
  const newPos = handPos.clone().add(grabOffset);

  grabbedObject.position.copy(newPos);

  // Smoothly interpolate rotation to match hand rotation
  const handQuaternion = new THREE.Quaternion();
  grabbingHand.getWorldQuaternion(handQuaternion);

  grabbedObject.quaternion.slerp(handQuaternion, 0.1);
}

// UI Setup

function setupObjectSpawningUI() {
  // Create UI container
  const uiContainer = document.createElement("div");
  uiContainer.style.position = "absolute";
  uiContainer.style.top = "20px";
  uiContainer.style.right = "20px";
  uiContainer.style.zIndex = "999";
  uiContainer.style.display = "flex";
  uiContainer.style.flexDirection = "column";
  uiContainer.style.gap = "10px";

  // Spawn cube button
  const spawnCubeBtn = document.createElement("button");
  spawnCubeBtn.textContent = "Spawn Cube";
  spawnCubeBtn.onclick = () => spawnObject("cube");
  uiContainer.appendChild(spawnCubeBtn);

  // Spawn sphere button
  const spawnSphereBtn = document.createElement("button");
  spawnSphereBtn.textContent = "Spawn Sphere";
  spawnSphereBtn.onclick = () => spawnObject("sphere");
  uiContainer.appendChild(spawnSphereBtn);

  // Spawn cone button
  const spawnConeBtn = document.createElement("button");
  spawnConeBtn.textContent = "Spawn Cone";
  spawnConeBtn.onclick = () => spawnObject("cone");
  uiContainer.appendChild(spawnConeBtn);

  // Object count display
  const objectCount = document.createElement("div");
  objectCount.id = "object-count";
  objectCount.textContent = "Objects: 0";
  objectCount.style.color = "white";
  objectCount.style.padding = "5px";
  objectCount.style.backgroundColor = "rgba(0,0,0,0.5)";
  objectCount.style.borderRadius = "4px";
  uiContainer.appendChild(objectCount);

  document.body.appendChild(uiContainer);

  // Update object count periodically
  setInterval(() => {
    const count = sharedObjects.size;
    document.getElementById("object-count").textContent = `Objects: ${count}`;
  }, 1000);
}

// Network Stats Overlay Functions

/**
 * Initialize the network stats
 */
function initNetworkStats() {
  // Start the stats update loop
  setInterval(updateNetworkStatsDisplay, networkStats.updateInterval);

  // Start the ping loop for latency measurement
  setInterval(sendPing, networkStats.pingInterval);

  console.log("Network stats initialized");
}

/**
 * Update FPS counter - called every frame from animate()
 */
function updateFpsCounter() {
  networkStats.frameCount++;
  const now = performance.now();

  // Calculate FPS every second
  if (now - networkStats.lastFpsTime >= 1000) {
    networkStats.fps = Math.round(
      (networkStats.frameCount * 1000) / (now - networkStats.lastFpsTime),
    );
    networkStats.frameCount = 0;
    networkStats.lastFpsTime = now;
  }
}

// Bandwidth Simulation Functions

/**
 * Toggle bandwidth simulation mode
 */
function toggleSimulationMode() {
  const newState = !simulationMode.enabled;

  console.log(`Toggling simulation mode to: ${newState}`);

  // Send to server
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "set-simulation-mode",
        enabled: newState,
      }),
    );
  }

  // Update local state immediately for responsive UI
  applySimulationMode(newState);
}

/**
 * Handle simulation mode change confirmation from server
 */
function handleSimulationModeChanged(enabled, lod) {
  console.log(`Server confirmed simulation mode: ${enabled}, LOD: ${lod}`);
  applySimulationMode(enabled);

  // If enabled and LOD is low, request asset reload with low LOD
  if (enabled) {
    // Force reload current asset with low LOD
    const currentAsset = getCurrentAssetLOD();
    if (currentAsset && currentAsset.base) {
      // Add artificial latency before requesting new asset
      setTimeout(() => {
        requestAsset(currentAsset.base, "low");
      }, simulationMode.artificialLatency);
    }
  }
}

/**
 * Send a ping to measure latency
 */
function sendPing() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  networkStats.lastPingTime = performance.now();
  ws.send(
    JSON.stringify({
      type: "ping",
      timestamp: networkStats.lastPingTime,
    }),
  );
}

/**
 * Handle pong response from server
 */
function handlePong(data) {
  const now = performance.now();
  networkStats.latency = Math.round(now - data.timestamp);
}

/**
 * Update the network stats display
 */
function updateNetworkStatsDisplay() {
  // Update FPS display
  const fpsElement = document.getElementById("stats-fps");
  if (fpsElement) {
    fpsElement.textContent = networkStats.fps;
    fpsElement.className = "stat-value " + getFpsStatusClass(networkStats.fps);
  }

  // Update bandwidth display
  const bandwidthElement = document.getElementById("stats-bandwidth");
  if (bandwidthElement) {
    const bandwidthKBs = (bandwidthMonitor.currentBandwidth / 1024).toFixed(1);
    bandwidthElement.textContent = `${bandwidthKBs} KB/s`;
    bandwidthElement.className =
      "stat-value " +
      getBandwidthStatusClass(bandwidthMonitor.currentBandwidth);
  }

  // Update latency display
  const latencyElement = document.getElementById("stats-latency");
  if (latencyElement) {
    latencyElement.textContent = `${networkStats.latency} ms`;
    latencyElement.className =
      "stat-value " + getLatencyStatusClass(networkStats.latency);
  }

  // Update LOD level display
  const lodElement = document.getElementById("stats-lod");
  if (lodElement) {
    const lod = bandwidthMonitor.recommendedLOD.toUpperCase();
    lodElement.textContent = lod;
    lodElement.className = "stat-value " + getLodStatusClass(lod);
  }

  // Update connections display
  const connectionsElement = document.getElementById("stats-connections");
  if (connectionsElement) {
    const connectionCount =
      peers.size + (ws && ws.readyState === WebSocket.OPEN ? 1 : 0);
    connectionsElement.textContent = connectionCount;
    connectionsElement.className =
      "stat-value " + getConnectionStatusClass(connectionCount);
  }

  // Update data transferred display
  const dataElement = document.getElementById("stats-data");
  if (dataElement) {
    const dataMB = (networkStats.totalDataTransferred / (1024 * 1024)).toFixed(
      2,
    );
    dataElement.textContent = `${dataMB} MB`;
  }
}

/**
 * Track data received (call when receiving data)
 */
function trackDataReceived(bytes) {
  networkStats.totalDataTransferred += bytes;
}

/**
 * Get CSS class for FPS status
 */
function getFpsStatusClass(fps) {
  if (fps >= 55) return "stat-good";
  if (fps >= 30) return "stat-warning";
  return "stat-critical";
}

/**
 * Get CSS class for bandwidth status
 */
function getBandwidthStatusClass(bandwidth) {
  // Bandwidth in bytes per second
  // Good: > 100 KB/s, Warning: > 10 KB/s, Critical: < 10 KB/s
  if (bandwidth > 102400) return "stat-good";
  if (bandwidth > 10240) return "stat-warning";
  return "stat-critical";
}

/**
 * Get CSS class for latency status
 */
function getLatencyStatusClass(latency) {
  if (latency === 0) return "stat-good"; // No data yet
  if (latency < 50) return "stat-good";
  if (latency < 150) return "stat-warning";
  return "stat-critical";
}

/**
 * Get CSS class for LOD status
 */
function getLodStatusClass(lod) {
  if (lod === "HIGH") return "stat-good";
  if (lod === "MEDIUM") return "stat-warning";
  return "stat-critical";
}

/**
 * Get CSS class for connection status
 */
function getConnectionStatusClass(count) {
  if (count > 0) return "stat-good";
  return "stat-critical";
}

/**
 * Toggle bandwidth simulation (demo feature)
 * Switches between high bandwidth (adaptive LOD) and low bandwidth (forced low LOD)
 */
function toggleBandwidthSimulation() {
  bandwidthSimulation.enabled = !bandwidthSimulation.enabled;

  const button = document.getElementById("bandwidth-btn");

  if (bandwidthSimulation.enabled) {
    // Enable low bandwidth simulation
    bandwidthSimulation.forcedLOD = "low";
    button.textContent = "Low Bandwidth (Simulated)";
    button.classList.add("low-bandwidth");
    console.log("Bandwidth simulation: ENABLED (forcing LOW LOD)");

    // Also update head tracking frequency for more realistic simulation
    headTracking.sendInterval = headTracking.slowInterval; // 5 FPS

    // Re-request current asset with low LOD
    const currentAsset = getCurrentAssetLOD();
    if (currentAsset && currentAsset.base) {
      console.log(`Re-requesting ${currentAsset.base} with LOW LOD`);
      setTimeout(() => requestAsset(currentAsset.base, "low"), 500);
    }
  } else {
    // Disable simulation, return to high bandwidth
    bandwidthSimulation.forcedLOD = null;
    button.textContent = "High Bandwidth";
    button.classList.remove("low-bandwidth");
    console.log("Bandwidth simulation: DISABLED (adaptive LOD)");

    // Restore normal head tracking frequency
    headTracking.sendInterval = headTracking.normalInterval; // 10 FPS

    // Re-request current asset with high LOD
    const currentAsset = getCurrentAssetLOD();
    if (currentAsset && currentAsset.base) {
      console.log(`Re-requesting ${currentAsset.base} with HIGH LOD`);
      setTimeout(() => requestAsset(currentAsset.base, "high"), 500);
    }
  }

  // Update LOD indicator in UI
  updateLODIndicator();
}

/**
 * Update LOD indicator based on current simulation state
 */
function updateLODIndicator() {
  const lodIndicator = document.getElementById("lod-indicator");
  if (lodIndicator) {
    if (bandwidthSimulation.enabled) {
      lodIndicator.textContent = "LOW";
      lodIndicator.className = "pending";
    } else {
      lodIndicator.textContent = bandwidthMonitor.recommendedLOD.toUpperCase();
      lodIndicator.className =
        bandwidthMonitor.recommendedLOD === "high" ? "connected" : "pending";
    }
  }
}

// Render Mode Functions

/**
 * Set the render mode (GLB/LOD or NeRF)
 * @param {string} mode - 'glb' or 'nerf'
 */
function setRenderMode(mode) {
  if (mode === renderMode) {
    console.log(`Already in ${mode} mode`);
    return;
  }

  if (mode === "nerf" && !nerfAvailable) {
    console.warn("NeRF mode not available - no NeRF data loaded");
    return;
  }

  console.log(`Switching render mode from ${renderMode} to ${mode}`);
  renderMode = mode;

  if (mode === "glb") {
    // Switch to GLB/LOD mode
    // Show GLB model, hide NeRF splat
    if (cube) {
      cube.visible = true;
    }
    if (gaussianRenderer && gaussianRenderer.getSplatMesh()) {
      gaussianRenderer.getSplatMesh().visible = false;
    }
  } else if (mode === "nerf") {
    // Switch to NeRF mode
    // Hide GLB model, show NeRF splat
    if (cube) {
      cube.visible = false;
    }
    if (gaussianRenderer && gaussianRenderer.getSplatMesh()) {
      gaussianRenderer.getSplatMesh().visible = true;
    }
  }

  // Update UI buttons
  updateModeButtons();

  // Notify server of mode change
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "render-mode-change",
        mode: mode,
      }),
    );
  }
}

/**
 * Update the render mode toggle buttons UI
 */
function updateModeButtons() {
  const glbBtn = document.getElementById("glb-mode-btn");
  const nerfBtn = document.getElementById("nerf-mode-btn");

  if (glbBtn) {
    if (renderMode === "glb") {
      glbBtn.classList.add("active");
    } else {
      glbBtn.classList.remove("active");
    }
  }

  if (nerfBtn) {
    if (renderMode === "nerf") {
      nerfBtn.classList.add("active");
    } else {
      nerfBtn.classList.remove("active");
    }
  }
}

/**
 * Handle asset list from server - check for NeRF availability
 * @param {Array} assets - List of available assets
 */
function handleAssetList(assets) {
  // Check if the helmet asset has NeRF available
  const helmetAsset = assets.find((asset) => asset.id === "helmet");
  if (helmetAsset) {
    console.log(`Helmet asset hasNeRF: ${helmetAsset.hasNeRF}`);
    updateNeRFButtonState(helmetAsset.hasNeRF);

    // If NeRF is available, request it automatically
    if (helmetAsset.hasNeRF && ws && ws.readyState === WebSocket.OPEN) {
      console.log("Requesting helmet NeRF data...");
      ws.send(
        JSON.stringify({
          type: "request_nerf",
          assetId: "helmet",
          options: { quality: "high" },
        }),
      );
    }
  }
}

/**
 * Update the NeRF button state based on availability
 * @param {boolean} available - Whether NeRF data is available
 */
function updateNeRFButtonState(available) {
  nerfAvailable = available;
  const nerfBtn = document.getElementById("nerf-mode-btn");

  if (nerfBtn) {
    nerfBtn.disabled = !available;
    if (available) {
      nerfBtn.textContent = "NeRF";
      nerfBtn.title = "Switch to NeRF rendering";
    } else {
      nerfBtn.textContent = "NeRF Not Found";
      nerfBtn.title = "NeRF data not available for this asset";
    }
  }

  console.log(
    `NeRF button state updated: ${available ? "enabled" : "disabled"}`,
  );
}

/**
 * Initialize the Gaussian Splat renderer for NeRF mode
 */
function initGaussianRenderer() {
  if (!scene || !camera || !renderer) {
    console.warn(
      "Cannot initialize GaussianSplatRenderer - Three.js not ready",
    );
    return;
  }

  if (typeof GaussianSplatRenderer === "undefined") {
    console.warn("GaussianSplatRenderer class not available");
    return;
  }

  gaussianRenderer = new GaussianSplatRenderer(scene, camera, renderer);
  console.log("GaussianSplatRenderer initialized");
}

/**
 * Apply simulation mode settings locally
 */
function applySimulationMode(enabled) {
  simulationMode.enabled = enabled;

  // Update head tracking frequency
  if (enabled) {
    headTracking.sendInterval = headTracking.slowInterval; // 5 FPS
  } else {
    headTracking.sendInterval = headTracking.normalInterval; // 10 FPS
  }

  // Update UI
  updateSimulationUI(enabled);

  // Update LOD indicator
  updateLODIndicator();

  console.log(
    `Simulation mode ${enabled ? "enabled" : "disabled"}, head tracking interval: ${headTracking.sendInterval}ms`,
  );

  // If turning off simulation, trigger progressive refinement
  if (!enabled) {
    triggerProgressiveRefinement();
  }
}

/**
 * Update simulation UI elements
 */
function updateSimulationUI(enabled) {
  const toggleBtn = document.getElementById("simulation-toggle-btn");
  const statusSpan = document.getElementById("simulation-status");

  if (toggleBtn) {
    if (enabled) {
      toggleBtn.classList.add("active");
    } else {
      toggleBtn.classList.remove("active");
    }
  }

  if (statusSpan) {
    if (enabled) {
      statusSpan.textContent = "Slow Network Mode";
      statusSpan.className = "slow-mode";
    } else {
      statusSpan.textContent = "Normal Mode";
      statusSpan.className = "normal-mode";
    }
  }
}

/**
 * Trigger progressive refinement when returning to normal mode
 */
function triggerProgressiveRefinement() {
  console.log("Triggering progressive refinement...");

  // Request current asset with adaptive LOD selection (null = let server decide)
  const currentAsset = getCurrentAssetLOD();
  if (currentAsset && currentAsset.base) {
    // Small delay for smooth transition
    setTimeout(() => {
      requestAsset(currentAsset.base, null); // null means use adaptive streaming
    }, 500);
  }
}

/**
 * Wrapper for WebSocket send that adds artificial latency in simulation mode
 */
function sendWithSimulatedLatency(data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const message = JSON.stringify(data);

  if (simulationMode.enabled && data.type !== "set-simulation-mode") {
    // Add artificial latency for non-toggle messages
    setTimeout(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }, simulationMode.artificialLatency);
  } else {
    ws.send(message);
  }
}

initThreeJS();
initGaussianRenderer();
initWebSocket();
initWebXR();
enableCameraControls();
enableHeadTracking();
setupObjectSpawningUI();
initNetworkStats();
