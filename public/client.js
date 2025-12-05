let scene, camera, renderer, cube;
let ws;
let clientId;
let peers = new Map();
let gltfLoader;

// Asset streaming state
let assetStreams = new Map(); // Track incoming asset streams
let expectingBinaryChunk = false; // Global flag for next binary message

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

      // Request an asset after connection
      setTimeout(() => requestAsset("cube", "high"), 1000);
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

function requestAsset(assetId, lod = "high") {
  console.log("Requesting asset:", assetId, "LOD:", lod);
  ws.send(
    JSON.stringify({
      type: "request_asset",
      assetId: assetId,
      lod: lod,
    }),
  );
  updateStatus("binary-status", "Requesting...", "pending");
}

function handleAssetStart(data) {
  console.log(
    `Starting asset download: ${data.assetId}, size: ${data.size} bytes, chunks: ${data.chunks}`,
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
  loadGLBModel(url, data.assetId);

  // Clean up
  assetStreams.delete(data.assetId);
}

function loadGLBModel(url, assetId) {
  console.log("Loading GLB model:", assetId, "from URL:", url);
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

initThreeJS();
initWebSocket();
