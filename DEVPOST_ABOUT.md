# About StreamXR

## Inspiration

Video streaming services like Netflix revolutionized how we consume 2D content - no massive downloads, instant playback on any device, quality that adapts to your connection. But for 3D and XR content? We're still stuck in the dark ages, forcing users to download gigabyte-sized files before experiencing anything.

We were inspired by platforms like Miris and the fundamental question: *What if 3D content could stream like video?* Just like Netflix made HD video accessible anywhere, StreamXR aims to make immersive spatial experiences instantly accessible on any WebXR device - from iPhones to Quest 3 to Vision Pro - without app installs or massive downloads.

## What it does

StreamXR is a real-time 3D streaming platform that intelligently delivers optimized spatial content to any WebXR device:

- **Adaptive Bitrate Streaming**: Like Netflix for 3D - automatically adjusts model quality based on your connection speed (>500 KB/s = high quality, <500 KB/s = low quality)
- **Foveated Streaming**: Sends high-quality assets where you're actually looking (<30° from view center), low-quality elsewhere - massive bandwidth savings without visible quality loss
- **Dynamic LOD Generation**: Drop in a high-quality `.glb` file and the server automatically generates medium (50% triangles) and low (25% triangles) variants using mesh decimation
- **True Cross-Platform**: Same codebase runs on iOS/Android AR, Meta Quest 3 VR, and Apple Vision Pro
- **Real-time Multiuser**: Multiple users share the same 3D space with synchronized avatars and positions
- **Interactive Shared Objects**: Spawn cubes, spheres, cones and grab/manipulate them in real-time - changes sync across all connected clients with ownership conflict prevention

## How we built it

**Tech Stack:**
- **Backend**: Node.js + Express + WebSocket (`ws`) for real-time communication
- **Frontend**: Three.js + WebXRManager for 3D rendering and XR sessions
- **Streaming**: Binary GLB streaming over WebSocket with 16KB chunked transfers
- **LOD Generation**: Custom mesh decimation using `meshoptimizer` and `gltf-pipeline`
- **Monitoring**: Prometheus metrics + Grafana dashboards for real-time analytics
- **Deployment**: Docker Compose on Lima VM + Cloudflare Tunnel for global HTTPS access

**Architecture:**
1. Client connects via WebSocket and sends head-tracking data (position, rotation, quaternion) at 10Hz
2. Server calculates view frustum and selects appropriate LOD for each object based on:
   - Bandwidth (measured from transfer speeds)
   - Viewing angle (foveated - high LOD within 30° of gaze)
3. Binary GLB assets stream in 16KB chunks, reassembled client-side
4. Room manager synchronizes multiple users with avatar positions broadcast at 20Hz
5. Object ownership system prevents manipulation conflicts with 5-second auto-release timeout

**Key Innovation - Foveated Streaming Without Eye Tracking:**

$$\text{angle} = \arccos\left(\frac{\vec{viewDir} \cdot \vec{objectDir}}{|\vec{viewDir}| \cdot |\vec{objectDir}|}\right)$$

If $\text{angle} < 30°$, serve high LOD; otherwise serve low LOD. This works on any device with head tracking - no special eye tracking hardware required.

## Challenges we ran into

1. **WebSocket Binary Streaming**: Getting reliable chunked binary transfers for GLB files without corruption required careful buffer management and proper ArrayBuffer reassembly on the client

2. **LOD Generation Pipeline**: Building a mesh decimation system that preserves visual quality while reducing triangle count by 50-75% involved trial and error with different decimation algorithms

3. **Cross-Platform WebXR Differences**: Quest 3, Vision Pro, and phone AR all have different WebXR capabilities - hand tracking vs controllers, `immersive-ar` vs `immersive-vr`, different session features

4. **Object Manipulation Sync**: Implementing grab-and-move for shared objects with ownership, conflict prevention, and smooth interpolation across network latency was complex

5. **Vision Pro Hand Tracking**: Implementing pinch-to-grab gestures using WebXR hand input required understanding joint positions, select events, and smooth quaternion interpolation for natural feel

## Accomplishments that we're proud of

- **7 Implementation Phases Completed**: From WebSocket foundation to dynamic LOD generation - the full streaming pipeline works
- **Foveated Streaming Actually Works**: You genuinely cannot perceive the quality difference between center and periphery - dramatic bandwidth savings
- **Sub-2ms Asset Streaming**: Server-side asset delivery is nearly instant
- **Hand Tracking on Vision Pro**: Natural pinch-to-grab gestures with smooth object following and visual feedback (proximity highlighting, grab indication)
- **True Cross-Platform**: Same JavaScript codebase runs on Quest 3 VR, Vision Pro AR, iPhone AR, and desktop browser
- **Production Deployment**: Live at https://streamxr.brad-dougherty.com with monitoring at Grafana dashboard
- **All Open Web Standards**: No proprietary SDKs - pure WebXR, WebSocket, Three.js

## What we learned

- **WebRTC is overkill for this use case**: Plain WebSocket with binary transfers is simpler and sufficient for asset streaming - WebRTC's complexity (STUN/TURN, ICE candidates) wasn't necessary
- **Head tracking is "good enough"**: Foveated rendering doesn't require expensive eye tracking hardware - head direction provides 80% of the benefit
- **LOD pre-generation is crucial**: Runtime mesh decimation is too slow; pre-generating or caching LOD variants on server startup is essential
- **Three.js + WebXR is production-ready**: The web platform has matured enough to build serious XR applications without native SDKs
- **Network > GPU**: Most XR performance bottlenecks are bandwidth and latency, not rendering - optimize the network first

## What's next for StreamXR

**Short-term:**
- Spatial audio streaming with positional sound effects
- User-uploaded 3D assets with automatic LOD generation
- Improved hand mesh visualization (full hand models instead of spheres)

**Medium-term:**
- SFU (Selective Forwarding Unit) architecture for 100+ concurrent users
- AI-assisted LOD generation using learned mesh simplification
- Persistent rooms with database storage
- CDN integration for global low-latency delivery

**Long-term Vision:**
- Radiance field / 3D Gaussian Splat streaming for photorealistic volumetric content
- Full eye tracking integration on Vision Pro for true foveated rendering
- Become the "Netflix of spatial content" - a massive library of instantly streamable 3D experiences
