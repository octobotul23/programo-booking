import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

export default defineConfig({
  root: path.join(ROOT, 'client'),
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    // dev server: also answer on Tailscale MagicDNS names (e.g. pc-name.tailnet.ts.net) for testing from a phone
    allowedHosts: ['.ts.net'],
    // The dev server hands out any file it is allowed to read (/@fs/...), and by default that is the whole
    // project folder, data/app.db and data/.secret included. Only the app's own code and its packages, then;
    // the deny list (which replaces Vite's own, so it repeats it) also covers a database or key put anywhere else.
    fs: {
      allow: [path.join(ROOT, 'client'), path.join(ROOT, 'node_modules')],
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.secret', '**/*.db', '**/*.db-*', '**/*.{jks,keystore,p12,key}'],
    },
  },
  build: {
    outDir: path.join(ROOT, 'dist'),
    emptyOutDir: true,
  },
});
