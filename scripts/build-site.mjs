// Builds the marketplace: site/index.html, site/plugins/<id>/index.html,
// site/registry.json, site/dl/<id>-<version>.zip, plus site-src/ assets.
// Markup and styles are a faithful port of the "Ghostbrain Website"
// claude.ai/design project (market/index.html, market/plugin.html).
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

// Lucide icon bodies (24×24 stroke) for the manifest `icon` names in use;
// anything unknown falls back to puzzle.
const ICONS = {
  sparkles:
    '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  puzzle:
    '<path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z"/>',
};

const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ICONS.puzzle}</svg>`;

const GHOST_GLYPH = `<svg viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg" class="floaty" aria-hidden="true">
          <path d="M50 6C24 6 10 24 10 50L10 94Q17 102 24 95Q31 88 38 95Q44 102 50 95Q56 88 62 95Q69 102 76 95Q83 88 90 94L90 50C90 24 76 6 50 6Z" fill="var(--neon)"/>
          <circle cx="38" cy="48" r="3.2" fill="var(--bg-paper)"/>
          <circle cx="62" cy="48" r="3.2" fill="var(--bg-paper)"/>
          <line x1="38" y1="48" x2="62" y2="48" stroke="var(--bg-paper)" stroke-width="1.2" stroke-opacity="0.5"/>
        </svg>`;

const GITHUB_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 2.5-.34c.85 0 1.7.12 2.5.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"/></svg>';

const COPY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

const STICKY_HEADER_SCRIPT = `    const header = document.getElementById('siteHeader');
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();`;

function page(title, body, script, { depth = 0 } = {}) {
  const base = '../'.repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="Community plugins for Poltergeist — a quiet brain for your loud apps.">
  <link rel="icon" href="${base}favicon.svg">
  <link rel="stylesheet" href="${base}styles.css">
</head>
<body>

  <header class="site-header" id="siteHeader">
    <div class="bar">
      <a class="brand" href="${base}./" aria-label="poltergeist plugins home">
        ${GHOST_GLYPH}
        <span class="word">poltergeist</span>
      </a>
      <nav class="site-nav" aria-label="primary">
        <a href="${base}./" class="plain">plugins</a>
        <a href="${SUBMIT_URL}" class="plain">submit a plugin</a>
        <a href="${REGISTRY_REPO_URL}" class="cta">
          ${GITHUB_ICON}
          github
        </a>
      </nav>
    </div>
  </header>

  <main>
${body}
  </main>

  <footer class="site-footer">
    <div class="wrap row">
      <span>© 2026 poltergeist · a quiet marketplace</span>
      <div class="links">
        <a href="${base}./">plugins</a>
        <a href="${SUBMIT_URL}">submit</a>
        <a href="${HOME_URL}">getpoltergeist.com</a>
      </div>
    </div>
  </footer>

  <script>
${script}
  </script>
</body>
</html>
`;
}

const INDEX_SCRIPT = `${STICKY_HEADER_SCRIPT}

    // search + tag filtering
    const search = document.getElementById('search');
    const grid = document.getElementById('grid');
    const cards = [...grid.querySelectorAll('.card')];
    const chips = [...document.querySelectorAll('.chip')];
    const empty = document.getElementById('empty');
    const emptyMsg = document.getElementById('emptyMsg');
    const count = document.getElementById('count');
    let activeTag = 'all';

    function apply() {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      cards.forEach(card => {
        const hay = (card.dataset.name + ' ' + card.dataset.author + ' ' + card.dataset.tags).toLowerCase();
        const matchQ = !q || hay.includes(q);
        const matchTag = activeTag === 'all' || card.dataset.tags.split(' ').includes(activeTag);
        const ok = matchQ && matchTag;
        card.style.display = ok ? '' : 'none';
        if (ok) shown++;
      });
      empty.classList.toggle('show', shown === 0);
      count.textContent = shown === 1 ? '1 plugin' : shown + ' plugins';
      if (shown === 0) {
        emptyMsg.textContent = q
          ? 'no plugins match \\u201c' + search.value.trim() + '\\u201d. try a different word, or clear the filters.'
          : 'no plugins under that tag yet. check back after the next s\\u00e9ance.';
      }
    }

    search.addEventListener('input', apply);
    chips.forEach(chip => chip.addEventListener('click', () => {
      chips.forEach(c => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      activeTag = chip.dataset.tag;
      apply();
    }));`;

