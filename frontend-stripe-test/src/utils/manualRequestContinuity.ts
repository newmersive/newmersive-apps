import { clearJourneyDraftChecked, readJourneyDraftChecked, writeJourneyDraft } from "./journeyDrafts";
import { allwainWebAppReturnUrl } from "./webAppUrl";

export interface ManualRequestDraft { requestText: string; creationKey?: string; submittedText?: string; requestId?: string }
const operation = "manual-request";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifier = /^[a-zA-Z0-9_-]{1,128}$/;
const tails = new Map<string, Promise<unknown>>();
function serialized<T>(accountId: string, run: () => Promise<T>) {
  const work = (tails.get(accountId) || Promise.resolve()).catch(() => undefined).then(run);
  tails.set(accountId, work);
  void work.finally(() => { if (tails.get(accountId) === work) tails.delete(accountId); }).catch(() => undefined);
  return work;
}
export function normalizeManualRequestDraft(value: ManualRequestDraft | null | undefined): ManualRequestDraft | null {
  if (!value || typeof value.requestText !== "string") return null;
  const requestText = value.requestText.slice(0, 1000);
  const requestId = typeof value.requestId === "string" && identifier.test(value.requestId) ? value.requestId : undefined;
  const creationKey = typeof value.creationKey === "string" && uuid.test(value.creationKey) ? value.creationKey : undefined;
  const submittedText = creationKey && typeof value.submittedText === "string" && value.submittedText.trim().length >= 2 ? value.submittedText.trim().slice(0, 1000) : undefined;
  if (!requestText.trim() && !requestId) return null;
  return { requestText, ...(requestId ? { requestId } : {}), ...(creationKey && submittedText ? { creationKey, submittedText } : {}) };
}
export function readManualRequestDraft(accountId: string) {
  return serialized(accountId, async () => {
    const read = await readJourneyDraftChecked<ManualRequestDraft>(accountId, operation);
    if (read.status === "failed" || read.status === "blocked") throw new Error("MANUAL_DRAFT_READ_FAILED");
    return normalizeManualRequestDraft(read.value);
  });
}
export function saveManualRequestDraft(accountId: string, draft: ManualRequestDraft, current: () => boolean) {
  return serialized(accountId, async () => {
    if (!current()) return false;
    return writeJourneyDraft(accountId, operation, draft);
  });
}
export function clearManualRequestDraft(accountId: string, current: () => boolean) {
  return serialized(accountId, async () => current() ? clearJourneyDraftChecked(accountId, operation) : false);
}
/** Only a matching server identity may clear the local continuation. Text equality
 * is insufficient: another draft can legitimately have exactly the same text. */
export function finishManualRequestDraft(accountId: string, requestId: string, current: () => boolean) {
  return serialized(accountId, async () => {
    if (!current()) return false;
    const read = await readJourneyDraftChecked<ManualRequestDraft>(accountId, operation);
    if (read.status === "failed" || read.status === "blocked") return false;
    const draft = normalizeManualRequestDraft(read.value);
    if (!current() || draft?.requestId !== requestId) return false;
    return clearJourneyDraftChecked(accountId, operation);
  });
}
export function requestCardReturnUrl(requestId: string, platform: string, location?: Parameters<typeof allwainWebAppReturnUrl>[0]) {
  if (!identifier.test(requestId)) throw new Error("INVALID_REQUEST_RETURN_ID");
  const web = platform === "web" ? allwainWebAppReturnUrl(location) : null;
  if (platform === "web" && !web) throw new Error("REQUEST_RETURN_UNAVAILABLE");
  return `${web ? `${web.replace(/\/$/, "")}/peticion` : "allwain://peticion"}?requestId=${encodeURIComponent(requestId)}`;
}
