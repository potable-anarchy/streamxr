# StreamXR: Multiuser WebXR Environment

## Goal

Build a WebXR experience that runs in browsers (desktop + XR headsets like Quest 3) where:
- Multiple users join the same virtual space
- Users can spawn and manipulate 3D objects in a shared room
- Optional passthrough mode uses the player's real environment
- Spatial audio, music, and sound effects enhance the experience
- Users see each other as avatars moving around in real time
- On XR-capable devices, users click "Enter VR" to be immersed in WebXR

**First implementation:** Three.js + WebXR in the browser

---

## 1. High-Level Architecture

### Components:

1. **Node.js Backend**
   - `express` static server
   - `ws` WebSocket server
   - Manages rooms, spawned objects, audio sources
   - Broadcasts:
     - `init`
     - `user_joined` / `user_left`
     - `user_presence`
     - `object_spawned` / `object_moved` / `object_removed`
     - `audio_event` (music, sound effects)

2. **WebXR Client (Browser)**
   - Three.js + WebXRManager (+ VRButton)
   - GLTFLoader for 3D models
   - Runs in:
     - Normal desktop mode (mouse/keyboard)
     - WebXR immersive-VR mode (Quest 3, etc.)
     - WebXR AR mode (passthrough on Quest 3)
   - Renders avatars, spawned objects, spatial audio sources
   - Sends presence and interaction updates to server

3. **Static Asset Hosting**
   - `.glb` models (3D objects users can spawn)
   - `.mp3` audio files (music, sound effects)
   - Initially served from `/public` via Express

---

## 2. WebXR Requirements

The implementation must ensure:

1. **XR Enabling:**
   - `renderer.xr.enabled = true`
   - Use `VRButton` to create "Enter VR" button
   - Support both immersive-vr (opaque room) and immersive-ar (passthrough) modes

2. **In XR-capable browsers (Quest 3):**
   - Page shows "Enter VR" button
   - Clicking starts WebXR session
   - User can look around and see:
     - The shared room (or their real environment in AR mode)
     - Their position (first-person view)
     - Other users' avatars
     - Spawned 3D objects

3. **Non-XR browsers:**
   - Fall back to standard 3D view
   - Mouse/keyboard controls (WASD + pointer lock)

4. **AR/Passthrough Mode:**
   - Option to request `immersive-ar` session
   - Uses Quest 3's passthrough to blend virtual objects with real environment
   - 3D objects appear anchored in physical space

---

## 3. Protocol: WebSocket Messages

All messages are JSON.

### 3.1. init

**Server → Client** (on connect):

```json
{
  "type": "init",
  "userId": "user_12",
  "roomId": "main",
  "existingUsers": [
    { "userId": "user_3" },
    { "userId": "user_4" }
  ],
  "objects": [
    {
      "id": "obj_1",
      "modelUrl": "/models/cube.glb",
      "position": { "x": 0, "y": 1, "z": -2 },
      "rotation": { "x": 0, "y": 45, "z": 0 },
      "scale": 1.0
    }
  ]
}
```

**Client must:**
- Store `userId`
- Create placeholder avatars for `existingUsers`
- Spawn all existing `objects` in the scene

---

### 3.2. Presence

**Client → Server:**

```json
{
  "type": "presence_update",
  "pose": {
    "position": { "x": 0, "y": 1.6, "z": -3 },
    "rotation": { "x": 0, "y": 180, "z": 0 }
  }
}
```

**Server → Other Clients:**

```json
{
  "type": "user_presence",
  "userId": "user_12",
  "pose": {
    "position": { "x": 0, "y": 1.6, "z": -3 },
    "rotation": { "x": 0, "y": 180, "z": 0 }
  }
}
```

- Position/rotation are world-space
- In XR mode: derived from XR camera/headset pose

---

### 3.3. User Join/Leave

**Server → Clients:**

```json
{
  "type": "user_joined",
  "userId": "user_17"
}
```

```json
{
  "type": "user_left",
  "userId": "user_17"
}
```

**Client:**
- On `user_joined`: spawn avatar mesh
- On `user_left`: remove avatar from scene

---

### 3.4. Object Management

**Client → Server** (spawn new object):

```json
{
  "type": "spawn_object",
  "modelUrl": "/models/sphere.glb",
  "position": { "x": 1, "y": 1.5, "z": -3 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "scale": 1.0
}
```

**Server → All Clients:**

```json
{
  "type": "object_spawned",
  "objectId": "obj_42",
  "modelUrl": "/models/sphere.glb",
  "position": { "x": 1, "y": 1.5, "z": -3 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "scale": 1.0,
  "spawnedBy": "user_12"
}
```

**Client → Server** (move/rotate object):

```json
{
  "type": "move_object",
  "objectId": "obj_42",
  "position": { "x": 2, "y": 1.5, "z": -3 },
  "rotation": { "x": 0, "y": 90, "z": 0 }
}
```

