import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(projectRoot, "public", "web");
const html = fs.readFileSync(path.join(webRoot, "index.html"), "utf8");
const testerHtml = fs.readFileSync(path.join(webRoot, "tester", "index.html"), "utf8");
const app = fs.readFileSync(path.join(webRoot, "app.js"), "utf8");
const experience = fs.readFileSync(path.join(webRoot, "experience.js"), "utf8");
const tester = fs.readFileSync(path.join(webRoot, "tester", "tester.js"), "utf8");
const analytics = fs.readFileSync(path.join(projectRoot, "public", "analytics-static.js"), "utf8");
const runtime = fs.readFileSync(path.join(webRoot, "i18n.js"), "utf8");
const dataSource = fs.readFileSync(path.join(webRoot, "i18n-data.js"), "utf8");
const guideServicePath = path.join(projectRoot, "..", "backend", "src", "services", "ai", "allwain-public-guide.ai.service.ts");
const guideService = fs.readFileSync(guideServicePath, "utf8");
const context = { window: {} };
vm.runInNewContext(dataSource, context, { filename: "i18n-data.js" });
const catalogue = context.window.AllwainWebTranslations;
const locales = ["en", "fr", "it", "zh", "ar"];

assert.deepEqual(Object.keys(catalogue), locales);
locales.forEach((locale) => assert.ok(Object.keys(catalogue[locale]).length > 450, `${locale} catalogue is unexpectedly small`));

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(x?)([0-9a-f]+);/gi, (_match, hex, digits) => String.fromCodePoint(Number.parseInt(digits, hex ? 16 : 10)));
}

function normalize(value) {
  return decodeHtml(value).replace(/\s+/g, " ").trim().replace(/\b(?:Allwain|ALLWAIN)\b/g, "allwain");
}

const invariants = new Set([
  "allwain", "Foios", "FOIOS", "Valencia", "VALENCIA", "Navel Lane Late",
  "Español", "English", "Français", "Italiano", "中文", "العربية",
  "QLED", "4K UHD", "HDMI 2.1", "HDR10+", "OpenAI", "Email", "Cookies", "Android", "completed", "LOGOUT_FAILED",
  "1 €/kg", "#f7f2ea", "#fffdf9", "index,follow,max-image-preview:large", "noindex,nofollow",
  "width=device-width, initial-scale=1", "width=device-width, initial-scale=1, viewport-fit=cover",
]);
const ignorable = (value) => !value || invariants.has(value) || /^[\d\s€%×+←→↗↓↳＋✓◎.\/·:()—–\-″"]+$/u.test(value);

const htmlSources = new Set();
for (const htmlDocument of [html, testerHtml]) {
  const htmlWithoutCode = htmlDocument
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  for (const match of htmlWithoutCode.matchAll(/>([^<]+)</g)) {
    const source = normalize(match[1]);
    if (!ignorable(source)) htmlSources.add(source);
  }
  for (const match of htmlWithoutCode.matchAll(/\b(?:aria-label|alt|placeholder|title|content)="([^"]+)"/g)) {
    const source = normalize(match[1]);
    if (!ignorable(source) && !/^https?:/i.test(source) && !/^[-\w/.]+$/.test(source)) htmlSources.add(source);
  }
}

const dynamicSources = new Set();
const stringLiteral = '"((?:\\\\.|[^"\\\\])*)"';
const dynamicPatterns = [
  new RegExp(`\\btr\\(${stringLiteral}`, "g"),
  new RegExp(`\\btranslated(?:Text|Button)\\([^,]+,\\s*${stringLiteral}`, "g"),
  new RegExp(`\\bsetDynamicCopy\\([^,]+,\\s*${stringLiteral}`, "g"),
  new RegExp(`\\bset(?:Text|Status)\\([^,]+,\\s*${stringLiteral}`, "g"),
  new RegExp(`\\bsetFeedback(?:Auth)?Status\\(\\s*${stringLiteral}`, "g"),
  new RegExp(`\\bnew Error\\(\\s*${stringLiteral}`, "g"),
  new RegExp(`\\b[A-Z][A-Z0-9_]+:\\s*${stringLiteral}`, "g"),
  /\btext:\s*"((?:\\.|[^"\\])*)"/g,
  /\b(?:eyebrow|title|copy|total|label|marker|detail|status):\s*"((?:\\.|[^"\\])*)"/g,
  /data-consent-source",\s*"((?:\\.|[^"\\])*)"/g,
];
for (const sourceCode of [app, experience, tester, analytics]) {
  dynamicPatterns.forEach((pattern) => {
    pattern.lastIndex = 0;
    for (const match of sourceCode.matchAll(pattern)) {
      const source = normalize(JSON.parse(`"${match[1]}"`));
      if (!ignorable(source)) dynamicSources.add(source);
    }
  });
}

// The private tester route builds part of its status copy with conditional
// expressions. Include every human-readable literal so those branches cannot
// silently fall back to Spanish in another locale.
for (const match of tester.matchAll(/"((?:\\.|[^"\\])*)"/g)) {
  const source = normalize(JSON.parse(`"${match[1]}"`));
  const looksLikeCopy = /\s/u.test(source) || /[áéíóúüñ¿¡…]/iu.test(source);
  if (looksLikeCopy && source !== "use strict" && !ignorable(source)) dynamicSources.add(source);
}

