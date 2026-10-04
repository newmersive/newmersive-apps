import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appsRoot = path.resolve(projectRoot, "..");
const reportsRoot = path.join(appsRoot, ".deploy", "reports");
const inputs = [
  path.join(reportsRoot, "web-i18n-en-fr-draft.json"),
  path.join(reportsRoot, "web-i18n-it-zh-draft.json"),
  path.join(reportsRoot, "web-i18n-ar-draft.json"),
  path.join(reportsRoot, "web-smart-pass-i18n-draft.json"),
];
const output = path.join(projectRoot, "public", "web", "i18n-data.js");
const locales = ["en", "fr", "it", "zh", "ar"];
const catalogue = Object.fromEntries(locales.map((locale) => [locale, {}]));
const conflicts = [];

function normalizeBrand(value) {
  return String(value || "").replace(/\b(?:Allwain|ALLWAIN)\b/g, "allwain");
}

function add(locale, source, translation, origin) {
  if (!locales.includes(locale) || !source || !translation) return;
  const normalizedSource = normalizeBrand(source);
  const normalizedTranslation = normalizeBrand(translation);
  const existing = catalogue[locale][normalizedSource];
  if (existing && existing !== normalizedTranslation) {
    conflicts.push({ locale, source: normalizedSource, existing, translation: normalizedTranslation, origin });
    if (origin === "web-smart-pass-i18n-draft.json") {
      catalogue[locale][normalizedSource] = normalizedTranslation;
    }
    return;
  }
  catalogue[locale][normalizedSource] = normalizedTranslation;
}

function walk(value, origin) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;

  if (typeof value.source === "string") {
    locales.forEach((locale) => {
      if (typeof value[locale] === "string") add(locale, value.source, value[locale], origin);
    });
  }

  Object.entries(value).forEach(([source, candidate]) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
    if (typeof candidate.source === "string") {
      locales.forEach((locale) => {
        if (typeof candidate[locale] === "string") add(locale, candidate.source, candidate[locale], origin);
      });
      return;
    }
    const available = locales.filter((locale) => typeof candidate[locale] === "string");
    if (available.length) {
      available.forEach((locale) => add(locale, source, candidate[locale], origin));
    } else {
      walk(candidate, origin);
    }
  });
}

inputs.forEach((input) => {
  if (!fs.existsSync(input)) throw new Error(`Missing translation draft: ${input}`);
  walk(JSON.parse(fs.readFileSync(input, "utf8")), path.basename(input));
});

const analyticsConsentSource = "Con tu permiso mediremos qué pantallas y acciones resultan útiles. No enviamos nombres, emails, direcciones, mensajes ni textos introducidos. allwain funciona igual si eliges solo lo necesario.";
const analyticsConsentTranslations = {
  en: "With your permission, we will measure which screens and actions are useful. We do not send names, emails, addresses, messages or text you enter. allwain works the same if you choose only what is necessary.",
  fr: "Avec votre autorisation, nous mesurerons quels écrans et quelles actions sont utiles. Nous n’envoyons ni noms, ni e-mails, ni adresses, ni messages, ni textes saisis. allwain fonctionne de la même façon si vous choisissez uniquement le nécessaire.",
  it: "Con il tuo consenso misureremo quali schermate e azioni risultano utili. Non inviamo nomi, email, indirizzi, messaggi né testi inseriti. allwain funziona allo stesso modo se scegli solo ciò che è necessario.",
  zh: "经你同意，我们会衡量哪些页面和操作有用。我们不会发送姓名、电子邮件、地址、消息或你输入的文本。即使你只选择必要功能，allwain 也会照常运行。",
  ar: "بإذنك سنقيس الشاشات والإجراءات المفيدة. لا نرسل أسماء أو عناوين بريد إلكتروني أو عناوين سكنية أو رسائل أو نصوصًا تدخلها. يعمل allwain بالطريقة نفسها إذا اخترت الضروري فقط.",
};
locales.forEach((locale) => add(locale, analyticsConsentSource, analyticsConsentTranslations[locale], "analytics-consent"));

