import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, MapPin, Navigation } from "lucide-react-native";

import { apiAuthPatch, apiAuthPost, type AllwainParticipation } from "../../config/api";
import { BigActionButton } from "../../components/design-system";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";
import { getAllwainCurrentLocation } from "../../utils/currentLocation";
import { trackAnalyticsEvent } from "../../analytics";

const radii = [1, 5, 10, 20, 50] as const;

export default function ConnectorActivationScreen() {
  const navigation = useNavigation<any>();
  const setParticipation = useAuthStore((state) => state.setParticipation);
  const connector = useAuthStore((state) => state.user?.participation?.connector);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [radiusKm, setRadiusKm] = useState<(typeof radii)[number]>(connector?.radiusKm || 5);
  const [available, setAvailable] = useState(Boolean(connector?.available));
  const [locationLabel, setLocationLabel] = useState(connector?.locationLabel || "");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRadiusKm(connector?.radiusKm || 5);
    setAvailable(Boolean(connector?.available));
    setLocationLabel(connector?.locationLabel || "");
    setCoordinates(null);
  }, [
    connector?.available,
    connector?.locationLabel,
    connector?.radiusKm,
  ]);

  async function fillCurrentLocation() {
    setLocating(true);
    setError(null);
    try {
      const location = await getAllwainCurrentLocation();
      setCoordinates({ latitude: location.latitude, longitude: location.longitude });
      setLocationLabel(location.locationLabel);
    } catch (locationError: any) {
      setError(locationError?.message || "No pudimos obtener tu ubicación.");
    } finally {
      setLocating(false);
    }
  }

  function continueFromLocation() {
    if (!locationLabel.trim()) {
      setError("Escribe tu municipio o zona habitual.");
      return;
    }
    setError(null);
    setStep(2);
  }

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
          available,
          radiusKm,
          locationLabel: locationLabel.trim(),
          latitude: coordinates?.latitude,
          longitude: coordinates?.longitude,
      };
      const participation = connector?.enabled
        ? await apiAuthPatch<AllwainParticipation>(
            "/allwain/participation/connector",
            payload,
          )
        : await apiAuthPost<AllwainParticipation>(
            "/allwain/participation/connector/activate",
            payload,
          );
      if (
        !participation.connector.enabled ||
        participation.connector.radiusKm !== radiusKm ||
        participation.connector.locationLabel !== locationLabel.trim() ||
        participation.connector.available !== available
      ) {
        throw new Error("El servidor no confirmó todos los cambios de Conector.");
      }
      await setParticipation(participation);
      if (!connector?.enabled) {
        void trackAnalyticsEvent("connector_activated", { radius_km: radiusKm });
      }
      navigation.navigate("MainTabs", { screen: "Inicio" });
    } catch (activationError: any) {
      setError(activationError?.message || "No pudimos activar Conector.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.progressRow}>
        <Text style={styles.eyebrow}>{connector?.enabled ? "AJUSTAR CONECTOR" : "ACTIVAR CONECTOR"}</Text>
        <Text style={styles.progressText}>{step} de 3</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${step * 33.333}%` }]} />
      </View>

      {step === 1 ? (
        <View style={styles.step}>
          <View style={styles.iconBox}><MapPin size={26} color={colors.buttonText} /></View>
          <Text style={styles.title}>¿En qué zona puedes ayudar?</Text>
          <TextInput
            accessibilityLabel="Municipio o zona"
            style={styles.input}
            value={locationLabel}
            onChangeText={(value) => {
              setLocationLabel(value);
              setCoordinates(null);
            }}
            placeholder="Foios, València..."
            placeholderTextColor={colors.mutedText}
            maxLength={120}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Usar mi zona actual"
            accessibilityState={{ disabled: locating, busy: locating }}
            style={styles.locationButton}
            onPress={() => void fillCurrentLocation()}
            disabled={locating}
          >
            {locating ? <ActivityIndicator color={colors.primary} /> : <><Navigation size={18} color={colors.primary} /><Text style={styles.locationText}>Usar mi zona actual</Text></>}
          </TouchableOpacity>
          <Text style={styles.privacy}>Solo guardamos una zona aproximada. Tu ubicación exacta no se muestra.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <BigActionButton label="Siguiente" onPress={continueFromLocation} />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.step}>
          <BackButton onPress={() => setStep(1)} />
          <Text style={styles.title}>¿Hasta dónde quieres hacer entregas?</Text>
          <View style={styles.radiusControl}>
            {radii.map((radius) => {
              const selected = radius === radiusKm;
              return (
                <TouchableOpacity
                  key={radius}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${radius} kilómetros`}
                  onPress={() => setRadiusKm(radius)}
                  style={[styles.radiusOption, selected && styles.radiusSelected]}
                >
                  <Text style={[styles.radiusText, selected && styles.radiusSelectedText]}>{radius}</Text>
                  <Text style={[styles.radiusUnit, selected && styles.radiusSelectedText]}>km</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <BigActionButton label="Siguiente" onPress={() => setStep(3)} />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.step}>
          <BackButton onPress={() => setStep(2)} />
          <Text style={styles.title}>¿Puedes hacer entregas ahora?</Text>
          <View style={styles.availability}>
            <View style={styles.availabilityCopy}>
              <Text style={styles.availabilityTitle}>{available ? "Sí, estoy disponible" : "Ahora no"}</Text>
              <Text style={styles.privacy}>Podrás cambiarlo cuando quieras.</Text>
            </View>
            <Switch value={available} onValueChange={setAvailable} trackColor={{ false: colors.cardBorder, true: colors.primary }} thumbColor={colors.card} />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <BigActionButton label={connector?.enabled ? "Guardar cambios" : "Activar Conector"} busy={busy} onPress={() => void activate()} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.back} onPress={onPress}>
      <ArrowLeft size={18} color={colors.text} />
      <Text style={styles.backText}>Atrás</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 620, alignSelf: "center", padding: 18, paddingBottom: 36, gap: 14 },
  progressRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  progressText: { color: colors.mutedText, fontSize: 12, fontWeight: "800" },
  progressTrack: { height: 4, backgroundColor: colors.cardBorder, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: colors.primary },
  step: { gap: 15, marginTop: 18 },
  iconBox: { width: 52, height: 52, borderRadius: 8, backgroundColor: colors.connector, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 27, lineHeight: 33, fontWeight: "900" },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, paddingHorizontal: 13, color: colors.text, backgroundColor: colors.card, fontSize: 17 },
  locationButton: { minHeight: 46, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  locationText: { color: colors.primary, fontWeight: "900" },
  privacy: { color: colors.mutedText, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  error: { color: colors.danger, fontWeight: "700" },
  back: { alignSelf: "flex-start", minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6 },
  backText: { color: colors.text, fontWeight: "800" },
  radiusControl: { height: 70, flexDirection: "row", borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, overflow: "hidden", backgroundColor: colors.card },
  radiusOption: { flex: 1, alignItems: "center", justifyContent: "center", borderRightWidth: 1, borderRightColor: colors.cardBorder },
  radiusSelected: { backgroundColor: colors.connector },
  radiusText: { color: colors.text, fontSize: 18, fontWeight: "900" },
  radiusUnit: { color: colors.mutedText, fontSize: 10, fontWeight: "700", marginTop: 2 },
  radiusSelectedText: { color: colors.buttonText },
  availability: { minHeight: 82, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  availabilityCopy: { flex: 1, gap: 3 },
  availabilityTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
});
