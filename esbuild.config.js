const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  platform: 'node',
  target: 'node16',
  external: ['vscode'],
}).catch(() => process.exit(1));
