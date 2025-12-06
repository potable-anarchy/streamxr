# Vision Pro Hand Tracking - Quick Start Guide

## Overview
This guide provides quick instructions for testing the Vision Pro hand tracking implementation.

## Prerequisites
- Apple Vision Pro device
- Safari browser on Vision Pro
- Server running (see main README.md)

## Quick Test Steps

### 1. Start the Application
```bash
npm install
npm start
```

### 2. Open on Vision Pro
1. Open Safari on Vision Pro
2. Navigate to `https://your-server-address`
3. Accept any SSL certificate warnings (for development)

### 3. Enter XR Mode
Two buttons will appear at the bottom of the screen:
- **"Enter VR"** (left) - Full VR mode with opaque background
- **"Enter AR"** (right) - AR mode with passthrough (recommended for Vision Pro)

Click either button to start the XR session.

### 4. Test Hand Tracking

#### Step 1: Verify Hand Detection
- Look for cyan (left) or magenta (right) sphere indicators
- Console should show: "Hand tracking input detected: left/right"

#### Step 2: Test Proximity Detection
- Move your hand close to the rotating cube
- Hand indicator should grow larger
- Cube should glow yellow

#### Step 3: Test Grab Gesture
- Position hand near cube (within ~30cm)
- Pinch fingers together
- Cube should turn green and stop rotating

#### Step 4: Test Movement
- While pinching, move your hand
- Cube should follow your hand smoothly
- Rotation should interpolate naturally

#### Step 5: Test Release
- Release the pinch gesture
- Cube should stay at current position
- Green highlight should disappear

#### Step 6: Test Multiple Objects
- Click "Spawn Cube/Sphere/Cone" buttons (top right)
- Try grabbing different spawned objects
- Verify each can be grabbed and moved independently

## Expected Behavior

### Visual Indicators
| Element | Color | Meaning |
|---------|-------|---------|
| Hand indicator | Cyan/Magenta | Left/Right hand position |
| Large hand indicator | Cyan/Magenta | Hand near grabbable object |
| Yellow object glow | Yellow | Object within grab range |
| Green object glow | Green | Object currently grabbed |

### Console Messages
```
✅ "Hand tracking input detected: left"
✅ "Hand tracking input detected: right"
✅ "Grabbed object: main cube"
✅ "Released object: main cube"
```

## Troubleshooting

### Hand indicators not appearing
**Cause**: Hand tracking not enabled or not detected
**Solution**:
1. Check Vision Pro Settings > Privacy > Hand Tracking
2. Grant hand tracking permission to Safari
3. Check console for "Hand tracking input detected" message

### Objects not grabbable
**Cause**: Hand too far from object
**Solution**:
1. Move hand closer (within 30cm / 0.3 units)
2. Look for yellow glow to confirm proximity
3. Check grab distance in code if needed:
   ```javascript
   const grabDistance = 0.3; // Increase if needed
   ```

### Jittery movement
**Cause**: Network latency or low frame rate
**Solution**:
1. Check network connection
2. Monitor frame rate (should be 60+ FPS)
3. Adjust rotation smoothness:
   ```javascript
   grabbedObject.quaternion.slerp(handQuaternion, 0.2); // Increase for less smoothing
   ```

### AR mode shows black background
**Cause**: Scene background not transparent
**Solution**:
- Verify code sets `scene.background = null` in AR mode
- Check console for "AR mode: scene background set to transparent"

### No XR buttons visible
**Cause**: WebXR not supported or already in XR mode
**Solution**:
1. Ensure using Safari on Vision Pro
2. Check console for WebXR support messages
3. Refresh page if already in XR mode

## Testing Checklist

- [ ] Server starts without errors
- [ ] Page loads on Vision Pro Safari
- [ ] "Enter VR" button appears (if VR supported)
- [ ] "Enter AR" button appears (if AR supported)
- [ ] XR session starts when button clicked
- [ ] Hand indicators appear (cyan/magenta spheres)
- [ ] Console shows "Hand tracking input detected"
- [ ] Hand indicator grows when near object
- [ ] Object glows yellow when hand is near
- [ ] Pinch gesture grabs object (turns green)
- [ ] Object follows hand movement smoothly
- [ ] Release gesture drops object
- [ ] Multiple objects can be grabbed sequentially
- [ ] Position syncs to server on release
- [ ] Session ends cleanly when exiting XR

## Advanced Testing

### Test Multi-User Interaction
1. Connect two Vision Pro devices
2. Spawn objects from one device
3. Verify objects appear on both devices
4. Grab and move object on device A
5. Release object on device A
6. Verify position updates on device B

### Test Performance
1. Spawn 10+ objects
2. Move hand through objects rapidly
3. Verify smooth highlighting updates
4. Monitor frame rate (should stay 60+ FPS)

### Test Edge Cases
1. Grab object at maximum distance (0.3 units)
2. Try to grab with both hands simultaneously
3. Exit XR mode while holding object
4. Re-enter XR mode and verify state reset

## Code Locations

### Hand Tracking Implementation
- `public/client.js:1163-1467` - Hand tracking system

### Key Functions
- `setupXRControllers()` - Initialize hand tracking (line 1175)
- `onControllerConnected()` - Detect hand inputs (line 1205)
- `handleHandGrab()` - Grab mechanics (line 1389)
- `updateGrabbedObject()` - Follow hand (line 1450)
- `updateHandIndicators()` - Visual feedback (line 1275)

### Session Setup
- `enterXR()` - Start AR/VR session (line 910)
- `initWebXR()` - Check XR support (line 864)

## Documentation
- Full documentation: `docs/HAND_TRACKING.md`
- Implementation summary: `IMPLEMENTATION_SUMMARY.md`
- Main README: `README.md`

## Support
For issues or questions, check console logs first. Common log messages and their meanings are documented in `docs/HAND_TRACKING.md`.

## Next Steps
After successful basic testing:
1. Review `docs/HAND_TRACKING.md` for detailed documentation
2. Experiment with grab distance and rotation smoothness
3. Test multi-user synchronization
4. Explore AR vs VR mode differences
5. Consider implementing additional gestures

---

**Quick Commands:**
```bash
# Start server
npm start

# Check syntax
node --check public/client.js

# View logs
# (Check browser console on Vision Pro)
```

**Quick Config Changes:**
```javascript
// Adjust grab distance
const grabDistance = 0.3; // Line 1337

// Adjust rotation smoothness
grabbedObject.quaternion.slerp(handQuaternion, 0.1); // Line 1466

// Change hand indicator colors
color: handedness === "left" ? 0x00ffff : 0xff00ff // Line 1245
```
