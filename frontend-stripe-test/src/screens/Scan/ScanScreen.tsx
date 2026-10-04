import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { BarcodeScanningResult, CameraCapturedPicture, CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useIsFocused } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { X } from "lucide-react-native";
import { rememberScanCapture } from "../../utils/scanCaptureMemory";

type Props = NativeStackScreenProps<RootStackParamList, "Scan">;

const PRODUCT_BARCODE_TYPES = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "itf14",
] as const;

function pictureDataUrl(picture: CameraCapturedPicture) {
  const value = picture.base64 || picture.uri || "";
  if (!value) return null;
  if (value.startsWith("data:image/")) return value;
  const mimeType = picture.format === "png" ? "image/png" : "image/jpeg";
  return `data:${mimeType};base64,${value}`;
}

function cleanProductBarcode(value: string) {
  const clean = value.replace(/\s/g, "").trim();
  return /^\d{8,14}$/.test(clean) ? clean : "";
}

export default function ScanScreen({ navigation }: Props) {
  const isFocused = useIsFocused();
  const cameraRef = React.useRef<CameraView | null>(null);
  const barcodeRef = React.useRef("");
  const [permission, requestCameraPermission] = useCameraPermissions();
  const [rawText, setRawText] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [pickingGallery, setPickingGallery] = React.useState(false);
  const [requestingCamera, setRequestingCamera] = React.useState(false);
  const [cameraEnabled, setCameraEnabled] = React.useState(false);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [analysisError, setAnalysisError] = React.useState<string | null>(null);
  const [capturing, setCapturing] = React.useState(false);

  React.useEffect(() => {
    barcodeRef.current = barcode;
  }, [barcode]);

  async function enableEmbeddedCamera() {
    try {
      setRequestingCamera(true);
      setCameraError(null);
      const nextPermission = permission?.granted
        ? permission
        : await requestCameraPermission();

      if (!nextPermission.granted) {
        setCameraError(
          nextPermission.canAskAgain
            ? "Necesitamos permiso para mostrar la cámara aquí."
            : "El permiso de cámara está bloqueado. Actívalo en los ajustes del navegador o del teléfono."
        );
        return;
      }

      setCameraEnabled(true);
      setCameraReady(false);
      setAnalysisError(null);
    } catch {
      setCameraError("No pudimos iniciar la cámara en este dispositivo.");
    } finally {
      setRequestingCamera(false);
    }
  }

  function closeEmbeddedCamera() {
    setCameraEnabled(false);
    setCameraReady(false);
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    const detected = cleanProductBarcode(result.data);
    if (!detected || detected === barcodeRef.current) return;
    barcodeRef.current = detected;
    setBarcode(detected);
  }

  async function capturePhoto() {
    if (!cameraRef.current || capturing || !cameraReady || !isFocused) return;

    setCapturing(true);
    setAnalysisError(null);

    try {
      const picture = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.72,
        skipProcessing: false,
      });
      const imageBase64 = pictureDataUrl(picture);
      if (!imageBase64) throw new Error("EMPTY_CAMERA_FRAME");

      closeEmbeddedCamera();
      navigation.navigate("ScanResult", rememberScanCapture({
        imageBase64,
        barcode: barcodeRef.current || undefined,
        sourceType: "camera",
      }));
    } catch (error) {
      setAnalysisError(
        error instanceof Error && error.message === "SESSION_EXPIRED"
          ? "La sesión ha caducado. Vuelve a identificarte."
          : "No pudimos tomar la foto. Mantén el producto bien encuadrado y vuelve a intentarlo."
      );
    } finally {
      setCapturing(false);
    }
  }

  async function pickFromGallery() {
    try {
      setPickingGallery(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        base64: true,
        quality: 0.75,
        allowsEditing: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;

      const asset = result.assets[0];
      const mimeType = asset.mimeType || "image/jpeg";
      closeEmbeddedCamera();
      navigation.navigate("ScanResult", rememberScanCapture({
        imageBase64: `data:${mimeType};base64,${asset.base64}`,
        sourceType: "image",
      }));
    } catch {
      setAnalysisError("No pudimos leer la imagen. Prueba de nuevo con una imagen más nítida y cercana.");
    } finally {
      setPickingGallery(false);
    }
  }

  function startManualAnalysis() {
    const cleanText = rawText.trim();
    const cleanBarcodeValue = barcode.trim();
    if (!cleanText && !cleanBarcodeValue) {
      setAnalysisError("Introduce una descripción, texto OCR o un código de barras.");
      return;
    }

    setAnalysisError(null);
    closeEmbeddedCamera();
    navigation.navigate("ScanResult", rememberScanCapture({
      rawText: cleanText || undefined,
      barcode: cleanBarcodeValue || undefined,
      sourceType: cleanBarcodeValue && !cleanText ? "barcode" : "text",
    }));
  }

  const cameraActive = Boolean(cameraEnabled && permission?.granted && isFocused);
  const liveStatus = cameraError
    ? "Cámara no disponible"
    : !cameraReady
      ? "Preparando cámara"
      : "Lista para una foto";

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.flowStrip}>
          <View style={styles.flowItem}>
            <View style={[styles.flowNumber, styles.flowNumberActive]}>
              <Text style={styles.flowNumberActiveText}>1</Text>
            </View>
            <Text style={[styles.flowLabel, styles.flowLabelActive]}>Captura</Text>
          </View>
          <View style={styles.flowItem}>
            <View style={styles.flowNumber}><Text style={styles.flowNumberText}>2</Text></View>
            <Text style={styles.flowLabel}>Revisar ficha</Text>
          </View>
          <View style={styles.flowItem}>
            <View style={styles.flowNumber}><Text style={styles.flowNumberText}>3</Text></View>
            <Text style={styles.flowLabel}>Lanzamiento</Text>
          </View>
        </View>

        <View style={styles.headingBlock}>
          <Text style={styles.title}>Analiza el producto</Text>
          <Text style={styles.subtitle}>
            Encuadra el producto completo o acerca su etiqueta. Allwain reconocerá el objeto, leerá el texto y preparará una ficha que podrás corregir.
          </Text>
        </View>

        <View style={styles.capturePanel}>
          <View style={styles.cameraFrame}>
            {cameraActive ? (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="back"
                mode="picture"
                ratio="4:3"
                active={isFocused}
                animateShutter={false}
                barcodeScannerSettings={{ barcodeTypes: [...PRODUCT_BARCODE_TYPES] }}
                onBarcodeScanned={handleBarcodeScanned}
                onCameraReady={() => {
                  setCameraReady(true);
                  setCameraError(null);
                }}
                onMountError={(event) => {
                  setCameraReady(false);
                  setCameraError(event.message || "No pudimos iniciar la cámara.");
                }}
              />
            ) : (
              <View style={styles.cameraPlaceholder}>
                <Text style={styles.frameTitle}>Cámara integrada</Text>
                <Text style={styles.frameText}>
                  El producto aparecerá aquí sin salir de Allwain.
                </Text>
              </View>
            )}

            <View style={styles.cameraOverlay} pointerEvents="none">
              {cameraActive ? (
                <View style={styles.liveBadge}>
                  <View style={[styles.liveDot, cameraReady && styles.liveDotReady]} />
                  <Text style={styles.liveBadgeText}>{liveStatus}</Text>
                </View>
              ) : null}
              <View style={styles.scanWindow}>
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
            </View>
            {cameraActive ? (
              <TouchableOpacity
                style={styles.cameraExitButton}
                activeOpacity={0.86}
                accessibilityRole="button"
                accessibilityLabel="Cerrar cámara"
                onPress={closeEmbeddedCamera}
              >
                <X size={18} color="#FFFFFF" strokeWidth={2.6} />
                <Text style={styles.cameraExitText}>Cerrar</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {cameraError ? <Text style={styles.errorText}>{cameraError}</Text> : null}
          {analysisError ? <Text style={styles.errorText}>{analysisError}</Text> : null}

          {cameraActive ? (
            <View style={styles.waitingRow}>
              <Text style={styles.waitingText}>
                {cameraReady
                  ? "Cuando el producto esté completo y nítido, haz una foto."
                  : "Conectando con la cámara…"}
              </Text>
            </View>
          ) : null}

          {!cameraEnabled ? (
            <TouchableOpacity
              style={[styles.cameraButton, requestingCamera && styles.disabledButton]}
              activeOpacity={0.9}
              disabled={requestingCamera}
              onPress={enableEmbeddedCamera}
            >
              <Text style={styles.cameraButtonText}>
                {requestingCamera ? "Activando cámara…" : "Activar cámara"}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.cameraButton,
                  (!cameraReady || capturing) && styles.disabledButton,
                ]}
                activeOpacity={0.9}
                disabled={!cameraReady || capturing}
                onPress={() => void capturePhoto()}
              >
                {capturing ? (
                  <ActivityIndicator color={colors.buttonText} />
                ) : (
                  <Text style={styles.cameraButtonText}>Hacer foto y reconocer</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.compactButton}
                activeOpacity={0.85}
                onPress={closeEmbeddedCamera}
              >
                <Text style={styles.compactButtonText}>Cancelar cámara</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={[styles.galleryButton, pickingGallery && styles.disabledButton]}
            activeOpacity={0.9}
            disabled={pickingGallery}
            onPress={pickFromGallery}
          >
            <Text style={styles.galleryButtonText}>
              {pickingGallery ? "Abriendo galería…" : "Elegir de la galería"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>O INTRODUCE LOS DATOS</Text>
          <View style={styles.divider} />
        </View>

        <View style={styles.manualSection}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Descripción o texto OCR</Text>
            <TextInput
              value={rawText}
              onChangeText={setRawText}
              placeholder={[
                "Producto: Café cold brew 250 ml",
                "Cantidad: 48 unidades",
                "Precio objetivo: 1,35 EUR",
                "Plazo de entrega: en 7 días",
              ].join("\n")}
              placeholderTextColor="#8B9290"
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textArea]}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Código de barras o EAN</Text>
            <TextInput
              value={barcode}
              onChangeText={setBarcode}
              placeholder="8412345678901"
              placeholderTextColor="#8B9290"
              keyboardType="number-pad"
              style={styles.input}
            />
          </View>

          <TouchableOpacity style={styles.analyzeButton} activeOpacity={0.9} onPress={startManualAnalysis}>
            <Text style={styles.analyzeButtonText}>Crear ficha con estos datos</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.privacyText}>
          La foto se analiza una sola vez. Allwain conserva la ficha resultante, no una secuencia de imágenes.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFFFFF" },
  container: { flex: 1, backgroundColor: "#F5F7F6" },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingBottom: 40, gap: 16 },
  topBar: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#E2E7E5" },
  backButton: { minWidth: 58, minHeight: 40, justifyContent: "center" },
  backButtonText: { color: colors.primary, fontWeight: "800" },
  topBarTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  topBarSpacer: { minWidth: 58 },
  flowStrip: { flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: "#E2E7E5", backgroundColor: "#FFFFFF", paddingVertical: 8 },
  flowItem: { flex: 1, minHeight: 58, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  flowNumber: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#BCC5C2" },
  flowNumberActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  flowNumberText: { color: "#6D7774", fontWeight: "900", fontSize: 12 },
  flowNumberActiveText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },
  flowLabel: { marginTop: 5, color: "#6D7774", fontWeight: "700", fontSize: 11, textAlign: "center" },
  flowLabelActive: { color: colors.text },
  headingBlock: { gap: 5 },
  title: { color: colors.text, fontSize: 24, fontWeight: "900" },
  subtitle: { color: colors.mutedText, fontWeight: "600", lineHeight: 20, fontSize: 14 },
  capturePanel: { backgroundColor: "#172F2A", borderRadius: 8, padding: 12, gap: 10 },
  cameraFrame: { width: "100%", aspectRatio: 4 / 3, borderRadius: 7, overflow: "hidden", backgroundColor: "#0D1E1A" },
  cameraPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 44, gap: 7 },
  frameTitle: { color: "#FFFFFF", fontWeight: "900", fontSize: 18, textAlign: "center" },
  frameText: { color: "#C8DAD4", fontWeight: "600", lineHeight: 19, textAlign: "center" },
  cameraOverlay: { ...StyleSheet.absoluteFillObject, padding: 12, justifyContent: "space-between" },
  cameraExitButton: {
    position: "absolute",
    right: 12,
    top: 12,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 6,
    paddingHorizontal: 9,
    backgroundColor: "rgba(10, 29, 24, 0.88)",
  },
  cameraExitText: { color: "#FFFFFF", fontWeight: "900", fontSize: 11 },
  liveBadge: { alignSelf: "flex-start", minHeight: 28, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 6, paddingHorizontal: 9, backgroundColor: "rgba(10, 29, 24, 0.82)" },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF6B57" },
  liveDotReady: { backgroundColor: "#70D3B9" },
  liveBadgeText: { color: "#FFFFFF", fontWeight: "800", fontSize: 11 },
  scanWindow: { position: "absolute", left: "9%", right: "9%", top: "20%", bottom: "25%" },
  corner: { position: "absolute", width: 28, height: 28, borderColor: "#FFFFFF" },
  cornerTopLeft: { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3 },
  cornerTopRight: { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3 },
  cornerBottomLeft: { left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3 },
  cornerBottomRight: { right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3 },
  cameraProgressCard: { alignSelf: "stretch", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "rgba(10, 29, 24, 0.86)", gap: 6 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  progressTitle: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },
  progressMeta: { color: "#D7E7E2", fontWeight: "700", fontSize: 10 },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.22)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: "#70D3B9" },
  errorText: { color: "#FFD0C8", fontWeight: "700", fontSize: 12, lineHeight: 17 },
  analysisSummary: { gap: 8, paddingVertical: 2 },
  analysisHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  analysisHeadingCopy: { flex: 1, gap: 2 },
  analysisEyebrow: { color: "#90B6AC", fontWeight: "900", fontSize: 9 },
  analysisName: { color: "#FFFFFF", fontWeight: "900", fontSize: 16, lineHeight: 20 },
  signalRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  signalChip: { borderRadius: 5, backgroundColor: "#28483F", paddingHorizontal: 8, paddingVertical: 5 },
  visualSignalChip: { borderWidth: 1, borderColor: "#52776D", backgroundColor: "transparent" },
  signalChipText: { color: "#E8F1EE", fontWeight: "800", fontSize: 10 },
  barcodeText: { color: "#A8D7CB", fontWeight: "800", fontSize: 11 },
  waitingRow: { minHeight: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  waitingText: { color: "#D9E6E2", fontWeight: "700", fontSize: 12 },
  cameraButton: { minHeight: 50, borderRadius: 8, backgroundColor: colors.button, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  cameraButtonText: { color: colors.buttonText, fontWeight: "900", fontSize: 15, textAlign: "center" },
  cameraControlsRow: { flexDirection: "row", gap: 8 },
  compactButton: { flex: 1, minHeight: 42, borderRadius: 7, borderWidth: 1, borderColor: "#62847A", alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  compactButtonText: { color: "#E8F1EE", fontWeight: "800", fontSize: 12, textAlign: "center" },
  galleryButton: { minHeight: 46, borderRadius: 8, borderWidth: 1, borderColor: "#8AA39C", alignItems: "center", justifyContent: "center" },
  galleryButtonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
  disabledButton: { opacity: 0.55 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  divider: { flex: 1, height: 1, backgroundColor: "#D8DEDC" },
  dividerText: { color: "#7B8582", fontWeight: "900", fontSize: 10 },
  manualSection: { backgroundColor: "#FFFFFF", borderRadius: 8, borderWidth: 1, borderColor: "#E2E7E5", padding: 14, gap: 12 },
  fieldGroup: { gap: 5 },
  label: { color: colors.text, fontWeight: "800", fontSize: 13 },
  input: { minHeight: 46, borderWidth: 1, borderColor: "#C9D1CE", borderRadius: 7, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, backgroundColor: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  textArea: { minHeight: 132 },
  analyzeButton: { minHeight: 48, borderRadius: 8, backgroundColor: colors.button, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  analyzeButtonText: { color: colors.buttonText, fontWeight: "900", fontSize: 14, textAlign: "center" },
  privacyText: { color: "#6D7774", fontWeight: "600", fontSize: 12, lineHeight: 17, textAlign: "center" },
});
