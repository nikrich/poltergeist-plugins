import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateEntry, validateManifest, readEntries, checkArtifacts, esc } from './lib.mjs';

const goodEntry = {
  id: 'my-plugin',
  repo: 'nikrich/my-plugin',
  subdir: '',
  ref: 'main',
  author: 'nikrich',
  tags: ['example'],
};

test('validateEntry accepts a good entry', () => {
  assert.deepEqual(validateEntry(goodEntry), []);
});

test('validateEntry rejects bad ids', () => {
  for (const id of ['My-Plugin', '1plugin', 'a', 'x'.repeat(33), '']) {
    assert.ok(validateEntry({ ...goodEntry, id }).length > 0, `id "${id}" should fail`);
  }
});

test('validateEntry rejects missing/malformed repo', () => {
  assert.ok(validateEntry({ ...goodEntry, repo: undefined }).length > 0);
  assert.ok(validateEntry({ ...goodEntry, repo: 'not-a-slug' }).length > 0);
  assert.ok(validateEntry({ ...goodEntry, repo: 'https://github.com/a/b' }).length > 0);
});

test('validateEntry rejects bad refs, tags, and unknown keys', () => {
  assert.ok(validateEntry({ ...goodEntry, ref: '' }).length > 0);
  assert.ok(validateEntry({ ...goodEntry, ref: 'a b' }).length > 0);
  assert.ok(validateEntry({ ...goodEntry, tags: ['Bad Tag'] }).length > 0);
  assert.ok(validateEntry({ ...goodEntry, tags: Array(9).fill('t') }).length > 0);
  assert.ok(validateEntry({ ...goodEntry, extra: true }).length > 0);
});

const goodManifest = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '0.1.0',
  description: 'does things',
  apiVersion: 1,
  icon: 'puzzle',
  entry: { main: 'dist/main.cjs', renderer: 'dist/renderer.mjs' },
};

test('validateManifest accepts a good manifest', () => {
  assert.deepEqual(validateManifest(goodManifest), []);
});

test('validateManifest mirrors the app schema', () => {
  assert.ok(validateManifest({ ...goodManifest, apiVersion: 2 }).length > 0);
  assert.ok(validateManifest({ ...goodManifest, entry: {} }).length > 0);
  assert.ok(validateManifest({ ...goodManifest, entry: { main: 'dist/main.js' } }).length > 0);
  assert.ok(validateManifest({ ...goodManifest, entry: { renderer: 'dist/r.cjs' } }).length > 0);
  assert.ok(validateManifest({ ...goodManifest, icon: 'Bad Icon' }).length > 0);
  assert.ok(validateManifest({ ...goodManifest, name: '' }).length > 0);
  assert.ok(validateManifest({ ...goodManifest, name: 'x'.repeat(65) }).length > 0);
  assert.ok(validateManifest({ ...goodManifest, description: 'x'.repeat(501) }).length > 0);
  assert.ok(validateManifest({ ...goodManifest, version: '' }).length > 0);
  // description and icon are optional
  const { description, icon, ...rest } = goodManifest;
  assert.deepEqual(validateManifest(rest), []);
});

test('readEntries reads entry files and flags filename/id mismatches', () => {
  const dir = mkdtempSync(join(tmpdir(), 'entries-'));
  writeFileSync(join(dir, 'my-plugin.json'), JSON.stringify(goodEntry));
  writeFileSync(join(dir, 'other.json'), JSON.stringify(goodEntry)); // id mismatch
  writeFileSync(join(dir, 'broken.json'), '{not json');
  const entries = readEntries(dir);
  assert.equal(entries.length, 3);
  const byFile = Object.fromEntries(entries.map((e) => [e.file, e]));
  assert.deepEqual(byFile['my-plugin.json'].errors, []);
  assert.ok(byFile['other.json'].errors.some((m) => m.includes('filename')));
  assert.ok(byFile['broken.json'].errors.length > 0);
  rmSync(dir, { recursive: true, force: true });
});

test('checkArtifacts requires entry files and committed dist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'artifacts-'));
  assert.ok(checkArtifacts(dir, goodManifest).length > 0); // nothing there
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist/main.cjs'), '');
  writeFileSync(join(dir, 'dist/renderer.mjs'), '');
  assert.deepEqual(checkArtifacts(dir, goodManifest), []);
  rmSync(dir, { recursive: true, force: true });
});

test('esc escapes html metacharacters', () => {
  assert.equal(esc(`<script>&"'`), '&lt;script&gt;&amp;&quot;&#39;');
  assert.equal(esc(undefined), '');
});
