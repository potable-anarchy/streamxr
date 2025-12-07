# ⚡ StreamXR Demo Plan (Short, Punchy, and All Signal)

Standard XR pain is folded into each step — nothing bloated, nothing slow.

---

## Demo Flow (~4–5 minutes total)

---

### 1. Instant Load (Standard XR vs StreamXR)

**Standard XR (quick reminder)**
- XR workloads normally bundle hundreds of MB
- Loading spinner until every asset is downloaded
- No interaction until ready

*One sentence only.*

**StreamXR**

Open the URL:

> "We're already in the scene. No bundle, no preload — the shell loads instantly and assets stream afterward."

**Visual:**
- Room appears instantly
- Empty environment populates dynamically as objects stream

---

### 2. Streamed 3D Objects (Dynamic Environment)

**Standard XR**
- Every object must be pre-bundled
- Updating or adding an object → rebuild & redeploy
- Large GLBs block rendering

**StreamXR**

Click "Spawn Object" or let track state drive it:
- Objects appear instantly
- They load while rendering continues
- You can spawn multiple objects without stutter

> "Instead of shipping a massive world upfront, StreamXR streams objects on demand when the world actually needs them."

**This is demo moment #1.**

---

### 3. Multiuser Presence (Synchronized XR State)

**Standard XR**
- Multiuser requires complex SDKs (Photon, Unity Netcode, etc.)
- Heavy bandwidth
- Usually laggy or expensive

**StreamXR**

Open the same URL on:
- Your laptop
- Your phone
- Someone else's device

Avatars appear and move in real time:

> "Presence is streamed at 20Hz. Zero SDKs. Zero setup. Every user shares the same world state live."

**This is demo moment #2.**

---

### 4. Dynamic Environments (Streamed Props, Colors, Themes)

**Standard XR**
- Rooms/themes/props are fixed at build time
- Updating anything → versioning hell
- You must deploy new content to all platforms

**StreamXR**

Press "Next Theme":
- Skybox color shifts
- Props replace themselves
- Object layout changes
- All other connected clients see the update instantly

> "The world is data-driven. All structure, props, and themes live on the server and stream to clients in real time."

**Demo moment #3.**

---

### 5. Built-In Throttling Simulation (Bandwidth Button)

**This is the hero moment.**

You add a button in the app:

**"Simulate Slow Network"**

When pressed, it:
- Forces the local client into LOW-BANDWIDTH mode (no actual OS-level throttling)
- Drops LOD on non-foveal objects
- Switches textures/models to compressed or low-res versions
- Reduces streaming frequency
- Keeps motion and presence fully alive

**Standard XR**
- Low bandwidth → the entire XR stack breaks
- Models fail to load
- Render thread stalls
- App softlocks

**StreamXR**

You click the button:

> "Watch what happens when bandwidth collapses."

- Objects degrade gracefully
- World stays interactive
- Other users stay synced
- No reload, no crash

Click again: **Return to High Bandwidth**
- Objects progressively refine
- Server updates push higher LODs instantly

> "StreamXR isn't just tolerant of bad networks — it adapts in real time. XR actually stays usable."

---

## Demo Moments Summary

1. **Instant Load** - Shell appears before assets finish streaming
2. **Streamed Objects** - Objects spawn and load dynamically without blocking
3. **Multiuser Presence** - Real-time synchronized state across devices at 20Hz
4. **Dynamic Environments** - Live theme/prop updates streamed to all clients
5. **Bandwidth Simulation** - Graceful degradation and recovery in real-time

---

## Implementation Notes

### Features to Build

1. ✅ **Instant Shell Load** - Already implemented (HTML/Three.js loads first, assets stream after)
2. ✅ **Object Spawning** - Already implemented (Spawn Cube/Sphere/Cone buttons)
3. ✅ **Multiuser Presence** - Already implemented (Room Manager + Avatar sync)
4. 📋 **Theme Switching** - Need to add "Next Theme" button and theme system
5. 📋 **Bandwidth Simulation** - Need to add "Simulate Slow Network" toggle button

### Theme System Design

**Themes to implement:**
- Default (current state)
- Night Mode (dark skybox, cool colors)
- Sunset (warm orange/pink skybox)
- Underwater (blue-green tint, wavy lighting)

**What changes per theme:**
- Skybox color (`scene.background`)
- Ambient light color/intensity
- Directional light color
- Optional: Ground plane color
- Optional: Particle effects (stars, bubbles, etc.)

