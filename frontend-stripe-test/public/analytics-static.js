(function () {
  "use strict";

  var consentVersion = "allwain-analytics-v1-2026-09-06";
  var storageKey = "allwain:analytics-consent:" + consentVersion;
  var activeMeasurementId = "";
  var buildEnvironment = "";
  var collectionGranted = false;
  var queued = new Set();
  var locales = ["es", "en", "fr", "it", "zh", "ar"];
  var steps = ["access", "profile", "capture", "buy", "compare", "sell", "connector", "notifications", "delivery", "assistant", "accessibility", "support"];
  var platforms = ["web", "android", "ios", "unknown"];
  function member(values) { return function (value) { return typeof value === "string" && values.indexOf(value) !== -1; }; }
  function boolean(value) { return typeof value === "boolean"; }
  var actionRules = { step: member(steps), action: function (value) { return value === 1 || value === 2; }, completed: boolean, platform: member(platforms) };
  var schemas = {
    web_screen_view: { screen: member(["inicio", "primera-prueba", "km0", "comprador", "vendedor", "conector", "pioneros", "encuesta"]) },
    tester_survey_opened: { authenticated: boolean },
    tester_private_room_opened: { source: member(["public_web"]) },
    prototype_interaction: { screen: member(["reverse", "buyer", "seller", "connector", "km0"]), action: member(["select_demand", "prepare_offer", "configure_request", "show_offers", "hide_offers", "compare_offer", "reset", "select_request", "request_detail", "simulate_network", "open_checkpoint"]) },
    tester_app_action_toggled: actionRules,
    tester_app_action_saved: actionRules,
    tester_incident_route_selected: { step: member(steps) },
    tester_app_link_opened: {},
    tester_academy_opened: { preferred_role: member(["buyer", "seller", "connector", "observer"]) },
    tester_app_step_confirmed: { step: member(steps), platform: member(platforms) },
    tester_app_incident_submitted: { category: member(["functionality", "content", "accessibility", "translation", "performance", "account", "other", "unknown"]), platform: member(platforms) },
    tester_google_login_completed: {},
    tester_platform_selected: { platform: member(platforms) }
  };
  function hasConsent() {
    try { return collectionGranted && window.localStorage.getItem(storageKey) === "granted"; } catch (_) { return false; }
  }
  function environmentParameters() {
    var result = { app_surface: "marketing", app_platform: "web", source_platform: "web", build_environment: buildEnvironment, payment_environment: "unknown" };
    if (buildEnvironment === "test") result.debug_mode = true;
    return result;
  }
  function pageParameters() { return { page_title: "allwain web", page_location: "https://allwain.es/", page_referrer: "" }; }
  function safeParameters(name, parameters) {
    if (!Object.prototype.hasOwnProperty.call(schemas, name)) return null;
    var value = parameters && typeof parameters === "object" && !Array.isArray(parameters) ? parameters : {};
    var schema = schemas[name], result = {};
    var keys = Object.keys(schema);
    for (var index = 0; index < keys.length; index++) {
      var key = keys[index];
      if (!schema[key](value[key])) return null;
      result[key === "platform" ? "tested_platform" : key] = value[key];
    }
    if (locales.indexOf(value.locale) !== -1) result.locale = value.locale;
    if (name === "prototype_interaction" && member(["tv", "oranges", "tables", "table", "pickup", "install", "delivery", "start", "village", "district", "1", "2", "3", "4"])(value.variant)) result.variant = value.variant;
    if (name === "tester_app_link_opened" && steps.indexOf(value.step) !== -1) result.step = value.step;
    return result;
  }

  function tr(source) {
    return window.AllwainI18n && typeof window.AllwainI18n.translate === "function"
      ? window.AllwainI18n.translate(source)
      : source;
  }

  function updateBannerCopy(banner) {
    if (!banner) return;
    banner.setAttribute("aria-label", tr("Preferencias de medición"));
    banner.querySelectorAll("[data-consent-source]").forEach(function (element) {
      element.textContent = tr(element.getAttribute("data-consent-source") || "");
    });
  }

  function clearAnalyticsCookies(measurementId) {
    collectionGranted = false;
    window["ga-disable-" + measurementId] = true;
    if (Array.isArray(window.dataLayer)) window.dataLayer.splice(0, window.dataLayer.length, ...window.dataLayer.filter(function (item) {
      return !queued.has(item) && !(item && (item[0] === "event" || (item[0] === "config" && item[1] === measurementId) || (item[0] === "consent" && item[2] && item[2].analytics_storage === "granted")));
    }));
    queued.clear();
    if (window.gtag) {
      try { window.gtag("consent", "update", {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied"
      }); } catch (_) { /* Still clear cookies and keep the destination disabled. */ }
    }
    var host = window.location.hostname;
    var domains = ["", host, host ? "." + host : "", ".allwain.es"];
    document.cookie.split(";").forEach(function (entry) {
      var name = entry.split("=")[0].trim();
      if (name.indexOf("_ga") !== 0 && name !== "_gid" && name.indexOf("_gat") !== 0) return;
      domains.forEach(function (domain) {
        var domainPart = domain ? "; domain=" + domain : "";
        ["/", "/app", "/app/"].forEach(function (path) {
          document.cookie = name + "=; Max-Age=0; path=" + path + domainPart + "; SameSite=Lax; Secure";
        });
      });
    });
  }

  function loadTag(measurementId) {
    if (!hasConsent() || !measurementId || (buildEnvironment !== "test" && buildEnvironment !== "live")) return false;
    if (document.getElementById("allwain-google-analytics")) return true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { queued.add(arguments); window.dataLayer.push(arguments); };
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    window.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    window.gtag("js", new Date());
    window.gtag("config", measurementId, Object.assign({
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    }, pageParameters(), environmentParameters()));
    var script = document.createElement("script");
    script.id = "allwain-google-analytics";
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
    document.head.appendChild(script);
    return true;
  }

  function sendPageView(measurementId) {
    if (!loadTag(measurementId) || !hasConsent()) return false;
    window.gtag("event", "page_view", Object.assign({}, pageParameters(), environmentParameters()));
    return true;
  }

  function track(eventName, parameters) {
    try {
      if (!activeMeasurementId || !hasConsent() || typeof eventName !== "string") return false;
      var safe = safeParameters(eventName, parameters);
      if (!safe || !loadTag(activeMeasurementId) || !hasConsent()) return false;
      window.gtag("event", eventName, Object.assign({}, safe, pageParameters(), environmentParameters()));
      return true;
    } catch (_) { return false; }
  }

  window.AllwainAnalytics = { track: track };
  window.addEventListener("storage", function (event) {
    if (event.key === storageKey && event.newValue !== "granted") {
      try { clearAnalyticsCookies(activeMeasurementId); } catch (_) { collectionGranted = false; }
    }
  });

  function saveChoice(measurementId, granted, banner) {
    // Revocation wins before any fallible persistence or SDK call.
    collectionGranted = false;
    try {
      clearAnalyticsCookies(measurementId);
      window.localStorage.setItem(storageKey, granted ? "granted" : "denied");
      banner.remove();
      if (granted) {
        collectionGranted = true; window["ga-disable-" + measurementId] = false;
        if (window.gtag) window.gtag("consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
        sendPageView(measurementId);
      }
    } catch (_) { collectionGranted = false; window["ga-disable-" + measurementId] = true; }
  }

  function showBanner(measurementId) {
    if (document.getElementById("allwain-analytics-consent")) return;
    var banner = document.createElement("section");
    banner.id = "allwain-analytics-consent";
    banner.setAttribute("role", "dialog");
    banner.style.cssText = "position:fixed;z-index:9999;left:16px;right:16px;bottom:16px;max-width:680px;margin:auto;padding:18px;background:#fff;color:#242424;border:1px solid #d9d9d4;border-radius:8px;box-shadow:0 16px 44px rgba(20,21,20,.22);font-family:Arial,sans-serif";
    var title = document.createElement("strong");
    title.setAttribute("data-consent-source", "Ayúdanos a mejorar allwain");
    title.style.cssText = "display:block;font-size:18px;margin-bottom:7px";
    var description = document.createElement("span");
    description.setAttribute("data-consent-source", "Con tu permiso mediremos qué pantallas y acciones resultan útiles. No enviamos nombres, emails, direcciones, mensajes ni textos introducidos. allwain funciona igual si eliges solo lo necesario.");
    description.style.cssText = "display:block;font-size:14px;line-height:1.5";
    var actionsContainer = document.createElement("div");
    actionsContainer.setAttribute("data-actions", "");
    actionsContainer.style.cssText = "display:flex;gap:10px;margin-top:14px";
    banner.appendChild(title);
    banner.appendChild(description);
    banner.appendChild(actionsContainer);
    var actions = banner.querySelector("[data-actions]");
    [
      { label: "Solo necesarias", value: false },
      { label: "Permitir medición", value: true }
    ].forEach(function (choice) {
      var button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-consent-source", choice.label);
      button.style.cssText = "flex:1;min-height:46px;padding:8px;border:2px solid #333;border-radius:8px;background:#fff;color:#242424;font-weight:800;cursor:pointer";
      button.addEventListener("click", function () {
        saveChoice(measurementId, choice.value, banner);
      });
      actions.appendChild(button);
    });
    updateBannerCopy(banner);
    document.body.appendChild(banner);
  }

  window.addEventListener("allwain:localechange", function () {
    updateBannerCopy(document.getElementById("allwain-analytics-consent"));
  });

  fetch("/analytics-config.json", { credentials: "omit", cache: "no-store" })
    .then(function (response) { return response.ok ? response.json() : {}; })
    .then(function (config) {
      var measurementId = String(config.measurementId || "").trim();
      if (!/^G-[A-Z0-9]+$/.test(measurementId) || (config.staticBuildEnvironment !== "test" && config.staticBuildEnvironment !== "live")) return;
      activeMeasurementId = measurementId;
      buildEnvironment = config.staticBuildEnvironment;
      var status = window.localStorage.getItem(storageKey);
      if (status === "granted") {
        collectionGranted = true;
        sendPageView(measurementId);
      } else if (status === "denied") {
        clearAnalyticsCookies(measurementId);
      } else if (status !== "denied") {
        showBanner(measurementId);
      }
      document.querySelectorAll("[data-analytics-preferences]").forEach(function (button) {
        button.addEventListener("click", function () {
          if (!document.getElementById("allwain-analytics-consent")) {
            showBanner(measurementId);
          }
        });
      });
      if ("IntersectionObserver" in window) {
        var seenScreens = new Set();
        var screenObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting || entry.intersectionRatio < .55 || seenScreens.has(entry.target.id)) return;
            seenScreens.add(entry.target.id);
            track("web_screen_view", { screen: entry.target.id, locale: document.documentElement.lang || "es" });
          });
        }, { threshold: [.55] });
        document.querySelectorAll(".screen[id]").forEach(function (screen) { screenObserver.observe(screen); });
      }
    })
    .catch(function () {
      collectionGranted = false;
      // Analytics is optional; the public site remains fully usable.
    });
})();
