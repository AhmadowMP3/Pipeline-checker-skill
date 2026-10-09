const NAVIGATION_WAIT = 15000;

export async function loginWithConfig(context, cfg, base, timeout = 20000) {
  const page = await context.newPage();
  try {
    const loginUrl = new URL(cfg.url, base).toString();
    await page.goto(loginUrl, { waitUntil: 'load', timeout });
    for (const [selector, value] of Object.entries(cfg.fields)) await page.fill(selector, String(value));
    // Wait for the URL to leave the login page: covers classic form posts and JS logins (fetch + location.href).
    // networkidle alone resolves immediately when the page was already idle, racing the login request.
    const leftLoginPage = page.waitForURL((u) => u.href !== loginUrl, { timeout: NAVIGATION_WAIT }).catch(() => {});
    await page.click(cfg.submit);
    await leftLoginPage;
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    return new URL(page.url()).pathname;
  } finally {
    await page.close();
  }
}
