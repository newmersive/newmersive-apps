import type { AppLocale } from "../i18n";

const es = {
  withdraw: "Retirar propuesta", confirmTitle: "¿Retirar esta propuesta?",
  confirmBody: "El comprador ya no podrá elegirla. Se conservará en el historial. Los pedidos ya creados no se cancelan y una propuesta retirada no se puede reactivar.",
  cancel: "Volver", withdrawn: "Propuesta retirada", withdrawnBody: "Esta propuesta ya no se puede elegir ni actualizar. La conservamos como historial de esta lista.",
  unavailable: "Propuesta no disponible", unavailableBody: "Esta propuesta ya no admite cambios. Puedes consultar el historial y hablar con el comprador.",
  closed: "La lista ya no admite propuestas", closedBody: "Conservamos tu propuesta como historial. Los pedidos creados siguen disponibles en Pedidos.",
  orders: "Ver mis pedidos", expired: "Propuesta caducada", covered: "Incluye productos ya cubiertos",
  withdrawError: "No pudimos retirar la propuesta. Inténtalo de nuevo.", refreshError: "La propuesta se ha retirado. No pudimos actualizar la lista; vuelve a abrirla para ver el estado actual.",
};
type Copy = typeof es;
const copies: Record<AppLocale, Copy> = {
  es,
  en: { withdraw: "Withdraw proposal", confirmTitle: "Withdraw this proposal?", confirmBody: "The buyer will no longer be able to choose it. It will remain in the history. Existing orders are not canceled, and a withdrawn proposal cannot be reactivated.", cancel: "Back", withdrawn: "Proposal withdrawn", withdrawnBody: "This proposal can no longer be chosen or updated. It remains in this list's history.", unavailable: "Proposal unavailable", unavailableBody: "This proposal can no longer be changed. You can view its history and contact the buyer.", closed: "This list no longer accepts proposals", closedBody: "Your proposal remains in the history. Existing orders remain available in Orders.", orders: "View my orders", expired: "Proposal expired", covered: "Includes items already covered", withdrawError: "We couldn't withdraw the proposal. Try again.", refreshError: "The proposal was withdrawn. We couldn't refresh the list; reopen it to see its current status." },
  fr: { withdraw: "Retirer la proposition", confirmTitle: "Retirer cette proposition ?", confirmBody: "L'acheteur ne pourra plus la choisir. Elle restera dans l'historique. Les commandes existantes ne sont pas annulées et une proposition retirée ne peut pas être réactivée.", cancel: "Retour", withdrawn: "Proposition retirée", withdrawnBody: "Cette proposition ne peut plus être choisie ni modifiée. Elle reste dans l'historique de cette liste.", unavailable: "Proposition indisponible", unavailableBody: "Cette proposition ne peut plus être modifiée. Vous pouvez consulter l'historique et contacter l'acheteur.", closed: "Cette liste n'accepte plus de propositions", closedBody: "Votre proposition reste dans l'historique. Les commandes existantes restent accessibles dans Commandes.", orders: "Voir mes commandes", expired: "Proposition expirée", covered: "Contient des produits déjà couverts", withdrawError: "Impossible de retirer la proposition. Réessayez.", refreshError: "La proposition a été retirée. Impossible d'actualiser la liste ; rouvrez-la pour voir son état actuel." },
  it: { withdraw: "Ritira proposta", confirmTitle: "Ritirare questa proposta?", confirmBody: "L'acquirente non potrà più sceglierla. Resterà nella cronologia. Gli ordini esistenti non vengono annullati e una proposta ritirata non può essere riattivata.", cancel: "Indietro", withdrawn: "Proposta ritirata", withdrawnBody: "Questa proposta non può più essere scelta o aggiornata. Resta nella cronologia di questa lista.", unavailable: "Proposta non disponibile", unavailableBody: "Questa proposta non può più essere modificata. Puoi consultare la cronologia e contattare l'acquirente.", closed: "Questa lista non accetta più proposte", closedBody: "La proposta resta nella cronologia. Gli ordini esistenti sono disponibili in Ordini.", orders: "Vedi i miei ordini", expired: "Proposta scaduta", covered: "Include prodotti già coperti", withdrawError: "Impossibile ritirare la proposta. Riprova.", refreshError: "La proposta è stata ritirata. Impossibile aggiornare la lista: riaprila per vedere lo stato attuale." },
  zh: { withdraw: "撤回报价", confirmTitle: "撤回此报价？", confirmBody: "买家将无法再选择此报价。报价将保留在历史记录中。已有订单不会取消，已撤回的报价不能重新激活。", cancel: "返回", withdrawn: "报价已撤回", withdrawnBody: "此报价不能再被选择或修改，并保留在此清单的历史记录中。", unavailable: "报价不可用", unavailableBody: "此报价不能再修改。您可以查看历史记录并联系买家。", closed: "此清单不再接受报价", closedBody: "您的报价保留在历史记录中。已有订单仍可在“订单”中查看。", orders: "查看我的订单", expired: "报价已过期", covered: "包含已采购的商品", withdrawError: "无法撤回报价，请重试。", refreshError: "报价已撤回，但无法刷新清单。请重新打开以查看当前状态。" },
  ar: { withdraw: "سحب العرض", confirmTitle: "هل تريد سحب هذا العرض؟", confirmBody: "لن يتمكن المشتري من اختياره بعد الآن. سيبقى في السجل. لن تُلغى الطلبات القائمة ولا يمكن إعادة تفعيل العرض المسحوب.", cancel: "رجوع", withdrawn: "تم سحب العرض", withdrawnBody: "لم يعد من الممكن اختيار هذا العرض أو تعديله. سيبقى في سجل هذه القائمة.", unavailable: "العرض غير متاح", unavailableBody: "لم يعد هذا العرض يقبل التغييرات. يمكنك مراجعة السجل والتواصل مع المشتري.", closed: "هذه القائمة لم تعد تقبل العروض", closedBody: "يبقى عرضك في السجل. تظل الطلبات القائمة متاحة في الطلبات.", orders: "عرض طلباتي", expired: "انتهت صلاحية العرض", covered: "يتضمن منتجات تم توفيرها بالفعل", withdrawError: "تعذر سحب العرض. حاول مرة أخرى.", refreshError: "تم سحب العرض. تعذر تحديث القائمة؛ افتحها مجددًا لرؤية حالتها الحالية." },
};

