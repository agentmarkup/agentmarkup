#!/usr/bin/env node
// Copy the canonical skill into the Claude plugin.
//
//   node scripts/sync-plugin-skill.mjs            write the plugin copy
//   node scripts/sync-plugin-skill.mjs --check    report differences, write nothing, exit 1 if any
//
// One-directional by construction: the default SOURCE is always the canonical skill and the
// default DEST is always the plugin copy. The CLI exposes no flag to reverse them, so a bad
// invocation cannot overwrite the canonical side. `--check` is what the test suite calls, so
// `pnpm test` never writes inside the repository.
//
// Why a copy and not a symlink: `claude plugin validate` does not follow symlinks. It warns
// ("components are read without following symlinks") and that warning fails `--strict`, which
// is the check the plugin-directory review pipeline runs.

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const SOURCE = join(repoRoot, 'skills', 'agentmarkup');
export const DEST = join(repoRoot, 'plugins', 'agentmarkup', 'skills', 'agentmarkup');

// Untracked OS junk that exists locally but not on a clean checkout. Deliberately a named list,
// not "every dotfile": a meaningful dotfile added to the skill later must show up as a
// difference rather than being silently dropped from the plugin.
export const IGNORED_NAMES = new Set(['.DS_Store', 'Thumbs.db']);
export const IGNORED_PREFIXES = ['._'];

export function isIgnored(name) {
  return IGNORED_NAMES.has(name) || IGNORED_PREFIXES.some((p) => name.startsWith(p));
}

export class SymlinkInSkillError extends Error {}

/**
 * Relative paths of every file under `dir`, sorted, with ignored entries removed.
 *
 * Throws on any symlink encountered. `readdirSync(withFileTypes)` reports lstat results, so a
 * symlink is neither isFile() nor isDirectory(). Skipping it would drop the entry from the
 * plugin copy AND from the comparison — leaving `--check` reporting "in sync" while the plugin
 * is missing a file. That is the exact failure the copy-not-symlink design exists to prevent,
 * so it has to be loud rather than silent.
 */
export function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (isIgnored(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new SymlinkInSkillError(
        `${full} is a symlink. The skill tree must contain real files only: ` +
          `"claude plugin validate" does not follow symlinks and --strict fails on the warning.`
      );
    }
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else if (entry.isFile()) out.push(relative(base, full));
  }
  return out.sort();
}

/** Files that differ between a canonical skill tree and its copy. */
export function diffSkill(source = SOURCE, dest = DEST) {
  const src = listFiles(source);
  const dst = listFiles(dest);
  const missing = src.filter((f) => !dst.includes(f));
  const extra = dst.filter((f) => !src.includes(f));
  const changed = src
    .filter((f) => dst.includes(f))
    .filter((f) => !readFileSync(join(source, f)).equals(readFileSync(join(dest, f))));
  return { missing, extra, changed };
}

/**
 * Copy `source` over `dest`. Parameterised so the write path can be exercised against a
 * temp fixture in tests without ever touching the repository tree.
 */
export function sync(source = SOURCE, dest = DEST) {
  if (!existsSync(source)) throw new Error(`Canonical skill not found at ${source}`);
  const files = listFiles(source);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  for (const file of files) {
    const target = join(dest, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(source, file)));
  }
  return files.length;
}

function main() {
  if (existsSync(DEST) && lstatSync(DEST).isSymbolicLink()) {
    console.error(
      `${DEST} is a symlink. It must be a real directory: "claude plugin validate" does not ` +
        `follow symlinks and --strict fails on the warning. Remove it and re-run this script.`
    );
    process.exit(1);
  }

  if (process.argv.includes('--check')) {
    const { missing, extra, changed } = diffSkill();
    const total = missing.length + extra.length + changed.length;
    if (total === 0) {
      console.log('Plugin skill copy is in sync with skills/agentmarkup/.');
      return;
    }
    for (const f of missing) console.error(`  missing from plugin copy: ${f}`);
    for (const f of extra) console.error(`  not in canonical skill:    ${f}`);
    for (const f of changed) console.error(`  content differs:           ${f}`);
    console.error(`\n${total} difference(s). Run: pnpm sync:plugin`);
    process.exit(1);
  }

  const count = sync();
  console.log(`Synced ${count} files into plugins/agentmarkup/skills/agentmarkup/`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof SymlinkInSkillError ? error.message : error);
    process.exit(1);
  }
}
