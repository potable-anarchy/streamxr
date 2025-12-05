# StreamXR Service Architecture

## High-Level Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                     │
└────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  Browser Client (WebXR)                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │  Three.js    │  │  WebSocket   │  │   WebRTC     │                 │
│  │  Renderer    │  │   Client     │  │  P2P (future)│                 │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘                 │
│         │                 │                                             │
│  ┌──────▼─────────────────▼──────────────┐                             │
│  │  /public/client.js                    │                             │
│  │  - 3D Scene Management                │                             │
│  │  - Asset Caching                      │                             │
│  │  - Head Tracking (100ms)              │                             │
│  │  - Bandwidth Monitoring               │                             │
│  │  - Avatar Rendering                   │                             │
│  └───────────────────────────────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘
                             │
                             │ WebSocket (Binary + JSON)
                             │ ws://localhost:3000
                             │
┌────────────────────────────▼─────────────────────────────────────────────┐
│                        PRESENTATION LAYER                                │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  Node.js Express Server (Port 3000)                                     │
│  /server.js                                                             │
│                                                                          │
│  ┌──────────────────────┐         ┌──────────────────────┐             │
│  │  HTTP REST API       │         │  WebSocket Server    │             │
│  │                      │         │                      │             │
│  │  POST /api/assets/   │         │  • Binary Streaming  │             │
│  │       upload         │         │  • Signaling         │             │
│  │  GET /api/assets     │         │  • Room Management   │             │
│  │  DELETE /api/assets/ │         │  • State Sync        │             │
│  │         :assetId     │         │                      │             │
│  │  GET /metrics        │         │  Chunk Size: 16KB    │             │
│  └──────────────────────┘         └──────────────────────┘             │
└─────────────────────────────────────────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
┌───────────────────▼──────────────────▼──────────────────────────────────┐
│                        BUSINESS LOGIC LAYER                              │
└──────────────────────────────────────────────────────────────────────────┘

┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│  AssetManager      │  │  RoomManager       │  │  ObjectSync        │
│  /lib/             │  │  /lib/             │  │  /lib/             │
│                    │  │                    │  │                    │
│  • Asset Discovery │  │  • User Sessions   │  │  • Shared Objects  │
│  • LOD Selection   │  │  • Room Assignment │  │  • State Changes   │
│  • Cache Lookup    │  │  • Position Track  │  │  • Broadcasting    │
│  • File Loading    │  │  • Presence Sync   │  │                    │
└─────────┬──────────┘  └─────────┬──────────┘  └────────────────────┘
          │                       │
          │                       │
┌─────────▼──────────┐  ┌─────────▼──────────┐
│ AdaptiveStreaming  │  │ FoveatedStreaming  │
│ /lib/              │  │ /lib/              │
│                    │  │                    │
│ • Bandwidth Calc   │  │ • Head Tracking    │
│ • LOD Decision     │  │ • View Frustum     │
│ • Smoothing (EMA)  │  │ • Angle Calc       │
│                    │  │ • Priority Zones   │
│ Thresholds:        │  │                    │
│ HIGH: >500 KB/s    │  │ Foveal: ±15°      │
│ LOW:  <500 KB/s    │  │ Periph: 15-60°    │
└─────────┬──────────┘  └─────────┬──────────┘
          │                       │
          └───────────┬───────────┘
                      │
          ┌───────────▼───────────┐
          │   LODGenerator        │
          │   /lib/               │
          │                       │
          │   • GLB Parsing       │
          │   • Mesh Decimation   │
          │   • Auto-gen LODs     │
          │   • Cache Management  │
          │                       │
          │   Medium: 50% tris    │
          │   Low:    25% tris    │
          └───────────┬───────────┘
                      │
┌─────────────────────▼────────────────────────────────────────────────────┐
│                           DATA LAYER                                     │
└──────────────────────────────────────────────────────────────────────────┘

┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│  In-Memory Maps    │  │  File System       │  │  Cache Directory   │
│                    │  │                    │  │                    │
│  • Room State      │  │  /public/models/   │  │  /cache/lods/      │
│  • User Positions  │  │  ├─ cube/          │  │  ├─ <assetId>/     │
│  • Shared Objects  │  │  │  ├─ high.glb    │  │  │  ├─ medium.glb  │
│  • Bandwidth Data  │  │  │  ├─ medium.glb  │  │  │  └─ low.glb     │
│  • Head Poses      │  │  │  └─ low.glb     │  │  └─ ...            │
│                    │  │  └─ sphere/        │  │                    │
│  No Persistence    │  │     └─ ...         │  │  Auto-generated    │
└────────────────────┘  └────────────────────┘  └────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                      MONITORING & OBSERVABILITY                          │
└──────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────┐      ┌──────────────────────────────┐
│  Prometheus (Port 9090)        │◄─────│  prom-client Metrics         │
│                                │      │                              │
│  Scrape Interval: 15s          │      │  • websocket_connections     │
│  Storage: prometheus-data vol  │      │  • room_users                │
│                                │      │  • asset_requests_total      │
│  Metrics:                      │      │  • asset_bytes_transferred   │
│  • Time-series data            │      │  • client_bandwidth_bps      │
│  • Connection counts           │      │  • shared_objects_total      │
│  • Bandwidth metrics           │      │                              │
│  • Asset transfer stats        │      │  Endpoint: /metrics          │
└────────────┬───────────────────┘      └──────────────────────────────┘
             │
             │ Prometheus Query
             │
┌────────────▼───────────────────┐
│  Grafana (Port 3001)           │
│                                │
│  Storage: grafana-data vol     │
│                                │
│  Dashboard:                    │
│  • Real-time connections       │
│  • Bandwidth graphs            │
│  • LOD selection stats         │
│  • Asset streaming metrics     │
│  • Room occupancy              │
│                                │
│  Config: /grafana/provisioning │
└────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                         DEPLOYMENT LAYER                                 │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  Docker Compose Stack                                                   │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │  streamxr    │  │  prometheus  │  │  grafana     │                 │
│  │  (Port 3000) │  │  (Port 9090) │  │  (Port 3001) │                 │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                 │
│         │                 │                 │                           │
│         └─────────────────┴─────────────────┘                           │
│                           │                                             │
│                   ┌───────▼────────┐                                    │
│                   │  monitoring    │                                    │
│                   │  Bridge Network│                                    │
│                   └────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
                             │
                             │
