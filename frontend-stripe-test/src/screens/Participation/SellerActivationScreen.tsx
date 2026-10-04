import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { ArrowLeft, MapPin, Navigation, Store } from "lucide-react-native";

import {
  apiGet,
  apiAuthPatch,
  apiAuthGet,
  apiAuthPost,
  type AllwainPaymentConfig,
  type AllwainParticipation,
} from "../../config/api";
import PayoutSetupPanel from "../../components/PayoutSetupPanel";
import SellerFiscalProfilePanel from "../../components/SellerFiscalProfilePanel";
import { BigActionButton } from "../../components/design-system";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../../navigation/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { clearJourneyDraft, readJourneyDraft, writeJourneyDraft } from "../../utils/journeyDrafts";
import { safeJourney } from "../../utils/pendingJourney";
import { getAllwainCurrentLocation } from "../../utils/currentLocation";
import {
  isAllwainLivePaymentEnvironment,
  isAllwainStripeTestMarketplace,
} from "../../utils/allwainPaymentEnvironment";

type Coordinates = { latitude: number; longitude: number };

const SELLER_TYPE_LABELS: Record<string, string> = {
  producer: "Agricultor o productor",
  professional: "Profesional",
  self_employed: "Autónomo",
  shop: "Comercio",
  company: "Empresa",
  other: "Otra actividad",
};

function sellerTypeLabel(value?: string | null) {
  if (!value) return "Actividad sin indicar";
  return SELLER_TYPE_LABELS[value] || "Otra actividad";
}

type ActivationDraft = { step: 1 | 2 | 3; sellerType: string; displayName: string; locationLabel: string; shippingPostalCode: string; shippingCity: string };
type ActivationSource = { requestId?: string; shoppingListId?: string };

