(function () {
  "use strict";

  var consentVersion = "allwain-analytics-v1-2026-09-06";
  var storageKey = "allwain:analytics-consent:" + consentVersion;
  var activeMeasurementId = "";
  var safeParameterNames = new Set(["release", "locale", "screen", "action", "variant", "step", "source", "authenticated", "category"]);

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
    window["ga-disable-" + measurementId] = true;
    if (window.gtag) {
      window.gtag("consent", "update", {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied"
      });
    }
    var host = window.location.hostname;
    var domains = ["", host, host ? "." + host : "", ".allwain.es"];
    document.cookie.split(";").forEach(function (entry) {
      var name = entry.split("=")[0].trim();
      if (name.indexOf("_ga") !== 0 && name !== "_gid" && name.indexOf("_gat") !== 0) return;
      domains.forEach(function (domain) {
        var domainPart = domain ? "; domain=" + domain : "";
        document.cookie = name + "=; Max-Age=0; path=/" + domainPart + "; SameSite=Lax; Secure";
      });
    });
  }

  function loadTag(measurementId) {
    if (document.getElementById("allwain-google-analytics")) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
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
    window.gtag("config", measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
    var script = document.createElement("script");
    script.id = "allwain-google-analytics";
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
    document.head.appendChild(script);
  }

  function sendPageView(measurementId) {
    loadTag(measurementId);
    window.gtag("event", "page_view", {
      page_title: "allwain web",
      page_location: window.location.origin + "/web/"
    });
  }

  function track(eventName, parameters) {
    if (!activeMeasurementId || window.localStorage.getItem(storageKey) !== "granted") return false;
    var safeName = String(eventName || "").trim();
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(safeName)) return false;
    var safeParameters = {};
    Object.entries(parameters || {}).forEach(function (entry) {
      var key = entry[0];
      var value = entry[1];
      if (!safeParameterNames.has(key) || value === undefined || value === null) return;
      if (typeof value === "boolean") safeParameters[key] = value;
      else safeParameters[key] = String(value).replace(/[^a-z0-9_.:#-]/gi, "_").slice(0, 64);
    });
    loadTag(activeMeasurementId);
    window.gtag("event", safeName, safeParameters);
    return true;
  }

  window.AllwainAnalytics = { track: track };

  function saveChoice(measurementId, granted, banner) {
    window.localStorage.setItem(storageKey, granted ? "granted" : "denied");
    banner.remove();
    if (granted) {
      window["ga-disable-" + measurementId] = false;
      sendPageView(measurementId);
    } else {
      clearAnalyticsCookies(measurementId);
    }
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
      if (!/^G-[A-Z0-9]+$/i.test(measurementId)) return;
      activeMeasurementId = measurementId;
      var status = window.localStorage.getItem(storageKey);
      if (status === "granted") {
        sendPageView(measurementId);
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
      // Analytics is optional; the public site remains fully usable.
    });
})();
