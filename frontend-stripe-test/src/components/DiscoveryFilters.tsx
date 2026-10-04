import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Search, SlidersHorizontal, X } from "lucide-react-native";
import { apiAuthGet } from "../config/api";
import { useAuthStore } from "../store/auth.store";
import { useAppTranslation } from "../i18n/useAppTranslation";
import { discoveryFilterCopy, discoveryOrderFilterCopy, discoveryTaxonomyCopy } from "../i18n/discoveryFilterCopy";
import { colors } from "../theme/colors";
import { BigActionButton } from "./design-system";
import { EMPTY_DISCOVERY_QUERY, discoveryQueryValidation, normalizeDiscoveryQuery, type DiscoveryQuery } from "../utils/discoveryFilters";

type Option = string | { value: string; label?: string };
type DiscoveryOptions = {
  categories: { value: string; label?: string; subcategories?: Option[] }[];
  productKinds: Option[]; units: Option[]; currencies: Option[];
};
export const CATALOG_DISCOVERY_FIELDS = ["q", "category", "subcategory", "productKind", "unit", "currency", "minPrice", "maxPrice", "locationLabel", "dateFrom", "dateTo", "sort"];
export const REQUEST_DISCOVERY_FIELDS = [...CATALOG_DISCOVERY_FIELDS.filter(key => key !== "sort"), "status", "latitude", "longitude", "radiusKm"];
export const ORDER_DISCOVERY_FIELDS = ["q", "contractStatus", "paymentStatus", "fulfillmentStatus", "dateFrom", "dateTo", "deliveryChannel"];
const optionValue = (option: Option) => typeof option === "string" ? option : option.value;
const readable = (value: string) => value.replace(/[_-]/g, " ");

// Requested only by the explicit location button. A search position is never a
// delivery address and is kept in memory rather than persisted with filters.
async function getSearchPosition() {
  if (Platform.OS === "web") {
    const geolocation = (globalThis as any).navigator?.geolocation;
    if (!geolocation) throw new Error("LOCATION_UNAVAILABLE");
    return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => geolocation.getCurrentPosition(
      (position: GeolocationPosition) => resolve({ latitude: Math.round(position.coords.latitude * 1000) / 1000, longitude: Math.round(position.coords.longitude * 1000) / 1000 }),
      reject, { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 },
    ));
  }
  const Location = await import("expo-location");
  if ((await Location.requestForegroundPermissionsAsync()).status !== "granted") throw new Error("LOCATION_DENIED");
  const position = await new Promise<import("expo-location").LocationObject>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("LOCATION_TIMEOUT")), 16000);
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(value => { clearTimeout(timeout); resolve(value); }, error => { clearTimeout(timeout); reject(error); });
  });
  return { latitude: Math.round(position.coords.latitude * 1000) / 1000, longitude: Math.round(position.coords.longitude * 1000) / 1000 };
}

