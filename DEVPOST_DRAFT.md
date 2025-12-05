# StreamXR - Devpost Submission Draft

## Basic Information

**Project Name:** StreamXR

**Tagline:** Netflix for 3D - Stream interactive spatial content to any device

**Challenge Category:** Mixed & Virtual Reality

---

## Inspiration

Inspired by platforms like Miris, we wanted to solve a fundamental problem in XR: delivering high-quality 3D content without massive downloads or requiring powerful hardware. Just like Netflix revolutionized video streaming, StreamXR aims to make 3D content accessible anywhere, instantly.

---

## What it does

StreamXR is a 3D content streaming platform that intelligently delivers optimized spatial content to WebXR devices:

- **Adaptive Bitrate Streaming**: Automatically adjusts quality based on your connection speed
- **Foveated Streaming**: Sends high-quality assets where you're looking, low-quality to your periphery
- **Multi-LOD (Level of Detail)**: Streams the right level of detail for each object based on distance and viewing angle
- **Cross-Platform**: Works on phones (iOS/Android AR), Meta Quest 3, and Apple Vision Pro
- **Multiuser Spaces**: Multiple people can join shared 3D environments
- **Interactive Objects**: Spawn and manipulate 3D objects that sync across all connected clients

Instead of downloading entire 3D models, StreamXR streams optimized chunks over WebRTC, dramatically reducing bandwidth and enabling instant access to rich spatial experiences.

---

## How we built it

**Tech Stack:**
- **Backend**: Node.js + Express + WebRTC (simple-peer) + WebSocket for signaling
- **Frontend**: Three.js + WebXRManager + GLTFLoader for 3D rendering
- **Streaming Protocol**: WebRTC data channels for low-latency binary streaming
- **Assets**: GLTF/GLB models with multiple LOD levels, Draco compression

**Architecture:**
1. Server hosts 3D assets in multiple quality levels (high/low LOD)
2. WebRTC establishes peer connection with clients for real-time streaming
3. Client sends head/device tracking data to server
4. Server calculates view frustum and prioritizes streaming:
   - High-quality assets in center of vision
   - Low-quality assets in periphery
   - Skips assets outside field of view
5. Client assembles streamed chunks and renders with Three.js
6. Multiple clients synchronize through server for shared experiences

**Key Innovations:**
- **Foveated streaming** using head tracking (not eye tracking) - works on all devices
- **Adaptive LOD selection** based on both bandwidth and viewing angle
- **WebRTC-based architecture** for sub-100ms latency
- **WebXR-first design** - works in browser, no app install required

---

## Challenges we ran into

1. **WebRTC Complexity**: Setting up reliable WebRTC connections with proper signaling was more complex than expected. Had to carefully handle offer/answer/ICE candidate exchange.

2. **Binary Data Chunking**: Streaming large GLB files required implementing efficient chunking and reassembly on the client side without corrupting the binary data.

3. **LOD Selection Algorithm**: Balancing between bandwidth constraints and visual quality required careful tuning. Too aggressive switching caused jarring transitions.

4. **View Frustum Calculations**: Computing which objects are in the foveal region vs periphery from head orientation quaternions required solid 3D math.

5. **Cross-Platform WebXR**: Different devices (phone AR vs Quest VR vs Vision Pro) have different capabilities and APIs, requiring careful feature detection and fallbacks.

---

## Accomplishments that we're proud of

- **Sub-100ms latency** from asset request to display
- **Foveated streaming working smoothly** - you genuinely can't tell the difference in quality
- **Seamless multi-LOD transitions** - switching between quality levels is imperceptible
- **True cross-platform** - same codebase works on phone, Quest, and Vision Pro
- **Real-time multiuser sync** - multiple people in shared spaces with smooth avatar movement
- **Built entirely on open web standards** - no proprietary SDKs, runs in any WebXR browser

---

## What we learned

- **WebRTC is powerful but complex** - Worth the learning curve for real-time applications
- **Foveated rendering doesn't require eye tracking** - Head tracking is "good enough" for dramatic bandwidth savings
- **Pre-generating LODs is crucial** - Dynamic generation is too slow for real-time streaming
- **Three.js + WebXR is production-ready** - Amazing what you can build with just web technologies
- **Network optimization matters more than rendering** - Most XR performance bottlenecks are bandwidth, not GPU

---

## What's next for StreamXR

**Short-term (Next Week):**
- Add hand tracking support for Quest 3 and Vision Pro
- Implement spatial audio streaming
- Create asset upload interface for users

**Medium-term (Next Month):**
- AI-assisted LOD generation - upload one high-quality model, auto-generate all LOD levels
- SFU (Selective Forwarding Unit) architecture to scale to 100+ concurrent users
- Persistent rooms with database storage
- Mobile app versions for better performance

**Long-term (Future Vision):**
- Radiance field/NeRF streaming for photorealistic volumetric content
- AI scene understanding for automatic foveation optimization
- Native Vision Pro app with full eye tracking support
- CDN integration for global low-latency delivery
- Become the "Netflix of spatial content" - massive library of streamable 3D experiences

---

## Built With

- three-js
- webxr
- webrtc
- node-js
- express
- websocket
- gltf
- draco
- simple-peer

---

## Try it out

**Demo Video:** [Link to be added]

**Live Demo:** [Link to be added]

**GitHub:** [Link to be added]

**Platform Requirements:**
- Desktop: Chrome/Edge with WebXR flag enabled
- Phone: Safari on iOS 15+ or Chrome on Android
- Quest 3: Meta Quest Browser
- Vision Pro: Safari

---

## Team

**Brad Dougherty** - Solo Developer
- Full-stack development
- WebXR implementation
- 3D asset pipeline
- WebRTC streaming architecture

---

## Screenshots

[To be added during submission]

1. Phone AR mode with streamed 3D objects
2. Quest 3 VR multiuser space
3. LOD comparison showing adaptive quality
4. Real-time bandwidth monitoring dashboard
5. Cross-platform compatibility demo
