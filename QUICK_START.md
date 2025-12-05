# Phase 7: Dynamic LOD Generation - Quick Start Guide

## 🚀 Getting Started in 3 Steps

### Step 1: Start the Server
```bash
npm start
```

Server will start on http://localhost:3000

### Step 2: Upload an Asset

**Option A: Web Interface (Easiest)**
1. Open http://localhost:3000/upload.html
2. Enter an asset ID (e.g., "my-model")
3. Drag & drop a GLB file (or click to browse)
4. Click "Upload & Generate LODs"
5. Watch as 3 LOD levels are generated automatically!

**Option B: Command Line**
```bash
curl -X POST \
  -H "Content-Type: model/gltf-binary" \
  --data-binary @your-model.glb \
  "http://localhost:3000/api/assets/upload?assetId=my-model"
```

**Option C: Test Script**
```bash
node scripts/testLODGeneration.js
```

### Step 3: View Your 3D Scene

Open http://localhost:3000 in your browser to see the assets in action with adaptive LOD!

## 📊 What Gets Generated

When you upload `my-model.glb` (e.g., 100 KB):

```
✓ HIGH LOD    → 100 KB (100% quality, original)
✓ MEDIUM LOD  →  50 KB (50% triangles)
✓ LOW LOD     →  25 KB (25% triangles)
```

All LODs are:
- Generated automatically in ~100-200ms
- Cached to disk at `cache/lods/my-model/`
- Available immediately via WebSocket streaming
- Selected adaptively based on bandwidth & viewing angle

## 🎯 Key Features

### Automatic LOD Selection

**Based on Bandwidth (Phase 3):**
- Fast connection (≥500 KB/s) → HIGH LOD
- Medium connection (250-500 KB/s) → MEDIUM LOD
- Slow connection (<250 KB/s) → LOW LOD

**Based on View Angle (Phase 4):**
- Center of view (±15°) → HIGH LOD
- Peripheral vision (15-60°) → MEDIUM LOD
- Edge of vision (60-90°) → LOW LOD
- Behind camera (>90°) → SKIP (not loaded)

### Smart Caching
- First upload: Generates all LODs
- Subsequent uploads: Uses cache (instant)
- Cache survives server restart
- Per-asset cache clearing

## 📁 File Structure

```
your-project/
├── lib/
│   ├── lodGenerator.js      ← NEW: LOD generation engine
│   └── assetManager.js       ← UPDATED: Upload support
├── scripts/
│   └── testLODGeneration.js ← NEW: Test harness
├── public/
│   └── upload.html          ← NEW: Upload interface
├── cache/
│   └── lods/                ← NEW: Generated LODs stored here
│       ├── my-model/
│       │   ├── high.glb
│       │   ├── medium.glb
│       │   └── low.glb
└── server.js                ← UPDATED: REST API
```

## 🔧 API Reference

### Upload Asset
```bash
POST /api/assets/upload?assetId=<id>
Content-Type: model/gltf-binary
Body: <binary GLB data>
```

### List Assets
```bash
GET /api/assets
```

### Get Asset Info
```bash
GET /api/assets/<assetId>
```

### Delete Asset
```bash
DELETE /api/assets/<assetId>
```

## 💡 Usage Examples

### Example 1: Upload from Node.js
```javascript
const fs = require('fs');
const http = require('http');

const glbBuffer = fs.readFileSync('./my-model.glb');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/assets/upload?assetId=spaceship',
  method: 'POST',
  headers: {
    'Content-Type': 'model/gltf-binary',
    'Content-Length': glbBuffer.length
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(JSON.parse(data)));
});

req.write(glbBuffer);
req.end();
```

### Example 2: Upload from Python
```python
import requests

with open('./my-model.glb', 'rb') as f:
    glb_data = f.read()

response = requests.post(
    'http://localhost:3000/api/assets/upload',
    params={'assetId': 'spaceship'},
    data=glb_data,
    headers={'Content-Type': 'model/gltf-binary'}
)

print(response.json())
```

### Example 3: List All Assets
```bash
curl http://localhost:3000/api/assets | jq
```

Output:
```json
{
  "assets": [
    { "id": "cube", "lods": ["high", "low"] },
    { "id": "sphere", "lods": ["high", "low"] },
    { "id": "my-model", "lods": ["high", "medium", "low"] }
  ]
}
```

## 🎨 Viewing Your Assets

1. Open http://localhost:3000
2. Assets automatically load with adaptive LOD
3. Move closer/farther to see LOD switching
4. Monitor console for LOD selection details

## 🧪 Testing

Run the comprehensive test suite:

```bash
node scripts/testLODGeneration.js
```

Expected output:
```
✓ Test 1: Upload new asset
✓ Test 2: List all assets
✓ Test 3: Get asset details
✓ Test 4: Cache reuse
✓ Test 5: Final verification

✓ All tests completed successfully!
```

## 🐛 Troubleshooting

### Server won't start
```bash
# Kill any process using port 3000
lsof -ti:3000 | xargs kill -9

# Start server
npm start
```

### Upload fails
- Check file is valid GLB format
- Verify Content-Type header is set
- Ensure assetId parameter is provided

### LODs not generated
- Check server logs: `tail -f /tmp/server.log`
- Verify cache directory exists: `ls -la cache/lods/`
- Try clearing cache: `rm -rf cache/lods/`

## 📚 Learn More

- **Full Documentation:** [PHASE7_README.md](./PHASE7_README.md)
- **Implementation Details:** [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- **Source Code:** [lib/lodGenerator.js](./lib/lodGenerator.js)

## ✅ Success Criteria (All Met)

- ✅ Upload single high-quality asset
- ✅ Server generates multiple LOD levels automatically
- ✅ Generated LODs are cached for reuse

## 🎉 That's It!

You're now running dynamic LOD generation! Your assets will automatically:
- Generate 3 quality levels on upload
- Cache for fast reuse
- Stream adaptively based on network & viewing angle
- Provide optimal performance across all conditions

Enjoy building with Phase 7! 🚀
