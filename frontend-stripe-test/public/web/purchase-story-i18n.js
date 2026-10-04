(function () {
  "use strict";

  // Loaded before i18n.js captures the document's original text and attributes.
  const locales = ["en", "fr", "it", "zh", "ar"];
  const entries = {
    "allwain — Una nueva forma de comprar · Piloto Foios": ["allwain — A new way to shop · Foios pilot", "allwain — Une nouvelle façon d’acheter · Projet pilote de Foios", "allwain — Un nuovo modo di acquistare · Progetto pilota di Foios", "allwain — 全新的购物方式 · Foios 试点", "allwain — طريقة جديدة للتسوّق · تجربة Foios"],
    "Pide lo que necesitas, compara propuestas y decide cuándo comprar y a quién. Conoce la app en pruebas y el piloto de naranjas de Foios.": [
      "Ask for what you need, compare offers and decide when to buy and who to buy from. Explore the app in testing and the Foios orange pilot.",
      "Demandez ce qu’il vous faut, comparez les propositions et choisissez quand acheter et auprès de qui. Découvrez l’app en test et le projet pilote des oranges de Foios.",
      "Chiedi ciò che ti serve, confronta le proposte e decidi quando acquistare e da chi. Scopri l’app in fase di test e il progetto pilota delle arance di Foios.",
      "提出需求、比较方案，由你决定何时购买、向谁购买。了解测试版应用和 Foios 橙子试点。",
      "اطلب ما تحتاجه وقارن العروض وقرّر متى تشتري وممّن. تعرّف على التطبيق في مرحلة الاختبار وتجربة برتقال Foios."
    ],
    "UNA NUEVA FORMA DE COMPRAR": ["A NEW WAY TO SHOP", "UNE NOUVELLE FAÇON D’ACHETER", "UN NUOVO MODO DI ACQUISTARE", "一种全新的购物方式", "طريقة جديدة للتسوّق"],
    "Compra": ["Shop", "Achetez", "Acquista", "购物", "تسوّق"],
    "inteligente.": ["smarter.", "malin.", "in modo intelligente.", "更明智。", "بذكاء."],
    "¿Vas a comprarlo allí?": ["Thinking of buying it there?", "Vous allez l’acheter là-bas ?", "Stai per comprarlo lì?", "准备在那里购买？", "هل ستشتريه هناك؟"],
    "Pregunta aquí primero.": ["Ask here first.", "Demandez ici d’abord.", "Chiedi prima qui.", "先来这里问一问。", "اسأل هنا أولًا."],
    "Tú dices qué necesitas, dónde y para cuándo. Los comercios compatibles pueden responder con su propuesta. Comparas y eliges cuándo comprar y a quién.": [
      "Say what you need, where and when. Businesses that can help may respond with an offer. Compare and choose when to buy and who to buy from.",
      "Dites ce qu’il vous faut, où et pour quand. Les commerces qui peuvent répondre à votre besoin peuvent vous faire une proposition. Comparez et choisissez quand acheter et auprès de qui.",
      "Indica cosa ti serve, dove e per quando. I negozi che possono soddisfare la richiesta possono rispondere con una proposta. Confronti e scegli quando acquistare e da chi.",
      "说出你需要什么、在哪里以及何时需要。能够满足需求的商家可以提供方案。比较之后，由你决定何时购买、向谁购买。",
      "حدّد ما تحتاجه وأين ومتى. يمكن للمتاجر التي تناسب طلبك الردّ بعرض. تقارن وتختار متى تشتري وممّن."
    ],
    "Ver cómo comprar": ["See how buying works", "Voir comment acheter", "Scopri come acquistare", "了解如何购买", "اكتشف كيف تشتري"],
    "Conocer el piloto de Foios": ["Explore the Foios pilot", "Découvrir le projet pilote de Foios", "Scopri il progetto pilota di Foios", "了解 Foios 试点", "تعرّف على تجربة Foios"],
    "Estamos en pruebas. Publicar una petición no compra ni cobra nada.": [
      "We’re in testing. Posting a request does not buy anything or charge you.",
      "Nous sommes en phase de test. Publier une demande n’entraîne aucun achat ni débit.",
      "Siamo in fase di test. Pubblicare una richiesta non comporta acquisti né addebiti.",
      "目前处于测试阶段。发布需求不会自动购买，也不会扣款。",
      "نحن في مرحلة الاختبار. نشر طلب لا يشتري شيئًا ولا يخصم أي مبلغ."
    ],
    "Pantalla de prueba de allwain con las opciones Buscar, Capturar y Pedir": [
      "Allwain test screen with Search, Capture and Request options",
      "Écran de test d’allwain avec les options Rechercher, Capturer et Demander",
      "Schermata di prova di allwain con le opzioni Cerca, Acquisisci e Richiedi",
      "Allwain 测试界面，包含搜索、拍摄和提出需求选项",
      "شاشة اختبار allwain بخيارات البحث والالتقاط والطلب"
    ],
    "TU COMPRA EMPIEZA CONTIGO": ["YOUR PURCHASE STARTS WITH YOU", "VOTRE ACHAT COMMENCE PAR VOUS", "IL TUO ACQUISTO INIZIA DA TE", "你的购买，从你的需求开始", "شراؤك يبدأ بك"],
    "Vista de la app en pruebas.": ["View of the app in testing.", "Aperçu de l’app en phase de test.", "Vista dell’app in fase di test.", "测试版应用界面。", "معاينة للتطبيق في مرحلة الاختبار."],
    "Cómo funciona la compra en allwain": ["How buying works on allwain", "Comment acheter sur allwain", "Come funziona l’acquisto su allwain", "如何在 allwain 购买", "كيف يعمل الشراء في allwain"],
    "Captura o escribe": ["Capture or write", "Photographiez ou écrivez", "Fotografa o scrivi", "拍摄或填写", "التقط صورة أو اكتب"],
    "Haz una foto del producto o de su etiqueta, o escribe lo que necesitas.": [
      "Take a photo of the product or its label, or write what you need.",
      "Photographiez le produit ou son étiquette, ou décrivez ce dont vous avez besoin.",
      "Fotografa il prodotto o la sua etichetta, oppure scrivi ciò che ti serve.",
      "拍摄产品或标签，也可以直接写下你的需求。",
      "صوّر المنتج أو ملصقه، أو اكتب ما تحتاجه."
    ],
    "Revisa y publica": ["Review and post", "Vérifiez et publiez", "Controlla e pubblica", "确认并发布", "راجع وانشر"],
    "Comprueba los datos. Añade cantidad, zona, presupuesto y fecha.": [
      "Check the details. Add quantity, area, budget and date.",
      "Vérifiez les informations. Ajoutez la quantité, la zone, le budget et la date.",
      "Verifica i dati. Aggiungi quantità, zona, budget e data.",
      "核对信息，填写数量、地区、预算和日期。",
      "تحقّق من البيانات. أضف الكمية والمنطقة والميزانية والتاريخ."
    ],
    "Recibe y compara": ["Receive and compare", "Recevez et comparez", "Ricevi e confronta", "接收并比较", "استقبل وقارن"],
    "Los comercios pueden responder. Revisa precio, plazo y condiciones de cada propuesta.": [
      "Businesses may respond. Check each offer’s price, timing and terms.",
      "Les commerces peuvent répondre. Comparez le prix, le délai et les conditions de chaque proposition.",
      "I negozi possono rispondere. Valuta prezzo, tempi e condizioni di ogni proposta.",
      "商家可以回复。查看每份方案的价格、时限和条件。",
      "يمكن للمتاجر الردّ. راجع السعر والمدة والشروط لكل عرض."
    ],
    "Tú decides": ["You decide", "Vous décidez", "Decidi tu", "由你决定", "أنت تقرّر"],
    "Elige la propuesta que te encaje y cuándo continuar. La decisión sigue siendo tuya.": [
      "Choose the offer that suits you and when to continue. The decision stays yours.",
      "Choisissez la proposition qui vous convient et quand poursuivre. La décision vous appartient.",
      "Scegli la proposta più adatta e quando proseguire. La decisione resta tua.",
      "选择适合你的方案，并决定何时继续。决定权始终在你手中。",
      "اختر العرض المناسب لك والوقت الذي تريد فيه المتابعة. القرار يبقى لك."
    ],
    "Más tiempo, más oportunidades.": ["More time, more opportunities.", "Plus de temps, plus d’opportunités.", "Più tempo, più opportunità.", "多一点时间，多一些机会。", "وقت أكثر، فرص أكثر."],
    "Dejar abierta tu petición puede dar a más comercios tiempo para preparar una oferta. Tú decides cuándo elegir.": [
      "Keeping your request open may give more businesses time to prepare an offer. You decide when to choose.",
      "Laisser votre demande ouverte peut donner à davantage de commerces le temps de préparer une offre. Vous décidez quand choisir.",
      "Lasciare aperta la richiesta può dare a più negozi il tempo di preparare un’offerta. Decidi tu quando scegliere.",
      "让需求保持开放，可以给更多商家准备报价的时间。何时做出选择，由你决定。",
      "قد يمنح إبقاء طلبك مفتوحًا مزيدًا من المتاجر وقتًا لإعداد عرض. أنت تقرّر متى تختار."
    ],
    "El plazo no garantiza respuestas, ahorro ni un precio mejor.": [
      "Waiting does not guarantee replies, savings or a better price.",
      "Le délai ne garantit ni réponses, ni économies, ni meilleur prix.",
      "L’attesa non garantisce risposte, risparmio o un prezzo migliore.",
      "等待时间并不保证会收到回复、节省费用或获得更低价格。",
      "الانتظار لا يضمن ردودًا أو توفيرًا أو سعرًا أفضل."
    ],
    "Encuentra tu papel en allwain": ["Find your role on allwain", "Trouvez votre rôle sur allwain", "Trova il tuo ruolo su allwain", "找到你在 allwain 的角色", "اختر دورك في allwain"],
    "Tres formas de participar.": ["Three ways to take part.", "Trois façons de participer.", "Tre modi per partecipare.", "三种参与方式。", "ثلاث طرق للمشاركة."],
    "Quiero comprar": ["I want to buy", "Je veux acheter", "Voglio acquistare", "我想购买", "أريد الشراء"],
    "Tengo un comercio": ["I run a business", "J’ai un commerce", "Ho un’attività", "我是商家", "لديّ متجر"],
    "Quiero conectar": ["I want to connect", "Je veux créer des liens", "Voglio connettere", "我想连接社区", "أريد أن أوصل الناس ببعضهم"],
    "Lo empezamos a probar cerca: naranjas de Foios.": [
      "We’re starting close to home: oranges from Foios.",
      "Nous commençons près de chez nous : les oranges de Foios.",
      "Iniziamo a provarlo vicino a casa: arance di Foios.",
      "先从身边开始试验：Foios 的橙子。",
      "نبدأ التجربة بالقرب منّا: برتقال Foios."
    ]
  };

  const translations = window.AllwainWebTranslations = window.AllwainWebTranslations || {};
  locales.forEach((locale, index) => {
    const dictionary = translations[locale] = translations[locale] || {};
    Object.entries(entries).forEach(([source, values]) => {
      if (typeof dictionary[source] !== "string") dictionary[source] = values[index];
    });
  });
})();
