/**
 * Foveated Streaming Module
 * Manages LOD selection based on head/gaze tracking and view frustum
 *
 * Objects in the center of view (foveal region) get high LOD
 * Objects in periphery get low LOD
 * Objects behind the user are skipped
 */

class FoveatedStreamingManager {
  constructor() {
    // View frustum parameters per client
    this.clientViews = new Map();

    // Foveated rendering zones (in degrees from center)
    this.ZONES = {
      FOVEAL: 15,      // Center view - high LOD (±15 degrees)
      PERIPHERAL: 60,  // Mid periphery - low LOD (15-60 degrees)
      FAR_PERIPHERAL: 90, // Far periphery - very low LOD (60-90 degrees)
    };

    // LOD multipliers based on distance
    this.DISTANCE_THRESHOLDS = {
      NEAR: 5,   // < 5 units: high priority
      MID: 15,   // 5-15 units: medium priority
      FAR: 30,   // 15-30 units: low priority
    };

    // Scene objects with their positions
    this.sceneObjects = new Map();
  }

  /**
   * Update client view frustum from head tracking data
   * @param {string} clientId - Client identifier
   * @param {Object} viewData - View frustum data
   * @param {Array<number>} viewData.position - Camera position [x, y, z]
   * @param {Array<number>} viewData.rotation - Camera rotation [x, y, z] (Euler angles in radians)
   * @param {Array<number>} viewData.quaternion - Camera quaternion [x, y, z, w] (optional, preferred)
   * @param {number} viewData.fov - Field of view in degrees
   */
  updateClientView(clientId, viewData) {
    this.clientViews.set(clientId, {
      position: viewData.position || [0, 0, 0],
      rotation: viewData.rotation || [0, 0, 0],
      quaternion: viewData.quaternion || [0, 0, 0, 1],
      fov: viewData.fov || 75,
      lastUpdate: Date.now(),
    });

    console.log(`Updated view for client ${clientId}:`, {
      position: viewData.position,
      rotation: viewData.rotation,
    });
  }

  /**
   * Register a scene object with its position
   * @param {string} objectId - Object identifier
   * @param {Array<number>} position - Object position [x, y, z]
   * @param {Object} metadata - Additional object metadata
   */
  registerObject(objectId, position, metadata = {}) {
    this.sceneObjects.set(objectId, {
      position: position,
      metadata: metadata,
    });
  }

  /**
   * Calculate angle between view direction and object
   * @param {Array<number>} viewPos - Viewer position [x, y, z]
   * @param {Array<number>} viewRot - Viewer rotation [x, y, z] (Euler angles in radians)
   * @param {Array<number>} objPos - Object position [x, y, z]
   * @returns {number} Angle in degrees
   */
  calculateViewAngle(viewPos, viewRot, objPos) {
    // Calculate direction vector from viewer to object
    const toObject = [
      objPos[0] - viewPos[0],
      objPos[1] - viewPos[1],
      objPos[2] - viewPos[2],
    ];

    // Calculate view direction from rotation (yaw around Y-axis)
    // In Three.js, Y is up, and we primarily care about horizontal rotation
    const yaw = viewRot[1]; // Y-axis rotation (left-right)
    const viewDir = [
      Math.sin(yaw),   // X component
      0,               // Y component (ignore pitch for horizontal FOV)
      -Math.cos(yaw),  // Z component (Three.js uses -Z as forward)
    ];

    // Normalize vectors
    const normalizeVector = (v) => {
      const mag = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      return mag > 0 ? [v[0] / mag, v[1] / mag, v[2] / mag] : [0, 0, 0];
    };

    const toObjectNorm = normalizeVector(toObject);
    const viewDirNorm = normalizeVector(viewDir);

    // Calculate dot product
    const dotProduct =
      toObjectNorm[0] * viewDirNorm[0] +
      toObjectNorm[1] * viewDirNorm[1] +
      toObjectNorm[2] * viewDirNorm[2];

    // Convert to angle in degrees
    const angleRadians = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
    return (angleRadians * 180) / Math.PI;
  }

