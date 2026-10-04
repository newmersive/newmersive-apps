import type { AppLocale } from ".";
import type { RequestPublicationAction } from "../utils/requestLifecycle";

type ActionCopy = { label: string; confirmation: string; done: string };
type LifecycleCopy = {
  active: string; history: string; emptyActive: string; emptyHistory: string;
  hint: string; cancel: string; busy: string; error: string; changed: string;
  orders: string; orderMissing: string; orderError: string; statusTitle: string;
  actions: Record<RequestPublicationAction, ActionCopy>;
};

export const buyerRequestLifecycleCopy: Record<AppLocale, LifecycleCopy> = {
  es: {
    active: "En curso", history: "Historial", emptyActive: "No tienes peticiones en curso. Puedes crear una o consultar el historial.",
    emptyHistory: "Aquí aparecerán tus peticiones retiradas, cerradas y archivadas.",
    hint: "Retirar o archivar una petición no cancela pedidos ni pagos. Los acuerdos continúan en Mis pedidos.",
    cancel: "Volver", busy: "Actualizando…", error: "No se pudo actualizar la petición. Reintenta.",
    changed: "La petición ha cambiado. Actualiza la ficha antes de continuar.", orders: "Ver pedido y pago",
    orderMissing: "No encontramos el acuerdo de esta petición. Puedes revisar todos tus pedidos.", orderError: "No pudimos consultar el pedido. Reintenta.", statusTitle: "Estado de la petición",
    actions: {
      discard: { label: "Descartar borrador", confirmation: "Este borrador dejará de estar en curso y pasará al historial. No borra otros borradores ni cancela pedidos o pagos.", done: "Borrador descartado. Puedes consultarlo en el historial." },
      withdraw: { label: "Retirar petición", confirmation: "Esta petición dejará de recibir nuevas propuestas y pasará al historial. Sus respuestas se conservan. No cancela pedidos ni pagos.", done: "Petición retirada. Sus respuestas se conservan en el historial." },
      close: { label: "Cerrar petición", confirmation: "Cerrarás la publicación y conservarás sus respuestas en el historial. El pedido elegido y su pago continúan en Mis pedidos; no se cancelan ni se marcan como entregados.", done: "Petición cerrada. El pedido y el pago siguen en Mis pedidos." },
      archive: { label: "Archivar petición", confirmation: "La ficha se conservará como archivada en tu historial. Los acuerdos, pedidos y pagos conservan su estado.", done: "Petición archivada. Los pedidos y pagos conservan su estado." },
    },
  },
  en: {
    active: "In progress", history: "History", emptyActive: "You have no requests in progress. Create one or view your history.", emptyHistory: "Withdrawn, closed and archived requests will appear here.",
    hint: "Withdrawing or archiving a request does not cancel orders or payments. Agreements continue in My orders.", cancel: "Go back", busy: "Updating…", error: "We could not update the request. Try again.", changed: "This request has changed. Refresh its details before continuing.", orders: "View order and payment", orderMissing: "We could not find this request’s agreement. You can review all your orders.", orderError: "We could not load the order. Try again.", statusTitle: "Request status",
    actions: {
      discard: { label: "Discard draft", confirmation: "This draft will move out of your active requests into history. This does not delete other drafts or cancel orders or payments.", done: "Draft discarded. You can view it in history." },
      withdraw: { label: "Withdraw request", confirmation: "This request will stop receiving new proposals and move into history. Replies are kept. Orders and payments are not canceled.", done: "Request withdrawn. Replies are kept in history." },
      close: { label: "Close request", confirmation: "The publication will close and its replies will remain in history. The chosen order and its payment continue in My orders; they are not canceled or marked as delivered.", done: "Request closed. The order and payment continue in My orders." },
      archive: { label: "Archive request", confirmation: "These details will be kept as archived in your history. Agreements, orders and payments keep their status.", done: "Request archived. Orders and payments keep their status." },
    },
  },
  fr: {
    active: "En cours", history: "Historique", emptyActive: "Vous n’avez aucune demande en cours. Créez-en une ou consultez l’historique.", emptyHistory: "Vos demandes retirées, clôturées et archivées apparaîtront ici.", hint: "Retirer ou archiver une demande n’annule ni les commandes ni les paiements. Les accords se poursuivent dans Mes commandes.", cancel: "Retour", busy: "Mise à jour…", error: "Impossible de mettre à jour la demande. Réessayez.", changed: "La demande a changé. Actualisez sa fiche avant de continuer.", orders: "Voir la commande et le paiement", orderMissing: "L’accord de cette demande est introuvable. Vous pouvez consulter toutes vos commandes.", orderError: "Impossible de consulter la commande. Réessayez.", statusTitle: "État de la demande",
    actions: {
      discard: { label: "Abandonner le brouillon", confirmation: "Ce brouillon quittera les demandes en cours et passera dans l’historique. Les autres brouillons, commandes et paiements restent inchangés.", done: "Brouillon abandonné. Il reste dans l’historique." },
      withdraw: { label: "Retirer la demande", confirmation: "La demande ne recevra plus de propositions et passera dans l’historique. Les réponses sont conservées. Les commandes et paiements ne sont pas annulés.", done: "Demande retirée. Les réponses restent dans l’historique." },
      close: { label: "Clôturer la demande", confirmation: "La publication sera clôturée et ses réponses conservées. La commande choisie et son paiement se poursuivent dans Mes commandes ; ils ne sont ni annulés ni marqués comme livrés.", done: "Demande clôturée. La commande et le paiement restent dans Mes commandes." },
      archive: { label: "Archiver la demande", confirmation: "La fiche restera archivée dans votre historique. Les accords, commandes et paiements conservent leur état.", done: "Demande archivée. Les commandes et paiements conservent leur état." },
    },
  },
  it: {
    active: "In corso", history: "Cronologia", emptyActive: "Non hai richieste in corso. Creane una o consulta la cronologia.", emptyHistory: "Qui troverai le richieste ritirate, chiuse e archiviate.", hint: "Ritirare o archiviare una richiesta non annulla ordini o pagamenti. Gli accordi continuano in I miei ordini.", cancel: "Indietro", busy: "Aggiornamento…", error: "Impossibile aggiornare la richiesta. Riprova.", changed: "La richiesta è cambiata. Aggiorna la scheda prima di continuare.", orders: "Vedi ordine e pagamento", orderMissing: "L’accordo di questa richiesta non è stato trovato. Puoi consultare tutti i tuoi ordini.", orderError: "Impossibile consultare l’ordine. Riprova.", statusTitle: "Stato della richiesta",
    actions: {
      discard: { label: "Scarta bozza", confirmation: "Questa bozza passerà dalle richieste in corso alla cronologia. Non elimina altre bozze né annulla ordini o pagamenti.", done: "Bozza scartata. Puoi consultarla nella cronologia." },
      withdraw: { label: "Ritira richiesta", confirmation: "La richiesta non riceverà nuove proposte e passerà alla cronologia. Le risposte vengono conservate. Ordini e pagamenti non vengono annullati.", done: "Richiesta ritirata. Le risposte restano nella cronologia." },
      close: { label: "Chiudi richiesta", confirmation: "La pubblicazione verrà chiusa e le risposte conservate. L’ordine scelto e il pagamento continuano in I miei ordini; non vengono annullati né segnati come consegnati.", done: "Richiesta chiusa. L’ordine e il pagamento restano in I miei ordini." },
      archive: { label: "Archivia richiesta", confirmation: "La scheda resterà archiviata nella cronologia. Accordi, ordini e pagamenti mantengono il loro stato.", done: "Richiesta archiviata. Ordini e pagamenti mantengono il loro stato." },
    },
  },
  zh: {
    active: "处理中", history: "历史记录", emptyActive: "目前没有处理中的需求。你可以创建需求或查看历史记录。", emptyHistory: "已撤回、结束和归档的需求会显示在这里。", hint: "撤回或归档需求不会取消订单或付款。协议继续在“我的订单”中处理。", cancel: "返回", busy: "更新中…", error: "无法更新需求，请重试。", changed: "需求已发生变化，请刷新详情后继续。", orders: "查看订单和付款", orderMissing: "未找到此需求的协议，你可以查看全部订单。", orderError: "无法查看订单，请重试。", statusTitle: "需求状态",
    actions: {
      discard: { label: "放弃草稿", confirmation: "此草稿将移至历史记录，不会删除其他草稿，也不会取消订单或付款。", done: "草稿已放弃，可在历史记录中查看。" },
      withdraw: { label: "撤回需求", confirmation: "此需求将不再接收新报价并移至历史记录。已有回复会保留，订单和付款不会取消。", done: "需求已撤回，回复保留在历史记录中。" },
      close: { label: "结束需求", confirmation: "需求发布将结束，回复会保留。所选订单和付款继续在“我的订单”中处理，不会被取消或标记为已送达。", done: "需求已结束，订单和付款继续在“我的订单”中处理。" },
      archive: { label: "归档需求", confirmation: "详情将归档至历史记录，协议、订单和付款状态保持不变。", done: "需求已归档，订单和付款状态保持不变。" },
    },
  },
  ar: {
    active: "قيد التنفيذ", history: "السجل", emptyActive: "ليس لديك طلبات قيد التنفيذ. أنشئ طلبًا أو راجع السجل.", emptyHistory: "ستظهر هنا طلباتك المسحوبة والمغلقة والمؤرشفة.", hint: "سحب الطلب أو أرشفته لا يلغي عمليات الشراء أو المدفوعات. تستمر الاتفاقات في مشترياتي.", cancel: "رجوع", busy: "جارٍ التحديث…", error: "تعذّر تحديث الطلب. حاول مجددًا.", changed: "تغيّر الطلب. حدّث التفاصيل قبل المتابعة.", orders: "عرض الشراء والدفع", orderMissing: "لم نعثر على اتفاق هذا الطلب. يمكنك مراجعة جميع مشترياتك.", orderError: "تعذّر عرض الشراء. حاول مجددًا.", statusTitle: "حالة الطلب",
    actions: {
      discard: { label: "استبعاد المسودة", confirmation: "ستنتقل هذه المسودة إلى السجل. لن تُحذف مسودات أخرى ولن تُلغى عمليات الشراء أو المدفوعات.", done: "تم استبعاد المسودة. يمكنك مراجعتها في السجل." },
      withdraw: { label: "سحب الطلب", confirmation: "لن يستقبل الطلب عروضًا جديدة وسينتقل إلى السجل. تُحفظ الردود ولا تُلغى عمليات الشراء أو المدفوعات.", done: "تم سحب الطلب. الردود محفوظة في السجل." },
      close: { label: "إغلاق الطلب", confirmation: "سيُغلق النشر مع حفظ الردود. تستمر عملية الشراء المختارة والدفع في مشترياتي؛ لن تُلغى ولن تُسجّل كمُسلّمة.", done: "تم إغلاق الطلب. يستمر الشراء والدفع في مشترياتي." },
      archive: { label: "أرشفة الطلب", confirmation: "ستبقى التفاصيل مؤرشفة في السجل. تحتفظ الاتفاقات وعمليات الشراء والمدفوعات بحالتها.", done: "تمت أرشفة الطلب. حالة عمليات الشراء والمدفوعات لم تتغير." },
    },
  },
};
