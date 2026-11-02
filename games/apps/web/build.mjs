import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const webDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const configuredApi = process.env.GAMES_API_URL;

if (!configuredApi) {
  throw new Error('Set GAMES_API_URL to the HTTPS origin of the game Worker before building the static app.');
}

const apiUrl = new URL(configuredApi);
if (apiUrl.protocol !== 'https:' || apiUrl.pathname !== '/' || apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash) {
  throw new Error('GAMES_API_URL must be an HTTPS URL without credentials, query, or fragment.');
}

const apiOrigin = apiUrl.origin;
const socketOrigin = new URL(apiOrigin);
socketOrigin.protocol = 'wss:';

await build({
  configFile: resolve(webDir, 'vite.config.js'),
  root: webDir,
  mode: 'production',
});

const outputDir = resolve(webDir, 'dist');
const indexPath = resolve(outputDir, 'index.html');
const html = await readFile(indexPath, 'utf8');
const deployedHtml = html.replace(
  /<meta name="games-api" content="\/api"\s*\/?\s*>/,
  `<meta name="games-api" content="${apiOrigin}" />`,
);
if (deployedHtml === html) throw new Error('Could not replace the local API URL in the built HTML.');
await writeFile(indexPath, deployedHtml);

const headers = [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  X-Frame-Options: DENY',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  `  Content-Security-Policy: default-src 'self'; base-uri 'none'; connect-src 'self' ${apiOrigin} ${socketOrigin.origin}; font-src 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'`,
  '  Cache-Control: no-cache',
  '',
].join('\n');

await mkdir(outputDir, { recursive: true });
await mkdir(resolve(outputDir, 'assets'), { recursive: true });
await copyFile(
  resolve(webDir, 'assets/CabinetGrotesk-LICENSE.txt'),
  resolve(outputDir, 'assets/CabinetGrotesk-LICENSE.txt'),
);
await writeFile(resolve(outputDir, '_headers'), headers);
console.log(`Static React app built at ${outputDir} for ${apiOrigin}`);
