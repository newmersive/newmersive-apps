import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  RouteProp,
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from "expo-camera";
import {
  CheckCircle2,
  MapPin,
  Navigation,
  PackageCheck,
  PlayCircle,
  QrCode,
  RotateCcw,
  MessageCircle,
  X,
} from "lucide-react-native";

import {
  apiAuthGet,
  apiAuthPost,
  type AllwainConnectorLogistics,
  type AllwainDeliveryOpportunity,
} from "../../config/api";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";
import { formatMinorCurrency } from "../../utils/format";
import {
  BigActionButton,
  DeliveryCard,
  EmptyState,
  TodaySummary,
} from "../../components/design-system";
import type { MainTabParamList } from "../../navigation/types";
import { trackAnalyticsEvent } from "../../analytics";

function money(amount: number, currency: string) {
  return formatMinorCurrency(amount, currency || "EUR");
}

type DemoStage = "open" | "accepted" | "picked_up" | "delivered";

function demoStageCopy(stage: DemoStage) {
  if (stage === "accepted") {
    return {
      title: "Entrega aceptada",
      body: "En un pedido real ahora verías la dirección de recogida y escanearías el QR del vendedor.",
      action: "Simular recogida",
    };
  }
  if (stage === "picked_up") {
    return {
      title: "Pedido recogido",
      body: "La trazabilidad ya indicaría que el pedido está en camino. Al entregarlo escanearías el QR del comprador.",
      action: "Simular entrega",
    };
  }
  if (stage === "delivered") {
    return {
      title: "Entrega completada",
      body: "Allwain habría registrado aceptación, recogida y entrega. El importe quedaría ligado al pedido y a tu cuenta.",
      action: "Repetir recorrido",
    };
  }
  return {
    title: "Entrega disponible",
    body: "Comprueba ruta e importe. En una operación real solo podrías aceptarla si está dentro de tu radio y tus cobros están activos.",
    action: "Aceptar entrega de prueba",
  };
}

