// Packs the web build (dist/) as a prebuilt Vercel deployment in <repo>/.vercel/output, so
// `vercel deploy --prebuilt` serves exactly this site, whatever folder the Vercel project is
// linked to. Run after `npm run build:web:prod`; `npm run web:deploy` does both.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(app, '..', '..', '.vercel', 'output');

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(join(app, 'dist'), join(output, 'static'), { recursive: true });

// Every path that isn't a file gets index.html, so deep links and refreshes open the app. Kept
// out of search results.
const config = {
  version: 3,
  routes: [
    {
      src: '/(.*)',
      headers: { 'X-Robots-Tag': 'noindex', 'X-Content-Type-Options': 'nosniff' },
      continue: true,
    },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' },
  ],
};
writeFileSync(join(output, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
console.log(`Packed dist/ into ${output}`);
