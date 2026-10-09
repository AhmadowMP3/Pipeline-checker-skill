import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillPath, isRiskyEndpoint, skipReason, classifyAnonymous, classifySession } from '../lib/probe-logic.mjs';

const res = (status, location = null) => ({ status, location });

test('fillPath substitutes 1 for params only on local targets (review C1, M3)', () => {
  assert.equal(fillPath({ path: '/api/items/[id]' }, 'local'), '/api/items/1');
  assert.equal(fillPath({ path: '/posts/{post}/c/<int:pk>/:x' }, 'local'), '/posts/1/c/1/1');
  assert.equal(fillPath({ path: '/api/items/[id]' }, 'deployed'), null);
  assert.equal(fillPath({ path: '/api/items/[id]', sample: '/api/items/77' }, 'deployed'), '/api/items/77');
  assert.equal(fillPath({ path: '/api/items' }, 'deployed'), '/api/items');
});

test('isRiskyEndpoint flags side-effecting paths (review I7)', () => {
  for (const p of ['/api/cron/cleanup', '/api/seed', '/api/reset-demo', '/api/send-digest', '/api/webhooks/stripe', '/api/admin/purge-cache', '/api/migrate', '/logout'])
    assert.equal(isRiskyEndpoint(p), true, p);
  for (const p of ['/api/products', '/api/me', '/api/orders/1'])
    assert.equal(isRiskyEndpoint(p), false, p);
});

test('skipReason enforces write and risk rules per target', () => {
  const base = { target: 'local', allowWrites: false, allowRisky: false, hasSession: false, asRole: null };
  assert.equal(skipReason({ method: 'GET', path: '/api/me' }, base), null);
  assert.equal(skipReason({ method: 'POST', path: '/api/items' }, base), 'SKIPPED_WRITE');
  assert.equal(skipReason({ method: 'POST', path: '/api/items' }, { ...base, allowWrites: true }), null);
  assert.equal(skipReason({ method: 'GET', path: '/api/cron/run' }, base), 'SKIPPED_RISKY');
  assert.equal(skipReason({ method: 'GET', path: '/api/cron/run' }, { ...base, allowRisky: true }), null);
  const deployed = { ...base, target: 'deployed', allowWrites: true };
  assert.equal(skipReason({ method: 'DELETE', path: '/api/items/[id]' }, deployed), 'SKIPPED_NO_SAMPLE');
  assert.equal(skipReason({ method: 'POST', path: '/api/orders' }, deployed), 'SKIPPED_NO_SAMPLE');
  assert.equal(skipReason({ method: 'DELETE', path: '/api/items/[id]', sample: '/api/items/77' }, deployed), null);
  assert.equal(skipReason({ method: 'GET', path: '/api/items/[id]' }, deployed), 'SKIPPED_NO_SAMPLE');
  const session = { ...base, allowWrites: true, hasSession: true, asRole: 'customer' };
  assert.equal(skipReason({ method: 'POST', path: '/api/cart', auth: true }, session), 'SKIPPED_WRITE');
  assert.equal(skipReason({ method: 'POST', path: '/api/admin/products', role: 'admin' }, session), null);
});

test('login redirects vs other redirects (review I5)', () => {
  const ep = { auth: true };
  assert.equal(classifyAnonymous(ep, res(302, '/users/sign_in')), 'ENFORCED');
  assert.equal(classifyAnonymous(ep, res(302, '/login?next=/x')), 'ENFORCED');
  assert.equal(classifyAnonymous(ep, res(302, '/auth/signin')), 'ENFORCED');
  assert.equal(classifyAnonymous(ep, res(302, '/author/jane')), 'REDIRECT_REVIEW');
  assert.equal(classifyAnonymous(ep, res(302, '/dashboard')), 'REDIRECT_REVIEW');
  assert.equal(classifyAnonymous(ep, res(200)), 'UNPROTECTED');
  assert.equal(classifyAnonymous(ep, res(422)), 'UNPROTECTED_LIKELY');
  assert.equal(classifyAnonymous({ auth: false }, res(302, '/dashboard')), 'OK');
  const admin = { role: 'admin' };
  assert.equal(classifySession(admin, res(302, '/'), 'customer'), 'REDIRECT_REVIEW');
  assert.equal(classifySession(admin, res(302, '/users/sign_in'), 'customer'), 'ROLE_ENFORCED');
  assert.equal(classifySession(admin, res(200), 'customer'), 'ROLE_BYPASS');
  assert.equal(classifySession({ auth: true }, res(401), 'customer'), 'AUTH_REJECTED');
});
