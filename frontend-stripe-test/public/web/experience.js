(function () {
  "use strict";

  let identity = window.AllwainWebAuth?.identity || null;
  const apiBase = "https://api.allwain.es/api";

  const one = (selector, root = document) => root.querySelector(selector);
  const many = (selector, root = document) => [...root.querySelectorAll(selector)];
  const tr = (source, replacements = {}) => {
    if (window.AllwainI18n?.translate) return window.AllwainI18n.translate(source, replacements);
    return Object.entries(replacements).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), source);
  };

  function translatedText(element, source, replacements = {}) {
    if (element) element.textContent = tr(source, replacements);
  }

  function translatedButton(element, source) {
    if (!element) return;
    const icon = element.firstElementChild;
    if (icon) {
      many(":scope > :not(:first-child)", element).forEach((child) => child.remove());
      [...element.childNodes].filter((node) => node !== icon).forEach((node) => node.remove());
      element.append(document.createTextNode(tr(source)));
      return;
    }
    element.textContent = tr(source);
  }

  function track(name, parameters = {}) {
    window.AllwainAnalytics?.track?.(name, {
      release: one('meta[name="allwain-release"]')?.content || "unknown",
      locale: window.AllwainI18n?.locale || "es",
      ...parameters
    });
  }

  function firstName(user) {
    const safeName = String(user?.name || "").trim().split(/\s+/)[0];
    return safeName ? safeName.slice(0, 32) : "tester";
  }

  function renderIdentity() {
    const headerAccount = one("#header-account");
    if (headerAccount) {
      headerAccount.dataset.authenticated = identity ? "true" : "false";
      headerAccount.textContent = identity ? tr("Mi aula tester") : tr("Entrar");
      headerAccount.setAttribute("aria-label", identity ? tr("Abrir mi acceso tester") : tr("Entrar en allwain"));
    }
  }

  function requestAuthentication(purpose = "session") {
    window.dispatchEvent(new CustomEvent("allwain:authrequest", { detail: { purpose } }));
  }

  function openTesterAntechamber() {
    const survey = one("#encuesta");
    survey?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    track("tester_survey_opened", { authenticated: Boolean(identity) });
  }

  async function openTesterEntry(event) {
    event?.preventDefault?.();
    if (identity?.token) {
      try {
        const response = await fetch(`${apiBase}/allwain/tester/state`, {
          method: "GET",
          mode: "cors",
          credentials: "include",
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
          referrerPolicy: "strict-origin-when-cross-origin",
          headers: { Accept: "application/json", Authorization: `Bearer ${identity.token}` }
        });
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.qualified === true) {
          track("tester_private_room_opened", { source: "public_web" });
          window.location.assign("/tester/");
          return;
        }
      } catch (_error) {
        // La encuesta pública sigue disponible aunque no se pueda comprobar el estado.
      }
    }
    openTesterAntechamber();
  }

  many("[data-tester-entry], #open-tester-antechamber, #open-tester-antechamber-secondary").forEach((entry) => entry.addEventListener("click", openTesterEntry));
  one("#header-account")?.addEventListener("click", (event) => identity ? void openTesterEntry(event) : requestAuthentication("session"));

  /* Mercado al revés. */
  const demandModels = {
    tv: { eyebrow: "24 PERSONAS · 20 KM", title: "Compara precio, garantía y montaje" },
    oranges: { eyebrow: "38 HOGARES · FOIOS", title: "Ajusta volumen, precio y entrega" },
    tables: { eyebrow: "7 NEGOCIOS · VALENCIA", title: "Revisa medidas, material y fecha" }
  };
  let selectedDemand = "oranges";
  let demandPrepared = false;

  function renderDemand() {
    const model = demandModels[selectedDemand];
    many("[data-demand]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.demand === selectedDemand ? "true" : "false"));
    translatedText(one("#mall-response-eyebrow"), model.eyebrow);
    translatedText(one("#mall-response-title"), demandPrepared ? "Oferta de ejemplo preparada para revisar" : model.title);
    const action = one("#mall-response-action");
    translatedText(action, demandPrepared ? "Preparada ✓" : "Preparar oferta");
    action?.classList.toggle("is-ready", demandPrepared);
  }

  many("[data-demand]").forEach((button) => button.addEventListener("click", () => {
    selectedDemand = button.dataset.demand;
    demandPrepared = false;
    renderDemand();
    track("prototype_interaction", { screen: "reverse", action: "select_demand", variant: selectedDemand });
  }));
  one("#mall-response-action")?.addEventListener("click", () => {
    demandPrepared = true;
    renderDemand();
    selectedSellerRequest = selectedDemand === "tables" ? "table" : selectedDemand;
    configureSellerRange(true);
    one("#seller-builder")?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    track("prototype_interaction", { screen: "reverse", action: "prepare_offer", variant: selectedDemand });
  });

  /* Visor de compra. */
  const viewerState = { size: "55", budget: "700", delivery: "Entrega", requested: false, offer: "" };

  function currentLocality() {
    return one("[data-locality]")?.textContent?.trim() || "Foios";
  }

  function viewerOffers() {
    const base = { "50": 529, "55": 649, "65": 849 }[viewerState.size];
    const deliveryCost = viewerState.delivery === "Entrega" ? 20 : 0;
    return [
      { id: "pickup", title: "Precio ajustado", price: base + deliveryCost, timing: "48 h", service: viewerState.delivery },
      { id: "install", title: "Con instalación", price: base + deliveryCost + 35, timing: "72 h", service: "Instalación incluida" },
      { id: "delivery", title: "Más rápido", price: base + deliveryCost + 50, timing: "24 h", service: viewerState.delivery }
    ];
  }

  function money(value) {
    return new Intl.NumberFormat(window.AllwainI18n?.locale || "es", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
  }

  function renderViewer() {
    translatedText(one("#viewer-product-title"), "Televisor QLED {size}″", { size: viewerState.size });
    translatedText(one("#viewer-budget-copy"), "Presupuesto máximo: {budget} €", { budget: viewerState.budget });
    translatedText(one("#viewer-delivery-copy"), "{delivery} en {locality}", { delivery: tr(viewerState.delivery), locality: currentLocality() });
    many("[data-viewer-size]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.viewerSize === viewerState.size ? "true" : "false"));
    many("[data-viewer-budget]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.viewerBudget === viewerState.budget ? "true" : "false"));
    many("[data-viewer-delivery]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.viewerDelivery === viewerState.delivery ? "true" : "false"));
    one(".request-viewer")?.classList.toggle("is-requested", viewerState.requested);
    const requestButton = one("#community-request");
    requestButton?.setAttribute("aria-pressed", viewerState.requested ? "true" : "false");
    translatedButton(requestButton, viewerState.requested ? "Petición preparada ✓" : "Pedir a la comunidad");
    const offers = viewerOffers();
    const available = offers.filter((offer) => offer.price <= Number(viewerState.budget)).length;
    const offersElement = one("#community-offers");
    if (offersElement) offersElement.hidden = !viewerState.requested;
    translatedText(one("#community-request-status"),
      !viewerState.requested ? "Lista para revisar. Nada se publica desde esta demostración."
        : available ? "{count} de 3 respuestas encajan en tu presupuesto. Toca una para ver los detalles."
          : "Ninguna respuesta de ejemplo encaja en este presupuesto. Prueba otro tamaño o importe.",
      { count: available });
    offers.forEach((offer) => {
      const button = one('[data-offer="' + offer.id + '"]');
      if (!button) return;
      button.setAttribute("aria-pressed", String(offer.id === viewerState.offer));
      button.dataset.withinBudget = String(offer.price <= Number(viewerState.budget));
      translatedText(button.querySelector("strong"), money(offer.price));
      translatedText(button.querySelector("span"), offer.title);
      translatedText(button.querySelector("small"), offer.price <= Number(viewerState.budget) ? "Dentro del presupuesto" : "Supera el presupuesto");
    });
    const comparison = one("#offer-comparison");
    const selected = offers.find((offer) => offer.id === viewerState.offer);
    if (!comparison) return;
    comparison.hidden = !viewerState.requested || !selected;
    comparison.replaceChildren();
    if (!selected || !viewerState.requested) return;
    const heading = document.createElement("strong");
    heading.textContent = tr("Televisor QLED {size}″", { size: viewerState.size }) + " · " + tr(selected.title);
    const details = document.createElement("dl");
    const rows = [
      ["Precio total de ejemplo", money(selected.price)],
      ["Cómo recibirlo", tr("{delivery} en {locality}", { delivery: tr(viewerState.delivery), locality: currentLocality() })],
      ["Servicio", tr(selected.service)],
      ["Plazo de ejemplo", selected.timing],
      ["Garantía de ejemplo", tr("3 años")]
    ];
    rows.forEach(([label, value]) => {
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = tr(label); description.textContent = value;
      details.append(term, description);
    });
    const gap = document.createElement("p");
    const difference = Number(viewerState.budget) - selected.price;
    gap.textContent = difference >= 0
      ? tr("Te quedan {amount} de margen sobre tu presupuesto.", { amount: money(difference) })
      : tr("Esta respuesta supera tu presupuesto en {amount}.", { amount: money(-difference) });
    comparison.append(heading, details, gap);
  }

  many("[data-viewer-size], [data-viewer-budget], [data-viewer-delivery]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.viewerSize) viewerState.size = button.dataset.viewerSize;
    if (button.dataset.viewerBudget) viewerState.budget = button.dataset.viewerBudget;
    if (button.dataset.viewerDelivery) viewerState.delivery = button.dataset.viewerDelivery;
    viewerState.requested = false;
    viewerState.offer = "";
    renderViewer();
    track("prototype_interaction", { screen: "buyer", action: "configure_request" });
  }));
  one("#community-request")?.addEventListener("click", () => {
    viewerState.requested = !viewerState.requested;
    viewerState.offer = "";
    renderViewer();
    track("prototype_interaction", { screen: "buyer", action: viewerState.requested ? "show_offers" : "hide_offers" });
  });
  many("[data-offer]").forEach((button) => button.addEventListener("click", () => {
    viewerState.offer = button.dataset.offer;
    renderViewer();
    track("prototype_interaction", { screen: "buyer", action: "compare_offer", variant: viewerState.offer });
  }));
  one("#viewer-reset")?.addEventListener("click", () => {
    Object.assign(viewerState, { size: "55", budget: "700", delivery: "Entrega", requested: false, offer: "" });
    renderViewer();
    track("prototype_interaction", { screen: "buyer", action: "reset" });
  });

  /* Oferta de vendedor. */
  const sellerModels = {
    tv: { label: "TV 55″ para 24 personas", min: 500, max: 900, step: 10, value: 650, unit: "€" },
    oranges: { label: "naranjas locales para 38 hogares", min: .8, max: 1.4, step: .05, value: 1, unit: "€/kg" },
    table: { label: "mesas a medida para 7 negocios", min: 150, max: 500, step: 10, value: 280, unit: "€" }
  };
  let selectedSellerRequest = "oranges";

  function formatPrice(value, model) {
    const locale = window.AllwainI18n?.locale || "es";
    const digits = model.step < 1 ? 2 : 0;
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value))} ${model.unit}`;
  }

  function configureSellerRange(resetValue = true) {
    const input = one("#seller-price");
    const model = sellerModels[selectedSellerRequest];
    if (!input || !model) return;
    input.min = String(model.min);
    input.max = String(model.max);
    input.step = String(model.step);
    if (resetValue) input.value = String(model.value);
    translatedText(one("#seller-price-output"), formatPrice(input.value, model));
    many("[data-seller-request]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.sellerRequest === selectedSellerRequest ? "true" : "false"));
    translatedText(one("#seller-status"), "Seleccionada: {request}. Nada se envía desde esta maqueta.", { request: tr(model.label) });
  }

  many("[data-seller-request]").forEach((button) => button.addEventListener("click", () => {
    selectedSellerRequest = button.dataset.sellerRequest;
    configureSellerRange(true);
    track("prototype_interaction", { screen: "seller", action: "select_request", variant: selectedSellerRequest });
  }));
  one("#seller-price")?.addEventListener("input", (event) => {
    translatedText(one("#seller-price-output"), formatPrice(event.target.value, sellerModels[selectedSellerRequest]));
  });
  one("#seller-offer")?.addEventListener("click", () => {
    const model = sellerModels[selectedSellerRequest];
    const price = formatPrice(one("#seller-price")?.value || model.value, model);
    translatedText(one("#seller-status"), "Oferta de ejemplo a {price}, preparada para revisar. No se ha enviado.", { price });
    track("prototype_interaction", { screen: "seller", action: "prepare_offer", variant: selectedSellerRequest });
  });
  one("#seller-negotiate")?.addEventListener("click", () => {
    translatedText(one("#seller-status"), "Pedirías un dato que falta antes de ofertar. No se ha enviado ningún mensaje.");
    track("prototype_interaction", { screen: "seller", action: "request_detail", variant: selectedSellerRequest });
  });

  /* Red del conector. */
  const zoneModels = {
    start: { total: "8 personas · 2 negocios", copy: "Ejemplo de red inicial: el beneficio solo se compartiría cuando existan operaciones válidas y terminadas." },
    village: { total: "42 personas · 9 negocios", copy: "Ejemplo de red de pueblo: se atribuye quién llegó contigo y qué operaciones completa, nunca simples altas." },
    district: { total: "125 personas · 24 negocios", copy: "Ejemplo de comarca: más alcance exige más soporte y reglas claras; no implica ingresos garantizados." }
  };
  let zoneSize = "start";

  function renderZone() {
    many("[data-zone-size]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.zoneSize === zoneSize ? "true" : "false"));
    const output = one("#zone-simulator-result");
    translatedText(output?.querySelector("strong"), zoneModels[zoneSize].total);
    translatedText(output?.querySelector("span"), zoneModels[zoneSize].copy);
  }
  many("[data-zone-size]").forEach((button) => button.addEventListener("click", () => {
    zoneSize = button.dataset.zoneSize;
    renderZone();
    track("prototype_interaction", { screen: "connector", action: "simulate_network", variant: zoneSize });
  }));

  /* Comprobaciones km 0. */
  const routeModels = [
    { marker: "PASO 1 DE 4", title: "Antes de aceptar, todo debe estar claro.", copy: "La persona que reparte ve distancia, importe y condiciones. Esta maqueta no inicia ninguna ruta." },
    { marker: "PASO 2 DE 4", title: "La recogida deja una prueba verificable.", copy: "El primer QR y la hora confirman que el producto ha salido del punto acordado." },
    { marker: "PASO 3 DE 4", title: "La ruta une dos puntos cercanos.", copy: "Se muestra el trayecto local necesario, sin publicar el domicilio de ninguna persona." },
    { marker: "PASO 4 DE 4", title: "La entrega cierra la ruta.", copy: "El segundo QR confirma la recepción y permite cerrar la operación con un rastro comprensible." }
  ];
  let routeStep = 0;

  function renderRoute() {
    many("[data-route-step]").forEach((button) => button.setAttribute("aria-pressed", Number(button.dataset.routeStep) === routeStep ? "true" : "false"));
    const panel = one("#route-step-detail");
    const model = routeModels[routeStep];
    translatedText(panel?.querySelector(":scope > span"), model.marker);
    translatedText(panel?.querySelector(":scope > strong"), model.title);
    translatedText(panel?.querySelector(":scope > p"), model.copy);
    const bar = panel?.querySelector("i");
    if (bar) bar.style.width = `${(routeStep + 1) * 25}%`;
  }
  many("[data-route-step]").forEach((button) => button.addEventListener("click", () => {
    routeStep = Number(button.dataset.routeStep) || 0;
    renderRoute();
    track("prototype_interaction", { screen: "km0", action: "open_checkpoint", variant: String(routeStep + 1) });
  }));

  window.addEventListener("allwain:localitychange", renderViewer);

  window.addEventListener("allwain:identitychange", (event) => {
    identity = event.detail?.identity || null;
    renderIdentity();
  });

  window.addEventListener("allwain:localechange", () => {
    renderIdentity();
    renderDemand();
    renderViewer();
    configureSellerRange(false);
    renderZone();
    renderRoute();
  });

  renderIdentity();
  renderDemand();
  renderViewer();
  configureSellerRange(true);
  renderZone();
  renderRoute();
  window.setTimeout(async () => {
    try {
      const refreshed = await window.AllwainWebAuth?.refresh?.();
      if (refreshed) {
        identity = refreshed;
        renderIdentity();
      }
    } catch (_error) {
      // Signed-out visitors can still use every local prototype.
    }
  }, 0);
})();
