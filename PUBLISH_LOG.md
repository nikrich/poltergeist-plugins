# Publish Log

- seance 0.7.0 (2026-07-13) — ships the REQ-SEANCE-5 autonomy-settings feature
  (nikrich/seance PRs #23/#24) to installed users. Trigger: push to
  `poltergeist-plugins` main → `publish.yml` rebuilds `registry.json` from the
  live `poltergeist-plugin/manifest.json` (ref: main) and redeploys via
  `wrangler deploy`.
- seance 0.6.0 — republish to surface REQ-SEANCE-3 dashboard
