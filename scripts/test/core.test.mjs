import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../lib/args.mjs';
import { classifyTarget, makeRunId } from '../lib/target.mjs';
import { normalizeUrl, isSameOrigin, isDangerousLink, isExcluded, routeToSamplePath } from '../lib/url.mjs';
import { fileSlug } from '../lib/fsutil.mjs';

test('parseArgs handles --k v, --k=v, booleans and positionals', () => {
  assert.deepEqual(parseArgs(['pos', '--url', 'http://a', '--max-pages=3', '--no-mobile']),
    { _: ['pos'], url: 'http://a', 'max-pages': '3', 'no-mobile': true });
});

test('classifyTarget', () => {
  for (const u of ['http://localhost:3000', 'http://127.0.0.1:8080/x', 'http://[::1]:3000', 'http://app.localhost', 'https://shop.test'])
    assert.equal(classifyTarget(u), 'local', u);
  for (const u of ['https://example.com', 'http://192.168.1.5:3000'])
    assert.equal(classifyTarget(u), 'deployed', u);
});

test('makeRunId formats local time', () => {
  assert.equal(makeRunId(new Date(2026, 9, 9, 22, 5)), '2026-10-09_2205');
});

test('normalizeUrl', () => {
  assert.equal(normalizeUrl('/about/', 'http://a.com/x'), 'http://a.com/about');
  assert.equal(normalizeUrl('#section', 'http://a.com/x'), 'http://a.com/x');
  assert.equal(normalizeUrl('#/settings', 'http://a.com/x'), 'http://a.com/x#/settings');
  assert.equal(normalizeUrl('#!/inbox', 'http://a.com/'), 'http://a.com/#!/inbox');
  assert.equal(normalizeUrl('http://a.com'), 'http://a.com/');
  assert.equal(normalizeUrl('mailto:x@y.com', 'http://a.com'), null);
  assert.equal(normalizeUrl('javascript:void(0)', 'http://a.com'), null);
  assert.equal(normalizeUrl('not a url'), null);
});

test('isSameOrigin', () => {
  assert.equal(isSameOrigin('http://a.com/x', 'http://a.com/y'), true);
  assert.equal(isSameOrigin('http://a.com', 'https://a.com'), false);
});

test('isDangerousLink', () => {
  for (const u of ['/logout', '/api/items/1/delete', '/delete-account', '/signout', '/items?action=delete', '/sign-out'])
    assert.equal(isDangerousLink(`http://a.com${u}`), true, u);
  for (const u of ['/catalog', '/deleted-items', '/about', '/login'])
    assert.equal(isDangerousLink(`http://a.com${u}`), false, u);
});

test('isExcluded matches path prefixes', () => {
  assert.equal(isExcluded('http://a.com/admin/x', ['/admin']), true);
  assert.equal(isExcluded('http://a.com/about', ['/admin']), false);
  assert.equal(isExcluded('http://a.com/about', []), false);
});

test('routeToSamplePath', () => {
  assert.equal(routeToSamplePath({ path: '/about' }), '/about');
  assert.equal(routeToSamplePath({ path: '/posts/[id]' }), null);
  assert.equal(routeToSamplePath({ path: '/posts/:id' }), null);
  assert.equal(routeToSamplePath({ path: '/posts/[id]', sample: '/posts/1' }), '/posts/1');
});

test('fileSlug is filesystem-safe, bounded and collision-free', () => {
  assert.match(fileSlug('/search?q=a:b*c|d'), /^[A-Za-z0-9._-]+$/);
  assert.equal(fileSlug('/'), fileSlug('/'));
  assert.notEqual(fileSlug('/a?x=1'), fileSlug('/a?x=2'));
  assert.ok(fileSlug('/' + 'x'.repeat(500)).length <= 90);
  assert.match(fileSlug('/'), /^root-[0-9a-f]{6}$/);
});

test('hash routes are checked by dangerous-link and exclude filters (review I2)', () => {
  assert.equal(isDangerousLink('http://a.com/#/logout'), true);
  assert.equal(isDangerousLink('http://a.com/#!/account/delete'), true);
  assert.equal(isDangerousLink('http://a.com/#/settings'), false);
  assert.equal(isExcluded('http://a.com/#/admin/users', ['/admin']), true);
});

test('dangerous-link verbs cover common GET actions (review I8)', () => {
  for (const u of ['/admin/orders/5/refund', '/subscription/cancel', '/posts/3/approve', '/users/9/ban', '/admin/impersonate/4',
    '/posts/3/publish', '/projects/2/archive', '/cart/clear', '/flags/x/toggle', '/deleteAccount', '/users/sign_out', '/logoff', '/admin/reset'])
    assert.equal(isDangerousLink(`http://a.com${u}`), true, u);
  for (const u of ['/reset-password', '/cancellation-policy', '/published', '/blocks', '/approved-items'])
    assert.equal(isDangerousLink(`http://a.com${u}`), false, u);
});

test('routeToSamplePath recognises Laravel and Django params (review M3)', () => {
  assert.equal(routeToSamplePath({ path: '/posts/{post}' }), null);
  assert.equal(routeToSamplePath({ path: '/posts/<int:pk>' }), null);
});
