(function () {
  "use strict";

  // Add pilot-first reading flow copy without changing existing translations.
  const locales = ["en", "fr", "it", "zh", "ar"];
  const entries = {
    "Del revés": ["In reverse", "À l’envers", "Al contrario", "反向购物", "بالعكس"],
    "Tú pides.": ["You ask.", "Vous demandez.", "Tu chiedi.", "你提出需求。", "أنت تطلب."],
    "Los comercios proponen.": ["Businesses make offers.", "Les commerces proposent.", "I negozi propongono.", "商家提供方案。", "والمتاجر تقدّم عروضها."],
    "La compra empieza con lo que tú necesitas. Publicas tu petición; los comercios pueden responder con precio, plazo y entrega. Tú comparas y decides.": [
      "Shopping starts with what you need. Post your request; businesses can respond with a price, timeframe and delivery terms. You compare and decide.",
      "L’achat commence par votre besoin. Vous publiez votre demande ; les commerces peuvent proposer un prix, un délai et une livraison. Vous comparez et décidez.",
      "L’acquisto parte da ciò che ti serve. Pubblichi la tua richiesta; i negozi possono rispondere con prezzo, tempi e consegna. Tu confronti e decidi.",
      "购物从你的需求开始。发布需求后，商家可以提供价格、时间和配送方案。由你比较并决定。",
      "يبدأ الشراء بما تحتاجه. تنشر طلبك، ويمكن للمتاجر الردّ بالسعر والمدة وشروط التوصيل. أنت تقارن وتقرّر."
    ],
    "Conocer el piloto": ["Explore the pilot", "Découvrir le projet pilote", "Scopri il progetto pilota", "了解试点", "تعرّف على التجربة"],
    "¿Y cómo llegarían las naranjas a casa?": [
      "And how would the oranges reach your home?",
      "Et comment les oranges arriveraient-elles chez vous ?",
      "E come arriverebbero le arance a casa?",
      "那么，橙子将如何送到家？",
      "وكيف سيصل البرتقال إلى المنزل؟"
    ],
    "Reparto local, verificación y condiciones de la prueba.": [
      "Local delivery, verification and pilot conditions.",
      "Livraison locale, vérification et conditions du test.",
      "Consegna locale, verifica e condizioni della prova.",
      "本地配送、验证流程和测试条件。",
      "التوصيل المحلي والتحقّق وشروط التجربة."
    ],
    "LA IDEA DETRÁS DEL PILOTO": ["THE IDEA BEHIND THE PILOT", "L’IDÉE DERRIÈRE LE PROJET PILOTE", "L’IDEA DIETRO IL PROGETTO PILOTA", "试点背后的理念", "الفكرة وراء التجربة"],
    "Naranjas para empezar.": ["Oranges to start with.", "Des oranges pour commencer.", "Arance per cominciare.", "从橙子开始。", "البرتقال هو البداية."],
    "Una nueva forma de comprar.": ["A new way to shop.", "Une nouvelle façon d’acheter.", "Un nuovo modo di acquistare.", "一种全新的购物方式。", "طريقة جديدة للتسوّق."],
    "En allwain tú pides lo que necesitas; los comercios pueden responder con sus propuestas. Comparas y decides. Compradores, vendedores y conectores hacen posible este recorrido.": [
      "On allwain, you ask for what you need; businesses can respond with their offers. You compare and decide. Buyers, sellers and connectors make this journey possible.",
      "Sur allwain, vous demandez ce dont vous avez besoin ; les commerces peuvent répondre avec leurs propositions. Vous comparez et décidez. Acheteurs, vendeurs et connecteurs rendent ce parcours possible.",
      "Su allwain chiedi ciò che ti serve; i negozi possono rispondere con le loro proposte. Confronti e decidi. Acquirenti, venditori e connettori rendono possibile questo percorso.",
      "在 allwain，你提出需求，商家可以提供方案。比较之后，由你决定。买家、卖家和连接者共同促成这一过程。",
      "في allwain تطلب ما تحتاجه، ويمكن للمتاجر الردّ بعروضها. تقارن وتقرّر. المشترون والبائعون ومَن يربطون بينهم يجعلون هذا المسار ممكنًا."
    ],
    "Volver al reparto del piloto": ["Back to delivery in the pilot", "Revenir à la livraison du projet pilote", "Torna alla consegna del progetto pilota", "返回试点配送说明", "العودة إلى التوصيل في التجربة"]
  };

  const translations = window.AllwainWebTranslations = window.AllwainWebTranslations || {};
  locales.forEach((locale, index) => {
    const dictionary = translations[locale] = translations[locale] || {};
    Object.entries(entries).forEach(([source, values]) => {
      if (typeof dictionary[source] !== "string") dictionary[source] = values[index];
    });
  });
})();
