# StreamXR

**A WebXR-first 3D content streaming platform with adaptive quality and multiuser support.**

Live at: **https://streamxr.brad-dougherty.com**

## Overview

StreamXR is a real-time 3D streaming platform that delivers optimized GLB models to WebXR devices (Quest 3, Vision Pro, iOS/Android AR) using adaptive bitrate streaming and foveated rendering techniques.

### Key Features

- 🎮 **WebXR Native** - Phone AR, Quest 3 VR, Vision Pro support
- 📡 **Real-time Streaming** - Binary GLB asset delivery over WebSocket
- 🎯 **Foveated Streaming** - Higher quality where you look (head tracking)
- 📊 **Adaptive Bitrate** - Automatic quality based on bandwidth
- 👥 **Multiuser** - Shared rooms with avatar synchronization
- 🎨 **Interactive Objects** - Spawn and manipulate shared 3D objects
- 🔧 **Dynamic LOD** - Automatic mesh decimation library

## Quick Start

### Running Locally

```bash
# Install dependencies
npm install

# Start server
npm start

# Open in browser
open http://localhost:3000
```

### Docker Deployment

```bash
# Build image
docker build -t streamxr .

# Run container
docker run -d -p 3000:3000 --name streamxr streamxr
```

## Using the Client

### Desktop Browser (Testing)

1. **Open** https://streamxr.brad-dougherty.com
2. **Look around** - Move your mouse to rotate camera
3. **Move** - Use WASD or arrow keys
4. **Spawn Objects** - Click "Spawn Cube", "Spawn Sphere", or "Spawn Cone" buttons
5. **Multi-window Test** - Open multiple browser tabs to test multiuser

### WebXR Devices (AR/VR)

#### Quest 3 / Meta Quest

1. Open **Oculus Browser** or **Meta Browser**
2. Navigate to https://streamxr.brad-dougherty.com
3. Click **"Enter VR"** button when prompted
4. **Look around** - Head tracking is automatic
5. **Spawn objects** - Use controller to point and trigger

#### iPhone/Android (WebXR AR)

1. Open in **Safari (iOS)** or **Chrome (Android)**
2. Navigate to https://streamxr.brad-dougherty.com
3. Tap **"Enter AR"** when prompted
4. Point camera at floor/surface
5. Tap screen to spawn objects in AR space

#### Apple Vision Pro

1. Open **Safari**
2. Navigate to https://streamxr.brad-dougherty.com
3. Click **"Enter VR"** button
4. Use hand tracking or controllers to interact

### Understanding the HUD

The status overlay shows:
- **WebSocket**: Connection status (green = connected)
- **Client ID**: Your unique session ID
- **Peers**: Number of other users in the room
- **Current LOD**: Quality level (HIGH/LOW) based on bandwidth
- **Asset Status**: Download progress for 3D models

## Architecture

### Technology Stack

- **Backend**: Node.js + Express + WebSocket (ws)
- **Frontend**: Three.js + WebXRManager
- **Assets**: GLB (GLTF Binary) with 2 LOD levels
- **Networking**: WebSocket for signaling & binary streaming
- **Deployment**: Docker + Cloudflare Tunnel

### System Components

```
┌─────────────┐         WebSocket         ┌──────────────┐
│   Client    │◄──────────────────────────►│    Server    │
│  (Three.js) │   Binary GLB Streaming    │  (Node.js)   │
└─────────────┘                            └──────────────┘
      │                                            │
      │                                            ├── AssetManager
      │                                            ├── RoomManager
      │                                            ├── ObjectSync
      │                                            ├── AdaptiveStreaming
      │                                            ├── FoveatedStreaming
      │                                            └── LODGenerator
```

## Implementation Phases

All 7 phases are complete:

### ✅ Phase 1: WebRTC Foundation
- WebSocket signaling server
- Binary data transfer
- Three.js scene with basic cube

### ✅ Phase 2: Asset Streaming
- GLB model loading and streaming
- Chunked binary transfer (16KB chunks)
- AssetManager for high/low LOD variants

### ✅ Phase 3: Adaptive Bitrate
- Real-time bandwidth monitoring
- Automatic LOD selection (> 500 KB/s = high, < 500 KB/s = low)
- Blended client/server bandwidth estimation

### ✅ Phase 4: Foveated Streaming
- Head position and rotation tracking
- Viewing angle calculation to objects
- High LOD for objects in center of view (< 30°)

### ✅ Phase 5: Multiuser
- Room management system
- Avatar rendering (sphere head + cylinder body)
- Position/rotation synchronization
- Random colored avatars per user

### ✅ Phase 6: Interactive Objects
- Spawn cubes, spheres, and cones
- ObjectSync for shared object state
- XR controller support
- UI buttons and controller triggers

### ✅ Phase 7: Dynamic LOD
- GLB parser and rebuilder
- Mesh decimation (50%, 25% triangle reduction)
- Automatic LOD generation library
- Caching system for generated LODs

## File Structure

