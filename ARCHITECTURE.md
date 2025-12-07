# StreamXR Architecture

## System Overview

```mermaid
graph TB
    subgraph "Client Devices"
        Phone["📱 Phone<br/>(iOS/Android WebXR AR)"]
        Quest["🥽 Quest 3<br/>(WebXR VR)"]
        Vision["👓 Vision Pro<br/>(WebXR VR/AR)"]
    end

    subgraph "Network Layer"
        CF["☁️ Cloudflare Tunnel<br/>streamxr.brad-dougherty.com"]
    end

    subgraph "Server Infrastructure"
        Nginx["🔀 Nginx Reverse Proxy<br/>Port 80<br/>24hr WebSocket timeout"]
        Node["🟢 Node.js + Express<br/>Port 3000<br/>WebRTC + WebSocket"]
        
        subgraph "Services"
            AssetMgr["📦 Asset Manager<br/>GLB streaming<br/>LOD selection"]
            Adaptive["📊 Adaptive Streaming<br/>Bandwidth detection<br/>Quality adjustment"]
            Foveated["👁️ Foveated Streaming<br/>Head tracking<br/>High LOD where looking"]
            RoomMgr["👥 Room Manager<br/>Multi-user sync<br/>Avatar positions"]
            ObjSync["🎯 Object Sync<br/>Shared objects<br/>Manipulation sync"]
        end
        
        Prometheus["📈 Prometheus<br/>Metrics collection<br/>Port 9090"]
        Grafana["📊 Grafana<br/>Visualization<br/>Port 3001"]
    end

    subgraph "Storage"
        Models["💾 3D Models<br/>public/models/<br/>high.glb + low.glb<br/>Draco compressed"]
    end

    subgraph "Monitoring"
        Dashboard["📊 StreamXR Dashboard<br/>- WebSocket connections<br/>- Room users<br/>- Client bandwidth<br/>- Shared objects<br/>- Data transfer"]
    end

    Phone -->|HTTPS/WSS| CF
    Quest -->|HTTPS/WSS| CF
    Vision -->|HTTPS/WSS| CF
    
    CF -->|Port 80| Nginx
    Nginx -->|Proxy| Node
    
    Node --> AssetMgr
    Node --> Adaptive
    Node --> Foveated
    Node --> RoomMgr
    Node --> ObjSync
    
    AssetMgr --> Models
    
    Node -->|/metrics| Prometheus
    Prometheus --> Grafana
    Grafana --> Dashboard

    style Phone fill:#e1f5ff
    style Quest fill:#e1f5ff
    style Vision fill:#e1f5ff
    style CF fill:#f9a825
    style Nginx fill:#009688
    style Node fill:#4caf50
    style Prometheus fill:#e96d28
    style Grafana fill:#f46800
    style Models fill:#9c27b0
```

## Data Flow

```mermaid
sequenceDiagram
    participant Client as 🥽 Client Browser<br/>(Three.js + WebXR)
    participant Nginx as 🔀 Nginx
    participant Server as 🟢 Node.js Server
    participant Asset as 📦 Asset Manager
    participant Room as 👥 Room Manager
    participant Metrics as 📈 Prometheus

    Client->>Nginx: HTTPS GET /
    Nginx->>Server: Proxy request
    Server->>Client: HTML + client.js

    Client->>Nginx: WebSocket upgrade
    Nginx->>Server: Upgrade connection
    Server->>Client: WebSocket established
    Server->>Metrics: Increment websocket_connections
    Server->>Room: Register client in room
    Server->>Metrics: Set room_users

    loop Head Tracking (10 FPS)
        Client->>Server: head-tracking data<br/>{position, rotation, quaternion}
        Server->>Room: Update client view
        Server->>Client: Broadcast to other clients
    end

    Client->>Server: request_asset<br/>{assetId, lod}
    Server->>Asset: Get GLB model
    Asset->>Asset: Select LOD (high/low)
    Asset->>Server: Binary GLB data
    Server->>Client: Binary transfer via WebSocket
    Server->>Metrics: Increment data_transferred_bytes

    loop Adaptive Bitrate (1 second)
        Server->>Client: Bandwidth stats
        Client->>Client: Measure bandwidth
        Client->>Server: Update quality preference
        Server->>Asset: Adjust LOD
    end

    Client->>Server: Enter WebXR mode
    Client->>Client: Start XR session
    
    loop XR Animation Loop
        Client->>Client: renderer.setAnimationLoop()
        Client->>Server: Enhanced head tracking
        Server->>Room: Foveated region update
    end

    Client->>Server: disconnect
    Server->>Room: Remove client
    Server->>Metrics: Decrement counters
```

