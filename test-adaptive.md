# Phase 3: Adaptive Bitrate Streaming - Test Guide

## Implementation Summary

Phase 3 has been successfully implemented with the following components:

### Files Created:
- `lib/adaptiveStreaming.js` - LOD selection logic based on bandwidth

### Files Modified:
- `server.js` - Integrated adaptive streaming manager
- `public/client.js` - Added bandwidth monitoring and metrics reporting
- `public/index.html` - Added LOD indicator to UI

## Features Implemented

### 1. Adaptive LOD Selection
- Server tracks client bandwidth metrics
- Automatically selects appropriate LOD (high/low) based on measured bandwidth
- Thresholds:
  - High LOD: >= 500 KB/s
  - Low LOD: < 500 KB/s

### 2. Bandwidth Monitoring
- Client measures download speed during asset transfers
- Reports metrics to server every 2 seconds
- Server uses exponential moving average for smooth bandwidth estimation

### 3. Dynamic LOD Switching
- Server sends LOD recommendations to client
- Client can automatically request new assets when LOD changes
- UI displays current recommended LOD level

## Testing Instructions

### Server Running
The server is currently running at http://localhost:3000

### Test Scenarios

#### Test 1: Initial Connection (Default Low LOD)
1. Open http://localhost:3000 in a browser
2. On first connection, client has no bandwidth history
3. Server defaults to LOW LOD for safety
4. Watch console logs to see LOD selection

Expected Result:
- First asset request will be served as `sphere-low`
- Console: "Client xxx: Insufficient metrics, defaulting to low LOD"

#### Test 2: Bandwidth Accumulation (High LOD)
1. After first asset download completes
2. Server measures transfer speed
3. On good connection, bandwidth will exceed 500 KB/s threshold
4. Next asset request will get HIGH LOD

Expected Result:
- Second asset request will be served as `sphere-high`
- Console: "Client xxx: High bandwidth (xxxxx B/s), selecting high LOD"
- UI shows "Current LOD: HIGH" (green)

#### Test 3: Simulating Slow Connection
To test LOW LOD behavior:
1. Use browser DevTools Network throttling
2. Set to "Slow 3G" or "Fast 3G"
3. Refresh page
4. Observe that LOW LOD assets are served

Expected Result:
- Assets are served as `sphere-low` or `cube-low`
- UI shows "Current LOD: LOW" (yellow)
- Console shows low bandwidth measurements

#### Test 4: Dynamic Switching
1. Start with normal connection
2. Download an asset (gets HIGH LOD)
3. Enable network throttling
4. Server detects bandwidth drop
5. Sends LOW LOD recommendation
6. Client can automatically request lower quality asset

Expected Result:
- LOD indicator changes from HIGH to LOW
- Console: "Server recommends LOD: low"
- Client may auto-request new asset after delay

## Key Console Messages to Watch

### Server Console:
```
Client xxx requested sphere, selected sphere-high based on bandwidth
Sent chunk 1 of sphere-high (16384 bytes)
Completed streaming asset sphere-high to client xxx in 150ms
Client xxx bandwidth: 850000 bytes/sec
Received bandwidth metrics from client xxx: { bandwidth: 850000, ... }
```

### Client Console:
```
Starting asset download: sphere-high, size: 245678 bytes, chunks: 16
Received binary chunk 1 of sphere-high (16384 bytes)
Sent bandwidth metrics: 829.10 KB/s
Server recommends LOD: high
GLB model loaded successfully: sphere-high
```

## Success Criteria Verification

✅ **Low LOD on throttled connection**
- Enable network throttling in DevTools
- Observe sphere-low or cube-low being served
- Bandwidth metrics show < 500 KB/s

✅ **High LOD on fast connection**
- Normal network connection
- Observe sphere-high or cube-high being served
- Bandwidth metrics show >= 500 KB/s

✅ **Auto-switch as connection quality changes**
- Start with normal connection (HIGH LOD)
- Enable throttling during operation
- Client receives LOD recommendation update
- LOD indicator changes in real-time

## Architecture Details

### Adaptive Streaming Flow:
1. Client requests asset (e.g., "sphere")
2. Server checks client bandwidth metrics
3. Server selects appropriate LOD variant
4. Asset is streamed in chunks (16KB each)
5. Server measures transfer duration
6. Bandwidth metrics updated
7. Client also measures and reports bandwidth
8. Server sends LOD recommendations
9. Client can request new asset if LOD changes

### Bandwidth Calculation:
- **Server-side**: Total bytes / transfer duration
- **Client-side**: Bytes received / elapsed time
- **Blending**: Server combines both measurements
- **Smoothing**: Exponential moving average (α = 0.3)

## Notes
- First asset request always gets LOW LOD (no history)
- Minimum 2 samples required before HIGH LOD selection
- Client reports metrics every 2 seconds during download
- Auto-switching has 3-second delay to prevent thrashing
