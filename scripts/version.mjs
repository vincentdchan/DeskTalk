#!/usr/bin/env node

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const rootDir = process.cwd();

function fail(message) {
  console.error(`[version:set] ${message}`);
  process.exit(1);
}

async function getPackageJsonPaths() {
  const packagesDir = path.join(rootDir, 'packages');
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const packageJsonPaths = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name, 'package.json'));

  return [path.join(rootDir, 'package.json'), ...packageJsonPaths];
}

async function updateVersion(filePath, version) {
  const raw = await readFile(filePath, 'utf8');
  const data = JSON.parse(raw);
  if (typeof data.name !== 'string') {
    return null;
  }

  data.version = version;
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
  return { name: data.name, filePath };
}

const nextVersion = process.argv[2];

if (!nextVersion) {
  fail('Usage: node scripts/version.mjs <version>');
}

if (!VERSION_RE.test(nextVersion)) {
  fail(`Invalid semver version: ${nextVersion}`);
}

const packageJsonPaths = await getPackageJsonPaths();
const updated = [];

for (const filePath of packageJsonPaths) {
  try {
    const result = await updateVersion(filePath, nextVersion);
    if (result) {
      updated.push(result);
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      continue;
    }
    throw error;
  }
}

for (const item of updated) {
  console.log(`[version:set] ${item.name} -> ${nextVersion}`);
}

console.log(`[version:set] Updated ${updated.length} package.json files.`);