const verifiableRouteTranslations = {
  en: "VERIFIABLE ROUTE",
  fr: "ITINÉRAIRE VÉRIFIABLE",
  it: "PERCORSO VERIFICABILE",
  zh: "可验证的路线",
  ar: "مسار قابل للتحقق",
};
locales.forEach((locale) => add(locale, "RUTA VERIFICABLE", verifiableRouteTranslations[locale], "km0-verification"));

const guideFollowUpSource = "La preventa aún no se ha abierto porque esta primera prueba debe cerrar condiciones de participación, entrega, trazabilidad y soporte. La web pública explica el modelo con maquetas libres; la prueba y sus incidencias se realizan en la app desde la sala privada. Cuando esos puntos estén verificados, se publicará una fecha.";
const guideFollowUpTranslations = {
  en: "The presale is not open yet because this first trial still needs to finalise participation, delivery, traceability and support conditions. The public website explains the model with freely explorable prototypes; testing and issue reporting take place in the app from the private tester room. A date will be published once those points have been verified.",
  fr: "La prévente n’est pas encore ouverte, car ce premier essai doit finaliser les conditions de participation, de livraison, de traçabilité et d’assistance. Le site public explique le modèle à l’aide de maquettes en libre accès ; le test et les signalements s’effectuent dans l’app depuis l’espace privé. Une date sera publiée lorsque ces points auront été vérifiés.",
  it: "La prevendita non è ancora aperta perché questa prima prova deve definire le condizioni di partecipazione, consegna, tracciabilità e assistenza. Il sito pubblico spiega il modello con prototipi liberamente esplorabili; la prova e le segnalazioni si svolgono nell’app dalla sala privata. Quando questi punti saranno stati verificati, verrà pubblicata una data.",
  zh: "预售尚未开放，因为首次测试仍需明确参与、配送、可追溯性和支持条件。公开网站通过可自由体验的原型介绍这一模式；测试和问题反馈则需从私人测试空间进入应用完成。上述要点验证完毕后才会公布日期。",
  ar: "لم يُفتح البيع المسبق بعد لأن هذه التجربة الأولى ما زالت بحاجة إلى استكمال شروط المشاركة والتسليم والتتبّع والدعم. يشرح الموقع العام النموذج من خلال نماذج يمكن استكشافها بحرية؛ أما الاختبار وبلاغاته فتُجرى في التطبيق انطلاقًا من الغرفة الخاصة. سيُنشر موعد بعد التحقق من هذه النقاط.",
};
locales.forEach((locale) => add(locale, guideFollowUpSource, guideFollowUpTranslations[locale], "guide-follow-up"));

const guideFollowUpLabelTranslations = {
  en: "See what we are testing",
  fr: "Voir ce que nous testons",
  it: "Scopri cosa stiamo testando",
  zh: "查看我们正在测试的内容",
  ar: "اطّلع على ما نختبره",
};
locales.forEach((locale) => add(locale, "Ver qué estamos probando", guideFollowUpLabelTranslations[locale], "guide-follow-up"));

