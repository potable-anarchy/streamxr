let scene, camera, renderer, cube;
let ws;
let clientId;
let peers = new Map();

function initThreeJS() {
  const container = document.getElementById('canvas-container');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 5;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0x4CAF50,
    roughness: 0.5,
    metalness: 0.5
  });
  cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);

  window.addEventListener('resize', onWindowResize);

  animate();
}

function animate() {
  requestAnimationFrame(animate);

  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    console.log('WebSocket connected');
    updateStatus('ws-status', 'Connected', 'connected');
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleSignalingMessage(data);
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    updateStatus('ws-status', 'Disconnected', 'disconnected');
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function handleSignalingMessage(data) {
  switch (data.type) {
    case 'welcome':
      clientId = data.id;
      document.getElementById('client-id').textContent = clientId.substring(0, 8);
      console.log('Client ID:', clientId);

      data.peers.forEach(peerId => {
        createPeerConnection(peerId, true);
      });
      break;

    case 'peer-connected':
      console.log('Peer connected:', data.peerId);
      break;

    case 'peer-disconnected':
      console.log('Peer disconnected:', data.peerId);
      if (peers.has(data.peerId)) {
        peers.get(data.peerId).destroy();
        peers.delete(data.peerId);
        updatePeerCount();
      }
      break;

    case 'signal':
      if (!peers.has(data.from)) {
        createPeerConnection(data.from, false);
      }
      peers.get(data.from).signal(data.signal);
      break;
  }
}

function createPeerConnection(peerId, initiator) {
  console.log(`Creating peer connection with ${peerId}, initiator: ${initiator}`);

  const peer = new SimplePeer({
    initiator: initiator,
    trickle: true
  });

  peer.on('signal', (signal) => {
    ws.send(JSON.stringify({
      type: 'signal',
      signal: signal
    }));
  });

  peer.on('connect', () => {
    console.log(`WebRTC connected to peer ${peerId}`);
    updatePeerCount();

    sendBinaryData(peer);
  });

  peer.on('data', (data) => {
    console.log(`Received data from ${peerId}:`, data);
    handleBinaryData(data);
  });

  peer.on('close', () => {
    console.log(`Peer ${peerId} closed`);
    peers.delete(peerId);
    updatePeerCount();
  });

  peer.on('error', (err) => {
    console.error(`Peer ${peerId} error:`, err);
  });

  peers.set(peerId, peer);
}

function sendBinaryData(peer) {
  const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  console.log('Sending binary data:', testData);

  peer.send(testData);

  const array = new Float32Array([1.5, 2.5, 3.5, 4.5]);
  peer.send(array);

  updateStatus('binary-status', 'Sent', 'connected');
}

function handleBinaryData(data) {
  if (data instanceof ArrayBuffer) {
    const view = new Uint8Array(data);
    console.log('Received binary data (ArrayBuffer):', view);
    updateStatus('binary-status', 'Received', 'connected');
  } else if (data instanceof Uint8Array) {
    console.log('Received binary data (Uint8Array):', data);
    updateStatus('binary-status', 'Received', 'connected');
  } else {
    console.log('Received data:', data);
  }
}

function updatePeerCount() {
  document.getElementById('peer-count').textContent = peers.size;
}

function updateStatus(elementId, text, className) {
  const element = document.getElementById(elementId);
  element.textContent = text;
  element.className = className;
}

initThreeJS();
initWebSocket();
