// NeRF Manager - Server-side management of NeRF/Gaussian Splat assets
// Handles loading, caching, and retrieval of .splat files for volumetric content streaming

const fs = require("fs");
const path = require("path");

class NeRFManager {
  constructor() {
    // In-memory storage for loaded NeRF data
    this.nerfs = new Map();

    // Supported NeRF file extensions
    this.supportedExtensions = [".splat", ".ply", ".ksplat"];
  }

  /**
   * Load a NeRF file for a given asset
   * @param {string} assetId - Asset identifier (directory name)
   * @param {string} modelsDir - Path to models directory
   * @returns {Promise<Buffer|null>} NeRF data buffer or null if not found
   */
  async loadNeRF(assetId, modelsDir) {
    const assetDir = path.join(modelsDir, assetId);

    // Check if asset directory exists
    if (!fs.existsSync(assetDir)) {
      console.log(`NeRFManager: Asset directory not found: ${assetDir}`);
      return null;
    }

    // Look for NeRF files with supported extensions
    for (const ext of this.supportedExtensions) {
      const nerfPath = path.join(assetDir, `nerf${ext}`);
      if (fs.existsSync(nerfPath)) {
        try {
          const buffer = fs.readFileSync(nerfPath);
          this.nerfs.set(assetId, {
            id: assetId,
            buffer: buffer,
            format: ext.slice(1), // Remove leading dot
            size: buffer.length,
          });
          console.log(
            `NeRFManager: Loaded ${assetId} NeRF (${ext}): ${buffer.length} bytes`,
          );
          return buffer;
        } catch (error) {
          console.error(
            `NeRFManager: Error loading NeRF for ${assetId}:`,
            error.message,
          );
          return null;
        }
      }
    }

    // No NeRF file found for this asset
    return null;
  }

  /**
   * Get a loaded NeRF by asset ID
   * @param {string} assetId - Asset identifier
   * @returns {Buffer|null} NeRF data buffer or null if not loaded
   */
  getNeRF(assetId) {
    const nerf = this.nerfs.get(assetId);
    if (!nerf) {
      return null;
    }
    return nerf.buffer;
  }

  /**
   * Check if a NeRF is loaded for a given asset
   * @param {string} assetId - Asset identifier
   * @returns {boolean} True if NeRF is loaded
   */
  hasNeRF(assetId) {
    return this.nerfs.has(assetId);
  }

  /**
   * Get NeRF metadata for an asset
   * @param {string} assetId - Asset identifier
   * @returns {Object|null} NeRF metadata or null if not loaded
   */
  getNeRFInfo(assetId) {
    const nerf = this.nerfs.get(assetId);
    if (!nerf) {
      return null;
    }
    return {
      id: nerf.id,
      format: nerf.format,
      size: nerf.size,
    };
  }

  /**
   * Remove a NeRF from memory
   * @param {string} assetId - Asset identifier
   */
  removeNeRF(assetId) {
    this.nerfs.delete(assetId);
    console.log(`NeRFManager: Removed NeRF for ${assetId}`);
  }

  /**
   * List all loaded NeRFs
   * @returns {Array} Array of NeRF info objects
   */
  listNeRFs() {
    return Array.from(this.nerfs.values()).map((nerf) => ({
      id: nerf.id,
      format: nerf.format,
      size: nerf.size,
    }));
  }
}

module.exports = NeRFManager;
