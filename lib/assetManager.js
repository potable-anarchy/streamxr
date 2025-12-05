const fs = require('fs');
const path = require('path');

class AssetManager {
  constructor(assetsDir) {
    this.assetsDir = assetsDir;
    this.assetRegistry = new Map();
    this.initializeAssets();
  }

  initializeAssets() {
    // Register available assets
    const assets = [
      { id: 'cube-high', path: 'models/cube/high.glb', type: 'model' },
      { id: 'cube-low', path: 'models/cube/low.glb', type: 'model' },
      { id: 'sphere-high', path: 'models/sphere/high.glb', type: 'model' },
      { id: 'sphere-low', path: 'models/sphere/low.glb', type: 'model' }
    ];

    assets.forEach(asset => {
      this.assetRegistry.set(asset.id, {
        ...asset,
        fullPath: path.join(this.assetsDir, asset.path)
      });
    });

    console.log(`Asset Manager initialized with ${this.assetRegistry.size} assets`);
  }

  getAsset(assetId) {
    return this.assetRegistry.get(assetId);
  }

  async loadAssetData(assetId) {
    const asset = this.getAsset(assetId);

    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    try {
      const data = await fs.promises.readFile(asset.fullPath);
      return {
        id: assetId,
        type: asset.type,
        data: data,
        size: data.length
      };
    } catch (error) {
      throw new Error(`Failed to load asset ${assetId}: ${error.message}`);
    }
  }

  listAssets() {
    return Array.from(this.assetRegistry.values()).map(asset => ({
      id: asset.id,
      path: asset.path,
      type: asset.type
    }));
  }
}

module.exports = AssetManager;
