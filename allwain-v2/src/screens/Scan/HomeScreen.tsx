import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Button,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { useAuthStore } from "../../store/auth.store";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MainTabParamList, RootStackParamList } from "../../navigation/types";
import {
  apiAuthGet,
  apiAuthPost,
  AllwainOffer,
  ScanDemoResponse,
  SponsorSummaryResponse,
} from "../../config/api";
import { colors } from "../../theme/colors";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Inicio">,
  NativeStackScreenProps<RootStackParamList>
>;

export default function HomeScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);

  const [scanData, setScanData] = useState<ScanDemoResponse | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [offers, setOffers] = useState<AllwainOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState<string | null>(null);

  const [summary, setSummary] = useState<SponsorSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [savingAmount, setSavingAmount] = useState("10");
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const [savingLoading, setSavingLoading] = useState(false);

  const firstName = useMemo(() => user?.name?.split(" ")[0] ?? "usuario", [
    user?.name,
  ]);

  useEffect(() => {
    refreshAll();
  }, []);

  async function refreshAll() {
    await Promise.all([loadScanDemo(), loadOffers(), loadSponsorSummary()]);
  }

  async function loadScanDemo() {
    try {
      setScanLoading(true);
      setScanError(null);
      const res = await apiAuthGet<ScanDemoResponse>("/allwain/scan-demo");
      setScanData(res);
    } catch (err: any) {
      setScanError("No se pudo obtener el resultado del escaneo");
    } finally {
      setScanLoading(false);
    }
  }

  async function loadOffers() {
    try {
      setOffersLoading(true);
      setOffersError(null);
      const res = await apiAuthGet<{ items: AllwainOffer[] }>("/allwain/offers");
      setOffers(res.items || []);
    } catch (err: any) {
      setOffersError("No se pudieron cargar las ofertas");
    } finally {
      setOffersLoading(false);
    }
  }

  async function loadSponsorSummary() {
    try {
      setSummaryLoading(true);
      setSummaryError(null);
      const res = await apiAuthGet<SponsorSummaryResponse>(
        "/allwain/sponsors/summary",
      );
      setSummary(res);
    } catch (err: any) {
      setSummaryError("No se pudo obtener el resumen de patrocinio");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleRegisterSaving() {
    const amountNumber = Number(savingAmount);
    if (Number.isNaN(amountNumber) || amountNumber <= 0) {
      setSavingStatus("Introduce un importe válido");
      return;
    }
    try {
      setSavingLoading(true);
      setSavingStatus(null);
      await apiAuthPost("/allwain/savings", { amount: amountNumber });
      setSavingStatus("Ahorro registrado correctamente");
      await loadSponsorSummary();
    } catch (err: any) {
      setSavingStatus("No se pudo registrar el ahorro");
    } finally {
      setSavingLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hola {firstName}, bienvenido a Allwain</Text>
      <Text style={styles.subtitle}>
        Escanea productos, compara tiendas cercanas y registra tus ahorros
        usando la API real.
      </Text>

      <Button
        title="Escanear producto"
        color={colors.button}
        onPress={() => navigation.navigate("Scan")}
      />

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Resultado de escaneo demo</Text>
          <TouchableOpacity onPress={loadScanDemo}>
            <Text style={styles.link}>Actualizar</Text>
          </TouchableOpacity>
        </View>
        {scanLoading && <ActivityIndicator color={colors.primary} />}
        {scanError && <Text style={styles.error}>{scanError}</Text>}
        {!scanLoading && !scanError && scanData && (
          <View style={{ gap: 4 }}>
            <Text style={styles.cardText}>{scanData.message}</Text>
            {scanData.product && (
              <View style={{ gap: 2 }}>
                <Text style={styles.helper}>Producto detectado</Text>
                <Text style={styles.cardText}>{scanData.product.name}</Text>
                {scanData.product.description && (
                  <Text style={styles.helper}>{scanData.product.description}</Text>
                )}
              </View>
            )}
          </View>
        )}
        {!scanLoading && !scanError && !scanData && (
          <Text style={styles.helper}>No hay datos de escaneo aún.</Text>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Ofertas</Text>
          <TouchableOpacity onPress={loadOffers}>
            <Text style={styles.link}>Recargar</Text>
          </TouchableOpacity>
        </View>
        {offersLoading && <ActivityIndicator color={colors.primary} />}
        {offersError && <Text style={styles.error}>{offersError}</Text>}
        {!offersLoading && !offersError && (
          <FlatList
            data={offers}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            ListEmptyComponent={
              <Text style={styles.helper}>No hay ofertas disponibles.</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.offerRow}>
                <Text style={styles.offerTitle}>{item.title}</Text>
                {item.description && (
                  <Text style={styles.helper}>{item.description}</Text>
                )}
                {typeof item.tokens === "number" && (
                  <Text style={styles.tokenText}>{item.tokens} tokens</Text>
                )}
                {typeof item.price === "number" && (
                  <Text style={styles.tokenText}>€{item.price}</Text>
                )}
              </View>
            )}
          />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Registrar ahorro</Text>
        <TextInput
          style={styles.input}
          value={savingAmount}
          onChangeText={setSavingAmount}
          keyboardType="numeric"
          placeholder="Importe en euros"
        />
        {savingStatus && <Text style={styles.helper}>{savingStatus}</Text>}
        <Button
          title={savingLoading ? "Guardando…" : "Registrar ahorro"}
          color={colors.button}
          onPress={handleRegisterSaving}
          disabled={savingLoading}
        />
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Resumen patrocinadores</Text>
          <TouchableOpacity onPress={loadSponsorSummary}>
            <Text style={styles.link}>Actualizar</Text>
          </TouchableOpacity>
        </View>
        {summaryLoading && <ActivityIndicator color={colors.primary} />}
        {summaryError && <Text style={styles.error}>{summaryError}</Text>}
        {!summaryLoading && !summaryError && summary && (
          <View style={{ gap: 6 }}>
            <Text style={styles.cardText}>
              Invitados: {summary.invitedCount} · Comisiones: €
              {summary.totalCommission.toFixed(2)}
            </Text>
            <Text style={styles.helper}>
              Ahorro total de tu red: €{summary.totalSaved.toFixed(2)}
            </Text>
            <Text style={styles.helper}>
              Balance disponible: €{summary.balance.toFixed(2)}
            </Text>
          </View>
        )}
        {!summaryLoading && !summaryError && !summary && (
          <Text style={styles.helper}>Aún no hay datos de patrocinio.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
    backgroundColor: colors.background,
  },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { color: colors.mutedText, marginBottom: 8 },
  card: {
    marginTop: 4,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { color: colors.text, fontWeight: "800", fontSize: 16 },
  cardText: { color: colors.text },
  helper: { color: colors.mutedText },
  error: { color: colors.danger },
  offerRow: { paddingVertical: 6, gap: 2 },
  offerTitle: { color: colors.text, fontWeight: "700" },
  tokenText: { color: colors.primary, fontWeight: "700" },
  link: { color: colors.button, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    padding: 10,
    color: colors.text,
  },
});
