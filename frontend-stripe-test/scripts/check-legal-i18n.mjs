import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(projectRoot, "public");
const pages = ["aviso-legal", "privacidad", "terminos", "cookies", "seguridad", "soporte", "eliminar-cuenta"];
const locales = ["en", "fr", "it", "zh", "ar"];
const source = fs.readFileSync(path.join(publicRoot, "legal-i18n-data.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context, { filename: "legal-i18n-data.js" });
const catalogue = context.window.AllwainLegalTranslations;

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

function ignorable(value) {
  return !value
    || /^[\d\s€%×+←→↓＋✓◎./·:()—–-]+$/u.test(value)
    || /^(?:allwain|NEWMERSIVE|OpenAI|Stripe|Google|Apple|IONOS|Expo|LiveKit|Sendcloud|Foios|Valencia|Email)$/u.test(value)
    || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    || /^https?:/i.test(value);
}

const missing = {};
pages.forEach((page) => {
  const html = fs.readFileSync(path.join(publicRoot, page, "index.html"), "utf8");
  assert.doesNotMatch(html, /\b(?:Allwain|ALLWAIN)\b/, `${page} contains an uppercase brand spelling`);
  assert.doesNotMatch(html, /24393154|Diezmo|Francisco\s+Rausell|46134/, `${page} exposes removed private identification`);
  assert.match(html, /legal-i18n-data\.js/);
  assert.match(html, /legal-i18n\.js/);
  const withoutCode = html.replace(/<!--[^]*?-->/g, "").replace(/<script\b[^]*?<\/script>/gi, "").replace(/<style\b[^]*?<\/style>/gi, "");
  const texts = new Set();
  for (const match of withoutCode.matchAll(/>([^<]+)</g)) {
    const value = normalize(match[1]);
    if (!ignorable(value)) texts.add(value);
  }
  for (const match of withoutCode.matchAll(/\b(?:aria-label|alt|placeholder|title|content)="([^"]+)"/g)) {
    const value = normalize(match[1]);
    if (!ignorable(value) && !/^[-\w/.]+$/.test(value)) texts.add(value);
  }
  missing[page] = {};
  locales.forEach((locale) => {
    missing[page][locale] = [...texts].filter((text) => typeof catalogue?.[page]?.[locale]?.[text] !== "string");
  });
});

const failures = Object.entries(missing).flatMap(([page, localeValues]) =>
  Object.entries(localeValues).filter(([, values]) => values.length).map(([locale, values]) => ({ page, locale, values }))
);
if (failures.length) {
  const reportPath = path.resolve(projectRoot, "..", ".deploy", "reports", "legal-node-missing.json");
  fs.writeFileSync(reportPath, JSON.stringify({ missing: failures }, null, 2), "utf8");
  console.error(JSON.stringify({ missing: failures }, null, 2));
  console.error(`Missing-node report: ${reportPath}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ pages: pages.length, locales: ["es", ...locales], missing: 0, privateIdentification: 0, uppercaseBrand: 0 }, null, 2));
}
