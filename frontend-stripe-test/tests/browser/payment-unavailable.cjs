// Local exported-UI regression: disabled/unknown payment config must offer a
// read-only refresh, never a link to missing conditions or an external checkout.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/fraus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.ALLWAIN_QA_BASE_URL || 'http://127.0.0.1:4514';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const participation = { experience: { onboardingVersion: 4, guidanceEnabled: false, primaryIntent: 'buy' }, buyer: { enabled: true, status: 'active' }, seller: { enabled: false, status: 'not_activated' }, connector: { enabled: false, status: 'not_activated' } };
const user = { id: 'availability-buyer', name: 'Comprador de prueba', email: 'qa@example.test', role: 'user', participation, analyticsConsent: false };
const contract = { id: 'availability-contract', offerId: 'availability-offer', offerTitle: 'Pedido para comprobar disponibilidad', requesterUserId: user.id, providerUserId: 'availability-seller', requesterName: user.name, providerName: 'Comercio local', status: 'accepted', quantity: 2, unit: 'kg', totalPrice: 4, subtotalAmount: 400, currency: 'EUR', paymentMode: 'immediate', paymentStatus: 'awaiting_payment', requesterAcceptedAt: '2026-09-20', providerAcceptedAt: '2026-09-20', createdAt: '2026-09-20', deliveryMethod: 'pickup', deliveryChannel: 'pickup' };
const order = { ...contract, id: 'availability-order', contractId: contract.id, buyerUserId: user.id, sellerUserId: contract.providerUserId, totalAmount: 400, fulfillmentStatus: 'pending', checkoutBlockReason: null };
const ready = { enabled: true, stripeLivemode: false, paymentEnvironment: 'test', stripeTestCheckoutEnabled: true, stripeTestCheckoutScope: 'all_real_user_offers', stripeTestFundsFlow: 'platform_charge_only_no_transfers', stripeTestFiscalDocumentsIssued: false, stripeTestSellerTransfersEnabled: false, legalRequirementsBypassedForTest: true };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const initial of ['disabled', 'unknown']) {
      const context = await browser.newContext({ viewport: { width: 320, height: 640 }, locale: 'es-ES', serviceWorkers: 'block', reducedMotion: 'reduce' });
      let state = initial, pendingConfig, releaseConfig;
      const writes = [];
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.hostname === 'api.allwain.es' || (url.origin === base && url.pathname.startsWith('/api/'))) {
          const path = url.pathname.replace(/^\/api/, '');
          let data = { items: [] };
          if (request.method() !== 'GET' && !path.startsWith('/auth/')) writes.push(path);
          if (path.startsWith('/auth/')) data = path === '/auth/me' ? user : { token: 'availability-local-token', user };
          else if (path === '/allwain/participation') data = participation;
          else if (path === '/allwain/contracts') data = { items: [contract] };
          else if (path === '/allwain/contracts/' + contract.id) data = contract;
          else if (path === '/allwain/payments/orders') data = { items: [order] };
          else if (path === '/allwain/payments/orders/' + order.id || path.endsWith('/prepare')) data = order;
          else if (path === '/allwain/payments/config') {
            if (pendingConfig) await pendingConfig;
            if (state === 'unknown') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'No disponible en esta prueba' }) });
            data = { ...ready, enabled: state === 'ready' };
          }
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        }
        if (url.origin === base) return route.continue();
        return route.abort();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      try {
        await page.goto(base + '/app/inicio', { waitUntil: 'networkidle' });
        const consent = page.getByText('Solo necesarias', { exact: true });
        if (await consent.isVisible()) await consent.click();
        await page.goto(base + '/app/ofertas?section=orders&contractId=' + contract.id, { waitUntil: 'networkidle' });
        const footer = page.getByTestId('order-payment-footer');
        const retry = footer.getByRole('button', { name: 'Actualizar disponibilidad del pago', exact: true });
        await retry.waitFor();
        assert.match(await footer.innerText(), initial === 'disabled' ? /Pago no disponible ahora/ : /No pudimos comprobar/);
        assert.equal(await footer.getByRole('button', { name: 'Revisar pago y condiciones', exact: true }).count(), 0);
        assert.equal(await page.getByLabel('Aceptar condiciones de compra', { exact: true }).count(), 0);
        const initialWrites = writes.length; // Existing total preparation is unchanged.
        pendingConfig = new Promise(resolve => { releaseConfig = resolve; });
        await retry.click();
        const checking = footer.getByRole('button', { name: 'Comprobando pago…', exact: true });
        await checking.waitFor();
        assert.equal(await checking.isDisabled(), true);
        assert.match(await footer.innerText(), /Comprobando la disponibilidad del pago/);
        state = 'ready'; releaseConfig(); pendingConfig = null;
        await footer.getByRole('button', { name: 'Revisar pago y condiciones', exact: true }).waitFor();
        await page.getByLabel('Aceptar condiciones de compra', { exact: true }).waitFor();
        assert.equal(writes.length, initialWrites, 'Availability refresh must not create a payment or prepare another order');
        assert(!writes.some(path => path.endsWith('/checkout')), 'No checkout may be created by this test');
        const bounds = await footer.boundingBox();
        assert(bounds && bounds.y + bounds.height <= 641, 'Payment status and action must remain within the small viewport');
        console.log(`${initial} → checking → ready: passed; checkout calls=0`);
      } finally { releaseConfig?.(); await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
