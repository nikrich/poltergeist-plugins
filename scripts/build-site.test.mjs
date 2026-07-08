import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry, renderIndex, renderDetail } from './build-site.mjs';

const plugin = {
  id: 'evil',
  entry: {
    id: 'evil',
    repo: 'nikrich/evil',
    subdir: 'sub/dir',
    ref: 'main',
    author: '<b>bob</b>',
    tags: ['x'],
  },
  manifest: {
    id: 'evil',
    name: '<script>alert(1)</script>',
    version: '1.0.0',
    description: 'desc & "quotes"',
    apiVersion: 1,
    icon: 'puzzle',
    entry: { renderer: 'dist/renderer.mjs' },
  },
};

test('buildRegistry emits apiVersion 1 and download paths', () => {
  const reg = buildRegistry([plugin]);
  assert.equal(reg.apiVersion, 1);
  assert.equal(reg.plugins.length, 1);
  const p = reg.plugins[0];
  assert.equal(p.id, 'evil');
  assert.equal(p.download, '/dl/evil-1.0.0.zip');
  assert.equal(p.repo, 'nikrich/evil');
  assert.equal(p.subdir, 'sub/dir');
  assert.equal(p.version, '1.0.0');
});

test('renderIndex advertises the plugin-dev skill download', () => {
  const html = renderIndex([plugin]);
  assert.ok(html.includes('dl/poltergeist-plugin-dev-skill.zip'));
  assert.ok(html.toLowerCase().includes('build your own'));
});

test('renderDetail links the plugin-dev skill', () => {
  const html = renderDetail(plugin, '<p>readme</p>');
  assert.ok(html.includes('dl/poltergeist-plugin-dev-skill.zip'));
});

test('renderIndex escapes plugin-supplied strings', () => {
  const html = renderIndex([plugin]);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('plugins/evil/'));
});

test('renderDetail includes the install-from-git block and escapes', () => {
  const html = renderDetail(plugin, '<p>readme</p>');
  assert.ok(html.includes('https://github.com/nikrich/evil'));
  assert.ok(html.includes('sub/dir'));
  assert.ok(html.includes('/dl/evil-1.0.0.zip'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('<p>readme</p>')); // readme html passes through (marked output)
});
