(function () {
  "use strict";

  var supportedLocales = ["es", "en", "fr", "it", "zh", "ar"];
  var rtlLocales = new Set(["ar"]);
  var storageKey = "allwain.web.locale.v1";
  var pageAliases = { privacy: "privacidad", terms: "terminos", "delete-account": "eliminar-cuenta" };
  var requestedPage = location.pathname.split("/").filter(Boolean)[0] || "aviso-legal";
  var page = pageAliases[requestedPage] || requestedPage;
  var catalogue = window.AllwainLegalTranslations?.[page] || {};
  var textEntries = [];
  var attributeEntries = [];
  var titleSource = normalizeBrand(document.title);
  var activeLocale = "es";

  function normalizeBrand(value) {
    return String(value || "").replace(/\b(?:Allwain|ALLWAIN)\b/g, "allwain");
  }

  function normalizeLocale(value) {
    var locale = String(value || "").trim().toLowerCase().split(/[-_]/)[0];
    return supportedLocales.includes(locale) ? locale : null;
  }

  function storedLocale() {
    try {
      return normalizeLocale(localStorage.getItem(storageKey));
    } catch (_error) {
      return null;
    }
  }

  function browserLocale() {
    var candidates = Array.isArray(navigator.languages) ? navigator.languages : [navigator.language];
    for (var index = 0; index < candidates.length; index += 1) {
      var locale = normalizeLocale(candidates[index]);
      if (locale) return locale;
    }
    return "es";
  }

  function translate(source) {
    var normalized = normalizeBrand(source);
    if (activeLocale === "es") return normalized;
    return normalizeBrand(catalogue?.[activeLocale]?.[normalized] || normalized);
  }

  function capture() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent || parent.closest("script, style, [data-legal-i18n-ignore]")) return NodeFilter.FILTER_REJECT;
        return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var node;
    while ((node = walker.nextNode())) {
      var original = node.nodeValue;
      var source = original.trim();
      var start = original.indexOf(source);
      textEntries.push({ node: node, source: normalizeBrand(source), prefix: original.slice(0, start), suffix: original.slice(start + source.length) });
    }
    ["aria-label", "alt", "placeholder", "title"].forEach(function (attribute) {
      document.querySelectorAll("[" + attribute + "]").forEach(function (element) {
        attributeEntries.push({ element: element, attribute: attribute, source: normalizeBrand(element.getAttribute(attribute) || "") });
      });
    });
    document.querySelectorAll('meta[name="description"]').forEach(function (element) {
      attributeEntries.push({ element: element, attribute: "content", source: normalizeBrand(element.content || "") });
    });
  }

  var languageLabels = {
    es: "Idioma",
    en: "Language",
    fr: "Langue",
    it: "Lingua",
    zh: "语言",
    ar: "اللغة"
  };

  function ensureSelector() {
    var header = document.querySelector(".header-inner");
    if (!header || document.querySelector("#legal-language")) return;
    var label = document.createElement("label");
    label.className = "legal-language";
    label.setAttribute("data-legal-i18n-ignore", "");
    var visible = document.createElement("span");
    visible.textContent = languageLabels[activeLocale];
    var select = document.createElement("select");
    select.id = "legal-language";
    select.setAttribute("aria-label", languageLabels[activeLocale]);
    [
      ["es", "Español"],
      ["en", "English"],
      ["fr", "Français"],
      ["it", "Italiano"],
      ["zh", "中文"],
      ["ar", "العربية"]
    ].forEach(function (entry) {
      var option = document.createElement("option");
      option.value = entry[0];
      option.lang = entry[0];
      option.textContent = entry[1];
      select.append(option);
    });
    select.value = activeLocale;
    select.addEventListener("change", function () {
      applyLocale(select.value, true);
    });
    label.append(visible, select);
    header.append(label);
  }

  function applyLocale(value, persist) {
    activeLocale = normalizeLocale(value) || "es";
    document.documentElement.lang = activeLocale;
    document.documentElement.dir = rtlLocales.has(activeLocale) ? "rtl" : "ltr";
    textEntries.forEach(function (entry) {
      entry.node.nodeValue = entry.prefix + translate(entry.source) + entry.suffix;
    });
    attributeEntries.forEach(function (entry) {
      entry.element.setAttribute(entry.attribute, translate(entry.source));
    });
    document.title = translate(titleSource);
    var selector = document.querySelector("#legal-language");
    if (selector) {
      selector.value = activeLocale;
      selector.previousElementSibling.textContent = languageLabels[activeLocale];
      selector.setAttribute("aria-label", languageLabels[activeLocale]);
    }
    if (persist) {
      try { localStorage.setItem(storageKey, activeLocale); } catch (_error) { /* The page keeps the live choice. */ }
    }
  }

  capture();
  var queryLocale = normalizeLocale(new URLSearchParams(location.search).get("lang"));
  activeLocale = queryLocale || storedLocale() || browserLocale();
  ensureSelector();
  applyLocale(activeLocale, Boolean(queryLocale));
})();
