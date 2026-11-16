// Builds the static site into dist/.
//   node scripts/build.mjs          production build
//   node scripts/build.mjs --serve  rebuild on change and serve on :8000
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const serve = process.argv.includes('--serve');

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

function finish(result) {
  const js = readFileSync(join(dist, 'app.js'));
  const css = readFileSync(join(dist, 'app.css'));
  const worker = readFileSync(join(dist, 'events-worker.js'));
  const hash = createHash('sha256').update(js).update(css).update(worker).digest('hex').slice(0, 10);
  let html = readFileSync(join(root, 'public', 'index.html'), 'utf8');
  html = html.replaceAll('__BUILD__', hash);
  writeFileSync(join(dist, 'index.html'), html);
  // The service worker precaches every file in the build, keyed by this hash.
  const files = listFiles(dist)
    .map((p) => relative(dist, p))
    .filter((p) => !p.endsWith('.map') && p !== 'sw.js')
    .map((p) => (p === 'index.html' ? './' : './' + p.split('\\').join('/')));
  let sw = readFileSync(join(root, 'public', 'sw.js'), 'utf8');
  sw = sw.replace('__BUILD__', hash).replace('__FILES__', JSON.stringify(files));
  writeFileSync(join(dist, 'sw.js'), sw);
  writeFileSync(join(dist, 'version.json'), JSON.stringify({ build: hash, time: new Date().toISOString() }));
  if (result?.metafile) {
    const bytes = result.metafile.outputs[Object.keys(result.metafile.outputs).find((k) => k.endsWith('app.js'))].bytes;
    console.log(`built ${hash}: app.js ${(bytes / 1024).toFixed(0)} KB, ${files.length} files`);
  }
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'public'), dist, { recursive: true });

const options = {
  entryPoints: {
    app: join(root, 'src', 'main.ts'),
    // The calendar-event search runs in a Web Worker (see src/sim/events.ts).
    'events-worker': join(root, 'src', 'sim', 'events.worker.ts'),
  },
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outdir: dist,
  minify: !serve,
  sourcemap: true,
  metafile: true,
  loader: { '.glsl': 'text', '.css': 'css' },
  define: { __DEV__: serve ? 'true' : 'false' },
  logLevel: 'warning',
};

if (serve) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [{ name: 'finish', setup(b) { b.onEnd((r) => { if (!r.errors.length) finish(r); }); } }],
  });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: dist, port: 8000, host: '0.0.0.0' });
  console.log(`serving on http://localhost:${port}`);
} else {
  const result = await esbuild.build(options);
  finish(result);
}
