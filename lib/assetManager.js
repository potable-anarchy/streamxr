const fs = require("fs");
const path = require("path");
const LODGenerator = require("./lodGenerator");
const NeRFManager = require("./nerfManager");

class AssetManager {
  constructor() {
    this.assets = new Map();
    this.lodGenerator = new LODGenerator();
    this.nerfManager = new NeRFManager();
  }

  async init() {
    await this.lodGenerator.init();
    await this.loadAssets();
  }

  async loadAssets() {
    const modelsDir = path.join(__dirname, "../public/models");

    // Auto-discover assets by scanning the models directory
    const assetDirs = fs
      .readdirSync(modelsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    console.log(
      `AssetManager: Discovered ${assetDirs.length} asset directories`,
    );

    for (const assetId of assetDirs) {
      await this.loadAsset(assetId, modelsDir);
    }

    console.log(`AssetManager: Loaded ${this.assets.size} assets`);
  }

  /**
   * Load a single asset and auto-generate missing LOD levels
   * @param {string} assetId - Asset identifier (directory name)
   * @param {string} modelsDir - Path to models directory
   */
  async loadAsset(assetId, modelsDir) {
    const assetDir = path.join(modelsDir, assetId);
    const assetData = {
      id: assetId,
      lods: {},
    };

    // Check which LOD files exist
    const lodFiles = {
      high: path.join(assetDir, "high.glb"),
      medium: path.join(assetDir, "medium.glb"),
      low: path.join(assetDir, "low.glb"),
    };

    const existingLods = {};
    for (const [level, filePath] of Object.entries(lodFiles)) {
      if (fs.existsSync(filePath)) {
        existingLods[level] = filePath;
      }
    }

    // If only high.glb exists, check cache or generate LODs
    if (existingLods.high && (!existingLods.medium || !existingLods.low)) {
      console.log(`Asset ${assetId}: Missing LOD levels, checking cache...`);

      const cached = await this.lodGenerator.isCached(assetId);

      if (cached) {
        console.log(`  Using cached LODs for ${assetId}`);
        const cachedLods = await this.lodGenerator.loadCachedLODs(assetId);
        assetData.lods = cachedLods;
      } else {
        console.log(`  Generating LODs for ${assetId}...`);
        const highBuffer = fs.readFileSync(existingLods.high);
        const generatedLods = await this.lodGenerator.generateLODs(
          highBuffer,
          assetId,
        );
        assetData.lods = generatedLods;

        // Optionally save generated LODs to asset directory
        if (!existingLods.medium && generatedLods.medium) {
          fs.writeFileSync(lodFiles.medium, generatedLods.medium);
          console.log(`  Saved generated medium.glb to ${assetDir}`);
        }
        if (!existingLods.low && generatedLods.low) {
          fs.writeFileSync(lodFiles.low, generatedLods.low);
          console.log(`  Saved generated low.glb to ${assetDir}`);
        }
      }
    } else {
      // Load existing LOD files
      for (const [level, filePath] of Object.entries(existingLods)) {
        assetData.lods[level] = fs.readFileSync(filePath);
        console.log(
          `Loaded ${assetId} (${level}): ${assetData.lods[level].length} bytes`,
        );
      }
    }

    if (Object.keys(assetData.lods).length > 0) {
      this.assets.set(assetId, assetData);
    } else {
      console.warn(`Asset ${assetId}: No LOD files found`);
    }

    // Also attempt to load NeRF data for this asset
    console.log(
      `AssetManager: Attempting to load NeRF for ${assetId} from ${modelsDir}`,
    );
    await this.nerfManager.loadNeRF(assetId, modelsDir);
    console.log(`AssetManager: NeRF load complete for ${assetId}`);
  }

  getAsset(assetId, lod = "high") {
    const asset = this.assets.get(assetId);
    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    const lodData = asset.lods[lod];
    if (!lodData) {
      // Fallback to other LOD if requested one doesn't exist
      // Try: high -> medium -> low for high/medium requests
      // Try: low -> medium -> high for low requests
      const fallbackOrder =
        lod === "low"
          ? ["medium", "high"]
          : lod === "medium"
            ? ["high", "low"]
            : ["medium", "low"];

      for (const fallbackLod of fallbackOrder) {
        if (asset.lods[fallbackLod]) {
          console.warn(
            `LOD ${lod} not found for ${assetId}, using ${fallbackLod}`,
          );
          return asset.lods[fallbackLod];
        }
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
        hasNeRF: this.nerfManager.hasNeRF(id),
      };
    });
  }

  /**
   * Get NeRF data for an asset
   * @param {string} assetId - Asset identifier
   * @returns {Buffer|null} NeRF data buffer or null if not available
   */
  getNeRF(assetId) {
    return this.nerfManager.getNeRF(assetId);
  }

  /**
   * Check if an asset has NeRF data
   * @param {string} assetId - Asset identifier
   * @returns {boolean} True if NeRF data is available
   */
  hasNeRF(assetId) {
    return this.nerfManager.hasNeRF(assetId);
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

    console.log(
      `Asset ${assetId} ready with ${Object.keys(lods).length} LOD levels`,
    );

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
