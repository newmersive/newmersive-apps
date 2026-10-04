// Run against an exported local build. Every API response belongs to this
// browser context; no production traffic or shared QA server state is used.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/fraus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.ALLWAIN_QA_BASE_URL || 'http://127.0.0.1:4514';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Local QA server required');
const participation = { experience: { onboardingVersion: 4, guidanceEnabled: false, primaryIntent: 'buy' }, buyer: { enabled: true, status: 'active' }, seller: { enabled: true, status: 'active', sellerReady: true, commercialModel: 'marketplace', businessOfRecord: 'seller' }, connector: { enabled: false, status: 'not_activated' } };
const user = { id: 'layout-buyer', name: 'Persona de prueba', email: 'qa@example.test', role: 'user', participation, analyticsConsent: false };
const offer = { id: 'qa-offer', ownerUserId: 'layout-seller', provider: { id: 'layout-seller', name: 'Comercio de prueba', score: 4.8, reviewCount: 3 }, title: 'Naranjas de prueba local', description: 'Oferta ficticia para comprobar el asistente.', currency: 'EUR', price: 2, allwainStatus: 'active', status: 'active', commercialModel: 'marketplace', locationLabel: 'Foios', meta: { unit: 'kg', minQuantity: 1, quantityStep: 1, availableQuantity: 50 }, createdAt: '2026-09-20' };
const config = { enabled: true, stripeLivemode: false, paymentEnvironment: 'test', stripeTestCheckoutEnabled: true, stripeTestCheckoutScope: 'all_real_user_offers', stripeTestFundsFlow: 'platform_charge_only_no_transfers', stripeTestFiscalDocumentsIssued: false, stripeTestSellerTransfersEnabled: false, legalRequirementsBypassedForTest: true };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, locale: 'es-ES', reducedMotion: 'reduce', serviceWorkers: 'block' });
      const mutations = [];
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.hostname === 'api.allwain.es' || (url.origin === base && url.pathname.startsWith('/api/'))) {
          const path = url.pathname.replace(/^\/api/, '');
          let data = { items: [] };
          if (request.method() !== 'GET' && !path.startsWith('/auth/')) mutations.push(path);
          if (path.startsWith('/auth/')) data = path === '/auth/me' ? user : { token: 'isolated-layout-token', user };
          else if (path === '/allwain/participation') data = participation;
          else if (path === '/allwain/offers') data = { items: [offer], pageInfo: { hasNextPage: false } };
          else if (path === '/allwain/offers/qa-offer') data = offer;
          else if (path === '/allwain/purchase-details') data = { details: null };
          else if (path === '/allwain/payments/config') data = config;
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        }
        if (url.origin === base) return route.continue();
        return route.abort();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      try {
        await page.goto(base + '/app/inicio', { waitUntil: 'networkidle' });
        const consent = page.getByText('Solo necesarias', { exact: true });
        if (await consent.isVisible()) await consent.click();
        await page.goto(base + '/app/ofertas?offerId=qa-offer', { waitUntil: 'networkidle' });
        const scroll = page.getByTestId('purchase-wizard-scroll');
        const footer = page.getByTestId('purchase-wizard-footer');
        async function checkLayout(step) {
          const bounds = await scroll.evaluate(node => {
            const rect = node.getBoundingClientRect();
            return { height: node.clientHeight, top: rect.top, bottom: rect.bottom, overflow: getComputedStyle(node).overflowY };
          });
          const footerBounds = await footer.boundingBox();
          assert(bounds.height > 150, `${viewport.width}/${step}: scroll area collapsed to ${bounds.height}px`);
          assert(['auto', 'scroll'].includes(bounds.overflow), `${step}: content cannot scroll`);
          assert(footerBounds && bounds.bottom <= footerBounds.y + 1, `${step}: footer overlaps content`);
          assert(footerBounds.y + footerBounds.height <= viewport.height + 1, `${step}: footer is off screen`);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${step}: horizontal overflow`);
          return bounds.height;
        }
        const quantityHeight = await checkLayout('quantity');
        await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
        await checkLayout('delivery');
        if (process.env.ALLWAIN_QA_ARTIFACT_DIR) {
          fs.mkdirSync(process.env.ALLWAIN_QA_ARTIFACT_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.ALLWAIN_QA_ARTIFACT_DIR, `purchase-layout-${viewport.width}.png`) });
        }
        // This must receive a real pointer click. A visible footer alone did not
        // catch the regression where the content had zero height underneath it.
        await page.getByText('Recogerlo · Gratis', { exact: true }).click();
        await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
        const name = page.getByRole('textbox', { name: 'Nombre completo de quien recoge', exact: true });
        await name.fill('Destinataria de prueba');
        assert.equal(await name.inputValue(), 'Destinataria de prueba');
        await checkLayout('recipient');
        assert(await scroll.evaluate(node => node.scrollHeight > node.clientHeight), 'Recipient fields should use the bounded scroll area');
        await scroll.evaluate(node => { node.scrollTop = node.scrollHeight; });
        await page.getByRole('button', { name: 'Revisar pedido', exact: true }).click();
        // Incomplete contact must keep the same step and focus the invalid phone.
        await page.getByRole('textbox', { name: 'Teléfono de contacto', exact: true }).fill('+34600111222');
        await page.getByRole('button', { name: 'Revisar pedido', exact: true }).click();
        await page.getByRole('button', { name: 'Siguiente', exact: true }).waitFor();
        assert.equal(await scroll.evaluate(node => node.scrollTop), 0, 'New step should start at its heading');
        await checkLayout('buyer');
        assert.equal(mutations.length, 0, 'Layout check must not prepare or pay any order');
        results.push({ width: viewport.width, scrollHeight: quantityHeight, deliveryChoiceClickable: true, recipientEditable: true, footerInsideViewport: true });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
