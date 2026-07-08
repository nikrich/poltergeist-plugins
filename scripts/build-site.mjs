// Builds the marketplace: site/index.html, site/plugins/<id>/index.html,
// site/registry.json, site/dl/<id>-<version>.zip, plus site-src/ assets.
// A plugin that fails validation on main is skipped with a warning — one
// broken entry never takes the site down.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { esc } from './lib.mjs';
import { validateAll } from './validate.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const SITE = join(ROOT, 'site');

const REGISTRY_REPO_URL = 'https://github.com/nikrich/poltergeist-plugins';
const SUBMIT_URL = `${REGISTRY_REPO_URL}/blob/main/CONTRIBUTING.md`;
const HOME_URL = 'https://getpoltergeist.com';

const zipName = (p) => `${p.manifest.id}-${p.manifest.version}.zip`;

/** Machine-readable index consumed by a future in-app marketplace. */
export function buildRegistry(plugins, generatedAt = new Date().toISOString()) {
  return {
    apiVersion: 1,
    generatedAt,
    plugins: plugins.map((p) => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description ?? '',
      icon: p.manifest.icon ?? 'puzzle',
      author: p.entry.author,
      tags: p.entry.tags,
      repo: p.entry.repo,
      subdir: p.entry.subdir,
      ref: p.entry.ref,
      download: `/dl/${zipName(p)}`,
    })),
  };
}

function page(title, body, { depth = 0 } = {}) {
  const base = '../'.repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="Plugins for Poltergeist — a quiet brain for your loud apps.">
<link rel="icon" type="image/svg+xml" href="${base}glyph.svg">
<link rel="stylesheet" href="${base}styles.css">
</head>
<body>
<header class="site-header">
  <a class="brand" href="${HOME_URL}"><img src="${base}glyph.svg" alt="" width="22" height="24"><span>poltergeist</span></a>
  <nav>
    <a href="${base}./">plugins</a>
    <a href="${SUBMIT_URL}">submit a plugin</a>
    <a href="${REGISTRY_REPO_URL}">github</a>
  </nav>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <span>plugins run as trusted code — install only what you trust.</span>
  <a href="${HOME_URL}">getpoltergeist.com</a>
</footer>
</body>
</html>
`;
}

export function renderIndex(plugins) {
  const cards = plugins
    .map(
      (p) => `    <a class="card" href="plugins/${esc(p.manifest.id)}/">
      <div class="card-head"><span class="card-name">${esc(p.manifest.name)}</span><span class="card-version">v${esc(p.manifest.version)}</span></div>
      <p class="card-desc">${esc(p.manifest.description ?? '')}</p>
      <div class="card-meta">
        <span class="card-author">${esc(p.entry.author)}</span>
        ${p.entry.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
      </div>
    </a>`,
    )
    .join('\n');
  const body = `  <section class="hero">
    <span class="eyebrow">plugin marketplace</span>
    <h1>Haunt your second brain<br>with new tricks.</h1>
    <p>Community plugins for Poltergeist. Each one is validated and built from
    source by the <a href="${REGISTRY_REPO_URL}">registry</a> before it lands here.</p>
  </section>
  <section class="grid">
${cards || '    <p class="empty">nothing haunting the marketplace yet.</p>'}
  </section>`;
  return page('Poltergeist Plugins', body);
}

export function renderDetail(p, readmeHtml) {
  const m = p.manifest;
  const repoUrl = `https://github.com/${p.entry.repo}`;
  const body = `  <article class="detail">
    <a class="back" href="../../">&larr; all plugins</a>
    <div class="detail-head">
      <h1>${esc(m.name)}</h1>
      <span class="card-version">v${esc(m.version)}</span>
    </div>
    <p class="detail-desc">${esc(m.description ?? '')}</p>
    <div class="card-meta">
      <span class="card-author">by ${esc(p.entry.author)}</span>
      ${p.entry.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
    </div>
    <section class="install">
      <h2>Install</h2>
      <p>In Poltergeist: <strong>Plugins &rarr; install from git</strong>, then paste:</p>
      <dl>
        <dt>git url</dt><dd><code>${esc(repoUrl)}</code></dd>
        ${p.entry.subdir ? `<dt>subdirectory</dt><dd><code>${esc(p.entry.subdir)}</code></dd>` : ''}
      </dl>
      <p class="install-alt">or grab the built package: <a href="../../dl/${esc(zipName(p))}">${esc(zipName(p))}</a>
      &middot; <a href="${esc(repoUrl)}">source</a></p>
      <p class="trust">plugins run unsandboxed as trusted code — review the source before installing.</p>
    </section>
    <section class="readme">
${readmeHtml}
    </section>
  </article>`;
  return page(`${m.name} — Poltergeist Plugins`, body, { depth: 2 });
}

function packageZip(p, dlDir) {
  const staging = join(ROOT, '.work', `${p.manifest.id}-pkg`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  cpSync(join(p.pluginDir, 'manifest.json'), join(staging, 'manifest.json'));
  cpSync(join(p.pluginDir, 'dist'), join(staging, 'dist'), { recursive: true });
  const readme = join(p.pluginDir, 'README.md');
  if (existsSync(readme)) cpSync(readme, join(staging, 'README.md'));
  const out = join(dlDir, zipName(p));
  execFileSync('zip', ['-r', '-q', out, '.'], { cwd: staging });
  return out;
}

function main() {
  const results = validateAll();
  const good = results.filter((r) => r.ok);
  for (const r of results.filter((r) => !r.ok)) {
    console.warn(`WARN skipping ${r.id}: ${r.errors.join('; ')}`);
  }

  rmSync(SITE, { recursive: true, force: true });
  mkdirSync(join(SITE, 'dl'), { recursive: true });
  cpSync(join(ROOT, 'site-src'), SITE, { recursive: true });

  for (const p of good) {
    packageZip(p, join(SITE, 'dl'));
    const readmePath = join(p.pluginDir, 'README.md');
    const readmeHtml = existsSync(readmePath)
      ? marked.parse(readFileSync(readmePath, 'utf-8'))
      : '<p>no readme.</p>';
    const dir = join(SITE, 'plugins', p.manifest.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), renderDetail(p, readmeHtml));
  }

  writeFileSync(join(SITE, 'index.html'), renderIndex(good));
  writeFileSync(join(SITE, 'registry.json'), JSON.stringify(buildRegistry(good), null, 2));
  console.log(`built site/ with ${good.length}/${results.length} plugins`);
  if (good.length === 0 && results.length > 0) {
    console.error('every plugin failed validation — refusing to publish an empty site');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