// The same short label appears in two visual contexts. Use one concise form so
// source-based translation remains deterministic in both places.
Object.assign(catalogue.it, { "Pregunta a la Guía": "Chiedi alla Guida" });
Object.assign(catalogue.zh, { "Pregunta a la Guía": "询问指南" });
Object.assign(catalogue.ar, { "ENTRA": "يدخل" });
Object.assign(catalogue.ar, {
  "→ A": "→ إلى",
  "a": "إلى",
  "A": "إلى",
  "a tu red de Conector": "بشبكة الموصّل الخاصة بك",
  "Allwain solo mostrará este distintivo cuando la documentación del lote haya sido comprobada.": "لن تعرض Allwain هذه الشارة إلا بعد التحقق من وثائق الدفعة.",
  "Ayúdanos a mejorar Allwain": "ساعدنا على تحسين Allwain",
  "Compartes": "تشارك",
  "Con tu permiso mediremos qué páginas y acciones resultan útiles. No enviamos nombres, emails, direcciones, mensajes ni textos introducidos. Allwain funciona igual si eliges solo lo necesario.": "بإذنك سنقيس الصفحات والإجراءات المفيدة. لا نرسل أسماء أو عناوين بريد إلكتروني أو عناوين سكنية أو رسائل أو نصوصًا تدخلها. تعمل Allwain بالطريقة نفسها إذا اخترت الضروري فقط.",
  "De": "من",
  "DE": "من",
  "DE SUDÁFRICA → A": "من جنوب أفريقيا → إلى",
  "demostrar.": "إثباته.",
  "Entrega o recogida en": "التوصيل أو الاستلام في",
  "Entregar.": "التسليم.",
  "Identifícate": "عرّف بنفسك",
  "INGRESO LOCAL": "دخل محلي",
  "KM 0": "0 كم",
  "Lo que aún hay": "ما لا يزال",
  "Lo que queremos": "ما نريد",
  "más": "أكثر",
  "Más actividad local": "نشاط محلي أكبر",
  "Más de": "أكثر من",
  "Más fresco cerca": "أكثر نضارة بالقرب",
  "menos": "أقل",
  "Menos espera": "انتظار أقل",
  "Menos vueltas": "تنقّل أقل",
  "No es un certificado oficial único ni afirma que un alimento importado legalmente incumpla las normas europeas.": "ليست شهادة رسمية موحدة، ولا تعني أن غذاءً مستوردًا بصورة قانونية يخالف القواعد الأوروبية.",
  "para enviar.": "للإرسال.",
  "Permitir medición": "السماح بالقياس",
  "personas y negocios": "أشخاص وأعمال",
  "Preferencias de medición": "تفضيلات القياس",
  "que resolver.": "بحاجة إلى حلّه.",
  "Quedan vinculados": "يبقون مرتبطين",
  "Recoger.": "الاستلام.",
  "Recogida y entrega confirmadas": "استلام وتسليم مؤكّدان",
  "Se unen": "ينضمون",
  "Solo necesarias": "الضروري فقط",
  "tu QR o enlace": "رمز QR أو رابطك",
  "Valor que se queda cerca": "قيمة تبقى محليًا",
  "VERIFICADO": "موثّق",
  "Verificar.": "التحقق.",
});
Object.assign(catalogue.en, {
  "Allwain usa HTTPS, cabeceras de seguridad y sesiones revocables. Son controles reales y evolutivos, no una promesa de invulnerabilidad.": "Allwain uses HTTPS, security headers and revocable sessions. These are real, evolving safeguards, not a promise of invulnerability.",
  "DE SUDÁFRICA": "FROM SOUTH AFRICA",
  "El vendedor encuentra peticiones reales en vez de esperar solo ante un catálogo y decide a cuáles responder con una propuesta competitiva. Gana una oportunidad de venta, no una venta garantizada: el comprador compara y elige. En la prueba de naranjas, más de 300 % para quien cultiva es un objetivo por comprobar, no un resultado confirmado.": "The seller finds real requests instead of waiting behind a catalogue and decides which ones to answer with a competitive proposal. This is a sales opportunity, not a guaranteed sale: the buyer compares and chooses. In the orange trial, more than 300% for the grower is a target to be tested, not a confirmed result.",
  "No puedo actuar en una cuenta ni crear, publicar, aceptar o pagar nada. Ese límite protege tu decisión. Sí puedo explicarte el recorrido, ayudarte a comparar condiciones y señalar qué debes revisar antes de que tú realices cualquier acción.": "I cannot act in an account or create, publish, accept or pay for anything. That limit protects your decision. I can explain the process, help you compare conditions and point out what to review before you take any action.",
  "Solo puedo responder sobre Allwain: cómo funciona, sus roles, la prueba de Foios, privacidad, seguridad y fiscalidad.": "I can only answer questions about Allwain: how it works, its roles, the Foios trial, privacy, security and taxation.",
  "Preferencias de medición": "Measurement preferences",
  "Ayúdanos a mejorar Allwain": "Help us improve Allwain",
  "Con tu permiso mediremos qué páginas y acciones resultan útiles. No enviamos nombres, emails, direcciones, mensajes ni textos introducidos. Allwain funciona igual si eliges solo lo necesario.": "With your permission, we will measure which pages and actions are useful. We do not send names, emails, addresses, messages or text you enter. Allwain works the same if you choose essential functions only.",
  "Solo necesarias": "Essential only",
  "Permitir medición": "Allow measurement",
});
Object.assign(catalogue.fr, {
  "Allwain usa HTTPS, cabeceras de seguridad y sesiones revocables. Son controles reales y evolutivos, no una promesa de invulnerabilidad.": "Allwain utilise HTTPS, des en-têtes de sécurité et des sessions révocables. Ce sont des protections réelles et évolutives, pas une promesse d’invulnérabilité.",
  "DE SUDÁFRICA": "D’AFRIQUE DU SUD",
  "El vendedor encuentra peticiones reales en vez de esperar solo ante un catálogo y decide a cuáles responder con una propuesta competitiva. Gana una oportunidad de venta, no una venta garantizada: el comprador compara y elige. En la prueba de naranjas, más de 300 % para quien cultiva es un objetivo por comprobar, no un resultado confirmado.": "Le vendeur découvre des demandes réelles au lieu d’attendre uniquement derrière un catalogue et choisit auxquelles répondre avec une proposition compétitive. Il gagne une opportunité de vente, pas une vente garantie : l’acheteur compare et choisit. Pour le test des oranges, plus de 300 % supplémentaires pour le producteur est un objectif à vérifier, pas un résultat confirmé.",
  "No puedo actuar en una cuenta ni crear, publicar, aceptar o pagar nada. Ese límite protege tu decisión. Sí puedo explicarte el recorrido, ayudarte a comparar condiciones y señalar qué debes revisar antes de que tú realices cualquier acción.": "Je ne peux pas intervenir dans un compte ni créer, publier, accepter ou payer quoi que ce soit. Cette limite protège votre décision. Je peux expliquer le parcours, vous aider à comparer les conditions et indiquer ce qu’il faut vérifier avant toute action de votre part.",
  "Solo puedo responder sobre Allwain: cómo funciona, sus roles, la prueba de Foios, privacidad, seguridad y fiscalidad.": "Je peux uniquement répondre aux questions sur Allwain : son fonctionnement, ses rôles, le test de Foios, la confidentialité, la sécurité et la fiscalité.",
  "Más de 300 % más para quien cultiva": "Plus de 300 % supplémentaires pour les producteurs",
  "Preferencias de medición": "Préférences de mesure",
  "Ayúdanos a mejorar Allwain": "Aidez-nous à améliorer Allwain",
  "Con tu permiso mediremos qué páginas y acciones resultan útiles. No enviamos nombres, emails, direcciones, mensajes ni textos introducidos. Allwain funciona igual si eliges solo lo necesario.": "Avec votre accord, nous mesurerons les pages et actions utiles. Nous n’envoyons ni noms, ni e-mails, ni adresses, ni messages, ni textes saisis. Allwain fonctionne de la même façon si vous choisissez uniquement le nécessaire.",
  "Solo necesarias": "Uniquement le nécessaire",
  "Permitir medición": "Autoriser la mesure",
});
Object.assign(catalogue.it, {
  "Allwain usa HTTPS, cabeceras de seguridad y sesiones revocables. Son controles reales y evolutivos, no una promesa de invulnerabilidad.": "Allwain usa HTTPS, intestazioni di sicurezza e sessioni revocabili. Sono misure reali e in evoluzione, non una promessa di invulnerabilità.",
  "DE SUDÁFRICA": "DAL SUDAFRICA",
  "El vendedor encuentra peticiones reales en vez de esperar solo ante un catálogo y decide a cuáles responder con una propuesta competitiva. Gana una oportunidad de venta, no una venta garantizada: el comprador compara y elige. En la prueba de naranjas, más de 300 % para quien cultiva es un objetivo por comprobar, no un resultado confirmado.": "Il venditore trova richieste reali invece di aspettare soltanto dietro un catalogo e decide a quali rispondere con una proposta competitiva. Ottiene un’opportunità di vendita, non una vendita garantita: l’acquirente confronta e sceglie. Nella prova delle arance, oltre il 300% in più per chi coltiva è un obiettivo da verificare, non un risultato confermato.",
  "No puedo actuar en una cuenta ni crear, publicar, aceptar o pagar nada. Ese límite protege tu decisión. Sí puedo explicarte el recorrido, ayudarte a comparar condiciones y señalar qué debes revisar antes de que tú realices cualquier acción.": "Non posso agire in un account né creare, pubblicare, accettare o pagare nulla. Questo limite protegge la tua decisione. Posso spiegarti il percorso, aiutarti a confrontare le condizioni e indicarti cosa verificare prima che tu compia qualsiasi azione.",
  "Solo puedo responder sobre Allwain: cómo funciona, sus roles, la prueba de Foios, privacidad, seguridad y fiscalidad.": "Posso rispondere solo a domande su Allwain: come funziona, i suoi ruoli, la prova di Foios, privacy, sicurezza e fiscalità.",
});
Object.assign(catalogue.zh, {
  "Allwain usa HTTPS, cabeceras de seguridad y sesiones revocables. Son controles reales y evolutivos, no una promesa de invulnerabilidad.": "Allwain 使用 HTTPS、安全响应头和可撤销会话。这些是真实且持续演进的防护措施，并非绝对安全的承诺。",
  "DE SUDÁFRICA": "从南非",
  "El vendedor encuentra peticiones reales en vez de esperar solo ante un catálogo y decide a cuáles responder con una propuesta competitiva. Gana una oportunidad de venta, no una venta garantizada: el comprador compara y elige. En la prueba de naranjas, más de 300 % para quien cultiva es un objetivo por comprobar, no un resultado confirmado.": "卖家看到真实需求，而不是只能守着商品目录等待，并可选择以更有竞争力的方案回应哪些需求。这带来的是销售机会，并非保证成交：买家会比较后作出选择。在橙子试点中，种植者收益提高 300% 以上是待验证目标，并非已确认结果。",
  "No puedo actuar en una cuenta ni crear, publicar, aceptar o pagar nada. Ese límite protege tu decisión. Sí puedo explicarte el recorrido, ayudarte a comparar condiciones y señalar qué debes revisar antes de que tú realices cualquier acción.": "我无法操作账户，也不能创建、发布、接受或支付任何内容。这一限制保护你的决定。我可以说明流程、帮助你比较条件，并指出你在亲自操作前需要检查的事项。",
  "Solo puedo responder sobre Allwain: cómo funciona, sus roles, la prueba de Foios, privacidad, seguridad y fiscalidad.": "我只能回答与 Allwain 相关的问题：其运作方式、角色、Foios 测试、隐私、安全和税务。",
});
Object.assign(catalogue.ar, {
  "Allwain usa HTTPS, cabeceras de seguridad y sesiones revocables. Son controles reales y evolutivos, no una promesa de invulnerabilidad.": "تستخدم Allwain بروتوكول HTTPS وترويسات أمان وجلسات قابلة للإلغاء. هذه ضوابط حقيقية تتطور باستمرار، وليست وعدًا بعدم التعرض لأي اختراق.",
  "DE SUDÁFRICA": "من جنوب أفريقيا",
  "El vendedor encuentra peticiones reales en vez de esperar solo ante un catálogo y decide a cuáles responder con una propuesta competitiva. Gana una oportunidad de venta, no una venta garantizada: el comprador compara y elige. En la prueba de naranjas, más de 300 % para quien cultiva es un objetivo por comprobar, no un resultado confirmado.": "يجد البائع طلبات حقيقية بدل الاكتفاء بالانتظار خلف كتالوج، ويقرر أيها يجيب عنه بعرض تنافسي. إنها فرصة بيع وليست عملية بيع مضمونة: يقارن المشتري ويختار. وفي اختبار البرتقال، تمثل زيادة تتجاوز 300% للمزارع هدفًا يجب التحقق منه، وليست نتيجة مؤكدة.",
  "No puedo actuar en una cuenta ni crear, publicar, aceptar o pagar nada. Ese límite protege tu decisión. Sí puedo explicarte el recorrido, ayudarte a comparar condiciones y señalar qué debes revisar antes de que tú realices cualquier acción.": "لا يمكنني التصرف داخل حساب أو إنشاء شيء أو نشره أو قبوله أو دفع ثمنه. يحمي هذا الحد قرارك. يمكنني شرح المسار ومساعدتك على مقارنة الشروط وبيان ما ينبغي مراجعته قبل أن تنفذ أنت أي إجراء.",
  "Solo puedo responder sobre Allwain: cómo funciona, sus roles, la prueba de Foios, privacidad, seguridad y fiscalidad.": "لا يمكنني الإجابة إلا عن Allwain: طريقة عمله، وأدواره، واختبار Foios، والخصوصية، والأمان، والضرائب.",
});

