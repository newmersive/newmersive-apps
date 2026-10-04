"use strict";

const allwainApiBase = "https://api.allwain.es/api";
const publicGuideEndpoint = `${allwainApiBase}/allwain/public-guide/messages`;
const feedbackPendingStorageKey = "allwain.pioneer-feedback.pending.v1";
const tr = (source, replacements = {}) => {
  if (window.AllwainI18n?.translate) return window.AllwainI18n.translate(source, replacements);
  return Object.entries(replacements).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    source
  );
};
const activeLocale = () => window.AllwainI18n?.locale || "es";
const guideLauncher = document.querySelector("#guide-launcher");
const openGuideButton = document.querySelector("#open-guide");
const closeGuideButton = document.querySelector("#close-guide");
const guidePanel = document.querySelector("#guide-panel");
const guideMessages = document.querySelector("#guide-messages");
const guideForm = document.querySelector("#guide-form");
const guideInput = document.querySelector("#guide-input");
const guideStarters = document.querySelector("#guide-starters");
const pioneersSection = document.querySelector("#pioneros");
const screens = [...document.querySelectorAll(".screen[id], .purchase-story[id]")];
const screenNavigation = document.querySelector(".screen-dots");
const screenLinks = [...document.querySelectorAll(".screen-dots a[href^='#']")];
const useLocationButton = document.querySelector("#use-location");
const locationStatus = document.querySelector("#location-status");
const localityNodes = [...document.querySelectorAll("[data-locality]")];
const routeOriginNodes = [...document.querySelectorAll("[data-route-origin]")];
const routeDestinationNodes = [...document.querySelectorAll("[data-route-destination]")];
const communityRequestButton = document.querySelector("#community-request");
const communityRequestStatus = document.querySelector("#community-request-status");
const pioneerFeedbackForm = document.querySelector("#pioneer-feedback");
const feedbackStatus = document.querySelector("#feedback-status");
const feedbackSubmitButton = pioneerFeedbackForm?.querySelector('button[type="submit"]');
const feedbackAuthDialog = document.querySelector("#feedback-auth-dialog");
const feedbackAuthClose = document.querySelector("#feedback-auth-close");
const feedbackAuthForm = document.querySelector("#feedback-auth-form");
const feedbackAuthNameRow = document.querySelector("#feedback-auth-name-row");
const feedbackAuthName = document.querySelector("#feedback-auth-name");
const feedbackAuthEmail = document.querySelector("#feedback-auth-email");
const feedbackAuthPassword = document.querySelector("#feedback-auth-password");
const feedbackAuthPasswordRow = document.querySelector("#feedback-auth-password-row");
const feedbackPasswordToggle = document.querySelector("#feedback-password-toggle");
const feedbackAuthForgot = document.querySelector("#feedback-auth-forgot");
const feedbackAuthBack = document.querySelector("#feedback-auth-back");
const feedbackGoogleHost = document.querySelector("#feedback-google-auth");
const feedbackAuthConsentRow = document.querySelector("#feedback-auth-consent-row");
const feedbackAuthConsent = document.querySelector("#feedback-auth-consent");
const feedbackAuthSubmit = document.querySelector("#feedback-auth-submit");
const feedbackAuthStatus = document.querySelector("#feedback-auth-status");
const feedbackAuthModeButtons = [...document.querySelectorAll("[data-feedback-auth-mode]")];
const dynamicCopies = new Map();
class FeedbackError extends Error {}
const guideBackground = [
  document.querySelector(".site-header"),
  document.querySelector("main"),
  document.querySelector(".site-footer")
].filter(Boolean);

let guideActivator = guideLauncher;
let guideBusy = false;
let feedbackBusy = false;
let feedbackAuthMode = "login";
let feedbackAuthPurpose = "session";
let pendingFeedbackMemory = null;
let currentWebIdentity = null;
let feedbackIdentityRefresh = null;
let feedbackGoogleAccess = null;
const guideConversation = [];

function setDynamicCopy(element, source, replacements = {}, preserveLeadingElement = false) {
  if (!element) return;
  dynamicCopies.set(element, { source, replacements, preserveLeadingElement });
  const resolvedReplacements = Object.fromEntries(
    Object.entries(replacements).map(([name, value]) => [name, typeof value === "function" ? value() : value])
  );
  const translated = tr(source, resolvedReplacements);
  if (preserveLeadingElement && element.firstElementChild) {
    [...element.childNodes]
      .filter((node) => node !== element.firstElementChild)
      .forEach((node) => node.remove());
    element.append(document.createTextNode(translated));
  } else {
    element.textContent = translated;
  }
}

function refreshDynamicCopies() {
  dynamicCopies.forEach(({ source, replacements, preserveLeadingElement }, element) => {
    setDynamicCopy(element, source, replacements, preserveLeadingElement);
  });
}

function setGuideMessageLocale(message, locale, translated) {
  if (!message) return;
  message.lang = locale;
  message.dir = translated ? (locale === "ar" ? "rtl" : "ltr") : "auto";
}

function refreshGuideMessageLocales() {
  guideMessages?.querySelectorAll('[data-guide-translatable="true"]').forEach((message) => {
    setGuideMessageLocale(message, activeLocale(), true);
  });
  guideMessages?.querySelectorAll('[data-guide-translatable-part="true"]').forEach((element) => {
    element.lang = activeLocale();
    element.dir = activeLocale() === "ar" ? "rtl" : "ltr";
  });
}

setDynamicCopy(useLocationButton, "Usar mi localidad");
setDynamicCopy(locationStatus, "Opcional. Tu navegador pedirá permiso y comparará la posición con localidades cercanas dentro del dispositivo. allwain no la guarda ni la envía.");
setDynamicCopy(communityRequestButton, "Pedir a la comunidad", {}, true);
setDynamicCopy(communityRequestStatus, "Lista para revisar. Nada se publica desde esta demostración.");
setDynamicCopy(feedbackSubmitButton, "Identificarme y enviar");
setDynamicCopy(feedbackStatus, "Tu opinión se enviará automáticamente cuando confirmemos tu identidad. No abriremos el correo.");
setDynamicCopy(feedbackAuthSubmit, "Entrar");
setDynamicCopy(feedbackAuthStatus, "Tu contraseña viaja cifrada y no se guarda en esta página.");
window.addEventListener("allwain:localechange", () => {
  refreshDynamicCopies();
  refreshGuideMessageLocales();
  const currentHref = document.querySelector('.screen-dots a[aria-current="location"]')?.getAttribute("href");
  if (currentHref?.startsWith("#")) {
    window.requestAnimationFrame(() => markCurrentScreen(currentHref.slice(1)));
  }
});

