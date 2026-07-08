---
name: poltergeist-plugin-dev
description: Use when building, testing, or publishing a plugin for Poltergeist (the getpoltergeist.com second-brain desktop app) — creating a manifest.json, main.cjs/renderer.mjs entries, installing from folder/git, or submitting to the marketplace at market.getpoltergeist.com.
---

# Building Poltergeist Plugins

## Overview

A Poltergeist plugin is a directory: a `manifest.json` plus **pre-built** entry
files in `dist/`. The app installs by copying (folder) or `git clone` (repo) —
it never runs npm or build scripts, so `dist/` must be committed. Plugins are
trusted code: `main.cjs` runs unsandboxed in the Electron main process,
`renderer.mjs` runs in the app's renderer.

A complete working scaffold is in [template/](template/) — copy it and rename.
Verify any plugin you build against the manifest rules below before installing.

## Plugin anatomy

```
my-plugin/
  manifest.json      # contract below — invalid manifest = plugin never loads
  dist/main.cjs      # optional: main-process entry (CommonJS)
  dist/renderer.mjs  # optional: renderer entry (ESM) — at least one entry required
  src/ build.mjs package.json   # yours; the app ignores everything but manifest + dist
  README.md          # rendered on your marketplace page
```

`manifest.json` (all rules enforced by zod in the app and by marketplace CI):

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "description": "One line, max 500 chars (optional)",
  "apiVersion": 1,
  "icon": "puzzle",
  "entry": { "main": "dist/main.cjs", "renderer": "dist/renderer.mjs" }
}
```

| field | rule |
|-------|------|
| `id` | `^[a-z][a-z0-9-]{1,31}$` — also the install dir name |
| `name` | 1–64 chars |
| `version` | non-empty string (semver by convention) |
| `apiVersion` | literally `1` — anything else is refused |
| `icon` | optional [lucide](https://lucide.dev) name, `^[a-z0-9-]+$`; sidebar falls back to `puzzle` |
| `entry.main` | optional, must match `*.cjs` |
| `entry.renderer` | optional, must match `*.mjs`; at least one entry required |

## Main entry — `dist/main.cjs`

CommonJS, loaded with `require()` in the Electron main process:

```js
module.exports = {
  activate(ctx) { /* register handlers, start watchers */ },
  deactivate() { /* clear intervals/watchers — called on disable, uninstall, reload, quit */ },
};
```

`ctx` (PluginContext):

| member | behavior |
|--------|----------|
| `pluginId`, `pluginDir` | your id; read-only install dir |
| `dataDir` | `<userData>/plugin-data/<id>/` — put mutable state here; survives uninstall |
| `settings.get(key)` / `.set(key, v)` | per-plugin persisted settings |
| `ipc.handle(channel, fn)` | channel must match `^[a-z0-9:_-]+$`, registered once; becomes `gb:plugin:<id>:<channel>` |
| `ipc.send(channel, payload)` | push an event to all app windows |
| `api.fetch(method, path, body?)` | authenticated call into the Poltergeist backend API |
| `log(...args)` | main log, prefixed `[plugin:<id>]` |

Error semantics: a throw in `activate` marks the plugin `errored` (handlers
removed, sidebar entry dropped — app keeps running). A throw inside an
`ipc.handle` callback rejects only that call; validate inputs and throw freely.

## Renderer entry — `dist/renderer.mjs`

ESM, dynamically imported via the `plugin://` protocol. Framework-free
contract — you own the DOM under `el` and bundle any framework yourself:

```js
export function mount(el, api) {
  // build your UI inside el (a full-height scroll container)
  return () => { /* unmount: remove listeners, clear timers */ };
}
```

`api` (PluginApi): `pluginId`; `ipc.invoke(channel, ...args)` /
`ipc.on(channel, cb) → off()` (same channels you registered in main);
`settings.get/set` (async); `api.fetch(method, path, body?)`;
`openExternal(url)`; `theme` — the app's CSS custom properties for visual
blending: `--paper --vellum --fog --hairline --hairline-2 --ink-0 --ink-1
--ink-2 --neon --moss --oxblood`. Style with `api.theme` values (plus
fallbacks) instead of hard-coding colors.

## Runtime notes

- `ipc.send` events are fire-and-forget: delivered only while a renderer is
  mounted and subscribed, never queued. Pattern: pull current state with
  `invoke` on mount, then apply pushed events (the template models this).
- A throw inside an `ipc.handle` callback surfaces in the renderer as a
  rejected promise carrying the error message.
- Everything crossing ipc must be structured-cloneable (plain JSON-ish data —
  no functions, class instances, or DOM nodes).
- `settings` values are persisted as JSON — keep them JSON-serializable.
- `api.theme` is a snapshot taken at mount, not reactive.
- `main.cjs` has full Node and Electron access (`require('electron')` works —
  e.g. `Notification` for system alerts). With that power: keep timers keyed
  to deadline timestamps rather than counting `setInterval` ticks, and clean
  everything up in `deactivate`.

## Build — commit dist/

Bundle with esbuild (see [template/build.mjs](template/build.mjs)); React etc.
gets bundled INTO `dist/renderer.mjs`. Keep `platform: 'browser'` +
`format: 'esm'` for the renderer, `platform: 'node'` + `format: 'cjs'` for
main. Run the build and **commit `dist/`** — installs clone your repo as-is.

## Test loop

1. Poltergeist → **Plugins → install from folder** (pick your plugin dir).
2. Iterate: rebuild → copy or reinstall → **reload** button on the Plugins
   screen (full deactivate/rescan/reactivate).
3. States on the Plugins screen: `enabled / disabled / errored (msg) /
   invalid (manifest problem)` — an errored plugin shows the thrown message.

## Publish to the marketplace

Push your plugin repo to GitHub (dist committed, README present), then PR one
file to [nikrich/poltergeist-plugins](https://github.com/nikrich/poltergeist-plugins) —
`plugins/<id>.json`:

```json
{ "id": "my-plugin", "repo": "you/my-plugin", "subdir": "", "ref": "main",
  "author": "you", "tags": ["example"] }
```

`id` must equal the filename and your manifest id; `subdir` is where the plugin
lives inside the repo (`""` = root); tags ≤8, `^[a-z][a-z0-9-]*$`. CI clones
your repo, validates the manifest, checks committed dist, and runs your build.
On merge you're live at `https://market.getpoltergeist.com/plugins/<id>/`.

## Common mistakes

- `dist/` gitignored → CI fails, git installs broken. Commit it.
- `entry.main` as `.js`/`.mjs` or renderer as `.cjs` → manifest invalid.
- Registering an ipc channel with uppercase or dots → rejected at activate.
- Forgetting to return an unmount function → stale DOM/timers after navigate.
- Writing files into `pluginDir` → use `dataDir`; the install dir is replaced
  on update.
- Assuming the app builds your plugin at install → it never does.