  /**
   * Calculate distance between two points
   * @param {Array<number>} pos1 - First position [x, y, z]
   * @param {Array<number>} pos2 - Second position [x, y, z]
   * @returns {number} Distance
   */
  calculateDistance(pos1, pos2) {
    const dx = pos2[0] - pos1[0];
    const dy = pos2[1] - pos1[1];
    const dz = pos2[2] - pos1[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Determine if object is behind the viewer
   * @param {Array<number>} viewPos - Viewer position [x, y, z]
   * @param {Array<number>} viewRot - Viewer rotation [x, y, z]
   * @param {Array<number>} objPos - Object position [x, y, z]
   * @returns {boolean} True if object is behind viewer
   */
  isObjectBehind(viewPos, viewRot, objPos) {
    const angle = this.calculateViewAngle(viewPos, viewRot, objPos);
    return angle > 90; // More than 90 degrees from view direction
  }

  /**
   * Determine LOD level for an object based on foveated rendering
   * @param {string} clientId - Client identifier
   * @param {string} objectId - Object identifier
   * @param {Array<number>} objectPosition - Object position [x, y, z]
   * @returns {string} LOD level ('high', 'low', 'skip')
   */
  determineLOD(clientId, objectId, objectPosition) {
    const viewData = this.clientViews.get(clientId);

    // Default to low LOD if no view data
    if (!viewData) {
      console.log(`No view data for client ${clientId}, defaulting to low LOD`);
      return 'low';
    }

    const viewPos = viewData.position;
    const viewRot = viewData.rotation;

    // Skip objects behind the viewer
    if (this.isObjectBehind(viewPos, viewRot, objectPosition)) {
      console.log(`Object ${objectId} is behind viewer, skipping`);
      return 'skip';
    }

    // Calculate view angle and distance
    const angle = this.calculateViewAngle(viewPos, viewRot, objectPosition);
    const distance = this.calculateDistance(viewPos, objectPosition);

    console.log(`Object ${objectId} - Angle: ${angle.toFixed(1)}°, Distance: ${distance.toFixed(1)}`);

    // Foveal region (center of view) - high LOD
    if (angle < this.ZONES.FOVEAL) {
      return 'high';
    }

    // Peripheral region - low LOD, but skip if too far
    if (angle < this.ZONES.PERIPHERAL) {
      return distance < this.DISTANCE_THRESHOLDS.FAR ? 'low' : 'skip';
    }

    // Far peripheral - skip unless very close
    if (angle < this.ZONES.FAR_PERIPHERAL) {
      return distance < this.DISTANCE_THRESHOLDS.NEAR ? 'low' : 'skip';
    }

    // Beyond far peripheral - skip
    return 'skip';
  }

  /**
   * Get recommended asset LOD for a client request
   * @param {string} clientId - Client identifier
   * @param {string} assetId - Asset identifier
   * @param {Array<number>} position - Object position [x, y, z]
   * @returns {Object} LOD recommendation with asset ID
   */
  getAssetLOD(clientId, assetId, position = [0, 0, -2]) {
    const lod = this.determineLOD(clientId, assetId, position);

    return {
      lod: lod,
      assetId: lod === 'skip' ? null : `${assetId}-${lod}`,
      shouldStream: lod !== 'skip',
    };
  }

  /**
   * Get all objects with their recommended LODs for a client
   * @param {string} clientId - Client identifier
   * @returns {Array<Object>} Array of objects with LOD recommendations
   */
  getSceneLODs(clientId) {
    const results = [];

    for (const [objectId, objectData] of this.sceneObjects) {
      const lod = this.determineLOD(clientId, objectId, objectData.position);
      results.push({
        objectId: objectId,
        lod: lod,
        position: objectData.position,
        shouldStream: lod !== 'skip',
      });
    }

    // Sort by priority (foveal high LOD first, then peripheral)
    results.sort((a, b) => {
      const priority = { high: 3, low: 2, skip: 1 };
      return priority[b.lod] - priority[a.lod];
    });

    return results;
  }

  /**
   * Clean up view data for disconnected client
   * @param {string} clientId - Client identifier
   */
  removeClient(clientId) {
    this.clientViews.delete(clientId);
    console.log(`Removed foveated view data for client ${clientId}`);
  }

  /**
   * Get current view data for a client
   * @param {string} clientId - Client identifier
   * @returns {Object|null} View data or null if not found
   */
  getClientView(clientId) {
    return this.clientViews.get(clientId) || null;
  }

  /**
   * Clear all scene objects
   */
  clearSceneObjects() {
    this.sceneObjects.clear();
  }

  /**
   * Get statistics for debugging
   * @returns {Object} Statistics about foveated streaming
   */
  getStats() {
    return {
      activeClients: this.clientViews.size,
      sceneObjects: this.sceneObjects.size,
      zones: this.ZONES,
    };
  }
}

module.exports = FoveatedStreamingManager;
