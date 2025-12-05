# Phase 4: Foveated Streaming (Head Tracking) - Implementation Summary

## Overview
Successfully implemented foveated streaming with head tracking to optimize asset streaming based on user's view direction. Objects in the center of view receive high LOD, periphery objects get low LOD, and objects behind the user are skipped.

## Files Created

### `lib/foveatedStreaming.js`
Core foveated streaming module with view frustum calculation:
- **View Frustum Management**: Tracks camera position, rotation (Euler/quaternion), and FOV for each client
- **Angle Calculation**: Computes viewing angle between camera direction and objects
- **Distance Calculation**: Measures 3D distance for distance-based LOD decisions
- **LOD Zones**:
  - Foveal (±15°): High LOD - center of attention
  - Peripheral (±60°): Low LOD - visible but not focused
  - Far Peripheral (±90°): Very low LOD or skip - edge of vision
- **Smart Skipping**: Objects behind viewer (>90°) are automatically skipped
- **Priority Sorting**: Returns objects sorted by streaming priority

## Files Modified

### `public/client.js`
Added head tracking capabilities:
- **Head Tracking State**: New state object to track enabled status and send intervals
- **WebXR Support**: Detects VR capability and provides "Enter VR" button
- **Head Tracking Function**: `sendHeadTrackingData()` sends camera position, rotation, quaternion, and FOV every 100ms
- **Camera Controls**: WASD movement + mouse drag for testing without VR hardware
- **Automatic Tracking**: Enabled by default, updates sent during animation loop

Key additions:
- `sendHeadTrackingData()`: Transmits camera data to server
- `enableHeadTracking()` / `disableHeadTracking()`: Control tracking state
- `initWebXR()`: Initialize WebXR for VR devices
- `enterVR()`: Enter VR mode
- `enableCameraControls()`: Desktop camera controls for testing

### `server.js`
Integrated foveated streaming with server logic:
- **Module Import**: Added `FoveatedStreamingManager` import
- **Foveated Instance**: Created global `foveatedStreaming` manager
- **Message Handler**: Added `head-tracking` message type handler
- **Asset Request Logic**: Modified to use foveated streaming before bandwidth-based adaptive streaming
- **Priority System**:
  1. Foveated streaming (view-based) - highest priority
  2. Adaptive streaming (bandwidth-based) - fallback
  3. Explicit LOD request - user override
- **Skip Messages**: Sends `asset_skipped` message when objects are out of view
- **Client Cleanup**: Removes foveated view data on disconnect

## Success Criteria

✅ **Objects in center of view get high LOD**
- Test 1 passed: Object at 0° angle receives high LOD
- Test 5 passed: Object in front after rotation receives high LOD

✅ **Objects in periphery get low LOD**
- Test 2 passed: Object at 45° angle receives low LOD

✅ **Objects behind user are skipped**
- Test 3 passed: Object at 180° (behind) is skipped
- Test 4 passed: Object becomes skipped after rotation places it to the side

## Technical Details

### View Frustum Calculation
The system calculates the angle between the view direction and object using:
1. Compute direction vector from viewer to object
2. Compute view direction from rotation (primarily yaw/Y-axis)
3. Normalize both vectors
4. Calculate dot product
5. Convert to angle using `acos(dotProduct)`

### Coordinate System
- **Y-axis**: Up direction
- **Z-axis**: -Z is forward in Three.js
- **Rotation**: Euler angles (x=pitch, y=yaw, z=roll) in radians

### LOD Decision Flow
```
1. Check if object is behind viewer (angle > 90°) → skip
2. Check if in foveal region (angle < 15°) → high LOD
3. Check if in peripheral (angle < 60°) → low LOD if close enough
4. Check if in far peripheral (angle < 90°) → low LOD only if very close
5. Otherwise → skip
```

## Testing

### Unit Tests (`test-foveated.js`)
Created comprehensive test suite validating:
- Front-facing objects receive high LOD
- Peripheral objects receive low LOD
- Behind objects are skipped
- Rotation changes viewing angle correctly
- Statistics reporting works

### Server Integration
- Server starts successfully with foveated streaming enabled
- All assets load correctly (cube and sphere, high and low LOD)
- WebSocket server running on port 3000

## How to Use

1. **Start Server**: `npm start`
2. **Open Browser**: Navigate to `http://localhost:3000`
3. **Desktop Controls**:
   - WASD keys to move
   - Click and drag mouse to rotate camera
4. **VR Mode** (if available):
   - Click "Enter VR" button
   - Head tracking automatically uses VR headset data

## Performance Characteristics

- **Head Tracking Updates**: 100ms interval (10 Hz) - balance between accuracy and bandwidth
- **Foveal Zone**: ±15° (highest quality where user is looking)
- **Peripheral Zone**: ±60° (reduced quality but visible)
- **Behind Culling**: Automatically skip streaming for invisible objects

## Integration with Previous Phases

- **Phase 1 (WebRTC)**: Uses existing WebSocket connection for head tracking data
- **Phase 2 (Asset Streaming)**: Enhances asset streaming with view-aware LOD selection
- **Phase 3 (Adaptive Bitrate)**: Works alongside bandwidth-based streaming (foveated takes priority)

## Future Enhancements

Possible improvements:
- Multi-object tracking with individual positions
- Predictive streaming based on head movement velocity
- Vergence tracking for depth-based LOD (eye tracking)
- Heat map visualization of foveated zones
- Dynamic zone sizing based on scene complexity
