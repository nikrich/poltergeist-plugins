// End-to-end validation of registry entries: schema → clone → manifest →
// committed dist → build → entry artifacts. CLI (PR gate) and library
// (consumed by build-site.mjs).
//
//   node scripts/validate.mjs [plugins/<id>.json ...]   # no args = all entries

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateEntry,
  validateManifest,
  readEntries,
  clonePlugin,
  buildPlugin,
  checkArtifacts,
} from './lib.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const PLUGINS_DIR = join(ROOT, 'plugins');
const WORK_DIR = join(ROOT, '.work');

/**
 * Validate entries end to end.
 * @param {string[]} [files] entry file paths; omitted/empty = every entry in plugins/.
 * @returns {{id: string, ok: boolean, errors: string[], entry?: object, manifest?: object, pluginDir?: string}[]}
 */
export function validateAll(files = []) {
  const targets = files.length
    ? files.map((f) => {
        const file = basename(f);
        let entry = null;
        let errors = [];
        try {
          entry = JSON.parse(readFileSync(resolve(ROOT, f), 'utf-8'));
          errors = validateEntry(entry);
          if (entry && typeof entry.id === 'string' && `${entry.id}.json` !== file) {
            errors.push(`filename "${file}" must be "${entry.id}.json"`);
          }
        } catch (err) {
          errors = [`invalid JSON: ${err.message}`];
        }
        return { id: entry?.id ?? file.replace(/\.json$/, ''), file, entry, errors };
      })
    : readEntries(PLUGINS_DIR);

  return targets.map(({ id, file, entry, errors }) => {
    if (errors.length) return { id, ok: false, errors };
    try {
      const pluginDir = clonePlugin(entry, join(WORK_DIR, id));

      const manifestPath = join(pluginDir, 'manifest.json');
      if (!existsSync(manifestPath)) {
        return { id, ok: false, errors: ['manifest.json not found'], entry };
      }
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const manifestErrors = validateManifest(manifest);
      if (manifest.id !== id) manifestErrors.push(`manifest id "${manifest.id}" must equal entry id "${id}"`);
      if (manifestErrors.length) return { id, ok: false, errors: manifestErrors, entry };

      // Committed dist is the app's install contract (git clone, no builds).
      const distErrors = checkArtifacts(pluginDir, manifest);
      if (distErrors.length) {
        return { id, ok: false, errors: distErrors.map((e) => `${e} (dist/ must be committed)`), entry };
      }

      buildPlugin(pluginDir); // prove it builds from source; throws on failure

      const postBuildErrors = checkArtifacts(pluginDir, manifest);
      if (postBuildErrors.length) {
        return { id, ok: false, errors: postBuildErrors.map((e) => `after build: ${e}`), entry };
      }

      return { id, ok: true, errors: [], entry, manifest, pluginDir };
    } catch (err) {
      const detail = err.stderr?.toString().trim().split('\n').slice(-3).join(' ') || err.message;
      return { id, ok: false, errors: [detail], entry };
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = validateAll(process.argv.slice(2));
  let failed = 0;
  for (const r of results) {
    if (r.ok) {
      console.log(`ok   ${r.id}@${r.manifest.version}`);
    } else {
      failed++;
      console.error(`FAIL ${r.id}`);
      for (const e of r.errors) console.error(`     - ${e}`);
    }
  }
  console.log(`\n${results.length - failed}/${results.length} entries valid`);
  process.exit(failed ? 1 : 0);
}