function markCurrentScreen(id) {
  // The model has its own menu entry; pilot details remain under the pilot.
  const topic = { "primera-prueba": "inicio", km0: "inicio" }[id] || id;
  let currentLink = null;
  screenLinks.forEach((link) => {
    if (link.getAttribute("href") === `#${topic}`) {
      link.setAttribute("aria-current", "location");
      currentLink = link;
    } else link.removeAttribute("aria-current");
  });
  if (!currentLink || !screenNavigation || screenNavigation.scrollWidth <= screenNavigation.clientWidth) return;
  window.requestAnimationFrame(() => {
    const navigationBounds = screenNavigation.getBoundingClientRect();
    const linkBounds = currentLink.getBoundingClientRect();
    const leftOverflow = linkBounds.left - navigationBounds.left - 5;
    const rightOverflow = linkBounds.right - navigationBounds.right + 5;
    // Physical bounds work in both LTR and RTL; leave the page scroll untouched.
    screenNavigation.scrollBy({
      left: leftOverflow < 0 ? leftOverflow : Math.max(0, rightOverflow),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
  });
}

if (screens.length) {
  let screenFrame = 0;
  const updateCurrentScreen = () => {
    screenFrame = 0;
    // Follow the chapter below the header, including a short chapter such as
    // Del revés even when the next chapter already reaches the viewport centre.
    const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom || 0;
    const readingLine = headerBottom + 96;
    const current = screens.reduce((selected, screen) =>
      screen.getBoundingClientRect().top <= readingLine ? screen : selected, screens[0]);
    markCurrentScreen(current.id);
  };
  const scheduleCurrentScreen = () => {
    if (!screenFrame) screenFrame = window.requestAnimationFrame(updateCurrentScreen);
  };
  window.addEventListener("scroll", scheduleCurrentScreen, { passive: true });
  window.addEventListener("resize", scheduleCurrentScreen);
  window.addEventListener("load", scheduleCurrentScreen, { once: true });
  scheduleCurrentScreen();
}

// Every chapter is in normal document flow. Scrolling never locks or hides content.
const storyChapters = [...document.querySelectorAll("[data-story-chapter], .model-topic")];
if ("IntersectionObserver" in window) {
  const chapterObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-seen");
        chapterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  storyChapters.forEach((chapter) => chapterObserver.observe(chapter));
  const survey = document.querySelector("#encuesta");
  if (survey) new IntersectionObserver(([entry]) => {
    document.body.classList.toggle("survey-active", entry.isIntersecting);
  }, { threshold: 0 }).observe(survey);
}

function restoreScreenHash() {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const target = id && document.getElementById(id);
  if (!target || !document.querySelector("main")?.contains(target)) return;
  // Shared links to an example also reveal its disclosure before scrolling.
  const disclosure = target.closest("details") || target.querySelector(":scope > details");
  if (disclosure) disclosure.open = true;
  const screen = target.closest(".screen, .purchase-story");
  if (screen) markCurrentScreen(screen.id);
  target.scrollIntoView({ block: "start", behavior: "instant" });
}
window.addEventListener("load", restoreScreenHash, { once: true });
window.addEventListener("hashchange", restoreScreenHash);
document.fonts?.ready.then(() => { if (window.scrollY < 200) restoreScreenHash(); });

function safeLocality(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[^\p{L}\p{M}\s.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 42);
}

function showLocality(value) {
  const locality = safeLocality(value) || "Foios";
  [...localityNodes, ...routeOriginNodes, ...routeDestinationNodes].forEach((node) => {
    node.textContent = locality;
  });
  window.dispatchEvent(new CustomEvent("allwain:localitychange", { detail: { locality } }));
}

function distanceInKm(latitudeA, longitudeA, latitudeB, longitudeB) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDistance = radians(latitudeB - latitudeA);
  const longitudeDistance = radians(longitudeB - longitudeA);
  const a = Math.sin(latitudeDistance / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB))
    * Math.sin(longitudeDistance / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestKnownLocality(latitude, longitude) {
  const known = [
    { name: "Foios", latitude: 39.536, longitude: -0.356 },
    { name: "Alboraya", latitude: 39.500, longitude: -0.350 },
    { name: "Valencia", latitude: 39.470, longitude: -0.376 },
    { name: "Albuixech", latitude: 39.545, longitude: -0.323 },
    { name: "Almàssera", latitude: 39.512, longitude: -0.356 },
    { name: "Albalat dels Sorells", latitude: 39.544, longitude: -0.347 },
    { name: "Bonrepòs i Mirambell", latitude: 39.518, longitude: -0.365 },
    { name: "Burjassot", latitude: 39.510, longitude: -0.413 },
    { name: "El Puig", latitude: 39.588, longitude: -0.303 },
    { name: "Godella", latitude: 39.522, longitude: -0.417 },
    { name: "Massalfassar", latitude: 39.556, longitude: -0.326 },
    { name: "Massamagrell", latitude: 39.571, longitude: -0.334 },
    { name: "Meliana", latitude: 39.528, longitude: -0.349 },
    { name: "Moncada", latitude: 39.545, longitude: -0.395 },
    { name: "Museros", latitude: 39.565, longitude: -0.341 },
    { name: "Puçol", latitude: 39.616, longitude: -0.303 },
    { name: "Rafelbunyol", latitude: 39.589, longitude: -0.333 },
    { name: "Rocafort", latitude: 39.533, longitude: -0.410 },
    { name: "Tavernes Blanques", latitude: 39.506, longitude: -0.365 },
    { name: "Vinalesa", latitude: 39.538, longitude: -0.369 }
  ];
  const nearest = known
    .map((place) => ({ ...place, distance: distanceInKm(latitude, longitude, place.latitude, place.longitude) }))
    .sort((a, b) => a.distance - b.distance)[0];
  return nearest?.distance <= 35 ? nearest.name : "";
}

async function personalizeWithLocation() {
  if (!useLocationButton || !locationStatus) return;
  if (!("geolocation" in navigator)) {
    setDynamicCopy(locationStatus, "Este navegador no ofrece geolocalización. Mantenemos de Foios a Foios.");
    return;
  }
  useLocationButton.disabled = true;
  useLocationButton.setAttribute("aria-busy", "true");
  setDynamicCopy(useLocationButton, "Buscando localidad…");
  setDynamicCopy(locationStatus, "Esperando tu permiso. No guardaremos la ubicación.");
  let locationResolved = false;

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        maximumAge: 10 * 60 * 1000,
        timeout: 9000
      });
    });
    const { latitude, longitude } = position.coords;
    const locality = nearestKnownLocality(latitude, longitude);
    if (!locality) {
      setDynamicCopy(locationStatus, "Tenemos una zona aproximada, pero no un nombre fiable. Mantenemos de Foios a Foios.");
      return;
    }
    showLocality(locality);
    locationResolved = true;
    setDynamicCopy(useLocationButton, "Localidad actualizada");
    setDynamicCopy(locationStatus, "Mostramos {locality} con una comparación hecha en tu dispositivo. allwain no guarda ni envía tu posición.", { locality });
  } catch (error) {
    const denied = error?.code === 1;
    setDynamicCopy(
      locationStatus,
      denied
        ? "Sin permiso de ubicación. Mantenemos de Foios a Foios."
        : "No hemos podido obtener la localidad. Mantenemos de Foios a Foios."
    );
  } finally {
    useLocationButton.disabled = false;
    useLocationButton.removeAttribute("aria-busy");
    if (!locationResolved) setDynamicCopy(useLocationButton, "Usar mi localidad");
  }
}

useLocationButton?.addEventListener("click", personalizeWithLocation);

const feedbackLabels = {
  web_clara: "Web clara",
  propuesta_clara: "Propuesta clara",
  preventa: "Interés en preventa",
  valor: "Valor principal",
  sostenibilidad: "Sostenibilidad comprensible",
  tester: "Disposición a probar",
  papel: "Papel",
  comentario: "Comentario"
};

const feedbackValueLabels = {
  web_clara: { yes: "Sí", partial: "Más o menos", no: "No" },
  propuesta_clara: { yes: "Sí", partial: "Algo", no: "No" },
  preventa: { yes: "Sí", maybe: "Quizá", no: "No" },
  valor: { freshness: "Frescura", savings: "Ahorro", local_economy: "Economía local" },
  sostenibilidad: { yes: "Sí", partial: "Algo", no: "No" },
  tester: { yes: "Sí", maybe: "Quizá", not_now: "No ahora" },
  papel: { buyer: "Comprar", seller: "Vender", connector: "Conectar", observer: "Observar" }
};

function feedbackSubmissionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function setFeedbackStatus(message, state = "", replacements = {}) {
  if (!feedbackStatus) return;
  setDynamicCopy(feedbackStatus, message, replacements);
  if (state) feedbackStatus.dataset.state = state;
  else delete feedbackStatus.dataset.state;
}

function setFeedbackAuthStatus(message, state = "", replacements = {}) {
  if (!feedbackAuthStatus) return;
  setDynamicCopy(feedbackAuthStatus, message, replacements);
  if (state) feedbackAuthStatus.dataset.state = state;
  else delete feedbackAuthStatus.dataset.state;
}