export default function ConnectorOperationsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<MainTabParamList, "Ofertas">>();
  const isFocused = useIsFocused();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const connector = useAuthStore((state) => state.user?.participation?.connector);
  const [snapshot, setSnapshot] = useState<AllwainConnectorLogistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verificationItem, setVerificationItem] = useState<AllwainDeliveryOpportunity | null>(null);
  const [manualProof, setManualProof] = useState("");
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [scanLocked, setScanLocked] = useState(false);
  const [demoItem, setDemoItem] = useState<AllwainDeliveryOpportunity | null>(null);
  const [demoStage, setDemoStage] = useState<DemoStage>("open");

  const load = useCallback(async () => {
    if (!connector?.enabled) return;
    setLoading(true);
    setError(null);
    try {
      setSnapshot(
        await apiAuthGet<AllwainConnectorLogistics>("/allwain/participation/connector/logistics"),
      );
    } catch (loadError: any) {
      setError(loadError?.message || "No pudimos cargar las entregas.");
    } finally {
      setLoading(false);
    }
  }, [connector?.enabled]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function accept(item: AllwainDeliveryOpportunity) {
    setBusyId(item.id);
    setError(null);
    try {
      const updated = await apiAuthPost<AllwainDeliveryOpportunity>(
        `/allwain/participation/connector/logistics/${item.id}/accept`,
        {},
      );
      if (updated.id !== item.id || updated.status !== "accepted" || !updated.mine) {
        throw new Error("El servidor no confirmó la entrega aceptada.");
      }
      void trackAnalyticsEvent("delivery_accepted", {
        delivery_kind: "local_connector",
      });
      await load();
    } catch (acceptError: any) {
      setError(
        acceptError?.message === "CONNECTOR_PAYOUTS_NOT_READY"
          ? "Activa tus cobros antes de aceptar una entrega."
          : acceptError?.message || "No pudimos aceptar esta entrega.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function openVerification(item: AllwainDeliveryOpportunity) {
    setVerificationItem(item);
    setManualProof("");
    setVerificationError(null);
    setScanLocked(false);
    if (!cameraPermission?.granted && cameraPermission?.canAskAgain !== false) {
      await requestCameraPermission();
    }
  }

  function closeVerification() {
    if (busyId) return;
    setVerificationItem(null);
    setVerificationError(null);
    setManualProof("");
    setScanLocked(false);
  }

  async function verifyCheckpoint(item: AllwainDeliveryOpportunity, proof: string) {
    const cleanProof = proof.trim();
    if (!cleanProof || scanLocked) return;
    setBusyId(item.id);
    setVerificationError(null);
    setScanLocked(true);
    try {
      const updated = await apiAuthPost<AllwainDeliveryOpportunity>(
        `/allwain/participation/connector/logistics/${item.id}/verify`,
        { proof: cleanProof },
      );
      const expectedStatus = item.status === "accepted" ? "picked_up" : "delivered";
      if (updated.id !== item.id || updated.status !== expectedStatus) {
        throw new Error("El servidor no confirmó la verificación.");
      }
      setVerificationItem(null);
      setManualProof("");
      await load();
    } catch (actionError: any) {
      setVerificationError(actionError?.message || "No pudimos verificar la entrega.");
      setScanLocked(false);
    } finally {
      setBusyId(null);
    }
  }

  function onBarcodeScanned(result: BarcodeScanningResult) {
    if (!verificationItem || scanLocked) return;
    void verifyCheckpoint(verificationItem, result.data);
  }

  function openDemo(item: AllwainDeliveryOpportunity) {
    setDemoItem(item);
    setDemoStage("open");
  }

  function advanceDemo() {
    setDemoStage((current) =>
      current === "open"
        ? "accepted"
        : current === "accepted"
          ? "picked_up"
          : current === "picked_up"
            ? "delivered"
            : "open",
    );
  }

  if (!connector?.enabled) {
    return (
      <View style={styles.centered}>
        <EmptyState
          icon={<Navigation size={28} color={colors.primary} />}
          title="Ayuda cerca de ti"
          body="Activa Conector para ver oportunidades compatibles con tu zona."
          demo={{
            title: "Foios → Meliana",
            meta: "4,2 km · Importe previsto: 2,00 €",
            detail: "Ejemplo del recorrido: aceptar, recoger con QR y confirmar la entrega.",
            leading: <Navigation size={20} color={colors.primary} />,
          }}
        />
        <BigActionButton label="Activar Conector" onPress={() => navigation.navigate("ActivateConnector")} />
      </View>
    );
  }

  const selectedDeliveryId = route.params?.deliveryId;
  const items = [...(snapshot?.items || [])].sort((a, b) => {
    if (a.id === selectedDeliveryId) return -1;
    if (b.id === selectedDeliveryId) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const available = items.filter((item) => item.status === "open" && !item.mine);
  const mine = items.filter((item) => item.mine && item.status !== "delivered");
  const demoItems = [...(snapshot?.demoItems || [])].sort((a, b) => {
    if (a.id === selectedDeliveryId) return -1;
    if (b.id === selectedDeliveryId) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
  const demoCopy = demoStageCopy(demoStage);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>CERCA DE TI</Text>
        <Text style={styles.title}>Entregas</Text>
        <Text style={styles.subtitle}>Hasta {snapshot?.radiusKm || connector.radiusKm} km de tu zona.</Text>
      </View>

      <TodaySummary
        title="Ahora"
        items={[
          { key: "available", value: String(available.length), label: "disponibles", icon: <MapPin size={19} color={colors.primary} /> },
          { key: "mine", value: String(mine.length), label: "aceptadas", icon: <PackageCheck size={19} color={colors.brandDark} /> },
        ]}
      />

      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !items.length ? (
        <EmptyState
          title="No hay entregas reales cerca ahora"
          body="Puedes practicar el recorrido completo más abajo. Las demostraciones no generan pedidos ni cobros."
          demo={{
            title: "Pedido local de demostración",
            meta: "Foios → Meliana · 4,2 km",
            detail: "La tarjeta real mostrará recogida, destino aproximado, ganancia y siguiente acción.",
            leading: <PackageCheck size={20} color={colors.primary} />,
          }}
        />
      ) : null}

      {items.map((item) => (
        <View
          key={item.id}
          style={[
            styles.deliveryBlock,
            item.id === selectedDeliveryId && styles.selectedDelivery,
          ]}
        >
          <DeliveryCard
             title={`${item.pickupZone} → ${item.deliveryZone}`}
             meta={`${typeof item.distanceKm === "number" ? `${item.distanceKm.toFixed(1)} km de ruta · ` : ""}Importe bruto previsto: ${money(item.feeAmount, item.currency)}`}
            status={
              item.status === "delivered"
                ? "Entregada"
                : item.status === "picked_up"
                  ? "En camino"
                  : item.mine
                    ? "Aceptada"
                    : "Disponible"
            }
            statusTone={item.status === "delivered" ? "success" : item.mine ? "success" : "brand"}
            contactLabel="Hablar sobre esta entrega"
            onContact={
              item.mine && item.orderId
                ? () =>
                    navigation.navigate("ChatThread", {
                      orderId: item.orderId,
                      title: `${item.pickupZone} → ${item.deliveryZone}`,
                    })
                : undefined
            }
            leading={<Navigation size={20} color={colors.primary} />}
           />
          {item.mine && (item.seller || item.buyer) ? (
            <View style={styles.privateContactRow}>
              {item.seller ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Enviar mensaje privado a ${item.seller.name}`}
                  style={styles.privateContactButton}
                  onPress={() =>
                    navigation.navigate("ChatThread", {
                      targetUserId: item.seller?.id,
                      targetName: item.seller?.name,
                      title: "Mensaje privado",
                    })
                  }
                >
                  <MessageCircle size={17} color={colors.primary} />
                  <Text style={styles.privateContactText}>Mensaje al vendedor</Text>
                </TouchableOpacity>
              ) : null}
              {item.buyer ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Enviar mensaje privado a ${item.buyer.name}`}
                  style={styles.privateContactButton}
                  onPress={() =>
                    navigation.navigate("ChatThread", {
                      targetUserId: item.buyer?.id,
                      targetName: item.buyer?.name,
                      title: "Mensaje privado",
                    })
                  }
                >
                  <MessageCircle size={17} color={colors.primary} />
                  <Text style={styles.privateContactText}>Mensaje al comprador</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          {Number(item.networkBonusAmount || 0) > 0 ? (
            <Text style={styles.networkBonus}>
              Parte prevista de la tarifa Allwain: {money(item.networkBonusAmount || 0, item.currency)}
            </Text>
          ) : null}
          {item.mine && (item.pickupAddress || item.deliveryAddress) ? (
            <View style={styles.addresses}>
              {item.pickupAddress ? (
                <View style={styles.addressRow}>
                  <MapPin size={17} color={colors.primary} />
                  <View style={styles.addressCopy}>
                    <Text style={styles.addressLabel}>Recoge aquí</Text>
                    <Text style={styles.addressText}>{item.pickupAddress}</Text>
                  </View>
                </View>
              ) : null}
              {item.deliveryAddress ? (
                <View style={styles.addressRow}>
                  <Navigation size={17} color={colors.brandDark} />
                  <View style={styles.addressCopy}>
                    <Text style={styles.addressLabel}>Entrega aquí</Text>
                    <Text style={styles.addressText}>{item.deliveryAddress}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
          {!item.mine && item.status === "open" ? (
            <BigActionButton
              label="Aceptar entrega"
              busy={busyId === item.id}
              disabled={busyId !== null}
              onPress={() => void accept(item)}
            />
          ) : null}
          {item.mine && item.status === "accepted" ? (
            <BigActionButton
              label="Escanear QR del vendedor"
              busy={busyId === item.id}
              disabled={busyId !== null}
              onPress={() => void openVerification(item)}
            />
          ) : null}
          {item.mine && item.status === "picked_up" ? (
            <BigActionButton
              label="Escanear QR del comprador"
              busy={busyId === item.id}
              disabled={busyId !== null}
              onPress={() => void openVerification(item)}
            />
          ) : null}
        </View>
      ))}

      {demoItems.length ? (
        <View style={styles.demoSection}>
          <View style={styles.demoHeading}>
            <Text style={styles.demoEyebrow}>DEMOSTRACIÓN</Text>
            <Text style={styles.demoTitle}>Practica una entrega Km 0</Text>
            <Text style={styles.demoIntro}>
              Recorre los estados sin afectar stock, pedidos, Stripe ni liquidaciones.
            </Text>
          </View>
          {demoItems.map((item) => (
            <View
              key={item.id}
              style={[
                styles.demoItem,
                item.id === selectedDeliveryId && styles.selectedDelivery,
              ]}
            >
              <DeliveryCard
                title={item.title || `${item.pickupZone} → ${item.deliveryZone}`}
                meta={`${item.pickupZone} → ${item.deliveryZone} · ${typeof item.distanceKm === "number" ? `${item.distanceKm.toFixed(1)} km · ` : ""}${money(item.feeAmount, item.currency)}`}
                status="Prueba"
                statusTone="brand"
                leading={<PlayCircle size={20} color={colors.primary} />}
              />
              <BigActionButton
                label="Probar recorrido"
                onPress={() => openDemo(item)}
              />
            </View>
          ))}
        </View>
      ) : null}

      <Modal
        visible={Boolean(demoItem)}
        animationType="slide"
        transparent
        onRequestClose={() => setDemoItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.demoSheet}>
            <View style={styles.scannerHeader}>
              <View style={styles.scannerTitleGroup}>
                <Text style={styles.scannerEyebrow}>RECORRIDO DE PRUEBA</Text>
                <Text style={styles.scannerTitle}>{demoCopy.title}</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setDemoItem(null)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar demostración"
              >
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.demoRouteTitle}>{demoItem?.title}</Text>
            <Text style={styles.demoRoute}>
              {demoItem?.pickupZone} → {demoItem?.deliveryZone}
            </Text>
            <View style={styles.demoProgress}>
              {(["open", "accepted", "picked_up", "delivered"] as DemoStage[]).map(
                (stage, index) => {
                  const stages: DemoStage[] = ["open", "accepted", "picked_up", "delivered"];
                  const reached = stages.indexOf(demoStage) >= index;
                  return (
                    <View
                      key={stage}
                      style={[styles.demoProgressStep, reached && styles.demoProgressStepDone]}
                    />
                  );
                },
              )}
            </View>
            <Text style={styles.scannerHelp}>{demoCopy.body}</Text>
            <View style={styles.demoAmountRow}>
              <Text style={styles.demoAmountLabel}>Importe de ejemplo</Text>
              <Text style={styles.demoAmount}>
                {demoItem ? money(demoItem.feeAmount, demoItem.currency) : ""}
              </Text>
            </View>
            <BigActionButton
              label={demoCopy.action}
              icon={
                demoStage === "delivered" ? (
                  <RotateCcw size={20} color={colors.buttonText} />
                ) : demoStage === "picked_up" ? (
                  <CheckCircle2 size={20} color={colors.buttonText} />
                ) : (
                  <PackageCheck size={20} color={colors.buttonText} />
                )
              }
              onPress={advanceDemo}
            />
            <Text style={styles.demoDisclaimer}>
              Es una simulación local: no crea operaciones ni mueve dinero.
            </Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(verificationItem)}
        animationType="slide"
        transparent
        onRequestClose={closeVerification}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.scannerSheet}>
            <View style={styles.scannerHeader}>
              <View style={styles.scannerTitleGroup}>
                <Text style={styles.scannerEyebrow}>VERIFICACIÓN SEGURA</Text>
                <Text style={styles.scannerTitle}>
                  {verificationItem?.status === "accepted"
                    ? "Escanea al vendedor"
                    : "Escanea al comprador"}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeVerification}
                accessibilityRole="button"
                accessibilityLabel="Cerrar escáner"
              >
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.scannerHelp}>
              {verificationItem?.status === "accepted"
                ? "El vendedor abre el QR del pedido. Al escanearlo queda registrada la recogida."
                : "El comprador abre el QR del pedido. Al escanearlo queda registrada la entrega."}
            </Text>

            {isFocused && verificationItem && cameraPermission?.granted ? (
              <View style={styles.cameraFrame}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={scanLocked ? undefined : onBarcodeScanned}
                />
                <View style={styles.scanMask} pointerEvents="none">
                  <QrCode size={72} color="#FFFFFF" />
                  <Text style={styles.scanMaskText}>Coloca el QR dentro del marco</Text>
                </View>
              </View>
            ) : (
              <View style={styles.permissionBox}>
                <QrCode size={32} color={colors.primary} />
                <Text style={styles.permissionText}>
                  Introduce el código de 8 cifras si no puedes usar la cámara.
                </Text>
                {cameraPermission?.canAskAgain ? (
                  <BigActionButton
                    label="Permitir cámara"
                    onPress={() => void requestCameraPermission()}
                  />
                ) : null}
              </View>
            )}

            <View style={styles.manualBox}>
              <Text style={styles.manualLabel}>O ESCRIBE EL CÓDIGO</Text>
              <TextInput
                value={manualProof}
                onChangeText={setManualProof}
                style={styles.codeInput}
                placeholder="00000000"
                placeholderTextColor={colors.mutedText}
                keyboardType="number-pad"
                maxLength={8}
                autoCorrect={false}
                accessibilityLabel="Código de verificación de entrega"
              />
              {verificationError ? (
                <Text style={styles.error}>{verificationError}</Text>
              ) : null}
              <BigActionButton
                label="Verificar"
                busy={Boolean(verificationItem && busyId === verificationItem.id)}
                disabled={manualProof.trim().length !== 8 || busyId !== null}
                onPress={() =>
                  verificationItem
                    ? void verifyCheckpoint(verificationItem, manualProof)
                    : undefined
                }
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingBottom: 36, gap: 12 },
  centered: { flex: 1, justifyContent: "center", backgroundColor: colors.background, padding: 18, gap: 14 },
  heading: { gap: 3 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  title: { color: colors.text, fontSize: 27, lineHeight: 33, fontWeight: "900" },
  subtitle: { color: colors.mutedText, fontSize: 13, fontWeight: "600" },
  error: { color: colors.danger, fontWeight: "700", lineHeight: 19 },
  deliveryBlock: { gap: 8 },
  privateContactRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  privateContactButton: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 10,
  },
  privateContactText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  networkBonus: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    paddingHorizontal: 4,
  },
  demoSection: {
    marginTop: 10,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: 12,
  },
  demoHeading: { gap: 3 },
  demoEyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  demoTitle: { color: colors.text, fontSize: 21, lineHeight: 27, fontWeight: "900" },
  demoIntro: { color: colors.mutedText, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  demoItem: { gap: 8 },
  addresses: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, padding: 12, gap: 12 },
  addressRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  addressCopy: { flex: 1, gap: 2 },
  addressLabel: { color: colors.mutedText, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  addressText: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  selectedDelivery: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    paddingLeft: 8,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(20, 25, 24, 0.58)",
  },
  scannerSheet: {
    width: "100%",
    maxWidth: 720,
    maxHeight: "94%",
    alignSelf: "center",
    gap: 14,
    padding: 18,
    paddingBottom: 28,
    backgroundColor: colors.background,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  demoSheet: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    gap: 14,
    padding: 18,
    paddingBottom: 28,
    backgroundColor: colors.background,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  demoRouteTitle: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "900" },
  demoRoute: { color: colors.mutedText, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  demoProgress: { flexDirection: "row", gap: 6 },
  demoProgressStep: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.cardBorder,
  },
  demoProgressStepDone: { backgroundColor: colors.primary },
  demoAmountRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.cardBorder,
  },
  demoAmountLabel: { color: colors.mutedText, fontSize: 13, fontWeight: "800" },
  demoAmount: { color: colors.primary, fontSize: 25, fontWeight: "900" },
  demoDisclaimer: {
    color: colors.mutedText,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    fontWeight: "600",
  },
  scannerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  scannerTitleGroup: { flex: 1, gap: 2 },
  scannerEyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  scannerTitle: { color: colors.text, fontSize: 23, lineHeight: 29, fontWeight: "900" },
  scannerHelp: { color: colors.mutedText, lineHeight: 20, fontWeight: "600" },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  cameraFrame: {
    width: "100%",
    aspectRatio: 1.2,
    maxHeight: 440,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: colors.brandDark,
  },
  scanMask: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  scanMaskText: {
    color: "#FFFFFF",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    fontWeight: "900",
  },
  permissionBox: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  permissionText: { color: colors.mutedText, textAlign: "center", fontWeight: "700" },
  manualBox: { gap: 9 },
  manualLabel: { color: colors.mutedText, fontSize: 11, fontWeight: "900" },
  codeInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    backgroundColor: colors.card,
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0,
  },
});
