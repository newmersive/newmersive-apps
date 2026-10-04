import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportsRoot = path.resolve(projectRoot, "..", ".deploy", "reports");
const inputs = [
  path.join(reportsRoot, "legal-core-i18n-draft.json"),
  path.join(reportsRoot, "legal-aux-i18n-draft.json"),
  path.join(reportsRoot, "legal-core-node-i18n-draft.json"),
  path.join(reportsRoot, "legal-aux-node-i18n-draft.json"),
];
const output = path.join(projectRoot, "public", "legal-i18n-data.js");
const locales = ["en", "fr", "it", "zh", "ar"];
const catalogue = {};

function normalizeBrand(value) {
  return String(value || "").replace(/\b(?:Allwain|ALLWAIN)\b/g, "allwain");
}

function add(page, locale, source, translation) {
  if (!page || !locales.includes(locale) || !source || !translation) return;
  catalogue[page] ||= Object.fromEntries(locales.map((candidate) => [candidate, {}]));
  const normalizedSource = normalizeBrand(source);
  const normalizedTranslation = normalizeBrand(translation);
  const existing = catalogue[page][locale][normalizedSource];
  if (existing && existing !== normalizedTranslation) {
    throw new Error(`Conflicting legal translation: ${page}/${locale}/${normalizedSource}`);
  }
  catalogue[page][locale][normalizedSource] = normalizedTranslation;
}

inputs.forEach((input) => {
  if (!fs.existsSync(input)) throw new Error(`Missing legal translation draft: ${input}`);
  const draft = JSON.parse(fs.readFileSync(input, "utf8"));
  Object.entries(draft).forEach(([page, pageValue]) => {
    Object.entries(pageValue || {}).forEach(([locale, entries]) => {
      Object.entries(entries || {}).forEach(([source, translation]) => add(page, locale, source, translation));
    });
  });
});

const privacyExtras = {
  "Durante esta fase exclusivamente informativa y de prueba, el canal de privacidad del proyecto NEWMERSIVE para allwain es": {
    en: "During this exclusively informational and testing phase, the privacy contact for the NEWMERSIVE allwain project is",
    fr: "Pendant cette phase exclusivement informative et d’essai, le contact confidentialité du projet allwain de NEWMERSIVE est",
    it: "Durante questa fase esclusivamente informativa e di prova, il contatto privacy del progetto allwain di NEWMERSIVE è",
    zh: "在这一仅用于信息展示和测试的阶段，NEWMERSIVE 的 allwain 项目隐私联系渠道为",
    ar: "خلال هذه المرحلة المخصّصة للمعلومات والاختبار فقط، تكون قناة الخصوصية لمشروع allwain التابع لـ NEWMERSIVE هي"
  },
  "La identidad y los datos legales completos del responsable comercial se publicarán antes de activar contratación o pagos reales.": {
    en: "The commercial controller’s identity and full legal details will be published before real contracting or payments are enabled.",
    fr: "L’identité et les coordonnées légales complètes du responsable commercial seront publiées avant l’activation de contrats ou de paiements réels.",
    it: "L’identità e i dati legali completi del responsabile commerciale saranno pubblicati prima di attivare contratti o pagamenti reali.",
    zh: "在启用真实签约或付款前，将公布商业负责方的身份及完整法定信息。",
    ar: "ستُنشر هوية المسؤول التجاري وبياناته القانونية الكاملة قبل تفعيل أي تعاقد أو مدفوعات فعلية."
  },
  "no hay pagos reales activos. Esta información provisional deberá actualizarse con la identificación legal exigible antes de abrir la actividad económica.": {
    en: "no real payments are active. This provisional information must be updated with the legally required identification before economic activity begins.",
    fr: "aucun paiement réel n’est actif. Ces informations provisoires devront être mises à jour avec l’identification légale requise avant le début de l’activité économique.",
    it: "non sono attivi pagamenti reali. Queste informazioni provvisorie dovranno essere aggiornate con l’identificazione legale richiesta prima di avviare l’attività economica.",
    zh: "目前未启用真实付款。开展经济活动前，必须用法律要求的身份信息更新这些临时说明。",
    ar: "لا توجد مدفوعات فعلية مفعّلة. ويجب تحديث هذه المعلومات المؤقتة ببيانات التعريف القانونية المطلوبة قبل بدء النشاط الاقتصادي."
  }
};