export default function DiscoveryFilters({ value, onApply, kind, statuses, disabled, allowed, extra, extraSummary }: {
  value: DiscoveryQuery; onApply: (query: DiscoveryQuery) => void; kind: "catalog" | "requests" | "orders";
  statuses?: { value: string; label: string }[]; disabled?: boolean; allowed?: string[];
  extra?: (draft: DiscoveryQuery, setDraft: React.Dispatch<React.SetStateAction<DiscoveryQuery>>) => React.ReactNode;
  extraSummary?: (value: DiscoveryQuery) => string[];
}) {
  const { locale } = useAppTranslation(), copy = discoveryFilterCopy[locale];
  const orderCopy = discoveryOrderFilterCopy[locale];
  const taxonomy = discoveryTaxonomyCopy[locale], kindNames = { ...copy.kinds, ...taxonomy.kinds };
  const accountId = useAuthStore(state => state.user?.id);
  const [queryText, setQueryText] = useState(value.q);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(value);
  const [options, setOptions] = useState<DiscoveryOptions | null>(null), [optionsError, setOptionsError] = useState(false), [optionsLoading, setOptionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null), [locating, setLocating] = useState(false);
  const generation = useRef(0), optionsRevision = useRef(0);
  const fields = allowed || (kind === "catalog" ? CATALOG_DISCOVERY_FIELDS : kind === "orders" ? ORDER_DISCOVERY_FIELDS : REQUEST_DISCOVERY_FIELDS);
  const supports = (field: string) => fields.includes(field);
  useEffect(() => { setQueryText(value.q); }, [value.q]);
  useEffect(() => { generation.current++; setOpen(false); setLocating(false); setOptions(null); return () => { generation.current++; optionsRevision.current++; }; }, [accountId]);
  async function loadOptions() {
    const revision = ++optionsRevision.current, id = accountId;
    setOptionsLoading(true); setOptionsError(false);
    try {
      const response = await apiAuthGet<DiscoveryOptions>("/allwain/discovery-options");
      if (revision !== optionsRevision.current || id !== useAuthStore.getState().user?.id) return;
      if (!Array.isArray(response.categories) || !Array.isArray(response.productKinds) || !Array.isArray(response.units) || !Array.isArray(response.currencies)) throw new Error("INVALID_OPTIONS");
      setOptions(response);
    } catch { if (revision === optionsRevision.current && id === useAuthStore.getState().user?.id) setOptionsError(true); }
    finally { if (revision === optionsRevision.current && id === useAuthStore.getState().user?.id) setOptionsLoading(false); }
  }
  function showFilters() { setDraft({ ...value, q: queryText.trim() }); setError(null); setOpen(true); if (!options) void loadOptions(); }
  function closeFilters() { generation.current++; setOpen(false); setLocating(false); }
  function apply() {
    const normalized = normalizeDiscoveryQuery(draft);
    const min = normalized.minPrice ? Number(normalized.minPrice.replace(",", ".")) : undefined, max = normalized.maxPrice ? Number(normalized.maxPrice.replace(",", ".")) : undefined;
    const validation = discoveryQueryValidation(normalized);
    if (validation) { setError(validation === "price" ? copy.invalidPrice : validation === "date" ? copy.invalidDate : copy.priceHint); return; }
    if (min != null) normalized.minPrice = String(min); if (max != null) normalized.maxPrice = String(max);
    onApply(normalized); closeFilters();
  }
  async function locate() {
    const revision = generation.current, id = accountId; setLocating(true); setError(null);
    try { const position = await getSearchPosition(); if (revision === generation.current && id === useAuthStore.getState().user?.id) setDraft(previous => ({ ...previous, ...position, radiusKm: previous.radiusKm || 10, locationLabel: "" })); }
    catch { if (revision === generation.current && id === useAuthStore.getState().user?.id) setError(copy.locationError); }
    finally { if (revision === generation.current && id === useAuthStore.getState().user?.id) setLocating(false); }
  }
  const summary = [value.q && `“${value.q}”`, value.category && (copy.categories[value.category] || readable(value.category)), value.subcategory && (taxonomy.subcategories[value.subcategory] || readable(value.subcategory)), value.productKind && (kindNames[value.productKind] || readable(value.productKind)), value.unit && (taxonomy.units[value.unit] || value.unit), value.currency, (value.minPrice || value.maxPrice) && `${value.minPrice || "0"}–${value.maxPrice || "∞"}`, value.locationLabel, value.radiusKm && `${copy.radius}: ${value.radiusKm} km`, value.status && (statuses?.find(item => item.value === value.status)?.label || readable(value.status)), value.dateFrom, value.dateTo, value.sort !== "newest" && (value.sort === "price_asc" ? copy.priceAsc : copy.priceDesc), value.contractStatus && orderCopy.contractStates[value.contractStatus], value.paymentStatus && orderCopy.paymentStates[value.paymentStatus], value.fulfillmentStatus && orderCopy.fulfillmentStates[value.fulfillmentStatus], kind === "orders" && value.deliveryChannel && orderCopy.channels[value.deliveryChannel], ...(extraSummary?.(value) || [])].filter(Boolean);
  const chips = (values: Option[], field: keyof DiscoveryQuery, names?: Record<string, string>) => <View style={styles.options}>{[{ value: "", label: copy.all }, ...values].map(option => {
    const key = optionValue(option), label = names?.[key] || (typeof option === "string" ? readable(option) : option.label || readable(option.value));
    return <TouchableOpacity key={key || "any"} accessibilityRole="button" accessibilityState={{ selected: draft[field] === key }} onPress={() => setDraft(previous => ({ ...previous, [field]: key, ...(field === "category" ? { subcategory: "" } : {}) }))} style={[styles.chip, draft[field] === key && styles.selected]}><Text style={styles.chipText}>{label}</Text></TouchableOpacity>;
  })}</View>;
  const input = (field: "minPrice" | "maxPrice" | "locationLabel" | "dateFrom" | "dateTo", label: string, numeric = false) => <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={draft[field]} onChangeText={text => setDraft(previous => ({ ...previous, [field]: text, ...(field === "locationLabel" ? { latitude: undefined, longitude: undefined, radiusKm: undefined } : {}) }))} style={styles.input} keyboardType={numeric ? "decimal-pad" : "default"} autoCapitalize="none" placeholder={field.startsWith("date") ? "YYYY-MM-DD" : undefined} placeholderTextColor={colors.mutedText} /></View>;
  return <View style={styles.wrapper}>
    <View style={styles.search}><Search size={20} color={colors.primary} /><TextInput accessibilityLabel={copy.search} style={styles.searchInput} value={queryText} onChangeText={setQueryText} placeholder={copy.placeholder} placeholderTextColor={colors.mutedText} autoCapitalize="none" returnKeyType="search" onSubmitEditing={() => onApply(normalizeDiscoveryQuery({ ...value, q: queryText }))} /><TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.search} disabled={disabled} onPress={() => onApply(normalizeDiscoveryQuery({ ...value, q: queryText }))} style={styles.icon}><Search size={20} color={colors.text} /></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.filters} accessibilityState={{ expanded: open, disabled: Boolean(disabled) }} disabled={disabled} onPress={showFilters} style={styles.icon}><SlidersHorizontal size={20} color={summary.length ? colors.primary : colors.text} /></TouchableOpacity></View>
    <View style={styles.summary}><Text style={styles.summaryText}>{summary.length ? `${copy.active}: ${summary.join(" · ")}` : copy.none}</Text>{summary.length ? <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={() => { setQueryText(""); onApply({ ...EMPTY_DISCOVERY_QUERY }); }} style={styles.clear}><Text style={styles.clearText}>{copy.clear}</Text></TouchableOpacity> : null}</View>
    <Modal visible={open} transparent animationType="fade" onRequestClose={closeFilters}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}><View testID="discovery-filter-dialog" style={styles.dialog}>
        <View style={styles.header}><Text style={styles.title}>{copy.filters}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.cancel} onPress={closeFilters} style={styles.icon}><X size={22} color={colors.text} /></TouchableOpacity></View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {optionsLoading ? <ActivityIndicator color={colors.primary} /> : null}
          {optionsError ? <View style={styles.field}><Text style={styles.error}>{copy.optionsError}</Text><BigActionButton tone="light" label={copy.retry} onPress={() => void loadOptions()} /></View> : null}
          {supports("category") && options ? <View style={styles.field}><Text style={styles.label}>{copy.category}</Text>{chips(options.categories, "category", copy.categories)}</View> : null}
          {supports("subcategory") && draft.category && options?.categories.find(item => item.value === draft.category)?.subcategories?.length ? <View style={styles.field}><Text style={styles.label}>{copy.subcategory}</Text>{chips(options.categories.find(item => item.value === draft.category)!.subcategories!, "subcategory", taxonomy.subcategories)}</View> : null}
          {supports("productKind") && options ? <View style={styles.field}><Text style={styles.label}>{copy.kind}</Text>{chips(options.productKinds, "productKind", kindNames)}</View> : null}
          {supports("unit") && options ? <View style={styles.field}><Text style={styles.label}>{copy.unit}</Text>{chips(options.units, "unit", taxonomy.units)}</View> : null}
          {supports("currency") && options ? <View style={styles.field}><Text style={styles.label}>{copy.currency}</Text>{chips(options.currencies, "currency")}</View> : null}
          {supports("minPrice") ? <View style={styles.row}>{input("minPrice", copy.min, true)}{input("maxPrice", copy.max, true)}</View> : null}
          {supports("locationLabel") ? <View style={styles.field}>{input("locationLabel", copy.area)}<Text style={styles.hint}>{copy.areaHint}</Text></View> : null}
          {supports("radiusKm") ? <View style={styles.field}><BigActionButton tone="light" label={locating ? copy.locating : copy.location} disabled={locating} onPress={() => void locate()} /><Text style={styles.hint}>{copy.locationHint}</Text>{draft.radiusKm ? <><Text style={styles.label}>{copy.radius}</Text><View style={styles.options}>{[5, 10, 25, 50].map(radius => <TouchableOpacity key={radius} accessibilityRole="button" accessibilityState={{ selected: radius === draft.radiusKm }} style={[styles.chip, radius === draft.radiusKm && styles.selected]} onPress={() => setDraft(previous => ({ ...previous, radiusKm: radius }))}><Text style={styles.chipText}>{radius} km</Text></TouchableOpacity>)}</View><TouchableOpacity accessibilityRole="button" style={styles.clear} onPress={() => setDraft(previous => ({ ...previous, latitude: undefined, longitude: undefined, radiusKm: undefined }))}><Text style={styles.clearText}>{copy.removeLocation}</Text></TouchableOpacity></> : null}</View> : null}
          {supports("status") && statuses ? <View style={styles.field}><Text style={styles.label}>{copy.status}</Text>{chips(statuses, "status")}</View> : null}
          {kind === "orders" && supports("contractStatus") ? <View style={styles.field}><Text style={styles.label}>{orderCopy.contract}</Text>{chips(Object.entries(orderCopy.contractStates).map(([value, label]) => ({ value, label })), "contractStatus")}</View> : null}
          {kind === "orders" && supports("paymentStatus") ? <View style={styles.field}><Text style={styles.label}>{orderCopy.payment}</Text>{chips(Object.entries(orderCopy.paymentStates).map(([value, label]) => ({ value, label })), "paymentStatus")}</View> : null}
          {kind === "orders" && supports("fulfillmentStatus") ? <View style={styles.field}><Text style={styles.label}>{orderCopy.fulfillment}</Text>{chips(Object.entries(orderCopy.fulfillmentStates).map(([value, label]) => ({ value, label })), "fulfillmentStatus")}</View> : null}
          {kind === "orders" && supports("deliveryChannel") ? <View style={styles.field}><Text style={styles.label}>{orderCopy.delivery}</Text>{chips(Object.entries(orderCopy.channels).map(([value, label]) => ({ value, label })), "deliveryChannel")}</View> : null}
          {supports("dateFrom") ? <View style={styles.field}><Text style={styles.hint}>{kind === "orders" ? orderCopy.dateHint : copy.dateHint}</Text><View style={styles.row}>{input("dateFrom", copy.from)}{input("dateTo", copy.to)}</View></View> : null}
          {supports("sort") ? <View style={styles.field}><Text style={styles.label}>{copy.sort}</Text><Text style={styles.hint}>{copy.priceHint}</Text><View style={styles.options}>{(["newest", "price_asc", "price_desc"] as const).map(sort => <TouchableOpacity key={sort} accessibilityRole="button" accessibilityState={{ selected: draft.sort === sort, disabled: sort !== "newest" && (!draft.unit || !draft.currency) }} disabled={sort !== "newest" && (!draft.unit || !draft.currency)} style={[styles.chip, draft.sort === sort && styles.selected, sort !== "newest" && (!draft.unit || !draft.currency) && styles.disabled]} onPress={() => setDraft(previous => ({ ...previous, sort }))}><Text style={styles.chipText}>{sort === "newest" ? copy.newest : sort === "price_asc" ? copy.priceAsc : copy.priceDesc}</Text></TouchableOpacity>)}</View></View> : null}
          {extra?.(draft, setDraft)}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        </ScrollView>
        <View testID="discovery-filter-footer" style={styles.footer}><BigActionButton label={copy.apply} onPress={apply} disabled={locating} /><TouchableOpacity accessibilityRole="button" style={styles.clear} onPress={() => { setDraft({ ...EMPTY_DISCOVERY_QUERY }); setError(null); }}><Text style={styles.clearText}>{copy.clear}</Text></TouchableOpacity></View>
      </View></KeyboardAvoidingView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 }, search: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, minHeight: 54, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 12, backgroundColor: colors.card }, searchInput: { flex: 1, minWidth: 0, fontSize: 16, color: colors.text, paddingVertical: 12 }, icon: { width: 44, height: 44, justifyContent: "center", alignItems: "center" }, summary: { gap: 4 }, summaryText: { color: colors.mutedText, fontSize: 12, lineHeight: 18 }, clear: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 4 }, clearText: { color: colors.text, fontWeight: "700", fontSize: 13 }, backdrop: { flex: 1, backgroundColor: "rgba(39,39,41,0.45)", justifyContent: "center", alignItems: "center", padding: 16 }, dialog: { width: "100%", maxWidth: 560, maxHeight: "90%", backgroundColor: colors.background, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: colors.cardBorder }, header: { flexDirection: "row", alignItems: "center", paddingLeft: 18, paddingRight: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.cardBorder }, title: { flex: 1, fontSize: 20, fontWeight: "800", color: colors.text }, scroll: { flexGrow: 0, flexShrink: 1 }, content: { padding: 18, gap: 18 }, field: { flex: 1, gap: 7, minWidth: 0 }, label: { color: colors.text, fontWeight: "800", fontSize: 13 }, hint: { color: colors.mutedText, fontSize: 12, lineHeight: 18 }, options: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { minHeight: 44, paddingHorizontal: 11, paddingVertical: 8, justifyContent: "center", borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 10, backgroundColor: colors.card }, selected: { borderColor: colors.primary, backgroundColor: colors.highlight }, chipText: { color: colors.text, fontWeight: "700", fontSize: 13 }, row: { flexDirection: "row", gap: 10 }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 10, padding: 12, color: colors.text, fontSize: 16, backgroundColor: colors.card }, footer: { flexShrink: 0, padding: 16, borderTopWidth: 1, borderTopColor: colors.cardBorder, gap: 4 }, error: { color: colors.danger, lineHeight: 20 }, disabled: { opacity: 0.45 },
});
