/**
 * GaussianSplatRenderer - Renders 3D Gaussian Splat models using gsplat.js
 * Integrates with the existing Three.js scene for StreamXR
 */
class GaussianSplatRenderer {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.splatMesh = null;
    this.isLoading = false;
    this.isLoaded = false;
    this.loadProgress = 0;
    this.onLoadCallback = null;
    this.onErrorCallback = null;
    this.onProgressCallback = null;
  }

  /**
   * Load a Gaussian Splat model from URL or file path
   * @param {string} url - URL to the .splat or .ply file
   * @param {Object} options - Loading options
   * @param {Function} options.onProgress - Progress callback (0-1)
   * @param {Function} options.onLoad - Load complete callback
   * @param {Function} options.onError - Error callback
   * @returns {Promise<void>}
   */
  async loadSplat(url, options = {}) {
    if (this.isLoading) {
      console.warn('[GaussianSplatRenderer] Already loading a splat model');
      return;
    }

    this.isLoading = true;
    this.isLoaded = false;
    this.loadProgress = 0;

    // Store callbacks
    this.onLoadCallback = options.onLoad || null;
    this.onErrorCallback = options.onError || null;
    this.onProgressCallback = options.onProgress || null;

    console.log('[GaussianSplatRenderer] Loading splat from:', url);

    try {
      // Dispose of existing splat if any
      if (this.splatMesh) {
        this.dispose();
      }

      // Check if gsplat library is available
      if (typeof GSPLAT === 'undefined') {
        throw new Error('gsplat.js library not loaded. Ensure the script tag is included before nerfRenderer.js');
      }

      // Create a new GSPLAT loader
      const loader = new GSPLAT.PLYLoader();

      // Load the splat data with progress tracking
      const splatData = await this._loadWithProgress(url, loader);

      // Create the splat mesh
      this.splatMesh = new GSPLAT.Splat(splatData);

      // Add to scene
      this.scene.add(this.splatMesh);

      this.isLoaded = true;
      this.isLoading = false;
      this.loadProgress = 1;

      console.log('[GaussianSplatRenderer] Splat loaded successfully');

      // Call success callback
      if (this.onLoadCallback) {
        this.onLoadCallback(this.splatMesh);
      }

    } catch (error) {
      this.isLoading = false;
      this.isLoaded = false;

      console.error('[GaussianSplatRenderer] Failed to load splat:', error);

      // Call error callback
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }

      throw error;
    }
  }

  /**
   * Internal method to load with progress tracking
   * @private
   */
  async _loadWithProgress(url, loader) {
    return new Promise((resolve, reject) => {
      // Fetch the file with progress tracking
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';

      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          this.loadProgress = event.loaded / event.total;
          if (this.onProgressCallback) {
            this.onProgressCallback(this.loadProgress);
          }
        }
      };

      xhr.onload = async () => {
        if (xhr.status === 200) {
          try {
            // Parse the loaded data
            const arrayBuffer = xhr.response;
            const splatData = await loader.parseAsync(arrayBuffer);
            resolve(splatData);
          } catch (parseError) {
            reject(new Error(`Failed to parse splat data: ${parseError.message}`));
          }
        } else {
          reject(new Error(`HTTP error loading splat: ${xhr.status} ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error loading splat file'));
      };

      xhr.send();
    });
  }

  /**
   * Dispose of the current splat model and free resources
   */
  dispose() {
    if (this.splatMesh) {
      // Remove from scene
      this.scene.remove(this.splatMesh);

      // Dispose of GSPLAT resources
      if (this.splatMesh.dispose) {
        this.splatMesh.dispose();
      }

      this.splatMesh = null;
      this.isLoaded = false;
      this.loadProgress = 0;

      console.log('[GaussianSplatRenderer] Splat disposed');
    }
  }

  /**
   * Update the renderer (call in animation loop)
   * @param {number} deltaTime - Time since last frame in seconds
   */
  update(deltaTime) {
    if (!this.isLoaded || !this.splatMesh) {
      return;
    }

    // Update splat rendering based on camera position
    // gsplat.js handles view-dependent rendering internally
    // but we may need to trigger updates for sorting

    if (this.splatMesh.update) {
      this.splatMesh.update(this.camera);
    }
  }

  /**
   * Set the position of the splat model
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setPosition(x, y, z) {
    if (this.splatMesh) {
      this.splatMesh.position.set(x, y, z);
    }
  }

  /**
   * Set the scale of the splat model
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setScale(x, y, z) {
    if (this.splatMesh) {
      this.splatMesh.scale.set(x, y, z);
    }
  }

  /**
   * Set the rotation of the splat model (in radians)
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setRotation(x, y, z) {
    if (this.splatMesh) {
      this.splatMesh.rotation.set(x, y, z);
    }
  }

  /**
   * Get the current loading progress (0-1)
   * @returns {number}
   */
  getLoadProgress() {
    return this.loadProgress;
  }

  /**
   * Check if a splat model is currently loaded
   * @returns {boolean}
   */
  getIsLoaded() {
    return this.isLoaded;
  }

  /**
   * Check if a splat model is currently loading
   * @returns {boolean}
   */
  getIsLoading() {
    return this.isLoading;
  }

  /**
   * Get the underlying splat mesh for direct manipulation
   * @returns {Object|null}
   */
  getSplatMesh() {
    return this.splatMesh;
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.GaussianSplatRenderer = GaussianSplatRenderer;
}
