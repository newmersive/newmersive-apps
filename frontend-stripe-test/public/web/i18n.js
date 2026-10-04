(function () {
  "use strict";

  var supportedLocales = ["es", "en", "fr", "it", "zh", "ar"];
  var rtlLocales = new Set(["ar"]);
  var explicitLocaleStorageKey = "allwain.web.locale.v1";
  var sharedProfileStorageKey = "allwain_auth.profile";
  var translations = window.AllwainWebTranslations || {};
  var textEntries = [];
  var attributeEntries = [];
  var titleSource = document.title;
  var activeLocale = "es";
  var identityToken = "";
  var manualChoiceRevision = 0;

  function normalizeLocale(value) {
    var language = String(value || "")
      .trim()
      .toLowerCase()
      .split(/[-_]/)[0];
    return supportedLocales.includes(language) ? language : null;
  }

  function interpolate(template, replacements) {
    return Object.entries(replacements || {}).reduce(function (text, entry) {
      return text.replaceAll("{" + entry[0] + "}", String(entry[1]));
    }, template);
  }

  function translate(source, replacements) {
    var translated = activeLocale === "es"
      ? source
      : translations[activeLocale]?.[source] || translations.en?.[source] || source;
    return interpolate(translated, replacements);
  }

  function hasTranslation(source, locale) {
    var targetLocale = normalizeLocale(locale) || activeLocale;
    if (targetLocale !== "es") return typeof translations[targetLocale]?.[source] === "string";
    return supportedLocales.some(function (candidate) {
      return candidate !== "es" && typeof translations[candidate]?.[source] === "string";
    });
  }

  function readJsonStorage(key) {
    try {
      var value = window.localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (_error) {
      return null;
    }
  }

  function storedProfileLocale() {
    var profile = readJsonStorage(sharedProfileStorageKey);
    return normalizeLocale(profile?.user?.preferredLocale || profile?.data?.user?.preferredLocale);
  }

  function explicitStoredLocale() {
    try {
      return normalizeLocale(window.localStorage.getItem(explicitLocaleStorageKey));
    } catch (_error) {
      return null;
    }
  }

  function browserLocale() {
    var candidates = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    for (var index = 0; index < candidates.length; index += 1) {
      var candidate = normalizeLocale(candidates[index]);
      if (candidate) return candidate;
    }
    try {
      return normalizeLocale(Intl.DateTimeFormat().resolvedOptions().locale) || "es";
    } catch (_error) {
      return "es";
    }
  }

  function captureTextNodes() {
    if (!document.body || textEntries.length) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent || parent.closest("script, style, [data-i18n-dynamic], [data-i18n-ignore], [data-locality], [data-route-origin], [data-route-destination]")) {
          return NodeFilter.FILTER_REJECT;
        }
        return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var node;
    while ((node = walker.nextNode())) {
      var original = node.nodeValue;
      var source = original.trim();
      var start = original.indexOf(source);
      textEntries.push({
        node: node,
        source: source,
        prefix: original.slice(0, start),
        suffix: original.slice(start + source.length)
      });
    }
  }

  function captureAttributes() {
    if (attributeEntries.length) return;
    ["aria-label", "alt", "placeholder", "title"].forEach(function (attribute) {
      document.querySelectorAll("[" + attribute + "]").forEach(function (element) {
        if (element.closest("[data-i18n-ignore]")) return;
        attributeEntries.push({ element: element, attribute: attribute, source: element.getAttribute(attribute) || "" });
      });
    });
    document.querySelectorAll('meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[property="og:image:alt"]').forEach(function (element) {
      attributeEntries.push({ element: element, attribute: "content", source: element.getAttribute("content") || "" });
    });
  }

  function applyCapturedCopy() {
    textEntries.forEach(function (entry) {
      entry.node.nodeValue = entry.prefix + translate(entry.source) + entry.suffix;
    });
    attributeEntries.forEach(function (entry) {
      entry.element.setAttribute(entry.attribute, translate(entry.source));
    });
    document.title = translate(titleSource);
  }

  function setDocumentLocale(locale) {
    document.documentElement.lang = locale;
    document.documentElement.dir = rtlLocales.has(locale) ? "rtl" : "ltr";
    var openGraphLocale = document.querySelector('meta[property="og:locale"]');
    if (openGraphLocale) {
      openGraphLocale.content = ({ es: "es_ES", en: "en_GB", fr: "fr_FR", it: "it_IT", zh: "zh_CN", ar: "ar_AR" })[locale];
    }
    var selector = document.querySelector("#site-language");
    if (selector && selector.value !== locale) selector.value = locale;
  }

  function applyLocale(value, options) {
    var locale = normalizeLocale(value) || "es";
    var previousLocale = activeLocale;
    activeLocale = locale;
    setDocumentLocale(locale);
    applyCapturedCopy();
    if (options?.persist) {
      try {
        window.localStorage.setItem(explicitLocaleStorageKey, locale);
      } catch (_error) {
        // The active page still keeps the explicit choice in memory.
      }
    }
    window.dispatchEvent(new CustomEvent("allwain:localechange", {
      detail: { locale: locale, previousLocale: previousLocale, source: options?.source || "runtime" }
    }));
    window.requestAnimationFrame(function () {
      window.dispatchEvent(new Event("resize"));
    });
    return locale;
  }

  async function persistAuthenticatedLocale(locale) {
    if (!identityToken) return false;
    try {
      var response = await fetch("https://api.allwain.es/api/auth/preferences", {
        method: "PATCH",
        mode: "cors",
        credentials: "include",
        cache: "no-store",
        referrerPolicy: "strict-origin-when-cross-origin",
        headers: {
          Authorization: "Bearer " + identityToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ locale: locale })
      });
      if (response.status === 401) identityToken = "";
      return response.ok;
    } catch (_error) {
      return false;
    }
  }

  async function acceptIdentity(user, token) {
    identityToken = typeof token === "string" ? token : "";
    var preferredLocale = normalizeLocale(user?.preferredLocale);
    var explicitLocale = explicitStoredLocale();
    if (manualChoiceRevision > 0) {
      var selectedLocale = activeLocale;
      if (preferredLocale !== selectedLocale) await persistAuthenticatedLocale(selectedLocale);
      return selectedLocale;
    }
    if (explicitLocale) {
      if (explicitLocale !== activeLocale) applyLocale(explicitLocale, { source: "explicit-cache" });
      return explicitLocale;
    }
    if (preferredLocale) return applyLocale(preferredLocale, { source: "profile" });
    return activeLocale;
  }

  function handleSelectorChange(event) {
    var locale = normalizeLocale(event.target?.value);
    if (!locale) return;
    manualChoiceRevision += 1;
    applyLocale(locale, { persist: true, source: "selector" });
    void persistAuthenticatedLocale(locale);
  }

  captureTextNodes();
  captureAttributes();
  var initialExplicitLocale = explicitStoredLocale();
  var initialProfileLocale = storedProfileLocale();
  activeLocale = initialExplicitLocale || initialProfileLocale || browserLocale() || "es";
  applyLocale(activeLocale, {
    source: initialExplicitLocale ? "explicit-cache" : initialProfileLocale ? "profile-cache" : "initial"
  });
  document.querySelector("#site-language")?.addEventListener("change", handleSelectorChange);

  window.AllwainI18n = {
    supportedLocales: supportedLocales.slice(),
    normalizeLocale: normalizeLocale,
    translate: translate,
    hasTranslation: hasTranslation,
    applyLocale: applyLocale,
    acceptIdentity: acceptIdentity,
    get locale() { return activeLocale; },
    get direction() { return rtlLocales.has(activeLocale) ? "rtl" : "ltr"; }
  };
})();
