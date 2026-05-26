// Capture a PNG of each sketch with headless Chromium (via Playwright) and
// reveal the images in the README. Run from the repo root: `node scripts/screenshot.mjs`.
// The sketches load p5 from a CDN and render with WebGL, so this needs network
// access and a SwiftShader-capable Chromium (provided by `playwright install`).

import { chromium } from 'playwright';
import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const ROOT = process.cwd();
const PORT = 8000;
const OUT_DIR = join(ROOT, 'docs', 'screenshots');

const SKETCHES = [
  { name: 'rotating-sphere',  path: '/rotating-sphere-v2/' },
  { name: 'fluid-simulation', path: '/fluid-simulation/' },
  { name: 'accretion',        path: '/accretion/' },
];

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.css':  'text/css',
  '.glsl': 'text/plain',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (urlPath.endsWith('/')) urlPath += 'index.html';
        const filePath = normalize(join(ROOT, urlPath));
        if (!filePath.startsWith(ROOT) || !existsSync(filePath)) {
          res.writeHead(404); res.end('not found'); return;
        }
        const body = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
        res.end(body);
      } catch (err) {
        res.writeHead(500); res.end(String(err));
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

// Sweep the cursor across the canvas so interactive sketches (the fluid
// solver) have some motion in frame before we capture.
async function stir(page, w, h) {
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = w * (0.2 + 0.6 * t);
    const y = h * (0.5 + 0.28 * Math.sin(t * Math.PI * 3));
    await page.mouse.move(x, y, { steps: 3 });
  }
}

async function main() {
  const width = 1280, height = 720;
  await mkdir(OUT_DIR, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width, height } });

  for (const s of SKETCHES) {
    const url = `http://localhost:${PORT}${s.path}`;
    console.log(`Capturing ${s.name} <- ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('canvas', { timeout: 60000 });
    await page.waitForTimeout(1500);
    await stir(page, width, height);
    await page.waitForTimeout(2000);
    await page.locator('canvas').first().screenshot({ path: join(OUT_DIR, `${s.name}.png`) });
  }

  await browser.close();
  server.close();

  // Reveal the screenshots in the README: drop the instruction comments and
  // uncomment the image tags (idempotent — a no-op once already revealed).
  const readmePath = join(ROOT, 'README.md');
  const before = await readFile(readmePath, 'utf8');
  const after = before
    .replace(/^[ \t]*<!-- Screenshot:.*-->\n/gm, '')
    .replace(/<!--\s*(!\[[^\]]*\]\(docs\/screenshots\/[^)]+\))\s*-->/g, '$1');
  if (after !== before) await writeFile(readmePath, after);
  console.log('Done.');
}

main().catch((err) => { console.error(err); process.exit(1); });
