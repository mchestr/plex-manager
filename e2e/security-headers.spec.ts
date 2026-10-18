import { expect, test } from '@playwright/test';

// SEC-01: with `images.unoptimized` the optimizer route never fetches or
// decodes a caller-supplied URL. Its own errors all start with `"url"
// parameter`, so their absence shows the request was refused before any fetch
// (a live optimizer would pass through the upstream status, which can be 4xx).
test.describe('Security headers and image optimizer', () => {
  test('/_next/image refuses an external URL without fetching it', async ({ request }) => {
    const response = await request.get(
      '/_next/image?url=https%3A%2F%2Fexample.com%2Fa.png&w=64&q=75'
    );

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
    expect(await response.text()).not.toContain('"url" parameter');
  });

  test('pages do not advertise the framework', async ({ request }) => {
    const response = await request.get('/');

    expect(response.ok()).toBe(true);
    expect(response.headers()['x-powered-by']).toBeUndefined();
  });

  test('pages send a CSP that blocks plugins, base hijacking and framing', async ({ request }) => {
    const response = await request.get('/');
    const csp = response.headers()['content-security-policy'];

    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
  });
});
