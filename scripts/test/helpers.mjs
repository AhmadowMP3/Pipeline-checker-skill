import http from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPTS_DIR = fileURLToPath(new URL('../', import.meta.url));
export const FIXTURE_SITE = fileURLToPath(new URL('./fixtures/site/', import.meta.url));

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };

export async function startServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }),
  };
}

export function staticHandler(dir, routes = {}) {
  return async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    const route = routes[path] ?? Object.entries(routes).find(([k]) => k.endsWith('*') && path.startsWith(k.slice(0, -1)))?.[1];
    if (route) return route(req, res);
    const file = path === '/' ? 'index.html' : extname(path) ? path.slice(1) : `${path.slice(1)}.html`;
    try {
      const body = await readFile(join(dir, file));
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<!doctype html><html lang="en"><head><title>404</title></head><body><main><h1>Not found</h1></main></body></html>');
    }
  };
}

export function runScript(name, args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [join(SCRIPTS_DIR, name), ...args], { timeout: 240000 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr });
    });
  });
}

export function tempDir() {
  return mkdtempSync(join(tmpdir(), 'pc-'));
}

export function fixtureServer() {
  const serveFile = (file) => (req, res) => staticHandler(FIXTURE_SITE)(Object.assign(req, { url: file }), res);
  return startServer(staticHandler(FIXTURE_SITE, {
    '/api/fail': (req, res) => { res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"error":"db down"}'); },
    '/private': (req, res) => { res.writeHead(302, { location: '/login' }); res.end(); },
    '/challenge': (req, res) => {
      res.writeHead(403, { 'content-type': 'text/html' });
      res.end('<!doctype html><html lang="en"><head><title>Just a moment...</title></head><body><main>Checking your browser before accessing.</main></body></html>');
    },
    '/api/me': (req, res) => { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{}'); },
    '/denied': (req, res) => {
      res.writeHead(403, { 'content-type': 'text/html' });
      res.end('<!doctype html><html lang="en"><head><title>Forbidden</title></head><body><main><h1>Access denied</h1></main></body></html>');
    },
    '/guarded.pdf': (req, res) => { res.writeHead(403); res.end(); },
    '/session': (req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const ok = new URLSearchParams(body).get('password') === 'pw-test-123';
        res.writeHead(302, ok ? { 'set-cookie': 'sid=ok; Path=/', location: '/dashboard' } : { location: '/login' });
        res.end();
      });
    },
    '/api/js-session': (req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => setTimeout(() => {
        const ok = new URLSearchParams(body).get('password') === 'pw-test-123';
        res.writeHead(ok ? 200 : 401, ok ? { 'set-cookie': 'sid=ok; Path=/' } : {});
        res.end();
      }, 700));
    },
    '/dashboard': (req, res) => {
      if (!/sid=ok/.test(req.headers.cookie ?? '')) { res.writeHead(302, { location: '/login' }); return res.end(); }
      return serveFile('/dashboard.html')(req, res);
    },
    '/n/*': (req, res) => {
      const k = Number(req.url.split('/')[2]);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><html lang="en"><head><title>N${k}</title></head><body><main><a href="/n/${k + 1}">next</a></main></body></html>`);
    },
  }));
}
