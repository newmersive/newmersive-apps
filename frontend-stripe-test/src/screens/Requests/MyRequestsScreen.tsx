import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { apiAuthGet, apiAuthPatch, type AllwainScanRequest } from "../../config/api";
import { BigActionButton, ProductCard, PublicationImage } from "../../components/design-system";
import { useAuthStore } from "../../store/auth.store";
import { requestCopy } from "../../i18n/requestCopy";
import { buyerRequestLifecycleCopy } from "../../i18n/buyerRequestLifecycleCopy";
import { isRtlLocale } from "../../i18n";
import { colors } from "../../theme/colors";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { AppAlert } from "../../utils/appAlert";
import {
  existingRequestContract, hasRequestOrder, requestIsInScope, requestPublicationAction,
  requestsPageUrl, transitionRequestPublication,
  requestStatuses,
  type RequestPublicationAction, type RequestScope,
} from "../../utils/requestLifecycle";
import DiscoveryFilters, { REQUEST_DISCOVERY_FIELDS } from "../../components/DiscoveryFilters";
import { discoveryPageUrl, discoveryQueryKey, useDiscoveryQuery } from "../../utils/discoveryFilters";
import { captureAuthSession } from "../../store/authSessionBridge";

export default function MyRequestsScreen() {
  const { t } = useAppTranslation();
  const navigation = useNavigation<any>();
  const userId = useAuthStore(state => state.user?.id);
  const locale = useAuthStore(state => state.locale);
  const copy = requestCopy[locale];
  const lifecycle = buyerRequestLifecycleCopy[locale];
  const revision = useRef(0);
  const view = useRef({ generation: 0, focused: false });
  const operation = useRef<string | null>(null);
  const [scope, setScope] = useState<RequestScope>("active");
  const { query, setQuery, ready } = useDiscoveryQuery(userId, `my-requests:${scope}`);
  const appMode = useAuthStore(state => state.appMode);
  const queryKey = `${userId || ""}:${appMode}:${scope}:${discoveryQueryKey(query)}`;
  const currentQueryKey = useRef(queryKey); currentQueryKey.current = queryKey;
  const [resultsKey, setResultsKey] = useState("");
  const failedCursor = useRef<string | undefined>(undefined);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [items, setItems] = useState<AllwainScanRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failedOrder, setFailedOrder] = useState<AllwainScanRequest | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const load = useCallback(async (next?: string) => {
    if (!ready) return;
    const requestRevision = ++revision.current;
    const generation = view.current.generation;
    const session = captureAuthSession();
    const current = () => view.current.focused && generation === view.current.generation &&
      requestRevision === revision.current && currentScope.current === scope &&
      Boolean(userId) && useAuthStore.getState().user?.id === userId && session.isCurrent() && currentQueryKey.current === queryKey;
    if (!current()) return;
    setLoading(true); setError(null); setFailedOrder(null); failedCursor.current = undefined;
    if (!next) { setItems([]); setCursor(null); setResultsKey(""); }
    try {
      const statuses = requestStatuses(scope);
      const status = statuses.includes(query.status as AllwainScanRequest["status"]) ? query.status : statuses.join(",");
      const result = await apiAuthGet<{ items?: AllwainScanRequest[]; pageInfo?: { nextCursor?: string } }>(
        discoveryPageUrl("/allwain/scan-requests", query, { fixed: { status }, cursor: next, allowed: REQUEST_DISCOVERY_FIELDS }),
      );
      if (!current()) return;
      if (result.items?.some(item => item.userId && item.userId !== userId)) throw new Error("REQUEST_OWNER_MISMATCH");
      setItems(previous => next ? [...new Map([...previous, ...(result.items || [])].map(item => [item.id, item])).values()] : result.items || []);
      setResultsKey(queryKey);
      setCursor(result.pageInfo?.nextCursor || null);
    } catch (e: any) { if (current()) { if (/CURSOR/i.test(String(e?.code || e?.message || ""))) { setItems([]); setResultsKey(""); setCursor(null); } else failedCursor.current = next; setError(copy.error); } }
    finally { if (current()) setLoading(false); }
  }, [userId, scope, copy.error, queryKey, ready]);
  useFocusEffect(useCallback(() => {
    view.current.focused = true; view.current.generation++;
    operation.current = null; setBusyId(null); setNotice(null); setFailedOrder(null);
    void load();
    return () => { view.current.focused = false; view.current.generation++; revision.current++; };
  }, [load]));

  function confirmationIsCurrent(accountId: string, generation: number, selectedScope: RequestScope, selectedQuery: string) {
    return view.current.focused && view.current.generation === generation && currentScope.current === selectedScope &&
      useAuthStore.getState().user?.id === accountId && currentQueryKey.current === selectedQuery;
  }

  function confirmAction(item: AllwainScanRequest, action: RequestPublicationAction) {
    if (!userId || operation.current) return;
    const accountId = userId, generation = view.current.generation, selectedScope = scope;
    const session = captureAuthSession();
    const isCurrent = () => session.isCurrent() && confirmationIsCurrent(accountId, generation, selectedScope, queryKey);
    if (!isCurrent()) return;
    AppAlert.alert(lifecycle.actions[action].label, lifecycle.actions[action].confirmation, [
      { text: lifecycle.cancel, style: "cancel" },
      { text: lifecycle.actions[action].label, style: action === "discard" || action === "withdraw" ? "destructive" : "default", onPress: () => {
        if (!isCurrent() || operation.current) return;
        const key = `${item.id}:${generation}`;
        revision.current++; setLoading(false);
        operation.current = key; setBusyId(item.id); setError(null); setNotice(null); setFailedOrder(null);
        void (async () => {
          try {
            const updated = await transitionRequestPublication(item, action, {
              accountId, isCurrent,
              read: id => apiAuthGet<AllwainScanRequest>(`/allwain/scan-requests/${encodeURIComponent(id)}`),
              patch: (id, status) => apiAuthPatch<AllwainScanRequest>(`/allwain/scan-requests/${encodeURIComponent(id)}`, { status }),
            });
            if (!updated || !isCurrent()) return;
            setNotice(lifecycle.actions[action].done);
            if (requestIsInScope(updated, selectedScope) && (!query.status || query.status === updated.status)) {
              // Archiving in history keeps this card and the already loaded
              // pages in place, so an older request does not disappear on edit.
              setItems(previous => previous.map(value => value.id === updated.id ? updated : value));
            } else setItems(previous => previous.filter(value => value.id !== updated.id));
          } catch (err: any) {
            if (isCurrent()) setError(err?.message === "REQUEST_PUBLICATION_CHANGED" ? lifecycle.changed : lifecycle.error);
          } finally {
            if (operation.current === key) operation.current = null;
            if (isCurrent()) setBusyId(null);
          }
        })();
      } },
    ]);
  }

  async function openOrder(item: AllwainScanRequest) {
    if (!userId || operation.current) return;
    const accountId = userId, generation = view.current.generation, selectedScope = scope;
    const session = captureAuthSession();
    const isCurrent = () => session.isCurrent() && confirmationIsCurrent(accountId, generation, selectedScope, queryKey);
    if (!isCurrent()) return;
    const key = `order:${item.id}:${generation}`;
    operation.current = key; setBusyId(item.id); setError(null); setFailedOrder(null);
    try {
      const contractId = await existingRequestContract(item, accountId, isCurrent, url => apiAuthGet(url));
      if (!isCurrent()) return;
      if (!contractId) { setError(lifecycle.orderMissing); setFailedOrder(item); return; }
      await useAuthStore.getState().setAppMode("buy");
      if (!isCurrent()) return;
      navigation.navigate("MainTabs", { screen: "Ofertas", params: { section: "orders", contractId, focusKey: String(Date.now()) } });
    } catch { if (isCurrent()) { setError(lifecycle.orderError); setFailedOrder(item); } }
    finally {
      if (operation.current === key) operation.current = null;
      if (isCurrent()) setBusyId(null);
    }
  }

  return <FlatList style={{ flex: 1, backgroundColor: colors.background, direction: isRtlLocale(locale) ? "rtl" : "ltr" }} contentContainerStyle={styles.content} data={resultsKey === queryKey ? items : []} keyExtractor={item => item.id}
    ListHeaderComponent={<View style={styles.header}>
      <Text style={styles.intro}>{copy.intro}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate("ManualRequest")} style={styles.create}><Text style={styles.createText}>{copy.create}</Text></TouchableOpacity>
      <View style={styles.scopes}>{(["active", "history"] as const).map(value => <TouchableOpacity key={value} accessibilityRole="tab" accessibilityState={{ selected: scope === value, disabled: Boolean(busyId) }} disabled={Boolean(busyId)} onPress={() => setScope(value)} style={[styles.scope, scope === value && styles.scopeSelected, busyId && styles.disabled]}><Text style={[styles.scopeText, scope === value && styles.scopeTextSelected]}>{lifecycle[value]}</Text></TouchableOpacity>)}</View>
      <Text style={styles.hint}>{lifecycle.hint}</Text>
      <DiscoveryFilters value={query} onApply={setQuery} kind="requests" statuses={requestStatuses(scope).map(value => ({ value, label: copy.states[value] || value }))} disabled={Boolean(busyId) || !ready} />
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>}
    renderItem={({ item }) => {
      const action = requestPublicationAction(item);
      return <View style={styles.request}>
        <ProductCard title={item.extracted?.productName || item.title || copy.request} meta={item.extracted?.quantity ? `${item.extracted.quantity} ${item.extracted.unit || ""}` : copy.details} status={copy.states[item.status] || copy.states.draft} actionLabel={copy.open} onPress={() => { if (userId && confirmationIsCurrent(userId, view.current.generation, scope, queryKey)) navigation.navigate("ScanResult", { requestId: item.id }); }} leading={<PublicationImage imageUrl={item.imageMeta?.url} imageAlt={item.title} />} leadingVariant="image" />
        {action || hasRequestOrder(item) ? <View style={styles.actions}>
          {hasRequestOrder(item) ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${lifecycle.orders}: ${item.extracted?.productName || item.title}`} accessibilityState={{ disabled: Boolean(busyId) }} disabled={Boolean(busyId)} onPress={() => void openOrder(item)} style={[styles.action, busyId && styles.disabled]}><Text style={styles.orderText}>{busyId === item.id ? lifecycle.busy : lifecycle.orders}</Text></TouchableOpacity> : null}
          {action ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${lifecycle.actions[action].label}: ${item.extracted?.productName || item.title}`} accessibilityState={{ disabled: Boolean(busyId) }} disabled={Boolean(busyId)} onPress={() => confirmAction(item, action)} style={[styles.action, busyId && styles.disabled]}><Text style={styles.actionText}>{busyId === item.id ? lifecycle.busy : lifecycle.actions[action].label}</Text></TouchableOpacity> : null}
        </View> : null}
      </View>;
    }}
    ListEmptyComponent={ready && resultsKey === queryKey && !loading && !error ? <Text style={styles.hint}>{scope === "active" ? lifecycle.emptyActive : lifecycle.emptyHistory}</Text> : null}
    ListFooterComponent={loading ? <ActivityIndicator color={colors.primary} /> : <BigActionButton tone="light" label={error ? t("common.retry") : cursor ? copy.more : copy.refresh} disabled={Boolean(busyId) || !ready} onPress={() => error && failedOrder ? void openOrder(failedOrder) : void load(error ? failedCursor.current : cursor || undefined)} />} />;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 12, width: "100%", maxWidth: 720, alignSelf: "center" },
  header: { gap: 12, paddingBottom: 6 }, intro: { color: colors.text, lineHeight: 22 },
  create: { minHeight: 48, justifyContent: "center", padding: 14, backgroundColor: colors.primary, borderRadius: 12 },
  createText: { color: colors.text, fontWeight: "700" },
  scopes: { flexDirection: "row", gap: 8 }, scope: { flex: 1, minHeight: 48, justifyContent: "center", alignItems: "center", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.card },
  scopeSelected: { borderColor: colors.primary, backgroundColor: colors.highlight }, scopeText: { color: colors.mutedText, fontWeight: "700", textAlign: "center" }, scopeTextSelected: { color: colors.text },
  hint: { color: colors.mutedText, lineHeight: 20 }, request: { gap: 6 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { flexGrow: 1, minHeight: 48, justifyContent: "center", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.card },
  actionText: { color: colors.mutedText, fontWeight: "700", textAlign: "center" }, orderText: { color: colors.primary, fontWeight: "800", textAlign: "center" },
  error: { color: colors.danger, lineHeight: 20 }, notice: { color: colors.success, lineHeight: 20 }, disabled: { opacity: 0.55 },
});

