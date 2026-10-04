import AsyncStorage from "@react-native-async-storage/async-storage";

export type PendingJourney = { name: string; params?: Record<string, unknown> };
const storageKey = "allwain:pending-journey:v1";
const lifetime = 30 * 60 * 1000;
let tail: Promise<unknown> = Promise.resolve();
const id = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : undefined;

export function safeJourney(route: unknown): PendingJourney | null {
  if (!route || typeof route !== "object") return null;
  const { name, params: raw } = route as PendingJourney;
  const params = raw && typeof raw === "object" ? raw : {};
  if (["ManualRequest", "MyRequests", "Search", "Notifications", "ChatList", "ActivateConnector"].includes(name)) return { name };
  if (name === "Scan") return { name, ...(params.returnTo === "shopping-list" ? { params: { returnTo: "shopping-list" } } : {}) };
  if (name === "ScanResult") return id(params.requestId) ? { name, params: { requestId: id(params.requestId) } } : { name: "ManualRequest" };
  if (name === "ShoppingLists") return { name, params: { ...(id(params.shoppingListId) ? { shoppingListId: id(params.shoppingListId) } : {}), ...(params.mode === "buy" || params.mode === "sell" ? { mode: params.mode } : {}), ...(params.create === true ? { create: true } : {}) } };
  if (name === "ActivateSeller") return { name, params: { ...(id(params.requestId) ? { requestId: id(params.requestId) } : {}), ...(id(params.shoppingListId) ? { shoppingListId: id(params.shoppingListId) } : {}) } };
  if (name === "ChatThread") return id(params.conversationId) ? { name, params: { conversationId: id(params.conversationId) } } : null;
  if (name === "MainTabs") return safeJourney({ name: params.screen, params: params.params });
  if (["Inicio", "Ofertas", "Demandas", "ProgramaRecomendados", "GuiaIA", "Perfil"].includes(name)) {
    const clean: Record<string, unknown> = {};
    if (name === "Ofertas") {
      for (const field of ["offerId", "contractId", "orderId", "requestId", "deliveryId"]) if (id(params[field])) clean[field] = id(params[field]);
      if (["orders", "offers", "preparation"].includes(String(params.section))) clean.section = params.section;
    }
    return { name: "MainTabs", params: { screen: name, ...(Object.keys(clean).length ? { params: clean } : {}) } };
  }
  return null;
}

export function journeyFromUrl(value: string | null | undefined): PendingJourney | null {
  if (!value || value.length > 2048 || /[\\\u0000-\u001f]/.test(value)) return null;
  try {
    const internal = value.startsWith("/") && !value.startsWith("//");
    const url = new URL(value, "https://allwain.es");
    const native = url.protocol === "allwain:";
    if (url.username || url.password) return null;
    if (!internal && !native && (url.protocol !== "https:" || url.hostname !== "allwain.es" || url.port || url.username || url.password)) return null;
    const path = native ? `/${url.hostname}${url.pathname}` : url.pathname;
    const segment = path.replace(/^\/app\/?/, "/").replace(/^\/|\/$/g, "");
    const names: Record<string, string> = { inicio: "Inicio", ofertas: "Ofertas", demandas: "Demandas", perfil: "Perfil", "mi-red": "ProgramaRecomendados", ayuda: "GuiaIA", pedir: "ManualRequest", "mis-peticiones": "MyRequests", buscar: "Search", avisos: "Notifications", listas: "ShoppingLists", mensajes: "ChatList", conversacion: "ChatThread", capturar: "Scan", peticion: "ScanResult", "activar-vendedor": "ActivateSeller", "activar-conector": "ActivateConnector" };
    if (!names[segment]) return null;
    const params: Record<string, unknown> = {};
    for (const field of ["offerId", "contractId", "orderId", "requestId", "deliveryId", "shoppingListId", "conversationId", "section", "mode"]) if (url.searchParams.has(field)) params[field] = url.searchParams.get(field);
    if (url.searchParams.get("create") === "true") params.create = true;
    return safeJourney({ name: names[segment], params });
  } catch { return null; }
}

export async function rememberPendingJourney(route: unknown, accountId?: string): Promise<void> {
  const safe = safeJourney(route);
  if (!safe) return;
  const task = tail.catch(() => undefined).then(() => AsyncStorage.setItem(storageKey, JSON.stringify({ route: safe, accountId: accountId || null, expiresAt: Date.now() + lifetime })));
  tail = task;
  await task.catch(() => undefined);
}

export async function consumePendingJourney(accountId: string): Promise<PendingJourney | null> {
  await tail.catch(() => undefined);
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    await AsyncStorage.removeItem(storageKey);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now() || (entry.accountId && entry.accountId !== accountId)) return null;
    return safeJourney(entry.route);
  } catch { return null; }
}
