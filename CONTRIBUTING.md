# Submitting a plugin

A plugin is listed on the marketplace by adding **one file** to this repo:
`plugins/<id>.json`. Open a PR with that file; CI validates and builds your
plugin, and once merged it appears at https://market.getpoltergeist.com/.

## Entry format (`plugins/<id>.json`)

```json
{
  "id": "my-plugin",
  "repo": "you/my-poltergeist-plugin",
  "subdir": "",
  "ref": "main",
  "author": "you",
  "tags": ["example"]
}
```

| field    | rules |
|----------|-------|
| `id`     | `^[a-z][a-z0-9-]{1,31}$` — must match the filename **and** the `id` in your `manifest.json` |
| `repo`   | GitHub `owner/name`; cloned as `https://github.com/owner/name.git` |
| `subdir` | path inside the repo containing the plugin; `""` for the repo root |
| `ref`    | branch or tag to build from — a tag is recommended so listings are stable |
| `author` | display name on the marketplace |
| `tags`   | up to 8 lowercase tags (`^[a-z][a-z0-9-]*$`) |

## Plugin format

Your repo (at `subdir`) must contain:

```
manifest.json      # see below
dist/              # pre-built, committed entry files
README.md          # rendered on your marketplace page
```

`manifest.json` follows the Poltergeist plugin manifest v1:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "description": "One line about what it does",
  "apiVersion": 1,
  "icon": "puzzle",
  "entry": { "main": "dist/main.cjs", "renderer": "dist/renderer.mjs" }
}
```

- `apiVersion` must be `1`.
- `entry.main` (`*.cjs`, Electron main process) and `entry.renderer` (`*.mjs`,
  mounted in the app renderer) are each optional, but at least one is required.
- `icon` is a [lucide](https://lucide.dev) icon name.
- **`dist/` must be committed.** The app installs plugins with
  `git clone` and never runs build scripts. CI additionally runs your `build`
  script (if `package.json` has one) to prove the plugin builds from source.

## Review checklist

PRs are reviewed for:

1. CI green — entry schema, manifest schema, clone, build, and entry files all check out.
2. The plugin does what its description says (reviewers may install it).
3. No obviously malicious or deceptive behavior. Plugins run **unsandboxed** as
   trusted code in the Poltergeist app; review here is a courtesy filter, and
   users are told to install only plugins they trust.

## Updating your plugin

Bump `version` in your manifest and (if you pin a tag) PR a `ref` change here.
Entries pointing at `main` pick up your latest commit on the next publish.
