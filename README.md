# poltergeist-plugins

The [Poltergeist](https://getpoltergeist.com) plugin registry. Every plugin listed
here is built and published to the marketplace at
**https://market.getpoltergeist.com/**.

## How it works

- A plugin lives in **its own git repo** (or a subdirectory of one), following the
  [Poltergeist plugin format](CONTRIBUTING.md#plugin-format): a `manifest.json`
  plus pre-built `dist/` entries.
- To list a plugin, you PR **one JSON entry file** into `plugins/` here — see
  [CONTRIBUTING.md](CONTRIBUTING.md).
- CI clones your repo, validates the manifest, and builds the plugin on every PR.
- On merge to `main`, the pipeline rebuilds every plugin, packages downloadable
  zips, regenerates `registry.json`, and deploys the marketplace site.

## Repo layout

```
plugins/<id>.json        one registry entry per plugin (this is what a PR adds)
scripts/lib.mjs          entry + manifest validation, clone/build helpers
scripts/validate.mjs     PR gate — validates entries end-to-end
scripts/build-site.mjs   builds site/ (pages, dl/*.zip, registry.json)
site-src/                static shell (styles, logo)
```

## Local development

```
npm ci
npm test           # unit tests
npm run validate   # validate all entries (clones + builds each plugin)
npm run build      # full site build into site/
```

## Deployment

`publish.yml` deploys `site/` to the Cloudflare Pages project `poltergeist-market`
(custom domain `market.getpoltergeist.com`). It needs two repo secrets:

- `CLOUDFLARE_API_TOKEN` — a token with *Cloudflare Pages: Edit* on the account
- `CLOUDFLARE_ACCOUNT_ID`

Without the secrets the workflow still validates and builds; only the deploy step
is skipped.
