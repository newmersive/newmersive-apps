(function () {
  "use strict";

  const stepIds = [
    "access",
    "profile",
    "capture",
    "buy",
    "compare",
    "sell",
    "connector",
    "notifications",
    "delivery",
    "assistant",
    "accessibility",
    "support"
  ];

  const routeOrders = {
    buyer: ["access", "profile", "capture", "buy", "compare", "delivery", "notifications", "assistant", "accessibility", "support", "sell", "connector"],
    seller: ["access", "profile", "sell", "compare", "notifications", "delivery", "assistant", "accessibility", "support", "capture", "buy", "connector"],
    connector: ["access", "profile", "connector", "notifications", "assistant", "accessibility", "support", "buy", "compare", "sell", "delivery", "capture"],
    observer: stepIds
  };

  const labels = {
    es: {
      routes: "Rutas",
      actions: "Acciones",
      objective: "Objetivo observable",
      checks: "Acciones a comprobar",
      expected: "Resultado esperado",
      pending: "Pendiente",
      underway: "En curso",
      ready: "Lista para confirmar",
      complete: "Ruta completada",
      checked: "{done} de {total} acciones",
      mark: "Marcar ruta probada",
      marked: "Probada ✓",
      completeFirst: "Completa las acciones antes de marcar la ruta",
      report: "Reportar incidencia de esta ruta",
      noRoute: "Sin ruta concreta",
      routeSelected: "Ruta «{route}» seleccionada. Describe ahora qué esperabas y qué ocurrió.",
      routeGeneral: "Ruta completa: doce áreas y veinticuatro acciones de la app.",
      routePersonalized: "Orden priorizado para el papel de {role} que elegiste en la encuesta.",
      allCompleted: "Recorrido completado. Tus doce rutas están guardadas en la cuenta.",
      progressHelp: "Completa las acciones de cada ruta y confirma después el resultado.",
      saving: "Guardando…",
      retry: "Volver a intentar",
      saveError: "No hemos podido guardar esta ruta. Inténtalo de nuevo.",
      savingAction: "Guardando la acción en tu cuenta…",
      actionSaved: "Acción guardada en tu cuenta.",
      actionSaveError: "No hemos podido guardar esa acción. El cambio se ha deshecho; inténtalo de nuevo.",
      localNote: "Las acciones y las rutas completadas se guardan en tu cuenta para continuar desde cualquier dispositivo.",
      openApp: "Abrir en la app ↗",
      webAlternative: "Abrir app web ↗",
      openProfile: "Abrir Perfil ↗",
      openCapture: "Abrir Capturar ↗",
      openRequest: "Abrir Pedir ↗",
      openSearch: "Abrir Buscar ↗",
      openOffers: "Abrir Ofertas ↗",
      openNetwork: "Abrir Mi red ↗",
      openActivation: "Abrir activación ↗",
      openNotices: "Abrir Avisos ↗",
      openMessages: "Abrir Mensajes ↗",
      openHelp: "Abrir Ayuda ↗"
    },
    en: {
      routes: "Routes",
      actions: "Actions",
      objective: "Observable goal",
      checks: "Actions to check",
      expected: "Expected result",
      pending: "Pending",
      underway: "In progress",
      ready: "Ready to confirm",
      complete: "Route completed",
      checked: "{done} of {total} actions",
      mark: "Mark route as tested",
      marked: "Tested ✓",
      completeFirst: "Complete the actions before confirming the route",
      report: "Report an issue on this route",
      noRoute: "No specific route",
      routeSelected: "Route “{route}” selected. Now describe what you expected and what happened.",
      routeGeneral: "Full journey: twelve app areas and twenty-four actions.",
      routePersonalized: "Order prioritised for the {role} role selected in the survey.",
      allCompleted: "Journey completed. All twelve routes are saved to your account.",
      progressHelp: "Complete each route’s actions, then confirm the result.",
      saving: "Saving…",
      retry: "Try again",
      saveError: "We could not save this route. Please try again.",
      savingAction: "Saving the action to your account…",
      actionSaved: "Action saved to your account.",
      actionSaveError: "We could not save that action. The change was undone; please try again.",
      localNote: "Actions and completed routes are saved to your account so you can continue on any device.",
      openApp: "Open in the app ↗",
      webAlternative: "Open web app ↗",
      openProfile: "Open Profile ↗",
      openCapture: "Open Capture ↗",
      openRequest: "Open Request ↗",
      openSearch: "Open Search ↗",
      openOffers: "Open Offers ↗",
      openNetwork: "Open My network ↗",
      openActivation: "Open activation ↗",
      openNotices: "Open Notices ↗",
      openMessages: "Open Messages ↗",
      openHelp: "Open Help ↗"
    },
    fr: {
      routes: "Parcours",
      actions: "Actions",
      objective: "Objectif observable",
      checks: "Actions à vérifier",
      expected: "Résultat attendu",
      pending: "À faire",
      underway: "En cours",
      ready: "Prêt à confirmer",
      complete: "Parcours terminé",
      checked: "{done} action(s) sur {total}",
      mark: "Marquer le parcours comme testé",
      marked: "Testé ✓",
      completeFirst: "Terminez les actions avant de confirmer le parcours",
      report: "Signaler un problème sur ce parcours",
      noRoute: "Aucun parcours précis",
      routeSelected: "Parcours « {route} » sélectionné. Décrivez maintenant ce que vous attendiez et ce qui s’est produit.",
      routeGeneral: "Parcours complet : douze zones et vingt-quatre actions de l’app.",
      routePersonalized: "Ordre priorisé pour le rôle {role} choisi dans l’enquête.",
      allCompleted: "Parcours terminé. Les douze parcours sont enregistrés dans votre compte.",
      progressHelp: "Terminez les actions de chaque parcours, puis confirmez le résultat.",
      saving: "Enregistrement…",
      retry: "Réessayer",
      saveError: "Impossible d’enregistrer ce parcours. Réessayez.",
      savingAction: "Enregistrement de l’action dans votre compte…",
      actionSaved: "Action enregistrée dans votre compte.",
      actionSaveError: "Impossible d’enregistrer cette action. La modification a été annulée ; réessayez.",
      localNote: "Les actions et les parcours terminés sont enregistrés dans votre compte afin de reprendre sur n’importe quel appareil.",
      openApp: "Ouvrir dans l’app ↗",
      webAlternative: "Ouvrir l’application web ↗",
      openProfile: "Ouvrir Profil ↗",
      openCapture: "Ouvrir Capturer ↗",
      openRequest: "Ouvrir Demander ↗",
      openSearch: "Ouvrir Rechercher ↗",
      openOffers: "Ouvrir Offres ↗",
      openNetwork: "Ouvrir Mon réseau ↗",
      openActivation: "Ouvrir l’activation ↗",
      openNotices: "Ouvrir Notifications ↗",
      openMessages: "Ouvrir Messages ↗",
      openHelp: "Ouvrir Aide ↗"
    },
    it: {
      routes: "Percorsi",
      actions: "Azioni",
      objective: "Obiettivo osservabile",
      checks: "Azioni da verificare",
      expected: "Risultato atteso",
      pending: "Da fare",
      underway: "In corso",
      ready: "Pronto da confermare",
      complete: "Percorso completato",
      checked: "{done} azioni su {total}",
      mark: "Segna il percorso come testato",
      marked: "Testato ✓",
      completeFirst: "Completa le azioni prima di confermare il percorso",
      report: "Segnala un problema in questo percorso",
      noRoute: "Nessun percorso specifico",
      routeSelected: "Percorso «{route}» selezionato. Ora descrivi cosa ti aspettavi e cosa è successo.",
      routeGeneral: "Percorso completo: dodici aree e ventiquattro azioni dell’app.",
      routePersonalized: "Ordine prioritario per il ruolo {role} scelto nel sondaggio.",
      allCompleted: "Percorso completato. Tutti i dodici percorsi sono salvati nel tuo account.",
      progressHelp: "Completa le azioni di ogni percorso e poi conferma il risultato.",
      saving: "Salvataggio…",
      retry: "Riprova",
      saveError: "Non è stato possibile salvare questo percorso. Riprova.",
      savingAction: "Salvataggio dell’azione nel tuo account…",
      actionSaved: "Azione salvata nel tuo account.",
      actionSaveError: "Non è stato possibile salvare l’azione. La modifica è stata annullata; riprova.",
      localNote: "Le azioni e i percorsi completati vengono salvati nel tuo account, così puoi continuare da qualsiasi dispositivo.",
      openApp: "Apri nell’app ↗",
      webAlternative: "Apri app web ↗",
      openProfile: "Apri Profilo ↗",
      openCapture: "Apri Acquisisci ↗",
      openRequest: "Apri Richiedi ↗",
      openSearch: "Apri Cerca ↗",
      openOffers: "Apri Offerte ↗",
      openNetwork: "Apri La mia rete ↗",
      openActivation: "Apri attivazione ↗",
      openNotices: "Apri Avvisi ↗",
      openMessages: "Apri Messaggi ↗",
      openHelp: "Apri Aiuto ↗"
    },
    zh: {
      routes: "测试路线",
      actions: "操作",
      objective: "可观察目标",
      checks: "需要检查的操作",
      expected: "预期结果",
      pending: "待开始",
      underway: "进行中",
      ready: "可确认",
      complete: "路线已完成",
      checked: "已完成 {done}/{total} 项操作",
      mark: "标记此路线已测试",
      marked: "已测试 ✓",
      completeFirst: "请先完成所有操作，再确认此路线",
      report: "报告此路线的问题",
      noRoute: "无具体路线",
      routeSelected: "已选择“{route}”路线。请说明你的预期和实际情况。",
      routeGeneral: "完整流程：应用的十二个区域和二十四项操作。",
      routePersonalized: "根据你在问卷中选择的“{role}”角色优先排序。",
      allCompleted: "流程已完成。十二条路线已保存到你的账户。",
      progressHelp: "完成每条路线的操作，然后确认结果。",
      saving: "正在保存…",
      retry: "重试",
      saveError: "无法保存此路线，请重试。",
      savingAction: "正在将操作保存到你的账户…",
      actionSaved: "操作已保存到你的账户。",
      actionSaveError: "无法保存该操作，改动已撤销，请重试。",
      localNote: "操作和已完成路线会保存到你的账户，方便你从任意设备继续。",
      openApp: "在应用中打开 ↗",
      webAlternative: "打开网页应用 ↗",
      openProfile: "打开个人资料 ↗",
      openCapture: "打开拍摄 ↗",
      openRequest: "打开发布需求 ↗",
      openSearch: "打开搜索 ↗",
      openOffers: "打开报价 ↗",
      openNetwork: "打开我的网络 ↗",
      openActivation: "打开激活流程 ↗",
      openNotices: "打开通知 ↗",
      openMessages: "打开消息 ↗",
      openHelp: "打开帮助 ↗"
    },
    ar: {
      routes: "المسارات",
      actions: "الإجراءات",
      objective: "هدف يمكن ملاحظته",
      checks: "إجراءات يجب التحقق منها",
      expected: "النتيجة المتوقعة",
      pending: "لم يبدأ",
      underway: "قيد التنفيذ",
      ready: "جاهز للتأكيد",
      complete: "اكتمل المسار",
      checked: "{done} من {total} إجراءات",
      mark: "تأكيد اختبار المسار",
      marked: "تم اختباره ✓",
      completeFirst: "أكمل الإجراءات قبل تأكيد المسار",
      report: "الإبلاغ عن مشكلة في هذا المسار",
      noRoute: "دون مسار محدد",
      routeSelected: "تم اختيار مسار «{route}». صِف الآن ما توقعته وما حدث.",
      routeGeneral: "المسار الكامل: اثنا عشر قسماً وأربعة وعشرون إجراءً في التطبيق.",
      routePersonalized: "ترتيب ذو أولوية لدور {role} الذي اخترته في الاستبيان.",
      allCompleted: "اكتمل المسار. حُفظت المسارات الاثنا عشر في حسابك.",
      progressHelp: "أكمل إجراءات كل مسار ثم أكد النتيجة.",
      saving: "جارٍ الحفظ…",
      retry: "أعد المحاولة",
      saveError: "تعذر حفظ هذا المسار. حاول مرة أخرى.",
      savingAction: "جارٍ حفظ الإجراء في حسابك…",
      actionSaved: "حُفظ الإجراء في حسابك.",
      actionSaveError: "تعذر حفظ هذا الإجراء. تم التراجع عن التغيير؛ حاول مرة أخرى.",
      localNote: "تُحفظ الإجراءات والمسارات المكتملة في حسابك لتتمكن من المتابعة من أي جهاز.",
      openApp: "فتح في التطبيق ↗",
      webAlternative: "فتح تطبيق الويب ↗",
      openProfile: "فتح الملف الشخصي ↗",
      openCapture: "فتح الالتقاط ↗",
      openRequest: "فتح الطلب ↗",
      openSearch: "فتح البحث ↗",
      openOffers: "فتح العروض ↗",
      openNetwork: "فتح شبكتي ↗",
      openActivation: "فتح التفعيل ↗",
      openNotices: "فتح الإشعارات ↗",
      openMessages: "فتح الرسائل ↗",
      openHelp: "فتح المساعدة ↗"
    }
  };

  const routes = [
    {
      id: "access",
      links: [{ href: "allwain://inicio", label: "openApp" }, { href: "/web/inicio", label: "webAlternative", web: true }],
      copy: {
        es: { title: "Acceso y navegación", summary: "Comprueba que la sesión, el inicio y el cambio de espacios mantienen el contexto.", actions: ["Entra, vuelve al inicio y cierra la sesión; después confirma que el acceso se recupera sin bucles.", "Recorre las áreas principales y usa Atrás al menos dos veces sin perder tu posición."], result: "La identidad y la navegación son claras; no aparecen pantallas duplicadas ni saltos inesperados." },
        en: { title: "Access and navigation", summary: "Check that the session, home and switching areas preserve context.", actions: ["Sign in, return home and sign out; then confirm that access recovers without loops.", "Visit the main areas and use Back at least twice without losing your position."], result: "Identity and navigation are clear, with no duplicate screens or unexpected jumps." },
        fr: { title: "Accès et navigation", summary: "Vérifiez que la session, l’accueil et le changement d’espace conservent le contexte.", actions: ["Connectez-vous, revenez à l’accueil et déconnectez-vous ; vérifiez ensuite que l’accès reprend sans boucle.", "Parcourez les zones principales et utilisez Retour au moins deux fois sans perdre votre position."], result: "L’identité et la navigation sont claires, sans écran dupliqué ni saut inattendu." },
        it: { title: "Accesso e navigazione", summary: "Verifica che sessione, home e cambio di area mantengano il contesto.", actions: ["Accedi, torna alla home ed esci; poi verifica che l’accesso riprenda senza cicli.", "Visita le aree principali e usa Indietro almeno due volte senza perdere la posizione."], result: "Identità e navigazione sono chiare, senza schermate duplicate o salti inattesi." },
        zh: { title: "登录与导航", summary: "检查会话、首页和区域切换是否能保持上下文。", actions: ["登录、返回首页并退出；随后确认重新登录不会陷入循环。", "浏览主要区域，并至少使用两次返回键，确认当前位置不会丢失。"], result: "身份和导航清晰，不出现重复页面或意外跳转。" },
        ar: { title: "الدخول والتنقل", summary: "تحقق من أن الجلسة والصفحة الرئيسية والتنقل بين الأقسام يحافظ على السياق.", actions: ["سجّل الدخول وارجع إلى البداية ثم سجّل الخروج؛ وبعدها تحقق من استعادة الدخول دون حلقات.", "تنقّل بين الأقسام الرئيسية واستخدم الرجوع مرتين على الأقل دون فقدان موضعك."], result: "الهوية والتنقل واضحان ولا تظهر شاشات مكررة أو انتقالات غير متوقعة." }
      }
    },
    {
      id: "profile",
      links: [{ href: "allwain://perfil", label: "openProfile" }, { href: "/web/perfil", label: "webAlternative", web: true }],
      copy: {
        es: { title: "Perfil, preferencias y privacidad", summary: "Revisa los datos visibles, las preferencias y los controles de cuenta.", actions: ["Distingue los datos privados de la información pública y confirma que los primeros no aparecen en vistas compartibles.", "Cambia una preferencia reversible, vuelve a entrar y comprueba que se conserva."], result: "La separación entre datos privados y públicos es clara y la preferencia elegida persiste." },
        en: { title: "Profile, preferences and privacy", summary: "Review visible data, preferences and account controls.", actions: ["Distinguish private data from public information and confirm that private data does not appear in shareable views.", "Change a reversible preference, reopen the area and check that it persists."], result: "The boundary between private and public data is clear and the selected preference persists." },
        fr: { title: "Profil, préférences et confidentialité", summary: "Examinez les données visibles, les préférences et les contrôles du compte.", actions: ["Distinguez les données privées des informations publiques et confirmez leur absence dans les vues partageables.", "Modifiez une préférence réversible, revenez dans la zone et vérifiez qu’elle est conservée."], result: "La séparation entre données privées et publiques est claire et la préférence choisie est conservée." },
        it: { title: "Profilo, preferenze e privacy", summary: "Controlla dati visibili, preferenze e comandi dell’account.", actions: ["Distingui i dati privati dalle informazioni pubbliche e verifica che non appaiano nelle viste condivisibili.", "Cambia una preferenza reversibile, riapri l’area e verifica che sia conservata."], result: "La separazione tra dati privati e pubblici è chiara e la preferenza scelta persiste." },
        zh: { title: "个人资料、偏好与隐私", summary: "检查可见数据、偏好设置和账户控制。", actions: ["区分私人数据和公开信息，并确认私人数据不会出现在可分享视图中。", "更改一项可恢复的偏好，重新进入后确认设置仍然保留。"], result: "私人和公开数据边界清楚，并且所选偏好能够保存。" },
        ar: { title: "الملف والتفضيلات والخصوصية", summary: "راجع البيانات الظاهرة والتفضيلات وأدوات التحكم في الحساب.", actions: ["ميّز البيانات الخاصة من المعلومات العامة وتأكد من عدم ظهور الخاصة في العروض القابلة للمشاركة.", "غيّر تفضيلاً يمكن إرجاعه ثم افتح القسم مجدداً وتأكد من حفظه."], result: "الفصل بين البيانات الخاصة والعامة واضح ويستمر التفضيل المختار." }
      }
    },
    {
      id: "capture",
      links: [{ href: "allwain://capturar", label: "openCapture" }, { href: "/web/capturar", label: "webAlternative", web: true }],
      copy: {
        es: { title: "Captura y reconocimiento", summary: "Prueba cámara, galería, permisos y revisión de un borrador seguro.", actions: ["Prueba primero denegar y después permitir la cámara; la app debe explicar cómo continuar.", "Prueba foto y galería, revisa el borrador y corrige un dato; sal sin añadir datos personales ni publicar."], result: "Los permisos se entienden, la vista previa es legible y el borrador puede corregirse sin exponer datos personales." },
        en: { title: "Capture and recognition", summary: "Test camera, gallery, permissions and review of a safe draft.", actions: ["First deny and then allow camera access; the app should explain how to continue.", "Try photo and gallery, review the draft and correct one field; leave without personal data or publishing."], result: "Permissions are understandable, the preview is legible and the draft can be corrected without exposing personal data." },
        fr: { title: "Capture et reconnaissance", summary: "Testez caméra, galerie, autorisations et révision d’un brouillon sûr.", actions: ["Refusez d’abord puis autorisez la caméra ; l’app doit expliquer comment continuer.", "Testez photo et galerie, révisez le brouillon et corrigez une donnée ; quittez sans donnée personnelle ni publication."], result: "Les autorisations sont claires, l’aperçu est lisible et le brouillon est modifiable sans exposer de données personnelles." },
        it: { title: "Acquisizione e riconoscimento", summary: "Prova fotocamera, galleria, permessi e revisione di una bozza sicura.", actions: ["Prima nega e poi consenti la fotocamera; l’app deve spiegare come continuare.", "Prova foto e galleria, rivedi la bozza e correggi un dato; esci senza dati personali né pubblicare."], result: "I permessi sono chiari, l’anteprima è leggibile e la bozza è modificabile senza esporre dati personali." },
        zh: { title: "拍摄与识别", summary: "测试相机、相册、权限以及安全草稿的复核。", actions: ["先拒绝、再允许相机权限；应用应说明下一步怎么做。", "尝试拍照和相册，复核草稿并修改一项数据；不添加私人数据，也不发布。"], result: "权限说明清楚，预览可读，草稿可修改且不会暴露私人数据。" },
        ar: { title: "الالتقاط والتعرّف", summary: "اختبر الكاميرا والمعرض والأذونات ومراجعة مسودة آمنة.", actions: ["ارفض إذن الكاميرا أولاً ثم اسمح به؛ يجب أن يشرح التطبيق كيفية المتابعة.", "جرّب الصورة والمعرض وراجع المسودة وصحح بياناً؛ اخرج دون بيانات شخصية أو نشر."], result: "الأذونات واضحة والمعاينة مقروءة ويمكن تصحيح المسودة دون كشف بيانات شخصية." }
      }
    },
    {
      id: "buy",
      links: [{ href: "allwain://pedir", label: "openRequest" }, { href: "/web/pedir", label: "webAlternative", web: true }],
      copy: {
        es: { title: "Crear una petición sin publicarla", summary: "Usa contenido de demostración y recorre la compra sin enviar ni pagar.", actions: ["Abre una oferta demo o crea y guarda una petición de prueba con datos no personales.", "Llega a la revisión, comprueba el resumen y detente antes de publicar, aceptar o pagar."], result: "El resumen coincide con el borrador y no se publica, acepta ni cobra nada sin confirmación explícita." },
        en: { title: "Create a request without publishing", summary: "Use demo content and go through buying without sending or paying.", actions: ["Open a demo offer or create and save a test request using no personal data.", "Reach review, check the summary and stop before publishing, accepting or paying."], result: "The summary matches the draft and nothing is published, accepted or charged without explicit confirmation." },
        fr: { title: "Créer une demande sans la publier", summary: "Utilisez du contenu de démonstration et parcourez l’achat sans envoyer ni payer.", actions: ["Ouvrez une offre démo ou créez et enregistrez une demande de test sans donnée personnelle.", "Atteignez la révision, vérifiez le résumé et arrêtez avant de publier, accepter ou payer."], result: "Le résumé correspond au brouillon et rien n’est publié, accepté ni facturé sans confirmation explicite." },
        it: { title: "Creare una richiesta senza pubblicarla", summary: "Usa contenuti demo e percorri l’acquisto senza inviare né pagare.", actions: ["Apri un’offerta demo o crea e salva una richiesta di prova senza dati personali.", "Arriva alla revisione, controlla il riepilogo e fermati prima di pubblicare, accettare o pagare."], result: "Il riepilogo corrisponde alla bozza e nulla viene pubblicato, accettato o addebitato senza conferma." },
        zh: { title: "创建需求但不发布", summary: "使用演示内容完成购买流程，不发送也不付款。", actions: ["打开演示报价，或使用非私人数据创建并保存测试需求。", "到达复核页，核对摘要，在发布、接受或付款前停止。"], result: "摘要与草稿一致，未经明确确认不会发布、接受或扣款。" },
        ar: { title: "إنشاء طلب دون نشره", summary: "استخدم محتوى تجريبياً وتصفّح الشراء دون إرسال أو دفع.", actions: ["افتح عرضاً تجريبياً أو أنشئ واحفظ طلب اختبار بلا بيانات شخصية.", "صل إلى المراجعة وتحقق من الملخص وتوقف قبل النشر أو القبول أو الدفع."], result: "يطابق الملخص المسودة ولا يحدث نشر أو قبول أو خصم دون تأكيد صريح." }
      }
    },
    {
      id: "compare",
      links: [{ href: "allwain://buscar", label: "openSearch" }, { href: "/web/buscar", label: "webAlternative", web: true }],
      copy: {
        es: { title: "Buscar y comparar alternativas", summary: "Comprueba que una persona puede distinguir opciones sin aceptar una oferta real.", actions: ["Realiza una búsqueda y cambia al menos un filtro o criterio de ordenación.", "Compara precio, entrega y quién responde; abre un detalle y vuelve sin aceptar una oferta real."], result: "Las diferencias importantes se reconocen y la búsqueda mantiene filtros y posición sin activar una compra." },
        en: { title: "Search and compare alternatives", summary: "Check that a person can distinguish options without accepting a real offer.", actions: ["Run a search and change at least one filter or sorting criterion.", "Compare price, delivery and who responds; open a detail and return without accepting a real offer."], result: "Important differences are recognisable and search keeps filters and position without starting a purchase." },
        fr: { title: "Rechercher et comparer", summary: "Vérifiez qu’une personne distingue les options sans accepter d’offre réelle.", actions: ["Lancez une recherche et modifiez au moins un filtre ou critère de tri.", "Comparez prix, livraison et auteur ; ouvrez un détail puis revenez sans accepter d’offre réelle."], result: "Les différences sont visibles et la recherche conserve filtres et position sans lancer d’achat." },
        it: { title: "Cercare e confrontare alternative", summary: "Verifica che una persona distingua le opzioni senza accettare un’offerta reale.", actions: ["Esegui una ricerca e cambia almeno un filtro o criterio di ordinamento.", "Confronta prezzo, consegna e chi risponde; apri un dettaglio e torna senza accettare offerte reali."], result: "Le differenze sono riconoscibili e la ricerca conserva filtri e posizione senza avviare acquisti." },
        zh: { title: "搜索并比较方案", summary: "检查用户能否区分选项，且不接受真实报价。", actions: ["执行一次搜索，并更改至少一个筛选或排序条件。", "比较价格、配送和响应方；打开详情后返回，不接受真实报价。"], result: "重要差异清晰，搜索保留筛选和位置，且不会启动购买。" },
        ar: { title: "البحث ومقارنة البدائل", summary: "تحقق من تمييز الخيارات دون قبول عرض حقيقي.", actions: ["نفّذ بحثاً وغيّر مرشحاً أو معيار ترتيب واحداً على الأقل.", "قارن السعر والتسليم والجهة التي ترد؛ افتح التفاصيل ثم ارجع دون قبول عرض حقيقي."], result: "تظهر الفروق ويحافظ البحث على المرشحات والموضع دون بدء شراء." }
      }
    },
    {
      id: "sell",
      links: [{ href: "allwain://ofertas", label: "openOffers" }, { href: "/web/ofertas", label: "webAlternative", web: true }],
      copy: {
        es: { title: "Responder a la demanda", summary: "Explora peticiones y prepara una oferta de prueba sin publicarla.", actions: ["Abre Ofertas y localiza una petición relevante por necesidad, ubicación o categoría.", "Prepara precio, condiciones y entrega hasta la revisión; sal antes de publicar."], result: "Se entiende que se responde a clientes y peticiones, y la revisión evita envíos accidentales." },
        en: { title: "Respond to demand", summary: "Explore requests and prepare a test offer without publishing it.", actions: ["Open Offers and find a relevant request by need, location or category.", "Prepare price, conditions and delivery up to review; leave before publishing."], result: "It is clear that sellers respond to customers and requests, and review prevents accidental submission." },
        fr: { title: "Répondre à la demande", summary: "Explorez les demandes et préparez une offre de test sans la publier.", actions: ["Ouvrez Offres et trouvez une demande pertinente par besoin, lieu ou catégorie.", "Préparez prix, conditions et livraison jusqu’à la révision ; quittez avant de publier."], result: "Il est clair que le vendeur répond à des clients et demandes, et la révision évite un envoi accidentel." },
        it: { title: "Rispondere alla domanda", summary: "Esplora le richieste e prepara un’offerta di prova senza pubblicarla.", actions: ["Apri Offerte e trova una richiesta pertinente per bisogno, località o categoria.", "Prepara prezzo, condizioni e consegna fino alla revisione; esci prima di pubblicare."], result: "È chiaro che si risponde a clienti e richieste e la revisione evita invii accidentali." },
        zh: { title: "响应需求", summary: "浏览需求并准备一份测试报价，但不发布。", actions: ["打开报价，按需求、地点或类别找到一条相关请求。", "填写价格、条件和配送直到复核页；发布前退出。"], result: "卖家是在响应客户需求，且复核页能防止误提交。" },
        ar: { title: "الاستجابة للطلب", summary: "استكشف الطلبات وجهّز عرضاً تجريبياً دون نشره.", actions: ["افتح العروض وحدد طلباً مناسباً حسب الحاجة أو الموقع أو الفئة.", "جهّز السعر والشروط والتسليم حتى المراجعة ثم اخرج قبل النشر."], result: "يتضح أن البائع يستجيب للعملاء والطلبات وأن المراجعة تمنع الإرسال غير المقصود." }
      }
    },
    {
      id: "connector",
      links: [{ href: "allwain://activar-conector", label: "openActivation" }, { href: "allwain://mi-red", label: "openNetwork" }, { href: "/web/activar-conector", label: "webAlternative", web: true }],
      copy: {
        es: { title: "Activar y entender Conector", summary: "Revisa la zona, Mi red, la atribución y el reparto de beneficios.", actions: ["Recorre Activar zona y Mi red; comprueba que explican atribución, beneficios y responsabilidades.", "Revisa el QR y la zona asociada sin compartirlo fuera ni completar una activación real."], result: "Queda claro quién participa, cuándo existe beneficio y qué implica activar una zona, sin difundir el QR." },
        en: { title: "Activate and understand Connector", summary: "Review the area, My network, attribution and benefit sharing.", actions: ["Go through Activate area and My network; check that attribution, benefits and responsibilities are explained.", "Review the QR and linked area without sharing it outside or completing a real activation."], result: "Participation, benefit conditions and area activation are clear without distributing the QR." },
        fr: { title: "Activer et comprendre Connecteur", summary: "Examinez la zone, Mon réseau, l’attribution et le partage des bénéfices.", actions: ["Parcourez Activer la zone et Mon réseau ; vérifiez l’explication de l’attribution, des bénéfices et responsabilités.", "Examinez le QR et la zone liée sans le partager à l’extérieur ni terminer une activation réelle."], result: "Participation, conditions de bénéfice et activation de zone sont claires sans diffuser le QR." },
        it: { title: "Attivare e capire Connettore", summary: "Controlla zona, La mia rete, attribuzione e condivisione dei benefici.", actions: ["Percorri Attiva zona e La mia rete; verifica che spieghino attribuzione, benefici e responsabilità.", "Controlla il QR e la zona associata senza condividerlo fuori né completare un’attivazione reale."], result: "Partecipazione, condizioni dei benefici e attivazione sono chiare senza diffondere il QR." },
        zh: { title: "激活并理解连接者", summary: "检查区域、我的网络、归属和收益分享。", actions: ["浏览激活区域和我的网络，确认其中说明归属、收益和责任。", "查看二维码和关联区域，不向外分享，也不完成真实激活。"], result: "参与方式、收益条件和区域激活含义清楚，且不会传播二维码。" },
        ar: { title: "تفعيل وفهم الموصّل", summary: "راجع المنطقة وشبكتي والنسبة وتقاسم المنافع.", actions: ["تصفّح تفعيل المنطقة وشبكتي وتأكد من شرح النسبة والمنافع والمسؤوليات.", "راجع رمز QR والمنطقة المرتبطة دون مشاركته خارجاً أو إكمال تفعيل حقيقي."], result: "المشاركة وشروط المنفعة وتفعيل المنطقة واضحة دون نشر رمز QR." }
      }
    },
    {
      id: "notifications",
      links: [{ href: "allwain://avisos", label: "openNotices" }, { href: "allwain://mensajes", label: "openMessages" }, { href: "/web/avisos", label: "webAlternative", web: true }],
      copy: {
        es: { title: "Avisos y conversaciones", summary: "Comprueba estados de lectura, destinos y continuidad de las conversaciones.", actions: ["Abre Avisos, distingue leído de no leído y entra en un aviso con destino.", "Vuelve a la lista, abre Mensajes y comprueba que el contexto de la conversación es claro."], result: "Cada aviso lleva al lugar esperado y el estado de lectura se mantiene coherente." },
        en: { title: "Notices and conversations", summary: "Check read states, destinations and conversation continuity.", actions: ["Open Notices, distinguish read from unread and enter a notice with a destination.", "Return to the list, open Messages and check that the conversation context is clear."], result: "Each notice opens the expected place and read state remains consistent." },
        fr: { title: "Notifications et conversations", summary: "Vérifiez les états de lecture, les destinations et la continuité des conversations.", actions: ["Ouvrez Notifications, distinguez lu et non lu puis ouvrez une notification avec destination.", "Revenez à la liste, ouvrez Messages et vérifiez que le contexte de la conversation est clair."], result: "Chaque notification mène au bon endroit et son état de lecture reste cohérent." },
        it: { title: "Avvisi e conversazioni", summary: "Verifica stati di lettura, destinazioni e continuità delle conversazioni.", actions: ["Apri Avvisi, distingui letto da non letto e apri un avviso con destinazione.", "Torna all’elenco, apri Messaggi e verifica che il contesto della conversazione sia chiaro."], result: "Ogni avviso porta al punto previsto e lo stato di lettura resta coerente." },
        zh: { title: "通知与对话", summary: "检查已读状态、跳转目标和对话连续性。", actions: ["打开通知，区分已读和未读，并进入一条带跳转目标的通知。", "返回列表，打开消息，确认对话上下文清楚。"], result: "每条通知都到达预期位置，已读状态保持一致。" },
        ar: { title: "الإشعارات والمحادثات", summary: "تحقق من حالات القراءة والوجهات واستمرارية المحادثات.", actions: ["افتح الإشعارات وميّز المقروء من غير المقروء ثم افتح إشعاراً له وجهة.", "ارجع إلى القائمة وافتح الرسائل وتأكد من وضوح سياق المحادثة."], result: "يقود كل إشعار إلى المكان المتوقع وتبقى حالة القراءة متسقة." }
      }
    },
    {
      id: "delivery",
      links: [{ href: "allwain://ofertas", label: "openOffers" }, { href: "/web/ofertas", label: "webAlternative", web: true }],
      copy: {
        es: { title: "Recogida y reparto kilómetro cero", summary: "Usa únicamente la simulación verificada; no explores ni completes una operación real.", actions: ["En el espacio Conector localiza «Practica una entrega Km 0» y pulsa «Probar recorrido».", "Completa la simulación hasta volver al inicio y confirma que no creó ningún pedido ni pago."], result: "La demo explica recoger con QR, entregar y confirmar sin crear pedidos ni pagos." },
        en: { title: "Pickup and zero-mile delivery", summary: "Use only the verified simulation; do not explore or complete a real operation.", actions: ["In Connector, find “Practise a local delivery” and press “Try journey”.", "Complete the simulation until it returns home and confirm that no order or payment was created."], result: "The demo explains QR pickup, delivery and confirmation without creating orders or payments." },
        fr: { title: "Retrait et livraison kilomètre zéro", summary: "Utilisez uniquement la simulation vérifiée ; n’explorez ni ne terminez d’opération réelle.", actions: ["Dans Connecteur, trouvez « Pratiquer une livraison Km 0 » puis appuyez sur « Tester le parcours ».", "Terminez la simulation jusqu’au retour à l’accueil et confirmez qu’aucune commande ni paiement n’a été créé."], result: "La démo explique retrait par QR, livraison et confirmation sans créer commande ni paiement." },
        it: { title: "Ritiro e consegna a chilometro zero", summary: "Usa solo la simulazione verificata; non esplorare né completare operazioni reali.", actions: ["In Connettore trova «Prova una consegna Km 0» e premi «Prova percorso».", "Completa la simulazione fino al ritorno alla home e verifica che non abbia creato ordini né pagamenti."], result: "La demo spiega ritiro con QR, consegna e conferma senza creare ordini o pagamenti." },
        zh: { title: "自提与零公里配送", summary: "只使用已验证的模拟流程；不要浏览或完成真实交易。", actions: ["在连接者区域找到“练习一次零公里配送”，并点击“测试流程”。", "完成模拟直到返回首页，确认没有创建订单或付款。"], result: "演示会说明二维码取货、配送和确认，且不会创建订单或付款。" },
        ar: { title: "الاستلام والتوصيل لمسافة صفر", summary: "استخدم المحاكاة الموثقة فقط ولا تستكشف أو تكمل عملية حقيقية.", actions: ["في قسم الموصّل ابحث عن «تدرّب على توصيل Km 0» واضغط «جرّب المسار».", "أكمل المحاكاة حتى العودة إلى البداية وتأكد من عدم إنشاء طلب أو دفعة."], result: "تشرح التجربة الاستلام عبر QR والتوصيل والتأكيد دون إنشاء طلبات أو مدفوعات." }
      }
    },
    {
      id: "assistant",
      links: [{ href: "allwain://ayuda", label: "openHelp" }, { href: "/web/ayuda", label: "webAlternative", web: true }],
      copy: {
        es: { title: "Asistente: contexto y utilidad", summary: "Comprueba que la guía entiende una pregunta concreta y escucha la repregunta.", actions: ["Haz una pregunta concreta sobre una acción de la app y comprueba que la respuesta sea específica y verificable.", "Haz una repregunta que dependa de la respuesta anterior; confirma que conserva el contexto y que la acción sugerida coincide con tu intención."], result: "La segunda respuesta usa el contexto, evita vaguedades y propone un siguiente paso pertinente y seguro." },
        en: { title: "Assistant: context and usefulness", summary: "Check that the guide understands a specific question and listens to the follow-up.", actions: ["Ask a specific question about an app action and check that the answer is specific and verifiable.", "Ask a follow-up that depends on the previous answer; confirm it keeps context and suggests an action matching your intent."], result: "The second answer uses context, avoids vague wording and proposes a relevant, safe next step." },
        fr: { title: "Assistant : contexte et utilité", summary: "Vérifiez que le guide comprend une question précise et écoute la relance.", actions: ["Posez une question précise sur une action de l’app et vérifiez que la réponse est spécifique et vérifiable.", "Posez une relance qui dépend de la réponse précédente ; confirmez que le contexte est conservé et que l’action proposée correspond à votre intention."], result: "La seconde réponse utilise le contexte, évite les généralités et propose une étape suivante pertinente et sûre." },
        it: { title: "Assistente: contesto e utilità", summary: "Verifica che la guida capisca una domanda precisa e ascolti la richiesta successiva.", actions: ["Fai una domanda precisa su un’azione dell’app e verifica che la risposta sia specifica e controllabile.", "Fai una domanda successiva legata alla risposta precedente; verifica che mantenga il contesto e proponga un’azione coerente con il tuo intento."], result: "La seconda risposta usa il contesto, evita vaghezze e propone un passo successivo pertinente e sicuro." },
        zh: { title: "助手：上下文与实用性", summary: "检查助手是否理解具体问题并听懂后续追问。", actions: ["针对应用中的一项操作提出具体问题，确认回答具体且可验证。", "提出依赖上一条回答的追问；确认助手保留上下文，且建议的操作符合你的意图。"], result: "第二次回答会使用上下文，避免含糊，并提出相关且安全的下一步。" },
        ar: { title: "المساعد: السياق والفائدة", summary: "تحقق من أن الدليل يفهم سؤالاً محدداً ويستمع إلى السؤال المتابع.", actions: ["اطرح سؤالاً محدداً عن إجراء داخل التطبيق وتأكد من أن الإجابة دقيقة وقابلة للتحقق.", "اطرح سؤالاً تابعاً يعتمد على الإجابة السابقة؛ وتأكد من حفظ السياق وأن الإجراء المقترح يطابق مقصدك."], result: "تستخدم الإجابة الثانية السياق وتتجنب العموميات وتقترح خطوة تالية مناسبة وآمنة." }
      }
    },
    {
      id: "accessibility",
      links: [{ href: "allwain://inicio", label: "openApp" }, { href: "/web/inicio", label: "webAlternative", web: true }],
      copy: {
        es: { title: "Idioma, lectura y accesibilidad", summary: "Prueba el recorrido con otra configuración de lectura o interacción.", actions: ["Cambia a otro idioma disponible y vuelve al tuyo; comprueba que la selección se conserva.", "Aumenta el tamaño de texto o usa teclado o lector de pantalla y completa un recorrido corto."], result: "No hay textos cortados, el foco sigue un orden útil y la lengua elegida persiste." },
        en: { title: "Language, reading and accessibility", summary: "Test the journey with another reading or interaction setting.", actions: ["Switch to another available language and back; check that the choice persists.", "Increase text size or use a keyboard or screen reader and complete a short journey."], result: "No text is clipped, focus follows a useful order and the chosen language persists." },
        fr: { title: "Langue, lecture et accessibilité", summary: "Testez le parcours avec un autre réglage de lecture ou d’interaction.", actions: ["Passez à une autre langue disponible puis revenez ; vérifiez que le choix est conservé.", "Augmentez la taille du texte ou utilisez clavier ou lecteur d’écran pour un court parcours."], result: "Aucun texte n’est coupé, le focus suit un ordre utile et la langue choisie est conservée." },
        it: { title: "Lingua, lettura e accessibilità", summary: "Prova il percorso con un’altra impostazione di lettura o interazione.", actions: ["Passa a un’altra lingua disponibile e torna alla tua; verifica che la scelta sia conservata.", "Aumenta il testo o usa tastiera o lettore di schermo e completa un breve percorso."], result: "Nessun testo è tagliato, il focus segue un ordine utile e la lingua scelta persiste." },
        zh: { title: "语言、阅读与无障碍", summary: "使用另一种阅读或交互设置测试流程。", actions: ["切换到另一种可用语言，再切回原语言，确认选择能够保存。", "增大文字，或使用键盘/屏幕阅读器完成一段短流程。"], result: "文字不会被截断，焦点顺序合理，所选语言能够保存。" },
        ar: { title: "اللغة والقراءة وإمكانية الوصول", summary: "اختبر المسار بإعداد مختلف للقراءة أو التفاعل.", actions: ["انتقل إلى لغة أخرى متاحة ثم ارجع إلى لغتك وتأكد من حفظ الاختيار.", "كبّر النص أو استخدم لوحة المفاتيح أو قارئ الشاشة وأكمل مساراً قصيراً."], result: "لا يُقص النص ويتحرك التركيز بترتيب مفيد وتستمر اللغة المختارة." }
      }
    },
    {
      id: "support",
      links: [{ href: "allwain://mensajes", label: "openMessages" }, { href: "allwain://avisos", label: "openNotices" }, { href: "/web/mensajes", label: "webAlternative", web: true }],
      copy: {
        es: { title: "Soporte y reporte de incidencias", summary: "Revisa Mensajes y Avisos y deja desde esta academia una evidencia útil cuando algo falla.", actions: ["Abre Mensajes y Avisos, comprueba sus estados y vuelve a la academia sin perder el contexto.", "Si encuentras un problema, anota resultado esperado, resultado real y pasos para repetirlo; envíalo abajo."], result: "El recorrido de soporte es claro y el reporte contiene contexto suficiente para reproducir el fallo." },
        en: { title: "Support and issue reporting", summary: "Review Messages and Notices and leave useful evidence from this academy when something fails.", actions: ["Open Messages and Notices, check their states and return to the academy without losing context.", "If you find a problem, note expected result, actual result and reproduction steps; submit it below."], result: "The support journey is clear and the report contains enough context to reproduce the failure." },
        fr: { title: "Support et signalement", summary: "Vérifiez Messages et Notifications et laissez ici une preuve utile en cas de problème.", actions: ["Ouvrez Messages et Notifications, vérifiez leurs états puis revenez à l’académie sans perdre le contexte.", "En cas de problème, notez résultat attendu, résultat réel et étapes de reproduction ; envoyez-le ci-dessous."], result: "Le parcours de support est clair et le signalement contient assez de contexte pour reproduire le problème." },
        it: { title: "Supporto e segnalazione problemi", summary: "Controlla Messaggi e Avvisi e lascia qui prove utili quando qualcosa non funziona.", actions: ["Apri Messaggi e Avvisi, controlla gli stati e torna all’accademia senza perdere il contesto.", "Se trovi un problema, annota risultato atteso, risultato reale e passaggi per ripeterlo; invialo sotto."], result: "Il percorso di supporto è chiaro e la segnalazione contiene contesto sufficiente per riprodurre il problema." },
        zh: { title: "支持与问题报告", summary: "检查消息和通知，并在出错时从本学院留下有用证据。", actions: ["打开消息和通知，检查状态，然后返回学院且不丢失上下文。", "如发现问题，请记下预期结果、实际结果和复现步骤，并在下方提交。"], result: "支持流程清楚，报告包含足够信息以复现故障。" },
        ar: { title: "الدعم والإبلاغ عن المشكلات", summary: "راجع الرسائل والإشعارات واترك من هذه الأكاديمية دليلاً مفيداً عند حدوث خلل.", actions: ["افتح الرسائل والإشعارات وتحقق من حالاتها ثم عد إلى الأكاديمية دون فقدان السياق.", "إذا وجدت مشكلة فدوّن النتيجة المتوقعة والفعلية وخطوات التكرار ثم أرسلها أدناه."], result: "مسار الدعم واضح ويتضمن البلاغ سياقاً كافياً لإعادة إنتاج الخلل." }
      }
    }
  ];

  function normalizeLocale(locale) {
    const value = String(locale || "es").toLowerCase().split(/[-_]/)[0];
    return labels[value] ? value : "es";
  }

  function localizedRoutes(locale) {
    const safeLocale = normalizeLocale(locale);
    return routes.map((route) => ({
      id: route.id,
      links: route.links.map((link) => ({ ...link, text: labels[safeLocale][link.label] })),
      ...route.copy[safeLocale]
    }));
  }

  window.AllwainTesterAcademy = Object.freeze({
    stepIds: stepIds.slice(),
    routeOrders: Object.freeze({
      buyer: routeOrders.buyer.slice(),
      seller: routeOrders.seller.slice(),
      connector: routeOrders.connector.slice(),
      observer: routeOrders.observer.slice()
    }),
    labels(locale) {
      return { ...labels[normalizeLocale(locale)] };
    },
    routes: localizedRoutes
  });
})();
