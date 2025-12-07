# StreamXR

**Real-time 3D streaming platform with adaptive quality optimization for WebXR devices.**

🌐 **Live Demo**: https://streamxr.brad-dougherty.com

## Overview

StreamXR streams optimized 3D models to VR/AR headsets with automatic quality adaptation based on bandwidth and viewing angle. Built for Quest 3, Vision Pro, and mobile WebXR.

## Core Features

- **🎯 Adaptive Streaming** - Auto-switches between HIGH/LOW quality based on bandwidth (>500KB/s threshold)
- **📡 Foveated Rendering** - Serves higher quality models in your central field of view (<30° viewing angle)
- **🗜️ Texture Compression** - 96% smaller LOW LOD files (122KB vs 3.14MB) with 256px textures
- **🎮 WebXR Support** - Quest 3, Vision Pro, iOS/Android AR with hand tracking
- **👥 Multiuser Rooms** - Real-time object synchronization and shared manipulation
- **🔧 Dynamic LOD Generation** - Automatic mesh decimation (50%/10% triangle reduction) with caching

## Quick Start

```bash
npm install
npm start
# Open http://localhost:3000
```

**Docker:**
```bash
docker compose up -d
```

## Usage

### Desktop Controls
- **WASD / Arrow Keys** - Move camera
- **Mouse Drag** - Look around
- **Spawn Buttons** - Create cubes, spheres, cones
- **Right-click** - Grab/manipulate objects

### VR/AR (Quest 3, Vision Pro)
1. Click **"Enter VR"** or **"Enter AR"** button
2. **Hand Tracking** - Cyan (left) and magenta (right) sphere indicators
3. **Controller Trigger** - Spawn objects or grab existing ones
4. Objects grabbed by other users show colored wireframes

### HUD Status Indicators
- **WebSocket** - Connection status
- **Current LOD** - Quality level (HIGH/LOW)
- **Bandwidth** - Current transfer rate
- **FPS** - Frame rate performance


## LOD Generation

Add a single high-quality GLB file and the system auto-generates optimized versions:

```bash
mkdir public/models/myAsset
cp model.glb public/models/myAsset/high.glb
npm start  # Auto-generates medium.glb (50%) and low.glb (10%)
```

**Manual generation:**
```bash
node scripts/generateLODs.js myAsset        # Generate for one asset
node scripts/generateLODs.js --all          # Generate for all assets
```

**Quality levels:**
- **HIGH**: 100% triangles, original textures (3.14MB)
- **MEDIUM**: 50% triangles, 512px textures (244KB)
- **LOW**: 10% triangles, 256px textures (122KB)


## Architecture

**Tech Stack:** Node.js + Express + WebSocket + Three.js + WebXR

```
Client (Three.js) ◄──WebSocket──► Server (Node.js)
     │                                │
     │                                ├── AssetManager (GLB streaming)
     │                                ├── AdaptiveStreaming (bandwidth)
     │                                ├── FoveatedStreaming (gaze tracking)
     │                                ├── RoomManager (multiuser)
     │                                ├── ObjectSync (shared state)
     │                                └── LODGenerator (mesh decimation)
```

## Implementation Status

**✅ All 7 phases complete:**

1. **WebSocket Foundation** - Binary GLB streaming over WebSocket
2. **Asset Streaming** - Chunked transfer (16KB) with AssetManager
3. **Adaptive Bitrate** - Auto LOD selection based on bandwidth (>500KB/s threshold)
4. **Foveated Streaming** - Higher quality in central 30° field of view
5. **Multiuser Rooms** - Shared rooms with position sync
6. **Interactive Objects** - Spawn/grab/manipulate with ownership system
7. **Dynamic LOD Generation** - Auto mesh decimation with texture compression

## Project Structure

```
streamxr/
├── server.js                   # WebSocket server
├── lib/
│   ├── assetManager.js        # GLB streaming
│   ├── adaptiveStreaming.js   # Bandwidth-based LOD (>500KB/s = HIGH)
│   ├── foveatedStreaming.js   # Gaze-based LOD (<30° = HIGH)
│   ├── lodGenerator.js        # Mesh decimation + texture compression
│   ├── roomManager.js         # Multiuser rooms
│   └── objectSync.js          # Shared object state
├── public/
│   ├── client.js              # Three.js WebXR client
│   └── models/                # GLB assets (high/medium/low)
├── cache/lods/                # Generated LODs (gitignored)
└── docker-compose.yml
```

## Deployment

**Production:** Mac Studio Lima VM (Ubuntu 24.04, 4 CPUs, 8GB RAM) + Cloudflare Tunnel

- **Live Site**: https://streamxr.brad-dougherty.com
- **Monitoring**: https://streamxr-grafana.brad-dougherty.com
- **Stack**: Docker Compose (nginx + node + prometheus + grafana)

**Update deployment:**
```bash
# Local
scp -r public/ brad@100.81.45.56:/tmp/

# Server
ssh brad@100.81.45.56
limactl shell streamxr
cd /home/brad.linux/streamxr
cp -r /tmp/public/* ./public/
sudo docker compose restart
```

## Performance

- **Asset streaming**: <2ms per asset
- **LOD switching**: 1-2 seconds
- **Concurrent users**: Tested 10+ simultaneous
- **File sizes**: 122KB (LOW) | 244KB (MEDIUM) | 3.14MB (HIGH)

---

**Built by Brad Dougherty** | WebXR + Three.js + Node.js + Docker
