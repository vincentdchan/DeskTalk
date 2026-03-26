#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();

async function getPackageJsonPaths() {
  const packagesDir = path.join(rootDir, 'packages');
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const packageJsonPaths = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name, 'package.json'));

  return [path.join(rootDir, 'package.json'), ...packageJsonPaths];
}

async function readManifest(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const data = JSON.parse(raw);
  if (typeof data.name !== 'string' || typeof data.version !== 'string') {
    return null;
  }
  return { name: data.name, version: data.version, filePath };
}

const manifests = [];

for (const filePath of await getPackageJsonPaths()) {
  try {
    const manifest = await readManifest(filePath);
    if (manifest) {
      manifests.push(manifest);
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      continue;
    }
    throw error;
  }
}

if (manifests.length === 0) {
  console.error('[version:check] No package.json files found.');
  process.exit(1);
}

const expectedVersion = manifests[0].version;
const mismatches = manifests.filter((manifest) => manifest.version !== expectedVersion);

if (mismatches.length > 0) {
  console.error(`[version:check] Expected all versions to match ${expectedVersion}.`);
  for (const manifest of mismatches) {
    console.error(
      `[version:check] ${manifest.name} has ${manifest.version} (${path.relative(rootDir, manifest.filePath)})`,
    );
  }
  process.exit(1);
}

console.log(`[version:check] All ${manifests.length} package.json files use ${expectedVersion}.`);
