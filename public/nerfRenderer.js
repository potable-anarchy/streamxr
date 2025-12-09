/**
 * GaussianSplatRenderer - Renders 3D Gaussian Splat models using Three.js
 * This is a simplified renderer that displays splat data as a colored point cloud
 * Integrates with the existing Three.js scene for StreamXR
 */
class GaussianSplatRenderer {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.pointCloud = null;
    this.splatMesh = null;
    this.isLoading = false;
    this.isLoaded = false;
    this.loadProgress = 0;
    this.onLoadCallback = null;
    this.onErrorCallback = null;
    this.onProgressCallback = null;
  }

  /**
   * Load a Gaussian Splat model from a Blob URL
   * @param {string} url - Blob URL to the .splat data
   * @param {Object} options - Loading options
   * @param {Function} options.onProgress - Progress callback (0-1)
   * @param {Function} options.onLoad - Load complete callback
   * @param {Function} options.onError - Error callback
   * @returns {Promise<void>}
   */
  async loadSplat(url, options = {}) {
    if (this.isLoading) {
      console.warn("[GaussianSplatRenderer] Already loading a splat model");
      return;
    }

    this.isLoading = true;
    this.isLoaded = false;
    this.loadProgress = 0;

    // Store callbacks
    this.onLoadCallback = options.onLoad || null;
    this.onErrorCallback = options.onError || null;
    this.onProgressCallback = options.onProgress || null;

    console.log("[GaussianSplatRenderer] Loading splat from:", url);

    try {
      // Dispose of existing point cloud if any
      if (this.pointCloud) {
        this.dispose();
      }

      // Fetch the splat data
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch splat: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      this.loadProgress = 0.5;
      if (this.onProgressCallback) {
        this.onProgressCallback(0.5);
      }

      // Parse the splat data
      const splatData = this.parseSplatData(arrayBuffer);
      this.loadProgress = 0.8;
      if (this.onProgressCallback) {
        this.onProgressCallback(0.8);
      }

      // Create Three.js point cloud from splat data
      this.pointCloud = this.createPointCloud(splatData);
      this.splatMesh = this.pointCloud;

      // Add to scene
      this.scene.add(this.pointCloud);

      this.isLoaded = true;
      this.isLoading = false;
      this.loadProgress = 1;

      console.log(
        `[GaussianSplatRenderer] Splat loaded: ${splatData.count} splats`,
      );

      // Call success callback
      if (this.onLoadCallback) {
        this.onLoadCallback(this.pointCloud);
      }
    } catch (error) {
      this.isLoading = false;
      this.isLoaded = false;

      console.error("[GaussianSplatRenderer] Failed to load splat:", error);

      // Call error callback
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }

      throw error;
    }
  }

  /**
   * Parse .splat binary format (antimatter15 format)
   * Each splat is 32 bytes:
   * - Position: 3x float32 (12 bytes)
   * - Scale: 3x float32 (12 bytes)
   * - Color: 4x uint8 RGBA (4 bytes)
   * - Rotation: 4x uint8 quaternion (4 bytes)
   */
  parseSplatData(arrayBuffer) {
    const bytesPerSplat = 32;
    const count = Math.floor(arrayBuffer.byteLength / bytesPerSplat);

    console.log(
      `[GaussianSplatRenderer] Parsing ${count} splats from ${arrayBuffer.byteLength} bytes`,
    );

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const dataView = new DataView(arrayBuffer);

    for (let i = 0; i < count; i++) {
      const offset = i * bytesPerSplat;

      // Position (3x float32, little-endian)
      positions[i * 3] = dataView.getFloat32(offset, true);
      positions[i * 3 + 1] = dataView.getFloat32(offset + 4, true);
      positions[i * 3 + 2] = dataView.getFloat32(offset + 8, true);

      // Scale (3x float32) - use average for point size
      const scaleX = dataView.getFloat32(offset + 12, true);
      const scaleY = dataView.getFloat32(offset + 16, true);
      const scaleZ = dataView.getFloat32(offset + 20, true);
      sizes[i] =
        ((Math.abs(scaleX) + Math.abs(scaleY) + Math.abs(scaleZ)) / 3) * 100;

      // Color (4x uint8 RGBA)
      colors[i * 3] = dataView.getUint8(offset + 24) / 255;
      colors[i * 3 + 1] = dataView.getUint8(offset + 25) / 255;
      colors[i * 3 + 2] = dataView.getUint8(offset + 26) / 255;
    }

    // Debug: Log first few colors to verify parsing
    if (count > 0) {
      console.log("[GaussianSplatRenderer] Sample colors (first 5 splats):");
      for (let i = 0; i < Math.min(5, count); i++) {
        console.log(
          `  Splat ${i}: RGB(${colors[i * 3].toFixed(3)}, ${colors[i * 3 + 1].toFixed(3)}, ${colors[i * 3 + 2].toFixed(3)})`,
        );
      }
    }

    return { positions, colors, sizes, count };
  }

  /**
   * Create a Three.js point cloud from parsed splat data
   */
  createPointCloud(splatData) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(splatData.positions, 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(splatData.colors, 3),
    );

    // Create custom shader material for better splat visualization
    const material = new THREE.PointsMaterial({
      size: 0.05, // Increased size for better visibility
      vertexColors: true,
      transparent: true,
      opacity: 1.0, // Full opacity
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
      depthWrite: true,
      depthTest: true,
    });

    const points = new THREE.Points(geometry, material);
    points.name = "gaussian-splat";

    return points;
  }

  /**
   * Dispose of the current splat model and free resources
   */
  dispose() {
    if (this.pointCloud) {
      // Remove from scene
      this.scene.remove(this.pointCloud);

      // Dispose geometry and material
      if (this.pointCloud.geometry) {
        this.pointCloud.geometry.dispose();
      }
      if (this.pointCloud.material) {
        this.pointCloud.material.dispose();
      }

      this.pointCloud = null;
      this.splatMesh = null;
      this.isLoaded = false;
      this.loadProgress = 0;

      console.log("[GaussianSplatRenderer] Splat disposed");
    }
  }

  /**
   * Update the renderer (call in animation loop)
   * @param {number} deltaTime - Time since last frame in seconds
   */
  update(deltaTime) {
    // Point clouds don't need per-frame updates in this simple implementation
  }

  /**
   * Set the position of the splat model
   */
  setPosition(x, y, z) {
    if (this.pointCloud) {
      this.pointCloud.position.set(x, y, z);
    }
  }

  /**
   * Set the scale of the splat model
   */
  setScale(x, y, z) {
    if (this.pointCloud) {
      this.pointCloud.scale.set(x, y, z);
    }
  }

  /**
   * Set the rotation of the splat model (in radians)
   */
  setRotation(x, y, z) {
    if (this.pointCloud) {
      this.pointCloud.rotation.set(x, y, z);
    }
  }

  /**
   * Set visibility of the splat model
   */
  setVisible(visible) {
    if (this.pointCloud) {
      this.pointCloud.visible = visible;
    }
  }

  /**
   * Get the current loading progress (0-1)
   */
  getLoadProgress() {
    return this.loadProgress;
  }

  /**
   * Check if a splat model is currently loaded
   */
  getIsLoaded() {
    return this.isLoaded;
  }

  /**
   * Check if a splat model is currently loading
   */
  getIsLoading() {
    return this.isLoading;
  }

  /**
   * Get the underlying point cloud for direct manipulation
   */
  getSplatMesh() {
    return this.pointCloud;
  }
}

// Export for use in other modules
if (typeof window !== "undefined") {
  window.GaussianSplatRenderer = GaussianSplatRenderer;
}
