import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.mjs';

async function boot(bugs) {
  const server = createApp({ bugs }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}

const json = (cookie, method, body) => ({
  method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body && JSON.stringify(body),
});

async function login(base, email, password) {
  const res = await fetch(`${base}/api/login`, json(null, 'POST', { email, password }));
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}
const asCustomer = (base) => login(base, 'customer@shopnest.test', 'customer-pass-123');
const asAdmin = (base) => login(base, 'admin@shopnest.test', 'admin-pass-123');

for (const bugs of [true, false]) {
  test(`planted bugs ${bugs ? 'present' : 'absent'}`, async () => {
    const { base, close } = await boot(bugs);
    try {
      const customer = await asCustomer(base);

      // Bug 9: subtotal ignores quantity
      await fetch(`${base}/api/cart`, json(customer, 'POST', { productId: 1, qty: 1 }));
      await fetch(`${base}/api/cart`, json(customer, 'POST', { productId: 1, qty: 1 }));
      const cart = await (await fetch(`${base}/api/cart`, { headers: { cookie: customer } })).json();
      assert.equal(cart.items[0].qty, 2);
      assert.equal(cart.subtotal, bugs ? 2500 : 5000);

      // Bug 1: quantity update → 500
      assert.equal((await fetch(`${base}/api/cart/1`, json(customer, 'PUT', { qty: 3 }))).status, bugs ? 500 : 200);

      // Bug 2: admin users without any auth
      assert.equal((await fetch(`${base}/api/admin/users`)).status, bugs ? 200 : 401);

      // Bug 8: customer reads all orders via admin API
      assert.equal((await fetch(`${base}/api/admin/orders`, { headers: { cookie: customer } })).status, bugs ? 200 : 403);

      // Bug 3: profile "saved" but not persisted
      assert.equal((await fetch(`${base}/api/profile`, json(customer, 'POST', { name: 'New Name' }))).status, 200);
      const me = await (await fetch(`${base}/api/me`, { headers: { cookie: customer } })).json();
      assert.equal(me.name, bugs ? 'Casey Customer' : 'New Name');

      // Bug 4: broken Help link
      const home = await (await fetch(`${base}/`)).text();
      assert.equal(home.includes('href="/hlp"'), bugs);
      assert.equal((await fetch(`${base}/help`)).status, 200);

      // Bug 5: about page script error
      assert.equal((await (await fetch(`${base}/about`)).text()).includes('window.analytics.track'), bugs);

      // Bug 6: product images without alt, search without label
      const products = await (await fetch(`${base}/products`)).text();
      assert.equal(products.includes('alt="Canvas Tote"'), !bugs);
      assert.equal(products.includes('<label for="q">'), !bugs);

      // Bug 7: logout doesn't invalidate session
      await fetch(`${base}/api/logout`, json(customer, 'POST'));
      assert.equal((await fetch(`${base}/api/me`, { headers: { cookie: customer } })).status, bugs ? 200 : 401);
    } finally { await close(); }
  });

  test(`working features stay working (bugs=${bugs})`, async () => {
    const { base, close } = await boot(bugs);
    try {
      const customer = await asCustomer(base);
      const admin = await asAdmin(base);

      // Out of stock is an intended 409
      assert.equal((await fetch(`${base}/api/cart`, json(customer, 'POST', { productId: 2, qty: 1 }))).status, 409);

      // Wishlist works and dedupes
      await fetch(`${base}/api/wishlist`, json(customer, 'POST', { productId: 3 }));
      await fetch(`${base}/api/wishlist`, json(customer, 'POST', { productId: 3 }));
      const wl = await (await fetch(`${base}/api/wishlist`, { headers: { cookie: customer } })).json();
      assert.deepEqual(wl.map((p) => p.id), [3]);

      // Checkout clears cart, decrements stock, appears in history
      await fetch(`${base}/api/cart`, json(customer, 'POST', { productId: 3, qty: 1 }));
      assert.equal((await fetch(`${base}/api/orders`, json(customer, 'POST'))).status, 201);
      assert.equal((await (await fetch(`${base}/api/cart`, { headers: { cookie: customer } })).json()).items.length, 0);
      assert.equal((await (await fetch(`${base}/api/products/3`)).json()).stock, 4);
      assert.ok((await (await fetch(`${base}/api/orders`, { headers: { cookie: customer } })).json()).length >= 2);

      // Admin product management is correctly guarded and reflected in the shop
      assert.equal((await fetch(`${base}/api/admin/products`, json(customer, 'POST', { name: 'X', price: 100, stock: 1 }))).status, 403);
      const created = await (await fetch(`${base}/api/admin/products`, json(admin, 'POST', { name: 'Test Lamp', price: 3000, stock: 2 }))).json();
      await fetch(`${base}/api/admin/products/${created.id}`, json(admin, 'PUT', { price: 3500 }));
      assert.equal((await (await fetch(`${base}/api/products/${created.id}`)).json()).price, 3500);
      assert.equal((await fetch(`${base}/api/admin/products/${created.id}`, json(admin, 'DELETE'))).status, 200);
      assert.equal((await fetch(`${base}/api/products/${created.id}`)).status, 404);

      // Validation is a clean 400
      const bad = await fetch(`${base}/api/signup`, json(null, 'POST', { email: 'x', password: '1' }));
      assert.equal(bad.status, 400);
      assert.ok((await bad.json()).error);

      // Admin page guarded for customers
      const page = await fetch(`${base}/admin`, { headers: { cookie: customer }, redirect: 'manual' });
      assert.equal(page.status, 403);
    } finally { await close(); }
  });
}

test('shared client helpers load before page scripts', async () => {
  const { base, close } = await boot(false);
  try {
    const html = await (await fetch(`${base}/products/1`)).text();
    assert.ok(html.indexOf('async function api') < html.indexOf('<main>'), 'api()/say() must be defined before <main> page scripts run');
  } finally { await close(); }
});