export default function SellerActivationScreen() {
  const currentNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const navigation = currentNavigation.getState().routeNames.includes("ActivateSeller") ? currentNavigation : currentNavigation.getParent<NativeStackNavigationProp<RootStackParamList>>() || currentNavigation;
  const route = useRoute<RouteProp<RootStackParamList, "ActivateSeller">>();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const nameInput = useRef<TextInput>(null);
  const locationInputs = useRef<Record<string, TextInput | null>>({});
  const leavingWizard = useRef(false);
  const user = useAuthStore((state) => state.user);
  const setAppMode = useAuthStore((state) => state.setAppMode);
  const setParticipation = useAuthStore((state) => state.setParticipation);
  const seller = user?.participation?.seller;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sellerType, setSellerType] = useState(seller?.sellerType || "producer");
  const [displayName, setDisplayName] = useState(seller?.displayName || user?.name || "");
  const [locationLabel, setLocationLabel] = useState(seller?.locationLabel || "");
  const [pickupAddress, setPickupAddress] = useState(seller?.pickupAddress || "");
  const [shippingPostalCode, setShippingPostalCode] = useState(
    seller?.shippingPostalCode || "",
  );
  const [shippingCity, setShippingCity] = useState(seller?.shippingCity || "");
  const [shippingPhone, setShippingPhone] = useState(seller?.shippingPhone || "");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [editingLocation, setEditingLocation] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paymentConfig, setPaymentConfig] =
    useState<AllwainPaymentConfig | null>(null);
  const [paymentConfigSettled, setPaymentConfigSettled] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [source, setSource] = useState<ActivationSource>(() => (safeJourney({ name: "ActivateSeller", params: route.params })?.params || {}) as ActivationSource);

  const testMarketplace = isAllwainStripeTestMarketplace(paymentConfig);
  const livePaymentEnvironment = isAllwainLivePaymentEnvironment(paymentConfig);

  const activationStarted = useMemo(
    () => Boolean(seller?.status && seller.status !== "not_activated"),
    [seller?.status],
  );

  useEffect(() => {
    let active = true;
    if (!user?.id) return;
    void Promise.all([readJourneyDraft<ActivationDraft>(user.id, "seller-activation"), readJourneyDraft<ActivationSource>(user.id, "seller-activation-intent")]).then(([draft, savedSource]) => {
      if (!active) return;
      if (draft && !activationStarted) {
        setStep([1, 2, 3].includes(draft.step) ? draft.step : 1);
        setSellerType(draft.sellerType || "producer"); setDisplayName(draft.displayName || "");
        setLocationLabel(draft.locationLabel || ""); setShippingPostalCode(draft.shippingPostalCode || ""); setShippingCity(draft.shippingCity || "");
        setNotice("Borrador recuperado. Por privacidad, vuelve a indicar dirección exacta y teléfono si hacen falta.");
      }
      if (!route.params?.requestId && !route.params?.shoppingListId && savedSource) setSource((safeJourney({ name: "ActivateSeller", params: savedSource })?.params || {}) as ActivationSource);
      setDraftReady(true);
    });
    return () => { active = false; };
  }, [user?.id]);
  useEffect(() => {
    const next = safeJourney({ name: "ActivateSeller", params: route.params })?.params as ActivationSource | undefined;
    if (next?.requestId || next?.shoppingListId) setSource(next);
  }, [route.params?.requestId, route.params?.shoppingListId]);
  useEffect(() => {
    if (!draftReady || !user?.id) return;
    if (source.requestId || source.shoppingListId) void writeJourneyDraft(user.id, "seller-activation-intent", source);
    if (!activationStarted) void writeJourneyDraft(user.id, "seller-activation", { step, sellerType, displayName, locationLabel, shippingPostalCode, shippingCity });
  }, [draftReady, user?.id, activationStarted, source, step, sellerType, displayName, locationLabel, shippingPostalCode, shippingCity]);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); setError(null); }, [step]);
  useEffect(() => navigation.addListener("beforeRemove", (event) => {
    if (!leavingWizard.current && !activationStarted && step > 1 && ["GO_BACK", "POP"].includes(event.data.action.type)) {
      event.preventDefault(); setStep((current) => (current - 1) as 1 | 2 | 3);
    }
  }), [activationStarted, step, navigation]);

  async function continueSource() {
    if (!seller?.enabled) return;
    await setAppMode("sell");
    if (useAuthStore.getState().user?.id !== user?.id) return;
    if (user?.id) await clearJourneyDraft(user.id, "seller-activation-intent");
    if (source.shoppingListId) navigation.replace("ShoppingLists", { shoppingListId: source.shoppingListId, mode: "sell" });
    else navigation.replace("MainTabs", { screen: "Ofertas", params: source.requestId ? { requestId: source.requestId } : { section: "offers" } });
  }

  async function discardDraft() {
    if (user?.id) {
      await clearJourneyDraft(user.id, "seller-activation");
      await clearJourneyDraft(user.id, "seller-activation-intent");
    }
    setDraftReady(false);
    leavingWizard.current = true;
    navigation.canGoBack() ? navigation.goBack() : navigation.replace("MainTabs");
  }

  useEffect(() => {
    if (editingIdentity || editingLocation) return;
    setSellerType(seller?.sellerType || "producer");
    setDisplayName(seller?.displayName || user?.name || "");
    setLocationLabel(seller?.locationLabel || "");
    setPickupAddress(seller?.pickupAddress || "");
    setShippingPostalCode(seller?.shippingPostalCode || "");
    setShippingCity(seller?.shippingCity || "");
    setShippingPhone(seller?.shippingPhone || "");
    setCoordinates(null);
  }, [
    editingIdentity,
    editingLocation,
    seller?.displayName,
    seller?.locationLabel,
    seller?.pickupAddress,
    seller?.shippingPostalCode,
    seller?.shippingCity,
    seller?.shippingPhone,
    seller?.sellerType,
    user?.name,
  ]);

  useEffect(() => {
    let current = true;
    apiGet<AllwainPaymentConfig>("/allwain/payments/config")
      .then((config) => {
        if (current) setPaymentConfig(config);
      })
      .catch(() => {
        if (current) setPaymentConfig(null);
      })
      .finally(() => {
        if (current) setPaymentConfigSettled(true);
      });
    return () => {
      current = false;
    };
  }, []);

  const refreshParticipation = useCallback(async () => {
    const accountId = user?.id;
    if (!accountId || useAuthStore.getState().user?.id !== accountId) return;
    const participation = await apiAuthGet<AllwainParticipation>("/allwain/participation");
    if (useAuthStore.getState().user?.id !== accountId) return;
    await setParticipation(participation);
  }, [setParticipation, user?.id]);

  function validateLocation() {
    if (!locationLabel.trim()) {
      setError("Escribe el municipio o zona de salida.");
      locationInputs.current.locationLabel?.focus();
      return false;
    }
    if (!pickupAddress.trim()) {
      setError("Escribe la dirección donde se recogerán los pedidos.");
      locationInputs.current.pickupAddress?.focus();
      return false;
    }
    if (shippingPostalCode.trim().length < 3) {
      setError("Escribe el código postal desde el que salen los envíos.");
      locationInputs.current.shippingPostalCode?.focus();
      return false;
    }
    if (shippingCity.trim().length < 2) {
      setError("Escribe la localidad desde la que salen los envíos.");
      locationInputs.current.shippingCity?.focus();
      return false;
    }
    setError(null);
    return true;
  }

  async function fillCurrentLocation() {
    setLocating(true);
    setError(null);
    try {
      const location = await getAllwainCurrentLocation();
      setCoordinates({ latitude: location.latitude, longitude: location.longitude });
      setLocationLabel(location.locationLabel);
      if (location.address) setPickupAddress(location.address);
      if (location.postalCode) setShippingPostalCode(location.postalCode);
      if (location.city) setShippingCity(location.city);
    } catch (locationError: any) {
      setError(locationError?.message || "No pudimos obtener tu ubicación.");
    } finally {
      setLocating(false);
    }
  }

  function locationPayload() {
    return {
      locationLabel: locationLabel.trim(),
      pickupAddress: pickupAddress.trim(),
      shippingPostalCode: shippingPostalCode.trim().toUpperCase(),
      shippingCity: shippingCity.trim(),
      shippingCountryCode: "ES",
      shippingPhone: shippingPhone.trim() || undefined,
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
    };
  }

  async function activate() {
    if (busy) return;
    const accountId = user?.id;
    if (!accountId) return;
    if (!displayName.trim()) {
      setError("Escribe el nombre que verán los compradores.");
      return;
    }
    if (!validateLocation()) return;
    setBusy(true);
    setNotice(null);
    try {
      const participation = await apiAuthPost<AllwainParticipation>(
        "/allwain/participation/seller/activate",
        {
          sellerType,
          displayName: displayName.trim(),
          ...locationPayload(),
        },
      );
      if (
        participation.seller.status === "not_activated" ||
        participation.seller.displayName !== displayName.trim() ||
        participation.seller.sellerType !== sellerType
      ) {
        throw new Error("El servidor no confirmó la activación completa.");
      }
      if (useAuthStore.getState().user?.id !== accountId) return;
      await setParticipation(participation);
      if (user?.id) await clearJourneyDraft(user.id, "seller-activation");
      setNotice(
        testMarketplace
          ? "Vendedor activado en TEST. Ya puedes publicar ofertas y recibir pedidos de prueba."
          : "Vendedor activado. Completa los dos pasos restantes.",
      );
    } catch (activationError: any) {
      setError(activationError?.message || "No pudimos activar Vendedor.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLocation() {
    const accountId = user?.id;
    if (busy || !accountId) return;
    if (!validateLocation()) return;
    setBusy(true);
    setNotice(null);
    try {
      const participation = await apiAuthPatch<AllwainParticipation>(
        "/allwain/participation/seller",
        locationPayload(),
      );
      if (
        participation.seller.locationLabel !== locationLabel.trim() ||
        participation.seller.pickupAddress !== pickupAddress.trim()
      ) {
        throw new Error("El servidor no confirmó el punto de salida.");
      }
      if (useAuthStore.getState().user?.id !== accountId) return;
      await setParticipation(participation);
      setEditingLocation(false);
      setNotice("Punto de salida guardado.");
    } catch (saveError: any) {
      setError(saveError?.message || "No pudimos guardar el punto de salida.");
    } finally {
      setBusy(false);
    }
  }

  async function saveIdentity() {
    const accountId = user?.id;
    if (busy || !accountId) return;
    if (!displayName.trim()) {
      setError("Escribe el nombre que verán los compradores.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const participation = await apiAuthPatch<AllwainParticipation>(
        "/allwain/participation/seller",
        { sellerType, displayName: displayName.trim() },
      );
      if (
        participation.seller.sellerType !== sellerType ||
        participation.seller.displayName !== displayName.trim()
      ) {
        throw new Error("El servidor no confirmó los datos del vendedor.");
      }
      if (useAuthStore.getState().user?.id !== accountId) return;
      await setParticipation(participation);
      setEditingIdentity(false);
      setNotice("Datos del vendedor guardados.");
    } catch (saveError: any) {
      setError(saveError?.message || "No pudimos guardar los datos del vendedor.");
    } finally {
      setBusy(false);
    }
  }

  if (activationStarted) {
    if (!seller?.locationReady || !seller?.carrierReady || editingLocation) {
      return (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.eyebrow}>VENDEDOR</Text>
          <Text style={styles.title}>¿Desde dónde salen tus pedidos?</Text>
          <LocationFields
            inputRefs={locationInputs}
            locationLabel={locationLabel}
            pickupAddress={pickupAddress}
            shippingPostalCode={shippingPostalCode}
            shippingCity={shippingCity}
            shippingPhone={shippingPhone}
            locating={locating}
            onLocationLabel={(value) => {
              setLocationLabel(value);
              setCoordinates(null);
            }}
            onPickupAddress={(value) => {
              setPickupAddress(value);
              setCoordinates(null);
            }}
            onShippingPostalCode={setShippingPostalCode}
            onShippingCity={setShippingCity}
            onShippingPhone={setShippingPhone}
            onLocate={() => void fillCurrentLocation()}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <BigActionButton
            label="Guardar punto de salida"
            tone="dark"
            busy={busy}
            onPress={() => void saveLocation()}
          />
          {seller?.locationReady ? (
            <TouchableOpacity style={styles.cancelEdit} onPress={() => setEditingLocation(false)}>
              <Text style={styles.backText}>Cancelar</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      );
    }

    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>VENDEDOR</Text>
        <Text style={styles.title}>
          {testMarketplace
            ? "Tu espacio Vendedor está listo para probar"
            : seller?.sellerReady
              ? "Tu espacio Vendedor"
              : "Termina de activar Vendedor"}
        </Text>
        <Text style={styles.subtitle}>
          {testMarketplace
            ? "Publica cualquier oferta real y prueba compras online sin dinero real."
            : seller?.sellerReady
              ? "Tus datos y cobros están listos."
              : "Confirma quién vende y dónde recibirás tus cobros."}
        </Text>
        {seller?.enabled ? <BigActionButton label={source.requestId ? "Continuar con esta solicitud" : source.shoppingListId ? "Continuar con esta lista" : "Continuar a mis ofertas"} onPress={() => void continueSource()} /> : null}
        {editingIdentity ? (
          <View style={styles.identityEditor}>
            <Text style={styles.fieldLabel}>Actividad</Text>
            <View style={styles.pickerFrame}>
              <Picker selectedValue={sellerType} onValueChange={(value) => setSellerType(String(value))} style={styles.picker}>
                <Picker.Item label="Agricultor o productor" value="producer" />
                <Picker.Item label="Profesional" value="professional" />
                <Picker.Item label="Autónomo" value="self_employed" />
                <Picker.Item label="Comercio" value="shop" />
                <Picker.Item label="Empresa" value="company" />
                <Picker.Item label="Otra actividad" value="other" />
              </Picker>
            </View>
            <Text style={styles.fieldLabel}>Nombre público</Text>
            <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="Nombre comercial o profesional" placeholderTextColor={colors.mutedText} />
            <BigActionButton label="Guardar datos" tone="dark" busy={busy} onPress={() => void saveIdentity()} />
            <TouchableOpacity style={styles.cancelEdit} onPress={() => setEditingIdentity(false)}><Text style={styles.backText}>Cancelar</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.locationSummary}>
            <Store size={20} color={colors.primary} />
            <View style={styles.locationCopy}>
              <Text style={styles.locationTitle}>{seller?.displayName || displayName}</Text>
              <Text style={styles.privacy}>{sellerTypeLabel(seller?.sellerType || sellerType)}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setNotice(null);
                setError(null);
                setEditingIdentity(true);
              }}
              style={styles.editButton}
            >
              <Text style={styles.editText}>Cambiar</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.locationSummary}>
          <MapPin size={20} color={colors.primary} />
          <View style={styles.locationCopy}>
            <Text style={styles.locationTitle}>{seller.locationLabel}</Text>
            <Text style={styles.privacy}>{seller.pickupAddress}</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setNotice(null);
              setError(null);
              setEditingLocation(true);
            }}
            style={styles.editButton}
          >
            <Text style={styles.editText}>Cambiar</Text>
          </TouchableOpacity>
        </View>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!paymentConfigSettled ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.privacy}>Comprobando el entorno de pagos…</Text>
          </View>
        ) : testMarketplace ? (
          <View style={styles.testReadyCard} accessibilityRole="summary">
            <View style={styles.testReadyHeading}>
              <View style={styles.testPulse} />
              <Text style={styles.testReadyTitle}>Stripe TEST activo</Text>
            </View>
            <Text style={styles.testReadyText}>
              No necesitas datos fiscales ni cuenta bancaria. No hay dinero real,
              documentos fiscales ni transferencias al vendedor.
            </Text>
            <Text style={styles.testReadyText}>
              La foto puede ser ilustrativa; la oferta seguirá activa y comprable
              igual que cualquier otra oferta real de usuario.
            </Text>
          </View>
        ) : livePaymentEnvironment ? (
          <>
            <SellerFiscalProfilePanel onSaved={refreshParticipation} />
            <PayoutSetupPanel onStatusChange={refreshParticipation} />
          </>
        ) : (
          <View style={styles.testReadyCard} accessibilityRole="summary">
            <Text style={styles.testReadyTitle}>Cobros no disponibles</Text>
            <Text style={styles.testReadyText}>
              No se solicitarán datos fiscales ni bancarios hasta que el servidor
              confirme un entorno de pagos válido.
            </Text>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={styles.wizardHeading}>
      <View style={styles.progressRow}>
        <Text style={styles.eyebrow}>ACTIVAR VENDEDOR</Text>
        <Text style={styles.progressText}>{step} de 3</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${step * 33.333}%` }]} />
      </View>
    </View>
    <ScrollView
      ref={scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}

      {step === 1 ? (
        <View style={styles.step}>
          <View style={styles.iconBox}>
            <Store size={26} color={colors.buttonText} />
          </View>
          <Text style={styles.title}>¿A qué te dedicas?</Text>
          <View style={styles.pickerFrame}>
            <Picker
              accessibilityLabel="Actividad del vendedor"
              selectedValue={sellerType}
              onValueChange={(value) => setSellerType(String(value))}
              style={styles.picker}
            >
              <Picker.Item label="Agricultor o productor" value="producer" />
              <Picker.Item label="Profesional" value="professional" />
              <Picker.Item label="Autónomo" value="self_employed" />
              <Picker.Item label="Comercio" value="shop" />
              <Picker.Item label="Empresa" value="company" />
              <Picker.Item label="Otra actividad" value="other" />
            </Picker>
          </View>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.step}>
          <BackButton onPress={() => setStep(1)} />
          <Text style={styles.title}>¿Qué nombre verán?</Text>
          <TextInput
            ref={nameInput}
            accessibilityLabel="Nombre público"
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Nombre comercial o profesional"
            placeholderTextColor={colors.mutedText}
            maxLength={120}
            autoFocus
          />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.step}>
          <BackButton onPress={() => setStep(2)} />
          <Text style={styles.title}>¿Desde dónde salen tus pedidos?</Text>
          <LocationFields
            inputRefs={locationInputs}
            locationLabel={locationLabel}
            pickupAddress={pickupAddress}
            shippingPostalCode={shippingPostalCode}
            shippingCity={shippingCity}
            shippingPhone={shippingPhone}
            locating={locating}
            onLocationLabel={(value) => {
              setLocationLabel(value);
              setCoordinates(null);
            }}
            onPickupAddress={(value) => {
              setPickupAddress(value);
              setCoordinates(null);
            }}
            onShippingPostalCode={setShippingPostalCode}
            onShippingCity={setShippingCity}
            onShippingPhone={setShippingPhone}
            onLocate={() => void fillCurrentLocation()}
          />
        </View>
      ) : null}
    </ScrollView>
    <View style={[styles.wizardFooter, { paddingBottom: Math.max(10, insets.bottom) }]}>
      {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
      <BigActionButton label={step === 3 ? "Activar Vendedor" : "Siguiente"} tone="dark" busy={busy} disabled={!draftReady} onPress={() => {
        if (step === 1) setStep(2);
        else if (step === 2) {
          if (!displayName.trim()) { setError("Escribe el nombre que verán los compradores."); nameInput.current?.focus(); }
          else setStep(3);
        } else void activate();
      }} />
      <View style={styles.draftActions}>
        <TouchableOpacity style={styles.cancelEdit} disabled={busy} onPress={() => { leavingWizard.current = true; navigation.canGoBack() ? navigation.goBack() : navigation.replace("MainTabs"); }}><Text style={styles.backText}>Guardar y salir</Text></TouchableOpacity>
        <TouchableOpacity style={styles.cancelEdit} disabled={busy} onPress={() => void discardDraft()}><Text style={styles.backText}>Descartar</Text></TouchableOpacity>
      </View>
    </View>
    </KeyboardAvoidingView>
  );
}

function LocationFields({
  inputRefs,
  locationLabel,
  pickupAddress,
  shippingPostalCode,
  shippingCity,
  shippingPhone,
  locating,
  onLocationLabel,
  onPickupAddress,
  onShippingPostalCode,
  onShippingCity,
  onShippingPhone,
  onLocate,
}: {
  inputRefs: React.RefObject<Record<string, TextInput | null>>;
  locationLabel: string;
  pickupAddress: string;
  shippingPostalCode: string;
  shippingCity: string;
  shippingPhone: string;
  locating: boolean;
  onLocationLabel: (value: string) => void;
  onPickupAddress: (value: string) => void;
  onShippingPostalCode: (value: string) => void;
  onShippingCity: (value: string) => void;
  onShippingPhone: (value: string) => void;
  onLocate: () => void;
}) {
  return (
    <View style={styles.locationFields}>
      <Text style={styles.fieldLabel}>Municipio o zona</Text>
      <TextInput
        ref={(input) => { inputRefs.current.locationLabel = input; }}
        accessibilityLabel="Municipio o zona"
        style={styles.input}
        value={locationLabel}
        onChangeText={onLocationLabel}
        placeholder="Foios, València..."
        placeholderTextColor={colors.mutedText}
        maxLength={120}
      />
      <Text style={styles.fieldLabel}>Punto de recogida</Text>
      <TextInput
        ref={(input) => { inputRefs.current.pickupAddress = input; }}
        accessibilityLabel="Punto de recogida"
        style={styles.input}
        value={pickupAddress}
        onChangeText={onPickupAddress}
        placeholder="Calle, número, localidad y código postal"
        placeholderTextColor={colors.mutedText}
        maxLength={500}
        autoComplete="street-address"
      />
      <View style={styles.addressRow}>
        <View style={styles.addressPostal}>
          <Text style={styles.fieldLabel}>Código postal</Text>
          <TextInput
            ref={(input) => { inputRefs.current.shippingPostalCode = input; }}
            accessibilityLabel="Código postal"
            style={styles.input}
            value={shippingPostalCode}
            onChangeText={onShippingPostalCode}
            placeholder="46134"
            placeholderTextColor={colors.mutedText}
            keyboardType="number-pad"
            autoComplete="postal-code"
            maxLength={12}
          />
        </View>
        <View style={styles.addressCity}>
          <Text style={styles.fieldLabel}>Localidad</Text>
          <TextInput
            ref={(input) => { inputRefs.current.shippingCity = input; }}
            accessibilityLabel="Localidad"
            style={styles.input}
            value={shippingCity}
            onChangeText={onShippingCity}
            placeholder="Foios"
            placeholderTextColor={colors.mutedText}
            maxLength={80}
          />
        </View>
      </View>
      <Text style={styles.fieldLabel}>Teléfono para la mensajería (opcional)</Text>
      <TextInput
        style={styles.input}
        value={shippingPhone}
        onChangeText={onShippingPhone}
        placeholder="+34 600 000 000"
        placeholderTextColor={colors.mutedText}
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={20}
      />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Usar mi ubicación aproximada"
        accessibilityState={{ disabled: locating, busy: locating }}
        style={styles.locationButton}
        onPress={onLocate}
        disabled={locating}
      >
        {locating ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Navigation size={18} color={colors.primary} />
            <Text style={styles.locationButtonText}>Usar mi ubicación</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={styles.privacy}>
        La dirección completa solo se muestra al Conector que acepte una entrega.
      </Text>
    </View>
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
  wizardHeading: { width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 18, paddingTop: 8 },
  wizardFooter: { width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 18, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.cardBorder, backgroundColor: colors.card },
  draftActions: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  content: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 36,
    gap: 14,
  },
  progressRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  progressText: { color: colors.mutedText, fontSize: 12, fontWeight: "800" },
  progressTrack: { height: 4, backgroundColor: colors.cardBorder, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: colors.seller },
  step: { gap: 15, marginTop: 18 },
  iconBox: { width: 52, height: 52, borderRadius: 8, backgroundColor: colors.seller, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 27, lineHeight: 33, fontWeight: "900" },
  subtitle: { color: colors.mutedText, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  pickerFrame: { minHeight: 54, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, overflow: "hidden", justifyContent: "center", backgroundColor: colors.card },
  picker: { color: colors.text, backgroundColor: colors.card },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, paddingHorizontal: 13, color: colors.text, backgroundColor: colors.card, fontSize: 16 },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: "900" },
  locationFields: { gap: 9 },
  addressRow: { flexDirection: "row", gap: 8 },
  addressPostal: { flex: 0.75, minWidth: 0, gap: 9 },
  addressCity: { flex: 1.25, minWidth: 0, gap: 9 },
  locationButton: { minHeight: 46, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  locationButtonText: { color: colors.primary, fontWeight: "900" },
  privacy: { color: colors.mutedText, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  back: { alignSelf: "flex-start", minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6 },
  backText: { color: colors.text, fontWeight: "800" },
  error: { color: colors.danger, fontWeight: "700" },
  notice: { color: colors.success, fontWeight: "700" },
  locationSummary: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  locationCopy: { flex: 1, gap: 2 },
  locationTitle: { color: colors.text, fontWeight: "900" },
  editButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: 6 },
  editText: { color: colors.primary, fontWeight: "900" },
  cancelEdit: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  identityEditor: { gap: 9 },
  loadingRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  testReadyCard: {
    gap: 9,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,121,90,0.42)",
    borderRadius: 16,
    backgroundColor: "rgba(255,240,236,0.88)",
    shadowColor: colors.brandDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  testReadyHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  testPulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.actionInk,
  },
  testReadyTitle: { color: colors.actionInk, fontSize: 17, fontWeight: "900" },
  testReadyText: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "700" },
});
