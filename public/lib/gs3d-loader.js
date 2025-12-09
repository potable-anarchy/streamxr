// GaussianSplats3D loader - loads the ES module and exposes it globally
import * as GaussianSplats3D from './gaussian-splats-3d.module.js';

// Expose globally for use by nerfRenderer.js
window.GaussianSplats3D = GaussianSplats3D;

console.log('[GS3D Loader] GaussianSplats3D loaded and exposed globally');
