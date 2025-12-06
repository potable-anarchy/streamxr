# Vision Pro Hand Tracking Implementation

## Overview

This document describes the WebXR hand tracking implementation for Apple Vision Pro, enabling natural gesture-based interaction with 3D objects in both VR and AR modes.

## Features

### 1. Hand Input Detection
- Automatic detection of hand tracking input sources
- Support for both left and right hand tracking
- Fallback to standard controller mode if hand tracking is unavailable

### 2. Visual Feedback
- **Hand Indicators**: Colored spheres (cyan for left, magenta for right) show hand positions
- **Proximity Highlighting**: Objects glow yellow when hands are nearby
- **Grab Feedback**: Objects turn green when grabbed
- **Scale Animation**: Hand indicators grow when near grabbable objects

### 3. Grab/Release Mechanics
- **Pinch to Grab**: Use the select gesture (pinch) to grab nearby objects
- **Release**: Release the pinch to drop the object
- **Distance-Based**: Objects can be grabbed within 0.3 units of hand position
- **Smooth Movement**: Objects follow hand movement with position offset preservation

### 4. Object Interaction
- Grab the main cube or any spawned shared objects
- Smooth rotation interpolation while grabbed
- Automatic synchronization of object positions to server on release
- Prevents auto-rotation of grabbed objects

## Technical Implementation

### Key Components

#### Hand Tracking State
```javascript
let handControllers = [];        // Array of XR controller objects
let handInputSources = new Map(); // Map of controller -> XRInputSource
let grabbedObject = null;        // Currently grabbed THREE.Mesh
let grabbingHand = null;         // Controller grabbing the object
let handIndicators = new Map();  // Map of controller -> hand indicator mesh
```

#### Session Initialization
```javascript
const sessionInit = {
  requiredFeatures: ["local-floor"],
  optionalFeatures: ["hand-tracking", "layers"],
};
```

### Event Handlers

#### Controller Connection
- `onControllerConnected`: Detects hand tracking availability, creates hand indicators
- `onControllerDisconnected`: Cleans up hand indicators and input sources

#### Pinch Gestures
- `onSelectStart`: Triggered on pinch gesture, attempts to grab nearby object
- `onSelectEnd`: Triggered on pinch release, drops grabbed object

### Update Loop

The `animate()` function calls these hand tracking updates every frame:
- `updateHandIndicators()`: Updates visual feedback based on proximity
- `updateGrabbedObject()`: Updates grabbed object position to follow hand

### Proximity Detection

Objects are considered grabbable if within `grabDistance = 0.3` units:
```javascript
function getNearbyGrabbableObject(controller) {
  // Checks distance to main cube and all shared objects
  // Returns closest object within grab distance
}
```

### Grab Mechanics

When grabbing an object:
1. Store offset between hand and object center
2. Apply green highlight to grabbed object
3. Follow hand position while maintaining offset
4. Smoothly interpolate rotation using quaternion slerp (0.1 factor)

When releasing:
1. Reset object highlighting
2. Sync final position to server (for shared objects)
3. Clear grabbed object references

## Usage

### Entering XR Mode

**VR Mode:**
```javascript
await enterXR("immersive-vr");
```

**AR Mode (Vision Pro):**
```javascript
await enterXR("immersive-ar");
```

### UI Controls

- **Enter VR Button**: Bottom left, launches VR mode
- **Enter AR Button**: Bottom center-left, launches AR mode
- **Spawn Buttons**: Top right, create objects to interact with

### Grabbing Objects

1. Move your hand close to an object (within 0.3 units)
2. Hand indicator will grow and object will glow yellow
3. Pinch to grab (object turns green)
4. Move your hand to reposition the object
5. Release pinch to drop the object

## Browser Compatibility

### Vision Pro (Safari)
- ✅ Hand tracking fully supported
- ✅ AR mode with transparent background
- ✅ VR mode with opaque background
- ✅ Pinch gesture recognition

### Meta Quest (Browser)
- ✅ Controller mode supported
- ⚠️ Hand tracking may vary by browser
- ✅ VR mode fully functional

### Desktop Browsers
- ❌ Hand tracking not available
- ✅ WASD + mouse controls for testing
- ℹ️ XR buttons hidden on non-XR devices

## Configuration

### Grab Distance
Adjust the maximum distance for grabbing objects:
```javascript
const grabDistance = 0.3; // in getNearbyGrabbableObject()
```

### Hand Indicator Colors
Customize hand indicator colors:
```javascript
// In createHandIndicator()
color: handedness === "left" ? 0x00ffff : 0xff00ff
```

### Rotation Smoothness
Adjust rotation interpolation speed:
```javascript
// In updateGrabbedObject()
grabbedObject.quaternion.slerp(handQuaternion, 0.1); // 0.1 = 10% per frame
```

## Debugging

### Console Logs

Enable detailed logging to track hand tracking events:
- "Hand tracking input detected" - Hand input source connected
- "Grabbed object" - Object successfully grabbed
- "Released object" - Object dropped
- "Input sources changed" - New hand detected or removed

### Common Issues

**Hand tracking not working:**
- Ensure "hand-tracking" feature is requested in session init
- Check browser console for WebXR support
- Verify Vision Pro hand tracking is enabled in settings

**Objects not grabbing:**
- Check hand is within grab distance (0.3 units)
- Verify pinch gesture is recognized (check select events)
- Ensure object has proper mesh and position

**Jittery movement:**
- Increase quaternion slerp factor for faster updates
- Check for network latency if syncing positions

## Future Enhancements

- [ ] Hand mesh rendering for better visualization
- [ ] Individual finger tracking for more precise gestures
- [ ] Two-handed object manipulation (scale/rotate)
- [ ] Haptic feedback on Vision Pro
- [ ] Gesture recognition (swipe, point, etc.)
- [ ] Physics-based throwing mechanics
- [ ] Hand ray casting for distant object selection

## References

- [WebXR Hand Input](https://www.w3.org/TR/webxr-hand-input-1/)
- [THREE.js WebXR Guide](https://threejs.org/docs/#manual/en/introduction/How-to-create-VR-content)
- [Apple Vision Pro WebXR](https://developer.apple.com/documentation/visionos/building-immersive-experiences-with-webxr)