**Server → All Clients:**

```json
{
  "type": "object_moved",
  "objectId": "obj_42",
  "position": { "x": 2, "y": 1.5, "z": -3 },
  "rotation": { "x": 0, "y": 90, "z": 0 }
}
```

**Client → Server** (remove object):

```json
{
  "type": "remove_object",
  "objectId": "obj_42"
}
```

**Server → All Clients:**

```json
{
  "type": "object_removed",
  "objectId": "obj_42"
}
```

---

### 3.5. Audio Events

**Server → Clients** (play background music):

```json
{
  "type": "audio_event",
  "audioType": "music",
  "audioUrl": "/audio/background_track.mp3",
  "loop": true,
  "volume": 0.5
}
```

**Server → Clients** (play spatial sound effect):

```json
{
  "type": "audio_event",
  "audioType": "sfx",
  "audioUrl": "/audio/spawn_sound.mp3",
  "position": { "x": 1, "y": 1.5, "z": -3 },
  "loop": false,
  "volume": 1.0
}
```

**Client responsibilities:**
- Music: play as non-spatial audio (same volume everywhere)
- SFX: create positional audio source at specified position
- Use Web Audio API for spatial audio

---

## 4. Backend (Node.js) Requirements

### Tech Stack:
- Node.js
- `express`
- `ws`

### Behavior:

1. **Serve static content** from `public/` (HTML, JS, audio, models)

2. **On WebSocket connection:**
   - Assign `user_X` ID
   - Add to in-memory `clients` map: `ws -> { userId, roomId }`
   - Send `init` message with existing users and objects
   - Broadcast `user_joined` to others in room

3. **On WebSocket close:**
   - Remove from `clients` map
   - Broadcast `user_left`

4. **On `presence_update` from client:**
   - Broadcast `user_presence` to others in same room

5. **On `spawn_object` from client:**
   - Generate unique `objectId`
   - Add to room's objects array
   - Broadcast `object_spawned` to all clients in room

6. **On `move_object` from client:**
   - Update object position/rotation in room's objects array
   - Broadcast `object_moved` to all clients in room

7. **On `remove_object` from client:**
   - Remove from room's objects array
   - Broadcast `object_removed` to all clients in room

8. **Audio trigger API:**
   - Optional admin endpoint to trigger music/sfx
   - Broadcasts `audio_event` to all clients in room

**No persistence, no auth needed for POC.**

---

## 5. Client (WebXR) Requirements

### Tech Stack:
- Three.js
- WebXRManager
- VRButton (from Three.js examples)
- GLTFLoader
- Web Audio API
- Browser WebSocket

### File Layout:

```
streamxr/
├── server.js
├── package.json
└── public/
    ├── index.html
    ├── client.js
    ├── audio/
    │   ├── background_track.mp3
    │   └── spawn_sound.mp3
    └── models/
        ├── cube.glb
        ├── sphere.glb
        └── avatar.glb
```

### index.html requirements:
- Include Three.js via CDN
- Include WebXR helpers (VRButton)
- Include GLTFLoader
- Include `client.js`
- Basic UI overlay:
  - Connection status
  - User count
  - Object spawn menu
  - VR/AR mode toggle

---

## 6. Client Behavior Details

### 6.1 Scene Setup
- Create scene, camera, renderer
- `renderer.xr.enabled = true`
- Add `VRButton.createButton(renderer)` to DOM
- Create:
  - Floor plane (or skip in AR mode)
  - Ambient + directional lights
  - Audio listener attached to camera

### 6.2 WebXR Handling
- Use Three.js animation loop:

```javascript
renderer.setAnimationLoop(render);
```

- **Non-XR mode:**
  - WASD movement + mouse look
  - Traditional first-person controls

- **XR mode:**
  - Use `renderer.xr.getCamera()` for head pose
  - Position of local user = XR camera position in world space
  - Support both VR (opaque) and AR (passthrough) modes

### 6.3 Avatars
- Each remote user is a simple mesh:
  - Capsule or loaded `.glb` model
  - Different color per user
  - Floating name tag

- Maintain:

```javascript
const avatars = new Map(); // userId -> THREE.Object3D
```

- On `user_joined`: create avatar
- On `user_presence`: update avatar position/rotation
- On `user_left`: remove avatar from scene

**Local user:**
- In XR mode: no visible body (first-person)
- In non-XR mode: optional third-person avatar

### 6.4 Presence Sending
- Every ~100ms, send `presence_update`

- **Non-XR mode:**
  - Position from WASD controls
  - Rotation from mouse look

- **XR mode:**

```javascript
const xrCamera = renderer.xr.getCamera(camera);
const pos = new THREE.Vector3();
xrCamera.getWorldPosition(pos);

const quat = new THREE.Quaternion();
xrCamera.getWorldQuaternion(quat);

const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
```

