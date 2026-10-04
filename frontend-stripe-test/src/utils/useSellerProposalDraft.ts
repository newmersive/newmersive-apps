import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AllwainShoppingList } from "../config/api";
import { captureAuthSession } from "../store/authSessionBridge";
import {
  clearSellerProposalDraft, initialSellerProposalForm, makeSellerProposalDraft, readSellerProposalDraft,
  reconcileSellerProposalDraft, sellerProposalFingerprint, sellerProposalStamp, writeSellerProposalDraft,
  type SellerProposalDraft, type SellerProposalForm,
} from "./sellerProposalDraft";

export type SellerDraftNotice = "recovered" | "changed" | "saved" | "discarded" | null;
export function useSellerProposalDraft(accountId: string, list: AllwainShoppingList, isCurrentScope: () => boolean) {
  const rendered = captureAuthSession();
  const session = useMemo(() => rendered, [rendered.owner, rendered.generation]);
  const identity = `${accountId}:${list.id}:${session.generation}`;
  const source = `${sellerProposalFingerprint(list)}:${sellerProposalStamp(list.myProposal)}`;
  const key = `${identity}:${source}`;
  const liveKey = useRef(key); liveKey.current = key;
  const mounted = useRef(true), epoch = useRef(0), edits = useRef(0);
  const memory = useRef<{ identity: string; draft: SellerProposalDraft } | null>(null);
  const liveList = useRef(list); liveList.current = list;
  const formRef = useRef(initialSellerProposalForm(list));
  const reviewRef = useRef(false), dirty = useRef(false), suspended = useRef(false), readyRef = useRef(false);
  const [form, setForm] = useState(() => formRef.current);
  const [loadedKey, setLoadedKey] = useState("");
  const [requiresReview, setRequiresReview] = useState(false);
  const [notice, setNotice] = useState<SellerDraftNotice>(null);
  const [storageError, setStorageError] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const current = useCallback(() => mounted.current && session.isCurrent() && isCurrentScope() && Boolean(accountId) && liveKey.current === key, [session, isCurrentScope, accountId, key]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; edits.current++; }; }, []);

  const recover = useCallback(async () => {
    if (!current()) return;
    const revision = ++epoch.current;
    const valid = () => current() && epoch.current === revision;
    readyRef.current = false; suspended.current = false;
    setRecovering(true); setStorageError(false); setLoadedKey("");
    try {
      const existing = memory.current?.identity === identity ? memory.current.draft : null;
      const read = existing ? { draft: existing, storageError: false } : await readSellerProposalDraft(accountId, list.id, list.version, valid);
      if (!valid()) return;
      if (read.storageError) { setStorageError(true); return; }
      const reconciled = read.draft ? reconcileSellerProposalDraft(read.draft, accountId, list) : null;
      if (read.draft && !reconciled) { setStorageError(true); return; }
      const restored = reconciled?.draft || makeSellerProposalDraft(accountId, list, initialSellerProposalForm(list));
      formRef.current = restored.form; reviewRef.current = restored.requiresReview;
      memory.current = { identity, draft: restored };
      dirty.current = Boolean(reconciled?.changed); readyRef.current = true;
      setForm(restored.form); setRequiresReview(restored.requiresReview); setLoadedKey(key);
      setNotice(reconciled?.changed || restored.requiresReview ? "changed" : read.draft ? "recovered" : null);
    } catch { if (valid()) setStorageError(true); }
    finally { if (valid()) setRecovering(false); }
  }, [current, identity, accountId, key, list]);

  useLayoutEffect(() => {
    epoch.current++; edits.current++; readyRef.current = false;
    if (memory.current?.identity !== identity) { memory.current = null; dirty.current = false; formRef.current = initialSellerProposalForm(list); setForm(formRef.current); setRequiresReview(false); setNotice(null); }
    void recover();
  }, [identity, source, session]);

  const save = useCallback(async () => {
    if (!current() || !readyRef.current || suspended.current) return false;
    if (!dirty.current) return true;
    const revision = edits.current;
    const valid = () => current() && revision === edits.current && !suspended.current;
    const draft = makeSellerProposalDraft(accountId, liveList.current, formRef.current, reviewRef.current);
    const saved = await writeSellerProposalDraft(draft, valid).catch(() => false);
    if (!valid()) return false;
    if (saved) { dirty.current = false; memory.current = { identity, draft }; setNotice(reviewRef.current ? "changed" : "saved"); setStorageError(false); }
    else setStorageError(true);
    return saved;
  }, [current, accountId, identity]);

  const update = useCallback((change: (value: SellerProposalForm) => SellerProposalForm) => {
    if (!current() || !readyRef.current || suspended.current) return;
    edits.current++; dirty.current = true;
    formRef.current = change(formRef.current);
    memory.current = { identity, draft: makeSellerProposalDraft(accountId, liveList.current, formRef.current, reviewRef.current) };
    setForm(formRef.current); setNotice(reviewRef.current ? "changed" : null);
  }, [current, accountId, identity]);

  const acknowledge = useCallback(() => {
    if (!current() || !readyRef.current || suspended.current) return;
    edits.current++; dirty.current = true; reviewRef.current = false; setRequiresReview(false); setNotice(null);
    memory.current = { identity, draft: makeSellerProposalDraft(accountId, liveList.current, formRef.current, false) };
  }, [current, accountId, identity]);

  const discard = useCallback(async (confirmed = false) => {
    if (!current()) return false;
    edits.current++; suspended.current = true;
    const removed = await clearSellerProposalDraft(accountId, list.id, list.version, current).catch(() => false);
    if (!current()) return false;
    if (!removed) { setStorageError(true); if (!confirmed) suspended.current = false; return false; }
    dirty.current = false; reviewRef.current = false; memory.current = null;
    setStorageError(false); setRequiresReview(false); setNotice(confirmed ? null : "discarded");
    if (!confirmed) { suspended.current = false; readyRef.current = true; setLoadedKey(key); formRef.current = initialSellerProposalForm(liveList.current); setForm(formRef.current); }
    return true;
  }, [current, accountId, list.id, list.version]);

  useEffect(() => {
    if (loadedKey !== key || !dirty.current || suspended.current) return;
    const timer = setTimeout(() => { void save(); }, 250);
    return () => clearTimeout(timer);
  }, [form, requiresReview, loadedKey, key, save]);
  return { form, update, ready: loadedKey === key && readyRef.current, recovering, requiresReview, notice, storageError, recover, save, discard, acknowledge };
}
