import { constants, realpathSync, statSync } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

// Keep this list aligned with app/ routes. Unknown API and asset URLs must remain 404s.
const appRoutes = new Set([
  '/', '/assist', '/communicate', '/profile', '/(tabs)', '/(tabs)/assist',
  '/(tabs)/communicate', '/(tabs)/profile', '/contact-qr', '/conversation',
  '/emergency-settings', '/emergency', '/history', '/onboarding', '/partner',
  '/passport-settings', '/passport', '/quick-speak', '/settings', '/sign-assistant',
  '/speech-setup', '/transcription', '/vision', '/demo',
]);
const mediaTypes = new Map([
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.avif', 'image/avif'],
  ['.svg', 'image/svg+xml'], ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.ttf', 'font/ttf'], ['.otf', 'font/otf'],
  ['.mp3', 'audio/mpeg'], ['.wav', 'audio/wav'], ['.ogg', 'audio/ogg'],
  ['.m4a', 'audio/mp4'], ['.mp4', 'video/mp4'], ['.webm', 'video/webm'],
]);

function staticType(file) {
  if (file === '/index.html') return 'text/html; charset=utf-8';
  if (file === '/favicon.ico') return 'image/x-icon';
  const extension = path.posix.extname(file);
  if (file.startsWith('/_expo/static/')) {
    if (extension === '.js') return 'text/javascript; charset=utf-8';
    if (extension === '.css') return 'text/css; charset=utf-8';
  }
  if (file.startsWith('/assets/')) return mediaTypes.get(extension);
}

function requestPath(url) {
  // Decode before checking components; URL() would silently normalize traversal.
  let decoded;
  try { decoded = decodeURIComponent((url ?? '').split('?')[0]); } catch { return null; }
  if (!decoded.startsWith('/') || /[\\%#\x00-\x1f\x7f]/.test(decoded) || decoded.includes('//')) return null;
  if (decoded.split('/').some(part => part.startsWith('.') || part.includes(':'))) return null;
  return decoded;
}

function within(root, file) {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

export function createStaticWebHandler(root) {
  // Capture one canonical directory for this server's lifetime, never a request-selected root.
  let webRoot;
  try {
    webRoot = realpathSync(root);
    if (!statSync(webRoot).isDirectory()) throw new Error();
    const index = realpathSync(path.join(webRoot, 'index.html'));
    if (!within(webRoot, index) || !statSync(index).isFile()) throw new Error();
  } catch { throw new Error('WEB_ROOT must contain an exported web index.html.'); }

  return async function serveStaticWeb(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const requested = requestPath(req.url);
    if (!requested) return false;
    const route = requested === '/' ? '/' : requested.replace(/\/$/, '');
    const file = appRoutes.has(route) ? '/index.html' : requested;
    const contentType = staticType(file);
    if (!contentType) return false;

    let handle;
    try {
      const canonical = await realpath(path.join(webRoot, file.slice(1)));
      if (!within(webRoot, canonical)) return false;
      // Also reject symlinks to private files even if they stay inside the web root.
      const canonicalFile = '/' + path.relative(webRoot, canonical).split(path.sep).join('/');
      if (!requestPath(canonicalFile) || staticType(canonicalFile) !== contentType) return false;
      handle = await open(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const info = await handle.stat();
      if (!info.isFile()) { await handle.close(); return false; }
      const immutable = file !== '/index.html' && /[.-][a-f\d]{16,}\./i.test(path.basename(file));
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': info.size,
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
        'Permissions-Policy': 'camera=(self), microphone=(self)',
      });
      if (req.method === 'HEAD') { await handle.close(); res.end(); }
      else await pipeline(handle.createReadStream(), res);
      return true;
    } catch {
      await handle?.close().catch(() => {});
      if (res.headersSent) { if (!res.destroyed) res.destroy(); return true; }
      return false;
    }
  };
}
