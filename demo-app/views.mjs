export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (cents) => `$${(cents / 100).toFixed(2)}`;

export function layout(title, body, { user, bugs }) {
  const auth = user
    ? `${user.admin ? '<a href="/admin">Admin</a>' : ''}<a href="/settings">Hi, ${esc(user.name)}</a><button id="logout" type="button">Log out</button>`
    : '<a href="/login">Log in</a><a href="/signup">Sign up</a>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ShopNest</title>
<style>
body{font-family:system-ui;margin:0;color:#222}nav{display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:12px 16px;background:#1d3557}
nav a,nav button{color:#f1faee;background:none;border:0;font:inherit;cursor:pointer;text-decoration:underline}main{padding:16px;max-width:860px;margin:0 auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}.card{border:1px solid #ddd;border-radius:8px;padding:12px}
.card img{width:100%;height:auto}#msg{min-height:1.5em;font-weight:600}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #eee;text-align:left}
</style>
<script>
async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}
const money = (c) => '$' + (c / 100).toFixed(2);
const say = (t) => { const m = document.getElementById('msg'); if (m) m.textContent = t; };
document.addEventListener('DOMContentLoaded', () => {
  const lo = document.getElementById('logout');
  if (lo) lo.onclick = async () => { await fetch('/api/logout', { method: 'POST' }); location.href = '/'; };
});
</script>
</head><body>
<nav><a href="/">Home</a><a href="/products">Shop</a><a href="/wishlist">Wishlist</a><a href="/cart">Cart</a><a href="/orders">Orders</a><a href="${bugs ? '/hlp' : '/help'}">Help</a><a href="/about">About</a>${auth}</nav>
<main>${body}</main>
</body></html>`;
}

const productCard = (p, bugs) => `
<div class="card">
  <a href="/products/${p.id}"><img src="/static/product-${p.id}.svg"${bugs ? '' : ` alt="${esc(p.name)}"`}></a>
  <h3><a href="/products/${p.id}">${esc(p.name)}</a></h3>
  <p>${money(p.price)} ${p.stock === 0 ? '<strong>Out of stock</strong>' : ''}</p>
</div>`;

export const home = (featured, bugs) => `<h1>ShopNest</h1><p>Simple goods for a calm home.</p><div class="grid">${featured.map((p) => productCard(p, bugs)).join('')}</div>`;

export const products = (list, q, bugs) => `
<h1>Shop</h1>
<form method="get" action="/products">
  ${bugs ? '' : '<label for="q">Search products</label> '}<input id="q" name="q" value="${esc(q)}" placeholder="Search…">
  <button type="submit">Search</button>
</form>
${list.length ? `<div class="grid">${list.map((p) => productCard(p, bugs)).join('')}</div>` : `<p>No products match “${esc(q)}”.</p>`}`;

export const product = (p) => `
<h1>${esc(p.name)}</h1>
<img src="/static/product-${p.id}.svg" alt="${esc(p.name)}" width="240">
<p>${esc(p.description)}</p>
<p><strong>${money(p.price)}</strong> · ${p.stock === 0 ? 'Out of stock' : `${p.stock} in stock`}</p>
<button id="add" type="button" ${p.stock === 0 ? 'disabled' : ''}>Add to cart</button>
<button id="wish" type="button">Add to wishlist</button>
<p id="msg" role="status"></p>
<script>
document.getElementById('add').onclick = async () => {
  try { await api('POST', '/api/cart', { productId: ${p.id}, qty: 1 }); say('Added to cart'); }
  catch (e) { say(e.message); }
};
document.getElementById('wish').onclick = async () => {
  try { await api('POST', '/api/wishlist', { productId: ${p.id} }); say('Saved to wishlist'); }
  catch (e) { say(e.message); }
};
</script>`;

export const cart = () => `
<h1>Your cart</h1>
<table><thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th><th></th></tr></thead><tbody id="rows"></tbody></table>
<p>Subtotal: <strong id="subtotal">$0.00</strong></p>
<button id="checkout" type="button">Place order</button>
<p id="msg" role="status"></p>
<script>
async function load() {
  const data = await api('GET', '/api/cart');
  const rows = document.getElementById('rows');
  rows.innerHTML = data.items.length ? '' : '<tr><td colspan="5">Your cart is empty. <a href="/products">Go shopping</a></td></tr>';
  for (const it of data.items) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td></td><td></td><td><input type="number" min="1" aria-label="Quantity" style="width:4em"> <button data-a="upd">Update</button></td><td></td><td><button data-a="rm">Remove</button></td>';
    tr.children[0].textContent = it.name; tr.children[1].textContent = money(it.price); tr.children[3].textContent = money(it.lineTotal);
    tr.querySelector('input').value = it.qty;
    tr.querySelector('[data-a=upd]').onclick = async () => {
      try { await api('PUT', '/api/cart/' + it.productId, { qty: Number(tr.querySelector('input').value) }); say('Cart updated'); load(); }
      catch (e) { say(e.message); }
    };
    tr.querySelector('[data-a=rm]').onclick = async () => { await api('DELETE', '/api/cart/' + it.productId); say('Removed'); load(); };
    rows.appendChild(tr);
  }
  document.getElementById('subtotal').textContent = money(data.subtotal);
  document.getElementById('checkout').disabled = !data.items.length;
}
document.getElementById('checkout').onclick = async () => {
  try { const o = await api('POST', '/api/orders'); location.href = '/orders?placed=' + o.id; }
  catch (e) { say(e.message); }
};
load().catch((e) => say(e.message));
</script>`;

export const wishlist = () => `
<h1>Your wishlist</h1>
<ul id="list"></ul>
<p id="msg" role="status"></p>
<script>
async function load() {
  const items = await api('GET', '/api/wishlist');
  const list = document.getElementById('list');
  list.innerHTML = items.length ? '' : '<li>Nothing saved yet.</li>';
  for (const p of items) {
    const li = document.createElement('li');
    li.innerHTML = '<a></a> <button data-a="cart">Move to cart</button> <button data-a="rm">Remove</button>';
    li.querySelector('a').textContent = p.name; li.querySelector('a').href = '/products/' + p.id;
    li.querySelector('[data-a=cart]').onclick = async () => {
      try { await api('POST', '/api/cart', { productId: p.id, qty: 1 }); await api('DELETE', '/api/wishlist/' + p.id); say('Moved to cart'); load(); }
      catch (e) { say(e.message); }
    };
    li.querySelector('[data-a=rm]').onclick = async () => { await api('DELETE', '/api/wishlist/' + p.id); say('Removed'); load(); };
    list.appendChild(li);
  }
}
load().catch((e) => say(e.message));
</script>`;

export const orders = () => `
<h1>Your orders</h1>
<p id="msg" role="status"></p>
<ul id="list"></ul>
<script>
if (new URLSearchParams(location.search).get('placed')) say('Thank you! Your order was placed.');
api('GET', '/api/orders').then((list) => {
  const ul = document.getElementById('list');
  ul.innerHTML = list.length ? '' : '<li>No orders yet.</li>';
  for (const o of list) {
    const li = document.createElement('li');
    li.textContent = 'Order #' + o.id + ' — ' + o.items.map((i) => i.qty + '× ' + i.name).join(', ') + ' — ' + money(o.total);
    ul.appendChild(li);
  }
}).catch((e) => say(e.message));
</script>`;

const authForm = (kind) => `
<h1>${kind === 'signup' ? 'Create account' : 'Log in'}</h1>
<form id="f">
  ${kind === 'signup' ? '<p><label for="name">Name</label><br><input id="name" name="name" required></p>' : ''}
  <p><label for="email">Email</label><br><input id="email" name="email" type="email" required></p>
  <p><label for="password">Password</label><br><input id="password" name="password" type="password" required></p>
  <button type="submit">${kind === 'signup' ? 'Sign up' : 'Log in'}</button>
  <p id="msg" role="status"></p>
</form>
<script>
document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  try { await api('POST', '/api/${kind}', Object.fromEntries(new FormData(e.target))); location.href = '/products'; }
  catch (err) { say(err.message); }
};
</script>`;
export const signup = () => authForm('signup');
export const login = () => authForm('login');

export const settings = (user) => `
<h1>Settings</h1>
<form id="p">
  <p><label for="name">Display name</label><br><input id="name" name="name" value="${esc(user.name)}"></p>
  <button type="submit">Save</button>
  <p id="msg" role="status"></p>
