#!/usr/bin/env node
/**
 * Version bump script — syncs version across all 3 files:
 *   package.json, tauri.conf.json, src-tauri/Cargo.toml
 *
 * Usage:
 *   node scripts/version-bump.mjs patch       → 0.1.0 → 0.1.1
 *   node scripts/version-bump.mjs minor       → 0.1.0 → 0.2.0
 *   node scripts/version-bump.mjs major       → 0.1.0 → 1.0.0
 *   node scripts/version-bump.mjs 1.2.3       → set explicit version
 *   node scripts/version-bump.mjs patch --no-commit   → skip git commit/tag
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const noCommit = args.includes('--no-commit');
const bumpArg = args.find(a => !a.startsWith('--'));

if (!bumpArg) {
  console.error('Usage: node scripts/version-bump.mjs <patch|minor|major|x.y.z>');
  process.exit(1);
}

// ── Read current version ──────────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(`${ROOT}/package.json`, 'utf-8'));
const current = pkg.version;

function parseVersion(v) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?$/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || '' };
}

function fmtVersion(v) {
  return v.pre ? `${v.major}.${v.minor}.${v.patch}-${v.pre}` : `${v.major}.${v.minor}.${v.patch}`;
}

const parsed = parseVersion(current);
if (!parsed) {
  console.error(`Current version "${current}" is not valid semver`);
  process.exit(1);
}

let next;
if (['patch', 'minor', 'major'].includes(bumpArg)) {
  next = { ...parsed };
  if (bumpArg === 'patch') next.patch++;
  else if (bumpArg === 'minor') { next.minor++; next.patch = 0; }
  else { next.major++; next.minor = 0; next.patch = 0; }
  next = fmtVersion(next);
} else {
  next = bumpArg;
  if (!parseVersion(next)) {
    console.error(`Invalid version: "${next}"`);
    process.exit(1);
  }
}

console.log(`Version: ${current} → ${next}`);

// ── Update files ──────────────────────────────────────────────────────────────
// package.json
pkg.version = next;
writeFileSync(`${ROOT}/package.json`, JSON.stringify(pkg, null, 2) + '\n');
console.log('  ✓ package.json');

// tauri.conf.json
const tauriConfPath = `${ROOT}/src-tauri/tauri.conf.json`;
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf-8'));
tauriConf.version = next;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
console.log('  ✓ tauri.conf.json');

// Cargo.toml
const cargoPath = `${ROOT}/src-tauri/Cargo.toml`;
let cargo = readFileSync(cargoPath, 'utf-8');
cargo = cargo.replace(/^(version\s*=\s*)".*"$/m, `$1"${next}"`);
writeFileSync(cargoPath, cargo);
console.log('  ✓ Cargo.toml');

// ── Git commit & tag ──────────────────────────────────────────────────────────
if (!noCommit) {
  try {
    execSync(`git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml`, { cwd: ROOT });
    execSync(`git commit -m "chore: bump version ${current} → ${next}"`, { cwd: ROOT });
    execSync(`git tag v${next}`, { cwd: ROOT });
    console.log(`  ✓ git commit + tag v${next}`);
  } catch (e) {
    console.warn('  ⚠ git commit/tag failed (is this a git repo?)');
  }
} else {
  console.log('  ○ skipped git commit (--no-commit)');
}

console.log(`\nDone — v${next}`);
