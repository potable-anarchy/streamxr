const fs = require("fs");
const path = require("path");
const LODGenerator = require("./lodGenerator");

class AssetManager {
  constructor() {
    this.assets = new Map();
    this.lodGenerator = new LODGenerator();
    this.loadAssets();
  }

  async init() {
    await this.lodGenerator.init();
  }

  loadAssets() {
    const modelsDir = path.join(__dirname, "../public/models");

    // Define available assets
    const assetList = [
      { id: "cube", high: "cube/high.glb", low: "cube/low.glb" },
      { id: "sphere", high: "sphere/high.glb", low: "sphere/low.glb" },
    ];

    assetList.forEach((asset) => {
      const assetData = {
        id: asset.id,
        lods: {},
      };

      // Load high LOD
      const highPath = path.join(modelsDir, asset.high);
      if (fs.existsSync(highPath)) {
        assetData.lods.high = fs.readFileSync(highPath);
        console.log(
          `Loaded ${asset.id} (high): ${assetData.lods.high.length} bytes`,
        );
      } else {
        console.warn(`Asset not found: ${highPath}`);
      }

      // Load low LOD
      const lowPath = path.join(modelsDir, asset.low);
      if (fs.existsSync(lowPath)) {
        assetData.lods.low = fs.readFileSync(lowPath);
        console.log(
          `Loaded ${asset.id} (low): ${assetData.lods.low.length} bytes`,
        );
      } else {
        console.warn(`Asset not found: ${lowPath}`);
      }

      if (Object.keys(assetData.lods).length > 0) {
        this.assets.set(asset.id, assetData);
      }
    });

    console.log(`AssetManager: Loaded ${this.assets.size} assets`);
  }

  getAsset(assetId, lod = "high") {
    const asset = this.assets.get(assetId);
    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    const lodData = asset.lods[lod];
    if (!lodData) {
      // Fallback to other LOD if requested one doesn't exist
      const availableLod = lod === "high" ? "low" : "high";
      if (asset.lods[availableLod]) {
        console.warn(
          `LOD ${lod} not found for ${assetId}, using ${availableLod}`,
        );
        return asset.lods[availableLod];
      }
      throw new Error(`No LOD available for ${assetId}`);
    }

    return lodData;
  }

  listAssets() {
    return Array.from(this.assets.keys()).map((id) => {
      const asset = this.assets.get(id);
      return {
        id,
        lods: Object.keys(asset.lods),
      };
    });
  }

  chunkData(buffer, chunkSize = 16384) {
    // Split buffer into chunks for streaming
    const chunks = [];
    for (let i = 0; i < buffer.length; i += chunkSize) {
      chunks.push(buffer.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Upload a new asset and generate LOD levels
   * @param {string} assetId - Unique identifier for the asset
   * @param {Buffer} glbBuffer - High-quality GLB file buffer
   * @returns {Promise<Object>} Generated LOD information
   */
  async uploadAsset(assetId, glbBuffer) {
    console.log(`Uploading new asset: ${assetId} (${glbBuffer.length} bytes)`);

    // Check if LODs are already cached
    const cached = await this.lodGenerator.isCached(assetId);
    let lods;

    if (cached) {
      console.log(`Using cached LODs for ${assetId}`);
      lods = await this.lodGenerator.loadCachedLODs(assetId);
    } else {
      console.log(`Generating LODs for ${assetId}...`);
      lods = await this.lodGenerator.generateLODs(glbBuffer, assetId);
    }

    // Store in memory for immediate access
    this.assets.set(assetId, {
      id: assetId,
      lods: lods,
    });

    console.log(`Asset ${assetId} ready with ${Object.keys(lods).length} LOD levels`);

    return {
      assetId,
      lodLevels: Object.keys(lods),
      sizes: Object.entries(lods).reduce((acc, [level, buffer]) => {
        acc[level] = buffer.length;
        return acc;
      }, {}),
    };
  }

  /**
   * Remove an asset and its cached LODs
   * @param {string} assetId - Asset identifier
   */
  async removeAsset(assetId) {
    this.assets.delete(assetId);
    await this.lodGenerator.clearCache(assetId);
    console.log(`Removed asset: ${assetId}`);
  }

  /**
   * Get asset information including available LODs
   * @param {string} assetId - Asset identifier
   * @returns {Object|null} Asset info or null if not found
   */
  getAssetInfo(assetId) {
    const asset = this.assets.get(assetId);
    if (!asset) return null;

    return {
      id: asset.id,
      lods: Object.keys(asset.lods),
      sizes: Object.entries(asset.lods).reduce((acc, [level, buffer]) => {
        acc[level] = buffer.length;
        return acc;
      }, {}),
    };
  }
}

module.exports = AssetManager;
