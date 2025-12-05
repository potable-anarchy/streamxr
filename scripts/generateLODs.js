#!/usr/bin/env node

/**
 * CLI Tool for Manual LOD Generation
 *
 * Usage:
 *   node scripts/generateLODs.js <assetId>
 *   node scripts/generateLODs.js --all
 *   node scripts/generateLODs.js --clear <assetId>
 *   node scripts/generateLODs.js --clear-all
 *
 * Examples:
 *   node scripts/generateLODs.js cube
 *   node scripts/generateLODs.js --all
 *   node scripts/generateLODs.js --clear cube
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const LODGenerator = require('../lib/lodGenerator');

const MODELS_DIR = path.join(__dirname, '../public/models');

async function generateForAsset(assetId, lodGenerator) {
  console.log(`\n=== Processing asset: ${assetId} ===`);

  const assetDir = path.join(MODELS_DIR, assetId);
  const highGlbPath = path.join(assetDir, 'high.glb');

  // Check if asset directory exists
  try {
    await fs.access(assetDir);
  } catch (error) {
    console.error(`Error: Asset directory not found: ${assetDir}`);
    return false;
  }

  // Check if high.glb exists
  try {
    await fs.access(highGlbPath);
  } catch (error) {
    console.error(`Error: high.glb not found in ${assetDir}`);
    return false;
  }

  // Check if LODs are already cached
  const isCached = await lodGenerator.isCached(assetId);
  if (isCached) {
    console.log(`LODs already cached for ${assetId}`);
    console.log(`Use --clear ${assetId} to regenerate`);
    return true;
  }

  // Generate LODs
  console.log(`Reading high.glb...`);
  const highBuffer = await fs.readFile(highGlbPath);
  console.log(`File size: ${(highBuffer.length / 1024).toFixed(2)} KB`);

  console.log(`\nGenerating LOD levels...`);
  const lods = await lodGenerator.generateLODs(highBuffer, assetId);

  // Save generated LODs to asset directory
  const mediumPath = path.join(assetDir, 'medium.glb');
  const lowPath = path.join(assetDir, 'low.glb');

  console.log(`\nSaving generated files...`);

  if (lods.medium) {
    await fs.writeFile(mediumPath, lods.medium);
    console.log(`✓ Saved medium.glb (${(lods.medium.length / 1024).toFixed(2)} KB)`);
  }

  if (lods.low) {
    await fs.writeFile(lowPath, lods.low);
    console.log(`✓ Saved low.glb (${(lods.low.length / 1024).toFixed(2)} KB)`);
  }

  console.log(`\n✓ Successfully generated LODs for ${assetId}`);
  console.log(`  Cache: cache/lods/${assetId}/`);
  console.log(`  Files: ${assetDir}/`);

  return true;
}

async function generateAll(lodGenerator) {
  console.log('=== Generating LODs for all assets ===\n');

  // Scan models directory for asset folders
  const entries = await fs.readdir(MODELS_DIR, { withFileTypes: true });
  const assetDirs = entries
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  if (assetDirs.length === 0) {
    console.log('No asset directories found in public/models/');
    return;
  }

  console.log(`Found ${assetDirs.length} asset(s): ${assetDirs.join(', ')}\n`);

  let successCount = 0;
  for (const assetId of assetDirs) {
    const success = await generateForAsset(assetId, lodGenerator);
    if (success) successCount++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${successCount}/${assetDirs.length} assets`);
}

async function clearCache(assetId, lodGenerator) {
  if (assetId) {
    console.log(`Clearing cache for asset: ${assetId}`);
    await lodGenerator.clearCache(assetId);
    console.log(`✓ Cache cleared for ${assetId}`);
  } else {
    console.log('Clearing all LOD cache...');
    await lodGenerator.clearAllCache();
    console.log('✓ All cache cleared');
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
LOD Generator CLI Tool

Usage:
  node scripts/generateLODs.js <assetId>     Generate LODs for a specific asset
  node scripts/generateLODs.js --all         Generate LODs for all assets
  node scripts/generateLODs.js --clear <id>  Clear cache for a specific asset
  node scripts/generateLODs.js --clear-all   Clear all LOD cache

Examples:
  node scripts/generateLODs.js cube
  node scripts/generateLODs.js sphere
  node scripts/generateLODs.js --all
  node scripts/generateLODs.js --clear cube
  node scripts/generateLODs.js --clear-all

Notes:
  - Asset must have a high.glb file in public/models/<assetId>/
  - Generated files are saved to both cache and asset directory
  - Use --clear to force regeneration of cached LODs
`);
    process.exit(0);
  }

  const lodGenerator = new LODGenerator();
  await lodGenerator.init();

  const command = args[0];

  try {
    if (command === '--all') {
      await generateAll(lodGenerator);
    } else if (command === '--clear' && args.length === 2) {
      await clearCache(args[1], lodGenerator);
    } else if (command === '--clear-all') {
      await clearCache(null, lodGenerator);
    } else if (command.startsWith('--')) {
      console.error(`Unknown option: ${command}`);
      process.exit(1);
    } else {
      // Treat as asset ID
      const success = await generateForAsset(command, lodGenerator);
      process.exit(success ? 0 : 1);
    }
  } catch (error) {
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

main();
