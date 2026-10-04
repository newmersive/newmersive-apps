(function () {
  "use strict";

  // Supplement existing dictionaries before i18n.js captures the page.
  const locales = ["en", "fr", "it", "zh", "ar"];
  const entries = {
    "Lo que necesitas.": ["What you need.", "Ce qu’il vous faut.", "Quello che ti serve.", "你所需要的。", "ما تحتاجه."],
    "A tu manera.": ["Your way.", "À votre façon.", "A modo tuo.", "按你的方式。", "بطريقتك."],
    "Una foto, una etiqueta o unas palabras. Cuenta qué buscas y recibe propuestas de los comercios que puedan ayudarte.": [
      "A photo, a label or a few words. Say what you’re looking for and receive offers from businesses that can help.",
      "Une photo, une étiquette ou quelques mots. Décrivez ce que vous cherchez et recevez les propositions des commerces qui peuvent vous aider.",
      "Una foto, un’etichetta o poche parole. Racconta cosa cerchi e ricevi proposte dai negozi che possono aiutarti.",
      "一张照片、一个标签或几句话。说出你想找什么，接收能够帮助你的商家提供的方案。",
      "صورة أو ملصق أو بضع كلمات. وضّح ما تبحث عنه وتلقَّ عروضًا من المتاجر التي يمكنها مساعدتك."
    ],
    "Crear mi petición": ["Create my request", "Créer ma demande", "Crea la mia richiesta", "创建我的需求", "إنشاء طلبي"],
    "Publicar una petición no te obliga a comprar.": ["Posting a request does not commit you to buying.", "Publier une demande ne vous engage pas à acheter.", "Pubblicare una richiesta non ti obbliga ad acquistare.", "发布需求并不意味着你必须购买。", "نشر طلب لا يُلزمك بالشراء."],
    "Pide con tus condiciones": ["Ask on your terms", "Demandez selon vos conditions", "Chiedi alle tue condizioni", "按你的条件提出需求", "اطلب وفق شروطك"],
    "Revisa lo capturado y añade cantidad, presupuesto, zona y cuándo lo necesitas.": [
      "Review the captured details and add quantity, budget, area and when you need it.",
      "Vérifiez les informations capturées et ajoutez la quantité, le budget, la zone et la date souhaitée.",
      "Controlla i dati acquisiti e aggiungi quantità, budget, zona e quando ti serve.",
      "核对识别出的信息，填写数量、预算、地区以及需要的时间。",
      "راجع المعلومات الملتقطة وأضف الكمية والميزانية والمنطقة ومتى تحتاجه."
    ],
    "Compara algo más que el precio": ["Compare more than price", "Comparez au-delà du prix", "Confronta più del prezzo", "比较的不只是价格", "قارن ما هو أبعد من السعر"],
    "Valora también la entrega, el plazo y las condiciones. Elige la propuesta que mejor te encaje.": [
      "Consider delivery, timing and terms too. Choose the offer that suits you best.",
      "Évaluez aussi la livraison, le délai et les conditions. Choisissez la proposition qui vous convient le mieux.",
      "Valuta anche consegna, tempi e condizioni. Scegli la proposta più adatta a te.",
      "同时考虑配送、时限和条件，选择最适合你的方案。",
      "قيّم أيضًا التوصيل والمدة والشروط. اختر العرض الأنسب لك."
    ],
    "Ten tu compra a mano": ["Keep your purchase within reach", "Gardez vos achats à portée de main", "Tieni i tuoi acquisti a portata di mano", "随时查看你的购买进展", "تابع مشترياتك بسهولة"],
    "Vuelve a tus peticiones y consulta tus pedidos desde la app.": [
      "Return to your requests and check your orders in the app.",
      "Retrouvez vos demandes et consultez vos commandes dans l’app.",
      "Ritrova le tue richieste e consulta i tuoi ordini dall’app.",
      "在应用中回到你的需求，查看你的订单。",
      "عُد إلى طلباتك واطّلع على مشترياتك من التطبيق."
    ],
    "Prueba una petición de ejemplo": ["Try a sample request", "Essayez une demande d’exemple", "Prova una richiesta di esempio", "试用一个需求示例", "جرّب طلبًا توضيحيًا"],
    "Cambia las condiciones de este televisor y compara las respuestas de la maqueta. No se publica ni se compra nada.": [
      "Change the requirements for this TV and compare the mock-up’s responses. Nothing is posted or purchased.",
      "Modifiez les conditions pour ce téléviseur et comparez les réponses de la maquette. Rien n’est publié ni acheté.",
      "Modifica le condizioni per questo televisore e confronta le risposte della demo. Non viene pubblicato né acquistato nulla.",
      "修改这台电视的需求条件，比较演示中的回复。不会发布需求，也不会购买任何东西。",
      "غيّر الشروط الخاصة بهذا التلفاز وقارن ردود النموذج التجريبي. لا يُنشر ولا يُشترى أي شيء."
    ],
    "PARA QUIEN VENDE": ["FOR SELLERS", "POUR CEUX QUI VENDENT", "PER CHI VENDE", "为卖家而设", "لمن يبيع"],
    "Hay alguien buscando": ["Someone is looking for", "Quelqu’un cherche", "Qualcuno sta cercando", "有人正在寻找", "هناك من يبحث عن"],
    "lo que tú vendes.": ["what you sell.", "ce que vous vendez.", "quello che vendi.", "你所销售的商品。", "ما تبيعه."],
    "En allwain empiezas por una necesidad real: ves qué piden las personas y respondes cuando tu negocio puede atenderlas.": [
      "On allwain, you start with a real need: see what people are asking for and respond when your business can help.",
      "Sur allwain, vous partez d’un besoin réel : vous voyez ce que les personnes demandent et répondez lorsque votre commerce peut les servir.",
      "Su allwain parti da un bisogno reale: vedi cosa chiedono le persone e rispondi quando la tua attività può soddisfarle.",
      "在 allwain，你从真实需求出发：了解人们需要什么，并在你的店铺能够满足需求时作出回应。",
      "في allwain تبدأ من حاجة حقيقية: ترى ما يطلبه الناس وتردّ عندما يستطيع متجرك تلبية احتياجاتهم."
    ],
    "Preparar mi perfil de vendedor": ["Set up my seller profile", "Préparer mon profil vendeur", "Prepara il mio profilo venditore", "设置我的卖家资料", "إعداد ملفي كبائع"],
    "Tu cercanía, tu servicio y tu precio cuentan.": ["Your proximity, service and price matter.", "Votre proximité, votre service et votre prix comptent.", "La tua vicinanza, il tuo servizio e il tuo prezzo contano.", "你的距离、服务和价格都很重要。", "قربك وخدمتك وسعرك عوامل مهمة."],
    "Encuentra peticiones que encajan": ["Find requests that fit", "Trouvez les demandes qui vous correspondent", "Trova le richieste adatte a te", "找到适合的需求", "اعثر على الطلبات المناسبة"],
    "Conoce qué necesitan, en qué zona y para cuándo antes de preparar tu respuesta.": [
      "Find out what people need, where and when before preparing your response.",
      "Découvrez ce dont les personnes ont besoin, dans quelle zone et pour quand, avant de préparer votre réponse.",
      "Scopri cosa serve, in quale zona e per quando prima di preparare la tua risposta.",
      "在准备回复之前，先了解需要什么、在哪个地区以及何时需要。",
      "تعرّف على ما يحتاجه الناس والمنطقة والموعد قبل إعداد ردّك."
    ],
    "Haz tu propuesta": ["Make your offer", "Faites votre proposition", "Fai la tua proposta", "提出你的方案", "قدّم عرضك"],
    "Explica precio, disponibilidad y entrega. Si falta un dato, puedes pedir un detalle antes de ofertar.": [
      "Explain price, availability and delivery. If information is missing, you can ask for details before making an offer.",
      "Précisez le prix, la disponibilité et la livraison. S’il manque une information, vous pouvez demander un détail avant de proposer une offre.",
      "Indica prezzo, disponibilità e consegna. Se manca un’informazione, puoi chiedere un chiarimento prima di fare un’offerta.",
      "说明价格、库存或服务可用情况以及配送方式。如果信息不全，可以先询问详情，再提供报价。",
      "وضّح السعر والتوفّر والتوصيل. إذا كانت هناك معلومة ناقصة، يمكنك طلب توضيح قبل تقديم العرض."
    ],
    "Aprovecha la demanda agrupada": ["Make use of grouped demand", "Tirez parti des demandes groupées", "Approfitta della domanda aggregata", "利用集中需求的优势", "استفد من الطلب المجمّع"],
    "Cuando varias personas buscan lo mismo, el volumen puede ayudarte a ajustar tu oferta.": [
      "When several people want the same thing, the volume may help you adjust your offer.",
      "Lorsque plusieurs personnes cherchent la même chose, le volume peut vous aider à ajuster votre offre.",
      "Quando più persone cercano la stessa cosa, il volume può aiutarti ad adeguare la tua offerta.",
      "当多人寻找相同的商品时，需求量可能有助于你调整报价。",
      "عندما يبحث عدة أشخاص عن الشيء نفسه، قد يساعدك حجم الطلب على تعديل عرضك."
    ],
    "Prueba cómo responder a una petición": ["Try responding to a request", "Essayez de répondre à une demande", "Prova a rispondere a una richiesta", "试用如何回复需求", "جرّب كيفية الردّ على طلب"],
    "Elige una petición y ajusta una oferta de ejemplo. Esta demostración no envía mensajes ni ofertas reales.": [
      "Choose a request and adjust a sample offer. This demonstration does not send real messages or offers.",
      "Choisissez une demande et ajustez une offre d’exemple. Cette démonstration n’envoie aucun message ni offre réels.",
      "Scegli una richiesta e modifica un’offerta di esempio. Questa demo non invia messaggi né offerte reali.",
      "选择一个需求，并调整示例报价。此演示不会发送真实消息或报价。",
      "اختر طلبًا وعدّل عرضًا توضيحيًا. لا يرسل هذا العرض التجريبي رسائل أو عروضًا حقيقية."
    ],
    "PARA QUIEN CONECTA": ["FOR CONNECTORS", "POUR CEUX QUI CONNECTENT", "PER CHI CONNETTE", "为连接者而设", "لمن يربط الناس ببعضهم"],
    "Acerca allwain": ["Bring allwain", "Faites découvrir allwain", "Fai conoscere allwain", "把 allwain 带给", "قرّب allwain"],
    "a tu gente.": ["to your community.", "à votre entourage.", "alle persone che conosci.", "你身边的人。", "إلى من حولك."],
    "¿Conoces a alguien a quien le vendría bien? Presenta allwain a personas y comercios de tu zona y ayúdales a dar sus primeros pasos.": [
      "Know someone who could benefit? Introduce allwain to people and businesses in your area and help them get started.",
      "Vous connaissez quelqu’un à qui cela serait utile ? Présentez allwain aux personnes et aux commerces de votre quartier et accompagnez leurs premiers pas.",
      "Conosci qualcuno a cui potrebbe essere utile? Presenta allwain alle persone e ai negozi della tua zona e aiutali a muovere i primi passi.",
      "认识可能用得上的人吗？向附近的人和商家介绍 allwain，帮助他们开始使用。",
      "هل تعرف شخصًا قد يستفيد منه؟ عرّف الناس والمتاجر في منطقتك على allwain وساعدهم في خطواتهم الأولى."
    ],
    "Ver mi espacio Conector": ["View my Connector space", "Voir mon espace Connecteur", "Vedi il mio spazio Connettore", "查看我的连接者空间", "عرض مساحة Conector الخاصة بي"],
    "Comparte": ["Share", "Partagez", "Condividi", "分享", "شارك"],
    "tu QR o enlace.": ["your QR code or link.", "votre QR code ou votre lien.", "il tuo QR o link.", "你的二维码或链接。", "رمز QR أو رابطك."],
    "Acompaña": ["Support", "Accompagnez", "Accompagna", "帮助", "رافق"],
    "sus primeros pasos.": ["their first steps.", "leurs premiers pas.", "i loro primi passi.", "他们迈出第一步。", "خطواتهم الأولى."],
    "Consulta": ["See", "Découvrez", "Scopri", "查看", "اطّلع على"],
    "quién se une a tu red.": ["who joins your network.", "qui rejoint votre réseau.", "chi entra nella tua rete.", "谁加入了你的网络。", "من ينضم إلى شبكتك."],
    "¿Qué recibes por conectar?": ["What do you receive for connecting?", "Que recevez-vous en créant des liens ?", "Cosa ricevi per aver connesso le persone?", "帮助连接能获得什么？", "ماذا تحصل عليه مقابل ربط الناس؟"],
    "El modelo prevé compartir contigo parte de la comisión de allwain en las compras y ventas válidas de tu red, también en operaciones posteriores.": [
      "The model envisages sharing part of allwain’s commission with you on valid purchases and sales in your network, including subsequent transactions.",
      "Le modèle prévoit de partager avec vous une partie de la commission d’allwain sur les achats et ventes valides de votre réseau, y compris lors d’opérations ultérieures.",
      "Il modello prevede di condividere con te parte della commissione di allwain sugli acquisti e sulle vendite valide della tua rete, anche nelle operazioni successive.",
      "这一模式计划将你网络中有效买卖交易产生的部分 allwain 佣金与你分享，也包括后续交易。",
      "يقترح النموذج مشاركتك جزءًا من عمولة allwain على عمليات الشراء والبيع الصالحة في شبكتك، بما فيها العمليات اللاحقة."
    ],
    "Los pagos aún no están activos. No se paga por altas. Importes y condiciones se publicarán antes del primer pago.": [
      "Payments are not active yet. Sign-ups are not paid. Amounts and terms will be published before the first payment.",
      "Les paiements ne sont pas encore actifs. Les inscriptions ne sont pas rémunérées. Les montants et conditions seront publiés avant le premier paiement.",
      "I pagamenti non sono ancora attivi. Le iscrizioni non vengono remunerate. Importi e condizioni saranno pubblicati prima del primo pagamento.",
      "付款尚未启用。注册本身不会获得报酬。金额和条件将在首次付款前公布。",
      "المدفوعات غير مفعّلة بعد. لا يُدفع مقابل التسجيل. ستُنشر المبالغ والشروط قبل أول دفعة."
    ],
    "El reparto local es una colaboración aparte y voluntaria.": [
      "Local delivery is a separate, voluntary way to help.",
      "La livraison locale est une collaboration distincte et volontaire.",
      "La consegna locale è una collaborazione separata e volontaria.",
      "本地配送是独立且自愿参与的合作。",
      "التوصيل المحلي تعاون منفصل واختياري."
    ],
    "Conoce cómo se probará": ["See how it will be tested", "Découvrez comment elle sera testée", "Scopri come verrà testata", "了解将如何测试", "تعرّف على كيفية اختباره"],
    "Qué puedes hacer como comprador": ["What you can do as a buyer", "Ce que vous pouvez faire en tant qu’acheteur", "Cosa puoi fare come acquirente", "作为买家，你可以做什么", "ما يمكنك فعله كمشترٍ"],
    "Qué puedes hacer como vendedor": ["What you can do as a seller", "Ce que vous pouvez faire en tant que vendeur", "Cosa puoi fare come venditore", "作为卖家，你可以做什么", "ما يمكنك فعله كبائع"],
    "Una persona presenta allwain a una comerciante y un vecino": [
      "A person introduces allwain to a shopkeeper and a neighbour",
      "Une personne présente allwain à une commerçante et à un voisin",
      "Una persona presenta allwain a una commerciante e a un vicino",
      "一位用户向店主和邻居介绍 allwain",
      "شخص يعرّف صاحبة متجر وأحد الجيران على allwain"
    ],
    "Empieza por lo que necesitas.": ["Start with what you need.", "Commencez par ce qu’il vous faut.", "Inizia da quello che ti serve.", "从你的需求开始。", "ابدأ بما تحتاجه."],
    "Piloto Foios": ["Foios pilot", "Projet pilote de Foios", "Progetto pilota di Foios", "Foios 试点", "تجربة Foios"]
  };

  const translations = window.AllwainWebTranslations = window.AllwainWebTranslations || {};
  locales.forEach((locale, index) => {
    const dictionary = translations[locale] = translations[locale] || {};
    Object.entries(entries).forEach(([source, values]) => {
      if (typeof dictionary[source] !== "string") dictionary[source] = values[index];
    });
  });
})();