## Technology Stack

```mermaid
graph LR
    subgraph "Frontend"
        ThreeJS["Three.js<br/>3D rendering"]
        WebXR["WebXR API<br/>VR/AR sessions"]
        GLTFLoader["GLTFLoader<br/>Model loading"]
        DracoLoader["DracoLoader<br/>Decompression"]
    end

    subgraph "Backend"
        Express["Express.js<br/>HTTP server"]
        WS["ws library<br/>WebSocket"]
        SimplePeer["simple-peer<br/>WebRTC (future)"]
    end

    subgraph "DevOps"
        Docker["Docker Compose<br/>Container orchestration"]
        NginxC["Nginx<br/>Reverse proxy"]
        PromC["Prometheus<br/>Metrics"]
        GrafanaC["Grafana<br/>Dashboards"]
    end

    subgraph "Deployment"
        GitHub["GitHub<br/>Version control"]
        MacStudio["Mac Studio<br/>Lima VM host"]
        CloudflareT["Cloudflare<br/>Tunnel"]
    end

    ThreeJS --> WebXR
    WebXR --> GLTFLoader
    GLTFLoader --> DracoLoader
    
    Express --> WS
    Express --> SimplePeer
    
    Docker --> NginxC
    Docker --> PromC
    Docker --> GrafanaC
    
    GitHub --> MacStudio
    MacStudio --> CloudflareT
```

## WebSocket Protocol

```mermaid
stateDiagram-v2
    [*] --> Connecting: Client opens WebSocket
    
    Connecting --> Connected: Connection established
    Connected --> Tracking: Send head-tracking data
    Connected --> Requesting: Request asset
    Connected --> Spawning: Spawn shared object
    
    Tracking --> Tracking: Update position/rotation
    Requesting --> Streaming: Server sends binary GLB
    Streaming --> Connected: Asset loaded
    Spawning --> Syncing: Broadcast to room
    Syncing --> Connected: Object created
    
    Connected --> Disconnected: Close connection
    Disconnected --> [*]

    note right of Tracking
        JSON messages:
        {type: "head-tracking",
         position: [x,y,z],
         rotation: [x,y,z],
         quaternion: [x,y,z,w]}
    end note

    note right of Requesting
        JSON messages:
        {type: "request_asset",
         assetId: "duck",
         lod: "high"}
    end note

    note right of Streaming
        Binary messages:
        ArrayBuffer with GLB data
    end note
```

## Monitoring Metrics

