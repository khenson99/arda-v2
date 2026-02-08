import type { Express } from 'express';
import { createProxyMiddleware, type Options } from 'http-proxy-middleware';
import { serviceUrls } from '@arda/config';
import { authMiddleware } from '@arda/auth-utils';

// ─── Service Route Map ────────────────────────────────────────────────
// Maps URL prefixes to upstream services.
// Auth routes are unprotected (they handle their own auth).
// All other routes require a valid JWT.

interface RouteConfig {
  prefix: string;
  target: string;
  pathRewrite: Record<string, string>;
  requiresAuth: boolean;
}

const routes: RouteConfig[] = [
  {
    prefix: '/api/auth',
    target: serviceUrls.auth,
    pathRewrite: { '^/api/auth': '/auth' },
    requiresAuth: false,
  },
  {
    prefix: '/api/tenants',
    target: serviceUrls.auth,
    pathRewrite: { '^/api/tenants': '/tenants' },
    requiresAuth: true,
  },
  {
    prefix: '/api/catalog',
    target: serviceUrls.catalog,
    pathRewrite: { '^/api/catalog': '' },
    requiresAuth: true,
  },
  {
    prefix: '/api/kanban',
    target: serviceUrls.kanban,
    pathRewrite: { '^/api/kanban': '' },
    requiresAuth: true,
  },
  {
    prefix: '/api/orders',
    target: serviceUrls.orders,
    pathRewrite: { '^/api/orders': '' },
    requiresAuth: true,
  },
  {
    prefix: '/api/notifications',
    target: serviceUrls.notifications,
    pathRewrite: { '^/api/notifications': '' },
    requiresAuth: true,
  },
  // ── Public scan endpoint (QR code deep-link, no auth) ──
  {
    prefix: '/scan',
    target: serviceUrls.kanban,
    pathRewrite: { '^/scan': '/scan' },
    requiresAuth: false,
  },
];

export function setupProxies(app: Express): void {
  for (const route of routes) {
    const proxyOptions: Options = {
      target: route.target,
      changeOrigin: true,
      pathRewrite: route.pathRewrite,
      on: {
        proxyReq: (proxyReq, req) => {
          // Forward the original client IP
          const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
          if (clientIp) {
            proxyReq.setHeader('x-forwarded-for', String(clientIp));
          }
        },
        error: (err, _req, res) => {
          console.error(`[api-gateway] Proxy error for ${route.prefix}:`, err.message);
          if ('writeHead' in res && typeof res.writeHead === 'function') {
            (res as any).writeHead(502);
            (res as any).end(JSON.stringify({
              error: 'Service unavailable',
              service: route.prefix,
            }));
          }
        },
      },
    };

    if (route.requiresAuth) {
      // Protected route: validate JWT before proxying
      app.use(route.prefix, authMiddleware, createProxyMiddleware(proxyOptions));
    } else {
      // Public route: proxy directly
      app.use(route.prefix, createProxyMiddleware(proxyOptions));
    }

    console.log(`  [proxy] ${route.prefix} → ${route.target}`);
  }
}