export function renderIndex(plugins) {
  const tags = [...new Set(plugins.flatMap((p) => p.entry.tags))].sort();
  const chips = ['all', ...tags]
    .map(
      (t, i) =>
        `<button class="chip" data-tag="${esc(t)}" aria-pressed="${i === 0}">${esc(t)}</button>`,
    )
    .join('\n          ');

  const cards = plugins
    .map((p) => {
      const m = p.manifest;
      const hay = `${m.name} ${m.id}`.toLowerCase();
      return `        <a class="card" href="plugins/${esc(m.id)}/" data-name="${esc(hay)}" data-author="${esc(p.entry.author)}" data-tags="${esc(p.entry.tags.join(' '))}">
          <div class="top">
            <div class="icon">${icon(m.icon ?? 'puzzle')}</div>
            <span class="ver">v${esc(m.version)}</span>
          </div>
          <h3>${esc(m.name)}</h3>
          <p class="desc">${esc(m.description ?? '')}</p>
          <div class="meta">
            <span class="author">${esc(p.entry.author)}</span>
            <div class="tags">${p.entry.tags
              .slice(0, 2)
              .map((t) => `<span class="tag">${esc(t)}</span>`)
              .join('')}</div>
          </div>
        </a>`;
    })
    .join('\n\n');

  const n = plugins.length;
  const body = `    <section class="hero">
      <div class="glow"></div>
      <div class="wrap inner">
        <p class="eyebrow">plugin marketplace</p>
        <h1>haunt your second brain with <span class="accent">new tricks</span>.</h1>
        <p class="sub">community plugins that install straight into poltergeist. connect new apps, summon agents, transcribe audio, automate the boring parts — all running locally, all just markdown underneath.</p>
      </div>
    </section>

    <div class="wrap">
      <div class="toolbar">
        <div class="search">
          <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="search" id="search" placeholder="search plugins, authors, tags…" aria-label="search plugins" autocomplete="off">
        </div>
        <div class="filters" id="filters" role="group" aria-label="filter by tag">
          ${chips}
        </div>
        <span class="result-count" id="count">${n === 1 ? '1 plugin' : `${n} plugins`}</span>
      </div>

      <section class="grid" id="grid" aria-label="plugins">

${cards}

        <div class="empty" id="empty">
          <svg viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M50 6C24 6 10 24 10 50L10 94Q17 102 24 95Q31 88 38 95Q44 102 50 95Q56 88 62 95Q69 102 76 95Q83 88 90 94L90 50C90 24 76 6 50 6Z" fill="var(--ink-2)"/>
            <circle cx="38" cy="52" r="3.2" fill="var(--bg-paper)"/>
            <circle cx="62" cy="52" r="3.2" fill="var(--bg-paper)"/>
            <path d="M40 62 Q50 56 60 62" stroke="var(--bg-paper)" stroke-width="1.4" fill="none" stroke-linecap="round"/>
          </svg>
          <h3>nothing haunting the marketplace yet</h3>
          <p id="emptyMsg">no plugins match that search. try a different word, or clear the filters.</p>
        </div>

      </section>
    </div>`;
  return page('poltergeist · plugin marketplace', body, INDEX_SCRIPT);
}

const DETAIL_SCRIPT = `${STICKY_HEADER_SCRIPT}

    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const input = document.getElementById(btn.dataset.copy);
        try { await navigator.clipboard.writeText(input.value); }
        catch (e) { input.select(); document.execCommand('copy'); }
        const original = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> copied';
        setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = original; }, 1600);
      });
    });`;

export function renderDetail(p, readmeHtml) {
  const m = p.manifest;
  const repoUrl = `https://github.com/${p.entry.repo}`;
  const subdirField = p.entry.subdir
    ? `
          <p class="field-label">subdirectory</p>
          <div class="copyfield">
            <input id="subDir" type="text" readonly value="${esc(p.entry.subdir)}">
            <button data-copy="subDir" aria-label="copy subdirectory">
              ${COPY_ICON}
              copy
            </button>
          </div>
`
    : '';

  const body = `    <div class="wrap">
      <a class="back" href="../../">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
        all plugins
      </a>

      <div class="detail-head">
        <div class="icon">${icon(m.icon ?? 'puzzle')}</div>
        <div>
          <h1>${esc(m.name)} <span class="ver">v${esc(m.version)}</span></h1>
          <p class="desc">${esc(m.description ?? '')}</p>
          <div class="meta">
            <span class="author">by ${esc(p.entry.author)}</span>
            ${p.entry.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('\n            ')}
          </div>
        </div>
      </div>

      <div class="detail-body">
        <article class="readme">
${readmeHtml}
        </article>

        <aside class="install" aria-label="install panel">
          <h2>install</h2>
          <p class="step">in poltergeist: <code>Plugins → install from git</code>, then paste this repository url.</p>

          <p class="field-label">git url</p>
          <div class="copyfield">
            <input id="gitUrl" type="text" readonly value="${esc(repoUrl)}">
            <button data-copy="gitUrl" aria-label="copy git url">
              ${COPY_ICON}
              copy
            </button>
          </div>
${subdirField}
          <a class="dl-link" href="../../dl/${esc(zipName(p))}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
            download built package (.zip)
          </a>

          <a class="dl-link" href="${esc(repoUrl)}">
            ${GITHUB_ICON}
            source on github
          </a>

          <div class="trust">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/></svg>
            <span><b>trusted code only.</b> plugins run unsandboxed as trusted code — review the source before installing.</span>
          </div>
        </aside>
      </div>
    </div>`;
  return page(`${m.name.toLowerCase()} · poltergeist plugin`, body, DETAIL_SCRIPT, { depth: 2 });
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
      : '<p>no readme — see the repository for details.</p>';
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