const orderMessages: Record<AppLocale, { ordersError: string; multipleOrders: string }> = {
  es: { ordersError: "No pudimos localizar el acuerdo de esta propuesta. Vuelve a intentarlo para abrir tus pedidos.", multipleOrders: "Esta propuesta está relacionada con varios acuerdos. Abriremos tus pedidos para que puedas elegir el que quieres consultar." },
  en: { ordersError: "We couldn't find the agreement for this proposal. Try again to open your orders.", multipleOrders: "This proposal is associated with several agreements. We'll open your orders so you can choose which one to view." },
  fr: { ordersError: "Impossible de trouver l'accord de cette proposition. Réessayez pour ouvrir vos commandes.", multipleOrders: "Cette proposition est liée à plusieurs accords. Nous ouvrirons vos commandes pour que vous puissiez choisir celui à consulter." },
  it: { ordersError: "Impossibile trovare l'accordo di questa proposta. Riprova per aprire i tuoi ordini.", multipleOrders: "Questa proposta è associata a più accordi. Apriremo i tuoi ordini per scegliere quello da consultare." },
  zh: { ordersError: "无法找到此报价对应的协议。请重试以打开您的订单。", multipleOrders: "此报价对应多份协议。我们将打开您的订单，以便您选择需要查看的协议。" },
  ar: { ordersError: "تعذر العثور على اتفاق هذا العرض. حاول مجددًا لفتح طلباتك.", multipleOrders: "يرتبط هذا العرض بعدة اتفاقات. سنفتح طلباتك لتختار الاتفاق الذي تريد مراجعته." },
};

const historyLabels: Record<AppLocale, string> = { es: "Ver historial", en: "View history", fr: "Voir l'historique", it: "Vedi cronologia", zh: "查看历史记录", ar: "عرض السجل" };

export function shoppingProposalCopy(locale: AppLocale) { return { ...(copies[locale] || es), ...(orderMessages[locale] || orderMessages.es), viewHistory: historyLabels[locale] || historyLabels.es }; }

const conflictMessages: Record<AppLocale, { locked: string; changed: string }> = {
  es: { locked: "Esta propuesta ya tiene un acuerdo o pedido. No se puede retirar ni modificar; consulta tus pedidos.", changed: "La propuesta ha cambiado desde que la abriste. Revisa su estado actual antes de volver a intentarlo." },
  en: { locked: "This proposal already has an agreement or order. It cannot be withdrawn or changed; view your orders.", changed: "The proposal has changed since you opened it. Check its current status before trying again." },
  fr: { locked: "Cette proposition a déjà un accord ou une commande. Elle ne peut pas être retirée ni modifiée ; consultez vos commandes.", changed: "La proposition a changé depuis son ouverture. Vérifiez son état actuel avant de réessayer." },
  it: { locked: "Questa proposta ha già un accordo o un ordine. Non può essere ritirata o modificata: consulta i tuoi ordini.", changed: "La proposta è cambiata da quando l'hai aperta. Controlla lo stato attuale prima di riprovare." },
  zh: { locked: "此报价已有协议或订单，不能撤回或修改。请查看您的订单。", changed: "此报价在您打开后发生了变化。请检查当前状态后重试。" },
  ar: { locked: "لهذا العرض اتفاق أو طلب قائم. لا يمكن سحبه أو تعديله؛ راجع طلباتك.", changed: "تغير العرض منذ فتحه. راجع حالته الحالية قبل المحاولة مجددًا." },
};

export function shoppingProposalFailure(locale: AppLocale, error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const conflict = conflictMessages[locale] || conflictMessages.es;
  const copy = shoppingProposalCopy(locale);
  if (["PROPOSAL_LOCKED", "OFFER_TERMS_LOCKED", "SHOPPING_LIST_PROPOSAL_ALREADY_SELECTED"].includes(message)) return conflict.locked;
  if (message === "OFFER_VERSION_CONFLICT") return conflict.changed;
  if (message === "PROPOSAL_WITHDRAWN") return copy.withdrawnBody;
  if (["PROPOSAL_NOT_EDITABLE", "OFFER_CLOSED", "OFFER_NOT_AVAILABLE"].includes(message)) return copy.unavailableBody;
  return message || fallback;
}