function readPendingFeedback() {
  try {
    const stored = window.sessionStorage.getItem(feedbackPendingStorageKey);
    if (stored) return JSON.parse(stored);
  } catch {
    // The in-memory copy still lets the current page complete the send.
  }
  return pendingFeedbackMemory;
}

function savePendingFeedback(payload) {
  pendingFeedbackMemory = payload;
  try {
    window.sessionStorage.setItem(feedbackPendingStorageKey, JSON.stringify(payload));
  } catch {
    // Private browsing may deny storage; keep the current-page copy instead.
  }
}

function clearPendingFeedback() {
  pendingFeedbackMemory = null;
  try {
    window.sessionStorage.removeItem(feedbackPendingStorageKey);
  } catch {
    // Nothing else is required after a confirmed send.
  }
}

function buildPendingFeedback() {
  const entries = [...new FormData(pioneerFeedbackForm).entries()]
    .map(([key, value]) => [key, String(value).trim()])
    .filter(([, value]) => value);
  return {
    submissionId: feedbackSubmissionId(),
    createdAt: new Date().toISOString(),
    release: document.querySelector('meta[name="allwain-release"]')?.content || "unknown",
    locale: activeLocale(),
    answers: Object.fromEntries(entries)
  };
}

function feedbackMessage(payload) {
  const answers = Object.entries(payload.answers || {})
    .filter(([, value]) => String(value).trim())
    .map(([key, value]) => {
      const canonicalValue = key === "comentario"
        ? String(value).trim()
        : feedbackValueLabels[key]?.[String(value).trim()] || String(value).trim();
      return `${feedbackLabels[key] || key}: ${canonicalValue}`;
    });
  return [
    "ENCUESTA PIONEROS WEB",
    `Referencia: ${payload.submissionId}`,
    `Versión: ${payload.release}`,
    `Idioma: ${payload.locale || "es"}`,
    "",
    ...(answers.length ? answers : ["Sin respuestas seleccionadas."])
  ].join("\n").slice(0, 2000);
}

