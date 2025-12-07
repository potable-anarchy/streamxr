// LOD Generator - Automatic mesh simplification for adaptive streaming
// Uses gltf-transform CLI to generate low/medium quality versions from high quality models

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

class LODGenerator {
  constructor() {
    // In-memory cache for generated LODs
    this.cache = new Map();

    // Disk cache directory
    this.cacheDir = path.join(__dirname, "../.lod-cache");

    // LOD configuration
    this.lodLevels = {
      low: {
        ratio: 0.1, // 10% of original triangles
        error: 0.001, // Error threshold
        textureSize: 256, // Texture resolution
      },
      medium: {
        ratio: 0.5, // 50% of original triangles
        error: 0.0005,
        textureSize: 512, // Texture resolution
      },
      high: null, // Original (no simplification)
    };
  }

  /**
   * Initialize LOD generator (create cache directory)
   */
  async init() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      console.log(`Created LOD cache directory: ${this.cacheDir}`);
    }
  }

  /**
   * Check if LODs are cached on disk for an asset
   */
  async isCached(assetId) {
    const lowPath = path.join(this.cacheDir, `${assetId}-low.glb`);
    const mediumPath = path.join(this.cacheDir, `${assetId}-medium.glb`);
    return fs.existsSync(lowPath) && fs.existsSync(mediumPath);
  }

  /**
   * Load cached LODs from disk
   */
  async loadCachedLODs(assetId) {
    const lowPath = path.join(this.cacheDir, `${assetId}-low.glb`);
    const mediumPath = path.join(this.cacheDir, `${assetId}-medium.glb`);

    return {
      low: fs.readFileSync(lowPath),
      medium: fs.readFileSync(mediumPath),
    };
  }

  /**
   * Generate LOD levels from a high-quality GLB buffer using gltf-transform CLI
   * @param {Buffer} highBuffer - Original high-quality GLB
   * @param {string} assetId - Asset identifier for caching
   * @returns {Object} LOD buffers { low, medium, high }
   */
  async generateLODs(highBuffer, assetId) {
    console.log(`\n🔧 Generating LODs for ${assetId}...`);
    console.log(
      `   Original size: ${(highBuffer.length / 1024 / 1024).toFixed(2)} MB`,
    );

    try {
      // Write temp high file
      const tempHighPath = path.join(this.cacheDir, `${assetId}-temp-high.glb`);
      fs.writeFileSync(tempHighPath, highBuffer);

      // Output paths
      const lowPath = path.join(this.cacheDir, `${assetId}-low.glb`);
      const mediumPath = path.join(this.cacheDir, `${assetId}-medium.glb`);

      // Generate MEDIUM LOD (simplify + resize textures + draco)
      console.log(
        `   Generating MEDIUM LOD (50% triangles, 512px textures)...`,
      );
      try {
        const mediumTemp1 = path.join(
          this.cacheDir,
          `${assetId}-medium-temp1.glb`,
        );
        const mediumTemp2 = path.join(
          this.cacheDir,
          `${assetId}-medium-temp2.glb`,
        );

        // Step 1: Simplify geometry
        execSync(
          `npx gltf-transform simplify "${tempHighPath}" "${mediumTemp1}" --ratio ${this.lodLevels.medium.ratio} --error ${this.lodLevels.medium.error}`,
          { cwd: path.join(__dirname, ".."), stdio: "ignore" },
        );
        // Step 2: Resize textures
        execSync(
          `npx gltf-transform resize "${mediumTemp1}" "${mediumTemp2}" --width ${this.lodLevels.medium.textureSize} --height ${this.lodLevels.medium.textureSize}`,
          { cwd: path.join(__dirname, ".."), stdio: "ignore" },
        );
        // Step 3: Recompress with Draco
        execSync(`npx gltf-transform draco "${mediumTemp2}" "${mediumPath}"`, {
          cwd: path.join(__dirname, ".."),
          stdio: "ignore",
        });

        // Cleanup temp files
        if (fs.existsSync(mediumTemp1)) fs.unlinkSync(mediumTemp1);
        if (fs.existsSync(mediumTemp2)) fs.unlinkSync(mediumTemp2);

        const mediumBuffer = fs.readFileSync(mediumPath);
        console.log(
          `   Medium size: ${(mediumBuffer.length / 1024 / 1024).toFixed(2)} MB`,
        );
      } catch (error) {
        console.error(
          `   Warning: MEDIUM LOD generation failed:`,
          error.message,
        );
        fs.writeFileSync(mediumPath, highBuffer);
      }

      // Generate LOW LOD (simplify + resize textures + draco)
      console.log(`   Generating LOW LOD (10% triangles, 256px textures)...`);
      try {
        const lowTemp1 = path.join(this.cacheDir, `${assetId}-low-temp1.glb`);
        const lowTemp2 = path.join(this.cacheDir, `${assetId}-low-temp2.glb`);

        // Step 1: Simplify geometry
        execSync(
          `npx gltf-transform simplify "${tempHighPath}" "${lowTemp1}" --ratio ${this.lodLevels.low.ratio} --error ${this.lodLevels.low.error}`,
          { cwd: path.join(__dirname, ".."), stdio: "ignore" },
        );
        // Step 2: Resize textures
        execSync(
          `npx gltf-transform resize "${lowTemp1}" "${lowTemp2}" --width ${this.lodLevels.low.textureSize} --height ${this.lodLevels.low.textureSize}`,
          { cwd: path.join(__dirname, ".."), stdio: "ignore" },
        );
        // Step 3: Recompress with Draco
        execSync(`npx gltf-transform draco "${lowTemp2}" "${lowPath}"`, {
          cwd: path.join(__dirname, ".."),
          stdio: "ignore",
        });

        // Cleanup temp files
        if (fs.existsSync(lowTemp1)) fs.unlinkSync(lowTemp1);
        if (fs.existsSync(lowTemp2)) fs.unlinkSync(lowTemp2);

        const lowBuffer = fs.readFileSync(lowPath);
        console.log(
          `   Low size: ${(lowBuffer.length / 1024 / 1024).toFixed(2)} MB`,
        );
      } catch (error) {
        console.error(`   Warning: LOW LOD generation failed:`, error.message);
        fs.writeFileSync(lowPath, highBuffer);
      }

      // Clean up temp high file
      if (fs.existsSync(tempHighPath)) fs.unlinkSync(tempHighPath);

      // Read the generated files
      const lowBuffer = fs.readFileSync(lowPath);
      const mediumBuffer = fs.readFileSync(mediumPath);

      console.log(`✓ LOD generation complete! Cached to disk.\n`);

      return {
        low: lowBuffer,
        medium: mediumBuffer,
        high: highBuffer,
      };
    } catch (error) {
      console.error(`❌ Error generating LODs for ${assetId}:`, error.message);

      // Fallback: return original for all levels
      return {
        low: highBuffer,
        medium: highBuffer,
        high: highBuffer,
      };
    }
  }

  /**
   * Clear cache for a specific asset
   */
  async clearCache(assetId) {
    const lowPath = path.join(this.cacheDir, `${assetId}-low.glb`);
    const mediumPath = path.join(this.cacheDir, `${assetId}-medium.glb`);

    if (fs.existsSync(lowPath)) fs.unlinkSync(lowPath);
    if (fs.existsSync(mediumPath)) fs.unlinkSync(mediumPath);

    this.cache.delete(assetId);
  }

  /**
   * Get statistics about cache usage
   */
  getCacheStats() {
    const files = fs.readdirSync(this.cacheDir);
    const stats = {
      cachedAssets: files.filter((f) => f.endsWith("-low.glb")).length,
      totalSize: 0,
      files: [],
    };

    files.forEach((file) => {
      const filePath = path.join(this.cacheDir, file);
      const size = fs.statSync(filePath).size;
      stats.totalSize += size;
      stats.files.push({
        name: file,
        size: (size / 1024 / 1024).toFixed(2) + " MB",
      });
    });

    stats.totalSize = (stats.totalSize / 1024 / 1024).toFixed(2) + " MB";

    return stats;
  }
}

module.exports = LODGenerator;