const sellerCaptureCorrection = {
  en: "allwain will tell you what to prepare",
  fr: "allwain vous indiquera quoi préparer",
  it: "allwain ti dirà cosa preparare",
  zh: "allwain 会告诉你要准备什么",
  ar: "سيخبرك allwain بما يجب تحضيره",
};
locales.forEach((locale) => add(locale, "allwain te dirá qué preparar", sellerCaptureCorrection[locale], "seller-capture-correction"));
const sellerOrdersLabel = {
  en: "Receive orders",
  fr: "Recevez des commandes",
  it: "Ricevi ordini",
  zh: "接收订单",
  ar: "استلم الطلبات",
};
locales.forEach((locale) => add(locale, "Recibe pedidos", sellerOrdersLabel[locale], "seller-capture-correction"));

locales.forEach((locale) => {
  const normalized = {};
  Object.entries(catalogue[locale]).forEach(([source, translation]) => {
    normalized[normalizeBrand(source)] = normalizeBrand(translation);
  });
  catalogue[locale] = normalized;
});

const resolvedConflictSources = new Set(["Pregunta a la Guía", "ENTRA"]);
const unexpectedConflicts = conflicts.filter(({ source, origin }) => (
  origin !== "web-smart-pass-i18n-draft.json" && !resolvedConflictSources.has(source)
));
if (unexpectedConflicts.length) {
  throw new Error(`Conflicting translations:\n${JSON.stringify(unexpectedConflicts, null, 2)}`);
}

locales.forEach((locale) => {
  catalogue[locale] = Object.fromEntries(
    Object.entries(catalogue[locale]).sort(([left], [right]) => left.localeCompare(right, "es")),
  );
});

const serialized = JSON.stringify(catalogue, null, 2)
  .replaceAll("\u2028", "\\u2028")
  .replaceAll("\u2029", "\\u2029");
const banner = [
  "/* Generated from the reviewed web-i18n draft catalogues. */",
  "(function () {",
  '  "use strict";',
  `  window.AllwainWebTranslations = ${serialized};`,
  "})();",
  "",
].join("\n");
fs.writeFileSync(output, banner, "utf8");

console.log(JSON.stringify({
  output,
  entries: Object.fromEntries(locales.map((locale) => [locale, Object.keys(catalogue[locale]).length])),
  resolvedConflicts: conflicts.length,
}, null, 2));
