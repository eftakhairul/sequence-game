import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

/** Serves the built web app with an SPA fallback to index.html. Returns false if not handled. */
export function createStaticHandler(root: string) {
  const absRoot = resolve(root);
  const indexPath = join(absRoot, 'index.html');

  const send = (req: IncomingMessage, res: ServerResponse, file: string, cache: string) => {
    const st = statSync(file);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': cache,
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  };

  return (req: IncomingMessage, res: ServerResponse): boolean => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      res.writeHead(400).end();
      return true;
    }
    const filePath = normalize(join(absRoot, pathname));
    if (filePath !== absRoot && !filePath.startsWith(absRoot + sep)) {
      res.writeHead(403).end();
      return true;
    }
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      const immutable = pathname.startsWith('/assets/');
      send(req, res, filePath, immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      return true;
    }
    // Paths with an extension that do not exist are real 404s; everything else is a client route.
    if (extname(pathname) !== '' || !existsSync(indexPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return true;
    }
    send(req, res, indexPath, 'no-cache');
    return true;
  };
}
