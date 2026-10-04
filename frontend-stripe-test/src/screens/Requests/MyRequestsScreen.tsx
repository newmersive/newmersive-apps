import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { apiAuthGet, type AllwainScanRequest } from "../../config/api";
import { BigActionButton, ProductCard, PublicationImage } from "../../components/design-system";
import { useAuthStore } from "../../store/auth.store";
import { requestCopy } from "../../i18n/requestCopy";
import { isRtlLocale } from "../../i18n";
import { colors } from "../../theme/colors";
import { useAppTranslation } from "../../i18n/useAppTranslation";

export default function MyRequestsScreen() {
  const { t } = useAppTranslation();
  const navigation = useNavigation<any>();
  const userId = useAuthStore(state => state.user?.id);
  const locale = useAuthStore(state => state.locale);
  const copy = requestCopy[locale];
  const revision = useRef(0);
  const [items, setItems] = useState<AllwainScanRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const load = useCallback(async (next?: string, isCurrent: () => boolean = () => true) => {
    const requestRevision = ++revision.current;
    const current = () => requestRevision === revision.current && isCurrent();
    setLoading(true); setError(null);
    try {
      const result = await apiAuthGet<{ items?: AllwainScanRequest[]; pageInfo?: { nextCursor?: string } }>(
        `/allwain/scan-requests?limit=30${next ? `&cursor=${encodeURIComponent(next)}` : ""}`,
      );
      if (!current()) return;
      setItems(previous => next ? [...new Map([...previous, ...(result.items || [])].map(item => [item.id, item])).values()] : result.items || []);
      setCursor(result.pageInfo?.nextCursor || null);
    } catch (e: any) { if (current()) setError(copy.error); }
    finally { if (current()) setLoading(false); }
  }, [userId, copy.error]);
  useFocusEffect(useCallback(() => { let current = true; setItems([]); setCursor(null); void load(undefined, () => current); return () => { current = false; revision.current++; }; }, [load]));
  const labels: Record<string, string> = copy.states;
  return <FlatList style={{ flex: 1, backgroundColor: colors.background, direction: isRtlLocale(locale) ? "rtl" : "ltr" }} contentContainerStyle={{ padding: 16, gap: 12, width: "100%", maxWidth: 720, alignSelf: "center" }} data={items} keyExtractor={item => item.id}
    ListHeaderComponent={<View style={{ gap: 12 }}><Text style={{ color: colors.text, lineHeight: 22 }}>{copy.intro}</Text><TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate("ManualRequest")} style={{ padding: 14, backgroundColor: colors.primary, borderRadius: 12 }}><Text style={{ color: colors.text, fontWeight: "700" }}>{copy.create}</Text></TouchableOpacity>{error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}</View>}
    renderItem={({ item }) => <ProductCard title={item.extracted?.productName || item.title || copy.request} meta={item.extracted?.quantity ? `${item.extracted.quantity} ${item.extracted.unit || ""}` : copy.details} status={labels[item.status] || copy.states.draft} actionLabel={copy.open} onPress={() => navigation.navigate("ScanResult", { requestId: item.id })} leading={<PublicationImage imageUrl={item.imageMeta?.url} imageAlt={item.title} />} leadingVariant="image" />}
    ListEmptyComponent={!loading && !error ? <Text style={{ color: colors.mutedText }}>{copy.empty}</Text> : null}
    ListFooterComponent={loading ? <ActivityIndicator color={colors.primary} /> : <BigActionButton tone="light" label={error ? t("common.retry") : cursor ? copy.more : copy.refresh} onPress={() => void load(cursor || undefined)} />} />;
}