### 6.5 Object Management
- Use GLTFLoader with caching:

```javascript
const gltfLoader = new THREE.GLTFLoader();
const modelCache = new Map(); // url -> Promise<THREE.Group>
const spawnedObjects = new Map(); // objectId -> Object3D
```

- **loadModel(url):**
  - If cached → return cached Promise
  - Else → load `.glb`, cache result

- **On `object_spawned`:**
  - Load model
  - Create instance at specified position/rotation/scale
  - Add to scene and `spawnedObjects` map

- **On `object_moved`:**
  - Update object's position/rotation

- **On `object_removed`:**
  - Remove from scene
  - Delete from `spawnedObjects` map

### 6.6 Object Interaction (XR)
- Use XR controllers for:
  - Ray casting to select objects
  - Grab and move objects
  - Spawn new objects at controller position
  - Delete selected objects

- Controller events:
  - `selectstart` / `selectend` for grab
  - Trigger spawn menu with button press

### 6.7 Audio System
- Create `AudioListener` attached to camera
- Create `AudioLoader` for loading audio files

**Background music:**
- Use `Audio` (non-positional)
- Play/stop/loop based on `audio_event` messages

**Spatial sound effects:**
- Use `PositionalAudio`
- Create audio source at specified 3D position
- Automatically spatialize based on listener position

```javascript
const listener = new THREE.AudioListener();
camera.add(listener);

const sound = new THREE.PositionalAudio(listener);
const audioLoader = new THREE.AudioLoader();
audioLoader.load('/audio/spawn_sound.mp3', (buffer) => {
  sound.setBuffer(buffer);
  sound.setRefDistance(1);
  sound.play();
});
```

---

## 7. Implementation Tasks

### Backend:

1. `npm init -y`
2. `npm install express ws`
3. Implement `server.js`:
   - Express static server for `/public`
   - WebSocket server with:
     - `init` on connect
     - `user_joined` / `user_left`
     - `presence_update` → `user_presence`
     - `spawn_object` → `object_spawned`
     - `move_object` → `object_moved`
     - `remove_object` → `object_removed`
     - Optional audio trigger endpoint
4. Create directory structure in `public/`
5. Start server: `node server.js`

### Client:

1. Setup `index.html`:
   - Include Three.js, VRButton, GLTFLoader from CDNs
   - Simple overlay UI
   - Include `client.js`

2. Implement `client.js`:
   - Scene/camera/renderer with `renderer.xr.enabled = true`
   - Add VRButton
   - Floor, lights, audio listener
   - Avatar manager for remote users
   - WebSocket connection handler
   - Movement controls (WASD for non-XR)
   - XR controller handling
   - Presence sending loop (100ms)
   - Object spawn/move/remove logic
   - Audio playback (music + spatial SFX)

3. Create sample assets:
   - Basic 3D models (cube, sphere, etc.)
   - Background music track
   - Sound effects (spawn, grab, delete)

---

## 8. Demo Instructions

### Start server:

```bash
node server.js
```

### Desktop browser:
1. Open `http://localhost:3000`
2. See shared room
3. Use UI to spawn objects
4. Open another tab → see objects synchronized
5. Move with WASD, look with mouse

### Quest 3:
1. Open browser
2. Go to `http://<your-LAN-IP>:3000`
3. Click "Enter VR"
4. Use controllers to spawn and manipulate objects
5. See other users' avatars
6. Hear spatial audio from objects

### Quest 3 Passthrough (AR):
1. Click "Enter AR" instead of "Enter VR"
2. See virtual objects overlaid on real environment
3. Place objects on real surfaces
4. Interact with controllers

---

## 9. Future Enhancements

- Persistence (save room state to database)
- User accounts and authentication
- Voice chat (WebRTC)
- Hand tracking (XR Hand Input)
- Physics simulation (Cannon.js, Rapier)
- Custom avatar uploads
- Object properties (color, texture, animations)
- Room templates and themes
- Mobile AR support (WebXR on iOS/Android)
- Collaborative drawing/painting tools
- Screen sharing in 3D space

---

## 10. Technical Considerations

### Performance:
- Limit number of spawned objects per room
- Use instanced rendering for identical objects
- Level of detail (LOD) for complex models
- Occlusion culling for large scenes

### Network:
- Send presence updates at reasonable rate (10-20 Hz)
- Use delta compression for object updates
- Consider using binary WebSocket messages for large data

### XR Best Practices:
- Maintain 72+ fps for Quest 3
- Avoid sudden camera movements in VR
- Provide comfort options (teleport vs smooth locomotion)
- Support seated and standing modes
- Test in both VR and AR modes

### Audio:
- Use compressed audio formats (MP3, OGG)
- Preload audio assets
- Limit concurrent spatial audio sources
- Adjust audio rolloff for room size

---

**Version:** 1.0
**Last Updated:** 2025-12-05
