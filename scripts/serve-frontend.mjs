import { hasFingerprintAssetSegment } from './linear-string.mjs';
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

function decodeRoutePath(pathname) {
  let decoded = pathname;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (next === decoded) return decoded;
    decoded = next;
  }
  try {
    return decodeURIComponent(decoded) === decoded ? decoded : null;
  } catch {
    return null;
  }
}

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

export function isInsideRoot(root, candidate) {
  const normalizedRoot = path.resolve(root);
  const normalizedCandidate = path.resolve(candidate);
  const boundary = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : normalizedRoot + path.sep;
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(boundary);
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
  if (/^\/assets\//.test(pathname) && hasFingerprintAssetSegment(path.basename(filePath))) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=300';
}

const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://glorifier.pages.dev https://glorifier.glorifier.workers.dev https://glorifier-neural.glorifier.workers.dev https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://api.x.ai https://api.mistral.ai https://api.deepseek.com https://integrate.api.nvidia.com https://api.groq.com https://openrouter.ai https://router.huggingface.co https://api.llmsrelay.com https://api.together.xyz https://api.fireworks.ai https://dashscope.aliyuncs.com https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://merchant-center-1660617751955.firebaseapp.com https://*.auth0.com; frame-src 'self' https://accounts.google.com https://merchant-center-1660617751955.firebaseapp.com https://firebaseapp.com https://*.firebaseapp.com https://*.web.app https://*.auth0.com; form-action 'self' https://accounts.google.com https://*.auth0.com; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests";

export function createFrontendServer(options = {}) {
  const configuredRoot = options.root || process.env.FRONTEND_DIST_DIR || DEFAULT_ROOT;
  const root = path.resolve(configuredRoot);

  return createServer(async (request, response) => {
    try {
      const requestTarget = request.url || '/';
      let pathname;
      try {
        if (requestTarget.startsWith('//')) {
          // Preserve a protocol-relative origin-form target as a path. Passing it
          // directly to URL() would reinterpret the first segment as a hostname.
          pathname = requestTarget.split(/[?#]/, 1)[0];
        } else {
          pathname = new URL(requestTarget, 'http://localhost').pathname;
        }
      } catch {
        sendJson(response, 400, { ok: false, code: 'INVALID_REQUEST_URL' });
        return;
      }

      const routePath = decodeRoutePath(pathname);
      if (routePath === null) {
        sendJson(response, 400, { ok: false, code: 'INVALID_PATH_ENCODING' });
        return;
      }
      const normalizedRoutePath = '/' + routePath.replace(/^\/+/, '');
      if (RESERVED_RUNTIME_PATH.test(normalizedRoutePath.toLowerCase())) {
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

      if (normalizedRoutePath === '/healthz') {
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
      let resolved = await resolveStaticFile(rootRealPath, normalizedRoutePath);
      if (resolved.status === 400 || resolved.status === 403) {
        sendJson(response, resolved.status, { ok: false, code: resolved.error });
        return;
      }

      if (resolved.status === 404 &&
          path.extname(normalizedRoutePath) === '' &&
          !normalizedRoutePath.startsWith('/assets/')) {
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
        ...(extension === '.html' ? {
          'Content-Length': String(resolved.metadata.size),
          'Content-Security-Policy': CONTENT_SECURITY_POLICY,
        } : {}),
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
        }));
        response.end(html);
        return;
      }

      // Streamed asset bodies omit Content-Length so an asset changed after stat()
      // cannot leave a stale advertised size and a truncated/hanging client response.
      response.writeHead(200, headers);
      const stream = (options.createReadStream || createReadStream)(resolved.filePath);
      response.on('close', () => {
        if (!response.writableEnded) stream.destroy();
      });
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
    const shutdown = (signal) => {
      process.stdout.write('Received ' + signal + '; closing static frontend server.\n');
      const forceClose = setTimeout(() => server.closeAllConnections(), 5000);
      forceClose.unref();
      server.close((error) => {
        clearTimeout(forceClose);
        if (error) {
          process.stderr.write('Static frontend shutdown failed: ' + error.message + '\n');
          process.exitCode = 1;
        }
      });
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  }
}