```mermaid
graph TD
    subgraph "Prometheus Metrics"
        WS["streamxr_websocket_connections<br/>Gauge: Active connections"]
        RU["streamxr_room_users{room}<br/>Gauge: Users per room"]
        BW["streamxr_client_bandwidth_bps{client_id}<br/>Gauge: Bandwidth per client"]
        DT["streamxr_data_transferred_bytes<br/>Counter: Total data sent"]
        SO["streamxr_shared_objects_total{room}<br/>Gauge: Objects per room"]
    end

    subgraph "Grafana Dashboard"
        G1["WebSocket Connections<br/>Time series"]
        G2["Room Users<br/>Time series"]
        G3["Client Bandwidth<br/>Multi-line"]
        G4["Data Transferred<br/>Counter rate"]
        G5["Shared Objects<br/>Time series"]
    end

    WS --> G1
    RU --> G2
    BW --> G3
    DT --> G4
    SO --> G5

    style WS fill:#e3f2fd
    style RU fill:#e3f2fd
    style BW fill:#e3f2fd
    style DT fill:#e3f2fd
    style SO fill:#e3f2fd
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Development"
        Local["💻 Local Development<br/>MacBook<br/>/Users/brad/streamxr"]
        Git["🔀 GitHub<br/>potable-anarchy/streamxr"]
    end

    subgraph "Production Server (Mac Studio + Lima VM)"
        MacStudio["🖥️ Mac Studio<br/>100.81.45.56<br/>Tailscale + Cloudflared"]
        
        subgraph "Lima VM (lima-streamxr)"
            LimaVM["📦 Ubuntu 24.04 VM<br/>100.126.174.124<br/>4 CPUs, 8GB RAM"]
            
            subgraph "Docker Containers"
                C1["nginx:alpine<br/>streamxr-nginx<br/>Port 3000:80"]
                C2["streamxr:latest<br/>streamxr<br/>Expose 3000"]
                C3["prom/prometheus<br/>prometheus<br/>Port 9092:9090"]
                C4["grafana/grafana<br/>grafana<br/>Port 3003:3000"]
            end
        end
    end

    subgraph "Public Access"
        CF2["☁️ Cloudflare Tunnel<br/>streamxr.brad-dougherty.com<br/>streamxr-grafana.brad-dougherty.com<br/>streamxr-prometheus.brad-dougherty.com"]
    end

    Local -->|git push| Git
    Git -->|tar + scp| MacStudio
    MacStudio -->|limactl copy| LimaVM
    LimaVM -->|docker compose up| C1
    LimaVM -->|docker compose up| C2
    LimaVM -->|docker compose up| C3
    LimaVM -->|docker compose up| C4
    
    C1 -->|proxy| C2
    C2 -->|/metrics| C3
    C3 -->|datasource| C4
    
    CF2 -->|http://100.126.174.124:3000| C1
    CF2 -->|http://100.126.174.124:3003| C4
    CF2 -->|http://100.126.174.124:9092| C3
    MacStudio -->|Cloudflare Tunnel| CF2

    style Local fill:#e1f5ff
    style Git fill:#333
    style MacStudio fill:#4caf50
    style LimaVM fill:#2196f3
    style CF2 fill:#f9a825
```

## Current Implementation Status

| Phase | Feature | Status | Files |
|-------|---------|--------|-------|
| 1 | WebRTC Foundation | ✅ Complete | server.js, client.js |
| 2 | Asset Streaming | ✅ Complete | lib/assetManager.js |
| 3 | Adaptive Bitrate | ✅ Complete | lib/adaptiveStreaming.js |
| 4 | Foveated Streaming | ✅ Complete | lib/foveatedStreaming.js |
| 5 | Multiuser | ✅ Complete | lib/roomManager.js |
| 6 | Interactive Objects | ✅ Complete | lib/objectSync.js |
| 7 | Dynamic LOD | 📋 Planned | lib/lodGenerator.js |

## Additional Features

- ✅ **WebXR Support**: Vision Pro, Quest 3, Phone AR/VR
- ✅ **Prometheus Metrics**: Real-time monitoring
- ✅ **Grafana Dashboard**: Visual analytics at streamxr-grafana.brad-dougherty.com
- ✅ **Nginx Reverse Proxy**: 24-hour WebSocket stability
- ✅ **Draco Compression**: Optimized 3D model transfer
- ✅ **Multi-user Simulation**: test-multiuser.js for testing
- ✅ **Lima VM Deployment**: Ubuntu 24.04 on Mac Studio with Tailscale
- ✅ **Shared Object Manipulation**: Grab and move 3D objects in real-time
- 📋 **Hand Tracking**: Vision Pro gestures (planned)

---

*Architecture diagram updated on 2025-12-07*