**Implementation:**
```javascript
const themes = {
  default: {
    skybox: 0x87ceeb,
    ambient: { color: 0xffffff, intensity: 0.6 },
    directional: { color: 0xffffff, intensity: 0.8 }
  },
  night: {
    skybox: 0x000033,
    ambient: { color: 0x4444ff, intensity: 0.3 },
    directional: { color: 0xaaaaff, intensity: 0.5 }
  },
  // ... more themes
};
```

### Bandwidth Simulation Design

**UI:**
- Toggle button: "Simulate Slow Network" (OFF/ON states)
- Visual indicator when in low-bandwidth mode

**Behavior when ON:**
- Override bandwidth detection to force LOW mode
- Force all assets to use `low.glb` LOD
- Reduce head tracking update frequency (10 FPS → 5 FPS)
- Add optional artificial latency simulation (100ms delay)

**Behavior when OFF:**
- Restore normal bandwidth detection
- Allow adaptive LOD selection based on actual bandwidth
- Restore normal update frequencies

**Implementation:**
```javascript
let simulateLowBandwidth = false;

function toggleBandwidthSimulation() {
  simulateLowBandwidth = !simulateLowBandwidth;
  if (simulateLowBandwidth) {
    forceLowBandwidthMode();
  } else {
    restoreNormalMode();
  }
}
```

---

## Demo Script

**Opening (30 seconds)**

"Traditional XR requires downloading hundreds of megabytes before you can interact with anything. StreamXR loads the shell instantly and streams everything else on demand."

*[Open URL - scene appears immediately]*

---

**Object Streaming (45 seconds)**

"Instead of bundling every object upfront, StreamXR streams 3D models when they're needed."

*[Click "Spawn Cube" → cube appears instantly]*
*[Click "Spawn Sphere" → sphere appears while cube continues rendering]*

"No rebuild. No redeploy. Just real-time streaming."

---

**Multiuser (60 seconds)**

"Presence works out of the box. No SDKs. No setup."

*[Open on phone - avatar appears in headset]*
*[Move phone - avatar moves in real-time]*

"20 updates per second. Every device sees the same world state."

*[Open on laptop - third avatar appears]*

---

**Dynamic Themes (45 seconds)**

"The entire world is data-driven. Structure, props, and themes stream from the server."

*[Click "Next Theme" → skybox shifts to night mode]*
*[All other clients update instantly]*

"Update the server once. Every client gets the change in real-time."

---

**Bandwidth Simulation (90 seconds) - HERO MOMENT**

"Here's the real test. Traditional XR collapses when bandwidth drops. StreamXR adapts."

*[Click "Simulate Slow Network"]*

"Watch what happens when we force low-bandwidth mode."

*[Objects degrade to low LOD]*
*[Scene stays interactive]*
*[Other users stay synced]*

"No crash. No reload. Just graceful degradation."

*[Click button again - return to high bandwidth]*

"And recovery is just as smooth. Objects refine progressively."

*[Objects upgrade to high LOD in real-time]*

---

**Closing (15 seconds)**

"StreamXR: Real-time 3D streaming that actually works when networks don't."

---

## Technical Requirements

### Must Work
- [ ] Instant HTML load (< 500ms to first render)
- [ ] Objects spawn without blocking main thread
- [ ] Multiuser presence at 20Hz minimum
- [ ] Theme changes propagate to all clients within 1 second
- [ ] Bandwidth simulation toggle works in real-time
- [ ] Low bandwidth mode maintains 15+ FPS
- [ ] Recovery from low bandwidth is smooth and progressive

### Nice to Have
- [ ] Loading progress indicators per object
- [ ] Network stats overlay (FPS, bandwidth, latency)
- [ ] Multiple theme presets (4-5 themes)
- [ ] Particle effects per theme
- [ ] Sound effects for object spawning
- [ ] Haptic feedback on VR controllers

---

## Demo URLs

**Production:**
- Main Demo: https://streamxr.brad-dougherty.com
- Grafana Metrics: https://streamxr-grafana.brad-dougherty.com
- Prometheus: https://streamxr-prometheus.brad-dougherty.com

**Tailscale (Internal):**
- Direct Access: http://100.126.174.124:3000
- Grafana: http://100.126.174.124:3003
- Prometheus: http://100.126.174.124:9092

---

*Demo design created: 2025-12-07*