async function feedbackApi(path, body, token = "") {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${allwainApiBase}${path}`, {
      method: "POST", mode: "cors", credentials: "include", cache: "no-store",
      referrerPolicy: "strict-origin-when-cross-origin", signal: controller.signal,
      headers, body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null);
    return { response, payload };
  } catch (error) {
    if (error.name === "AbortError") throw new FeedbackError("La conexión tarda demasiado. Tus respuestas siguen guardadas; vuelve a intentarlo.");
    throw error;
  } finally { window.clearTimeout(timeout); }
}

async function refreshFeedbackIdentity() {
  if (feedbackIdentityRefresh) return feedbackIdentityRefresh;
  feedbackIdentityRefresh = (async () => {
    const { response, payload } = await feedbackApi("/auth/refresh", { sourceApp: "allwain" });
    if (response.status === 401) {
      currentWebIdentity = null;
      window.dispatchEvent(new CustomEvent("allwain:identitychange", { detail: { identity: null } }));
      return null;
    }
    if (!response.ok || typeof payload?.token !== "string" || !payload?.user?.email) {
      throw new FeedbackError("No hemos podido comprobar tu identidad ahora.");
    }
    await window.AllwainI18n?.acceptIdentity?.(payload.user, payload.token);
    currentWebIdentity = { token: payload.token, user: payload.user };
    window.dispatchEvent(new CustomEvent("allwain:identitychange", { detail: { identity: currentWebIdentity } }));
    return currentWebIdentity;
  })();
  try {
    return await feedbackIdentityRefresh;
  } finally {
    feedbackIdentityRefresh = null;
  }
}

async function sendPendingFeedback(identity) {
  const pending = readPendingFeedback();
  if (!pending) return false;
  const { comentario = "", ...answers } = pending.answers || {};
  const { response, payload } = await feedbackApi("/allwain/tester/feedback", {
    submissionId: pending.submissionId,
    schemaVersion: 1,
    release: pending.release,
    locale: pending.locale,
    answers,
    comment: comentario
  }, identity.token);
  if (response.status === 401) return false;
  if (!response.ok) throw new FeedbackError(response.status === 400 ? "Revisa las respuestas antes de enviarlas." : "No hemos podido guardar tu opinión. Inténtalo de nuevo.");

  clearPendingFeedback();
  pioneerFeedbackForm?.reset();
  if (feedbackSubmitButton) {
    setDynamicCopy(feedbackSubmitButton, "Opinión enviada ✓");
    feedbackSubmitButton.disabled = true;
  }
  setFeedbackStatus("Gracias. Tu opinión ya está registrada y vinculada a tu identidad de allwain.", "success");
  window.dispatchEvent(new CustomEvent("allwain:testerqualified", {
    detail: { submissionId: pending.submissionId }
  }));
  window.setTimeout(() => window.location.assign("/tester/"), 700);
  return true;
}

function setFeedbackAuthMode(mode) {
  feedbackAuthMode = mode === "register" ? "register" : mode === "forgot" ? "forgot" : "login";
  const recovering = feedbackAuthMode === "forgot";
  if (feedbackGoogleHost) feedbackGoogleHost.hidden = recovering;
  const modes = feedbackAuthDialog?.querySelector(".feedback-auth-modes");
  if (modes) modes.hidden = recovering;
  if (feedbackAuthPasswordRow) feedbackAuthPasswordRow.hidden = recovering;
  if (feedbackAuthForgot) feedbackAuthForgot.hidden = recovering || feedbackAuthMode === "register";
  if (feedbackAuthBack) feedbackAuthBack.hidden = !recovering;
  setDynamicCopy(document.querySelector("#feedback-auth-title"), recovering ? "Recupera tu acceso." : "Identifícate para continuar.");
  feedbackAuthModeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.feedbackAuthMode === feedbackAuthMode ? "true" : "false");
  });
  if (feedbackAuthNameRow) feedbackAuthNameRow.hidden = feedbackAuthMode !== "register";
  if (feedbackAuthName) feedbackAuthName.required = feedbackAuthMode === "register";
  if (feedbackAuthConsentRow) feedbackAuthConsentRow.hidden = feedbackAuthMode !== "register";
  if (feedbackAuthConsent) feedbackAuthConsent.required = feedbackAuthMode === "register";
  if (feedbackAuthPassword) {
    feedbackAuthPassword.required = !recovering;
    feedbackAuthPassword.type = "password";
    feedbackAuthPassword.autocomplete = feedbackAuthMode === "register" ? "new-password" : "current-password";
    if (feedbackAuthMode === "register") feedbackAuthPassword.minLength = 12;
    else feedbackAuthPassword.removeAttribute("minlength");
  }
  feedbackPasswordToggle?.setAttribute("aria-pressed", "false");
  setDynamicCopy(feedbackPasswordToggle, "Mostrar");
  if (feedbackAuthSubmit) {
    setDynamicCopy(
      feedbackAuthSubmit,
      recovering ? "Enviar enlace de recuperación" : feedbackAuthMode === "register"
        ? (feedbackAuthPurpose === "feedback" ? "Crear cuenta y enviar" : "Crear cuenta")
        : (feedbackAuthPurpose === "feedback" ? "Entrar y enviar" : "Entrar")
    );
  }
  setFeedbackAuthStatus(
    recovering ? "Escribe tu email y te enviaremos un enlace para crear una contraseña nueva."
      : feedbackAuthMode === "register"
      ? "Crea tu identidad de allwain. Usa al menos 12 caracteres en la contraseña."
      : "Al entrar recuperaremos de forma segura tu recorrido de prueba."
  );
}

function openFeedbackAuth(purpose = "session") {
  if (!feedbackAuthDialog) return;
  if (feedbackBusy && feedbackAuthDialog.open) return;
  feedbackAuthPurpose = purpose === "feedback" ? "feedback" : "session";
  setFeedbackAuthMode(purpose === "tester" ? "register" : "login");
  feedbackGoogleAccess?.prepare();
  if (typeof feedbackAuthDialog.showModal === "function") feedbackAuthDialog.showModal();
  else feedbackAuthDialog.setAttribute("open", "");
  window.setTimeout(() => feedbackAuthClose?.focus(), 0);
}

function closeFeedbackAuth() {
  if (!feedbackAuthDialog) return;
  feedbackGoogleAccess?.cancel();
  if (typeof feedbackAuthDialog.close === "function") feedbackAuthDialog.close();
  else feedbackAuthDialog.removeAttribute("open");
}

async function attemptFeedbackDelivery(showAuthIfNeeded = false) {
  if (feedbackBusy || !readPendingFeedback()) return;
  feedbackBusy = true;
  if (feedbackSubmitButton) {
    feedbackSubmitButton.disabled = true;
    feedbackSubmitButton.setAttribute("aria-busy", "true");
  }
  setFeedbackStatus("Comprobando tu identidad…");
  try {
    const identity = await refreshFeedbackIdentity();
    if (!identity) {
      setFeedbackStatus("Identifícate para validar y enviar la encuesta. Tus respuestas siguen aquí.");
      if (showAuthIfNeeded) openFeedbackAuth("feedback");
      return;
    }
    await sendPendingFeedback(identity);
  } catch (error) {
    setFeedbackStatus(error instanceof FeedbackError ? error.message : "No hemos podido enviar tu opinión.", "error");
  } finally {
    feedbackBusy = false;
    if (feedbackSubmitButton && readPendingFeedback()) feedbackSubmitButton.disabled = false;
    feedbackSubmitButton?.removeAttribute("aria-busy");
  }
}

pioneerFeedbackForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const pending = buildPendingFeedback();
  if (!pending.answers?.papel) {
    setFeedbackStatus("Elige cómo participar para personalizar tu ruta privada.", "error");
    pioneerFeedbackForm.querySelector('input[name="papel"]')?.focus();
    return;
  }
  if (!Object.values(pending.answers || {}).some((value) => String(value).trim())) {
    setFeedbackStatus("Elige al menos una respuesta. Puedes dejar las demás en blanco.", "error");
    return;
  }
  savePendingFeedback(pending);
  void attemptFeedbackDelivery(true);
});

pioneerFeedbackForm?.addEventListener("input", () => {
  if (!feedbackSubmitButton?.disabled || readPendingFeedback()) return;
  feedbackSubmitButton.disabled = false;
  setDynamicCopy(feedbackSubmitButton, "Identificarme y enviar");
  setFeedbackStatus("Tu opinión se enviará automáticamente cuando confirmemos tu identidad. No abriremos el correo.");
});

feedbackAuthModeButtons.forEach((button) => {
  button.addEventListener("click", () => { if (!feedbackBusy) setFeedbackAuthMode(button.dataset.feedbackAuthMode); });
});
feedbackAuthForgot?.addEventListener("click", () => {
  if (feedbackBusy) return;
  setFeedbackAuthMode("forgot");
  feedbackAuthEmail?.focus();
});
feedbackAuthBack?.addEventListener("click", () => { if (!feedbackBusy) setFeedbackAuthMode("login"); });
feedbackPasswordToggle?.addEventListener("click", () => {
  if (!feedbackAuthPassword) return;
  const showing = feedbackAuthPassword.type === "password";
  feedbackAuthPassword.type = showing ? "text" : "password";
  feedbackPasswordToggle.setAttribute("aria-pressed", String(showing));
  setDynamicCopy(feedbackPasswordToggle, showing ? "Ocultar" : "Mostrar");
});
feedbackAuthClose?.addEventListener("click", closeFeedbackAuth);
feedbackAuthDialog?.addEventListener("cancel", () => {
  feedbackGoogleAccess?.cancel();
  setFeedbackStatus("Envío pendiente. Identifícate cuando quieras para registrarlo automáticamente.");
});

function setFeedbackAuthBusy(value) {
  feedbackBusy = value;
  [feedbackAuthSubmit, feedbackAuthForgot, feedbackAuthBack, ...feedbackAuthModeButtons].forEach((control) => {
    if (control) control.disabled = value;
  });
  feedbackAuthSubmit?.setAttribute("aria-busy", String(value));
}

async function acceptFeedbackIdentity(identity) {
  await window.AllwainI18n?.acceptIdentity?.(identity.user, identity.token);
  currentWebIdentity = identity;
  window.dispatchEvent(new CustomEvent("allwain:identitychange", { detail: { identity } }));
  const hasPendingFeedback = Boolean(readPendingFeedback());
  const sent = hasPendingFeedback ? await sendPendingFeedback(identity) : false;
  if (hasPendingFeedback && !sent) throw new FeedbackError("La sesión no se ha confirmado. Vuelve a intentarlo.");
  setFeedbackAuthStatus(sent ? "Identidad confirmada y opinión enviada." : "Identidad confirmada. Ya puedes continuar.", "success");
  if (feedbackAuthPassword) feedbackAuthPassword.value = "";
  if (feedbackAuthConsent) feedbackAuthConsent.checked = false;
  window.setTimeout(closeFeedbackAuth, 450);
  if (!sent) window.setTimeout(() => window.location.assign("/tester/"), 700);
}

feedbackGoogleAccess = window.AllwainGoogleAuth?.mount(feedbackGoogleHost, {
  canStart: () => !feedbackBusy,
  onBusy: setFeedbackAuthBusy,
  onIdentity: acceptFeedbackIdentity,
  onError: (message) => setFeedbackAuthStatus(message, "error")
});

feedbackAuthForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (feedbackBusy) return;
  const name = feedbackAuthName?.value.trim() || "";
  const email = feedbackAuthEmail?.value.trim().toLowerCase() || "";
  const password = feedbackAuthPassword?.value || "";
  if (feedbackAuthMode === "forgot") {
    if (!email) return;
    setFeedbackAuthBusy(true);
    setFeedbackAuthStatus("Preparando el enlace…");
    try {
      const { response, payload } = await feedbackApi("/auth/forgot-password", { email, sourceApp: "allwain" });
      if (!response.ok || payload?.ok !== true) throw new FeedbackError("No hemos podido enviar el enlace. Inténtalo de nuevo en unos minutos.");
      setFeedbackAuthStatus("Si hay una cuenta con este email, recibirás un enlace para cambiar la contraseña. Revisa también el correo no deseado.", "success");
    } catch (error) {
      setFeedbackAuthStatus(error instanceof FeedbackError ? error.message : "No hemos podido enviar el enlace. Inténtalo de nuevo en unos minutos.", "error");
    } finally {
      setFeedbackAuthBusy(false);
    }
    return;
  }
  if (!email || !password || (feedbackAuthMode === "register" && !name)) {
    setFeedbackAuthStatus("Completa los datos para continuar.", "error");
    return;
  }
  if (feedbackAuthMode === "register" && password.length < 12) {
    setFeedbackAuthStatus("La contraseña debe tener al menos 12 caracteres.", "error");
    return;
  }
  if (feedbackAuthMode === "register" && !feedbackAuthConsent?.checked) {
    setFeedbackAuthStatus("Confirma la edad y la aceptación de las condiciones para crear la cuenta.", "error");
    return;
  }

  setFeedbackAuthBusy(true);
  setFeedbackAuthStatus(feedbackAuthMode === "register" ? "Creando tu identidad…" : "Comprobando tu identidad…");
  try {
    const path = feedbackAuthMode === "register" ? "/auth/register" : "/auth/login";
    const body = feedbackAuthMode === "register"
      ? { name, email, password, sourceApp: "allwain", locale: activeLocale() }
      : { email, password, sourceApp: "allwain", locale: activeLocale() };
    const { response, payload } = await feedbackApi(path, body);
    if (!response.ok || typeof payload?.token !== "string" || !payload?.user?.email) {
      const errors = {
        INVALID_CREDENTIALS: "Email o contraseña incorrectos.",
        EMAIL_ALREADY_EXISTS: "Ese email ya tiene cuenta. Pulsa «Ya tengo cuenta».",
        WEAK_PASSWORD: "Usa una contraseña de al menos 12 caracteres.",
        EMAIL_DOMAIN_TYPO: "Revisa el dominio del email.",
        AUTH_RATE_LIMITED: "Demasiados intentos. Espera unos minutos."
      };
      throw new FeedbackError(errors[payload?.error] || "No hemos podido completar la identificación.");
    }
    await acceptFeedbackIdentity({ token: payload.token, user: payload.user });
  } catch (error) {
    setFeedbackAuthStatus(error instanceof FeedbackError ? error.message : "No hemos podido completar el envío.", "error");
  } finally {
    setFeedbackAuthBusy(false);
  }
});

if (readPendingFeedback()) {
  setFeedbackStatus("Tienes una opinión pendiente. Comprobando si ya estás identificado…");
  window.setTimeout(() => void attemptFeedbackDelivery(false), 0);
}

async function closeWebSession() {
  const identity = currentWebIdentity;
  try {
    if (identity?.token) await feedbackApi("/auth/logout", { sourceApp: "allwain" }, identity.token);
  } finally {
    currentWebIdentity = null;
    window.dispatchEvent(new CustomEvent("allwain:identitychange", { detail: { identity: null } }));
  }
}

window.AllwainWebAuth = {
  open: openFeedbackAuth,
  refresh: refreshFeedbackIdentity,
  logout: closeWebSession,
  get identity() { return currentWebIdentity; }
};

window.addEventListener("allwain:authrequest", (event) => {
  openFeedbackAuth(event.detail?.purpose || "session");
});

function el(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function createGuideAvatar() {
  const avatar = el("span", "guide-avatar");
  avatar.setAttribute("aria-hidden", "true");
  const image = document.createElement("img");
  image.src = "./assets/brand/allwain-mark-white.png?v=20260907-allwain-clean-mobile-panels-r8-091244";
  image.alt = "";
  image.width = 237;
  image.height = 194;
  avatar.append(image);
  return avatar;
}

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeBrand(value) {
  return String(value || "").replace(/\b(?:Allwain|ALLWAIN)\b/g, "allwain");
}

const guideVocabulary = {
  date: ["cuando", "fecha", "inicia", "empieza", "abre", "lanzamiento", "when", "date", "start", "launch", "open", "quand", "commence", "lancement", "ouvre", "quando", "data", "inizia", "lancio", "apre", "什么时候", "日期", "开始", "上线", "متى", "تاريخ", "يبدأ", "إطلاق"],
  presale: ["preventa", "piloto", "naranja", "presale", "pre-sale", "pilot", "orange", "prevente", "pilote", "prevendita", "arancia", "预售", "试点", "橙", "البيع المسبق", "بيع مسبق", "تجربة", "برتقال"],
  participate: ["particip", "pioner", "tester", "apunt", "join", "pioneer", "sign up", "participer", "pionnier", "testeur", "inscri", "partecip", "pionier", "iscriv", "参与", "测试", "先锋", "加入", "شارك", "مشاركة", "رائد", "اختبار", "انضم"],
  roles: ["roles", "papeles", "three roles", "role", "trois roles", "ruolo", "ruoli", "角色", "الأدوار", "دور"],
  buyer: ["comprador", "comprar", "compra", "foto", "televisor", "buyer", "buy", "photo", "television", "acheteur", "acheter", "photo", "acquirente", "comprare", "foto", "买家", "购买", "照片", "مشتري", "شراء", "صورة"],
  seller: ["vendedor", "vender", "ofertar", "negociar", "seller", "sell", "offer", "vendeur", "vendre", "offre", "venditore", "vendere", "offerta", "卖家", "出售", "报价", "بائع", "بيع", "عرض"],
  connector: ["conector", "connector", "connecteur", "connettore", "连接者", "连接", "موصل", "موصّل", "ربط"],
  delivery: ["repart", "entreg", "delivery", "deliver", "livraison", "livrer", "consegna", "consegn", "配送", "送货", "توصيل", "تسليم"],
  compare: ["compar", "propuesta", "oferta", "compare", "proposal", "offer", "comparer", "proposition", "offre", "confront", "proposta", "offerta", "比较", "方案", "报价", "مقارنة", "اقتراح", "عرض"],
  sustainability: ["sosten", "kilometro", "sudafrica", "ruta local", "sustain", "kilometre", "south africa", "local route", "durable", "afrique du sud", "trajet local", "sostenibil", "sudafrica", "percorso locale", "可持续", "南非", "本地路线", "استدام", "جنوب أفريقيا", "مسار محلي"],
  privacy: ["privacidad", "datos", "publicidad", "privacy", "data", "advert", "confidentialite", "donnees", "publicite", "riservatezza", "dati", "pubblicita", "隐私", "数据", "广告", "خصوصية", "بيانات", "إعلانات"],
  security: ["seguridad", "https", "sesion", "security", "session", "securite", "session", "sicurezza", "sessione", "安全", "会话", "أمان", "جلسة"],
  fiscal: ["fiscal", "iva", "impuesto", "factura", "tax", "vat", "invoice", "impot", "tva", "facture", "fiscale", "iva", "fattura", "税", "发票", "ضريبة", "فاتورة"],
  how: ["funcion", "reves", "mercado", "peticion", "how", "work", "market", "request", "fonction", "marche", "demande", "funzion", "mercato", "richiesta", "如何", "运作", "市场", "需求", "كيف", "يعمل", "سوق", "طلب"]
};

function hasGuideTerm(query, group) {
  return guideVocabulary[group].some((term) => query.includes(normalize(term)));
}

function guideReply(text, label, href) {
  return { text, links: [{ label, href }] };
}

function localizedGuideAnswer(question) {
  const query = normalize(question);
  if (hasGuideTerm(query, "date") && hasGuideTerm(query, "presale")) {
    return guideReply(
      "La preventa es próxima, pero todavía no hay una fecha pública confirmada. Empezará con naranjas Navel Lane Late de Foios a 1 €/kg como precio objetivo; antes se publicarán las condiciones de entrega y participación.",
      "Ver la primera prueba",
      "#inicio"
    );
  }
  if (hasGuideTerm(query, "participate")) {
    return guideReply(
      "Puedes participar como Comprador, Vendedor o Conector. Las ocho pantallas y sus maquetas se exploran libremente. Para ser tester, responde la encuesta; después, la sala privada te guía para probar la app y reportar allí sus incidencias.",
      "Elegir cómo participar",
      "#pioneros"
    );
  }
  if (hasGuideTerm(query, "roles")) {
    return guideReply(
      "Hay tres papeles en allwain: Comprador, que publica lo que necesita y elige; Vendedor, que responde con propuestas; y Conector, que acerca personas y negocios mediante su QR sin entrar en sus cuentas. Repartir es una función distinta y voluntaria.",
      "Elegir cómo participar",
      "#pioneros"
    );
  }
  if (hasGuideTerm(query, "connector") && hasGuideTerm(query, "delivery")) {
    return guideReply(
      "No. Ser Conector no te convierte en repartidor. Recomendar y transportar son tareas distintas; una futura entrega solo se asumirá si encaja y la aceptas expresamente.",
      "Ver el modelo del Conector",
      "#conector"
    );
  }
  if (hasGuideTerm(query, "connector")) {
    return guideReply(
      "El Conector comparte su QR, acerca compradores y negocios y activa la red de allwain en su zona. La red que incorpora queda vinculada a él; recomendar no le da acceso a cuentas ni decisiones.",
      "Ver cómo activa su zona",
      "#conector"
    );
  }
  if (hasGuideTerm(query, "buyer")) {
    return guideReply(
      "Fotografías una etiqueta o explicas qué necesitas. allwain prepara un borrador para que lo revises; tú confirmas la petición, comparas respuestas y eliges.",
      "Ver la pantalla del comprador",
      "#comprador"
    );
  }
  if (hasGuideTerm(query, "seller")) {
    return guideReply(
      "El vendedor ve peticiones compatibles, elige cuáles le interesan y responde con una oferta o una negociación. El comprador conserva la decisión.",
      "Ver la pantalla del vendedor",
      "#vendedor"
    );
  }
  if (hasGuideTerm(query, "compare")) {
    return guideReply(
      "Puedes ordenar las propuestas por precio, valoración o fecha y abrir cada una para revisar quién vende, el precio, la descripción y el plazo de entrega. allwain mostrará también cantidad, precio unitario, total y condiciones antes de la primera venta; comparar no te obliga a aceptar ninguna.",
      "Ver el mercado de la demanda",
      "#como-funciona"
    );
  }
  if (hasGuideTerm(query, "sustainability")) {
    return guideReply(
      "Si un producto se vende aquí, no hace falta traerlo de otra parte del mundo. allwain quiere medir esa sostenibilidad real mostrando origen, ruta, recogida y entrega; la localidad del cartel solo se personaliza si das permiso al navegador y no se guarda.",
      "Ver sostenibilidad medible",
      "#primera-prueba"
    );
  }
  if (hasGuideTerm(query, "privacy") || hasGuideTerm(query, "security")) {
    return guideReply(
      "allwain no integra publicidad ni vende datos personales. Cada acción importante necesita confirmación y cada operación conserva un rastro comprensible.",
      "Leer la política de privacidad",
      "https://allwain.es/privacidad/"
    );
  }
  if (hasGuideTerm(query, "fiscal")) {
    return guideReply(
      "No son el mismo documento. Confirmación, justificante, liquidación y factura cumplen funciones distintas. allwain publicará el recorrido fiscal antes de activar pagos reales.",
      "Leer las condiciones",
      "https://allwain.es/terminos/"
    );
  }
  if (hasGuideTerm(query, "presale")) {
    return guideReply(
      "La prueba empezará con un único producto: naranjas Navel Lane Late de Foios, de calidad, gran calibre y naranja intenso. Un euro por kilo es el objetivo del producto; la preventa y la primera venta siguen pendientes. Más de 300 % más para quien cultiva y 50 % menos para quien compra son objetivos comparados con las referencias aportadas, no resultados confirmados.",
      "Ver los objetivos de la prueba",
      "#inicio"
    );
  }
  if (hasGuideTerm(query, "how")) {
    return guideReply(
      "Tú dices qué necesitas. Los vendedores compatibles pueden responder con sus propuestas. Después comparas y eliges. allwain convierte la necesidad en el punto de partida del mercado.",
      "Ver cómo funciona",
      "#como-funciona"
    );
  }
  return null;
}

function localGuideAnswer(question, history = []) {
  const directQuery = normalize(question);
  const previousQuestion = [...history].reverse().find((entry) => entry?.role === "user" && typeof entry.text === "string")?.text || "";
  const isFollowUp = directQuery.length < 42 || /^(?:y|pero|entonces|eso|esa|ese|por que|porque|why|and|but|so|et|mais|alors|e|ma|quindi|而且|但是|那么|و|لكن|إذن)\b/u.test(directQuery);
  const query = isFollowUp && previousQuestion ? `${normalize(previousQuestion)} ${directQuery}` : directQuery;

  if (/por que|porque|why|pourquoi|perche|为什么|لماذا/.test(directQuery)
      && /aun no|todavia no|not yet|pas encore|non ancora|还没|ليس بعد/.test(directQuery)
      && hasGuideTerm(query, "presale")) {
    return {
      text: "La preventa aún no se ha abierto porque esta primera prueba debe cerrar condiciones de participación, entrega, trazabilidad y soporte. La web pública explica el modelo con maquetas libres; la prueba y sus incidencias se realizan en la app desde la sala privada. Cuando esos puntos estén verificados, se publicará una fecha.",
      links: [{ label: "Ver qué estamos probando", href: "#pioneros" }]
    };
  }
  if (activeLocale() !== "es") {
    const localizedAnswer = localizedGuideAnswer(query);
    if (localizedAnswer) return localizedAnswer;
  }
  if (/preventa|piloto|naranjas?/.test(query) && /cuando|fecha|inicia|empieza|abre|lanzamiento/.test(query)) {
    return {
      text: "La preventa es próxima, pero todavía no hay una fecha pública confirmada. Empezará con naranjas Navel Lane Late de Foios a 1 €/kg como precio objetivo; antes se publicarán las condiciones de entrega y participación.",
      links: [{ label: "Ver la primera prueba", href: "#inicio" }]
    };
  }
  if (/particip|pioner|probar|apunt/.test(query)) {
    return {
      text: "Puedes participar como Comprador, Vendedor o Conector. Las ocho pantallas y sus maquetas se exploran libremente. Para ser tester, responde la encuesta; después, la sala privada te guía para probar la app y reportar allí sus incidencias.",
      links: [{ label: "Elegir cómo participar", href: "#pioneros" }]
    };
  }
  if (/tres roles|roles|papeles/.test(query)) {
    return {
      text: "Hay tres papeles en allwain: Comprador, que publica lo que necesita y elige; Vendedor, que responde con propuestas; y Conector, que acerca personas y negocios mediante su QR sin entrar en sus cuentas. Repartir es una función distinta y voluntaria.",
      links: [{ label: "Elegir cómo participar", href: "#pioneros" }]
    };
  }
  if (/conector/.test(query) && /repartidor|repartir|entregar/.test(query)) {
    return {
      text: "No. Ser Conector no te convierte en repartidor. Recomendar y transportar son tareas distintas; una futura entrega solo se asumirá si encaja y la aceptas expresamente.",
      links: [{ label: "Ver el modelo del Conector", href: "#conector" }]
    };
  }
  if (/conector/.test(query) && /\b(?:fiscal|fiscalidad|iva|impuesto|impuestos|factura|facturas|liquidacion|liquidaciones|justificante|justificantes)\b/.test(query)) {
    return {
      text: "La fiscalidad del Conector aún no está activada. Su participación se plantea solo sobre compras o ventas válidas y terminadas de su red, nunca por altas; porcentajes, impuestos, justificantes y liquidaciones se publicarán antes del primer pago.",
      links: [{ label: "Leer las condiciones", href: "https://allwain.es/terminos/" }]
    };
  }
  if (/conector|comision|ingreso|boca a boca|mi red|tu red|red allwain|red del conector/.test(query)) {
    return {
      text: /comision|ingreso|ganar|cobrar/.test(query)
        ? "El modelo prevé que el Conector participe en cada compra o venta válida y terminada de su red. No cobra por altas. Los pagos, porcentajes y reglas se publicarán antes de activarse."
        : "El Conector comparte su QR, acerca compradores y negocios y activa la red de allwain en su zona. La red que incorpora queda vinculada a él; recomendar no le da acceso a cuentas ni decisiones.",
      links: [{ label: "Ver cómo activa su zona", href: "#conector" }]
    };
  }
  if (/comprador|comprar|\bcompra\b|captur|etiqueta|televisor|foto/.test(query) && !/conector|comision|ingreso|boca a boca|mi red|tu red|red allwain|red del conector/.test(query)) {
    return {
      text: /obliga|obligacion|tengo que comprar/.test(query)
        ? "No. Publicar una petición y recibir propuestas no te obliga a aceptar, reservar ni pagar. Si ninguna encaja, no eliges ninguna."
        : "Fotografías una etiqueta o explicas qué necesitas. allwain prepara un borrador para que lo revises; tú confirmas la petición, comparas respuestas y eliges.",
      links: [{ label: "Ver la pantalla del comprador", href: "#comprador" }]
    };
  }
  if (/vendedor|vender|ofertar|negociar|peticion real/.test(query)) {
    return {
      text: /primera|automatic/.test(query)
        ? "No. La primera propuesta no gana automáticamente. El comprador compara precio, condiciones y encaje, y decide."
        : "El vendedor ve peticiones compatibles, elige cuáles le interesan y responde con una oferta o una negociación. El comprador conserva la decisión.",
      links: [{ label: "Ver la pantalla del vendedor", href: "#vendedor" }]
    };
  }
  if (/compar|propuest|ofertas?/.test(query)) {
    return {
      text: "Puedes ordenar las propuestas por precio, valoración o fecha y abrir cada una para revisar quién vende, el precio, la descripción y el plazo de entrega. allwain mostrará también cantidad, precio unitario, total y condiciones antes de la primera venta; comparar no te obliga a aceptar ninguna.",
      links: [{ label: "Ver el mercado de la demanda", href: "#como-funciona" }]
    };
  }
  if (/naranja|foios|navel|1 ?€|precio|300|50|real|preventa/.test(query)) {
    return {
      text: "La prueba empezará con un único producto: naranjas Navel Lane Late de Foios, de calidad, gran calibre y naranja intenso. Un euro por kilo es el objetivo del producto; la preventa y la primera venta siguen pendientes. Más de 300 % más para quien cultiva y 50 % menos para quien compra son objetivos comparados con las referencias aportadas, no resultados confirmados.",
      links: [{ label: "Ver los objetivos de la prueba", href: "#inicio" }]
    };
  }
  if (/sosten|kilometro|sudafrica|ruta local|localidad/.test(query)) {
    return {
      text: "Si un producto se vende aquí, no hace falta traerlo de otra parte del mundo. allwain quiere medir esa sostenibilidad real mostrando origen, ruta, recogida y entrega; la localidad del cartel solo se personaliza si das permiso al navegador y no se guarda.",
      links: [{ label: "Ver sostenibilidad medible", href: "#primera-prueba" }]
    };
  }
  if (/privacidad|datos?|publicidad/.test(query) && /segur|https|sesion/.test(query)) {
    return {
      text: "allwain no vende datos personales ni integra seguimiento publicitario. Esta Guía no entra en tu cuenta. La conexión usa HTTPS y las sesiones son revocables: son controles reales y evolutivos, no una promesa de invulnerabilidad.",
      links: [{ label: "Seguridad y privacidad", href: "https://allwain.es/seguridad/" }]
    };
  }
  if (/privacidad|dato|publicidad|segur|rastro|traz/.test(query)) {
    return {
      text: /que datos|datos usa|usa.*datos/.test(query)
        ? "En esta Guía se procesa el texto que escribes y un historial breve para entender preguntas de seguimiento. No entra en tu cuenta ni consulta pedidos, pagos o mensajes privados; allwain no vende datos personales."
        : /vende.*dato|datos.*vende/.test(query)
        ? "No. allwain no vende datos personales ni integra seguimiento publicitario. Usa datos limitados para prestar, proteger y cumplir el servicio."
        : "allwain no integra publicidad ni vende datos personales. Cada acción importante necesita confirmación y cada operación conserva un rastro comprensible.",
      links: [{ label: "Leer la política de privacidad", href: "https://allwain.es/privacidad/" }]
    };
  }
  if (/\b(?:fiscal|fiscalidad|iva|impuesto|impuestos|factura|facturas|liquidacion|liquidaciones|justificante|justificantes)\b/.test(query)) {
    return {
      text: "No son el mismo documento. Confirmación, justificante, liquidación y factura cumplen funciones distintas. allwain publicará el recorrido fiscal antes de activar pagos reales.",
      links: [{ label: "Leer las condiciones", href: "https://allwain.es/terminos/" }]
    };
  }
  if (/funcion|reves|mercado|peticion|oferta|vendedor/.test(query)) {
    return {
      text: "Tú dices qué necesitas. Los vendedores compatibles pueden responder con sus propuestas. Después comparas y eliges. allwain convierte la necesidad en el punto de partida del mercado.",
      links: [{ label: "Ver cómo funciona", href: "#como-funciona" }]
    };
  }
  return {
    text: "Solo respondo sobre allwain: cómo funciona, sus tres papeles, la prueba de Foios, privacidad, seguridad y fiscalidad. Prueba con una pregunta concreta.",
    links: [{ label: "Volver al lanzamiento", href: "#inicio" }]
  };
}

function guideSourceLink(source) {
  const id = typeof source?.id === "string" ? source.id.toUpperCase() : "";
  if (/^A(?:3|10)$/.test(id)) return { label: "La primera prueba", href: "#inicio" };
  if (id === "C10") return { label: "Condiciones de uso", href: "https://allwain.es/terminos/" };
  if (/^A(?:10|[1-9])$/.test(id)) return { label: "Cómo funciona allwain", href: "#como-funciona" };
  if (/^B(?:10|[1-9])$/.test(id)) return { label: "Cómo participar", href: "#pioneros" };
  if (/^C(?:10|[1-9])$/.test(id)) return { label: "La prueba de las naranjas", href: "#inicio" };
  if (/^D(?:10|[1-9])$/.test(id)) return { label: "Modelo del Conector", href: "#conector" };
  const publicLinks = {
    SECURITY: { label: "Seguridad de allwain", href: "https://allwain.es/seguridad/" },
    PRIVACY: { label: "Política de privacidad", href: "https://allwain.es/privacidad/" },
    TERMS: { label: "Condiciones de uso", href: "https://allwain.es/terminos/" },
    FISCAL: { label: "Condiciones de uso", href: "https://allwain.es/terminos/" },
    SUSTAINABILITY: { label: "Sostenibilidad medida", href: "#primera-prueba" },
    DELETE: { label: "Eliminar una cuenta", href: "https://allwain.es/eliminar-cuenta/" },
    SUPPORT: { label: "Soporte de allwain", href: "https://allwain.es/soporte/" }
  };
  return publicLinks[id] || null;
}

function guideContextLink(question) {
  const query = normalize(question);
  if (hasGuideTerm(query, "connector")) {
    return { label: "Ver el modelo del Conector", href: "#conector" };
  }
  if (hasGuideTerm(query, "seller")) {
    return { label: "Ver la pantalla del vendedor", href: "#vendedor" };
  }
  if (hasGuideTerm(query, "buyer")) {
    return { label: "Ver la pantalla del comprador", href: "#comprador" };
  }
  return null;
}

function addGuideMessage(role, text, links = [], meta = "", options = {}) {
  const translated = options.translate === true;
  const translateChrome = options.translateChrome === true || translated;
  const message = el("div", `guide-message guide-${role}`);
  if (translated) message.dataset.guideTranslatable = "true";
  setGuideMessageLocale(message, options.locale || activeLocale(), translated);
  message.append(role === "assistant" ? createGuideAvatar() : el("span"));
  const bubble = el("div");
  const paragraph = el("p");
  if (translated) setDynamicCopy(paragraph, text, options.textReplacements || {});
  else paragraph.textContent = text;
  bubble.append(paragraph);
  links.forEach((link) => {
    const anchor = el("a");
    if (translateChrome) {
      anchor.dataset.guideTranslatablePart = "true";
      anchor.lang = activeLocale();
      anchor.dir = activeLocale() === "ar" ? "rtl" : "ltr";
      setDynamicCopy(anchor, link.label, link.replacements || {});
    }
    else anchor.textContent = link.label;
    anchor.href = link.href;
    bubble.append(anchor);
  });
  if (meta) {
    const metadata = el("small");
    if (translateChrome) {
      metadata.dataset.guideTranslatablePart = "true";
      metadata.lang = activeLocale();
      metadata.dir = activeLocale() === "ar" ? "rtl" : "ltr";
      setDynamicCopy(metadata, meta, options.metaReplacements || {});
    }
    else metadata.textContent = meta;
    bubble.append(metadata);
  }
  message.append(bubble);
  guideMessages.append(message);
  guideMessages.scrollTop = guideMessages.scrollHeight;
}

function looksSensitive(value) {
  const emailAddress = /[\p{L}\p{N}._%+\-]+@(?:[\p{L}\p{N}-]+\.)+[\p{L}\p{N}-]{2,}/iu;
  const commonIdentifiers = /(?:\+?34[\s.-]?)?(?:\d[\s.-]?){9}\b|\b(?:\d{8}[a-z]|[xyz]\d{7}[a-z])\b|\bES\d{22}\b|\b(?:\d[ -]*?){13,19}\b/i;
  const normalizedDigits = value
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
  const postalAddress = /\b(calle|avenida|avda\.?|plaza|paseo|camino|carretera|street|road|avenue|square|rue|boulevard|via|viale|piazza|corso)\s+[^,\n]{1,55}\p{Nd}/iu;
  const numberFirstAddress = /\p{Nd}{1,5}\s+[^,\n]{1,40}\b(street|road|avenue|lane|drive|boulevard|square|way|rue|chemin|place|via|viale|piazza|corso|strada)\b/iu;
  const chineseAddress = /[\u4e00-\u9fff]{1,30}(?:路|街|巷|弄)\s*\p{Nd}+\s*号?/u;
  const arabicAddress = /(?:شارع|طريق|جادة|ميدان)\s+[\u0600-\u06ff\s-]{1,55}\p{Nd}+/u;
  return emailAddress.test(value) || commonIdentifiers.test(normalizedDigits) || postalAddress.test(value) || numberFirstAddress.test(value) || chineseAddress.test(value) || arabicAddress.test(value);
}

async function requestPublicGuide(question, history = []) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  const requestedLocale = activeLocale();
  try {
    const response = await fetch(publicGuideEndpoint, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "strict-origin-when-cross-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: question, history: history.slice(-6), locale: requestedLocale }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || typeof payload?.message?.text !== "string") throw new Error("Guía no disponible");
    const sourceLinks = Array.isArray(payload.sources)
      ? payload.sources
          .map(guideSourceLink)
          .filter(Boolean)
          .filter((link, index, links) => links.findIndex((candidate) => candidate.href === link.href) === index)
          .slice(0, 3)
      : [];
    const contextLink = guideContextLink(question);
    const links = contextLink
      ? [contextLink, ...sourceLinks.filter((link) => link.href !== contextLink.href)].slice(0, 3)
      : sourceLinks;
    const version = /^\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)?$/i.test(payload.knowledgeVersion || "")
      ? payload.knowledgeVersion
      : "pública";
    const localAnswerRaw = localGuideAnswer(question, history);
    const remoteWasGeneric = typeof payload.generic === "boolean"
      ? payload.generic
      : /^Solo puedo responder sobre allwain\b/i.test(normalizeBrand(payload.message.text));
    const localIsSpecific = !/^Solo respondo sobre allwain\b/i.test(normalizeBrand(localAnswerRaw.text));
    const useLocalAnswer = remoteWasGeneric && localIsSpecific;
    const answerText = normalizeBrand(useLocalAnswer ? localAnswerRaw.text : payload.message.text);
    const answerIsCanonical = useLocalAnswer || window.AllwainI18n?.hasTranslation?.(answerText, activeLocale()) === true;
    return {
      text: answerText,
      links: useLocalAnswer ? localAnswerRaw.links : links,
      meta: useLocalAnswer
        ? "Respuesta verificada · base pública {version}"
        : payload.provider === "openai"
        ? "Respuesta IA · base pública {version}"
        : "Respuesta verificada · base pública {version}",
      metaReplacements: { version: () => tr(version) },
      translate: answerIsCanonical,
      locale: answerIsCanonical ? activeLocale() : (window.AllwainI18n?.normalizeLocale?.(payload.locale) || requestedLocale)
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function askGuide(value) {
  const question = value.trim();
  if (!question || guideBusy) return;
  if (looksSensitive(question)) {
    addGuideMessage("user", "[Dato personal omitido]", [], "", { translate: true });
    addGuideMessage("assistant", "Parece que has incluido un dato personal. Haz una pregunta general sin nombres, dirección, correo, teléfono, documentos, tarjetas ni datos de una operación.", [], "", { translate: true });
    return;
  }

  addGuideMessage("user", question);
  guideBusy = true;
  guideInput.disabled = true;
  guideForm.querySelector("button").disabled = true;
  const thinking = el("div", "guide-message guide-assistant");
  thinking.dataset.guideTranslatable = "true";
  setGuideMessageLocale(thinking, activeLocale(), true);
  thinking.append(createGuideAvatar());
  const bubble = el("div");
  const thinkingCopy = el("p");
  setDynamicCopy(thinkingCopy, "Consultando la información pública…");
  bubble.append(thinkingCopy);
  thinking.append(bubble);
  guideMessages.append(thinking);
  guideMessages.scrollTop = guideMessages.scrollHeight;

  try {
    const answer = await requestPublicGuide(question, guideConversation);
    dynamicCopies.delete(thinkingCopy);
    thinking.remove();
    addGuideMessage("assistant", answer.text, answer.links, answer.meta, {
      translate: answer.translate,
      translateChrome: true,
      locale: answer.locale,
      metaReplacements: answer.metaReplacements
    });
    guideConversation.push(
      { role: "user", text: question },
      { role: "assistant", text: answer.text }
    );
    if (guideConversation.length > 8) guideConversation.splice(0, guideConversation.length - 8);
  } catch {
    const answer = localGuideAnswer(question, guideConversation);
    dynamicCopies.delete(thinkingCopy);
    thinking.remove();
    addGuideMessage("assistant", answer.text, answer.links, "Respuesta local · información pública", { translate: true });
    guideConversation.push(
      { role: "user", text: question },
      { role: "assistant", text: answer.text }
    );
    if (guideConversation.length > 8) guideConversation.splice(0, guideConversation.length - 8);
  } finally {
    guideBusy = false;
    guideInput.disabled = false;
    guideForm.querySelector("button").disabled = false;
    guideInput.focus();
  }
}

function openGuide(activator = guideLauncher) {
  guideActivator = activator;
  guidePanel.hidden = false;
  guideLauncher.setAttribute("aria-expanded", "true");
  guideBackground.forEach((element) => { element.inert = true; });
  document.body.classList.add("guide-open");
  guideInput.focus();
}

function closeGuide(restoreFocus = true) {
  guidePanel.hidden = true;
  guideLauncher.setAttribute("aria-expanded", "false");
  guideBackground.forEach((element) => { element.inert = false; });
  document.body.classList.remove("guide-open");
  if (restoreFocus) guideActivator?.focus();
}

function updateGuideLauncher() {
  const hideBeforePioneers = pioneersSection
    ? window.scrollY < pioneersSection.offsetTop - (window.innerHeight * .2)
    : true;
  guideLauncher.classList.toggle("is-visible", window.scrollY > 420 && hideBeforePioneers);
}

guideLauncher?.addEventListener("click", () => guidePanel.hidden ? openGuide(guideLauncher) : closeGuide());
openGuideButton?.addEventListener("click", () => openGuide(openGuideButton));
closeGuideButton?.addEventListener("click", () => closeGuide());

guideForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = guideInput.value;
  guideInput.value = "";
  askGuide(value);
});

guideStarters?.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button) askGuide(button.textContent || "");
});

window.addEventListener("scroll", updateGuideLauncher, { passive: true });
window.addEventListener("resize", updateGuideLauncher, { passive: true });
updateGuideLauncher();

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !guidePanel.hidden) {
    event.preventDefault();
    closeGuide();
    return;
  }
  const activeDialog = !guidePanel.hidden ? guidePanel : null;
  if (event.key !== "Tab" || !activeDialog) return;
  const focusable = [...activeDialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element.getClientRects().length);
  if (!focusable.length) {
    event.preventDefault();
    activeDialog.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