const noticeExtras = {
  "1. Operador y contacto": {
    en: "1. Operator and contact", fr: "1. Opérateur et contact", it: "1. Gestore e contatti", zh: "1. 运营方与联系方式", ar: "1. المشغّل وبيانات الاتصال"
  },
  "allwain, proyecto NEWMERSIVE en fase de prueba.": {
    en: "allwain, a NEWMERSIVE project in its testing phase.", fr: "allwain, un projet NEWMERSIVE en phase d’essai.", it: "allwain, un progetto NEWMERSIVE in fase di prova.", zh: "allwain，处于测试阶段的 NEWMERSIVE 项目。", ar: "allwain، مشروع تابع لـ NEWMERSIVE في مرحلة الاختبار."
  },
  "Operador comercial definitivo:": {
    en: "Final commercial operator:", fr: "Opérateur commercial définitif :", it: "Gestore commerciale definitivo:", zh: "最终商业运营方：", ar: "المشغّل التجاري النهائي:"
  },
  "pendiente de formalización y publicación antes de activar cualquier contratación o pago real.": {
    en: "to be formalized and published before any real contracting or payment is enabled.", fr: "à formaliser et à publier avant l’activation de tout contrat ou paiement réel.", it: "da formalizzare e pubblicare prima di attivare qualsiasi contratto o pagamento reale.", zh: "将在启用任何真实签约或付款前完成正式确认并公布。", ar: "سيُعتمد ويُنشر قبل تفعيل أي تعاقد أو دفع فعلي."
  },
  "esta versión informa y permite realizar pruebas, pero no ofrece todavía contratación, cobros, ventas ni comisiones reales. Antes de abrir la actividad económica se publicará la identificación legal completa exigible del prestador.": {
    en: "this version provides information and enables testing, but it does not yet offer real contracting, charges, sales or commissions. The provider’s complete legally required identification will be published before economic activity begins.",
    fr: "cette version informe et permet des essais, mais ne propose pas encore de contrats, d’encaissements, de ventes ni de commissions réels. L’identification légale complète requise du prestataire sera publiée avant le début de l’activité économique.",
    it: "questa versione informa e consente prove, ma non offre ancora contratti, incassi, vendite o commissioni reali. L’identificazione legale completa richiesta del prestatore sarà pubblicata prima dell’avvio dell’attività economica.",
    zh: "此版本用于信息展示和测试，尚不提供真实签约、收款、销售或佣金。开展经济活动前，将公布服务提供方依法应披露的完整身份信息。",
    ar: "تقدّم هذه النسخة معلومات وتتيح الاختبار، لكنها لا توفّر بعد تعاقدات أو تحصيلات أو مبيعات أو عمولات فعلية. وسيُنشر التعريف القانوني الكامل المطلوب لمقدّم الخدمة قبل بدء النشاط الاقتصادي."
  }
};

const termsExtras = {
  "allwain es el nombre público de un proyecto de NEWMERSIVE todavía en fase de prueba. El contacto operativo es": {
    en: "allwain is the public name of a NEWMERSIVE project that is still in its testing phase. The operational contact is",
    fr: "allwain est le nom public d’un projet NEWMERSIVE encore en phase d’essai. Le contact opérationnel est",
    it: "allwain è il nome pubblico di un progetto NEWMERSIVE ancora in fase di prova. Il contatto operativo è",
    zh: "allwain 是仍处于测试阶段的 NEWMERSIVE 项目的公开名称。运营联系方式为",
    ar: "allwain هو الاسم العام لمشروع تابع لـ NEWMERSIVE لا يزال في مرحلة الاختبار. وجهة الاتصال التشغيلية هي"
  },
  "La identidad y los datos legales completos del prestador comercial se publicarán antes de activar ventas o pagos reales.": {
    en: "The commercial provider’s identity and full legal details will be published before real sales or payments are enabled.",
    fr: "L’identité et les coordonnées légales complètes du prestataire commercial seront publiées avant l’activation de ventes ou de paiements réels.",
    it: "L’identità e i dati legali completi del prestatore commerciale saranno pubblicati prima di attivare vendite o pagamenti reali.",
    zh: "在启用真实销售或付款前，将公布商业服务提供方的身份及完整法定信息。",
    ar: "ستُنشر هوية مقدّم الخدمة التجاري وبياناته القانونية الكاملة قبل تفعيل المبيعات أو المدفوعات الفعلية."
  },
  "No se habilitarán ventas reales hasta formalizar al prestador y aprobar la versión comercial, fiscal y operativa que deberá aceptar cada parte cuando corresponda.": {
    en: "Real sales will not be enabled until the provider is formally established and the commercial, tax and operational version that each party must accept when applicable has been approved.",
    fr: "Aucune vente réelle ne sera activée avant la formalisation du prestataire et l’approbation de la version commerciale, fiscale et opérationnelle que chaque partie devra accepter le moment venu.",
    it: "Le vendite reali non saranno abilitate finché il prestatore non sarà formalizzato e non sarà approvata la versione commerciale, fiscale e operativa che ciascuna parte dovrà accettare quando previsto.",
    zh: "在服务提供方完成正式设立，且各方在适用时须接受的商业、税务和运营版本获批前，不会启用真实销售。",
    ar: "لن تُفعّل المبيعات الفعلية قبل إضفاء الصفة الرسمية على مقدّم الخدمة واعتماد النسخة التجارية والضريبية والتشغيلية التي يجب على كل طرف قبولها عند الاقتضاء."
  }
};

[
  ["aviso-legal", noticeExtras],
  ["privacidad", privacyExtras],
  ["terminos", termsExtras]
].forEach(([page, extras]) => {
  Object.entries(extras).forEach(([source, translations]) => {
    locales.forEach((locale) => {
      if (!catalogue[page]?.[locale]?.[normalizeBrand(source)]) add(page, locale, source, translations[locale]);
    });
  });
});

Object.values(catalogue).forEach((pageValue) => {
  locales.forEach((locale) => {
    pageValue[locale] = Object.fromEntries(Object.entries(pageValue[locale]).sort(([left], [right]) => left.localeCompare(right, "es")));
  });
});

const serialized = JSON.stringify(catalogue, null, 2).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
fs.writeFileSync(output, [
  "/* Generated from reviewed legal translation catalogues. */",
  "(function () {",
  '  "use strict";',
  `  window.AllwainLegalTranslations = ${serialized};`,
  "})();",
  ""
].join("\n"), "utf8");

console.log(JSON.stringify({
  output,
  pages: Object.fromEntries(Object.entries(catalogue).map(([page, values]) => [page, Object.fromEntries(locales.map((locale) => [locale, Object.keys(values[locale]).length]))]))
}, null, 2));
