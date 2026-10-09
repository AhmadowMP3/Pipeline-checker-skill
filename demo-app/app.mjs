import express from 'express';
import { randomUUID } from 'node:crypto';
import * as v from './views.mjs';

const parseCookies = (header = '') =>
  Object.fromEntries(header.split(';').map((p) => p.trim().split('=')).filter(([k]) => k).map(([k, ...r]) => [k, r.join('=')]));

export function createApp({ bugs = true } = {}) {
  const app = express();
  const users = new Map();      // id -> { id, email, password, name, admin }
  const sessions = new Map();   // sid -> userId
  const products = new Map();   // id -> { id, name, description, price (cents), stock }
  const carts = new Map();      // userId -> Map(productId -> qty)
  const wishlists = new Map();  // userId -> Set(productId)
  const orders = [];            // { id, userId, items: [{productId, name, price, qty}], total, createdAt }
  let nextProductId = 1;
  let nextOrderId = 1;

  const addUser = (u) => { const user = { id: randomUUID(), admin: false, ...u }; users.set(user.id, user); return user; };
  const addProduct = (p) => { const product = { id: nextProductId++, description: '', ...p }; products.set(product.id, product); return product; };

  // Seed
  addUser({ email: 'admin@shopnest.test', password: 'admin-pass-123', name: 'Store Admin', admin: true });
  const casey = addUser({ email: 'customer@shopnest.test', password: 'customer-pass-123', name: 'Casey Customer' });
  addProduct({ name: 'Canvas Tote', description: 'Sturdy everyday tote.', price: 2500, stock: 10 });
  addProduct({ name: 'Ceramic Mug', description: 'Hand-glazed, 350 ml.', price: 1800, stock: 0 });
  addProduct({ name: 'Linen Apron', description: 'Washed linen, one size.', price: 4200, stock: 5 });
  orders.push({ id: nextOrderId++, userId: casey.id, items: [{ productId: 1, name: 'Canvas Tote', price: 2500, qty: 1 }], total: 2500, createdAt: new Date().toISOString() });

  app.use(express.json());

  const currentUser = (req) => users.get(sessions.get(parseCookies(req.headers.cookie).sid)) ?? null;
  const requireAuth = (req, res, next) => {
    req.user = currentUser(req);
    return req.user ? next() : res.status(401).json({ error: 'Please log in' });
  };
  const requireAdmin = [requireAuth, (req, res, next) => (req.user.admin ? next() : res.status(403).json({ error: 'Admins only' }))];
  const requirePage = (req, res, next) => {
    req.user = currentUser(req);
    return req.user ? next() : res.redirect('/login');
  };
  const render = (title, body) => (req, res) =>
    res.send(v.layout(title, typeof body === 'function' ? body(req) : body, { user: req.user ?? currentUser(req), bugs }));
  const startSession = (res, user) => {
    const sid = randomUUID();
    sessions.set(sid, user.id);
    res.setHeader('set-cookie', `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`);
  };
  const cartOf = (userId) => { if (!carts.has(userId)) carts.set(userId, new Map()); return carts.get(userId); };
  const cartView = (userId) => {
    const items = [...cartOf(userId)].map(([productId, qty]) => {
      const p = products.get(productId);
      return p && { productId, name: p.name, price: p.price, qty, lineTotal: p.price * qty };
    }).filter(Boolean);
    const subtotal = items.reduce((sum, i) => sum + (bugs ? i.price : i.lineTotal), 0);
    return { items, subtotal };
  };

  // Pages
  app.get('/', render('Home', () => v.home([...products.values()].slice(0, 3), bugs)));
  app.get('/products', render('Shop', (req) => {
    const q = String(req.query.q ?? '').trim();
    const list = [...products.values()].filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    return v.products(list, q, bugs);
  }));
  app.get('/products/:id', (req, res, next) => {
    const p = products.get(Number(req.params.id));
    if (!p) return next();
    return render(p.name, v.product(p))(req, res);
  });
  app.get('/static/product-:id.svg', (req, res, next) => {
    const p = products.get(Number(req.params.id));
    return p ? res.type('image/svg+xml').send(v.productSvg(p)) : next();
  });
  app.get('/cart', requirePage, render('Cart', v.cart()));
  app.get('/wishlist', requirePage, render('Wishlist', v.wishlist()));
  app.get('/orders', requirePage, render('Orders', v.orders()));
  app.get('/settings', requirePage, render('Settings', (req) => v.settings(req.user)));
  app.get('/help', render('Help', v.help()));
  app.get('/about', render('About', v.about(bugs)));
  app.get('/signup', render('Sign up', v.signup()));
  app.get('/login', render('Log in', v.login()));
  app.get('/admin', requirePage, (req, res) => {
    if (!req.user.admin) return res.status(403).send(v.layout('Forbidden', '<h1>Admins only</h1>', { user: req.user, bugs }));
    return render('Admin', v.admin())(req, res);
  });

  // Auth API
  app.post('/api/signup', (req, res) => {
    const { name, email, password } = req.body ?? {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email ?? '')) return res.status(400).json({ error: 'Enter a valid email address' });
    if ((password ?? '').length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if ([...users.values()].some((u) => u.email === email)) return res.status(409).json({ error: 'An account with this email already exists' });
    const user = addUser({ email, password, name: name || 'New customer' });
    startSession(res, user);
    res.status(201).json({ id: user.id, email, name: user.name });
  });

  app.post('/api/login', (req, res) => {
    const { email, password } = req.body ?? {};
    const user = [...users.values()].find((u) => u.email === email && u.password === password);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    startSession(res, user);
    res.json({ id: user.id, email, name: user.name });
  });

  app.post('/api/logout', (req, res) => {
    if (!bugs) sessions.delete(parseCookies(req.headers.cookie).sid);
    res.setHeader('set-cookie', 'sid=; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  app.get('/api/me', requireAuth, (req, res) => res.json({ id: req.user.id, email: req.user.email, name: req.user.name, admin: req.user.admin }));

  app.post('/api/profile', requireAuth, (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!bugs) req.user.name = name;
    res.json({ ok: true });
  });

  // Catalog API
  app.get('/api/products', (req, res) => res.json([...products.values()]));
  app.get('/api/products/:id', (req, res) => {
    const p = products.get(Number(req.params.id));
    return p ? res.json(p) : res.status(404).json({ error: 'Product not found' });
  });

  // Cart API
  app.get('/api/cart', requireAuth, (req, res) => res.json(cartView(req.user.id)));

  app.post('/api/cart', requireAuth, (req, res) => {
    const productId = Number(req.body?.productId);
    const qty = Number(req.body?.qty ?? 1);
    const p = products.get(productId);
    if (!p) return res.status(404).json({ error: 'Product not found' });
    if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ error: 'Quantity must be at least 1' });
    const cart = cartOf(req.user.id);
    const next = (cart.get(productId) ?? 0) + qty;
    if (p.stock === 0) return res.status(409).json({ error: 'Out of stock' });
    if (next > p.stock) return res.status(409).json({ error: `Only ${p.stock} left` });
    cart.set(productId, next);
    res.status(201).json(cartView(req.user.id));
  });

  app.put('/api/cart/:productId', requireAuth, (req, res) => {
    const productId = Number(req.params.productId);
    const qty = Number(req.body?.qty);
    const cart = cartOf(req.user.id);
    const p = products.get(productId);
    if (!cart.has(productId) || !p) return res.status(404).json({ error: 'Not in cart' });
    if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ error: 'Quantity must be at least 1' });
    if (qty > p.stock) return res.status(409).json({ error: `Only ${p.stock} left` });
    if (bugs) cart.get(productId).qty = qty; else cart.set(productId, qty);
    res.json(cartView(req.user.id));
  });

  app.delete('/api/cart/:productId', requireAuth, (req, res) => {
    cartOf(req.user.id).delete(Number(req.params.productId));
    res.json(cartView(req.user.id));
  });

  // Wishlist API
  const wishlistOf = (userId) => { if (!wishlists.has(userId)) wishlists.set(userId, new Set()); return wishlists.get(userId); };
  app.get('/api/wishlist', requireAuth, (req, res) => res.json([...wishlistOf(req.user.id)].map((id) => products.get(id)).filter(Boolean)));
  app.post('/api/wishlist', requireAuth, (req, res) => {
    const productId = Number(req.body?.productId);
    if (!products.has(productId)) return res.status(404).json({ error: 'Product not found' });
    wishlistOf(req.user.id).add(productId);
    res.status(201).json({ ok: true });
  });
  app.delete('/api/wishlist/:productId', requireAuth, (req, res) => {
    wishlistOf(req.user.id).delete(Number(req.params.productId));
    res.json({ ok: true });
  });

  // Orders API
  app.get('/api/orders', requireAuth, (req, res) => res.json(orders.filter((o) => o.userId === req.user.id)));
  app.post('/api/orders', requireAuth, (req, res) => {
    const { items, subtotal } = cartView(req.user.id);
    if (!items.length) return res.status(400).json({ error: 'Your cart is empty' });
    for (const i of items) {
      if (products.get(i.productId).stock < i.qty) return res.status(409).json({ error: `${i.name}: not enough stock` });
    }
    for (const i of items) products.get(i.productId).stock -= i.qty;
    const order = { id: nextOrderId++, userId: req.user.id, items: items.map(({ productId, name, price, qty }) => ({ productId, name, price, qty })), total: subtotal, createdAt: new Date().toISOString() };
    orders.push(order);
    carts.set(req.user.id, new Map());
    res.status(201).json(order);
  });

  // Admin API
  app.get('/api/admin/users', bugs ? [] : requireAdmin, (req, res) =>
    res.json([...users.values()].map(({ id, email, name, admin }) => ({ id, email, name, admin }))));
  app.get('/api/admin/orders', bugs ? requireAuth : requireAdmin, (req, res) =>
    res.json(orders.map((o) => ({ ...o, email: users.get(o.userId)?.email }))));
  app.post('/api/admin/products', requireAdmin, (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const price = Number(req.body?.price);
    const stock = Number(req.body?.stock);
    if (!name || !Number.isInteger(price) || price < 1 || !Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ error: 'Name, a positive price (cents) and stock ≥ 0 are required' });
    }
    res.status(201).json(addProduct({ name, price, stock }));
  });
  app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
    const p = products.get(Number(req.params.id));
    if (!p) return res.status(404).json({ error: 'Product not found' });
    if (req.body?.price !== undefined) p.price = Number(req.body.price);
    if (req.body?.stock !== undefined) p.stock = Number(req.body.stock);
    res.json(p);
  });
  app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!products.delete(id)) return res.status(404).json({ error: 'Product not found' });
    for (const cart of carts.values()) cart.delete(id);
    for (const wl of wishlists.values()) wl.delete(id);
    res.json({ ok: true });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((req, res) => res.status(404).send(v.layout('Not found', '<h1>Page not found</h1><p><a href="/">Go home</a></p>', { user: currentUser(req), bugs })));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));

  return app;
}