```
streamxr/
├── server.js                    # Main server
├── lib/
│   ├── assetManager.js         # GLB asset loading
│   ├── adaptiveStreaming.js    # Bandwidth-based LOD
│   ├── foveatedStreaming.js    # Head tracking LOD
│   ├── roomManager.js          # Multiuser rooms
│   ├── objectSync.js           # Shared object state
│   └── lodGenerator.js         # Dynamic mesh decimation
├── public/
│   ├── index.html              # Client HTML
│   ├── client.js               # Three.js + WebXR client
│   └── models/                 # GLB assets
│       ├── cube/
│       │   ├── high.glb
│       │   └── low.glb
│       └── sphere/
│           ├── high.glb
│           └── low.glb
├── scripts/
│   └── generateTestAssets.js  # Create test GLB files
├── Dockerfile                  # Docker image
├── docker-compose.yml          # Docker Compose config
└── package.json
```

## Configuration

### Bandwidth Thresholds

Edit `lib/adaptiveStreaming.js`:

```javascript
THRESHOLDS = {
  HIGH: 500000,  // 500 KB/s - use high LOD
  LOW: 100000    // 100 KB/s - use low LOD
}
```

### Foveated Streaming

Edit `lib/foveatedStreaming.js`:

```javascript
FOVEAL_THRESHOLD = 30  // degrees - high LOD within 30° of view center
```

### Server Port

Edit `server.js`:

```javascript
const PORT = process.env.PORT || 3000;
```

## Development

### Adding New Assets

1. Create directory: `public/models/myAsset/`
2. Add high-quality GLB: `public/models/myAsset/high.glb`
3. Add low-quality GLB: `public/models/myAsset/low.glb`
4. Restart server - AssetManager auto-discovers assets

### Generating LOD Levels

Option 1: Manual GLB creation
- Create high.glb and low.glb separately in Blender/Maya

Option 2: Use LODGenerator (future - see VibKanban task)
```javascript
const LODGenerator = require('./lib/lodGenerator');
const generator = new LODGenerator();
const lods = await generator.generateLODs(highGLBBuffer, 'myAsset');
```

### Testing Multiuser

1. Open https://streamxr.brad-dougherty.com in Tab 1
2. Open same URL in Tab 2
3. Move/rotate camera in Tab 1 → See avatar in Tab 2
4. Spawn object in Tab 1 → Appears in Tab 2

### Network Throttling Test

1. Open DevTools → Network tab
2. Set throttling to "Slow 3G"
3. Refresh page
4. Watch HUD: "Current LOD: LOW" appears
5. Disable throttling
6. HUD updates: "Current LOD: HIGH"

## Deployment

### Production (Raspberry Pi + Cloudflare)

Current deployment:
- **Server**: Raspberry Pi at 100.120.77.39
- **Container**: Docker (streamxr:latest)
- **Tunnel**: Cloudflare Tunnel (streamxr)
- **DNS**: streamxr.brad-dougherty.com
- **Status**: Live and running

Update deployment:
```bash
# Build new image
docker build -t streamxr:latest .
docker save streamxr:latest | gzip > streamxr.tar.gz

# Deploy to Pi
scp streamxr.tar.gz brad@100.120.77.39:~/streamxr/
ssh brad@100.120.77.39 "cd ~/streamxr && \
  docker stop streamxr && docker rm streamxr && \
  docker load < streamxr.tar.gz && \
  docker run -d --name streamxr --restart unless-stopped -p 3000:3000 streamxr:latest"
```

### Cloudflare Tunnel

The tunnel is configured as a systemd service:
```bash
ssh brad@100.120.77.39 "sudo systemctl status cloudflared"
```

Config at `/etc/cloudflared/config.yml`:
```yaml
tunnel: 6f8253e9-d469-4cbc-8d13-13aca3cca104
credentials-file: /etc/cloudflared/6f8253e9-d469-4cbc-8d13-13aca3cca104.json

ingress:
  - hostname: streamxr.brad-dougherty.com
    service: http://localhost:3000
  - service: http_status:404
```

## Performance

Measured on Raspberry Pi 4:
- **Asset streaming**: < 5ms per asset
- **Bandwidth detection**: 2-3 transfers for accuracy
- **LOD switching**: 2-5 second response time
- **Memory per client**: ~100 bytes overhead
- **Concurrent users**: Tested up to 10 users

## Troubleshooting

### "Enter VR" button doesn't appear
- Ensure device supports WebXR
- Use HTTPS (required for WebXR)
- Check browser compatibility (Chrome/Safari recommended)

### Assets not loading
- Check server logs: `docker logs streamxr`
- Verify GLB files exist in `public/models/`
- Check network tab for 404 errors

### Always showing LOW LOD
- Wait for 2-3 asset downloads (bandwidth sampling)
- Check actual network speed (should be > 500 KB/s)
- Look at server console for bandwidth measurements

### Multiuser not working
- Confirm multiple clients are in same room (default)
- Check WebSocket connection status in HUD
- Verify server logs show both clients connected

## Contributing

StreamXR is a hackathon project. See `DESIGN.md` for architecture details.

### Next Steps (VibKanban)

Current task queue:
1. Integrate LODGenerator into AssetManager
2. Add CLI tool for manual LOD generation
3. Implement progressive asset loading
4. Add user manual quality override

## License

Private project - Not licensed for public use

## Credits

Built by Brad Dougherty (@muertetaco)
- **Category**: Mixed & Virtual Reality
- **Tech Stack**: WebXR, Three.js, Node.js, Docker, Cloudflare
- **Deployment**: Raspberry Pi 4 + Cloudflare Tunnel

---

**Status**: ✅ All 7 phases complete | 🌐 Live at https://streamxr.brad-dougherty.com