const multilingualGuideBlock = guideService.match(/function multilingualSourceAnswer[\s\S]+?\n}\n\nfunction localAnswer/)?.[0] || "";
for (const match of multilingualGuideBlock.matchAll(/return\s+"((?:\\.|[^"\\])*)"/g)) {
  const source = normalize(JSON.parse(`"${match[1]}"`));
  if (!ignorable(source)) dynamicSources.add(source);
}
for (const match of guideService.matchAll(/\btext:\s*"((?:\\.|[^"\\])*)"/g)) {
  const source = normalize(JSON.parse(`"${match[1]}"`));
  if (!ignorable(source)) dynamicSources.add(source);
}

const expectedOptions = ['value="es"', 'value="en"', 'value="fr"', 'value="it"', 'value="zh"', 'value="ar"'];
for (const [name, htmlDocument] of [["public", html], ["tester", testerHtml]]) {
  expectedOptions.forEach((option) => assert.ok(htmlDocument.includes(option), `${name}: missing language option ${option}`));
  assert.ok(htmlDocument.indexOf("i18n-data.js") < htmlDocument.indexOf("i18n.js"), `${name}: translation data must load before runtime`);
  assert.ok(htmlDocument.indexOf("i18n.js") < htmlDocument.indexOf("analytics-static.js"), `${name}: runtime must load before dynamic copy`);
}
assert.match(runtime, /allwain_auth\.profile/);
assert.match(runtime, /\/auth\/preferences/);
assert.doesNotMatch(runtime, /\/auth\/refresh/);
assert.match(runtime, /initialExplicitLocale\s*\|\|\s*initialProfileLocale/);
assert.match(runtime, /document\.documentElement\.dir\s*=\s*rtlLocales\.has\(locale\)/);
assert.match(app, /locale:\s*activeLocale\(\)/);
assert.match(app, /data-guide-translatable/);
assert.doesNotMatch(`${html}\n${testerHtml}`, /\b(?:Allwain|ALLWAIN)\b/, "HTML contains an uppercase brand spelling");
assert.doesNotMatch(experience, /["'`]([^"'`]*\b(?:Allwain|ALLWAIN)\b[^"'`]*)["'`]/, "experience copy contains an uppercase brand spelling");
assert.doesNotMatch(tester, /["'`]([^"'`]*\b(?:Allwain|ALLWAIN)\b[^"'`]*)["'`]/, "tester copy contains an uppercase brand spelling");

const sensitiveFunction = app
  .match(/function looksSensitive[\s\S]+?\n}\n\nasync function requestPublicGuide/)?.[0]
  ?.replace(/\n\nasync function requestPublicGuide$/, "");
assert.ok(sensitiveFunction, "could not isolate the sensitive-data filter");
const sensitiveContext = {};
vm.runInNewContext(`${sensitiveFunction}\nthis.looksSensitive = looksSensitive;`, sensitiveContext);
[
  "usuario@example.com",
  "用户@例子.公司",
  "مستخدم@مثال.موقع",
  "Calle Colón 12",
  "北京市朝阳路١٢号",
  "شارع النيل ١٢",
  "٠٥٠١٢٣٤٥٦٧",
].forEach((sample) => assert.equal(sensitiveContext.looksSensitive(sample), true, `sensitive sample was not blocked: ${sample}`));
assert.equal(sensitiveContext.looksSensitive("¿Cómo funciona el mercado de la demanda?"), false);

const missing = {};
locales.forEach((locale) => {
  missing[locale] = [...new Set([...htmlSources, ...dynamicSources])]
    .filter((source) => typeof catalogue[locale][source] !== "string")
    .sort((left, right) => left.localeCompare(right, "es"));
});

const failures = Object.entries(missing).filter(([, values]) => values.length);
if (failures.length) {
  console.error(JSON.stringify({ missing }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    locales: ["es", ...locales],
    staticSources: htmlSources.size,
    dynamicSources: dynamicSources.size,
    catalogueEntries: Object.fromEntries(locales.map((locale) => [locale, Object.keys(catalogue[locale]).length])),
    missing: 0,
  }, null, 2));
}
