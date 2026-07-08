// Shared helpers for the registry pipeline: entry/manifest validation
// (mirrors desktop/src/shared/plugin-types.ts in nikrich/poltergeist),
// plugin clone + build, artifact checks, html escaping.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const ID_RE = /^[a-z][a-z0-9-]{1,31}$/;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const REF_RE = /^[\w./-]+$/;
const TAG_RE = /^[a-z][a-z0-9-]*$/;
const ICON_RE = /^[a-z0-9-]+$/;
const MAIN_RE = /^[\w./-]+\.cjs$/;
const RENDERER_RE = /^[\w./-]+\.mjs$/;

const ENTRY_KEYS = new Set(['id', 'repo', 'subdir', 'ref', 'author', 'tags']);

/** Registry entry (plugins/<id>.json) → list of problems, [] when valid. */
export function validateEntry(entry) {
  const errors = [];
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return ['entry must be a JSON object'];
  }
  for (const key of Object.keys(entry)) {
    if (!ENTRY_KEYS.has(key)) errors.push(`unknown key "${key}"`);
  }
  if (typeof entry.id !== 'string' || !ID_RE.test(entry.id)) {
    errors.push(`id must match ${ID_RE}`);
  }
  if (typeof entry.repo !== 'string' || !REPO_RE.test(entry.repo)) {
    errors.push('repo must be a GitHub "owner/name" slug');
  }
  if (typeof entry.subdir !== 'string' || entry.subdir.includes('..') || entry.subdir.startsWith('/')) {
    errors.push('subdir must be a relative path inside the repo ("" for root)');
  }
  if (typeof entry.ref !== 'string' || !REF_RE.test(entry.ref)) {
    errors.push('ref must be a branch or tag name');
  }
  if (typeof entry.author !== 'string' || entry.author.length < 1 || entry.author.length > 64) {
    errors.push('author must be 1-64 chars');
  }
  if (!Array.isArray(entry.tags) || entry.tags.length > 8 || entry.tags.some((t) => typeof t !== 'string' || !TAG_RE.test(t))) {
    errors.push(`tags must be ≤8 strings matching ${TAG_RE}`);
  }
  return errors;
}

/** Plugin manifest.json → list of problems, [] when valid. Mirrors the app's zod schema. */
export function validateManifest(m) {
  const errors = [];
  if (typeof m !== 'object' || m === null || Array.isArray(m)) {
    return ['manifest must be a JSON object'];
  }
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) errors.push(`id must match ${ID_RE}`);
  if (typeof m.name !== 'string' || m.name.length < 1 || m.name.length > 64) {
    errors.push('name must be 1-64 chars');
  }
  if (typeof m.version !== 'string' || m.version.length < 1) errors.push('version is required');
  if (m.description !== undefined && (typeof m.description !== 'string' || m.description.length > 500)) {
    errors.push('description must be ≤500 chars');
  }
  if (m.apiVersion !== 1) errors.push('apiVersion must be 1');
  if (m.icon !== undefined && (typeof m.icon !== 'string' || !ICON_RE.test(m.icon))) {
    errors.push('icon must be a lucide icon name (lowercase, dashes)');
  }
  const entry = m.entry;
  if (typeof entry !== 'object' || entry === null) {
    errors.push('entry object is required');
  } else {
    if (entry.main !== undefined && (typeof entry.main !== 'string' || !MAIN_RE.test(entry.main))) {
      errors.push('entry.main must be a .cjs path');
    }
    if (entry.renderer !== undefined && (typeof entry.renderer !== 'string' || !RENDERER_RE.test(entry.renderer))) {
      errors.push('entry.renderer must be a .mjs path');
    }
    if (!entry.main && !entry.renderer) errors.push('entry needs main and/or renderer');
  }
  return errors;
}

/** Read every plugins/<id>.json → [{id, file, entry, errors}] (never throws). */
export function readEntries(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      let entry = null;
      let errors = [];
      try {
        entry = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
        errors = validateEntry(entry);
        if (entry && typeof entry.id === 'string' && `${entry.id}.json` !== file) {
          errors.push(`filename "${file}" must be "${entry.id}.json"`);
        }
      } catch (err) {
        errors = [`invalid JSON: ${err.message}`];
      }
      return { id: entry?.id ?? file.replace(/\.json$/, ''), file, entry, errors };
    });
}

/** Shallow-clone entry.repo at entry.ref into workDir; returns the plugin dir (repo root + subdir). */
export function clonePlugin(entry, workDir) {
  rmSync(workDir, { recursive: true, force: true });
  execFileSync(
    'git',
    ['clone', '--depth', '1', '--branch', entry.ref, `https://github.com/${entry.repo}.git`, workDir],
    { stdio: 'pipe' },
  );
  const pluginDir = resolve(workDir, entry.subdir || '.');
  if (!pluginDir.startsWith(resolve(workDir))) throw new Error('subdir escapes the repo');
  if (!existsSync(pluginDir)) throw new Error(`subdir "${entry.subdir}" not found in ${entry.repo}`);
  return pluginDir;
}

/** npm ci + npm run build when the plugin has a build script; throws on failure. */
export function buildPlugin(pluginDir) {
  const pkgPath = join(pluginDir, 'package.json');
  if (!existsSync(pkgPath)) return;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  if (!pkg.scripts?.build) return;
  const opts = { cwd: pluginDir, stdio: 'pipe' };
  execFileSync('npm', [existsSync(join(pluginDir, 'package-lock.json')) ? 'ci' : 'install'], opts);
  execFileSync('npm', ['run', 'build'], opts);
}

/** Entry files named in the manifest must exist under the plugin dir. */
export function checkArtifacts(pluginDir, manifest) {
  const errors = [];
  for (const rel of [manifest.entry?.main, manifest.entry?.renderer]) {
    if (rel && !existsSync(join(pluginDir, rel))) errors.push(`missing entry file ${rel}`);
  }
  return errors;
}

/** Escape a plugin-supplied string for interpolation into HTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}
