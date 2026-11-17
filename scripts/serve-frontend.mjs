import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.otf', 'font/otf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

const RESERVED_RUNTIME_PATH = /^(?:\/api(?:\/|$)|\/auth(?:\/|$)|\/mcp(?:\/|$)|\/\.well-known(?:\/|$))/;

function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    ...extra,
  };
}

function sendJson(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(status, securityHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(payload.byteLength),
    'Cache-Control': 'no-store',
  }));
  response.end(payload);
}

function isInsideRoot(root, candidate) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

async function resolveStaticFile(root, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return { error: 'INVALID_PATH_ENCODING', status: 400 };
  }

  if (decodedPath.includes('\0') || decodedPath.includes('\\')) {
    return { error: 'INVALID_PATH', status: 400 };
  }

  const relativePath = decodedPath.replace(/^\/+/, '');
  let candidate = path.resolve(root, relativePath || 'index.html');
  if (!isInsideRoot(root, candidate)) {
    return { error: 'PATH_TRAVERSAL_DENIED', status: 403 };
  }

  try {
    let realCandidate = await realpath(candidate);
    if (!isInsideRoot(root, realCandidate)) {
      return { error: 'PATH_TRAVERSAL_DENIED', status: 403 };
    }

    let metadata = await stat(realCandidate);
    if (metadata.isDirectory()) {
      candidate = path.join(realCandidate, 'index.html');
      if (!isInsideRoot(root, candidate)) {
        return { error: 'PATH_TRAVERSAL_DENIED', status: 403 };
      }
      realCandidate = await realpath(candidate);
      if (!isInsideRoot(root, realCandidate)) {
        return { error: 'PATH_TRAVERSAL_DENIED', status: 403 };
      }
      metadata = await stat(realCandidate);
    }

    if (!metadata.isFile()) return { error: 'STATIC_ASSET_NOT_FOUND', status: 404 };
    return { filePath: realCandidate, metadata };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error &&
        ['ENOENT', 'ENOTDIR', 'EACCES', 'ELOOP'].includes(error.code)) {
      return { error: 'STATIC_ASSET_NOT_FOUND', status: 404 };
    }
    throw error;
  }
}

function cacheControlFor(pathname, filePath) {
  if (path.basename(filePath) === 'index.html') return 'no-store';
  if (/^\/assets\//.test(pathname) && /[.-][a-zA-Z0-9_-]{8,}\./.test(path.basename(filePath))) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=300';
}

const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-src 'self' https://accounts.google.com https://firebaseapp.com https://*.firebaseapp.com https://*.web.app https://*.auth0.com; form-action 'self' https://accounts.google.com https://*.auth0.com; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests";

export function createFrontendServer(options = {}) {
  const configuredRoot = options.root || process.env.FRONTEND_DIST_DIR || DEFAULT_ROOT;
  const root = path.resolve(configuredRoot);

  return createServer(async (request, response) => {
    try {
      let requestUrl;
      try {
        requestUrl = new URL(request.url || '/', 'http://localhost');
      } catch {
        sendJson(response, 400, { ok: false, code: 'INVALID_REQUEST_URL' });
        return;
      }

      const pathname = requestUrl.pathname;
      if (RESERVED_RUNTIME_PATH.test(pathname)) {
        sendJson(response, 503, {
          ok: false,
          status: 'unavailable',
          code: 'BACKEND_NOT_CONFIGURED',
          error: 'This static frontend container does not host the GLORIFIER API or authentication runtime.',
        });
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, securityHeaders({
          Allow: 'GET, HEAD',
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        }));
        response.end(JSON.stringify({ ok: false, code: 'METHOD_NOT_ALLOWED' }));
        return;
      }

      if (pathname === '/healthz') {
        try {
          const rootRealPath = await realpath(root);
          const entry = await resolveStaticFile(rootRealPath, '/');
          if (!entry.filePath) {
            sendJson(response, 503, {
              ok: false,
              service: 'glorifier-static-frontend',
              status: 'static-assets-unavailable',
              code: 'FRONTEND_ASSETS_NOT_READY',
              backend: 'not-probed',
            });
            return;
          }
        } catch {
          sendJson(response, 503, {
            ok: false,
            service: 'glorifier-static-frontend',
            status: 'static-assets-unavailable',
            code: 'FRONTEND_ASSETS_NOT_READY',
            backend: 'not-probed',
          });
          return;
        }
        sendJson(response, 200, {
          ok: true,
          service: 'glorifier-static-frontend',
          status: 'static-assets-ready',
          backend: 'not-probed',
        });
        return;
      }

      const rootRealPath = await realpath(root);
      let resolved = await resolveStaticFile(rootRealPath, pathname);
      if (resolved.status === 400 || resolved.status === 403) {
        sendJson(response, resolved.status, { ok: false, code: resolved.error });
        return;
      }

      if (resolved.status === 404 &&
          path.extname(pathname) === '' &&
          !pathname.startsWith('/assets/')) {
        resolved = await resolveStaticFile(rootRealPath, '/index.html');
      }

      if (resolved.status === 404 || !resolved.filePath) {
        sendJson(response, 404, { ok: false, code: 'STATIC_ASSET_NOT_FOUND' });
        return;
      }

      const extension = path.extname(resolved.filePath).toLowerCase();
      const headers = securityHeaders({
        'Content-Type': MIME_TYPES.get(extension) || 'application/octet-stream',
        'Cache-Control': cacheControlFor(pathname, resolved.filePath),
      });

      if (request.method === 'HEAD') {
        response.writeHead(200, headers);
        response.end();
        return;
      }

      if (extension === '.html') {
        const html = await readFile(resolved.filePath);
        response.writeHead(200, securityHeaders({
          ...headers,
          'Content-Length': String(html.byteLength),
          'Content-Security-Policy': CONTENT_SECURITY_POLICY,
        }));
        response.end(html);
        return;
      }

      // Streamed asset bodies omit Content-Length so an asset changed after stat()
      // cannot leave a stale advertised size and a truncated/hanging client response.
      response.writeHead(200, headers);
      const stream = createReadStream(resolved.filePath);
      stream.on('error', () => {
        if (!response.headersSent) sendJson(response, 500, { ok: false, code: 'STATIC_ASSET_READ_FAILED' });
        else response.destroy();
      });
      stream.pipe(response);
    } catch {
      if (!response.headersSent) {
        sendJson(response, 500, { ok: false, code: 'STATIC_FRONTEND_INTERNAL_ERROR' });
      } else {
        response.destroy();
      }
    }
  });
}

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    process.stderr.write('PORT must be an integer between 1 and 65535.\n');
    process.exitCode = 1;
  } else {
    const server = createFrontendServer();
    server.listen(port, '0.0.0.0', () => {
      process.stdout.write('GLORIFIER static frontend listening on port ' + port + '.\n');
    });
  }
}
