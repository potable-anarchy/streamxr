let scene, camera, renderer, cube;
let ws;
let clientId;
let peers = new Map();
let gltfLoader;

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

// Head tracking state
let headTracking = {
  enabled: false,
  lastSentTime: 0,
  sendInterval: 100, // Send head position every 100ms
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

  // Initialize GLTFLoader
  gltfLoader = new THREE.GLTFLoader();

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

  animate();
}

function animate() {
  requestAnimationFrame(animate);

  if (cube) {
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
  }

  // Send head tracking data periodically
  sendHeadTrackingData();

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  // Set binary type to arraybuffer for easier handling
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    console.log("WebSocket connected");
    updateStatus("ws-status", "Connected", "connected");
  };

  ws.onmessage = (event) => {
    // Check if this is binary data
    if (event.data instanceof ArrayBuffer) {
      console.log("Received binary data, size:", event.data.byteLength);
      handleAssetChunkData(event.data);
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

  ws.onclose = () => {
    console.log("WebSocket disconnected");
    updateStatus("ws-status", "Disconnected", "disconnected");
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
  };
}

function handleSignalingMessage(data) {
  console.log("Received message type:", data.type);

  switch (data.type) {
    case "welcome":
      clientId = data.id;
      document.getElementById("client-id").textContent = clientId.substring(
        0,
        8,
      );
      console.log("Client ID:", clientId);

      data.peers.forEach((peerId) => {
        createPeerConnection(peerId, true);
      });

      // Request an asset after connection (adaptive streaming will select LOD)
      setTimeout(() => requestAsset("cube"), 1000);
      break;

    case "peer-connected":
      console.log("Peer connected:", data.peerId);
      break;

    case "peer-disconnected":
      console.log("Peer disconnected:", data.peerId);
      if (peers.has(data.peerId)) {
        peers.get(data.peerId).destroy();
        peers.delete(data.peerId);
        updatePeerCount();
      }
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
      break;

    case "lod-recommendation":
      handleLODRecommendation(data.lod);
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
  } else if (data instanceof Uint8Array) {
    console.log("Received binary data (Uint8Array):", data);
    updateStatus("binary-status", "Received", "connected");
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

// Asset Streaming Functions

function requestAsset(assetId, lod = null) {
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
      model.position.set(0, 0, -2); // Move back from camera
      model.scale.set(1.5, 1.5, 1.5); // Scale up
      
      // Store asset metadata for adaptive streaming
      model.userData.assetId = assetId;
      model.userData.lod = lod;

      // Add a material to the model since GLB doesn't have one
      model.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x3498db, // Blue color
            roughness: 0.5,
            metalness: 0.3,
          });
        }
      });

      // Store metadata for adaptive streaming
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

  // Update UI to show current LOD
  const lodIndicator = document.getElementById("lod-indicator");
  if (lodIndicator) {
    lodIndicator.textContent = lod.toUpperCase();
    lodIndicator.className = lod === "high" ? "connected" : "pending";
  }

  // Auto-request new asset if LOD changed significantly
  const currentAsset = getCurrentAssetLOD();
  if (currentAsset && currentAsset.lod !== lod) {
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

  // Send to server
  ws.send(
    JSON.stringify({
      type: "head-tracking",
      position: position,
      rotation: rotation,
      quaternion: quaternion,
      fov: camera.fov,
      timestamp: now,
    }),
  );
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
 * Initialize WebXR support for VR head tracking
 * This enables more accurate head tracking in VR mode
 */
function initWebXR() {
  if (!navigator.xr) {
    console.log("WebXR not supported in this browser");
    return;
  }

  // Check for VR support
  navigator.xr.isSessionSupported("immersive-vr").then((supported) => {
    if (supported) {
      console.log("VR supported, WebXR available");
      // Add VR button if supported
      const vrButton = document.createElement("button");
      vrButton.textContent = "Enter VR";
      vrButton.style.position = "absolute";
      vrButton.style.bottom = "20px";
      vrButton.style.left = "20px";
      vrButton.style.zIndex = "999";
      vrButton.onclick = enterVR;
      document.body.appendChild(vrButton);
    } else {
      console.log("VR not supported, using desktop head tracking");
    }
  });
}

/**
 * Enter VR mode with WebXR
 */
async function enterVR() {
  try {
    const session = await navigator.xr.requestSession("immersive-vr");
    renderer.xr.enabled = true;
    await renderer.xr.setSession(session);

    console.log("Entered VR mode");

    // Enable head tracking for VR
    enableHeadTracking();

    session.addEventListener("end", () => {
      console.log("VR session ended");
      disableHeadTracking();
    });
  } catch (error) {
    console.error("Failed to enter VR:", error);
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
    if (keys["s"])
      camera.position.add(forward.multiplyScalar(-moveSpeed));
    if (keys["a"]) camera.position.add(right.multiplyScalar(-moveSpeed));
    if (keys["d"]) camera.position.add(right.multiplyScalar(moveSpeed));
  }, 16);

  console.log("Camera controls enabled (WASD + mouse drag)");
}

initThreeJS();
initWebSocket();
initWebXR();
enableCameraControls();
enableHeadTracking();