</form>
<script>
document.getElementById('p').onsubmit = async (e) => {
  e.preventDefault();
  try { await api('POST', '/api/profile', { name: document.getElementById('name').value }); say('Saved!'); }
  catch (err) { say(err.message); }
};
</script>`;

export const help = () => '<h1>Help</h1><p>Questions about an order? Email help@shopnest.test.</p>';
export const about = (bugs) => `<h1>About</h1><p>ShopNest is a tiny demo store.</p>${bugs ? "<script>window.analytics.track('about_view');</script>" : ''}`;

export const admin = () => `
<h1>Admin</h1>
<h2>Products</h2>
<table><thead><tr><th>Name</th><th>Price (cents)</th><th>Stock</th><th></th></tr></thead><tbody id="prows"></tbody></table>
<h3>Add product</h3>
<form id="addp">
  <label for="pname">Name</label> <input id="pname" required>
  <label for="pprice">Price (cents)</label> <input id="pprice" type="number" min="1" required>
  <label for="pstock">Stock</label> <input id="pstock" type="number" min="0" required>
  <button type="submit">Add product</button>
</form>
<p id="msg" role="status"></p>
<h2>Orders</h2>
<ul id="orders"></ul>
<script>
async function load() {
  const products = await api('GET', '/api/products');
  const tb = document.getElementById('prows'); tb.innerHTML = '';
  for (const p of products) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td></td><td><input type="number" aria-label="Price" style="width:6em"></td><td><input type="number" aria-label="Stock" style="width:4em"></td><td><button data-a="save">Save</button> <button data-a="del">Delete</button></td>';
    tr.children[0].textContent = p.name;
    const [price, stock] = tr.querySelectorAll('input'); price.value = p.price; stock.value = p.stock;
    tr.querySelector('[data-a=save]').onclick = async () => {
      try { await api('PUT', '/api/admin/products/' + p.id, { price: Number(price.value), stock: Number(stock.value) }); say('Product saved'); load(); }
      catch (e) { say(e.message); }
    };
    tr.querySelector('[data-a=del]').onclick = async () => {
      if (!confirm('Delete ' + p.name + '?')) return;
      await api('DELETE', '/api/admin/products/' + p.id); say('Product deleted'); load();
    };
    tb.appendChild(tr);
  }
  const orders = await api('GET', '/api/admin/orders');
  const ul = document.getElementById('orders');
  ul.innerHTML = orders.length ? '' : '<li>No orders yet.</li>';
  for (const o of orders) { const li = document.createElement('li'); li.textContent = '#' + o.id + ' ' + o.email + ' — ' + money(o.total); ul.appendChild(li); }
}
document.getElementById('addp').onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api('POST', '/api/admin/products', { name: document.getElementById('pname').value, price: Number(document.getElementById('pprice').value), stock: Number(document.getElementById('pstock').value) });
    e.target.reset(); say('Product added'); load();
  } catch (err) { say(err.message); }
};
load().catch((e) => say(e.message));
</script>`;

export const productSvg = (p) => `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#a8dadc"/><text x="16" y="88" font-family="sans-serif" font-size="18" fill="#1d3557">${esc(p.name)}</text></svg>`;
