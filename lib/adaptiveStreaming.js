/**
 * Adaptive Streaming Module
 * Manages LOD (Level of Detail) selection based on client bandwidth
 */

class AdaptiveStreamingManager {
  constructor() {
    // Client bandwidth tracking: clientId -> bandwidth metrics
    this.clientMetrics = new Map();

    // Bandwidth thresholds (in bytes per second)
    this.THRESHOLDS = {
      HIGH: 500000,  // 500 KB/s - use high LOD
      LOW: 100000    // 100 KB/s - use low LOD
    };

    // Smoothing factor for bandwidth estimation (exponential moving average)
    this.SMOOTHING_FACTOR = 0.3;

    // Minimum samples before making LOD decisions
    this.MIN_SAMPLES = 2;
  }

  /**
   * Update bandwidth metrics for a client
   * @param {string} clientId - Client identifier
   * @param {number} bytesTransferred - Number of bytes transferred
   * @param {number} durationMs - Transfer duration in milliseconds
   */
  updateMetrics(clientId, bytesTransferred, durationMs) {
    if (durationMs <= 0) return;

    const bandwidth = (bytesTransferred / durationMs) * 1000; // bytes per second

    if (!this.clientMetrics.has(clientId)) {
      this.clientMetrics.set(clientId, {
        currentBandwidth: bandwidth,
        samples: 1,
        lastUpdate: Date.now()
      });
    } else {
      const metrics = this.clientMetrics.get(clientId);

      // Exponential moving average for smoother bandwidth estimation
      metrics.currentBandwidth =
        (this.SMOOTHING_FACTOR * bandwidth) +
        ((1 - this.SMOOTHING_FACTOR) * metrics.currentBandwidth);

      metrics.samples++;
      metrics.lastUpdate = Date.now();
    }

    console.log(`Client ${clientId} bandwidth: ${this.getEstimatedBandwidth(clientId).toFixed(0)} bytes/sec`);
  }

  /**
   * Get estimated bandwidth for a client
   * @param {string} clientId - Client identifier
   * @returns {number} Estimated bandwidth in bytes per second
   */
  getEstimatedBandwidth(clientId) {
    const metrics = this.clientMetrics.get(clientId);
    return metrics ? metrics.currentBandwidth : 0;
  }

  /**
   * Select appropriate LOD based on client bandwidth
   * @param {string} clientId - Client identifier
   * @param {string} baseAssetId - Base asset identifier (e.g., 'sphere')
   * @returns {string} Selected asset ID with appropriate LOD (e.g., 'sphere-high' or 'sphere-low')
   */
  selectLOD(clientId, baseAssetId) {
    const metrics = this.clientMetrics.get(clientId);

    // Default to low LOD if no metrics available
    if (!metrics || metrics.samples < this.MIN_SAMPLES) {
      console.log(`Client ${clientId}: Insufficient metrics, defaulting to low LOD`);
      return `${baseAssetId}-low`;
    }

    const bandwidth = metrics.currentBandwidth;

    // Select LOD based on bandwidth thresholds
    if (bandwidth >= this.THRESHOLDS.HIGH) {
      console.log(`Client ${clientId}: High bandwidth (${bandwidth.toFixed(0)} B/s), selecting high LOD`);
      return `${baseAssetId}-high`;
    } else if (bandwidth >= this.THRESHOLDS.LOW) {
      console.log(`Client ${clientId}: Medium bandwidth (${bandwidth.toFixed(0)} B/s), selecting low LOD`);
      return `${baseAssetId}-low`;
    } else {
      console.log(`Client ${clientId}: Low bandwidth (${bandwidth.toFixed(0)} B/s), selecting low LOD`);
      return `${baseAssetId}-low`;
    }
  }

  /**
   * Get recommended LOD based on client-reported metrics
   * @param {string} clientId - Client identifier
   * @param {Object} clientReportedMetrics - Metrics reported by client
   * @returns {string} Recommended LOD level ('high' or 'low')
   */
  getRecommendedLOD(clientId, clientReportedMetrics) {
    // Update server-side metrics with client report
    if (clientReportedMetrics.bandwidth) {
      const metrics = this.clientMetrics.get(clientId) || {
        currentBandwidth: clientReportedMetrics.bandwidth,
        samples: 0,
        lastUpdate: Date.now()
      };

      // Blend client-reported bandwidth with server estimates
      metrics.currentBandwidth =
        (0.5 * clientReportedMetrics.bandwidth) +
        (0.5 * (metrics.currentBandwidth || clientReportedMetrics.bandwidth));

      metrics.samples++;
      metrics.lastUpdate = Date.now();

      this.clientMetrics.set(clientId, metrics);
    }

    const bandwidth = this.getEstimatedBandwidth(clientId);

    if (bandwidth >= this.THRESHOLDS.HIGH) {
      return 'high';
    } else {
      return 'low';
    }
  }

  /**
   * Clean up metrics for disconnected client
   * @param {string} clientId - Client identifier
   */
  removeClient(clientId) {
    this.clientMetrics.delete(clientId);
    console.log(`Removed metrics for client ${clientId}`);
  }

  /**
   * Get metrics for a client
   * @param {string} clientId - Client identifier
   * @returns {Object|null} Client metrics or null if not found
   */
  getClientMetrics(clientId) {
    return this.clientMetrics.get(clientId) || null;
  }
}

module.exports = AdaptiveStreamingManager;
