import { build } from 'esbuild';

// Renderer: ESM for the app's dynamic import via plugin://
await build({
  entryPoints: ['src/renderer.mjs'],
  outfile: 'dist/renderer.mjs',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  minify: true,
  logLevel: 'info',
});

// Main: CommonJS for require() in the Electron main process
await build({
  entryPoints: ['src/main.cjs'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  minify: true,
  logLevel: 'info',
});