┌────────────────────────────▼─────────────────────────────────────────────┐
│  Production Infrastructure                                               │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │  Raspberry Pi 4 (100.120.77.39)                                │     │
│  │  - Docker Engine                                               │     │
│  │  - Container Runtime                                           │     │
│  └─────────────────────┬──────────────────────────────────────────┘     │
│                        │                                                 │
│                        │ HTTPS                                           │
│                        │                                                 │
│  ┌─────────────────────▼──────────────────────────────────────────┐     │
│  │  Cloudflare Tunnel                                             │     │
│  │  - Reverse Proxy                                               │     │
│  │  - SSL/TLS Termination                                         │     │
│  │  - DNS: streamxr.brad-dougherty.com                            │     │
│  └────────────────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────────────────┘
```

## Traffic Flow Diagrams

### 1. Initial Connection Flow

```
┌──────────┐                                           ┌──────────┐
│ Browser  │                                           │  Server  │
└─────┬────┘                                           └────┬─────┘
      │                                                      │
      │  1. Load index.html                                 │
      ├─────────────────────────────────────────────────────►
      │                                                      │
      │  2. Load Three.js, SimplePeer, client.js            │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
      │  3. WebSocket Connect (ws://localhost:3000)         │
      ├─────────────────────────────────────────────────────►
      │                                                      │
      │                                 4. Assign clientId   │
      │                                    Add to room       │
      │                                                      │
      │  5. "welcome" message                               │
      │     {clientId, peers, color, positions}             │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
      │  6. Create peer avatars                             │
      │                                                      │
      │  7. "list_assets" request                           │
      ├─────────────────────────────────────────────────────►
      │                                                      │
      │                                  8. Scan /models     │
      │                                                      │
      │  9. "asset_list" response                           │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
      │  10. Display available assets                       │
      │                                                      │
```

### 2. Asset Streaming Flow

```
┌──────────┐                                           ┌──────────┐
│ Client   │                                           │  Server  │
└─────┬────┘                                           └────┬─────┘
      │                                                      │
      │  1. "request_asset" {assetId, lod: "high"}          │
      ├─────────────────────────────────────────────────────►
      │                                                      │
      │                    2. Check Foveated Streaming      │
      │                       (head tracking angle)          │
      │                                                      │
      │                    3. Check Adaptive Streaming      │
      │                       (bandwidth: 600 KB/s)          │
      │                                                      │
      │                    4. Determine LOD: "high"         │
      │                                                      │
      │                    5. AssetManager.getAsset()       │
      │                       Read GLB from disk             │
      │                                                      │
      │  6. "asset_metadata"                                │
      │     {size: 245760, chunks: 15}                      │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
      │  7. "asset_chunk" [binary: 16KB]                    │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
      │  8. "asset_chunk" [binary: 16KB]                    │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
      │  ... (13 more chunks)                               │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
      │  9. "asset_complete"                                │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
      │  10. Reconstruct full buffer                        │
      │      Load via GLTFLoader                            │
      │      Add to Three.js scene                          │
      │                                                      │
      │  11. "bandwidth-metrics"                            │
      │      {assetId, bytes, durationMs}                   │
      ├─────────────────────────────────────────────────────►
      │                                                      │
      │                    12. Calculate bandwidth          │
      │                        Update EMA: 587 KB/s         │
      │                        Store in Map                 │
      │                                                      │
      │  13. "lod-recommendation" {lod: "high"}             │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
```

### 3. Multiuser Presence Synchronization

```
┌──────────┐  ┌──────────┐                     ┌──────────┐
│ Client A │  │ Client B │                     │  Server  │
└─────┬────┘  └────┬─────┘                     └────┬─────┘
      │            │                                 │
      │  1. Head tracking (every 100ms)              │
      │    {position: [1,2,3], rotation: [0,0,0]}    │
      ├─────────────────────────────────────────────►│
      │            │                                 │
      │            │          2. Update RoomManager  │
      │            │             user position        │
      │            │                                 │
      │            │          3. Update Foveated     │
      │            │             view data            │
      │            │                                 │
      │            │  4. "user-position" broadcast   │
      │            │     {clientId: A, pos, rot}     │
      │            ◄─────────────────────────────────┤
      │            │                                 │
      │            │  5. Update avatar position      │
      │            │     in scene                     │
      │            │                                 │
      │  6. Peer B moves                             │
      │            │  {position: [4,5,6]}            │
      │            ├─────────────────────────────────►
      │            │                                 │
      │  7. "user-position" broadcast                │
      │     {clientId: B, pos: [4,5,6]}              │
      ◄────────────┼─────────────────────────────────┤
      │            │                                 │
      │  8. Update Peer B avatar                     │
      │                                              │
```

### 4. Shared Object Synchronization

```
┌──────────┐  ┌──────────┐                     ┌──────────┐
│ Client A │  │ Client B │                     │  Server  │
└─────┬────┘  └────┬─────┘                     └────┬─────┘
      │            │                                 │
      │  1. User spawns cube                         │
      │    "create-object"                           │
      │    {type: "cube", pos: [0,0,0], color: red}  │
      ├─────────────────────────────────────────────►│
      │            │                                 │
      │            │       2. ObjectSync.createObject│
      │            │          Generate objectId: 42   │
      │            │          Store in room Map      │
      │            │                                 │
      │  3. "object-created"                         │
      │     {objectId: 42, type: "cube", ...}        │
      ◄────────────┼─────────────────────────────────┤
      │            │                                 │
      │            │  4. "object-created" broadcast  │
      │            │     {objectId: 42, ...}         │
      │            ◄─────────────────────────────────┤
      │            │                                 │
      │  5. Add cube to scene                        │
      │            │  6. Add cube to scene           │
      │            │                                 │
      │  7. User drags cube                          │
      │    "update-object"                           │
      │    {objectId: 42, position: [1,0,0]}         │
      ├─────────────────────────────────────────────►│
      │            │                                 │
      │            │       8. ObjectSync.updateObject│
      │            │          Merge state            │
      │            │                                 │
      │  9. "object-updated" echo                    │
      │     {objectId: 42, position: [1,0,0]}        │
      ◄────────────┼─────────────────────────────────┤
      │            │                                 │
      │            │  10. "object-updated" broadcast │
      │            │      {objectId: 42, ...}        │
      │            ◄─────────────────────────────────┤
      │            │                                 │
      │            │  11. Update cube position       │
      │            │      in scene                    │
      │            │                                 │
```

### 5. Adaptive LOD Selection Flow

```
┌──────────┐                                           ┌──────────┐
│ Client   │                                           │  Server  │
└─────┬────┘                                           └────┬─────┘
      │                                                      │
      │  SCENARIO: Degrading Network                        │
      │                                                      │
      │  1. Request asset (bandwidth: 800 KB/s)             │
      ├─────────────────────────────────────────────────────►
      │                                                      │
      │              2. AdaptiveStreaming.recommendLOD()    │
      │                 → "high" (>500 KB/s threshold)       │
      │                                                      │
      │  3. Stream "high" LOD (240KB file)                  │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
      │  4. Report metrics: 240KB in 400ms                  │
      ├─────────────────────────────────────────────────────►
      │                                                      │
      │              5. Calculate bandwidth:                │
      │                 600 KB/s (240000/400*1000)          │
      │                 Update EMA: 680 KB/s                │
      │                                                      │
      │  6. Next request (bandwidth: 680 KB/s)              │
      ├─────────────────────────────────────────────────────►
      │                                                      │
      │              7. Still recommends "high"             │
      │                                                      │
      │  8. Stream "high" (240KB)                           │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
      │  9. Report: 240KB in 800ms (slow network!)          │
      ├─────────────────────────────────────────────────────►
      │                                                      │
      │              10. Calculate bandwidth:               │
      │                  300 KB/s                           │
      │                  Update EMA: 452 KB/s (smoothed)    │
      │                                                      │
      │  11. "lod-recommendation" {lod: "low"}              │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
      │  12. Next request uses "low"                        │
      │      (automatic degradation)                        │
      ├─────────────────────────────────────────────────────►
      │                                                      │
      │              13. Stream "low" LOD (60KB)            │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
      │  14. Faster load, better experience                 │
      │                                                      │
```

### 6. Foveated Rendering Priority Flow

```
┌──────────┐                                           ┌──────────┐
│ Client   │                                           │  Server  │
│ (VR HMD) │                                           │          │
└─────┬────┘                                           └────┬─────┘
      │                                                      │
      │  1. Head tracking update (every 100ms)              │
      │     {position: [0,0,0], rotation: [0,45,0]}         │
      │     (looking 45° to the right)                      │
      ├─────────────────────────────────────────────────────►
      │                                                      │
      │         2. FoveatedStreamingManager.updateClient()  │
      │            Store head pose                          │
      │                                                      │
      │  3. Request asset "sphere"                          │
      │     {assetId: "sphere", lod: "high"}                │
      ├─────────────────────────────────────────────────────►
      │                                                      │
      │         4. calculateViewPriority()                  │
      │            Object position: [10, 0, 0]              │
      │            View direction: [sin(45°), 0, cos(45°)]  │
      │            Angle to object: 22°                     │
      │                                                      │
      │         5. Check zones:                             │
      │            22° < 60° → PERIPHERAL zone              │
      │            Distance: 10m (normal range)             │
      │            → Decision: LOAD_LOW                     │
      │                                                      │
      │         6. Override bandwidth recommendation        │
      │            (Even if bandwidth says "high")          │
      │                                                      │
      │  7. Stream "low" LOD (foveated override)            │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
      │  8. Turn head to center (0°)                        │
      │     {rotation: [0,0,0]}                             │
      ├─────────────────────────────────────────────────────►
      │                                                      │
      │         9. Next request for "sphere"                │
      │            Angle: 0° (directly looking at it)       │
      │            Zone: FOVEAL (±15°)                      │
      │            → Decision: LOAD_HIGH                    │
      │                                                      │
      │  10. Stream "high" LOD (now in fovea)               │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
      │  11. Object behind user (150°)                      │
      │      → Decision: SKIP                               │
      │                                                      │
      │  12. "asset_skipped" message                        │
      ◄─────────────────────────────────────────────────────┤
      │                                                      │
```

### 7. Monitoring Data Flow

```
┌──────────────┐                                ┌──────────────┐
│   Server     │                                │  Prometheus  │
│  /server.js  │                                │  (Port 9090) │
└──────┬───────┘                                └──────┬───────┘
       │                                               │
       │  1. Client connects                           │
       │     metrics.websocketConnections.inc()        │
       │                                               │
       │  2. Asset streamed                            │
       │     metrics.assetRequests.inc({asset, lod})   │
       │     metrics.bytesTransferred.inc(size)        │
       │                                               │
       │  3. Bandwidth calculated                      │
       │     metrics.clientBandwidth.set(               │
       │       {clientId}, bandwidthBps)               │
       │                                               │
       │  4. Object created                            │
       │     metrics.sharedObjects.set(                │
       │       {roomId}, count)                        │
       │                                               │
       │  5. Expose /metrics endpoint                  │
       │                                               │
       │                            6. Scrape (every 15s)
       │  GET /metrics                                 │
       ◄───────────────────────────────────────────────┤
       │                                               │
       │  7. Prometheus format response:               │
       │     # TYPE streamxr_websocket_connections     │
       │     streamxr_websocket_connections 5          │
       │     # TYPE streamxr_asset_requests_total      │
       │     streamxr_asset_requests_total{            │
       │       asset="cube",lod="high"} 42             │
       ├──────────────────────────────────────────────►│
       │                                               │
       │                            8. Store time-series
       │                               data in TSDB    │
       │                                               │
       │                                               │
       │                                     ┌─────────▼──────┐
       │                                     │  Grafana       │
       │                                     │  (Port 3001)   │
       │                                     └─────────┬──────┘
       │                                               │
       │                            9. Query Prometheus
       │                               PromQL queries  │
       │                                               │
       │                            10. Render dashboards:
       │                                - Connection graph
       │                                - Bandwidth chart
       │                                - LOD distribution
       │                                - Asset heatmap
       │                                               │
```

## Component Interaction Matrix

| Component | Interacts With | Purpose | Protocol |
|-----------|---------------|---------|----------|
| **Browser Client** | WebSocket Server | Asset streaming, presence sync | WebSocket (Binary + JSON) |
| | Three.js | 3D rendering | JavaScript API |
| | WebRTC (future) | P2P connections | WebRTC |
| **WebSocket Server** | AssetManager | Asset retrieval | Function call |
| | RoomManager | User management | Function call |
| | ObjectSync | Object state | Function call |
| | AdaptiveStreaming | LOD selection | Function call |
| | FoveatedStreaming | Head-tracking LOD | Function call |
| | Prometheus | Metrics export | HTTP /metrics |
| **AssetManager** | LODGenerator | LOD creation | Function call |
| | File System | Asset loading | fs module |
| | Cache | LOD storage | fs module |
| **AdaptiveStreaming** | Client | Bandwidth data | WebSocket messages |
| **FoveatedStreaming** | Client | Head pose data | WebSocket messages |
| **Prometheus** | WebSocket Server | Metrics scraping | HTTP pull |
| | Grafana | Data source | PromQL |
| **Grafana** | Prometheus | Query metrics | HTTP |

## Key Design Patterns

### 1. **Streaming Pattern**
- **Chunked Binary Transfer**: Large GLB files split into 16KB chunks
- **Metadata-First**: Send size/chunk count before binary data
- **Sequential Delivery**: Chunks sent in order for reassembly
- **Memory Efficient**: Stream processing, no full buffer needed

### 2. **Adaptive Quality Pattern**
- **Exponential Moving Average**: Smooth bandwidth fluctuations
- **Threshold-Based Decisions**: Clear LOD boundaries (500 KB/s)
- **Progressive Degradation**: Automatic quality reduction
- **Client-Reported Metrics**: Actual transfer times from client

### 3. **Foveated Rendering Pattern**
- **View-Dependent LOD**: Based on gaze angle
- **Zone-Based Priority**: Foveal > Peripheral > Far Peripheral
- **Override Capability**: Can override bandwidth selection
- **Distance Attenuation**: Closer objects get higher priority

### 4. **Room-Based Isolation**
- **Logical Grouping**: Users organized by rooms
- **Scoped Broadcasting**: Messages only to room members
- **Independent State**: Each room has separate object state
- **Default Room**: "default" for ungrouped users

### 5. **In-Memory State Pattern**
- **No Persistence**: All state ephemeral
- **Fast Lookups**: JavaScript Maps for O(1) access
- **Automatic Cleanup**: State cleared on disconnect
- **Scalability Trade-off**: Memory vs. speed

### 6. **Cache-Aside Pattern**
- **Lazy Generation**: LODs created on first request
- **Persistent Cache**: Survives server restarts
- **Lookup-First**: Check cache before generation
- **Transparent Fallback**: Generate if missing

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| **WebSocket Message Latency** | <10ms | Local network |
| **Asset Streaming Time** | <5s | 240KB asset on Raspberry Pi 4 |
| **Head Tracking Frequency** | 10 Hz | 100ms intervals |
| **Bandwidth Detection Time** | 2-3 transfers | For accurate EMA |
| **LOD Switch Delay** | 2-5s | Due to bandwidth smoothing |
| **Memory per Client** | ~100 bytes | Position + bandwidth data |
| **Max Concurrent Users** | 10+ | Tested, scalability TBD |
| **Prometheus Scrape Interval** | 15s | Configurable |
| **Chunk Size** | 16 KB | Configurable in server.js |

## Security Considerations

| Area | Current State | Notes |
|------|--------------|-------|
| **Authentication** | None | Open WebSocket connections |
| **Authorization** | None | All users can access all assets |
| **Input Validation** | Minimal | Basic type checking |
| **File Upload** | Unrestricted | Any GLB file accepted |
| **Rate Limiting** | None | No DDoS protection |
| **HTTPS/WSS** | Via Cloudflare | Tunnel provides TLS |
| **CORS** | Disabled | `cors()` middleware |

**Recommendation**: Implement authentication, input validation, and rate limiting for production use.

## Scalability Bottlenecks

1. **In-Memory State**: No horizontal scaling without state sync
2. **Single Server**: No load balancing implemented
3. **Synchronous Broadcasting**: O(n) per message to room
4. **File System I/O**: LOD generation blocks event loop
5. **No CDN**: Assets served directly from server

**Recommendation**: Consider Redis for shared state, worker threads for LOD generation, and CDN for asset delivery.

## Future Architecture Considerations

### Potential Enhancements:
1. **WebRTC P2P**: Direct client-to-client asset sharing
2. **Redis State Store**: Persistent, distributed state
3. **S3 Asset Storage**: Cloud-based asset hosting
4. **Worker Threads**: Non-blocking LOD generation
5. **Load Balancer**: Multi-instance deployment
6. **Database**: Persistent user sessions and analytics
7. **Auth Layer**: JWT-based authentication
8. **CDN Integration**: CloudFront/Cloudflare for assets

---

**Document Version**: 1.0
**Last Updated**: 2025-12-05
**Architecture Status**: Production-ready for small-scale deployment
